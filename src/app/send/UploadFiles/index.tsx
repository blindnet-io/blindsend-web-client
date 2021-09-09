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

import { endpoint, uploadChunkSize, encryptionChunkSize } from '../../globals'

import * as LeftPanel from '../components/LeftPanel'
import { fromCodec, uuidv4 } from '../../helpers'
import * as HowToTooltip from './tooltip/HowTo'
import * as FileTooBigTooltip from './tooltip/FileTooBig'
import * as TooManyFilesTooltip from './tooltip/TooManyFiles'
import * as TotalSizeTooBigTooltip from './tooltip/TotalSizeTooBig'
import * as UploadingdTooltip from './tooltip/Uploading'
import * as UploadedTooltip from './tooltip/Uploaded'
import * as FailedUploadTooltip from './tooltip/FailedUpload'

import * as FileRow from './components/File'

type AddFiles = { type: 'AddFiles', files: File[] }
type Upload = { type: 'Upload' }
type StoredMetadata = { type: 'StoredMetadata', linkId: string, signedUploadLinks: { id: string, link: string }[] }
type FailStoreMetadata = { type: 'FailStoreMetadata' }
type UploadInitialized = { type: 'UploadInitialized', fileNum: number, uploadId: string }
type GotSignedFileLinkParts = { type: 'GotSignedFileLinkParts', fileNum: number, signedFileLinkParts: { id: string, part_links: string[], fin_link: string } }
type FailUploadingFile = { type: 'FailUploadingFile' }

type UploadFileChunk = { type: 'UploadFileChunk', fileNum: number, chunkNum: number, links: { id: string, part_links: string[], fin_link: string }, state: sodium.StateAddress, offset: number, tag: { chunkNum: string, tag: string } }
type UploadedFileParts = { type: 'UploadedFileParts', fileNum: number, finLink: string, tag: { chunkNum: string, tag: string } }
type JoinedFileParts = { type: 'JoinedFileParts', fileNum: number }
type UploadFinished = { type: 'UploadFinished', linkId: string, seed: string }

type LeftPanelMsg = { type: 'LeftPanelMsg', msg: LeftPanel.Msg }
type FileMsg = { type: 'FileMsg', msg: FileRow.Msg }

type Msg =
  | AddFiles
  | Upload
  | StoredMetadata
  | FailStoreMetadata
  | UploadInitialized
  | FailUploadingFile
  | UploadFileChunk
  | UploadedFileParts
  | GotSignedFileLinkParts
  | JoinedFileParts
  | UploadFinished

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
  seed?: Uint8Array,
  fileKeys?: Uint8Array[],
  linkId?: string,
  constraints: Constraints,
  renderError: false | 'FileTooBig' | 'TooManyFiles' | 'TotalSizeTooBig' | 'UploadFailed',
  uploadLinks: { id: string, link: string }[],
  encStates: { state: sodium.StateAddress, header: Uint8Array }[]
  uploadFinished: boolean,

  tags: { chunkNum: string, tag: string }[]
}

function concat(arr1: Uint8Array, arr2: Uint8Array): Uint8Array {
  var tmp = new Uint8Array(arr1.byteLength + arr2.byteLength);
  tmp.set(arr1, 0)
  tmp.set(arr2, arr1.byteLength)
  return tmp;
}

function storeMetadata(
  seedHash: Uint8Array,
  encryptedMetadata: Uint8Array,
  files: { id: string }[],
  passwordless: boolean,
  salt: Uint8Array
): cmd.Cmd<Msg> {

  type Resp = { link_id: string, upload_links: { id: string, link: string }[] }

  const schema = t.interface({
    link_id: t.string,
    upload_links: t.array(t.interface({ id: t.string, link: t.string }))
  })
  const body = {
    seed_hash: sodium.to_base64(seedHash),
    encrypted_metadata: sodium.to_base64(encryptedMetadata),
    files: files.map(f => ({ id: f.id, full_upload: false })),
    passwordless,
    salt: sodium.to_base64(salt)
  }

  const req = {
    ...http.post(`${endpoint}/send/init-store-metadata`, body, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        _ => ({ type: 'FailStoreMetadata' }),
        resp => ({ type: 'StoredMetadata', linkId: resp.link_id, signedUploadLinks: resp.upload_links })
      )
    )
  )(req)
}

function initUpload(link: string, fileNum: number): cmd.Cmd<Msg> {

  const init: () => Promise<Msg> = () =>
    fetch(link, {
      method: 'POST',
      headers: {
        'Content-Length': '0'
      }
    }).then<Msg>(resp => {
      if (resp.status === 200)
        return resp.text().then(xml => {
          const uploadId = xml.substring(xml.indexOf("<UploadId>") + 10, xml.indexOf("</UploadId>"))
          return ({ type: 'UploadInitialized', fileNum, uploadId })
        })
      else
        return ({ type: 'FailUploadingFile' })
    }).catch(_ => ({ type: 'FailUploadingFile' }))

  return pipe(
    () => init(),
    perform(msg => msg)
  )
}

function getSignedLinks(uploadId: string, fileId: string, parts: number, fileNum: number): cmd.Cmd<Msg> {

  type Resp = { files: { id: string, part_links: string[], fin_link: string }[] }

  const schema = t.interface({
    files: t.array(t.interface({ id: t.string, part_links: t.array(t.string), fin_link: t.string }))
  })
  const body = {
    files: [{ upload_id: uploadId, file_id: fileId, parts }]
  }

  const req = {
    ...http.post(`${endpoint}/sign-upload-parts`, body, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        _ => ({ type: 'FailUploadingFile' }),
        resp => ({ type: 'GotSignedFileLinkParts', fileNum, signedFileLinkParts: resp.files[0] })
      )
    )
  )(req)
}

function joinFileParts(fileNum: number, finLink: string, tags: { chunkNum: string, tag: string }[]): cmd.Cmd<Msg> {
  const body = '<CompleteMultipartUpload>' + tags.reduce((acc, cur) => `${acc}<Part><PartNumber>${cur.chunkNum}</PartNumber><ETag>"${cur.tag}"</ETag></Part>`, '') + '</CompleteMultipartUpload>'

  const req: () => Promise<Msg> = () =>
    fetch(finLink, {
      method: 'POST',
      headers: {
        'content-type': 'application/xml'
      },
      body
    }).then<Msg>(resp => {
      if (resp.status === 200)
        return ({ type: 'JoinedFileParts', fileNum })
      else
        return ({ type: 'FailUploadingFile' })
    }).catch<Msg>(_ => ({ type: 'FailUploadingFile' }))

  return pipe(
    () => req(),
    perform(msg => msg)
  )
}

function finishUpload(linkId: string, seed: string): cmd.Cmd<Msg> {

  const schema = t.unknown
  const body = { link_id: linkId }

  const req = {
    ...http.post(`${endpoint}/finish-upload`, body, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<any, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, any, Msg>(
        _ => ({ type: 'FailUploadingFile' }),
        _ => ({ type: 'UploadFinished', linkId, seed })
      )
    )
  )(req)
}

function encryptAndUploadFileChunk(
  fileNum: number,
  chunkNum: number,
  links: { id: string, part_links: string[], fin_link: string },
  file: FileData,
  offset: number,
  state: sodium.StateAddress
): cmd.Cmd<Msg> {

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

          return fetch(`${links.part_links[chunkNum - 1]}`, {
            method: 'PUT',
            body: encryptedChunk
          }).then(resp => {
            if (resp.status === 200) {
              const tag = resp.headers.get('etag') || '""'
              return ({ type: 'UploadedFileParts', fileNum, finLink: links.fin_link, tag: { chunkNum: chunkNum.toString(), tag: tag.substring(1, tag.length - 1) } })
            }
            else
              return ({ type: 'FailUploadingFile' })
          })
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

          return fetch(`${links.part_links[chunkNum - 1]}`, {
            method: 'PUT',
            body: encryptedChunk
          }).then(resp => {
            if (resp.status === 200) {
              const tag = resp.headers.get('ETag') || ''
              return ({ type: 'UploadFileChunk', fileNum, chunkNum: chunkNum + 1, links, state, offset: offset + fileChunkLen, tag: { chunkNum: chunkNum.toString(), tag } })
            }
            else
              return ({ type: 'FailUploadingFile' })
          })

          // return handleUpload(
          //   encryptedChunk,
          //   ({ type: 'UploadFileChunk', fileNum, chunkNum: chunkNum + 1, links, state, offset: offset + fileChunkLen }),
          //   false
          // )
        })

  return pipe(
    handleFileChunk,
    perform(msg => msg)
  )
}

function init(constraints: Constraints): [Model, cmd.Cmd<Msg>] {

  const [leftPanelModel, leftPanelCmd] = LeftPanel.init(1)

  return [
    {
      files: [],
      encStates: [],
      uploadLinks: [],
      leftPanelModel,
      totalSize: 0,
      uploading: false,
      constraints,
      renderError: false,
      uploadFinished: false,

      tags: []
    },
    cmd.batch([
      cmd.map<LeftPanel.Msg, Msg>(msg => ({ type: 'LeftPanelMsg', msg }))(leftPanelCmd),
    ])
  ]
}

const update = (msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] => {
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

      const password = 'asd'

      const seed1 = sodium.crypto_kdf_keygen()
      const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)
      const seed2 = sodium.crypto_pwhash(
        sodium.crypto_kx_SEEDBYTES,
        password,
        salt,
        1,
        8192,
        sodium.crypto_pwhash_ALG_DEFAULT
      )

      const seed = sodium.crypto_generichash(sodium.crypto_kdf_KEYBYTES, concat(seed1, seed2))

      const metadataKey = sodium.crypto_kdf_derive_from_key(sodium.crypto_secretbox_KEYBYTES, 1, 'metadata', seed)

      const fileKeys = model.files.map((f, i) =>
        sodium.crypto_kdf_derive_from_key(
          sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES,
          i + 2,
          `${i}${(new Array(8 - i)).fill('-').join('')}`,
          seed
        ))

      const seedHash = sodium.crypto_hash(seed)

      const files = model.files.filter(f => !f.tooBig)

      const encStates = files.map((_, i) => sodium.crypto_secretstream_xchacha20poly1305_init_push(fileKeys[i]))

      const metadata = files.map((f, i) => ({
        name: f.file.name,
        size: f.file.size,
        id: f.id,
        header: sodium.to_base64(encStates[i].header)
      }))

      const iv = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)

      const encryptedMetadata = sodium.crypto_secretbox_easy(
        new TextEncoder().encode((JSON.stringify(metadata))),
        iv,
        metadataKey
      )

      return [
        {
          ...model,
          files,
          uploading: true,
          seed,
          fileKeys,
          encStates,
          renderError: false
        },
        storeMetadata(seedHash, concat(iv, encryptedMetadata), files.map(f => ({ id: f.id })), password.length === 0, salt)
      ]
    }
    case 'FailStoreMetadata': {
      return [
        { ...model, uploading: false, renderError: 'UploadFailed' },
        cmd.none
      ]
    }
    case 'StoredMetadata': {

      return [
        { ...model, linkId: msg.linkId, uploadLinks: msg.signedUploadLinks },
        initUpload(msg.signedUploadLinks[0].link, 0)
      ]
    }
    case 'UploadInitialized': {

      const file = model.files[msg.fileNum]
      const parts = Math.ceil(file.file.size / uploadChunkSize)

      return [
        { ...model },
        getSignedLinks(msg.uploadId, file.id, parts, msg.fileNum)
      ]
    }
    case 'GotSignedFileLinkParts': {

      const files = model.files.map((f, i) => i === msg.fileNum ? { ...f, progress: 1 } : f)

      return [
        { ...model, files },
        encryptAndUploadFileChunk(
          msg.fileNum,
          1,
          msg.signedFileLinkParts,
          model.files[msg.fileNum],
          0,
          model.encStates[msg.fileNum].state
        )
      ]
    }
    case 'UploadFileChunk': {

      const files = model.files.map((f, i) =>
        i === msg.fileNum
          ? { ...f, progress: Math.min(90, Math.ceil((msg.offset) / f.file.size * 100)) }
          : f
      )

      return [
        { ...model, files, tags: [...model.tags, msg.tag] },
        encryptAndUploadFileChunk(
          msg.fileNum,
          msg.chunkNum,
          msg.links,
          model.files[msg.fileNum],
          msg.offset,
          msg.state
        )
      ]
    }
    case 'UploadedFileParts': {

      const files = model.files.map((f, i) => i === msg.fileNum ? { ...f, progress: 95 } : f)
      const tags = [...model.tags, msg.tag]

      return [
        { ...model, files, tags },
        joinFileParts(msg.fileNum, msg.finLink, tags)
      ]
    }
    case 'JoinedFileParts': {
      if (!model.linkId || !model.seed) throw new Error('Wrong state')

      const files = model.files.map((f, i) => i === msg.fileNum ? { ...f, progress: 100 } : f)
      const nextFileNum = msg.fileNum + 1

      if (nextFileNum == model.files.length) {
        return [
          { ...model, files, tags: [] },
          finishUpload(model.linkId, sodium.to_base64(model.seed))
        ]
      }

      return [
        { ...model, files, tags: [] },
        initUpload(model.uploadLinks[nextFileNum].link, nextFileNum)
      ]
    }
    case 'UploadFinished': {
      return [
        { ...model, uploadFinished: true, uploading: false },
        cmd.none
      ]
    }
    case 'FailUploadingFile': {
      const files = model.files.map(f => ({ ...f, progress: 0, complete: false }))
      return [
        { ...model, files, uploading: false, tags: [], renderError: 'UploadFailed' },
        cmd.none
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
        else if (model.uploading)
          return UploadingdTooltip.view()(dispatch)
        else
          return HowToTooltip.view()(dispatch)
      }
      case 'FileTooBig': return FileTooBigTooltip.view(filesize(model.constraints.singleSize))(dispatch)
      case 'TooManyFiles': return TooManyFilesTooltip.view(model.constraints.numOfFiles)(dispatch)
      case 'TotalSizeTooBig': return TotalSizeTooBigTooltip.view(filesize(model.constraints.totalSize))(dispatch)
      case 'UploadFailed': return FailedUploadTooltip.view()(dispatch)
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
                or <a className="main-drop__browse-link" href="" style={{ cursor: model.uploading || model.uploadFinished ? 'default' : 'pointer' }}
                  onClick={e => {
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