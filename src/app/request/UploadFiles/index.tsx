import * as React from 'react'
import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import * as task from 'fp-ts/lib/Task'
import { cmd, http } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import { perform } from 'elm-ts/lib/Task'
import * as sodium from 'libsodium-wrappers'
import * as keyval from 'idb-keyval'
import filesize from 'filesize'

import * as LeftPanel from '../components/LeftPanel'
import { fromCodec, promiseToCmd, uuidv4 } from '../../helpers'
import BlindsendLogo from '../../../images/blindsend.svg'
import * as LegalLinks from '../../legal/LegalLinks'
import * as HowToTooltip from './tooltip/HowTo'
import * as FileTooBigTooltip from './tooltip/FileTooBig'
import * as TooManyFilesTooltip from './tooltip/TooManyFiles'
import * as TotalSizeTooBigTooltip from './tooltip/TotalSizeTooBig'

import * as FileRow from './components/File'

type AddFiles = { type: 'AddFiles', files: File[] }
type Upload = { type: 'Upload' }
type FailStoreMetadata = { type: 'FailStoreMetadata' }
type StoredMetadata = { type: 'StoredMetadata', links: { id: string, link: string }[] }

type LeftPanelMsg = { type: 'LeftPanelMsg', msg: LeftPanel.Msg }
type FileMsg = { type: 'FileMsg', msg: FileRow.Msg }

type Msg =
  | AddFiles
  | Upload
  | FailStoreMetadata
  | StoredMetadata
  | LeftPanelMsg
  | FileMsg

type Constraints = {
  numOfFiles: number,
  totalSize: number,
  singleSize: number
}

type Model = {
  leftPanelModel: LeftPanel.Model,
  files: {
    file: File,
    id: string,
    progress: number,
    complete: boolean,
    tooBig: boolean
  }[],
  totalSize: number,
  uploading: boolean,
  linkId: string,
  reqPublicKey: Uint8Array,
  constraints: Constraints,
  renderError: false | 'FileTooBig' | 'TooManyFiles' | 'TotalSizeTooBig',
  uploadLinks?: { id: string, link: string }[]
}

function concat(arr1: Uint8Array, arr2: Uint8Array): Uint8Array {
  var tmp = new Uint8Array(arr1.byteLength + arr2.byteLength);
  tmp.set(arr1, 0)
  tmp.set(arr2, arr1.byteLength)
  return tmp;
}

function storeMetadata(encryptedMetadata: Uint8Array, fileIds: string[], linkId: string): cmd.Cmd<Msg> {

  type Resp = { upload_links: { id: string, link: string }[] }

  const schema = t.interface({
    upload_links: t.array(t.interface({ id: t.string, link: t.string }))
  })
  const body = { encryptedMetadata: sodium.to_base64(encryptedMetadata), fileIds, linkId }

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

const init: (
  linkId: string,
  reqPublicKey: Uint8Array,
  constraints: Constraints
) => [Model, cmd.Cmd<Msg>] = (linkId, reqPublicKey, constraints) => {

  const [leftPanelModel, leftPanelCmd] = LeftPanel.init(3)

  return [
    {
      files: [],
      leftPanelModel,
      totalSize: 0,
      uploading: false,
      linkId,
      reqPublicKey,
      constraints,
      renderError: false
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

      if (model.uploadLinks) {
        // TODO
        return [
          model,
          cmd.none
        ]
      }

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

      return [
        {
          ...model,
          uploading: true
        },
        storeMetadata(concat(iv, encryptedMetadata), model.files.map(f => f.id), model.linkId)
      ]
    }
    case 'FailStoreMetadata': {
      // TODO
      return [{ ...model, uploading: false }, cmd.none]
    }
    case 'StoredMetadata': {
      console.log(msg)
      return [{ ...model, uploading: false, uploadLinks: msg.links }, cmd.none]
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
      case false: return HowToTooltip.view()(dispatch)
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
                  if (!model.uploading && !model.uploadLinks)
                    document.querySelector('.main-drop__file-wrap')?.classList.add('drag')
                }}
                onDragLeave={e => {
                  e.preventDefault()
                  if (!model.uploading && !model.uploadLinks)
                    document.querySelector('.main-drop__file-wrap')?.classList.remove('drag')
                }}
                onDrop={e => {
                  e.preventDefault()
                  if (!model.uploading && !model.uploadLinks) {
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
                    FileRow.view(file.id, file.file.name, file.file.size, file.progress, file.tooBig, model.uploading || model.uploadLinks != undefined)
                      (msg => dispatch({ type: 'FileMsg', msg }))
                  )}
                </div>
              </div>

              <span className="main-drop__browse">
                or <a className="main-drop__browse-link" href="" onClick={e => {
                  e.preventDefault()
                  document.getElementById('file-pick')?.click()
                }}>BROWSE</a>
              </span>

              <div className={model.uploading || model.files.length === 0 ? "btn-wrap disabled" : "btn-wrap"}>
                <input
                  type="submit"
                  className="btn"
                  style={model.uploading ? { pointerEvents: 'none' } : {}}
                  value="send"
                  disabled={model.uploading || model.files.length === 0}
                  onClick={() => dispatch({ type: 'Upload' })}
                />
                <span className={model.uploading ? "btn-animation sending" : "btn-animation btn"}></span>
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