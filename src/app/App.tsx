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
import * as Send from './send/Send'

import * as LoadingScreen from './components/LoadingScreen'
import * as ErrorScreen from './components/ErrorScreen'

type InitializedLibsodium = { type: 'InitializedLibsodium' }
type FailBadLink = { type: 'FailBadLink' }
type FailGetStatus = { type: 'FailGetStatus' }
type GotStatus = { type: 'GotStatus', workflow: 'r' | 's', stage: string }

type RequestMsg = { type: 'RequestMsg', msg: Request.Msg }
type SendMsg = { type: 'SendMsg', msg: Send.Msg }

type Msg =
  | InitializedLibsodium
  | FailBadLink
  | FailGetStatus
  | GotStatus

  | RequestMsg
  | SendMsg

type InitializedModel =
  | { type: 'Ready', screen: { type: 'Request', model: Request.Model } }
  | { type: 'Ready', screen: { type: 'Send', model: Send.Model } }

type Model =
  | { type: 'Loading', linkId?: string, seed?: Uint8Array }
  | InitializedModel
  | { type: 'Error' }

function getLinkStatus(linkId: string): cmd.Cmd<Msg> {

  type Resp = {
    workflow: 'r' | 's',
    stage: string
  }
  const schema = t.interface({
    workflow: t.union([t.literal('r'), t.literal('s')]),
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
      const [linkIdWithHash, seed] = window.location.hash.split(';')
      const linkId = linkIdWithHash.substr(1)

      if (linkId != null && seed != null) {
        return [
          { type: 'Loading', linkId, seed: sodium.from_base64(seed) },
          getLinkStatus(linkId)
        ]
      }

      // const [requestModel, requestCmd] = Request.init('0')

      // return [
      //   { type: 'Ready', screen: { type: 'Request', model: requestModel } },
      //   cmd.batch([
      //     cmd.map<Request.Msg, Msg>(msg => ({ type: 'RequestMsg', msg }))(requestCmd)
      //   ])
      // ]
      const [sendModel, sendCmd] = Send.init({ type: '0' })

      return [
        { type: 'Ready', screen: { type: 'Send', model: sendModel } },
        cmd.batch([
          cmd.map<Send.Msg, Msg>(msg => ({ type: 'SendMsg', msg }))(sendCmd)
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
        return [{ type: 'Error' }, cmd.none]

      switch (msg.workflow) {
        case 'r': {
          const [requestModel, requestCmd] = Request.init(msg.stage, model.linkId, model.seed)

          return [
            { type: 'Ready', screen: { type: 'Request', model: requestModel } },
            cmd.batch([
              cmd.map<Request.Msg, Msg>(msg => ({ type: 'RequestMsg', msg }))(requestCmd)
            ])
          ]
        }
        case 's': {
          let sendModel: Send.Model, sendCmd: cmd.Cmd<Send.Msg>

          if (msg.stage === '0')
            [sendModel, sendCmd] = Send.init({ type: '0' })
          else if (msg.stage === '2') {
            const { linkId, seed } = model
            if (!linkId || !seed) {
              return [{ type: 'Error' }, cmd.none]
            }

            [sendModel, sendCmd] = Send.init({ type: '2', linkId, seed })
          }
          else
            return [{ type: 'Error' }, cmd.none]

          return [
            { type: 'Ready', screen: { type: 'Send', model: sendModel } },
            cmd.batch([
              cmd.map<Send.Msg, Msg>(msg => ({ type: 'SendMsg', msg }))(sendCmd)
            ])
          ]
        }
      }
    }
    case 'RequestMsg': {
      if (model.type != 'Ready' || model.screen.type != 'Request')
        return [{ type: 'Error' }, cmd.none]


      if ((
        msg.msg.type === 'GetLinkMsg' || msg.msg.type === 'ExchangeLinkMsg')
        && msg.msg.msg.type === 'LeftPanelMsg'
        && msg.msg.msg.msg.type === 'SwitchToSend'
      ) {
        const [sendModel, sendCmd] = Send.init({ type: '0' })

        return [
          { type: 'Ready', screen: { type: 'Send', model: sendModel } },
          cmd.batch([
            cmd.map<Send.Msg, Msg>(msg => ({ type: 'SendMsg', msg }))(sendCmd)
          ])
        ]
      }

      const [requestModel, requestCmd] = Request.update(msg.msg, model.screen.model)

      return [
        { ...model, screen: { ...model.screen, model: requestModel } },
        cmd.map<Request.Msg, Msg>(msg => ({ type: 'RequestMsg', msg }))(requestCmd)
      ]
    }
    case 'SendMsg': {
      if (model.type != 'Ready' || model.screen.type != 'Send')
        return [{ type: 'Error' }, cmd.none]

      if (msg.msg.type === 'UploadFilesMsg' && msg.msg.msg.type === 'LeftPanelMsg' && msg.msg.msg.msg.type === 'SwitchToReceive') {
        const [requestModel, requestCmd] = Request.init('0')

        return [
          { type: 'Ready', screen: { type: 'Request', model: requestModel } },
          cmd.batch([
            cmd.map<Request.Msg, Msg>(msg => ({ type: 'RequestMsg', msg }))(requestCmd)
          ])
        ]
      }

      const [sendModel, sendCmd] = Send.update(msg.msg, model.screen.model)

      return [
        { ...model, screen: { ...model.screen, model: sendModel } },
        cmd.map<Send.Msg, Msg>(msg => ({ type: 'SendMsg', msg }))(sendCmd)
      ]
    }
  }
}

function view(model: Model): Html<Msg> {

  return dispatch => {

    function renderScreen(model: InitializedModel) {
      switch (model.screen.type) {
        case 'Request': return Request.view(model.screen.model)(msg => dispatch({ type: 'RequestMsg', msg }))
        case 'Send': return Send.view(model.screen.model)(msg => dispatch({ type: 'SendMsg', msg }))
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