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
import { fromCodec } from '../helpers'
import * as globals from '../globals'

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

type KeysResponse = {
  link_id: string,
  public_key_1: string,
  secret_key_encryption_nonce: string,
  encrypted_secret_key: string,
  kdf_salt: string,
  kdf_ops: number,
  kdf_memory_limit: number,
  public_key_2: string,
  stream_enc_header: string
}

type Keys = {
  pk1: string,
  skEncNonce: string,
  skEnc: string,
  kdfSalt: string,
  kdfOps: number,
  kdfMemLimit: number,
  pk2: string,
  streamEncHeader: string,
}

type InitializedLibsodium = { type: 'InitializedLibsodium' }
type FailGetFileMetadata = { type: 'FailGetFileMetadata' }
type GotFileMetadata = { type: 'GotFileMetadata', fileName: string, fileSize: number }
type FailGetKeys = { type: 'FailGetKeys' }
type GotKeys = { type: 'GotKeys', resp: KeysResponse }
type TypePass = { type: 'TypePass', pass: string }
type GetFile = { type: 'GetFile' }
type FailGetFile = { type: 'FailGetFile' }
type GotFile = { type: 'GotFile', encFileContent: ReadableStream<Uint8Array>, derivedKey: Uint8Array }
type FailDecryptFile = { type: 'FailDecryptFile' }
type Finish = { type: 'Finish' }

type Msg =
  | InitializedLibsodium
  | FailGetFileMetadata
  | GotFileMetadata
  | FailGetKeys
  | GotKeys
  | TypePass
  | GetFile
  | FailGetFile
  | GotFile
  | FailDecryptFile
  | Finish

type WithLinkId = { linkId: string }
type WithPass = { pass: string }
type WithFileMetadata = { fileName: string, fileSize: number }
type WithKeys = { keys: Keys }

type PageError = { type: 'PageError' }
type Initializing = { type: 'Initializing' } & WithLinkId
type GettingFileMetadata = { type: 'GettingFileMetadata' } & WithLinkId
type GettingKeys = { type: 'GettingKeys' } & WithLinkId & WithFileMetadata
type GettingKeysFailed = { type: 'GettingKeysFailed' } & WithLinkId & WithFileMetadata
type AwaitingPassSubmit = { type: 'AwaitingPassSubmit' } & WithLinkId & WithPass & WithKeys & WithFileMetadata
type GettingFile = { type: 'GettingFile' } & WithLinkId & WithPass & WithKeys & WithFileMetadata
type GettingFileFailed = { type: 'GettingFileFailed' } & WithLinkId & WithPass & WithKeys & WithFileMetadata
type DecryptingFile = { type: 'DecryptingFile', encFileContent: ReadableStream<Uint8Array> } & WithLinkId & WithPass & WithKeys & WithFileMetadata
type DecryptingFileFailed = { type: 'DecryptingFileFailed', encFileContent: ReadableStream<Uint8Array> } & WithLinkId & WithPass & WithKeys & WithFileMetadata
type Finished = { type: 'Finished' } & WithLinkId & WithPass & WithKeys & WithFileMetadata

type Model =
  | PageError
  | Initializing
  | AwaitingPassSubmit
  | GettingKeys
  | GettingFileMetadata
  | GettingKeysFailed
  | GettingFile
  | GettingFileFailed
  | DecryptingFile
  | DecryptingFileFailed
  | Finished

function loadLibsoium(): cmd.Cmd<Msg> {
  return pipe(
    () => sodium.ready,
    perform(_ => ({ type: 'InitializedLibsodium' }))
  )
}

function getFileMetadata(linkId: String): cmd.Cmd<Msg> {

  type Resp = {
    link_id: string,
    file_name: string,
    file_size: number
  }
  const schema = t.interface({
    link_id: t.string,
    file_name: t.string,
    file_size: t.number
  })
  const req = {
    ...http.post(`${globals.endpoint}/get-file-metadata`, { link_id: linkId }, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        _ => ({ type: 'FailGetFileMetadata' }),
        resp => ({ type: 'GotFileMetadata', fileName: resp.file_name, fileSize: resp.file_size })
      )
    )
  )(req)
}

function getKeys(linkId: String): cmd.Cmd<Msg> {

  const schema = t.interface({
    link_id: t.string,
    public_key_1: t.string,
    secret_key_encryption_nonce: t.string,
    encrypted_secret_key: t.string,
    kdf_salt: t.string,
    kdf_ops: t.number,
    kdf_memory_limit: t.number,
    public_key_2: t.string,
    stream_enc_header: t.string,
  })
  const req = {
    ...http.post(`${globals.endpoint}/get-keys`, { link_id: linkId }, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<KeysResponse, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, KeysResponse, Msg>(
        _ => ({ type: 'FailGetKeys' }),
        resp => ({ type: 'GotKeys', resp })
      )
    )
  )(req)
}

function getFile(linkId: string, keyHash: string, derivedKey: Uint8Array): cmd.Cmd<Msg> {

  const reqTask: Task<E.Either<string, ReadableStream<Uint8Array>>> = () =>
    fetch(`${globals.endpoint}/get-file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: `{ "link_id": "${linkId}", "key_hash": "${keyHash}" }`
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
        encFileContent => ({ type: 'GotFile', encFileContent, derivedKey })
      )(encFileContent)
    )
  )
}

function decryptFile(encFileContent: ReadableStream<Uint8Array>, keys: Keys, derivedKey: Uint8Array, fileName: string, fileSize: number): cmd.Cmd<Msg> {

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

    return new TransformStream({
      transform: (chunk: Uint8Array, ctrl: TransformStreamDefaultController<Uint8Array>) => {
        loaded += chunk.length;
        if (loaded > partSize * percentage) {
          const updatePercentage = Math.floor((loaded - partSize * percentage) / partSize)
          percentage = percentage + updatePercentage
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
      size: fileSize - Math.floor(fileSize / 4096 + 1 + 1) * 17,
      writableStrategy: undefined,
      readableStrategy: undefined
    }))

  const sk1 = sodium.crypto_secretbox_open_easy(sodium.from_hex(keys.skEnc), sodium.from_hex(keys.skEncNonce), derivedKey) // XSalsa20-Poly1305
  const { sharedRx: masterKey } = sodium.crypto_kx_server_session_keys(sodium.from_hex(keys.pk1), sk1, sodium.from_hex(keys.pk2))

  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(sodium.from_hex(keys.streamEncHeader), masterKey) // XChaCha20-Poly1305

  // @ts-ignore
  const mappedEncFileContent: ReadableStream<Uint8Array> =
    toPolyfillReadable(encFileContent)

  // @ts-ignore
  const mappedToFixedChunksTransformer: TransformStream<Uint8Array, Uint8Array> =
    toPolyfillTransform(toFixedChunkSizesTransformer(globals.encryptionChunkSize + 17))
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

function init(linkId: string): [Model, cmd.Cmd<Msg>] {
  const initModel: Model = { type: 'Initializing', linkId }

  return [initModel, loadLibsoium()]
}

function update(msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] {
  console.log(msg)
  switch (msg.type) {
    case 'InitializedLibsodium': {
      if (model.type != 'Initializing') throw new Error("Wrong state")
      else return [{ ...model, type: 'GettingFileMetadata' }, getFileMetadata(model.linkId)]
    }
    case 'FailGetFileMetadata': {
      if (model.type != 'GettingFileMetadata') throw new Error("Wrong state")
      else return [{ type: 'PageError' }, cmd.none]
    }
    case 'GotFileMetadata': {
      if (model.type != 'GettingFileMetadata') throw new Error("Wrong state")
      else return [{ ...model, type: 'GettingKeys', fileName: msg.fileName, fileSize: msg.fileSize }, getKeys(model.linkId)]
    }
    case 'FailGetKeys': {
      if (model.type != 'GettingKeys') throw new Error("Wrong state")
      else return [{ ...model, type: 'GettingKeysFailed' }, cmd.none]
    }
    case 'GotKeys': {
      if (model.type != 'GettingKeys') throw new Error("Wrong state")
      else {
        const keys = {
          pk1: msg.resp.public_key_1,
          skEncNonce: msg.resp.secret_key_encryption_nonce,
          skEnc: msg.resp.encrypted_secret_key,
          kdfSalt: msg.resp.kdf_salt,
          kdfOps: msg.resp.kdf_ops,
          kdfMemLimit: msg.resp.kdf_memory_limit,
          pk2: msg.resp.public_key_2,
          streamEncHeader: msg.resp.stream_enc_header
        }

        return [{ ...model, type: 'AwaitingPassSubmit', keys, pass: '' }, cmd.none]
      }
    }
    case 'TypePass': {
      if (model.type != 'AwaitingPassSubmit' && model.type != 'GettingFileFailed') throw new Error("Wrong state")
      else return [{ ...model, pass: msg.pass }, cmd.none]
    }
    case 'GetFile': {
      if (model.type != 'AwaitingPassSubmit' && model.type != 'GettingFileFailed') throw new Error("Wrong state")
      else {

        const derivedKey = sodium.crypto_pwhash(
          sodium.crypto_secretbox_KEYBYTES,
          model.pass,
          sodium.from_hex(model.keys.kdfSalt),
          model.keys.kdfOps,
          model.keys.kdfMemLimit,
          sodium.crypto_pwhash_ALG_DEFAULT
        )
        const keyHash = sodium.crypto_generichash(32, derivedKey)

        return [{ ...model, type: 'GettingFile' }, getFile(model.linkId, sodium.to_hex(keyHash), derivedKey)]
      }
    }
    case 'FailGetFile': {
      if (model.type != 'GettingFile') throw new Error("Wrong state")
      else return [{ ...model, type: 'GettingFileFailed' }, cmd.none]
    }
    case 'GotFile': {
      if (model.type != 'GettingFile') throw new Error("Wrong state")
      else return [{ ...model, type: 'DecryptingFile', encFileContent: msg.encFileContent }, decryptFile(msg.encFileContent, model.keys, msg.derivedKey, model.fileName, model.fileSize)]
    }
    case 'FailDecryptFile': {
      if (model.type != 'DecryptingFile') throw new Error("Wrong state")
      else return [{ ...model, type: 'GettingFileFailed' }, cmd.none]
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
  const elem = document.getElementById('progress-hack')
  if (elem !== null)
    elem.remove()
}

function view(model: Model): Html<Msg> {

  return dispatch => {

    const renderError = () =>
      <div className="alert alert-danger" role="alert" style={{ marginTop: '20px' }}>
        Error, refresh page
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

    const renderDescription = (fileName: string, fileSize: number) =>
      <div className="row">
        <div className="col-2" />
        <div className="col-8" style={{ textAlign: 'center', marginTop: '40px' }}>
          <div>
            Fill in your password to download and decrypt the file <span style={{ color: 'grey' }}>{fileName} ({getSizeLabel(fileSize)})</span>
          </div>
        </div>
        <div className="col-2" />
      </div>

    const renderPassField = (pass: string, disabled?: true) =>
      <div style={{ textAlign: "center", width: '100%', padding: '10px' }}>
        <input
          type='password'
          disabled={disabled || false}
          value={pass}
          style={{ width: '100%' }}
          onChange={e => dispatch({ type: 'TypePass', pass: e.target.value })}
        />
      </div>

    const renderButton = (disabled?: true) =>
      <div style={{ textAlign: "center", margin: '10px' }}>
        <button
          disabled={disabled || false}
          type="button"
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={_ => dispatch({ type: 'GetFile' })}
        >
          Get file
        </button>
      </div>

    const renderForm = ({ pass, fileName, fileSize }: WithPass & WithFileMetadata, disabled?: true) =>
      <div>
        {renderDescription(fileName, fileSize)}
        <div style={{ marginTop: '20px' }} className="row">
          <div className="col-4" />
          <div className="col-4">
            {renderPassField(pass, disabled)}
            {renderButton(disabled)}
          </div>
          <div className="col-4" />
        </div>
      </div>

    const renderFormWithError = (model: WithPass & WithFileMetadata) =>
      <div>
        <div className="alert alert-danger" role="alert" style={{ marginTop: '20px' }}>
          Downloading file failed, try again.
        </div>
        {renderForm(model)}
      </div>

    const renderGettingFile = (model: WithPass & WithFileMetadata) =>
      <div>
        <div className="alert alert-info" role="alert" style={{ marginTop: '20px' }}>
          Downloading and decrypting file. Please leave the window open until the download is finished.
        </div>
        <div id="progress-hack" className="progress" />
        {renderForm(model, true)}
      </div>

    const renderFinished = () =>
      <div>
        <div className="alert alert-success" role="alert" style={{ marginTop: '20px' }}>
          Enjoy your file!
        </div>
        {/* Because we use dirty functions updateProgressBar and clearProgressBar to update DOM, next div will be removed by react for reasons*/}
        <div />
        <div className="progress">
          <div className="progress-bar progress-bar-striped" role="progressbar" style={{ width: '100%' }} aria-valuenow={100} aria-valuemin={0} aria-valuemax={100}>100%</div>
        </div>
      </div>

    function render() {
      switch (model.type) {
        case 'PageError': return renderError()
        case 'Initializing':
        case 'GettingFileMetadata':
        case 'GettingKeys': return renderInitializing()
        case 'GettingKeysFailed': return renderError()
        case 'AwaitingPassSubmit': return renderForm(model)
        case 'GettingFile': return renderGettingFile(model)
        case 'GettingFileFailed': return renderFormWithError(model)
        case 'DecryptingFile': return renderGettingFile(model)
        case 'DecryptingFileFailed': return renderError()
        case 'Finished': return renderFinished()
      }
    }

    return render()
  }
}

export { Model, Msg, init, update, view }