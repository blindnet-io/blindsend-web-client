import * as React from 'react'

import { cmd, http } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import * as GetLink from './components/GetLink'
import * as UploadFile from './components/UploadFile'
import * as GetFile from './components/GetFile'
import { pipe } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import { fromIO } from 'fp-ts/lib/Task'
import * as Opt from 'fp-ts/lib/Option'
import * as E from 'fp-ts/lib/Either'
import { perform } from 'elm-ts/lib/Task'
import * as sodium from 'libsodium-wrappers'
import { fromCodec } from '../helpers'
// @ts-ignore
import logo from '../../images/header-logo.png'

const endpoint = (HOST != null) ? `${HOST}/api` : '/api'

type LinkData = { linkId: string, pk1: string }

type InitializedLibsodium = { type: 'InitializedLibsodium' }
type GotLinkData = { type: 'GotLinkData', linkData: Opt.Option<LinkData> }
type GotStatus = { type: 'GotStatus', linkId: string, status: number }
type FailGetStatus = { type: 'FailGetStatus' }
type FailBadLink = { type: 'FailBadLink' }

type GetLinkMsg = { type: 'GetLinkMsg', msg: GetLink.Msg }
type UploadFileMsg = { type: 'UploadFileMsg', msg: UploadFile.Msg }
type GetFileMsg = { type: 'GetFileMsg', msg: GetFile.Msg }

type Msg =
  | InitializedLibsodium
  | GotLinkData
  | GotStatus
  | FailGetStatus
  | FailBadLink
  | GetLinkMsg
  | UploadFileMsg
  | GetFileMsg

type GetLinkModel = { type: 'GetLink', model: GetLink.Model }
type UploadFileModel = { type: 'UploadFile', model: UploadFile.Model }
type GetFileModel = { type: 'GetFile', model: GetFile.Model }

type Initializing = { type: 'Initializing' }
type FetchingLinkStatus = { type: 'FetchingLinkStatus', linkData: LinkData }
type Initialized = { type: 'Initialized', childModel: GetLinkModel | UploadFileModel | GetFileModel }
type PageError = { type: 'PageError', error: Opt.Option<string> }

type Model =
  | Initializing
  | FetchingLinkStatus
  | Initialized
  | PageError

function loadLibsoium(): cmd.Cmd<Msg> {
  return pipe(
    () => sodium.ready,
    perform(_ => ({ type: 'InitializedLibsodium' }))
  )
}

function getLinkId(): cmd.Cmd<Msg> {

  const getLinkId = () => {
    if (window.location.pathname === '/request' || window.location.pathname === '/request/')
      return Opt.none
    else {
      const linkId = window.location.pathname.substring(9)
      const pk1 = window.location.hash.substring(1)
      return Opt.some({ linkId, pk1 })
    }
  }

  return pipe(
    fromIO(getLinkId),
    perform(linkData => ({ type: 'GotLinkData', linkData }))
  )
}

function getLinkStatus(linkId: string): cmd.Cmd<Msg> {

  type Resp = { status: number, link_id: string }
  const schema = t.interface({
    link_id: t.string,
    status: t.number
  })
  const req = {
    ...http.post(`${endpoint}/request/get-status`, { link_id: linkId }, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        e => {
          if (e._tag === 'BadStatus')
            return ({ type: 'FailBadLink' })
          else
            return ({ type: 'FailGetStatus' })
        },
        status => ({ type: 'GotStatus', linkId, status: status.status })
      )
    )
  )(req)
}

const initModel: Model = { type: 'Initializing' }
const init: [Model, cmd.Cmd<Msg>] = [initModel, loadLibsoium()]

const update = (msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'InitializedLibsodium': {
      if (model.type != 'Initializing') throw new Error("Wrong state")
      else return [model, getLinkId()]
    }
    case 'GotLinkData': {
      if (model.type != 'Initializing') throw new Error("Wrong state")

      function initGetLink(): [Model, cmd.Cmd<Msg>] {
        const [getLink, getLinkCmd] = GetLink.init

        return [
          { ...model, type: 'Initialized', childModel: { type: 'GetLink', model: getLink } },
          cmd.map<GetLink.Msg, Msg>(msg => ({ type: 'GetLinkMsg', msg }))(getLinkCmd)
        ]
      }

      return pipe(
        msg.linkData,
        Opt.fold(
          initGetLink,
          linkData => [
            { type: 'FetchingLinkStatus', linkData },
            getLinkStatus(linkData.linkId)
          ]
        )
      )
    }
    case 'GotStatus': {
      if (model.type != 'FetchingLinkStatus') throw new Error("Wrong state")

      function initUploadFile(model: FetchingLinkStatus): [Model, cmd.Cmd<Msg>] {
        try {
          const [uploadFile, uploadFileCmd] = UploadFile.init(model.linkData.linkId, sodium.from_base64(model.linkData.pk1))
          return [
            { ...model, type: 'Initialized', childModel: { type: 'UploadFile', model: uploadFile } },
            cmd.map<UploadFile.Msg, Msg>(msg => ({ type: 'UploadFileMsg', msg }))(uploadFileCmd)
          ]
        } catch {
          return [
            { type: 'PageError', error: Opt.none },
            cmd.none
          ]
        }
      }

      function initGetFile(model: FetchingLinkStatus): [Model, cmd.Cmd<Msg>] {
        try {
          const [getFile, getFileCmd] = GetFile.init(model.linkData.linkId, sodium.from_base64(model.linkData.pk1))

          return [
            { ...model, type: 'Initialized', childModel: { type: 'GetFile', model: getFile } },
            cmd.map<GetFile.Msg, Msg>(msg => ({ type: 'GetFileMsg', msg }))(getFileCmd)
          ]
        } catch {
          return [
            { type: 'PageError', error: Opt.none },
            cmd.none
          ]
        }
      }

      switch (msg.status) {
        case 2:
        case 3:
        case 4:
        case 5: return initUploadFile(model)
        case 6: return initGetFile(model)
        default: return [{ ...model, type: 'PageError', error: Opt.none }, cmd.none]
      }
    }
    case 'FailGetStatus': {
      if (model.type != 'FetchingLinkStatus') throw new Error("Wrong state")
      return [{ ...model, type: 'PageError', error: Opt.none }, cmd.none]
    }
    case 'FailBadLink': {
      if (model.type != 'FetchingLinkStatus') throw new Error("Wrong state")
      return [{ ...model, type: 'PageError', error: Opt.some(`Non-existent link id`) }, cmd.none]
    }
    case 'GetLinkMsg': {
      if (model.type != 'Initialized' || model.childModel.type != 'GetLink') throw new Error("Wrong state")

      const [getLink, getLinkCmd] = GetLink.update(msg.msg, model.childModel.model)
      return [
        { ...model, childModel: { ...model.childModel, model: getLink } },
        cmd.map<GetLink.Msg, Msg>(msg => ({ type: 'GetLinkMsg', msg }))(getLinkCmd)
      ]
    }
    case 'UploadFileMsg': {
      if (model.type != 'Initialized' || model.childModel.type != 'UploadFile') throw new Error("Wrong state")

      const [uploadFile, uploadFileCmd] = UploadFile.update(msg.msg, model.childModel.model)
      return [
        { ...model, childModel: { ...model.childModel, model: uploadFile } },
        cmd.map<UploadFile.Msg, Msg>(msg => ({ type: 'UploadFileMsg', msg }))(uploadFileCmd)
      ]
    }
    case 'GetFileMsg': {
      if (model.type != 'Initialized' || model.childModel.type != 'GetFile') throw new Error("Wrong state")

      const [getFile, getFileCmd] = GetFile.update(msg.msg, model.childModel.model)
      return [
        { ...model, childModel: { ...model.childModel, model: getFile } },
        cmd.map<GetFile.Msg, Msg>(msg => ({ type: 'GetFileMsg', msg }))(getFileCmd)
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
        case 'Initializing':
        case 'FetchingLinkStatus': return renderInitializing()
        case 'Initialized': {
          switch (model.childModel.type) {
            case 'GetLink': return GetLink.view(model.childModel.model)(msg => dispatch({ type: 'GetLinkMsg', msg }))
            case 'UploadFile': return UploadFile.view(model.childModel.model)(msg => dispatch({ type: 'UploadFileMsg', msg }))
            case 'GetFile': return GetFile.view(model.childModel.model)(msg => dispatch({ type: 'GetFileMsg', msg }))
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
          </div>
        </div>
      </div>

    )
  }
}

export { Model, Msg, init, update, view }