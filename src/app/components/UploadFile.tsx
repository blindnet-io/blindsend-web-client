import { Html } from 'elm-ts/lib/React'
import { cmd, http } from 'elm-ts'
import { perform } from 'elm-ts/lib/Task'
import * as task from 'fp-ts/lib/Task'
import * as React from 'react'
import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import * as sodium from 'libsodium-wrappers'
import {
  ReadableStream,
  WritableStream,
  TransformStream,
  TransformStreamDefaultController
} from "web-streams-polyfill/ponyfill"

import * as streamAdapter from '@mattiasbuelens/web-streams-adapter'
import { fromCodec } from '../helpers'
import * as globals from '../globals'
// @ts-ignore
import fileUploadIcon from '../../images/file-upload.png';

// @ts-ignore
const toPolyfillReadable = streamAdapter.createReadableStreamWrapper(ReadableStream)
const toPolyfillTransform = streamAdapter.createTransformStreamWrapper(TransformStream)

type UploadParams = {
  maxFileSize: number
}

type CryptoData = {
  publicKey: Uint8Array,
  masterKey: Uint8Array
}

type InitializedLibsodium = { type: 'InitializedLibsodium' }
type GotUploadParams = { type: 'GotUploadParams', uploadParams: UploadParams }
type FailFetchingUploadParams = { type: 'FailFetchingUploadParams' }
type FailSetFile = { type: 'FailSetFile', error: string }
type FailUploadingFile = { type: 'FailUploadingFile', error: string }
type SetFile = { type: 'SetFile', file: File }
type GetRequesterKeys = { type: 'GetRequesterKeys' }
type GotRequesterKeys = { type: 'GotRequesterKeys', uploadId: string }
type GeneratedKeys = { type: 'GeneratedKeys', cryptoData: CryptoData }
type UploadedFile = { type: 'UploadedFile', streamEncHeader: Uint8Array }
type SavedKeys = { type: 'SavedKeys' }

type DragEnter = { type: 'DragEnter' }
type DragLeave = { type: 'DragLeave' }

type Msg =
  | InitializedLibsodium
  | GotUploadParams
  | FailFetchingUploadParams
  | FailSetFile
  | FailUploadingFile
  | SetFile
  | GetRequesterKeys
  | GotRequesterKeys
  | GeneratedKeys
  | UploadedFile
  | SavedKeys

  | DragEnter
  | DragLeave

type WithLinkData = { linkId: string, pk1: Uint8Array }
type WithUploadParams = { uploadParams: UploadParams }
type WithFilePicker = { filePicker: { hovered: boolean } }
type WithFile = { fileName: string, fileSize: number, file: File }
type WithUploadId = { uploadId: string }
type WithKeys = { keys: CryptoData }

type PageError = { type: 'PageError' }
type Initializing = { type: 'Initializing' } & WithLinkData
type AwaitingFileUpload = { type: 'AwaitingFileUpload' } & WithLinkData & WithUploadParams & WithFilePicker
type SettingFileFailed = { type: 'SettingFileFailed', error: string } & WithLinkData & WithUploadParams & WithFilePicker
type UploadingFileFailed = { type: 'UploadingFileFailed', error: string } & WithLinkData & WithUploadParams & WithFile & WithFilePicker
type FileSet = { type: 'FileSet' } & WithLinkData & WithUploadParams & WithFile & WithFilePicker
type GettingRequesterKeys = { type: 'GettingRequesterKeys' } & WithLinkData & WithUploadParams & WithFile
type GeneratingKeys = { type: 'GeneratingKeys' } & WithLinkData & WithUploadParams & WithFile & WithUploadId
type EncryptingAndUploadingFile = { type: 'EncryptingAndUploadingFile' } & WithLinkData & WithUploadParams & WithKeys & WithFile
type SavingKeys = { type: 'SavingKeys' } & WithLinkData & WithUploadParams & WithKeys & WithFile
type Finished = { type: 'Finished' } & WithFile & WithUploadParams

type Model =
  | PageError
  | Initializing
  | AwaitingFileUpload
  | SettingFileFailed
  | UploadingFileFailed
  | FileSet
  | GettingRequesterKeys
  | GeneratingKeys
  | EncryptingAndUploadingFile
  | SavingKeys
  | Finished

function loadLibsoium(): cmd.Cmd<Msg> {
  return pipe(
    () => sodium.ready,
    perform(_ => ({ type: 'InitializedLibsodium' }))
  )
}

function getUploadParams(): cmd.Cmd<Msg> {
  type Resp = { max_file_size: number }
  const schema = t.interface({
    max_file_size: t.number,
  })
  const req = {
    ...http.get(`${globals.endpoint}/request/get-upload-params`, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        _ => ({ type: 'FailFetchingUploadParams', error: 'Uploading failed. Try again.' }),
        res => ({ type: 'GotUploadParams', uploadParams: { maxFileSize: res.max_file_size } })
      )
    )
  )(req)
}

function getUploadId(linkId: String): cmd.Cmd<Msg> {

  type Resp = { upload_id: string }
  const schema = t.interface({
    upload_id: t.string
  })
  const req = {
    ...http.post(`${globals.endpoint}/request/prepare-upload`, { link_id: linkId }, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        _ => ({ type: 'FailUploadingFile', error: 'Uploading failed. Try again.' }),
        res => ({ type: 'GotRequesterKeys', uploadId: res.upload_id })
      )
    )
  )(req)
}

function generateKeys(pk1: Uint8Array): cmd.Cmd<Msg> {

  function generate(): CryptoData {
    const { publicKey, privateKey } = sodium.crypto_kx_keypair() // X25519, 2x 32 bytes
    const { sharedTx: masterKey } = sodium.crypto_kx_client_session_keys(publicKey, privateKey, pk1)

    return { publicKey, masterKey }
  }

  return pipe(
    task.of(generate()),
    perform(
      cryptoData => ({ type: 'GeneratedKeys', cryptoData })
    )
  )
}

function encryptAndUploadFile(file: File, masterKey: Uint8Array, linkId: string, uploadId: string): cmd.Cmd<Msg> {

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
        if (leftOverBytes.length > 0) ctrl.enqueue(leftOverBytes)
      }
    })
  }


  function encryptTransformer(state: sodium.StateAddress): TransformStream<Uint8Array, Uint8Array> {
    return new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk: Uint8Array, ctrl: TransformStreamDefaultController<Uint8Array>) => {
        const cypherText = sodium.crypto_secretstream_xchacha20poly1305_push(state, chunk, null, 0) // XChaCha20-Poly1305
        ctrl.enqueue(cypherText)
      },
      flush: (ctrl: TransformStreamDefaultController<Uint8Array>) => {
        const end = sodium.crypto_secretstream_xchacha20poly1305_push(state, new Uint8Array(), null, sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL) // XChaCha20-Poly1305
        ctrl.enqueue(end)
      }
    })
  }

  // @ts-ignore
  const mappedFileStream: ReadableStream<Uint8Array> =
    toPolyfillReadable(file.stream())

  const { state, header: streamEncHeader } = sodium.crypto_secretstream_xchacha20poly1305_init_push(masterKey) // XChaCha20-Poly1305

  // TODO: body should be stream but it is not implemented yet.The whole file is loaded in RAM in arr variable.
  let arr = new Uint8Array(Math.floor(file.size / globals.encryptionChunkSize + 1 + 1) * 17 + file.size)
  let i = 0

  // @ts-ignore
  const mappedToFixedChunksTransformer: TransformStream<Uint8Array, Uint8Array> =
    toPolyfillTransform(toFixedChunkSizesTransformer(globals.encryptionChunkSize))
  // @ts-ignore
  const mappedDecryptTransformer: TransformStream<Uint8Array, Uint8Array> =
    toPolyfillTransform(encryptTransformer(state))

  const handleFileTask: task.Task<Msg> = () =>
    mappedFileStream
      .pipeThrough(mappedToFixedChunksTransformer)
      .pipeThrough(mappedDecryptTransformer)
      .pipeTo(new WritableStream({
        write(chunk) {
          arr.set(chunk, i)
          i = i + chunk.length
        }
      }))
      .then(
        () => fetch(`${globals.endpoint}/request/send-file/${linkId}/${uploadId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream'
          },
          body: arr.buffer
        })
      )
      .then(resp => {
        if (resp.status === 200)
          return E.right('')
        else if (resp.status === 400)
          return resp.text().then(msg => E.left(msg))
        else
          return E.left('Uploading failed. Try again.')
      })
      .then(result =>
        pipe(
          result,
          E.fold<string, string, Msg>(
            error => ({ type: 'FailUploadingFile', error }),
            _ => ({ type: 'UploadedFile', streamEncHeader })
          )
        )
      )
      .catch(e => {
        console.log(e)
        return ({ type: 'FailUploadingFile', error: 'Uploading failed. Try again.' })
      })

  return pipe(
    handleFileTask,
    perform(msg => msg)
  )
}

function saveKeys(linkId: string, fileName: string, fileSize: number, streamEncHeader: Uint8Array, cryptoData: CryptoData) {

  const body = {
    link_id: linkId,
    pk2: sodium.to_hex(cryptoData.publicKey),
    header: sodium.to_hex(streamEncHeader),
    file_name: fileName,
    file_size: fileSize
  }

  const schema = t.any
  const req = {
    ...http.post(`${globals.endpoint}/request/finish-upload`, body, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<any, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, any, Msg>(
        _ => ({ type: 'FailUploadingFile', error: 'Uploading failed. Try again.' }),
        _ => ({ type: 'SavedKeys' })
      )
    )
  )(req)
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
      else return [{ ...model }, getUploadParams()]
    }
    case 'GotUploadParams': {
      if (model.type != 'Initializing') throw new Error("Wrong state")
      else return [{ ...model, type: 'AwaitingFileUpload', uploadParams: msg.uploadParams, filePicker: { hovered: false } }, cmd.none]
    }
    case 'FailFetchingUploadParams': {
      if (model.type != 'Initializing') throw new Error("Wrong state")
      else return [{ type: 'PageError' }, cmd.none]
    }
    case 'FailSetFile': {
      if (model.type != 'AwaitingFileUpload' && model.type != 'FileSet' && model.type != 'UploadingFileFailed' && model.type != 'SettingFileFailed') throw new Error("Wrong state")
      else return [{ ...model, filePicker: { hovered: false }, type: 'SettingFileFailed', error: msg.error }, cmd.none]
    }
    case 'FailUploadingFile': {
      if (model.type != 'FileSet' && model.type != 'GettingRequesterKeys' && model.type != 'EncryptingAndUploadingFile' && model.type != 'SavingKeys') throw new Error("Wrong state")
      else return [{ ...model, filePicker: { hovered: false }, type: 'UploadingFileFailed', error: msg.error }, cmd.none]
    }
    case 'SetFile': {
      if (model.type != 'AwaitingFileUpload' && model.type != 'FileSet' && model.type != 'UploadingFileFailed' && model.type != 'SettingFileFailed') throw new Error("Wrong state")
      else return [
        { ...model, type: 'FileSet', fileName: msg.file.name, fileSize: msg.file.size, file: msg.file, filePicker: { hovered: false } },
        cmd.none
      ]
    }
    case 'GetRequesterKeys': {
      if (model.type != 'FileSet' && model.type != 'UploadingFileFailed') throw new Error("Wrong state")
      else return [{ ...model, type: 'GettingRequesterKeys' }, getUploadId(model.linkId)]
    }
    case 'GotRequesterKeys': {
      if (model.type != 'GettingRequesterKeys') throw new Error("Wrong state")
      return [{ ...model, type: 'GeneratingKeys', uploadId: msg.uploadId }, generateKeys(model.pk1)]
    }
    case 'GeneratedKeys': {
      if (model.type != 'GeneratingKeys') throw new Error("Wrong state")
      else return [{ ...model, type: 'EncryptingAndUploadingFile', keys: msg.cryptoData }, encryptAndUploadFile(model.file, msg.cryptoData.masterKey, model.linkId, model.uploadId)]
    }
    case 'UploadedFile': {
      if (model.type != 'EncryptingAndUploadingFile') throw new Error("Wrong state")
      else return [{ ...model, type: 'SavingKeys' }, saveKeys(model.linkId, model.fileName, model.fileSize, msg.streamEncHeader, model.keys)]
    }
    case 'SavedKeys': {
      if (model.type != 'SavingKeys') throw new Error("Wrong state")
      else return [{ ...model, type: 'Finished' }, cmd.none]
    }

    case 'DragEnter': {
      if (model.type != 'AwaitingFileUpload' && model.type != 'UploadingFileFailed' && model.type != 'FileSet' && model.type != 'SettingFileFailed') throw new Error("Wrong state")
      else return [{ ...model, filePicker: { ...model.filePicker, hovered: true } }, cmd.none]
    }
    case 'DragLeave': {
      if (model.type != 'AwaitingFileUpload' && model.type != 'UploadingFileFailed' && model.type != 'FileSet' && model.type != 'SettingFileFailed') throw new Error("Wrong state")
      else return [{ ...model, filePicker: { ...model.filePicker, hovered: false } }, cmd.none]
    }
  }
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

    function handleFiles(files: FileList | null, maxFileSize: number) {
      if (files != null && files.length > 0) {
        const firstFile = files[0]
        if (firstFile.size > maxFileSize)
          dispatch({ type: 'FailSetFile', error: `File size larger than ${getSizeLabel(maxFileSize)}.` })
        else
          dispatch({ type: 'SetFile', file: firstFile })
      }
    }

    const getSizeLabel = (size: number) => {

      const to2Decimals = (n: number) =>
        Math.trunc(n * 100) / 100

      if (size < 1024) return `${size} B`
      else if (size < 1048576) return `${to2Decimals(size / 1024)} KB`
      else if (size < 1073741824) return `${to2Decimals(size / 1048576)} MB`
      else return `${to2Decimals(size / 1073741824)} GB`
    }

    const renderAwaitingFileUpload = (uploadParams: UploadParams) => {

      const filePickEnabled =
        model.type == 'AwaitingFileUpload' || model.type == 'UploadingFileFailed' ||
        model.type == 'FileSet' || model.type == 'SettingFileFailed'
      return (
        <div
          className="upload-wrap"
          style={('filePicker' in model) && model.filePicker.hovered ? {
            border: "3px dashed gray",
            background: "linear-gradient(#ddd, #eee) padding-box, linear-gradient(to right, #34a5d7, #9175b4) border-box"
          } : {}}
          onDragEnter={e => { e.preventDefault(); if (filePickEnabled) dispatch({ type: 'DragEnter' }) }}
          onDragOver={e => { e.preventDefault(); if (filePickEnabled) dispatch({ type: 'DragEnter' }) }}
          onDragLeave={e => { e.preventDefault(); if (filePickEnabled) dispatch({ type: 'DragLeave' }) }}
          onDrop={e => { e.preventDefault(); if (filePickEnabled) handleFiles(e.dataTransfer.files, uploadParams.maxFileSize) }}
        >
          <div className="row m-0">

            <div className="col-lg-10 offset-lg-1 text-center">
              <div className="file-icon">
                <img src={fileUploadIcon} className="img-fluid" />
              </div>
              <div className="bs-form text-center">

                <form>
                  <div className={filePickEnabled ? "form-group uploadfield" : "form-group uploadfield-disabled"}>
                    <label
                      className="uploadfield-label"
                      onClick={e => {
                        e.preventDefault()
                        if (filePickEnabled) document.getElementById('file-pick')?.click()
                      }}> Select File </label>
                  </div>
                  <div className="">
                    {(
                      'file' in model
                        ? <div>File <span style={{ color: 'grey' }}>{model.file.name} ({getSizeLabel(model.file.size)})</span> set.</div>
                        : <div>Or drag & drop file here (max {getSizeLabel(uploadParams.maxFileSize)}).</div>
                    )}
                  </div>
                </form>

              </div>

            </div>
            <input hidden type='file' id='file-pick' onChange={e => handleFiles(e.target.files, uploadParams.maxFileSize)} />
          </div>
        </div>
      )
    }

    function renderFileSet(uploadParams: UploadParams) {
      return (
        <div>
          {renderAwaitingFileUpload(uploadParams)}
          <div className="upload-btn-wrap">

            <div className="bs-form">
              <input
                type="button"
                className="form-control btn bs-btn"
                disabled={model.type != 'FileSet' && model.type != 'UploadingFileFailed'}
                value="Upload file"
                onClick={_ => dispatch({ type: 'GetRequesterKeys' })}
              />
            </div>
          </div>
        </div>
      )
    }

    function renderUploadingFileFailed(error: string, uploadParams: UploadParams) {
      return (
        <div>
          <div className="alert alert-danger" role="alert" style={{ marginTop: '20px', textAlign: 'center' }}>
            {error}
          </div>
          {renderFileSet(uploadParams)}
        </div>
      )
    }

    function renderSettingFileFailed(error: string, uploadParams: UploadParams) {
      return (
        <div>
          <div className="alert alert-danger" role="alert" style={{ marginTop: '20px', textAlign: 'center' }}>
            {error}
          </div>
          {renderAwaitingFileUpload(uploadParams)}
        </div>
      )
    }

    function renderFileUploading(uploadParams: UploadParams) {
      const percentage =
        model.type === 'EncryptingAndUploadingFile'
          ? 0
          : model.type === 'SavingKeys'
            ? 100
            : 0

      return (
        <div>
          <div className="alert alert-info" role="alert" style={{ marginTop: '20px', textAlign: 'center' }}>
            Encrypting and uploading file. Please leave the window open until the upload is finished.
          </div>
          <div className="progress">
            <div
              className="progress-bar progress-bar-striped progress-bar-animated"
              role="progressbar"
              style={{ width: `${percentage}%` }}
              aria-valuenow={percentage}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              {percentage}%
          </div>
          </div>
          {renderFileSet(uploadParams)}
          <div style={{ textAlign: 'center', margin: '10px' }}>
            <div className="spinner-grow" role="status" />
          </div>
        </div>
      )
    }

    function renderFileUploaded(uploadParams: UploadParams) {
      return (
        <div>
          <div className="alert alert-success" role="alert" style={{ marginTop: '20px', textAlign: 'center' }}>
            File uploaded successfully.
          </div>
          <div className="progress">
            <div
              className="progress-bar progress-bar-striped"
              role="progressbar"
              style={{ width: '100%' }}
              aria-valuenow={100}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              100%
            </div>
          </div>
          {renderFileSet(uploadParams)}
        </div>
      )
    }

    // @ts-ignore
    function render() {
      switch (model.type) {
        case 'PageError': return renderError()
        case 'Initializing': return renderInitializing()
        case 'SettingFileFailed': return renderSettingFileFailed(model.error, model.uploadParams)
        case 'UploadingFileFailed': return renderUploadingFileFailed(model.error, model.uploadParams)
        case 'AwaitingFileUpload': return renderAwaitingFileUpload(model.uploadParams)
        case 'FileSet': return renderFileSet(model.uploadParams)
        case 'GettingRequesterKeys':
        case 'GeneratingKeys':
        case 'EncryptingAndUploadingFile':
        case 'SavingKeys': return renderFileUploading(model.uploadParams)
        case 'Finished': return renderFileUploaded(model.uploadParams)
      }
    }

    return render()

  }
}

export { Model, Msg, init, update, view }