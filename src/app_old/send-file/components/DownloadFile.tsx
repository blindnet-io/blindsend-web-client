import { Html } from 'elm-ts/lib/React'
import { cmd, http } from 'elm-ts'
import { perform } from 'elm-ts/lib/Task'
import * as React from 'react'
import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import { Task } from 'fp-ts/lib/Task'
import * as sodium from 'libsodium-wrappers'
import {
  ReadableStream,
  WritableStream,
  TransformStream,
  TransformStreamDefaultController
} from "web-streams-polyfill/ponyfill"
import * as streamAdapter from '@mattiasbuelens/web-streams-adapter'
import * as streamSaver from 'streamsaver'
import { fromCodec } from '../../helpers'
import * as globals from '../../globals'
// @ts-ignore
import fileDownloadIcon from '../../../images/file-download.png';

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

type FileMetadata = { fileName: string, fileSize: number }

type DecryptData = {
  size: number,
  header: Uint8Array,
  kdfSalt: Uint8Array,
  kdfOps: number,
  kdfMemLimit: number,
}

type InitializedLibsodium = { type: 'InitializedLibsodium' }
type FailGetFileMetadata = { type: 'FailGetFileMetadata', reason: 'Fail' | 'BadMetadata' | 'LinkIdNotFound' }
type GotFileMetadata = { type: 'GotFileMetadata', fileMetadata: FileMetadata, decryptData: DecryptData }
type TypePass = { type: 'TypePass', pass: string }
type GetFile = { type: 'GetFile' }
type FailGetFile = { type: 'FailGetFile' }
type GotFile = { type: 'GotFile', encFileContent: ReadableStream<Uint8Array> }
type FailDecryptFile = { type: 'FailDecryptFile' }
type Finish = { type: 'Finish' }

type Msg =
  | InitializedLibsodium
  | FailGetFileMetadata
  | TypePass
  | GotFileMetadata
  | GetFile
  | FailGetFile
  | GotFile
  | FailDecryptFile
  | Finish

type WithLinkData = { linkId: string, seed: Uint8Array }
type WithFileMetadata = { fileMetadata: FileMetadata }
type WithPass = { pass: string }
type WithDecryptData = { decryptData: DecryptData }

type ErrorReason = 'Fail' | 'BadSeed' | 'BadMetadata' | 'LinkIdNotFound'

type PageError = { type: 'PageError', reason: ErrorReason }
type Initializing = { type: 'Initializing', linkId: string, base64Seed: string }
type GettingFileMetadata = { type: 'GettingFileMetadata' } & WithLinkData
type AwaitingSubmit = { type: 'AwaitingSubmit' } & WithLinkData & WithFileMetadata & WithPass & WithDecryptData
type GettingFile = { type: 'GettingFile' } & WithLinkData & WithFileMetadata & WithPass & WithDecryptData
type DecryptingFile = { type: 'DecryptingFile', encFileContent: ReadableStream<Uint8Array> } & WithLinkData & WithFileMetadata & WithPass & WithDecryptData
type GettingFileFailed = { type: 'GettingFileFailed', error: string } & WithLinkData & WithFileMetadata & WithPass & WithDecryptData
type Finished = { type: 'Finished' } & WithLinkData & WithFileMetadata & WithPass

type Model =
  | PageError
  | Initializing
  | GettingFileMetadata
  | AwaitingSubmit
  | GettingFile
  | DecryptingFile
  | GettingFileFailed
  | Finished

function loadLibsoium(): cmd.Cmd<Msg> {
  return pipe(
    () => sodium.ready,
    perform(_ => ({ type: 'InitializedLibsodium' }))
  )
}

function getFileMetadata(linkId: String, fileMetadataKey: Uint8Array): cmd.Cmd<Msg> {

  type Resp = {
    link_id: string,
    size: number,
    enc_file_meta: string,
    file_enc_nonce: string,
    meta_enc_nonce: string,
    kdf_salt: string,
    kdf_ops: number,
    kdf_mem_limit: number
  }
  const schema = t.interface({
    link_id: t.string,
    size: t.number,
    enc_file_meta: t.string,
    file_enc_nonce: t.string,
    meta_enc_nonce: t.string,
    kdf_salt: t.string,
    kdf_ops: t.number,
    kdf_mem_limit: t.number
  })
  const req = {
    ...http.post(`${globals.endpoint}/send/get-file-metadata`, { link_id: linkId }, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        err => {
          if (err._tag == 'BadUrl')
            return ({ type: 'FailGetFileMetadata', reason: 'LinkIdNotFound' })
          else
            return ({ type: 'FailGetFileMetadata', reason: 'Fail' })
        },
        resp => {
          try {
            const metadataSchema = t.interface({
              name: t.string,
              size: t.number,
            })

            const decryptedMetadata = sodium.crypto_secretbox_open_easy(
              sodium.from_hex(resp.enc_file_meta),
              sodium.from_hex(resp.meta_enc_nonce),
              fileMetadataKey,
              'text'
            ) // XSalsa20 + Poly1305

            const decodedMetadata = metadataSchema.decode(JSON.parse(decryptedMetadata))

            switch (decodedMetadata._tag) {
              case 'Left': {
                return ({ type: 'FailGetFileMetadata', reason: 'BadMetadata' })
              }
              case 'Right': {
                const fileMetadata: FileMetadata = {
                  fileName: decodedMetadata.right.name,
                  fileSize: decodedMetadata.right.size,
                }
                const decryptData: DecryptData = {
                  size: resp.size,
                  header: sodium.from_hex(resp.file_enc_nonce),
                  kdfSalt: sodium.from_hex(resp.kdf_salt),
                  kdfOps: resp.kdf_ops,
                  kdfMemLimit: resp.kdf_mem_limit
                }
                return ({ type: 'GotFileMetadata', fileMetadata, decryptData })
              }
            }

          } catch {
            return ({ type: 'FailGetFileMetadata', reason: 'Fail' })
          }
        }
      )
    )
  )(req)
}

function getFile(linkId: string): cmd.Cmd<Msg> {

  const reqTask: Task<E.Either<string, ReadableStream<Uint8Array>>> = () =>
    fetch(`${globals.endpoint}/send/get-file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: `{ "link_id": "${linkId}" }`
    })
      .then(resp => {
        if (resp.status === 200 && resp.body != null) {
          // @ts-ignore
          const mappedBody: ReadableStream<Uint8Array> =
            toPolyfillReadable(resp.body)

          return E.right<string, ReadableStream>(mappedBody)
        }
        else return E.left('Error occurred')
      })
      .catch(_ => E.left('Error occurred'))

  return pipe(
    reqTask,
    perform(encFileContent =>
      E.fold<string, ReadableStream<Uint8Array>, Msg>(
        _ => ({ type: 'FailGetFile' }),
        encFileContent => ({ type: 'GotFile', encFileContent })
      )(encFileContent)
    )
  )
}

function decryptFile(encFileContent: ReadableStream<Uint8Array>, key: Uint8Array, header: Uint8Array, fileName: string, size: number): cmd.Cmd<Msg> {

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
          // console.log("engueued leftover", leftOverBytes)
          ctrl.enqueue(leftOverBytes.slice(0, leftOverBytes.length - 17))
          ctrl.enqueue(leftOverBytes.slice(leftOverBytes.length - 17))
        }
      }
    })
  }

  function decryptTransformer(state: sodium.StateAddress): TransformStream<Uint8Array, Uint8Array> {

    return new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk: Uint8Array, ctrl: TransformStreamDefaultController<Uint8Array>) => {
        // TODO: if the cyphertext was modified/wrong key is used, this will throw an exception
        // research js Stream api error handling mechanism
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
    let partSize = size / parts

    return new TransformStream({
      transform: (chunk: Uint8Array, ctrl: TransformStreamDefaultController<Uint8Array>) => {
        loaded += chunk.length;
        if (loaded > partSize * percentage) {
          const updatePercentage = Math.floor((loaded - partSize * percentage) / partSize)
          percentage = percentage + updatePercentage
          // console.log(percentage)
          updateProgressBar(percentage)
        }

        ctrl.enqueue(chunk)
      },
      flush: _ => clearProgressBar()
    })
  }

  // @ts-ignore
  const fileStream: WritableStream<Uint8Array> =
    toPolyfillWritable(streamSaver.createWriteStream(fileName, {
      size: size - Math.floor(size / 4096 + 1 + 1) * 17,
      writableStrategy: undefined,
      readableStrategy: undefined
    }))

  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, key) // XChaCha20-Poly1305

  // @ts-ignore
  const mappedEncFileContent: ReadableStream<Uint8Array> =
    toPolyfillReadable(encFileContent)

  // @ts-ignore
  const mappedToFixedChunksTransformer: TransformStream<Uint8Array, Uint8Array> =
    toPolyfillTransform(toFixedChunkSizesTransformer(globals.encryptionChunkSize))
  // @ts-ignore
  const mappedDecryptTransformer: TransformStream<Uint8Array, Uint8Array> =
    toPolyfillTransform(decryptTransformer(state))
  // @ts-ignore
  const mappedProgressTransformer: TransformStream<Uint8Array, Uint8Array> =
    toPolyfillTransform(progressTransformer())

  const decryptFileTask: Task<Msg> = () =>
    mappedEncFileContent
      .pipeThrough(mappedToFixedChunksTransformer)
      .pipeThrough(mappedDecryptTransformer)
      .pipeThrough(mappedProgressTransformer)
      .pipeTo(fileStream)
      .then<Msg>(_ => ({ type: 'Finish' }))
      .catch(e => {
        console.log(e)
        return ({ type: 'FailDecryptFile' })
      })

  // TODO: see what to do with this
  // window.onunload = () => {
  //   fileStream.getWriter().abort()
  //   fileStream.abort()
  // }

  return pipe(
    decryptFileTask,
    perform(msg => msg)
  )
}

function init(linkId: string, base64Seed: string): [Model, cmd.Cmd<Msg>] {
  const initModel: Model = { type: 'Initializing', linkId, base64Seed }

  return [initModel, loadLibsoium()]
}

function update(msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] {
  console.log(msg)
  switch (msg.type) {
    case 'InitializedLibsodium': {
      if (model.type != 'Initializing') throw new Error("Wrong state")
      else {
        try {
          const seed = sodium.from_base64(model.base64Seed)
          const fileMetadataKey = sodium.crypto_kdf_derive_from_key(sodium.crypto_secretbox_KEYBYTES, 1, "filemeta", seed) // BLAKE2B

          return [
            { ...model, type: 'GettingFileMetadata', seed },
            getFileMetadata(model.linkId, fileMetadataKey)
          ]
        } catch {
          return [{ type: 'PageError', reason: 'BadSeed' }, cmd.none]
        }
      }
    }
    case 'FailGetFileMetadata': {
      if (model.type != 'GettingFileMetadata') throw new Error("Wrong state")
      else return [{ type: 'PageError', reason: msg.reason }, cmd.none]
    }
    case 'GotFileMetadata': {
      if (model.type != 'GettingFileMetadata') throw new Error("Wrong state")
      else return [{ ...model, type: 'AwaitingSubmit', fileMetadata: msg.fileMetadata, decryptData: msg.decryptData, pass: '' }, cmd.none]
    }
    case 'TypePass': {
      if (model.type != 'AwaitingSubmit' && model.type != 'GettingFileFailed') throw new Error("Wrong state")
      else return [{ ...model, pass: msg.pass }, cmd.none]
    }
    case 'GetFile': {
      if (model.type != 'AwaitingSubmit' && model.type != 'GettingFileFailed') throw new Error("Wrong state")
      else return [{ ...model, type: 'GettingFile' }, getFile(model.linkId)]
    }
    case 'FailGetFile': {
      if (model.type != 'GettingFile') throw new Error("Wrong state")
      else return [{ ...model, type: 'GettingFileFailed', error: 'Error getting file, try again' }, cmd.none]
    }
    case 'GotFile': {
      if (model.type != 'GettingFile') throw new Error("Wrong state")
      else {
        const seed2 = sodium.crypto_pwhash(
          sodium.crypto_kx_SEEDBYTES,
          model.pass,
          model.decryptData.kdfSalt,
          model.decryptData.kdfOps,
          model.decryptData.kdfMemLimit,
          sodium.crypto_pwhash_ALG_DEFAULT
        ) // Argon2id, 32 bytes

        const fileKeySeed = sodium.crypto_generichash(sodium.crypto_kdf_KEYBYTES, new Uint8Array([...model.seed, ...seed2])) // BLAKE2B(seed1, seed2) 32 bytes
        const fileKey = sodium.crypto_kdf_derive_from_key(sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES, 1, "file----", fileKeySeed) // BLAKE2B

        return [
          { ...model, type: 'DecryptingFile', encFileContent: msg.encFileContent },
          decryptFile(msg.encFileContent, fileKey, model.decryptData.header, model.fileMetadata.fileName, model.decryptData.size)
        ]
      }
    }
    case 'FailDecryptFile': {
      if (model.type != 'DecryptingFile') throw new Error("Wrong state")
      else return [{ ...model, type: 'GettingFileFailed', error: 'Error decrypting file, try again' }, cmd.none]
    }
    case 'Finish': {
      if (model.type != 'DecryptingFile') throw new Error("Wrong state")
      return [{ ...model, type: 'Finished' }, cmd.none]
    }
  }
}

// TODO: very dirty, refactor
function updateProgressBar(i: number) {
  const elem = document.getElementById('progress-hack')
  if (elem !== null)
    elem.innerHTML =
      `<div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: ${i}%;" aria-valuenow="${i}" aria-valuemin="0" aria-valuemax="100">${i}%</div>`
}
function clearProgressBar() {
  // const elem = document.getElementById('progress-hack')
  // if (elem !== null)
  //   elem.remove()
}

function view(model: Model): Html<Msg> {

  return dispatch => {

    const renderErrorMsg = (reason: ErrorReason) => {
      switch (reason) {
        case 'Fail': return 'Error, refresh page'
        case 'BadSeed': return 'Bad seed provided in the URI fragment'
        case 'LinkIdNotFound': return 'Non-existent link id'
        case 'BadMetadata': return 'Wrong file metadata'
      }
    }

    const renderError = (reason: ErrorReason) =>
      <div className="alert alert-danger" role="alert" style={{ marginTop: '20px', textAlign: 'center' }}>
        {renderErrorMsg(reason)}
      </div>

    const renderInitializing = () =>
      <div style={{ textAlign: 'center', margin: '80px' }}>
        <div className="spinner-grow" role="status" />
      </div>

    const getSizeLabel = (size: number) => {

      const to2Decimals = (n: number) =>
        Math.trunc(n * 100) / 100

      if (size < 1024) return `${size} B`
      else if (size < 1048576) return `${to2Decimals(size / 1024)} KB`
      else if (size < 1073741824) return `${to2Decimals(size / 1048576)} MB`
      else return `${to2Decimals(size / 1073741824)} GB`
    }

    const renderPassField = (pass: string, disabled: boolean) =>
      <input
        type="password"
        disabled={disabled}
        value={pass}
        onChange={e => dispatch({ type: 'TypePass', pass: e.target.value })}
        style={{ "border": "1px solid #ced4da" }}
        className="form-control text pass-text"
        placeholder="Enter password"
      />

    const renderButton = (disabled: boolean) =>
      <input
        disabled={disabled}
        type="submit"
        className="form-control btn bs-btn"
        value="download File"
      />

    const renderForm = (
      { fileName, fileSize }: FileMetadata,
      pass: string,
      disabled: boolean,
      gettingFile: boolean,
      error?: string
    ) =>
      <div>
        {error &&
          <div className="alert alert-danger" role="alert" style={{ marginTop: '20px', textAlign: 'center' }}>
            {error}
          </div>
        }
        {gettingFile &&
          <div>
            <div className="alert alert-info" role="alert" style={{ marginTop: '20px', textAlign: 'center' }}>
              Downloading and decrypting file. Please leave the window open until the download is finished.
            </div>
            <div id="progress-hack" className="progress" />
          </div>
        }
        <div className="download-wrap">

          <div className="row m-0">
            <div className="col-lg-10 offset-lg-1 text-center">
              <div className="file-icon">
                <img src={fileDownloadIcon} className="img-fluid" />
                <div style={{ color: 'grey', marginTop: '20px' }}>{fileName} ({getSizeLabel(fileSize)})</div>
              </div>

              <div className="bs-form text-center">
                <form onSubmit={e => { e.preventDefault(); dispatch({ type: 'GetFile' }) }}>
                  <div className="form-group">
                    {renderPassField(pass, disabled)}
                  </div>
                  <div className="form-group">
                    {renderButton(disabled)}
                  </div>
                </form>
              </div>

            </div>
          </div>
        </div>
      </div>

    const renderFinished = (model: Finished) =>
      <div>
        <div className="alert alert-success" role="alert" style={{ marginTop: '20px', textAlign: 'center' }}>
          Enjoy your file!
        </div>
        <div className="progress">
          <div className="progress-bar progress-bar-striped" role="progressbar" style={{ width: '100%' }} aria-valuenow={100} aria-valuemin={0} aria-valuemax={100}>100%</div>
        </div>
        {renderForm(model.fileMetadata, model.pass, true, false, undefined)}
      </div>

    function render() {
      switch (model.type) {
        case 'PageError': return renderError(model.reason)
        case 'Initializing':
        case 'GettingFileMetadata': return renderInitializing()
        case 'AwaitingSubmit': return renderForm(model.fileMetadata, model.pass, false, false, undefined)
        case 'GettingFile': return renderForm(model.fileMetadata, model.pass, true, true, undefined)
        case 'GettingFileFailed': return renderForm(model.fileMetadata, model.pass, false, false, model.error)
        case 'DecryptingFile': return renderForm(model.fileMetadata, model.pass, true, true, undefined)
        case 'Finished': return renderFinished(model)
      }
    }

    return render()
  }
}

export { Model, Msg, init, update, view }