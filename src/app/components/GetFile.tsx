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
import fileDownloadIcon from '../../images/file-download.png';

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

type CryptoData = {
  kdfSalt: Uint8Array,
  kdfOps: number,
  kdfMemLimit: number,
  pk2: Uint8Array,
  streamEncHeader: Uint8Array,
}

type InitializedLibsodium = { type: 'InitializedLibsodium' }
type FailGetFileMetadata = { type: 'FailGetFileMetadata' }
type GotFileMetadata = { type: 'GotFileMetadata', fileName: string, fileSize: number }
type FailGetKeys = { type: 'FailGetKeys' }
type GotKeys = { type: 'GotKeys', cryptoData: CryptoData }
type TypePass = { type: 'TypePass', pass: string }
type GetFile = { type: 'GetFile' }
type FailGetFile = { type: 'FailGetFile' }
type GotFile = { type: 'GotFile', encFileContent: ReadableStream<Uint8Array> }
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

type WithLinkData = { linkId: string, pk1: Uint8Array }
type WithPass = { pass: string }
type WithFileMetadata = { fileName: string, fileSize: number }
type WithCryptoData = { cryptoData: CryptoData }

type PageError = { type: 'PageError' }
type Initializing = { type: 'Initializing' } & WithLinkData
type GettingFileMetadata = { type: 'GettingFileMetadata' } & WithLinkData
type GettingKeys = { type: 'GettingKeys' } & WithLinkData & WithFileMetadata
type GettingKeysFailed = { type: 'GettingKeysFailed' } & WithLinkData & WithFileMetadata
type AwaitingPassSubmit = { type: 'AwaitingPassSubmit' } & WithLinkData & WithPass & WithCryptoData & WithFileMetadata
type GettingFile = { type: 'GettingFile', sk: Uint8Array } & WithLinkData & WithPass & WithCryptoData & WithFileMetadata
type DecryptingFile = { type: 'DecryptingFile', encFileContent: ReadableStream<Uint8Array> } & WithLinkData & WithPass & WithCryptoData & WithFileMetadata
type GettingFileFailed = { type: 'GettingFileFailed', error: string } & WithLinkData & WithPass & WithCryptoData & WithFileMetadata
type Finished = { type: 'Finished' } & WithLinkData & WithPass & WithCryptoData & WithFileMetadata

type Model =
  | PageError
  | Initializing
  | AwaitingPassSubmit
  | GettingKeys
  | GettingFileMetadata
  | GettingKeysFailed
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
    ...http.post(`${globals.endpoint}/request/get-file-metadata`, { link_id: linkId }, fromCodec(schema)),
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

  type KeysResponse = {
    link_id: string,
    kdf_salt: string,
    kdf_ops: number,
    kdf_memory_limit: number,
    public_key_2: string,
    stream_enc_header: string
  }

  const schema = t.interface({
    link_id: t.string,
    kdf_salt: t.string,
    kdf_ops: t.number,
    kdf_memory_limit: t.number,
    public_key_2: t.string,
    stream_enc_header: t.string,
  })
  const req = {
    ...http.post(`${globals.endpoint}/request/get-keys`, { link_id: linkId }, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  // TODO: handle failed conversions
  return http.send<KeysResponse, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, KeysResponse, Msg>(
        _ => ({ type: 'FailGetKeys' }),
        resp => ({
          type: 'GotKeys',
          cryptoData: {
            kdfSalt: sodium.from_hex(resp.kdf_salt),
            kdfOps: resp.kdf_ops,
            kdfMemLimit: resp.kdf_memory_limit,
            pk2: sodium.from_hex(resp.public_key_2),
            streamEncHeader: sodium.from_hex(resp.stream_enc_header)
          }
        })
      )
    )
  )(req)
}

function getFile(linkId: string): cmd.Cmd<Msg> {

  const reqTask: Task<E.Either<string, ReadableStream<Uint8Array>>> = () =>
    fetch(`${globals.endpoint}/request/get-file`, {
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

function decryptFile(encFileContent: ReadableStream<Uint8Array>, cryptoData: CryptoData, pk: Uint8Array, sk: Uint8Array, fileName: string, fileSize: number): cmd.Cmd<Msg> {

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
      size: fileSize - Math.floor(fileSize / 4096 + 1 + 1) * 17,
      writableStrategy: undefined,
      readableStrategy: undefined
    }))

  const { sharedRx: masterKey } = sodium.crypto_kx_server_session_keys(pk, sk, cryptoData.pk2)

  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(cryptoData.streamEncHeader, masterKey) // XChaCha20-Poly1305

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

function init(linkId: string, pk1: Uint8Array): [Model, cmd.Cmd<Msg>] {
  const initModel: Model = { type: 'Initializing', linkId, pk1 }

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
      else return [{ ...model, type: 'AwaitingPassSubmit', cryptoData: msg.cryptoData, pass: '' }, cmd.none]
    }
    case 'TypePass': {
      if (model.type != 'AwaitingPassSubmit' && model.type != 'GettingFileFailed') throw new Error("Wrong state")
      else return [{ ...model, pass: msg.pass }, cmd.none]
    }
    case 'GetFile': {
      if (model.type != 'AwaitingPassSubmit' && model.type != 'GettingFileFailed') throw new Error("Wrong state")
      else {
        const keyPairSeed = sodium.crypto_pwhash(
          sodium.crypto_kx_SEEDBYTES,
          model.pass,
          model.cryptoData.kdfSalt,
          model.cryptoData.kdfOps,
          model.cryptoData.kdfMemLimit,
          sodium.crypto_pwhash_ALG_DEFAULT
        ) // Argon2id, 32 bytes

        const { publicKey: pk, privateKey: sk } = sodium.crypto_kx_seed_keypair(keyPairSeed) // X25519, 2x 32 bytes

        switch (sodium.compare(pk, model.pk1)) {
          case 0: return [{ ...model, type: 'GettingFile', sk }, getFile(model.linkId)]
          default: return [{ ...model, type: 'GettingFileFailed', error: 'Wrong password provided' }, cmd.none]
        }
      }
    }
    case 'FailGetFile': {
      if (model.type != 'GettingFile') throw new Error("Wrong state")
      else return [{ ...model, type: 'GettingFileFailed', error: 'Error getting file, try again' }, cmd.none]
    }
    case 'GotFile': {
      if (model.type != 'GettingFile') throw new Error("Wrong state")
      else return [
        { ...model, type: 'DecryptingFile', encFileContent: msg.encFileContent },
        decryptFile(msg.encFileContent, model.cryptoData, model.pk1, model.sk, model.fileName, model.fileSize)
      ]
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

    const renderError = () =>
      <div className="alert alert-danger" role="alert" style={{ marginTop: '20px', textAlign: 'center' }}>
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

    const renderForm = ({ pass, fileName, fileSize }: WithPass & WithFileMetadata, disabled: boolean, gettingFile: boolean, error?: string) =>
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
        {renderForm(model, true, false, undefined)}
      </div>

    function render() {
      switch (model.type) {
        case 'PageError': return renderError()
        case 'Initializing':
        case 'GettingFileMetadata':
        case 'GettingKeys': return renderInitializing()
        case 'GettingKeysFailed': return renderError()
        case 'AwaitingPassSubmit': return renderForm(model, false, false, undefined)
        case 'GettingFile': return renderForm(model, true, true, undefined)
        case 'GettingFileFailed': return renderForm(model, false, false, model.error)
        case 'DecryptingFile': return renderForm(model, true, true, undefined)
        case 'Finished': return renderFinished(model)
      }
    }

    return render()
  }
}

export { Model, Msg, init, update, view }