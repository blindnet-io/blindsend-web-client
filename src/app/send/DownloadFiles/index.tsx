import * as React from 'react'
import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import * as task from 'fp-ts/lib/Task'
import { cmd, http } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import { perform } from 'elm-ts/lib/Task'
import * as sodium from 'libsodium-wrappers'

import { endpoint, encryptionChunkSize } from '../../globals'

import * as LeftPanel from '../components/LeftPanel'
import * as PasswordField from '../../components/PasswordField'
import * as FileRow from './components/File'

import { fromCodec, concat } from '../../helpers'
import * as FilesReadyTooltip from './tooltip/FilesReady'
import * as VerifyingPasswordTooltip from './tooltip/VerifyingPassword'
import * as MetadataDecryptedTooltip from './tooltip/MetadataDecrypted'
import * as DecryptingFilesTooltip from './tooltip/Downloading'
import * as DecryptionFailedTooltip from './tooltip/DecryptionFailed'

import {
  ReadableStream,
  WritableStream,
  TransformStream,
  TransformStreamDefaultController
} from "web-streams-polyfill/ponyfill"
import * as streamAdapter from '@mattiasbuelens/web-streams-adapter'
import * as streamSaver from 'streamsaver'

// @ts-ignore
streamSaver.WritableStream = WritableStream
if (MITM != null) {
  // @ts-ignore
  streamSaver.mitm = MITM
}

// @ts-ignore
const toPolyfillReadable = streamAdapter.createReadableStreamWrapper(ReadableStream)
const toPolyfillWritable = streamAdapter.createWritableStreamWrapper(WritableStream)
const toPolyfillTransform = streamAdapter.createTransformStreamWrapper(TransformStream)



type CheckPassword = { type: 'CheckPassword' }
type PassNotOk = { type: 'PassNotOk' }
type PassOk = { type: 'PassOk', seed: Uint8Array }
type DecryptedMetadata = { type: 'DecryptedMetadata', files: { name: string, size: number, id: string, header: Uint8Array }[] }
type FailedDecryptingData = { type: 'FailedDecryptingData' }

type DownloadAll = { type: 'DownloadAll' }
type GotSignedDownloadLink = { type: 'GotSignedDownloadLink', link: string, fileId: string, nextFile: number }
type GotFileStream = { type: 'GotFileStream', fileId: string, encFileContent: ReadableStream<Uint8Array>, nextFile: number }
type FileDecrypted = { type: 'FileDecrypted', fileId: string, fileContent: ReadableStream<Uint8Array>, nextFile: number }
type FileDownloaded = { type: 'FileDownloaded', fileId: string }
type ArchiveDownloaded = { type: 'ArchiveDownloaded' }
type FailedGetFile = { type: 'FailedGetFile', fileId: string }
type FailedDownloadArchive = { type: 'FailedDownloadArchive' }

type PasswordFieldMsg = { type: 'PasswordFieldMsg', msg: PasswordField.Msg }
type LeftPanelMsg = { type: 'LeftPanelMsg', msg: LeftPanel.Msg }
type FileMsg = { type: 'FileMsg', msg: FileRow.Msg }

type Msg =
  | CheckPassword
  | PassNotOk
  | PassOk
  | DecryptedMetadata
  | FailedDecryptingData
  | DownloadAll
  | GotSignedDownloadLink
  | GotFileStream
  | ArchiveDownloaded
  | FailedGetFile
  | FailedDownloadArchive
  | FileDecrypted
  | FileDownloaded
  | PasswordFieldMsg
  | LeftPanelMsg
  | FileMsg

type BlockingAction = false | 'gettingSeed' | 'checkingPass' | 'decryptingMetadata' | 'downloadingFiles'

type Model = {
  linkId: string,
  seedLink: Uint8Array,
  encMetadata: Uint8Array,
  seedHash: Uint8Array,
  salt: Uint8Array,
  passwordless: boolean,
  numFiles: number,
  typing: number,
  blockingAction: BlockingAction,
  passwordCorrect: boolean,
  decryptionFailed?: boolean,
  seed?: Uint8Array,
  fileKeys?: Uint8Array[],
  files?: {
    name: string,
    size: number,
    id: string,
    header: Uint8Array,
    downloading: boolean,
    progress: number
  }[],
  fileStreams: ReadableStream<Uint8Array>[]

  passFieldModel: PasswordField.Model,
  leftPanelModel: LeftPanel.Model,
}

function checkPassword(
  salt: Uint8Array,
  seedHash: Uint8Array,
  seedLink: Uint8Array,
  pass: string
): cmd.Cmd<Msg> {

  const seedPass = sodium.crypto_pwhash(
    sodium.crypto_kx_SEEDBYTES,
    pass,
    salt,
    1,
    8192,
    sodium.crypto_pwhash_ALG_DEFAULT
  )

  return checkSeed(seedHash, seedLink, seedPass)
}

function checkSeed(
  seedHash: Uint8Array,
  seedLink: Uint8Array,
  seedPass: Uint8Array
): cmd.Cmd<Msg> {

  const seed = sodium.crypto_generichash(sodium.crypto_kdf_KEYBYTES, concat(seedLink, seedPass))

  const newSeedHash = sodium.crypto_hash(seed)

  if (sodium.compare(seedHash, newSeedHash) !== 0) {
    return cmd.of({ type: 'PassNotOk' })
  }

  return cmd.of({ type: 'PassOk', seed })
}

function decryptMetadata(metadataKey: Uint8Array, encMetadata: Uint8Array): cmd.Cmd<Msg> {
  const iv = encMetadata.slice(0, sodium.crypto_secretbox_NONCEBYTES)
  const meta = encMetadata.slice(sodium.crypto_secretbox_NONCEBYTES)

  try {
    const decryptedMetadata = sodium.crypto_secretbox_open_easy(
      meta,
      iv,
      metadataKey
    )

    const metadata: { name: string, size: number, id: string, header: string }[] =
      JSON.parse(new TextDecoder().decode(decryptedMetadata))

    const files = metadata.map(f => ({ ...f, header: sodium.from_base64(f.header) }))

    return cmd.of({ type: 'DecryptedMetadata', files })

  } catch {
    return cmd.of({ type: 'FailedDecryptingData' })
  }
}

function getSignedDownloadLink(fileId: string, nextFile: number): cmd.Cmd<Msg> {

  type Resp = { link: string }

  const schema = t.interface({ link: t.string })

  const req = http.get(`${endpoint}/signed-download-link/${fileId}`, fromCodec(schema))

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        _ => nextFile === -1
          ? { type: 'FailedGetFile', fileId }
          : { type: 'FailedDownloadArchive' },
        resp => ({ type: 'GotSignedDownloadLink', link: resp.link, fileId, nextFile })
      )
    )
  )(req)
}

function download(fileId: string, link: string, nextFile: number): cmd.Cmd<Msg> {

  const getFile: () => Promise<Msg> = () =>
    fetch(`${link}`)
      .then<Msg>(resp => {
        if (resp.status === 200 && resp.body != null) {
          // @ts-ignore
          // const mappedBody: ReadableStream<Uint8Array> =
          //   toPolyfillReadable(resp.body)
          const msg: Msg = ({ type: 'GotFileStream', fileId, encFileContent: resp.body, nextFile })
          return msg
        }
        else if (nextFile === -1)
          return { type: 'FailedGetFile', fileId }
        else
          return { type: 'FailedDownloadArchive' }
      })
      .catch<Msg>(_ => nextFile === -1
        ? { type: 'FailedGetFile', fileId }
        : { type: 'FailedDownloadArchive' }
      )

  return pipe(
    getFile,
    perform(msg => msg)
  )
}

function decrypt(
  fileId: string,
  fileSize: number,
  fileKey: Uint8Array,
  header: Uint8Array,
  encFileContent: ReadableStream<Uint8Array>,
  nextFile: number
): cmd.Cmd<Msg> {

  function toFixedChunkSizesTransformer(desiredChunkSize: number): TransformStream<Uint8Array, Uint8Array> {

    let leftOverBytes = new Uint8Array()
    return new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk: Uint8Array, ctrl: TransformStreamDefaultController<Uint8Array>) => {

        function loopPushBytes(start: number) {
          if (leftOverBytes.length > 0) {
            const chunkPart = chunk.slice(start, start + desiredChunkSize - leftOverBytes.length)
            if (chunkPart.length + leftOverBytes.length < desiredChunkSize) {
              var newChunk = new Uint8Array(chunkPart.length + leftOverBytes.length)
              newChunk.set(leftOverBytes, 0)
              newChunk.set(chunkPart, leftOverBytes.length)
              leftOverBytes = newChunk
            } else {
              var newChunk = new Uint8Array(desiredChunkSize)
              newChunk.set(leftOverBytes, 0)
              newChunk.set(chunkPart, leftOverBytes.length)
              ctrl.enqueue(newChunk)
              leftOverBytes = new Uint8Array()
              loopPushBytes(start + chunkPart.length)
            }

          } else if (start + desiredChunkSize <= chunk.length) {
            ctrl.enqueue(chunk.slice(start, start + desiredChunkSize))
            loopPushBytes(start + desiredChunkSize)

          } else {
            leftOverBytes = chunk.slice(start)
          }
        }

        loopPushBytes(0)
      },
      flush: (ctrl: TransformStreamDefaultController<Uint8Array>) => {
        if (leftOverBytes.length > 0) {
          ctrl.enqueue(leftOverBytes.slice(0, leftOverBytes.length - 17))
          ctrl.enqueue(leftOverBytes.slice(leftOverBytes.length - 17))
        }
      }
    })
  }

  function decryptTransformer(state: sodium.StateAddress): TransformStream<Uint8Array, Uint8Array> {

    return new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk: Uint8Array, ctrl: TransformStreamDefaultController<Uint8Array>) => {
        const plainText = sodium.crypto_secretstream_xchacha20poly1305_pull(state, chunk, null) // XChaCha20-Poly1305
        // const plainText = { message: chunk.map((x, _) => x + 1) }
        ctrl.enqueue(plainText.message)
      }
    })
  }

  function progressTransformer(): TransformStream<Uint8Array, Uint8Array> {
    let loaded = 0
    let parts = 100
    let percentage = 0
    let partSize = fileSize / parts
    let last = -1

    return new TransformStream({
      transform: (chunk: Uint8Array, ctrl: TransformStreamDefaultController<Uint8Array>) => {
        loaded += chunk.length;
        if (loaded > partSize * percentage) {
          const updatePercentage = Math.floor((loaded - partSize * percentage) / partSize)
          percentage = percentage + updatePercentage
          const elem = document.getElementById(`progress-${fileId}`)
          if (elem !== null && percentage > last) {
            // console.log(percentage)
            elem.innerHTML = `${percentage}`
            last = percentage
          }
          // updateProgressBar(percentage)
        }

        ctrl.enqueue(chunk)
      },
      // flush: _ => clearProgressBar()
      flush: _ => undefined
    })
  }

  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, fileKey)

  // @ts-ignore
  const mappedEncFileContent: ReadableStream<Uint8Array> =
    toPolyfillReadable(encFileContent)

  // @ts-ignore
  const mappedToFixedChunksTransformer: TransformStream<Uint8Array, Uint8Array> =
    toPolyfillTransform(toFixedChunkSizesTransformer(encryptionChunkSize))
  // @ts-ignore
  const mappedDecryptTransformer: TransformStream<Uint8Array, Uint8Array> =
    toPolyfillTransform(decryptTransformer(state))
  // @ts-ignore
  const mappedProgressTransformer: TransformStream<Uint8Array, Uint8Array> =
    toPolyfillTransform(progressTransformer())

  const fileContent =
    mappedEncFileContent
      .pipeThrough(mappedToFixedChunksTransformer)
      .pipeThrough(mappedDecryptTransformer)
      .pipeThrough(mappedProgressTransformer)

  return cmd.of({ type: 'FileDecrypted', fileId, fileContent, nextFile })
}

function saveFile(
  fileId: string,
  fileName: string,
  fileSize: number,
  fileContent: ReadableStream<Uint8Array>
): cmd.Cmd<Msg> {

  // @ts-ignore
  const fileStream: WritableStream<Uint8Array> =
    toPolyfillWritable(streamSaver.createWriteStream(fileName, {
      size: fileSize - Math.floor(fileSize / 4096 + 1 + 1) * 17,
      writableStrategy: undefined,
      readableStrategy: undefined
    }))

  const saveResult: () => Promise<Msg> = () =>
    fileContent
      .pipeTo(fileStream)
      .then<Msg>(_ => ({ type: 'FileDownloaded', fileId }))
      .catch(e => {
        return ({ type: 'FailedGetFile', fileId })
      })

  return pipe(
    saveResult,
    perform(msg => msg)
  )
}

function zipFiles(files: { id: string, name: string, size: number, content: ReadableStream<Uint8Array> }[]): cmd.Cmd<Msg> {

  let i = 0
  const filesDistNames = files
    .map(f => files.some(ff => ff.id !== f.id && ff.name === f.name) ? { ...f, name: `${i++}-${f.name}` } : f)

  const fileStream = toPolyfillWritable(streamSaver.createWriteStream('archive.zip'))

  const result: () => Promise<Msg> = () =>
    // @ts-ignore
    toPolyfillReadable(window.createZip(filesDistNames))
      // @ts-ignore
      .pipeTo(fileStream)
      // @ts-ignore
      .then<Msg>(_ => ({ type: 'ArchiveDownloaded' }))
      // @ts-ignore
      .catch(e => {
        return ({ type: 'FailedDownloadArchive' })
      })

  return pipe(
    result,
    perform(msg => msg)
  )
}

function init(
  linkId: string,
  seedLink: Uint8Array,
  encMetadata: Uint8Array,
  seedHash: Uint8Array,
  salt: Uint8Array,
  passwordless: boolean,
  numFiles: number
): [Model, cmd.Cmd<Msg>] {

  const [passFieldModel, passFieldCmd] = PasswordField.init
  const [leftPanelModel, leftPanelCmd] = LeftPanel.init(3)

  const model: Model = {
    linkId,
    seedLink,
    encMetadata,
    seedHash,
    salt,
    passwordless,
    numFiles,
    typing: 0,
    blockingAction: false,
    passwordCorrect: false,
    fileStreams: [],
    decryptionFailed: false,

    passFieldModel,
    leftPanelModel
  }

  if (passwordless) {

    return [
      { ...model, blockingAction: 'checkingPass' },
      cmd.batch([
        cmd.map<PasswordField.Msg, Msg>(msg => ({ type: 'PasswordFieldMsg', msg }))(passFieldCmd),
        cmd.map<LeftPanel.Msg, Msg>(msg => ({ type: 'LeftPanelMsg', msg }))(leftPanelCmd),
        checkPassword(salt, seedHash, seedLink, '')
      ])
    ]
  }

  return [
    model,
    cmd.batch([
      cmd.map<PasswordField.Msg, Msg>(msg => ({ type: 'PasswordFieldMsg', msg }))(passFieldCmd),
      cmd.map<LeftPanel.Msg, Msg>(msg => ({ type: 'LeftPanelMsg', msg }))(leftPanelCmd),
    ])
  ]
}

const update = (msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'CheckPassword': {
      if (model.typing === 1) {
        return [
          { ...model, typing: 0, blockingAction: 'checkingPass' },
          checkPassword(model.salt, model.seedHash, model.seedLink, model.passFieldModel.value)
        ]
      }

      else
        return [
          { ...model, typing: model.typing - 1 },
          cmd.none
        ]
    }
    case 'PassNotOk': {
      return [
        { ...model, blockingAction: false },
        cmd.none
      ]
    }
    case 'PassOk': {

      const metadataKey = sodium.crypto_kdf_derive_from_key(sodium.crypto_secretbox_KEYBYTES, 1, 'metadata', msg.seed)

      return [
        { ...model, blockingAction: 'decryptingMetadata', passwordCorrect: true, seed: msg.seed },
        decryptMetadata(metadataKey, model.encMetadata)
      ]
    }
    case 'DecryptedMetadata': {
      if (!model.seed) throw new Error('Wrong state')

      const { seed } = model

      const fileKeys = msg.files.map((_, i) =>
        sodium.crypto_kdf_derive_from_key(
          sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES,
          i + 2,
          `${i}${(new Array(8 - i)).fill('-').join('')}`,
          seed
        ))

      return [
        { ...model, blockingAction: false, fileKeys, files: msg.files.map(f => ({ ...f, downloading: false, progress: 0 })) },
        cmd.none
      ]
    }
    case 'FailedDecryptingData': {
      return [
        { ...model, decryptionFailed: true, blockingAction: false },
        cmd.none
      ]
    }

    case 'DownloadAll': {
      if (!model.files) throw new Error('Wrong state')
      const files = model.files.map(f => ({ ...f, downloading: true }))

      return [
        { ...model, files, blockingAction: 'downloadingFiles' },
        getSignedDownloadLink(model.files[0].id, 1)
      ]
    }
    case 'GotSignedDownloadLink': {
      return [
        { ...model },
        download(msg.fileId, msg.link, msg.nextFile)
      ]
    }
    case 'GotFileStream': {
      const file = model.files?.find(f => f.id === msg.fileId)
      const i = model.files?.findIndex(f => f.id === msg.fileId)

      if (!file || !model.fileKeys || i == undefined)
        throw new Error('Wrong state')

      return [
        model,
        decrypt(file.id, file.size, model.fileKeys[i], file.header, msg.encFileContent, msg.nextFile)
      ]
    }
    case 'FileDecrypted': {
      if (!model.files) throw new Error('Wrong state')

      const file = model.files?.find(f => f.id === msg.fileId)
      if (!file) throw new Error('Wrong state')

      if (msg.nextFile > -1 && msg.nextFile < model.files.length) {

        return [
          { ...model, fileStreams: [...model.fileStreams, msg.fileContent] },
          getSignedDownloadLink(model.files[msg.nextFile].id, msg.nextFile + 1)
        ]
      }

      if (msg.nextFile > -1) {

        return [
          { ...model, fileStreams: [] },
          zipFiles([...model.fileStreams, msg.fileContent].map((content, i) => {
            if (!model.files || !model.files[i]) throw new Error('Wrong state')
            const { id, name, size } = model.files[i]

            return ({ id, name, size, content })
          }))
        ]
      }

      return [
        { ...model },
        saveFile(file.id, file.name, file.size, msg.fileContent)
      ]
    }
    case 'FileDownloaded': {
      const files = model.files?.map(f => f.id === msg.fileId ? { ...f, downloading: false } : f)

      return [
        { ...model, files, blockingAction: false },
        cmd.none
      ]
    }
    case 'ArchiveDownloaded': {
      const files = model.files?.map(f => ({ ...f, downloading: false, comlete: true }))

      return [
        { ...model, files, blockingAction: false },
        cmd.none
      ]
    }
    case 'FailedGetFile': {
      const files = model.files?.map(f => f.id === msg.fileId ? { ...f, downloading: false } : f)

      return [
        { ...model, files, blockingAction: false, decryptionFailed: true },
        cmd.none
      ]
    }
    case 'FailedDownloadArchive': {
      const files = model.files?.map(f => ({ ...f, downloading: false }))

      return [
        { ...model, files, blockingAction: false, decryptionFailed: true },
        cmd.none
      ]
    }


    case 'PasswordFieldMsg': {
      const [passFieldModel, passFieldCmd] = PasswordField.update(msg.msg, model.passFieldModel)

      if (msg.msg.type == 'ChangePassword' && !model.passwordCorrect) {

        const debounceCheckPassword: cmd.Cmd<Msg> = pipe(
          task.delay(1500)(task.fromIO(() => undefined)),
          perform(
            () => ({ type: 'CheckPassword' })
          )
        )

        return [
          { ...model, typing: model.typing + 1, passFieldModel },
          cmd.batch([
            cmd.map<PasswordField.Msg, Msg>(msg => ({ type: 'PasswordFieldMsg', msg }))(passFieldCmd),
            debounceCheckPassword
          ])
        ]
      } else
        return [
          { ...model, passFieldModel },
          cmd.map<PasswordField.Msg, Msg>(msg => ({ type: 'PasswordFieldMsg', msg }))(passFieldCmd)
        ]
    }
    case 'LeftPanelMsg': {
      const [leftPanelModel, leftPanelCmd] = LeftPanel.update(msg.msg, model.leftPanelModel)

      return [model, cmd.none]
    }
    case 'FileMsg': {
      if (msg.msg.type === 'Download') {
        if (!model.files)
          throw new Error('Files missing')

        const files = model.files.map(f => f.id === msg.msg.id ? { ...f, downloading: true } : f)

        return [
          { ...model, files, blockingAction: 'downloadingFiles' },
          getSignedDownloadLink(msg.msg.id, -1)
        ]
      }

      return [model, cmd.none]
    }
  }
}

const view = (model: Model): Html<Msg> => dispatch => {
  const renderTooltip = () => {
    if (model.blockingAction === 'downloadingFiles')
      return DecryptingFilesTooltip.view()(dispatch)
    if ((model.blockingAction !== false && ['checkingPass', 'decryptingMetadata', 'gettingSeed'].includes(model.blockingAction)) || model.typing > 0)
      return VerifyingPasswordTooltip.view()(dispatch)
    else if (model.decryptionFailed)
      return DecryptionFailedTooltip.view()(dispatch)
    else if (!model.passwordCorrect)
      return FilesReadyTooltip.view()(dispatch)
    else
      return MetadataDecryptedTooltip.view()(dispatch)
  }

  return (
    <div className="site-page__row row">

      {LeftPanel.view(model.leftPanelModel)(msg => dispatch({ type: 'LeftPanelMsg', msg }))}

      <div className="site-main__wrap col-lg-7">
        <div className="site-main">
          <div className="site-main__content">
            <div className="main-password">
              <h2 className="main-password__title section-title">Download</h2>

              <div className="main-password__form">
                {(model.passwordless || model.files != undefined)
                  ? undefined
                  : PasswordField.view(model.passFieldModel, model.passwordCorrect || model.blockingAction === 'checkingPass')(
                    msg => dispatch({ type: 'PasswordFieldMsg', msg }))}

                <div className="main-download__files-wrap">
                  {!model.files
                    ? Array.from({ length: model.numFiles }, (_, i) => FileRow.view(i.toString(), { type: 'Hidden' })(msg => dispatch({ type: 'FileMsg', msg })))
                    : model.files.map(f =>
                      FileRow.view(f.id, { type: 'Visible', ...f })(
                        msg => dispatch({ type: 'FileMsg', msg })
                      )
                    )
                  }
                </div>

                <div className={
                  !model.files || (model.files.some(f => f.downloading)) || model.files.reduce((a, c) => a + c.size, 0) > 500000000
                    ? "btn-wrap main-download__btn-wrap main-download-disabled"
                    : "btn-wrap main-download__btn-wrap"
                }>
                  <button
                    type="submit"
                    className="main-download__submit btn"
                    disabled={model.files?.some(f => f.downloading)}
                    onClick={() => dispatch({ type: 'DownloadAll' })}
                  >
                    <span>DOWNLOAD ALL</span>
                  </button>
                  <span className="btn-animation"></span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {renderTooltip()}

    </div>
  )
}

export { Model, Msg, init, update, view }