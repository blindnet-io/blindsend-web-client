import * as React from 'react'

import { cmd, } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import * as UploadFile from './components/UploadFile'
import * as DownloadFile from './components/DownloadFile'
import { pipe } from 'fp-ts/lib/function'
import { fromIO } from 'fp-ts/lib/Task'
import * as Opt from 'fp-ts/lib/Option'
import { perform } from 'elm-ts/lib/Task'
// @ts-ignore
import logo from '../../images/header-logo.png'

type LinkData = { linkId: string, seed: string }

type GotLinkData = { type: 'GotLinkData', linkData: Opt.Option<LinkData> }

type UploadFileMsg = { type: 'UploadFileMsg', msg: UploadFile.Msg }
type DownloadFileMsg = { type: 'DownloadFileMsg', msg: DownloadFile.Msg }

type Msg =
  | GotLinkData
  | UploadFileMsg
  | DownloadFileMsg

type UploadFileModel = { type: 'UploadFile', model: UploadFile.Model }
type DownloadFileModel = { type: 'DownloadFile', model: DownloadFile.Model }

type Initializing = { type: 'Initializing' }
type Initialized = { type: 'Initialized', childModel: UploadFileModel | DownloadFileModel }
type PageError = { type: 'PageError', error: Opt.Option<string> }

type Model =
  | Initializing
  | Initialized
  | PageError

function getLinkId(): cmd.Cmd<Msg> {

  const getLinkId = () => {
    if (window.location.pathname === '/send' || window.location.pathname === '/send/')
      return Opt.none
    else {
      const linkId = window.location.pathname.substring(6)
      const seed = window.location.hash.substring(1)
      return Opt.some({ linkId, seed })
    }
  }

  return pipe(
    fromIO(getLinkId),
    perform(linkData => ({ type: 'GotLinkData', linkData }))
  )
}

const initModel: Model = { type: 'Initializing' }
const init: [Model, cmd.Cmd<Msg>] = [initModel, getLinkId()]

const update = (msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'GotLinkData': {
      if (model.type != 'Initializing') throw new Error("Wrong state")

      function initUploadFile(): [Model, cmd.Cmd<Msg>] {
        const [uploadFile, uploadFileCmd] = UploadFile.init

        return [
          { ...model, type: 'Initialized', childModel: { type: 'UploadFile', model: uploadFile } },
          cmd.map<UploadFile.Msg, Msg>(msg => ({ type: 'UploadFileMsg', msg }))(uploadFileCmd)
        ]
      }

      function initDownloadFile(linkId: string, seed: string): [Model, cmd.Cmd<Msg>] {
        const [downloadFile, downloadFileCmd] = DownloadFile.init(linkId, seed)

        return [
          { ...model, type: 'Initialized', childModel: { type: 'DownloadFile', model: downloadFile } },
          cmd.map<DownloadFile.Msg, Msg>(msg => ({ type: 'DownloadFileMsg', msg }))(downloadFileCmd)
        ]
      }

      return pipe(
        msg.linkData,
        Opt.fold(
          initUploadFile,
          data => initDownloadFile(data.linkId, data.seed)
        )
      )
    }
    case 'UploadFileMsg': {
      if (model.type != 'Initialized' || model.childModel.type != 'UploadFile') throw new Error("Wrong state")

      const [uploadFile, uploadFileCmd] = UploadFile.update(msg.msg, model.childModel.model)
      return [
        { ...model, childModel: { ...model.childModel, model: uploadFile } },
        cmd.map<UploadFile.Msg, Msg>(msg => ({ type: 'UploadFileMsg', msg }))(uploadFileCmd)
      ]
    }
    case 'DownloadFileMsg': {
      if (model.type != 'Initialized' || model.childModel.type != 'DownloadFile') throw new Error("Wrong state")

      const [downloadFile, downloadFileCmd] = DownloadFile.update(msg.msg, model.childModel.model)
      return [
        { ...model, childModel: { ...model.childModel, model: downloadFile } },
        cmd.map<DownloadFile.Msg, Msg>(msg => ({ type: 'DownloadFileMsg', msg }))(downloadFileCmd)
      ]
    }
  }
}

function view(model: Model): Html<Msg> {
  return dispatch => {

    const renderError = (error: Opt.Option<string>) =>
      <div className="alert alert-danger" role="alert" style={{ marginTop: '20px', textAlign: 'center' }}>
        {pipe(
          error,
          Opt.fold(
            () => "Error, refresh page",
            msg => msg
          )
        )}
      </div>

    const renderInitializing = () =>
      <div>
        <div style={{ textAlign: 'center', margin: '80px' }}>
          <div className="spinner-grow" role="status" />
        </div>
      </div>

    function render() {
      switch (model.type) {
        case 'PageError': return renderError(model.error)
        case 'Initializing': return renderInitializing()
        case 'Initialized': {
          switch (model.childModel.type) {
            case 'UploadFile': return UploadFile.view(model.childModel.model)(msg => dispatch({ type: 'UploadFileMsg', msg }))
            case 'DownloadFile': return DownloadFile.view(model.childModel.model)(msg => dispatch({ type: 'DownloadFileMsg', msg }))
          }
        }
      }
    }

    return (
      <div className="holder">
        <div className="holder-section">
          <div className="container">
            <div className="header-wrap">
              <div className="row">
                <div className="col-lg-10 col-md-6 offset-lg-1 offset-md-3 text-center">
                  <div className="header-logo ">
                    <a href="/"><img src={logo} className="img-fluid" /></a>
                  </div>
                </div>
              </div>
            </div>
            {render()}
            <div style={{
              textAlign: 'center',
              marginTop: '20px'
            }}>{
                model.type === 'Initialized' && model.childModel.type === 'UploadFile' &&
                <a href="/request">Or request a file</a>
              }
            </div>
          </div>
        </div>
      </div>

    )
  }
}

export { Model, Msg, init, update, view }