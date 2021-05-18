import * as React from 'react'

import { cmd, } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import * as SendFile from './send-file/SendFile'
import * as RequestFile from './request-file/RequestFile'
import { pipe } from 'fp-ts/lib/function'
import * as Opt from 'fp-ts/lib/Option'
// @ts-ignore
import logo from '../images/header-logo.png'

type SendFileMsg = { type: 'SendFileMsg', msg: SendFile.Msg }
type RequestFileMsg = { type: 'RequestFileMsg', msg: RequestFile.Msg }

type Msg =
  | SendFileMsg
  | RequestFileMsg

type SendFileModel = { type: 'SendFile', model: SendFile.Model }
type RequestFileModel = { type: 'RequestFile', model: RequestFile.Model }

type Router =
  | { route: 'send', model: SendFileModel }
  | { route: 'request', model: RequestFileModel }

type PageError = { type: 'PageError', error: Opt.Option<string> }
type Initializing = { type: 'Initializing' }
type Initialized = { type: 'Initialized', router: Router }

type Model =
  | PageError
  | Initializing
  | Initialized

function init(): [Model, cmd.Cmd<Msg>] {
  const loc = window.location.pathname.split("/")

  switch (loc[1]) {
    case 'send': {
      const [sendFile, sendFileCmd] = SendFile.init

      return [
        { type: 'Initialized', router: { route: 'send', model: { type: 'SendFile', model: sendFile } } },
        cmd.map<SendFile.Msg, Msg>(msg => ({ type: 'SendFileMsg', msg }))(sendFileCmd)
      ]
    }
    case 'request': {
      const [requestFile, requestFileCmd] = RequestFile.init

      return [
        { type: 'Initialized', router: { route: 'request', model: { type: 'RequestFile', model: requestFile } } },
        cmd.map<RequestFile.Msg, Msg>(msg => ({ type: 'RequestFileMsg', msg }))(requestFileCmd)
      ]
    }

    default: return [
      { type: 'PageError', error: Opt.some('Unknown route') },
      cmd.none
    ]
  }
}

const update = (msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'SendFileMsg': {
      if (model.type != 'Initialized' || model.router.route != 'send') throw new Error("Wrong state")

      const [sendFile, sendFileCmd] = SendFile.update(msg.msg, model.router.model.model)
      return [
        { ...model, router: { route: 'send', model: { ...model.router.model, model: sendFile } } },
        cmd.map<SendFile.Msg, Msg>(msg => ({ type: 'SendFileMsg', msg }))(sendFileCmd)
      ]
    }
    case 'RequestFileMsg': {
      if (model.type != 'Initialized' || model.router.route != 'request') throw new Error("Wrong state")

      const [requestFile, requestFileCmd] = RequestFile.update(msg.msg, model.router.model.model)
      return [
        { ...model, router: { route: 'request', model: { ...model.router.model, model: requestFile } } },
        cmd.map<RequestFile.Msg, Msg>(msg => ({ type: 'RequestFileMsg', msg }))(requestFileCmd)
      ]
    }
  }
}

function view(model: Model): Html<Msg> {
  return dispatch => {

    const renderError = (error: Opt.Option<string>) =>
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
            <div className="alert alert-danger" role="alert" style={{ marginTop: '20px', textAlign: 'center' }
            }>
              {
                pipe(
                  error,
                  Opt.fold(
                    () => "Error, refresh page",
                    msg => msg
                  )
                )
              }
            </div>
          </div>
        </div>
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

          switch (model.router.route) {
            case 'send': return SendFile.view(model.router.model.model)(msg => dispatch({ type: 'SendFileMsg', msg }))
            case 'request': return RequestFile.view(model.router.model.model)(msg => dispatch({ type: 'RequestFileMsg', msg }))
          }
        }
      }
    }

    return render()
  }
}

export { init, update, view }