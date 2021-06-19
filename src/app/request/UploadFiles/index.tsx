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

import { fromCodec, promiseToCmd } from '../../helpers'
import BlindsendLogo from '../../../images/blindsend.svg'
import * as LegalLinks from '../../legal/LegalLinks'
import * as HowToTooltip from './tooltip/HowTo'
import * as FileTooBigTooltip from './tooltip/FileTooBig'
import * as TooManyFilesTooltip from './tooltip/TooManyFiles'
import * as TotalSizeTooBigTooltip from './tooltip/TotalSizeTooBig'

import * as FileRow from './components/File'

type AddFiles = { type: 'AddFiles', files: File[] }
type Upload = { type: 'Upload' }

type FileMsg = { type: 'FileMsg', msg: FileRow.Msg }

type Msg =
  | AddFiles
  | Upload
  | FileMsg

type Constraints = {
  numOfFiles: number,
  totalSize: number,
  singleSize: number
}

type Model = {
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
  renderFileTooBig: boolean,
  renderTooManyFiles: boolean,
  renderTotalSizeTooBig: boolean,
}

function uuidv4() {
  // @ts-ignore
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

const init: (
  linkId: string,
  reqPublicKey: Uint8Array,
  constraints: Constraints
) => [Model, cmd.Cmd<Msg>] = (linkId, reqPublicKey, constraints) => {

  return [
    {
      files: [],
      totalSize: 0,
      uploading: false,
      linkId,
      reqPublicKey,
      constraints,
      renderFileTooBig: false,
      renderTooManyFiles: false,
      renderTotalSizeTooBig: false
    },
    cmd.none
  ]
}

const removeWarnings = { renderFileTooBig: false, renderTooManyFiles: false, renderTotalSizeTooBig: false }

const update = (msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'AddFiles': {
      if (msg.files.length + model.files.filter(f => !f.tooBig).length > model.constraints.numOfFiles) {
        return [{ ...model, ...removeWarnings, renderTooManyFiles: true }, cmd.none]
      }
      if ((msg.files.length > 1 || model.files.length > 0) && msg.files.reduce((acc, cur) => acc + cur.size, 0) + model.totalSize > model.constraints.totalSize)
        return [{ ...model, ...removeWarnings, renderTotalSizeTooBig: true }, cmd.none]

      let renderTooBig = false
      const newFiles = msg.files.map(file => {
        const tooBig = file.size > model.constraints.singleSize
        if (tooBig) renderTooBig = true

        return { file, id: uuidv4(), progress: 0, complete: false, tooBig }
      })
      const files = [...model.files, ...newFiles]

      return [{
        ...model,
        files,
        totalSize: files.reduce((acc, cur) => acc + (cur.tooBig ? 0 : cur.file.size), 0),
        ...removeWarnings,
        renderFileTooBig: renderTooBig
      }, cmd.none]
    }
    case 'Upload': {
      return [model, cmd.none]
    }

    case 'FileMsg': {
      if (msg.msg.type === 'Remove') {
        const files = model.files.filter(file => file.id != msg.msg.id)
        return [{
          ...model,
          files,
          totalSize: files.reduce((acc, cur) => acc + (cur.tooBig ? 0 : cur.file.size), 0),
          ...removeWarnings
        }, cmd.none]
      }

      return [model, cmd.none]
    }
  }
}

const view = (model: Model): Html<Msg> => dispatch => {

  const noFiles = model.files.length === 0

  const renderTooltip = () => {
    if (model.renderFileTooBig)
      return FileTooBigTooltip.view(filesize(model.constraints.singleSize))(dispatch)
    else if (model.renderTooManyFiles)
      return TooManyFilesTooltip.view(model.constraints.numOfFiles)(dispatch)
    else if (model.renderTotalSizeTooBig)
      return TotalSizeTooBigTooltip.view(filesize(model.constraints.totalSize))(dispatch)
    else
      return HowToTooltip.view()(dispatch)
  }

  return (
    <div className="site-page__row row">

      <div className="site-nav__wrap col-lg-2">
        <div className="site-nav">
          <div className="site-nav__img">
            <img src={BlindsendLogo} alt="" />
          </div>
          <ul id="primary-menu" className="primary-menu">
            <li className="menu-item active complete">
              <span className="menu-item-number"><svg width="21" height="16" viewBox="0 0 21 16" fill="none"
                xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M7.84297 15.5976C7.64741 15.7942 7.38073 15.904 7.10359 15.904C6.82645 15.904 6.55978 15.7942 6.36421 15.5976L0.459629 9.69194C-0.15321 9.07911 -0.15321 8.0856 0.459629 7.4738L1.19901 6.73442C1.81185 6.12159 2.80431 6.12159 3.41715 6.73442L7.10359 10.4209L17.0648 0.459629C17.6777 -0.15321 18.6712 -0.15321 19.283 0.459629L20.0224 1.19901C20.6352 1.81185 20.6352 2.80536 20.0224 3.41715L7.84297 15.5976Z"
                  fill="white" />
              </svg>
              </span>
              <span className="menu-item-title">Pick <br /> Password</span>
            </li>
            <li className="menu-item active complete">
              <span className="menu-item-number"><svg width="21" height="16" viewBox="0 0 21 16" fill="none"
                xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M7.84297 15.5976C7.64741 15.7942 7.38073 15.904 7.10359 15.904C6.82645 15.904 6.55978 15.7942 6.36421 15.5976L0.459629 9.69194C-0.15321 9.07911 -0.15321 8.0856 0.459629 7.4738L1.19901 6.73442C1.81185 6.12159 2.80431 6.12159 3.41715 6.73442L7.10359 10.4209L17.0648 0.459629C17.6777 -0.15321 18.6712 -0.15321 19.283 0.459629L20.0224 1.19901C20.6352 1.81185 20.6352 2.80536 20.0224 3.41715L7.84297 15.5976Z"
                  fill="white" />
              </svg>
              </span>
              <span className="menu-item-title">Exchange <br /> Link</span>
            </li>
            <li className="menu-item active"><span className="menu-item-number">3</span><span className="menu-item-title">Sender
                  <br /> Upload</span></li>
            <li className="menu-item"><span className="menu-item-number">4</span><span className="menu-item-title">Download</span>
            </li>
          </ul>
        </div>
        {LegalLinks.view()(dispatch)}
      </div>

      <div className="site-main__wrap col-lg-7">
        <div className="site-main">
          <div className="site-main__content">
            <div className="main-drop">
              <h2 className="main-drop__title section-title">Drop Files Here</h2>

              <div
                className={noFiles ? "main-drop__file-wrap empty" : "main-drop__file-wrap"}
                onDragOver={e => {
                  e.preventDefault()
                  if (!model.uploading)
                    document.querySelector('.main-drop__file-wrap')?.classList.add('drag')
                }}
                onDragLeave={e => {
                  e.preventDefault()
                  if (!model.uploading)
                    document.querySelector('.main-drop__file-wrap')?.classList.remove('drag')
                }}
                onDrop={e => {
                  e.preventDefault()
                  if (!model.uploading) {
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
                  {!noFiles && model.files.map(file => FileRow.view(file.id, file.file.name, file.file.size, file.progress, file.tooBig)(msg => dispatch({ type: 'FileMsg', msg })))}
                </div>
              </div>

              <span className="main-drop__browse">
                or <a className="main-drop__browse-link" href="" onClick={e => {
                  e.preventDefault()
                  document.getElementById('file-pick')?.click()
                }}>BROWSE</a>
              </span>

              <div className="btn-wrap">
                <input type="submit" className="main-drop__submit btn" value="send" />
                <span className="btn-animation"></span>
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