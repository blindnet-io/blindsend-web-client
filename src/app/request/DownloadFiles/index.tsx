import * as React from 'react'
import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import { Task, delay, fromIO } from 'fp-ts/lib/Task'
import { cmd, http } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import { perform } from 'elm-ts/lib/Task'
import * as keyval from 'idb-keyval'

import { endpoint, uploadChunkSize } from '../../globals'

import * as LeftPanel from '../components/LeftPanel'
import * as PasswordField from '../../components/PasswordField'
import * as FileRow from '../../components/FileDownload'

import { fromCodec, concat, equal, b642arr } from '../../helpers'
import * as FilesReadyTooltip from './tooltip/FilesReady'
import * as VerifyingPasswordTooltip from './tooltip/VerifyingPassword'
import * as MetadataDecryptedTooltip from './tooltip/MetadataDecrypted'
import * as DecryptingFilesTooltip from './tooltip/Downloading'
import * as IndexedDbErrorTooltip from './tooltip/IndexedDbError'
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
// @ts-ignore
const toPolyfillWritable = streamAdapter.createWritableStreamWrapper(WritableStream)
// @ts-ignore
const toPolyfillTransform = streamAdapter.createTransformStreamWrapper(TransformStream)



type CheckPassword = { type: 'CheckPassword' }
type PassNotOk = { type: 'PassNotOk' }
type SeedNotOk = { type: 'SeedNotOk' }
type PassOk = { type: 'PassOk', seed: Uint8Array }
type DecryptedMetadata = { type: 'DecryptedMetadata', files: { name: string, size: number, id: string, iv: Uint8Array }[], fileKeys: CryptoKey[] }
type GotKeyFromIndexedDb = { type: 'GotKeyFromIndexedDb', sk: CryptoKey }
type FailedGettingKeyFromIndexedDb = { type: 'FailedGettingKeyFromIndexedDb' }
type FailedDecryptingData = { type: 'FailedDecryptingData' }

type DownloadAll = { type: 'DownloadAll' }
type GotSignedDownloadLink = { type: 'GotSignedDownloadLink', link: string, fileId: string, nextFile: number }
type GotFileStream = { type: 'GotFileStream', fileId: string, encFileContent: ReadableStream<Uint8Array>, nextFile: number }
type GotAllSignedDownloadLinks = { type: 'GotAllSignedDownloadLinks', links: { fileId: string, link: string }[] }
type FileBeingDecrypted = { type: 'FileBeingDecrypted', fileId: string, fileContent: ReadableStream<Uint8Array>, nextFile: number }
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
  | SeedNotOk
  | PassOk
  | GotKeyFromIndexedDb
  | FailedGettingKeyFromIndexedDb
  | DecryptedMetadata
  | FailedDecryptingData
  | DownloadAll
  | GotSignedDownloadLink
  | GotAllSignedDownloadLinks
  | GotFileStream
  | ArchiveDownloaded
  | FailedGetFile
  | FailedDownloadArchive
  | FileBeingDecrypted
  | FileDownloaded

  | PasswordFieldMsg
  | LeftPanelMsg
  | FileMsg

type BlockingAction = false | 'gettingSeed' | 'checkingPass' | 'decryptingMetadata' | 'downloadingFiles'

type Model = {
  linkId: string,
  senderPublicKey: string,
  wrappedSk: ArrayBuffer,
  encMetadata: Uint8Array,
  seedHash: Uint8Array,
  salt: Uint8Array,
  passwordless: boolean,
  numFiles: number,
  typing: number,
  blockingAction: BlockingAction,
  passwordCorrect: boolean,
  passwordChecked: boolean,
  skNotFound?: boolean,
  decryptionFailed?: boolean,
  seed?: Uint8Array,
  fileKeys?: CryptoKey[],
  files?: {
    name: string,
    size: number,
    id: string,
    iv: Uint8Array,
    downloading: boolean,
    progress: number,
    link?: string
  }[],
  fileStreams: ReadableStream<Uint8Array>[]

  passFieldModel: PasswordField.Model,
  leftPanelModel: LeftPanel.Model,
}

function checkPassword(
  senderPk: string,
  wrappedSk: ArrayBuffer,
  salt: Uint8Array,
  seedHash: Uint8Array,
  pass: string
): cmd.Cmd<Msg> {
  const te = new TextEncoder()

  const [x, y] = senderPk.split('.')
  const pkJwk = { 'crv': 'P-256', 'ext': false, 'key_ops': [], 'kty': 'EC', x, y }

  const check: Task<Msg> = () =>
    crypto.subtle.importKey("jwk", pkJwk, { name: "ECDH", namedCurve: "P-256" }, false, [])
      .then(senderPk => crypto.subtle.importKey("raw", te.encode(pass + 'x'), "PBKDF2", false, ["deriveKey"])
        .then(passKey => crypto.subtle.deriveKey({ "name": "PBKDF2", salt: salt, "iterations": 64206, "hash": "SHA-256" }, passKey, { name: "AES-GCM", length: 256 }, true, ['unwrapKey']))
        .then(aesKey => crypto.subtle.unwrapKey('jwk', wrappedSk, aesKey, { name: "AES-GCM", iv: new Uint8Array(new Array(12).fill(0)) }, { name: "ECDH", namedCurve: "P-256" }, false, ['deriveBits'])
          .then(sk => crypto.subtle.deriveBits({ name: "ECDH", public: senderPk }, sk, 256)
            .then(seed => crypto.subtle.digest('SHA-256', seed)
              .then<Msg>(newSeedHash => {
                if (equal(new Uint8Array(newSeedHash), seedHash))
                  return { type: 'PassOk', seed: new Uint8Array(seed) }
                else return { type: 'PassNotOk' }
              })
            ))))
      .catch<Msg>(_ => ({ type: 'PassNotOk' }))

  return pipe(
    check,
    perform(msg => msg)
  )
}

function checkSeed(
  senderPk: string,
  sk: CryptoKey,
  seedHash: Uint8Array
): cmd.Cmd<Msg> {

  const [x, y] = senderPk.split('.')
  const pkJwk = { 'crv': 'P-256', 'ext': true, 'key_ops': [], 'kty': 'EC', x, y }

  const check: Task<Msg> = () =>
    crypto.subtle.importKey("jwk", pkJwk, { name: "ECDH", namedCurve: "P-256" }, false, [])
      .then(senderPk => crypto.subtle.deriveBits({ name: "ECDH", public: senderPk }, sk, 256)
        .then(seed => crypto.subtle.digest('SHA-256', seed)
          .then<Msg>(newSeedHash => {
            if (equal(new Uint8Array(newSeedHash), seedHash))
              return { type: 'PassOk', seed: new Uint8Array(seed) }
            else return { type: 'SeedNotOk' }
          })
        )).catch<Msg>(_ => ({ type: 'SeedNotOk' }))

  return pipe(
    check,
    perform(msg => msg)
  )
}

function decryptMetadata(seed: Uint8Array, encMetadata: Uint8Array): cmd.Cmd<Msg> {

  const decrypt: Task<Msg> = () =>
    crypto.subtle.importKey("raw", seed, "HKDF", false, ["deriveBits"])
      .then(seedKey => crypto.subtle.deriveBits({ "name": "HKDF", "hash": "SHA-256", salt: new Uint8Array(), "info": new TextEncoder().encode('metadata') }, seedKey, 256)
        .then(metadataKeyBytes => crypto.subtle.importKey('raw', metadataKeyBytes, 'AES-GCM', false, ['decrypt']))
        .then(metadataKey => crypto.subtle.decrypt({ name: "AES-GCM", iv: encMetadata.slice(0, 12) }, metadataKey, encMetadata.slice(12)))
        .then(decryptedMetadata => {
          const metadata: { name: string, size: number, id: string, iv: string }[] =
            JSON.parse(new TextDecoder().decode(decryptedMetadata))
          return metadata.map(f => ({ ...f, iv: b642arr(f.iv) }))
        })
        .then(files =>
          Promise.all(
            files.map(
              (_, i) =>
                crypto.subtle.deriveBits({ "name": "HKDF", "hash": "SHA-256", salt: new Uint8Array(), "info": new TextEncoder().encode(`${i}`) }, seedKey, 256)
                  .then(keyBytes => crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']))))
            .then<Msg>(fileKeys => ({ type: 'DecryptedMetadata', files, fileKeys }))))
      .catch<Msg>(_ => ({ type: 'FailedDecryptingData' }))

  return pipe(
    decrypt,
    perform(msg => msg)
  )
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

function getAllSignedDownloadLinks(fileIds: string[]): cmd.Cmd<Msg> {

  type Resp = { links: { file_id: string, link: string }[] }

  const schema = t.interface({
    links: t.array(t.interface({
      file_id: t.string,
      link: t.string
    }))
  })

  const req = {
    ...http.post(`${endpoint}/get-all-signed-download-links`, { file_ids: fileIds }, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        _ => ({ type: 'FailedDownloadArchive' }),
        resp => ({ type: 'GotAllSignedDownloadLinks', links: resp.links.map(l => ({ ...l, fileId: l.file_id })) })
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
  fileKey: CryptoKey,
  iv: Uint8Array,
  encFileContent: ReadableStream<Uint8Array>,
  nextFile: number
): cmd.Cmd<Msg> {

  function decrypTransformer(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader()
    let i = 0

    const st = new ReadableStream({
      start(ctrl) {
        return pump()

        function pump() {
          // @ts-ignore
          reader.read().then(res => {
            const { done, value } = res
            if (done || value === undefined) { ctrl.close(); return undefined; }

            crypto.subtle.digest('SHA-256', concat(iv, Uint8Array.from([i++])))
              .then(iv => crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv).slice(0, 12) }, fileKey, value))
              .then(plainText => {
                ctrl.enqueue(new Uint8Array(plainText))
                return pump()
              })
          })
        }
      }
    })

    return st
  }

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
          ctrl.enqueue(leftOverBytes.slice(0, leftOverBytes.length))
        }
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
            elem.innerHTML = `${Math.min(percentage, 100)}`
            last = percentage
          }
        }

        ctrl.enqueue(chunk)
      },
      flush: _ => undefined
    })
  }

  // @ts-ignore
  const mappedEncFileContent: ReadableStream<Uint8Array> =
    toPolyfillReadable(encFileContent)

  // @ts-ignore
  const mappedToFixedChunksTransformer: TransformStream<Uint8Array, Uint8Array> =
    toPolyfillTransform(toFixedChunkSizesTransformer(uploadChunkSize))
  // @ts-ignore
  const mappedProgressTransformer: TransformStream<Uint8Array, Uint8Array> =
    toPolyfillTransform(progressTransformer())

  const fileContent =
    decrypTransformer(
      mappedEncFileContent
        .pipeThrough(mappedProgressTransformer)
        .pipeThrough(mappedToFixedChunksTransformer)
    )

  return cmd.of({ type: 'FileBeingDecrypted', fileId, fileContent, nextFile })
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
      size: fileSize,
      writableStrategy: undefined,
      readableStrategy: undefined
    }))

  const saveResult: () => Promise<Msg> = () =>
    fileContent
      .pipeTo(fileStream)
      .then<Msg>(_ => ({ type: 'FileDownloaded', fileId }))
      .catch(_ => ({ type: 'FailedGetFile', fileId }))

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
      .catch(_ => ({ type: 'FailedDownloadArchive' }))

  return pipe(
    result,
    perform(msg => msg)
  )
}

function init(
  linkId: string,
  senderPublicKey: string,
  wrappedSk: ArrayBuffer,
  encMetadata: Uint8Array,
  seedHash: Uint8Array,
  salt: Uint8Array,
  passwordless: boolean,
  numFiles: number
): [Model, cmd.Cmd<Msg>] {

  const [passFieldModel, passFieldCmd] = PasswordField.init
  const [leftPanelModel, leftPanelCmd] = LeftPanel.init(4)

  const model: Model = {
    linkId,
    senderPublicKey,
    wrappedSk,
    encMetadata,
    seedHash,
    salt,
    passwordless,
    numFiles,
    typing: 0,
    blockingAction: false,
    passwordCorrect: false,
    passwordChecked: false,
    fileStreams: [],
    decryptionFailed: false,

    passFieldModel,
    leftPanelModel
  }

  if (passwordless) {

    const getKey: Promise<Msg> =
      keyval
        .get<CryptoKey>(linkId, keyval.createStore('blindsend', 'seed'))
        .then(sk => {
          const msg: Msg = sk
            ? ({ type: 'GotKeyFromIndexedDb', sk })
            : ({ type: 'FailedGettingKeyFromIndexedDb' })
          return msg
        })
        .catch(_ => ({ type: 'FailedGettingKeyFromIndexedDb' }))

    return [
      { ...model, blockingAction: 'gettingSeed' },
      cmd.batch([
        cmd.map<PasswordField.Msg, Msg>(msg => ({ type: 'PasswordFieldMsg', msg }))(passFieldCmd),
        cmd.map<LeftPanel.Msg, Msg>(msg => ({ type: 'LeftPanelMsg', msg }))(leftPanelCmd),
        pipe(
          () => getKey,
          perform(msg => msg)
        )
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
          checkPassword(
            model.senderPublicKey,
            model.wrappedSk,
            model.salt,
            model.seedHash,
            model.passFieldModel.value
          )
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
        { ...model, passwordChecked: true, blockingAction: false },
        cmd.none
      ]
    }
    case 'SeedNotOk': {
      return [
        { ...model, decryptionFailed: true, blockingAction: false },
        cmd.none
      ]
    }
    case 'PassOk': {

      return [
        { ...model, passwordChecked: true, blockingAction: 'decryptingMetadata', passwordCorrect: true, seed: msg.seed },
        decryptMetadata(msg.seed, model.encMetadata)
      ]
    }
    case 'GotKeyFromIndexedDb': {
      return [
        { ...model, blockingAction: 'checkingPass' },
        checkSeed(model.senderPublicKey, msg.sk, model.seedHash)
      ]
    }
    case 'FailedGettingKeyFromIndexedDb': {
      return [
        { ...model, blockingAction: false, skNotFound: true },
        cmd.none
      ]
    }
    case 'DecryptedMetadata': {
      return [
        { ...model, blockingAction: false, fileKeys: msg.fileKeys, files: msg.files.map(f => ({ ...f, downloading: false, progress: 0 })) },
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

      if (files.length === 1) {
        return [
          { ...model, files, blockingAction: 'downloadingFiles' },
          getSignedDownloadLink(files[0].id, -1)
        ]
      }

      return [
        { ...model, files, blockingAction: 'downloadingFiles' },
        getAllSignedDownloadLinks(model.files.map(f => f.id))
      ]
    }
    case 'GotSignedDownloadLink': {
      return [
        { ...model },
        download(msg.fileId, msg.link, msg.nextFile)
      ]
    }
    case 'GotAllSignedDownloadLinks': {
      if (!model.files) throw new Error('Wrong state')

      const files = model.files.map(f => ({ ...f, link: msg.links.find(l => l.fileId === f.id)!.link }))

      return [
        { ...model, files },
        download(files[0].id, files[0].link, 1)
      ]
    }
    case 'GotFileStream': {
      const file = model.files?.find(f => f.id === msg.fileId)
      const i = model.files?.findIndex(f => f.id === msg.fileId)

      if (!file || !model.fileKeys || i == undefined)
        throw new Error('Wrong state')

      return [
        model,
        decrypt(file.id, file.size, model.fileKeys[i], file.iv, msg.encFileContent, msg.nextFile)
      ]
    }
    case 'FileBeingDecrypted': {
      if (!model.files) throw new Error('Wrong state')

      const file = model.files.find(f => f.id === msg.fileId)!

      if (msg.nextFile > -1 && msg.nextFile < model.files.length) {

        return [
          { ...model, fileStreams: [...model.fileStreams, msg.fileContent] },
          download(model.files[msg.nextFile].id, model.files[msg.nextFile].link!, msg.nextFile + 1)
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
          delay(1500)(fromIO(() => undefined)),
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

      return [
        { ...model, leftPanelModel },
        cmd.map<LeftPanel.Msg, Msg>(msg => ({ type: 'LeftPanelMsg', msg }))(leftPanelCmd)
      ]
    }
    case 'FileMsg': {
      if (msg.msg.type === 'Download') {
        if (!model.files) throw new Error('Files missing')

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
    else if (model.skNotFound)
      return IndexedDbErrorTooltip.view()(dispatch)
    else if (model.decryptionFailed)
      return DecryptionFailedTooltip.view()(dispatch)
    else if (!model.passwordCorrect)
      return FilesReadyTooltip.view(model.passwordChecked)(dispatch)
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