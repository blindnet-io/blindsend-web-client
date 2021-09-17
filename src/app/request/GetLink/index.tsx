import * as React from 'react'
import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import { Task, delay, fromIO } from 'fp-ts/lib/Task'
import { cmd, http } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import { perform } from 'elm-ts/lib/Task'
import * as keyval from 'idb-keyval'

import { endpoint } from '../../globals'
import { fromCodec, promiseToCmd, arr2b64 } from '../../helpers'

import * as PasswordField from '../../components/PasswordField'
import * as LeftPanel from '../components/LeftPanel'
import * as HowToTooltip from './tooltip/HowTo'
import * as WeakPassTooltip from './tooltip/WeakPassword'
import * as StrongPassTooltip from './tooltip/StrongPassword'
import * as ServerErrorTooltip from './tooltip/ServerError'

type Keys = { salt: Uint8Array, wrappedSk: ArrayBuffer, pk: string }
type KeysPasswordless = { sk: CryptoKey, pk: string }

type PasswordFieldMsg = { type: 'PasswordFieldMsg', msg: PasswordField.Msg }
type LeftPanelMsg = { type: 'LeftPanelMsg', msg: LeftPanel.Msg }

type GeneratedKeysPass = { type: 'GeneratedKeysPass', keys: Keys }
type GeneratedKeysPasswordless = { type: 'GeneratedKeysPasswordless', keys: KeysPasswordless }
type FailedGeneratingKeys = { type: 'FailedGeneratingKeys' }
type GenerateLink = { type: 'GenerateLink' }
type GenerateLinkPasswordless = { type: 'GenerateLinkPasswordless' }
type EstimatePass = { type: 'EstimatePass' }
type FailGetLink = { type: 'FailGetLink' }
type GotLink = { type: 'GotLink', linkId: string }
type GotLinkPasswordless = { type: 'GotLinkPasswordless', linkId: string }
type SavedKeyPasswordless = { type: 'SavedKeyPasswordless' }
type Finish = { type: 'Finish', linkId: string, publicKey: string, passwordless: boolean }
type CanPasswordless = { type: 'CanPasswordless' }
type IndexedDBNotSupported = { type: 'IndexedDBNotSupported' }

type Msg =
  | PasswordFieldMsg
  | LeftPanelMsg
  | GeneratedKeysPass
  | GeneratedKeysPasswordless
  | FailedGeneratingKeys
  | GenerateLink
  | GenerateLinkPasswordless
  | EstimatePass
  | FailGetLink
  | GotLink
  | GotLinkPasswordless
  | SavedKeyPasswordless
  | Finish
  | CanPasswordless
  | IndexedDBNotSupported

type Model = {
  passFieldModel: PasswordField.Model,
  leftPanelModel: LeftPanel.Model,
  passStrength: {
    estimated: boolean,
    n: number
  },
  loading: boolean,
  keys?: Keys,
  keysPasswordless?: KeysPasswordless,
  linkId?: string,
  canPasswordless: boolean,
  failed: boolean
}

function checkIndexedDb(): cmd.Cmd<Msg> {
  const store = keyval.createStore('blindsend-test', 'test')
  const checkStore: () => Promise<Msg> = () =>
    keyval.set('key', 'val', store)
      .then(_ => keyval.get('key', store))
      .then<Msg>(res => {
        if (res === 'val') return { type: 'CanPasswordless' }
        else return { type: 'IndexedDBNotSupported' }
      })
      .catch(_ => ({ type: 'IndexedDBNotSupported' }))

  return pipe(
    checkStore,
    perform(msg => msg)
  )
}

function getLink(input: { type: 'Passwordless' } | { type: 'Password', salt: Uint8Array, wrappedSk: ArrayBuffer }): cmd.Cmd<Msg> {

  type Resp = { link_id: string }

  const schema = t.interface({ link_id: t.string })
  const body = input.type === 'Password'
    ? { salt: arr2b64(input.salt), wrapped_sk: arr2b64(input.wrappedSk), passwordless: false }
    : { passwordless: true }

  const req = {
    ...http.post(`${endpoint}/request/get-link`, body, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        _ => ({ type: 'FailGetLink' }),
        resp => ({ type: input.type === 'Password' ? 'GotLink' : 'GotLinkPasswordless', linkId: resp.link_id })
      )
    )
  )(req)
}

function getKeys(pass: string) {
  const te = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const keys: Task<Msg> = () =>
    crypto.subtle.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveKey"])
      .then(passKey => crypto.subtle.deriveKey({ "name": "PBKDF2", salt: salt, "iterations": 64206, "hash": "SHA-256" }, passKey, { name: "AES-GCM", length: 256 }, false, ['wrapKey']))
      .then(aesKey => crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ['deriveBits'])
        .then(ecdhKey => crypto.subtle.exportKey('jwk', ecdhKey.publicKey)
          .then(pk => crypto.subtle.wrapKey('jwk', ecdhKey.privateKey, aesKey, { name: "AES-GCM", iv: new Uint8Array(new Array(12).fill(0)) })
            .then<Msg>(wrappedSk => ({ type: 'GeneratedKeysPass', keys: { salt, wrappedSk, pk: `${pk.x}.${pk.y}` } }))
          )))
      .catch(_ => ({ type: 'FailedGeneratingKeys' }))

  return pipe(
    keys,
    perform(msg => msg)
  )
}

function getKeysPasswordless() {
  const keys: Task<Msg> = () =>
    crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ['deriveBits'])
      .then(ecdhKey => crypto.subtle.exportKey('jwk', ecdhKey.publicKey)
        .then<Msg>(pk => ({ type: 'GeneratedKeysPasswordless', keys: { sk: ecdhKey.privateKey, pk: `${pk.x}.${pk.y}` } })))
      .catch(_ => ({ type: 'FailedGeneratingKeys' }))

  return pipe(
    keys,
    perform(msg => msg)
  )
}

const init: () => [Model, cmd.Cmd<Msg>] = () => {
  const [passFieldModel, passFieldCmd] = PasswordField.init
  const [leftPanelModel, leftPanelCmd] = LeftPanel.init(1)

  return [
    {
      passFieldModel,
      leftPanelModel,
      passStrength: { estimated: false, n: 0 },
      loading: false,
      canPasswordless: false,
      failed: false
    },
    cmd.batch([
      checkIndexedDb(),
      cmd.map<PasswordField.Msg, Msg>(msg => ({ type: 'PasswordFieldMsg', msg }))(passFieldCmd),
      cmd.map<LeftPanel.Msg, Msg>(msg => ({ type: 'LeftPanelMsg', msg }))(leftPanelCmd),
    ])
  ]
}

const update = (msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'PasswordFieldMsg': {
      const [passFieldModel, passFieldCmd] = PasswordField.update(msg.msg, model.passFieldModel)

      if (msg.msg.type == 'ChangePassword' && !model.passStrength.estimated) {

        const estimate: cmd.Cmd<Msg> = pipe(
          delay(500)(fromIO(() => undefined)),
          perform(
            () => ({ type: 'EstimatePass' })
          )
        )

        return [
          { ...model, passStrength: { estimated: false, n: model.passStrength.n + 1 }, passFieldModel },
          cmd.batch([
            cmd.map<PasswordField.Msg, Msg>(msg => ({ type: 'PasswordFieldMsg', msg }))(passFieldCmd),
            estimate
          ])
        ]
      } else
        return [
          { ...model, passFieldModel },
          cmd.map<PasswordField.Msg, Msg>(msg => ({ type: 'PasswordFieldMsg', msg }))(passFieldCmd)
        ]
    }
    case 'LeftPanelMsg': {
      const [leftPanelModel, leftPanelCmd] = LeftPanel.update(msg.msg, model.leftPanelModel)

      return [
        { ...model, leftPanelModel },
        cmd.map<LeftPanel.Msg, Msg>(msg => ({ type: 'LeftPanelMsg', msg }))(leftPanelCmd)
      ]
    }
    case 'EstimatePass': {
      if (model.passStrength.estimated)
        return [model, cmd.none]
      else if (model.passStrength.n > 1)
        return [{ ...model, passStrength: { estimated: false, n: model.passStrength.n - 1 } }, cmd.none]
      else
        return [{ ...model, passStrength: { estimated: true, n: 0 } }, cmd.none]
    }
    case 'GenerateLink': {
      return [
        { ...model, loading: true, failed: false },
        getKeys(model.passFieldModel.value)
      ]
    }
    case 'GeneratedKeysPass': {
      return [
        { ...model, keys: msg.keys },
        getLink({ type: 'Password', salt: msg.keys.salt, wrappedSk: msg.keys.wrappedSk })
      ]
    }
    case 'GotLink': {
      if (model.keys) {
        return [
          { ...model, loading: false },
          cmd.of<Msg>({ type: 'Finish', linkId: msg.linkId, publicKey: model.keys.pk, passwordless: false })
        ]
      }
      else
        throw new Error('wrong state')
    }
    case 'GenerateLinkPasswordless': {
      return [
        { ...model, loading: true, failed: false },
        getKeysPasswordless()
      ]
    }
    case 'GeneratedKeysPasswordless': {
      return [
        { ...model, keysPasswordless: msg.keys },
        getLink({ type: 'Passwordless' })
      ]
    }
    case 'GotLinkPasswordless': {
      if (!model.keysPasswordless)
        throw new Error('wrong state')

      const store = keyval.createStore('blindsend', 'seed')

      return [
        { ...model, linkId: msg.linkId },
        promiseToCmd(
          keyval.set(msg.linkId, model.keysPasswordless.sk, store),
          _ => ({ type: 'SavedKeyPasswordless' })
        )
      ]
    }
    case 'FailedGeneratingKeys': {
      return [
        { ...model, failed: true },
        cmd.none
      ]
    }
    case 'SavedKeyPasswordless': {
      if (model.linkId && model.keysPasswordless)
        return [
          { ...model, loading: false },
          cmd.of<Msg>({ type: 'Finish', linkId: model.linkId, publicKey: model.keysPasswordless.pk, passwordless: true })
        ]
      else
        throw new Error('state invalid')
    }
    case 'FailGetLink': {
      return [
        { ...model, loading: false, failed: true },
        cmd.none
      ]
    }
    case 'Finish': {
      return [model, cmd.none]
    }
    case 'CanPasswordless': {
      return [
        { ...model, canPasswordless: true },
        cmd.none
      ]
    }
    case 'IndexedDBNotSupported': {
      return [model, cmd.none]
    }
  }
}

const view = (model: Model): Html<Msg> => dispatch => {

  const isStrongPass = model.passFieldModel.value.length > 2

  const renderTooltip = () => {
    if (model.failed)
      return ServerErrorTooltip.view()(dispatch)
    else if (!model.passStrength.estimated)
      return HowToTooltip.view()(dispatch)
    else if (!isStrongPass)
      return WeakPassTooltip.view()(dispatch)
    else
      return StrongPassTooltip.view()(dispatch)
  }

  return (
    <div className="site-page__row row">

      {LeftPanel.view(model.leftPanelModel)(msg => dispatch({ type: 'LeftPanelMsg', msg }))}

      <div className="site-main__wrap col-lg-7">
        <div className="site-main">
          <div className="site-main__content">
            <div className="main-password">
              <h2 className="main-password__title section-title">Set Password</h2>
              <div className="main-password__form">
                {PasswordField.view(model.passFieldModel)(msg => dispatch({ type: 'PasswordFieldMsg', msg }))}
                <div className={model.loading || model.passFieldModel.value.length === 0 ? "btn-wrap disabled" : "btn-wrap"}>
                  <input
                    type="submit"
                    className="main-password__submit btn"
                    value="generate Link"
                    onClick={() => dispatch({ type: 'GenerateLink' })}
                    disabled={model.loading || model.passFieldModel.value.length === 0}
                  />
                  <span className={model.loading ? "btn-animation sending" : "btn-animation"}></span>
                </div>
              </div>
              {model.canPasswordless &&
                <span className="main-password__pless">
                  or <a className="main-password__pless-link" href="" onClick={e => {
                    e.preventDefault()
                    dispatch({ type: 'GenerateLinkPasswordless' })
                  }}>Go Passwordless</a>
                </span>
              }
            </div>
          </div>
        </div>
      </div>

      {renderTooltip()}

    </div>
  )
}

export { Model, Msg, init, update, view }