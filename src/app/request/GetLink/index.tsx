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

import { endpoint } from '../../globals'

import { fromCodec, promiseToCmd } from '../../helpers'
import * as PasswordField from '../../components/PasswordField'
import * as LeftPanel from '../components/LeftPanel'
import * as HowToTooltip from './tooltip/HowTo'
import * as WeakPassTooltip from './tooltip/WeakPassword'
import * as StrongPassTooltip from './tooltip/StrongPassword'
import * as ServerErrorTooltip from './tooltip/ServerError'

type PasswordFieldMsg = { type: 'PasswordFieldMsg', msg: PasswordField.Msg }
type LeftPanelMsg = { type: 'LeftPanelMsg', msg: LeftPanel.Msg }

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
  publicKey?: Uint8Array,
  seed?: Uint8Array,
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

function getLink(input: { type: 'Passwordless' } | { type: 'Password', salt: Uint8Array }): cmd.Cmd<Msg> {

  type Resp = { link_id: string }

  const schema = t.interface({ link_id: t.string })
  const body = input.type === 'Password' ? { salt: sodium.to_base64(input.salt), passwordless: false } : { passwordless: true }

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
          task.delay(500)(task.fromIO(() => undefined)),
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

      return [model, cmd.none]
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
      // 16 bytes
      const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)

      // Argon2id, 32 bytes
      const seed = sodium.crypto_pwhash(
        sodium.crypto_kx_SEEDBYTES,
        model.passFieldModel.value,
        salt,
        1,
        8192,
        sodium.crypto_pwhash_ALG_DEFAULT
      )

      // X25519, 2x 32 bytes
      const { publicKey } = sodium.crypto_kx_seed_keypair(seed)

      return [
        { ...model, loading: true, publicKey, failed: false },
        getLink({ type: 'Password', salt })
      ]
    }
    case 'GotLink': {
      if (model.publicKey) {
        const encodedKey = sodium.to_base64(model.publicKey)
        return [
          { ...model, loading: false },
          cmd.of<Msg>({ type: 'Finish', linkId: msg.linkId, publicKey: encodedKey, passwordless: false })
        ]
      }
      else
        throw new Error('public key missing from state')
    }
    case 'GenerateLinkPasswordless': {
      // 32 bytes
      const seed = sodium.randombytes_buf(sodium.crypto_kx_SEEDBYTES)
      const { publicKey } = sodium.crypto_kx_seed_keypair(seed)

      return [
        { ...model, loading: true, publicKey, seed, failed: false },
        getLink({ type: 'Passwordless' })
      ]
    }
    case 'GotLinkPasswordless': {
      if (model.seed) {
        const store = keyval.createStore('blindsend', 'seed')

        return [
          { ...model, linkId: msg.linkId },
          promiseToCmd(
            keyval.set(msg.linkId, model.seed, store),
            _ => ({ type: 'SavedKeyPasswordless' })
          )
        ]
      }
      else
        throw new Error('seed missing from state')
    }
    case 'SavedKeyPasswordless': {
      if (model.linkId && model.publicKey) {
        const encodedKey = sodium.to_base64(model.publicKey)
        return [{ ...model, loading: false }, cmd.of<Msg>({ type: 'Finish', linkId: model.linkId, publicKey: encodedKey, passwordless: true })]
      }
      else
        throw new Error('state invalid')
    }
    case 'FailGetLink': {
      return [{ ...model, loading: false, failed: true }, cmd.none]
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
                <div className={model.loading ? "btn-wrap disabled" : "btn-wrap"}>
                  <input
                    type="submit"
                    className="main-password__submit btn"
                    style={model.loading ? { pointerEvents: 'none' } : {}}
                    value="generate Link"
                    onClick={() => dispatch({ type: 'GenerateLink' })}
                    disabled={model.loading}
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