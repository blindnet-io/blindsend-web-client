import * as React from 'react'
import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import * as task from 'fp-ts/lib/Task'
import { cmd, http } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import { perform } from 'elm-ts/lib/Task'
import * as sodium from 'libsodium-wrappers'
import filesize from 'filesize'

import * as LeftPanel from '../components/LeftPanel'
import { fromCodec, uuidv4 } from '../../helpers'
import * as HowToTooltip from './tooltip/HowTo'
import * as FileTooBigTooltip from './tooltip/FileTooBig'
import * as TooManyFilesTooltip from './tooltip/TooManyFiles'
import * as TotalSizeTooBigTooltip from './tooltip/TotalSizeTooBig'
import * as UploadedTooltip from './tooltip/Uploaded'

import * as FileRow from './components/File'

type AddFiles = { type: 'AddFiles', files: File[] }
type Upload = { type: 'Upload' }
type FailStoreMetadata = { type: 'FailStoreMetadata' }
type StoredMetadata = { type: 'StoredMetadata', links: { id: string, link: string }[] }
type UploadFileChunk = { type: 'UploadFileChunk', fileNum: number, state: sodium.StateAddress, offset: number, nextPartId: number }
type UploadedFile = { type: 'UploadedFile', fileNum: number }

type LeftPanelMsg = { type: 'LeftPanelMsg', msg: LeftPanel.Msg }
type FileMsg = { type: 'FileMsg', msg: FileRow.Msg }

type Msg =
  | AddFiles
  | Upload
  | FailStoreMetadata
  | StoredMetadata
  | UploadFileChunk
  | UploadedFile

  | LeftPanelMsg
  | FileMsg

type Constraints = {
  numOfFiles: number,
  totalSize: number,
  singleSize: number
}

type FileData = {
  file: File,
  id: string,
  progress: number,
  complete: boolean,
  tooBig: boolean
}

type Model = {
  leftPanelModel: LeftPanel.Model,
  files: FileData[],
  totalSize: number,
  uploading: boolean,
  masterKey?: Uint8Array,
  linkId: string,
  reqPublicKey: Uint8Array,
  constraints: Constraints,
  renderError: false | 'FileTooBig' | 'TooManyFiles' | 'TotalSizeTooBig',
  uploadLinks: { id: string, link: string }[],
  encStates: { state: sodium.StateAddress, header: Uint8Array }[]
  uploadFinished: boolean
}

function concat(arr1: Uint8Array, arr2: Uint8Array): Uint8Array {
  var tmp = new Uint8Array(arr1.byteLength + arr2.byteLength);
  tmp.set(arr1, 0)
  tmp.set(arr2, arr1.byteLength)
  return tmp;
}

function storeMetadata(encryptedMetadata: Uint8Array, files: { id: string, header: Uint8Array }[], linkId: string): cmd.Cmd<Msg> {

  type Resp = { upload_links: { id: string, link: string }[] }

  const schema = t.interface({
    upload_links: t.array(t.interface({ id: t.string, link: t.string }))
  })
  const body = {
    encryptedMetadata: sodium.to_base64(encryptedMetadata),
    files: files.map(f => ({ id: f.id, header: sodium.to_base64(f.header) })),
    linkId
  }

  const req = {
    ...http.post(`http://localhost:9000/request/store-metadata`, body, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        _ => ({ type: 'FailStoreMetadata' }),
        resp => ({ type: 'StoredMetadata', links: resp.upload_links })
      )
    )
  )(req)
}

const uploadChunkSize = 4194304
const encryptionChunkSize = 131072

function encryptAndUploadFileChunk(
  fileNum: number,
  link: string,
  file: FileData,
  offset: number,
  state: sodium.StateAddress,
  partId: number
): cmd.Cmd<Msg> {

  function handleUpload(chunk: Uint8Array, msg: Msg, last: boolean): Promise<Msg> {
    // TODO: handle backpressure
    return fetch(`${link}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      body: chunk.buffer
    }).then(resp => {
      if (resp.status === 200)
        return msg
      else {
        return task.delay(1000)<Msg>(() =>
          handleUpload(chunk, msg, last)
        )()
      }
    })
  }

  const fileChunkLen = uploadChunkSize - (uploadChunkSize / encryptionChunkSize) * 17

  const handleFileChunk: task.Task<Msg> = (offset + uploadChunkSize >= file.file.size)
    ? () =>
      file.file.slice(offset, file.file.size).arrayBuffer()
        .then(buffer => {

          const byteArr = new Uint8Array(buffer)

          let encryptedChunk: Uint8Array = new Uint8Array(
            byteArr.length + Math.ceil(byteArr.length / (encryptionChunkSize - 17)) * 17 + 17
          )

          let i: number, encryptionChunk: Uint8Array
          let t = 0
          for (i = 0; i < byteArr.length; i = i + encryptionChunkSize - 17) {
            encryptionChunk = byteArr.slice(i, i + encryptionChunkSize - 17)
            const encryptedEncChunk = sodium.crypto_secretstream_xchacha20poly1305_push(state, encryptionChunk, null, 0) // XChaCha20-Poly1305
            encryptedChunk.set(encryptedEncChunk, t)
            t += encryptedEncChunk.length
          }

          const last = sodium.crypto_secretstream_xchacha20poly1305_push(state, new Uint8Array(), null, sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL)
          encryptedChunk.set(last, t)

          return handleUpload(encryptedChunk, ({ type: 'UploadedFile', fileNum }), true)
        })
    : () =>
      file.file.slice(offset, offset + fileChunkLen).arrayBuffer()
        .then(buffer => {

          const byteArr = new Uint8Array(buffer)

          let encryptedChunk: Uint8Array = new Uint8Array(uploadChunkSize)

          let i: number, encryptionChunk: Uint8Array
          let t = 0
          for (i = 0; i < byteArr.length; i = i + encryptionChunkSize - 17) {
            encryptionChunk = byteArr.slice(i, i + encryptionChunkSize - 17)
            const encryptedEncChunk = sodium.crypto_secretstream_xchacha20poly1305_push(state, encryptionChunk, null, 0) // XChaCha20-Poly1305
            encryptedChunk.set(encryptedEncChunk, t)
            t += encryptedEncChunk.length
          }

          return handleUpload(
            encryptedChunk,
            ({ type: 'UploadFileChunk', fileNum, state, offset: offset + fileChunkLen, nextPartId: partId + 1 }),
            false
          )
        })

  return pipe(
    handleFileChunk,
    perform(msg => msg)
  )
}

const init: (
  linkId: string,
  reqPublicKey: Uint8Array,
  constraints: Constraints
) => [Model, cmd.Cmd<Msg>] = (linkId, reqPublicKey, constraints) => {

  const [leftPanelModel, leftPanelCmd] = LeftPanel.init(3)

  return [
    {
      files: [],
      encStates: [],
      uploadLinks: [],
      leftPanelModel,
      totalSize: 0,
      uploading: false,
      linkId,
      reqPublicKey,
      constraints,
      renderError: false,
      uploadFinished: false,
    },
    cmd.batch([
      cmd.map<LeftPanel.Msg, Msg>(msg => ({ type: 'LeftPanelMsg', msg }))(leftPanelCmd),
    ])
  ]
}

const update = (msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] => {
  console.log(msg)
  switch (msg.type) {
    case 'AddFiles': {
      if (msg.files.length + model.files.filter(f => !f.tooBig).length > model.constraints.numOfFiles) {
        return [{ ...model, renderError: 'TooManyFiles' }, cmd.none]
      }
      if ((msg.files.length > 1 || model.files.length > 0) && msg.files.reduce((acc, cur) => acc + cur.size, 0) + model.totalSize > model.constraints.totalSize)
        return [{ ...model, renderError: 'TotalSizeTooBig' }, cmd.none]

      let renderTooBig: false | 'FileTooBig' = false
      const newFiles = msg.files.map(file => {
        const tooBig = file.size > model.constraints.singleSize
        if (tooBig) renderTooBig = 'FileTooBig'

        return { file, id: uuidv4(), progress: 0, complete: false, tooBig }
      })
      const files = [...model.files, ...newFiles]

      return [{
        ...model,
        files,
        totalSize: files.reduce((acc, cur) => acc + (cur.tooBig ? 0 : cur.file.size), 0),
        renderError: renderTooBig
      }, cmd.none]
    }
    case 'Upload': {

      // if (model.uploadLinks) {
      //   // TODO
      //   return [
      //     model,
      //     cmd.none
      //   ]
      // }

      // X25519, 2x 32 bytes
      const { publicKey, privateKey } = sodium.crypto_kx_keypair()
      const { sharedTx: masterKey } = sodium.crypto_kx_client_session_keys(publicKey, privateKey, model.reqPublicKey)

      const metadata = model.files.map(f => ({
        name: f.file.name,
        size: f.file.size,
        id: f.id
      }))

      const iv = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)

      const encryptedMetadata = sodium.crypto_secretbox_easy(
        new TextEncoder().encode((JSON.stringify(metadata))),
        iv,
        masterKey
      )

      const encStates = model.files.map(_ => sodium.crypto_secretstream_xchacha20poly1305_init_push(masterKey)) // XChaCha20-Poly1305

      return [
        {
          ...model,
          uploading: true,
          masterKey,
          encStates
        },
        storeMetadata(concat(iv, encryptedMetadata), model.files.map((f, i) => ({ id: f.id, header: encStates[i].header })), model.linkId)
      ]
    }
    case 'FailStoreMetadata': {
      // TODO
      return [{ ...model, uploading: false }, cmd.none]
    }
    case 'StoredMetadata': {

      return [
        { ...model, uploadLinks: msg.links },
        cmd.batch(model.files.map((f, i) =>
          encryptAndUploadFileChunk(i, msg.links[i].link, model.files[i], 0, model.encStates[i].state, 1)
        ))
      ]
    }
    case 'UploadFileChunk': {

      const files = model.files.map((f, i) =>
        i === msg.fileNum
          ? { ...f, progress: Math.min(100, Math.ceil((msg.offset) / f.file.size * 100)) }
          : f
      )

      return [
        { ...model, files },
        encryptAndUploadFileChunk(
          msg.fileNum,
          model.uploadLinks[msg.fileNum].link,
          model.files[msg.fileNum],
          msg.offset,
          msg.state,
          msg.nextPartId
        )
      ]
    }
    case 'UploadedFile': {

      const files = model.files.map((f, i) => i === msg.fileNum ? { ...f, complete: true } : f)

      if (files.every(f => f.complete)) {
        // notify server
        return [
          { ...model, files, uploading: false, uploadFinished: true },
          cmd.none
        ]
      }

      return [
        { ...model, files },
        cmd.none
      ]
    }

    case 'LeftPanelMsg': {
      const [leftPanelModel, leftPanelCmd] = LeftPanel.update(msg.msg, model.leftPanelModel)

      return [model, cmd.none]
    }
    case 'FileMsg': {
      if (msg.msg.type === 'Remove') {
        const files = model.files.filter(file => file.id != msg.msg.id)
        return [{
          ...model,
          files,
          totalSize: files.reduce((acc, cur) => acc + (cur.tooBig ? 0 : cur.file.size), 0),
          renderError: false,
        }, cmd.none]
      }

      return [model, cmd.none]
    }
  }
}

const view = (model: Model): Html<Msg> => dispatch => {

  const noFiles = model.files.length === 0

  const renderTooltip = () => {
    switch (model.renderError) {
      case false: {
        if (model.uploadFinished)
          return UploadedTooltip.view()(dispatch)
        else
          return HowToTooltip.view()(dispatch)
      }
      case 'FileTooBig': return FileTooBigTooltip.view(filesize(model.constraints.singleSize))(dispatch)
      case 'TooManyFiles': return TooManyFilesTooltip.view(model.constraints.numOfFiles)(dispatch)
      case 'TotalSizeTooBig': return TotalSizeTooBigTooltip.view(filesize(model.constraints.totalSize))(dispatch)
    }
  }

  return (
    <div className="site-page__row row">

      {LeftPanel.view(model.leftPanelModel)(msg => dispatch({ type: 'LeftPanelMsg', msg }))}

      <div className="site-main__wrap col-lg-7">
        <div className="site-main">
          <div className="site-main__content">
            <div className="main-drop">
              <h2 className="main-drop__title section-title">Drop Files Here</h2>

              <div
                className={noFiles ? "main-drop__file-wrap empty" : "main-drop__file-wrap"}
                onDragOver={e => {
                  e.preventDefault()
                  if (!model.uploading && model.uploadLinks.length === 0)
                    document.querySelector('.main-drop__file-wrap')?.classList.add('drag')
                }}
                onDragLeave={e => {
                  e.preventDefault()
                  if (!model.uploading && model.uploadLinks.length === 0)
                    document.querySelector('.main-drop__file-wrap')?.classList.remove('drag')
                }}
                onDrop={e => {
                  e.preventDefault()
                  if (!model.uploading && model.uploadLinks.length === 0) {
                    document.querySelector('.main-drop__file-wrap')?.classList.remove('drag')
                    dispatch({ type: 'AddFiles', files: [...e.dataTransfer.files] })
                  }
                }}
              >
                <div className="main-drop__file-wrap-inner">
                  {noFiles &&
                    <div className="main-drop__file-wrap-inner-wrap">
                      <span className="main-drop__file-msg">Drag & Drop your files here</span>
                      <span className="main-drop__file-icon-mob">+</span>
                      <span className="main-drop__file-msg-mob">Click here to attach file</span>
                    </div>
                  }
                  {!noFiles && model.files.map(file =>
                    FileRow.view(
                      file.id, file.file.name, file.file.size, file.progress, file.complete, file.tooBig, model.uploading || model.uploadLinks.length > 0)
                      (msg => dispatch({ type: 'FileMsg', msg }))
                  )}
                </div>
              </div>

              <span className="main-drop__browse">
                or <a className="main-drop__browse-link" href="" onClick={e => {
                  e.preventDefault()
                  if (!model.uploading && model.uploadLinks.length === 0)
                    document.getElementById('file-pick')?.click()
                }}>BROWSE</a>
              </span>

              <div className={model.files.length === 0 || model.uploading || model.uploadFinished ? "btn-wrap disabled" : "btn-wrap"}>
                <input
                  type="submit"
                  className="btn"
                  style={model.files.length === 0 || model.uploading || model.uploadFinished ? { pointerEvents: 'none' } : {}}
                  value="send"
                  disabled={model.files.length === 0 || model.uploading || model.uploadFinished}
                  onClick={() => dispatch({ type: 'Upload' })}
                />
                <span className={model.uploading ? "btn-animation sending" : "btn-animation"}></span>
              </div>

              <input hidden type='file' multiple id='file-pick' onChange={e => dispatch({ type: 'AddFiles', files: [...e.target.files || []] })} />
            </div>
          </div>
        </div>
      </div>

      {renderTooltip()}

    </div>
  )
}

export { Model, Msg, Constraints, init, update, view }