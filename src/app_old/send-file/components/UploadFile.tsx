import { Html } from 'elm-ts/lib/React'
import { cmd, http } from 'elm-ts'
import { perform } from 'elm-ts/lib/Task'
import * as task from 'fp-ts/lib/Task'
import * as React from 'react'
import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import * as sodium from 'libsodium-wrappers'
import { fromCodec } from '../../helpers'
import * as globals from '../../globals'
// @ts-ignore
import fileUploadIcon from '../../../images/file-upload.png';

type UploadParams = {
  maxFileSize: number
}

type InitializedLibsodium = { type: 'InitializedLibsodium' }
type GotUploadParams = { type: 'GotUploadParams', uploadParams: UploadParams }
type FailFetchingUploadParams = { type: 'FailFetchingUploadParams' }
type TypePass = { type: 'TypePass', pass: string }
type SetFile = { type: 'SetFile', file: File }
type FailSetFile = { type: 'FailSetFile', error: string }
type StartUpload = { type: 'StartUpload' }
type GeneratedSeeds = { type: 'GeneratedSeeds', seed1: Uint8Array, passSalt: Uint8Array }
type GeneratedNonce = { type: 'GeneratedNonce', nonce: Uint8Array }
type GotLinkId = { type: 'GotLinkId', linkId: string }
type UploadFileChunk = { type: 'UploadFileChunk', offset: number, nextPartId: number }
type FailUploadingFile = { type: 'FailUploadingFile', error: string }
type UploadedFile = { type: 'UploadedFile', link: string }
type CopyLink = { type: 'CopyLink' }

type DragEnter = { type: 'DragEnter' }
type DragLeave = { type: 'DragLeave' }

type Msg =
  | InitializedLibsodium
  | GotUploadParams
  | FailFetchingUploadParams
  | TypePass
  | SetFile
  | FailSetFile
  | StartUpload
  | GeneratedSeeds
  | GeneratedNonce
  | GotLinkId
  | UploadFileChunk
  | FailUploadingFile
  | UploadedFile
  | CopyLink

  | DragEnter
  | DragLeave

type WithUploadParams = { uploadParams: UploadParams }
type WithFilePicker = { filePicker: { hovered: boolean } }
type WithPass = { pass: string }
type WithFile = { fileName: string, fileSize: number, file: File }
// TODO: metadata nonce
type WithKey = {
  fileKey: Uint8Array,
  header: Uint8Array,
  state: sodium.StateAddress
}

type PageError = { type: 'PageError' }
type Initializing = { type: 'Initializing' }
type AwaitingFile = { type: 'AwaitingFile' } & WithUploadParams & WithFilePicker & WithPass
type FileSet = { type: 'FileSet' } & WithUploadParams & WithFilePicker & WithPass & WithFile
type SettingFileFailed = { type: 'SettingFileFailed', error: string } & WithUploadParams & WithFilePicker & WithPass
type GeneratingKeys = { type: 'GeneratingKeys' } & WithUploadParams & WithPass & WithFile
type PreparingFileUpload = { type: 'PreparingFileUpload', seed: Uint8Array } & WithUploadParams & WithPass & WithFile & WithKey
type EncryptingAndUploadingFile = { type: 'EncryptingAndUploadingFile', seed: Uint8Array, linkId: string, offset: number } & WithUploadParams & WithPass & WithFile & WithKey
type UploadingFileFailed = { type: 'UploadingFileFailed', error: string } & WithUploadParams & WithFilePicker & WithPass & WithFile
type Finished = { type: 'Finished', link: string, seed: Uint8Array, header: Uint8Array, copied: boolean } & WithPass

type Model =
  | PageError
  | Initializing
  | AwaitingFile
  | FileSet
  | SettingFileFailed
  | GeneratingKeys
  | PreparingFileUpload
  | EncryptingAndUploadingFile
  | UploadingFileFailed
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
    ...http.get(`${globals.endpoint}/send/get-upload-params`, fromCodec(schema)),
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

function generateSeed(): cmd.Cmd<Msg> {

  return pipe(
    task.fromIO(() => ({
      seed1: sodium.crypto_kdf_keygen(),
      passSalt: sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)
    })),
    perform(
      ({ seed1, passSalt }) => ({ type: 'GeneratedSeeds', seed1, passSalt })
    )
  )
}

// function generateNonce(len: number): cmd.Cmd<Msg> {

//   return pipe(
//     task.fromIO(() => sodium.randombytes_buf(len)),
//     perform(
//       nonce => ({ type: 'GeneratedNonce', nonce })
//     )
//   )
// }

function initUpload(
  file: File,
  header: Uint8Array,
  fileMetadataKey: Uint8Array,
  metadataNonce: Uint8Array,
  kdfSalt: Uint8Array,
  kdfOps: number,
  kdfMemLimit: number
): cmd.Cmd<Msg> {

  const sizeOfEncryptedFile = file.size + Math.ceil(file.size / (globals.encryptionChunkSize - 17)) * 17 + 17

  const metadata = {
    name: file.name,
    size: file.size
  }

  const encMetadata = sodium.crypto_secretbox_easy(JSON.stringify(metadata), metadataNonce, fileMetadataKey) // XSalsa20 + Poly1305

  const schema = t.interface({
    link_id: t.string,
  })
  const body = {
    size: sizeOfEncryptedFile,
    enc_file_meta: sodium.to_hex(encMetadata),
    file_enc_nonce: sodium.to_hex(header),
    meta_enc_nonce: sodium.to_hex(metadataNonce),
    kdf_salt: sodium.to_hex(kdfSalt),
    kdf_ops: kdfOps,
    kdf_mem_limit: kdfMemLimit
  }

  const req = {
    ...http.post(`${globals.endpoint}/send/init-session`, body, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<{ link_id: string }, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, { link_id: string }, Msg>(
        _ => ({ type: 'FailUploadingFile', error: 'Uploading failed. Try again.' }),
        resp => ({ type: 'GotLinkId', linkId: resp.link_id })
      )
    )
  )(req)
}

function encryptAndUploadFileChunk(file: File, linkId: string, offset: number, state: sodium.StateAddress, partId: number): cmd.Cmd<Msg> {

  function handleUpload(chunk: Uint8Array, msgTransform: ((_: string) => Msg), last: boolean): Promise<Msg> {
    // TODO: handle backpressure
    return fetch(`${globals.endpoint}/send/send-file-part/${linkId}?part_id=${partId}&chunk_size=${chunk.length}&last=${last}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      body: chunk.buffer
    }).then(resp => {
      if (resp.status === 200)
        return resp.text().then(msgTransform)
      else if (resp.status === 400)
        return ({ type: 'FailUploadingFile', error: 'Uploading failed. Try again.' })
      else
        return task.delay(1000)<Msg>(() =>
          handleUpload(chunk, msgTransform, last)
        )()
    })
  }

  const fileChunkLen = globals.uploadChunkSize - (globals.uploadChunkSize / globals.encryptionChunkSize) * 17

  const handleFileChunk: task.Task<Msg> = (offset + globals.uploadChunkSize >= file.size)
    ? () =>
      file.slice(offset, file.size).arrayBuffer()
        .then(buffer => {

          const byteArr = new Uint8Array(buffer)

          let encryptedChunk: Uint8Array = new Uint8Array(
            byteArr.length + Math.ceil(byteArr.length / (globals.encryptionChunkSize - 17)) * 17 + 17
          )

          let i: number, encryptionChunk: Uint8Array
          let t = 0
          for (i = 0; i < byteArr.length; i = i + globals.encryptionChunkSize - 17) {
            encryptionChunk = byteArr.slice(i, i + globals.encryptionChunkSize - 17)
            const encryptedEncChunk = sodium.crypto_secretstream_xchacha20poly1305_push(state, encryptionChunk, null, 0) // XChaCha20-Poly1305
            encryptedChunk.set(encryptedEncChunk, t)
            t += encryptedEncChunk.length
          }

          const last = sodium.crypto_secretstream_xchacha20poly1305_push(state, new Uint8Array(), null, sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL)
          encryptedChunk.set(last, t)

          // TODO: refactor msg
          return handleUpload(encryptedChunk, link => ({ type: 'UploadedFile', link }), true)
        })
    : () =>
      file.slice(offset, offset + fileChunkLen).arrayBuffer()
        .then(buffer => {

          const byteArr = new Uint8Array(buffer)

          let encryptedChunk: Uint8Array = new Uint8Array(globals.uploadChunkSize)

          let i: number, encryptionChunk: Uint8Array
          let t = 0
          for (i = 0; i < byteArr.length; i = i + globals.encryptionChunkSize - 17) {
            encryptionChunk = byteArr.slice(i, i + globals.encryptionChunkSize - 17)
            const encryptedEncChunk = sodium.crypto_secretstream_xchacha20poly1305_push(state, encryptionChunk, null, 0) // XChaCha20-Poly1305
            encryptedChunk.set(encryptedEncChunk, t)
            t += encryptedEncChunk.length
          }

          return handleUpload(encryptedChunk, _ => ({ type: 'UploadFileChunk', offset: offset + fileChunkLen, nextPartId: partId + 1 }), false)
        })

  return pipe(
    handleFileChunk,
    perform(msg => msg)
  )
}

const init: [Model, cmd.Cmd<Msg>] = [{ type: 'Initializing' }, loadLibsoium()]

function update(msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] {
  console.log(msg)
  switch (msg.type) {
    case 'InitializedLibsodium': {
      if (model.type != 'Initializing') throw new Error("Wrong state")
      else return [{ ...model }, getUploadParams()]
    }
    case 'GotUploadParams': {
      if (model.type != 'Initializing') throw new Error("Wrong state")
      else return [{ ...model, type: 'AwaitingFile', uploadParams: msg.uploadParams, filePicker: { hovered: false }, pass: '' }, cmd.none]
    }
    case 'FailFetchingUploadParams': {
      if (model.type != 'Initializing') throw new Error("Wrong state")
      else return [{ type: 'PageError' }, cmd.none]
    }
    case 'TypePass': {
      if (model.type != 'AwaitingFile' && model.type != 'FileSet' && model.type != 'UploadingFileFailed' && model.type != 'SettingFileFailed') throw new Error("Wrong state")
      else return [{ ...model, pass: msg.pass }, cmd.none]
    }
    case 'SetFile': {
      if (model.type != 'AwaitingFile' && model.type != 'FileSet' && model.type != 'UploadingFileFailed' && model.type != 'SettingFileFailed') throw new Error("Wrong state")
      else return [
        { ...model, type: 'FileSet', fileName: msg.file.name, fileSize: msg.file.size, file: msg.file, filePicker: { hovered: false } },
        cmd.none
      ]
    }
    case 'FailSetFile': {
      if (model.type != 'AwaitingFile' && model.type != 'FileSet' && model.type != 'UploadingFileFailed' && model.type != 'SettingFileFailed') throw new Error("Wrong state")
      else return [
        { type: 'SettingFileFailed', uploadParams: model.uploadParams, filePicker: { hovered: false }, pass: model.pass, error: msg.error },
        cmd.none
      ]
    }
    case 'StartUpload': {
      if (model.type != 'FileSet') throw new Error("Wrong state")
      else return [{ ...model, type: 'GeneratingKeys' }, generateSeed()]
    }
    case 'GeneratedSeeds': {
      if (model.type != 'GeneratingKeys') throw new Error("Wrong state")
      else {
        const { seed1, passSalt } = msg

        const fileMetadataKey = sodium.crypto_kdf_derive_from_key(sodium.crypto_secretbox_KEYBYTES, 1, "filemeta", seed1) // BLAKE2B

        // TODO: to web worker so params can be larger
        const kdfOps = sodium.crypto_pwhash_OPSLIMIT_MIN
        const kdfMemLimit = sodium.crypto_pwhash_MEMLIMIT_MIN
        const seed2 = sodium.crypto_pwhash(
          sodium.crypto_kx_SEEDBYTES,
          model.pass,
          passSalt,
          kdfOps,
          kdfMemLimit,
          sodium.crypto_pwhash_ALG_DEFAULT
        ) // Argon2id, 32 bytes

        const fileKeySeed = sodium.crypto_generichash(sodium.crypto_kdf_KEYBYTES, new Uint8Array([...seed1, ...seed2])) // BLAKE2B(seed1, seed2)
        const fileKey = sodium.crypto_kdf_derive_from_key(sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES, 1, "file----", fileKeySeed) // BLAKE2B

        // TODO: side effects
        const { state, header } = sodium.crypto_secretstream_xchacha20poly1305_init_push(fileKey) // XChaCha20-Poly1305
        const metadataNonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES) // XSalsa20 + Poly1305

        return [
          { ...model, type: 'PreparingFileUpload', seed: seed1, fileKey, header, state },
          initUpload(model.file, header, fileMetadataKey, metadataNonce, passSalt, kdfOps, kdfMemLimit)
        ]
      }
    }
    case 'GeneratedNonce': {
      throw new Error("Not implemented")
    }
    case 'GotLinkId': {
      if (model.type != 'PreparingFileUpload') throw new Error("Wrong state")
      else {
        return [
          { ...model, type: 'EncryptingAndUploadingFile', linkId: msg.linkId, offset: 0 },
          encryptAndUploadFileChunk(model.file, msg.linkId, 0, model.state, 1)
        ]
      }
    }
    case 'FailUploadingFile': {
      if (model.type != 'FileSet' && model.type != 'PreparingFileUpload' && model.type != 'EncryptingAndUploadingFile') throw new Error("Wrong state")
      else return [{ ...model, filePicker: { hovered: false }, type: 'UploadingFileFailed', error: msg.error }, cmd.none]
    }

    case 'UploadFileChunk': {
      if (model.type != 'EncryptingAndUploadingFile') throw new Error("Wrong state")
      else {
        return [
          { ...model, offset: msg.offset },
          encryptAndUploadFileChunk(model.file, model.linkId, msg.offset, model.state, msg.nextPartId)
        ]
      }
    }
    case 'UploadedFile': {
      if (model.type != 'EncryptingAndUploadingFile') throw new Error("Wrong state")
      else return [{ ...model, type: 'Finished', link: msg.link, copied: false }, cmd.none]
    }
    case 'CopyLink': {
      if (model.type != 'Finished') throw new Error("Wrong state")
      else return [{ ...model, copied: true }, cmd.none]
    }

    case 'DragEnter': {
      if (model.type != 'AwaitingFile' && model.type != 'UploadingFileFailed' && model.type != 'FileSet' && model.type != 'SettingFileFailed') throw new Error("Wrong state")
      else return [{ ...model, filePicker: { ...model.filePicker, hovered: true } }, cmd.none]
    }
    case 'DragLeave': {
      if (model.type != 'AwaitingFile' && model.type != 'UploadingFileFailed' && model.type != 'FileSet' && model.type != 'SettingFileFailed') throw new Error("Wrong state")
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

    const renderForm = (uploadParams: UploadParams, pass: string, error?: string) => {

      const filePickEnabled =
        model.type == 'AwaitingFile' || model.type == 'UploadingFileFailed' ||
        model.type == 'FileSet' || model.type == 'SettingFileFailed'

      return (
        <div>
          {error &&
            <div className="alert alert-danger" role="alert" style={{ marginTop: '20px', textAlign: 'center' }}>
              {error}
            </div>
          }
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

          <div className="upload-btn-wrap">
            <div className="bs-form">
              <p style={{
                textAlign: 'center',
                background: 'rgba(255, 255, 255, 0.5)',
                borderRadius: '16px',
                padding: '5px'
              }}
              >
                Password protect the file.<br />
                File is still e2e encrypted even without a password.<br />
              </p>
              <input
                type="password"
                disabled={false}
                value={pass}
                onChange={e => dispatch({ type: 'TypePass', pass: e.target.value })}
                className="form-control text pass-text"
                placeholder="password"
                style={{ border: "1px solid #ced4da" }}
              />
              <input
                type="button"
                className="form-control btn bs-btn"
                disabled={model.type != 'FileSet' && model.type != 'UploadingFileFailed'}
                value="Upload file"
                onClick={_ => dispatch({ type: 'StartUpload' })}
                style={{
                  marginTop: '20px'
                }}
              />
            </div>
          </div>
        </div >
      )
    }

    function renderFileUploading(uploadParams: UploadParams, pass: string) {
      const percentage =
        model.type === 'EncryptingAndUploadingFile'
          ? Math.min(100, Math.ceil((model.offset) / model.file.size * 100))
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
          {renderForm(uploadParams, pass, undefined)}
        </div>
      )
    }

    function renderFileUploaded(model: Finished) {
      const link = `${model.link}#${sodium.to_base64(model.seed)}`
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
          <div className="get-file-wrap">
            <div className="row m-0">
              <div className="col-lg-10 offset-lg-1 text-center">
                <div className="bs-form">
                  <input
                    type="button"
                    className="form-control btn bs-btn"
                    value="copy to clipboard"
                    onClick={_ => {
                      const el = document.createElement('textarea')
                      el.value = link
                      document.body.appendChild(el)
                      el.select()
                      document.execCommand('copy')
                      document.body.removeChild(el)
                      dispatch({ type: 'CopyLink' })
                    }}
                  />
                </div>
                <div className="Link-generated text-center" >
                  <div className="link" style={{ padding: '10px', marginTop: '10px' }}>
                    <a style={{ wordWrap: 'break-word' }} href={link}>{link}</a>
                  </div>
                </div>

                {model.copied != undefined && model.copied &&
                  <div className="alert alert-success" role="alert" style={{ marginTop: '20px', textAlign: 'center' }}>
                    Link copied to clipboard
                  </div>
                }

              </div>
            </div>
          </div>
        </div >
      )
    }

    function render() {
      switch (model.type) {
        case 'PageError': return renderError()
        case 'Initializing': return renderInitializing()
        case 'SettingFileFailed': return renderForm(model.uploadParams, model.pass, model.error)
        case 'AwaitingFile': return renderForm(model.uploadParams, model.pass, undefined)
        case 'FileSet': return renderForm(model.uploadParams, model.pass, undefined)
        case 'UploadingFileFailed': return renderForm(model.uploadParams, model.pass, model.error)
        case 'GeneratingKeys':
        case 'PreparingFileUpload':
        case 'EncryptingAndUploadingFile': return renderFileUploading(model.uploadParams, model.pass)
        case 'Finished': return renderFileUploaded(model)
      }
    }

    return render()

  }
}

export { Model, Msg, init, update, view }