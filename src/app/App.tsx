import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import { cmd, http } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import * as sodium from 'libsodium-wrappers'

import { endpoint } from './globals'

import { promiseToCmd } from './helpers'

import { fromCodec } from './helpers'
import * as Request from './request/Request'

import * as LoadingScreen from './components/LoadingScreen'
import * as ErrorScreen from './components/ErrorScreen'

type InitializedLibsodium = { type: 'InitializedLibsodium' }
type FailBadLink = { type: 'FailBadLink' }
type FailGetStatus = { type: 'FailGetStatus' }
type GotStatus = { type: 'GotStatus', workflow: string, stage: string }

type RequestMsg = { type: 'RequestMsg', msg: Request.Msg }

type Msg =
  | InitializedLibsodium
  | FailBadLink
  | FailGetStatus
  | GotStatus

  | RequestMsg

type InitializedModel =
  | { type: 'Ready', screen: { type: 'Request', model: Request.Model } }

type Model =
  | { type: 'Loading', linkId?: string, key?: Uint8Array }
  | InitializedModel
  | { type: 'Error' }

function getLinkStatus(linkId: string): cmd.Cmd<Msg> {

  type Resp = {
    workflow: string,
    stage: string
  }
  const schema = t.interface({
    workflow: t.string,
    stage: t.string
  })
  const req = {
    ...http.get(`${endpoint}/link-status/${linkId}`, fromCodec(schema)),
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
        resp => ({ type: 'GotStatus', workflow: resp.workflow, stage: resp.stage })
      )
    )
  )(req)
}

const init: () => [Model, cmd.Cmd<Msg>] = () =>
  [
    { type: 'Loading' },
    promiseToCmd(sodium.ready, _ => ({ type: 'InitializedLibsodium' })),
  ]

function update(msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] {
  switch (msg.type) {
    case 'InitializedLibsodium': {
      if (model.type === 'Error') throw new Error('Not possible')

      const [linkIdWithHash, key] = window.location.hash.split(';')
      const linkId = linkIdWithHash.substr(1)

      if (linkId != null && key != null) {
        return [
          { type: 'Loading', linkId, key: sodium.from_base64(key) },
          getLinkStatus(linkId)
        ]
      }

      const [requestModel, requestCmd] = Request.init('0')

      return [
        { type: 'Ready', screen: { type: 'Request', model: requestModel } },
        cmd.batch([
          cmd.map<Request.Msg, Msg>(msg => ({ type: 'RequestMsg', msg }))(requestCmd)
        ])
      ]
    }
    case 'FailBadLink': {
      return [
        { type: 'Error' },
        cmd.none
      ]
    }
    case 'FailGetStatus': {
      return [
        { type: 'Error' },
        cmd.none
      ]
    }
    case 'GotStatus': {
      if (model.type != 'Loading')
        throw new Error('unexpected state')

      switch (msg.workflow) {
        case 'r': {
          const [requestModel, requestCmd] = Request.init(msg.stage, model.linkId, model.key)

          return [
            { type: 'Ready', screen: { type: 'Request', model: requestModel } },
            cmd.batch([
              cmd.map<Request.Msg, Msg>(msg => ({ type: 'RequestMsg', msg }))(requestCmd)
            ])
          ]
        }
        default:
          throw new Error('undexpected link status')
      }
    }
    case 'RequestMsg': {
      if (model.type != 'Ready' || model.screen.type != 'Request') throw new Error('wrong state')

      const [requestModel, requestCmd] = Request.update(msg.msg, model.screen.model)

      return [
        { ...model, screen: { ...model.screen, model: requestModel } },
        cmd.map<Request.Msg, Msg>(msg => ({ type: 'RequestMsg', msg }))(requestCmd)
      ]
    }
  }
}

function view(model: Model): Html<Msg> {

  return dispatch => {

    function renderScreen(model: InitializedModel) {
      switch (model.screen.type) {
        case 'Request': return Request.view(model.screen.model)(msg => dispatch({ type: 'RequestMsg', msg }))
      }
    }

    switch (model.type) {
      case 'Loading': return LoadingScreen.view()(dispatch)
      case 'Ready': return renderScreen(model)
      case 'Error': return ErrorScreen.view()(dispatch)
    }
  }

}

export { Model, Msg, init, update, view }