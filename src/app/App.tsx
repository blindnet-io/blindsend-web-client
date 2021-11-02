import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import { cmd, http } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'

import { endpoint } from './globals'

import { b642arr } from './helpers'

import { fromCodec } from './helpers'
import * as Request from './request/Request'
import * as Send from './send/Send'

import * as LoadingScreen from './components/LoadingScreen'
import * as ErrorScreen from './components/ErrorScreen'

type FailBadLink = { type: 'FailBadLink' }
type FailGetStatus = { type: 'FailGetStatus' }
type GotStatus = { type: 'GotStatus', status: { workflow: 'ReqFile', stage: string, pk: string } | { workflow: 'SendFile' } }

type RequestMsg = { type: 'RequestMsg', msg: Request.Msg }
type SendMsg = { type: 'SendMsg', msg: Send.Msg }

type Msg =
  | FailBadLink
  | FailGetStatus
  | GotStatus

  | RequestMsg
  | SendMsg

type InitializedModel =
  | { type: 'Ready', screen: { type: 'Request', model: Request.Model } }
  | { type: 'Ready', screen: { type: 'Send', model: Send.Model } }

type Model =
  | { type: 'Loading', linkId?: string, seed?: string }
  | InitializedModel
  | { type: 'Error', reason: 'AppError' | 'ServerError' | 'LinkMalformed' }
  | { type: 'LinkNotFound' }

function getLinkStatus(linkId: string): cmd.Cmd<Msg> {

  type Resp = {
    workflow: 'r',
    stage: string,
    key: string
  } | {
    workflow: 's'
  }
  const schema =
    t.union([
      t.interface({
        workflow: t.literal('r'),
        stage: t.string,
        key: t.string
      }),
      t.interface({
        workflow: t.literal('s'),
      })
    ])

  const req = {
    ...http.get(`${endpoint}/link-status/${linkId}`, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        e => {
          if (e._tag === 'BadUrl')
            return ({ type: 'FailBadLink' })
          else
            return ({ type: 'FailGetStatus' })
        },
        resp => {
          if (resp.workflow === 'r')
            return ({ type: 'GotStatus', status: { workflow: 'ReqFile', stage: resp.stage, pk: resp.key } })
          else
            return ({ type: 'GotStatus', status: { workflow: 'SendFile' } })
        })
    )
  )(req)
}

const init: () => [Model, cmd.Cmd<Msg>] = () => {
  const [linkIdWithHash, seed] = window.location.hash.split(';')
  const linkId = linkIdWithHash.substr(1)

  if (linkId != null && seed != null) {
    return [
      { type: 'Loading', linkId, seed },
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

function update(msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] {
  switch (msg.type) {
    case 'FailBadLink': {
      return [
        { type: 'LinkNotFound' },
        cmd.none
      ]
    }
    case 'FailGetStatus': {
      return [
        { type: 'Error', reason: 'ServerError' },
        cmd.none
      ]
    }
    case 'GotStatus': {
      if (model.type != 'Loading')
        return [{ type: 'Error', reason: 'AppError' }, cmd.none]

      switch (msg.status.workflow) {
        case 'ReqFile': {
          const [requestModel, requestCmd] = Request.init(msg.status.stage, model.linkId, msg.status.pk, model.seed)

          return [
            { type: 'Ready', screen: { type: 'Request', model: requestModel } },
            cmd.batch([
              cmd.map<Request.Msg, Msg>(msg => ({ type: 'RequestMsg', msg }))(requestCmd)
            ])
          ]
        }
        case 'SendFile': {
          const { linkId, seed } = model
          if (!linkId || !seed) {
            return [{ type: 'Error', reason: 'AppError' }, cmd.none]
          }

          let arrSeed
          try {
            arrSeed = b642arr(seed)
          } catch {
            return [{ type: 'Error', reason: 'LinkMalformed' }, cmd.none]
          }

          const [sendModel, sendCmd] = Send.init({ type: '1', linkId, seed: arrSeed })

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
        return [{ type: 'Error', reason: 'AppError' }, cmd.none]


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
        return [{ type: 'Error', reason: 'AppError' }, cmd.none]

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
      case 'Error': return ErrorScreen.view(model.reason)(dispatch)
      case 'LinkNotFound': return ErrorScreen.view('LinkNotFound')(dispatch)
    }
  }

}

export { Model, Msg, init, update, view }