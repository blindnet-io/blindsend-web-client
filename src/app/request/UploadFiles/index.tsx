import * as React from 'react'
import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import * as T from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/TaskEither'
import { cmd, http } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import { perform } from 'elm-ts/lib/Task'
import filesize from 'filesize'

import { endpoint, uploadChunkSize, fullUploadLimit } from '../../globals'
import { arr2b64, concat } from '../../helpers'

import * as LeftPanel from '../components/LeftPanel'
import { fromCodec, uuidv4 } from '../../helpers'
import * as HowToTooltip from './tooltip/HowTo'
import * as FileTooBigTooltip from './tooltip/FileTooBig'
import * as TooManyFilesTooltip from './tooltip/TooManyFiles'
import * as TotalSizeTooBigTooltip from './tooltip/TotalSizeTooBig'
import * as UploadingdTooltip from './tooltip/Uploading'
import * as UploadedTooltip from './tooltip/Uploaded'
import * as FailedUploadTooltip from './tooltip/FailedUpload'
import * as UnexpectedErrorTooltip from './tooltip/UnexpectedError'

import * as FileRow from '../../components/FileUpload'

type Keys = {
  metadataKey: CryptoKey,
  fileKeys: CryptoKey[],
  pk: string,
  seedHash: Uint8Array,
  ivs: { metadata: Uint8Array, files: Uint8Array[] }
}

type AddFiles = { type: 'AddFiles', files: File[] }
type Upload = { type: 'Upload' }
type CancelUpload = { type: 'CancelUpload' }
type GeneratedKeys = { type: 'GeneratedKeys', keys: Keys }
type FailGeneratingKeys = { type: 'FailGeneratingKeys' }
type StoredMetadata = { type: 'StoredMetadata', signedUploadLinks: { id: string, link: string, customTimeHeader: string }[] }
type FailStoreMetadata = { type: 'FailStoreMetadata' }
type UploadInitialized = { type: 'UploadInitialized', fileNum: number, sessionUri: string }
type FailUploadingFile = { type: 'FailUploadingFile' }

type UploadFileChunk = { type: 'UploadFileChunk', fileNum: number, sessionUri: string, offset: number, uploaded: number, chunkId: number }
type UploadedFile = { type: 'UploadedFile', fileNum: number }
type UploadFinished = { type: 'UploadFinished' }

type LeftPanelMsg = { type: 'LeftPanelMsg', msg: LeftPanel.Msg }
type FileMsg = { type: 'FileMsg', msg: FileRow.Msg }

type Msg =
  | AddFiles
  | Upload
  | CancelUpload
  | GeneratedKeys
  | FailGeneratingKeys
  | StoredMetadata
  | FailStoreMetadata
  | UploadInitialized
  | FailUploadingFile
  | UploadFileChunk
  | UploadedFile
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
  tooBig: boolean,
  fullUpload: boolean
}

type Model = {
  leftPanelModel: LeftPanel.Model,
  files: FileData[],
  totalSize: number,
  linkId: string,
  reqPublicKey: string,
  constraints: Constraints,
  hasError: false | 'FileTooBig' | 'TooManyFiles' | 'TotalSizeTooBig' | 'UploadFailed' | 'Unexpected',
  uploadLinks: { id: string, link: string, customTimeHeader: string }[],
  status:
  | { type: 'WaitingForUpload' }
  | { type: 'InitializedUpload' }
  | { type: 'GeneratedKeys', keys: Keys }
  | { type: 'Uploading', keys: Keys }
  | { type: 'Finished', keys: Keys }
}

const encrypt = (
  key: CryptoKey,
  data: ArrayBuffer,
  iv: ArrayBuffer
): Promise<ArrayBuffer> =>
  crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    data
  )

function encryptAndStoreMetadata(
  metadataKey: CryptoKey,
  metadata: string,
  iv: Uint8Array,
  seedHash: Uint8Array,
  publicKey: string,
  files: { id: string, fullUpload: boolean }[],
  linkId: string
): cmd.Cmd<Msg> {

  const task: T.Task<Msg> = pipe(
    T.Do,
    T.bind('encryptedMetadata', () => () => encrypt(metadataKey, new TextEncoder().encode(metadata), iv)),
    T.bind('resp', ({ encryptedMetadata }) => () =>
      fetch(`${endpoint}/request/store-metadata`, {
        method: 'POST',
        body: JSON.stringify({
          seed_hash: arr2b64(seedHash),
          public_key: publicKey,
          encrypted_metadata: arr2b64(concat(iv, encryptedMetadata)),
          files: files.map(f => ({ id: f.id, full_upload: f.fullUpload })),
          link_id: linkId
        })
      })),
    T.chain(({ resp }) =>
      resp.status === 200
        ? () => resp.json().then(r => ({
          type: 'StoredMetadata',
          // @ts-ignore
          signedUploadLinks: r.upload_links.map(l => ({ id: l.id, link: l.link, customTimeHeader: l.custom_time_header }))
        }))
        : T.of({ type: 'FailStoreMetadata' }))
  )

  return pipe(
    TE.match<any, Msg, Msg>(msg => msg, msg => msg)(TE.tryCatch(task, _ => ({ type: 'FailStoreMetadata' }))),
    perform(msg => msg)
  )
}

function fullUpload(
  link: string,
  customTimeHeader: string,
  key: CryptoKey,
  iv: Uint8Array,
  fileData: Blob,
  fileNum: number
): cmd.Cmd<Msg> {

  const task = pipe(
    T.Do,
    T.bind('fileData', () => () => fileData.arrayBuffer()),
    T.bind('iv', () => () => crypto.subtle.digest('SHA-256', concat(iv, Uint8Array.from([0])))),
    T.bind('encryptedFileData', ({ iv, fileData }) => () => encrypt(key, fileData, new Uint8Array(iv).slice(0, 12))),
    T.bind('resp', ({ encryptedFileData }) => () =>
      fetch(link, {
        method: 'PUT',
        headers: {
          'x-goog-content-length-range': '0,5000000',
          'x-goog-custom-time': customTimeHeader
        },
        body: encryptedFileData
      })),
    T.map<any, Msg>(({ resp }) =>
      resp.status === 200
        ? ({ type: 'UploadedFile', fileNum })
        : ({ type: 'FailUploadingFile' }))
  )

  return pipe(
    TE.match<any, Msg, Msg>(msg => msg, msg => msg)(TE.tryCatch(task, _ => ({ type: 'FailUploadingFile' }))),
    perform(msg => msg)
  )
}

function initStorageResumableUpload(
  link: string,
  customTimeHeader: string,
  fileNum: number
): cmd.Cmd<Msg> {

  const init: T.Task<Msg> = () =>
    fetch(link, {
      method: 'POST',
      headers: {
        'Content-Length': '0',
        'x-goog-resumable': 'start',
        'x-goog-content-length-range': '0,2147483648',
        'x-goog-custom-time': customTimeHeader
      }
    }).then<Msg>(resp => {
      if (resp.status === 201) {
        const sessionUri = resp.headers.get('Location')!
        return ({ type: 'UploadInitialized', fileNum, sessionUri })
      }
      else
        return ({ type: 'FailUploadingFile' })
    }).catch(_ => ({ type: 'FailUploadingFile' }))

  return pipe(
    init,
    perform(msg => msg)
  )
}

function finishUpload(linkId: string,): cmd.Cmd<Msg> {

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
        _ => ({ type: 'UploadFinished' })
      )
    )
  )(req)
}

function encryptAndUploadFileChunk(
  fileNum: number,
  sessionUri: string,
  key: CryptoKey,
  iv: Uint8Array,
  file: FileData,
  offset: number,
  uploaded: number,
  chunkId: number
): cmd.Cmd<Msg> {

  const handleFileChunk: T.Task<Msg> =
    (offset + uploadChunkSize >= file.file.size)
      ? () =>
        file.file.slice(offset, file.file.size)
          .arrayBuffer()
          .then(fileData => crypto.subtle.digest('SHA-256', concat(iv, Uint8Array.from([chunkId])))
            .then(iv => encrypt(key, fileData, new Uint8Array(iv).slice(0, 12))))
          .then(encryptedChunk =>
            fetch(sessionUri, {
              method: 'PUT',
              headers: {
                'Content-Length': `${uploadChunkSize}`,
                'Content-Range': `bytes ${uploaded}-${uploaded + encryptedChunk.byteLength - 1}/${uploaded + encryptedChunk.byteLength}`
              },
              body: encryptedChunk
            }))
          .then(resp =>
            resp.status === 200
              ? { type: 'UploadedFile', fileNum }
              : { type: 'FailUploadingFile' }
          )
      : () =>
        file.file.slice(offset, offset + uploadChunkSize - 16)
          .arrayBuffer()
          .then(fileData => crypto.subtle.digest('SHA-256', concat(iv, Uint8Array.from([chunkId])))
            .then(iv => encrypt(key, fileData, new Uint8Array(iv).slice(0, 12))))
          .then(encryptedChunk =>
            fetch(sessionUri, {
              method: 'PUT',
              headers: {
                'Content-Length': `${uploadChunkSize}`,
                'Content-Range': `bytes ${uploaded}-${uploaded + encryptedChunk.byteLength - 1}/*`
              },
              body: encryptedChunk
            }))
          .then(resp => {
            if (resp.status === 308) {
              return ({
                type: 'UploadFileChunk',
                fileNum,
                sessionUri,
                offset: offset + uploadChunkSize - 16,
                uploaded: uploaded + uploadChunkSize,
                chunkId: chunkId
              })
            }
            else
              return ({ type: 'FailUploadingFile' })
          })

  return pipe(
    TE.match<any, Msg, Msg>(msg => msg, msg => msg)(TE.tryCatch(handleFileChunk, _ => ({ type: 'FailUploadingFile' }))),
    perform(msg => msg)
  )
}

function generateKeys(reqPk: string, numFiles: number): cmd.Cmd<Msg> {
  const te = new TextEncoder()

  const [x, y] = reqPk.split('.')
  const pkJwk = { 'crv': 'P-256', 'ext': false, 'key_ops': [], 'kty': 'EC', x, y }

  const task = pipe(
    T.Do,
    T.bind('reqPk', () => () => crypto.subtle.importKey("jwk", pkJwk, { name: "ECDH", namedCurve: "P-256" }, false, [])),
    T.bind('ecdhKey', () => () => crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ['deriveBits'])),
    T.bind('pk', ({ ecdhKey }) => () => crypto.subtle.exportKey('jwk', ecdhKey.publicKey!)),
    T.bind('seed', ({ reqPk, ecdhKey }) => () => crypto.subtle.deriveBits({ name: "ECDH", public: reqPk }, ecdhKey.privateKey!, 256)),
    T.bind('seedKey', ({ seed }) => () => crypto.subtle.importKey("raw", seed, "HKDF", false, ["deriveBits"])),
    T.bind('metadataKeyBytes', ({ seedKey }) => () => crypto.subtle.deriveBits({ "name": "HKDF", "hash": "SHA-256", salt: new Uint8Array(), "info": te.encode('metadata') }, seedKey, 256)),
    T.bind('metadataKey', ({ metadataKeyBytes }) => () => crypto.subtle.importKey('raw', metadataKeyBytes, 'AES-GCM', false, ['encrypt'])),
    T.bind('fileKeys', ({ seedKey }) => () =>
      Promise.all(
        new Array(numFiles).fill(null).map(
          (_, i) =>
            crypto.subtle.deriveBits({ "name": "HKDF", "hash": "SHA-256", salt: new Uint8Array(), "info": te.encode(`${i}`) }, seedKey, 256)
              .then(keyBytes => crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']))))),
    T.bind('sh', ({ seed }) => () => crypto.subtle.digest('SHA-256', seed)),
    T.map<any, Msg>(({ pk, sh, metadataKey, fileKeys }) => {
      const seedHash = new Uint8Array(sh)

      const mIv = crypto.getRandomValues(new Uint8Array(12))
      const ivs = new Array(numFiles).fill(null).map(_ => crypto.getRandomValues(new Uint8Array(12)))

      return { type: 'GeneratedKeys', keys: { metadataKey, fileKeys, pk: `${pk.x}.${pk.y}`, seedHash, ivs: { metadata: mIv, files: ivs } } }
    })
  )

  return pipe(
    TE.match<any, Msg, Msg>(msg => msg, msg => msg)(TE.tryCatch(task, _ => ({ type: 'FailGeneratingKeys' }))),
    perform(msg => msg)
  )
}

const init: (
  linkId: string,
  reqPublicKey: string,
  constraints: Constraints
) => [Model, cmd.Cmd<Msg>] = (linkId, reqPublicKey, constraints) => {

  const [leftPanelModel, leftPanelCmd] = LeftPanel.init(3)

  return [
    {
      leftPanelModel,
      files: [],
      totalSize: 0,
      linkId,
      uploadLinks: [],
      reqPublicKey,
      constraints,
      hasError: false,
      status: { type: 'WaitingForUpload' }
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
        return [{ ...model, hasError: 'TooManyFiles' }, cmd.none]
      }
      if ((msg.files.length > 1 || model.files.length > 0) && msg.files.reduce((acc, cur) => acc + cur.size, 0) + model.totalSize > model.constraints.totalSize)
        return [{ ...model, hasError: 'TotalSizeTooBig' }, cmd.none]

      let renderTooBig: false | 'FileTooBig' = false
      const newFiles = msg.files.map(file => {
        const tooBig = file.size > model.constraints.singleSize
        if (tooBig) renderTooBig = 'FileTooBig'

        return { file, id: uuidv4(), progress: 0, complete: false, tooBig, fullUpload: file.size <= fullUploadLimit }
      })
      const files = [...model.files.filter(f => !f.tooBig), ...newFiles]

      return [{
        ...model,
        files,
        totalSize: files.reduce((acc, cur) => acc + (cur.tooBig ? 0 : cur.file.size), 0),
        hasError: renderTooBig
      }, cmd.none]
    }
    case 'Upload': {
      const files = model.files.filter(f => !f.tooBig)

      return [
        {
          ...model,
          files,
          hasError: false,
          status: { type: 'InitializedUpload' }
        },
        generateKeys(model.reqPublicKey, files.length)
      ]
    }
    case 'CancelUpload': {
      return [
        {
          ...model,
          status: { type: 'WaitingForUpload' },
          files: model.files.map(f => ({ ...f, progress: 0, conmplete: false }))
        },
        cmd.none
      ]
    }
    case 'GeneratedKeys': {
      if (model.status.type === 'WaitingForUpload') return [model, cmd.none]

      const metadata = JSON.stringify(
        model.files.map((f, i) => ({
          name: f.file.name,
          size: f.file.size,
          id: f.id,
          iv: arr2b64(msg.keys.ivs.files[i])
        })))

      return [
        {
          ...model,
          status: { type: 'GeneratedKeys', keys: msg.keys }
        },
        encryptAndStoreMetadata(
          msg.keys.metadataKey,
          metadata,
          msg.keys.ivs.metadata,
          msg.keys.seedHash,
          msg.keys.pk,
          model.files,
          model.linkId
        )
      ]
    }
    case 'FailGeneratingKeys': {
      if (model.status.type === 'WaitingForUpload') return [model, cmd.none]

      return [
        { ...model, hasError: 'UploadFailed', status: { type: 'WaitingForUpload' } },
        cmd.none
      ]
    }
    case 'FailStoreMetadata': {
      if (model.status.type === 'WaitingForUpload') return [model, cmd.none]

      return [
        { ...model, hasError: 'UploadFailed', status: { type: 'WaitingForUpload' } },
        cmd.none
      ]
    }
    case 'StoredMetadata': {
      if (model.status.type === 'WaitingForUpload') return [model, cmd.none]

      if (model.status.type !== 'GeneratedKeys')
        return [{ ...model, hasError: 'Unexpected' }, cmd.none]

      return [
        {
          ...model,
          uploadLinks: msg.signedUploadLinks,
          status: { type: 'Uploading', keys: model.status.keys }
        },
        model.files[0].fullUpload
          ? fullUpload(
            msg.signedUploadLinks[0].link,
            msg.signedUploadLinks[0].customTimeHeader,
            model.status.keys.fileKeys[0],
            model.status.keys.ivs.files[0],
            model.files[0].file,
            0
          )
          : initStorageResumableUpload(
            msg.signedUploadLinks[0].link,
            msg.signedUploadLinks[0].customTimeHeader,
            0
          )
      ]
    }
    case 'UploadInitialized': {
      if (model.status.type === 'WaitingForUpload') return [model, cmd.none]

      if (model.status.type !== 'Uploading')
        return [{ ...model, hasError: 'Unexpected' }, cmd.none]

      const files = model.files.map((f, i) => i === msg.fileNum ? { ...f, progress: 1 } : f)

      return [
        { ...model, files },
        encryptAndUploadFileChunk(
          msg.fileNum,
          msg.sessionUri,
          model.status.keys.fileKeys[msg.fileNum],
          model.status.keys.ivs.files[msg.fileNum],
          model.files[msg.fileNum],
          0,
          0,
          0
        )
      ]
    }
    case 'UploadFileChunk': {
      if (model.status.type === 'WaitingForUpload') return [model, cmd.none]

      if (model.status.type !== 'Uploading')
        return [{ ...model, hasError: 'Unexpected' }, cmd.none]

      const files = model.files.map((f, i) =>
        i === msg.fileNum
          ? { ...f, progress: Math.min(90, Math.ceil((msg.offset) / f.file.size * 100)) }
          : f
      )

      return [
        { ...model, files },
        encryptAndUploadFileChunk(
          msg.fileNum,
          msg.sessionUri,
          model.status.keys.fileKeys[msg.fileNum],
          model.status.keys.ivs.files[msg.fileNum],
          model.files[msg.fileNum],
          msg.offset,
          msg.uploaded,
          msg.chunkId + 1
        )
      ]
    }
    case 'UploadedFile': {
      if (model.status.type === 'WaitingForUpload') return [model, cmd.none]

      if (model.status.type !== 'Uploading')
        return [{ ...model, hasError: 'Unexpected' }, cmd.none]

      const files = model.files.map((f, i) => i === msg.fileNum ? { ...f, progress: 100 } : f)
      const nextFileNum = msg.fileNum + 1

      if (nextFileNum == model.files.length) {
        return [
          { ...model, files },
          finishUpload(model.linkId)
        ]
      }

      if (model.files[nextFileNum].fullUpload) {
        return [
          { ...model, files },
          fullUpload(
            model.uploadLinks[nextFileNum].link,
            model.uploadLinks[nextFileNum].customTimeHeader,
            model.status.keys.fileKeys[nextFileNum],
            model.status.keys.ivs.files[nextFileNum],
            model.files[nextFileNum].file,
            nextFileNum
          )
        ]
      }

      return [
        { ...model, files },
        initStorageResumableUpload(
          model.uploadLinks[nextFileNum].link,
          model.uploadLinks[nextFileNum].customTimeHeader,
          nextFileNum
        )
      ]
    }
    case 'UploadFinished': {
      if (model.status.type === 'WaitingForUpload') return [model, cmd.none]

      if (model.status.type !== 'Uploading')
        return [{ ...model, hasError: 'Unexpected' }, cmd.none]

      return [
        {
          ...model,
          status: { ...model.status, type: 'Finished' }
        },
        cmd.none
      ]
    }
    case 'FailUploadingFile': {
      if (model.status.type === 'WaitingForUpload') return [model, cmd.none]

      const files = model.files.map(f => ({ ...f, progress: 0, complete: false }))
      return [
        {
          ...model,
          files,
          hasError: 'UploadFailed',
          status: { type: 'WaitingForUpload' }
        },
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
        const files = model.files.filter(file => file.id != msg.msg.id && !file.tooBig)
        return [{
          ...model,
          files,
          totalSize: files.reduce((acc, cur) => acc + (cur.tooBig ? 0 : cur.file.size), 0),
          hasError: false,
        }, cmd.none]
      }

      return [model, cmd.none]
    }
  }
}

const view = (model: Model): Html<Msg> => dispatch => {

  const noFiles = model.files.length === 0
  const uploading =
    model.status.type === 'InitializedUpload'
    || model.status.type === 'GeneratedKeys'
    || model.status.type === 'Uploading'

  const renderTooltip = () => {
    switch (model.hasError) {
      case false: {
        switch (model.status.type) {
          case 'WaitingForUpload': {
            const singleSize = filesize(model.constraints.singleSize)
            const totalSize = filesize(model.constraints.totalSize)
            return HowToTooltip.view()(dispatch)
          }
          case 'Finished': return UploadedTooltip.view()(dispatch)
          case 'InitializedUpload': return UploadingdTooltip.view(() => dispatch({ type: 'CancelUpload' }))(dispatch)
          case 'GeneratedKeys': return UploadingdTooltip.view(() => dispatch({ type: 'CancelUpload' }))(dispatch)
          case 'Uploading': return UploadingdTooltip.view(() => dispatch({ type: 'CancelUpload' }))(dispatch)
        }
      }
      case 'FileTooBig': return FileTooBigTooltip.view(filesize(model.constraints.singleSize))(dispatch)
      case 'TooManyFiles': return TooManyFilesTooltip.view(model.constraints.numOfFiles)(dispatch)
      case 'TotalSizeTooBig': return TotalSizeTooBigTooltip.view(filesize(model.constraints.totalSize))(dispatch)
      case 'UploadFailed': return FailedUploadTooltip.view()(dispatch)
      case 'Unexpected': return UnexpectedErrorTooltip.view()(dispatch)
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
                  if (model.status.type === 'WaitingForUpload')
                    document.querySelector('.main-drop__file-wrap')?.classList.add('drag')
                }}
                onDragLeave={e => {
                  e.preventDefault()
                  if (model.status.type === 'WaitingForUpload')
                    document.querySelector('.main-drop__file-wrap')?.classList.remove('drag')
                }}
                onDrop={e => {
                  e.preventDefault()
                  if (model.status.type === 'WaitingForUpload') {
                    document.querySelector('.main-drop__file-wrap')?.classList.remove('drag')
                    dispatch({ type: 'AddFiles', files: [...e.dataTransfer.files] })
                  }
                }}
              >
                <div className="main-drop__file-wrap-inner">
                  {noFiles &&
                    <div className="main-drop__file-wrap-inner-wrap" onClick={_ => {
                      if (model.status.type === 'WaitingForUpload')
                        document.getElementById('file-pick')?.click()
                    }}>
                      <span className="main-drop__file-msg">Drag & Drop your files here</span>
                      <span className="main-drop__file-icon-mob">+</span>
                      <span className="main-drop__file-msg-mob">Click here to attach files</span>
                    </div>
                  }
                  {!noFiles && model.files.map(file =>
                    FileRow.view(
                      file.id, file.file.name, file.file.size, file.progress, file.complete, file.tooBig, model.status.type !== 'WaitingForUpload')
                      (msg => dispatch({ type: 'FileMsg', msg }))
                  )}
                </div>
              </div>

              <span className="main-drop__browse">
                <span className="or_files">or</span> <a
                  className="main-drop__browse-link"
                  href=""
                  style={{ cursor: model.status.type === 'WaitingForUpload' ? 'pointer' : 'default' }}
                  onClick={e => {
                    e.preventDefault()
                    if (model.status.type === 'WaitingForUpload')
                      document.getElementById('file-pick')?.click()
                  }}>BROWSE
                </a>
              </span>

              <div className={model.status.type === 'WaitingForUpload' && !noFiles ? "btn-wrap" : "btn-wrap disabled"}>
                <input
                  type="submit"
                  className="btn"
                  style={model.status.type === 'WaitingForUpload' && !noFiles ? {} : { pointerEvents: 'none' }}
                  value="send"
                  disabled={model.status.type !== 'WaitingForUpload' || noFiles}
                  onClick={() => dispatch({ type: 'Upload' })}
                />
                <span className={uploading ? "btn-animation sending" : "btn-animation"}
                ></span>
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