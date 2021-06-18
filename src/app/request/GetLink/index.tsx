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

import { fromCodec, promiseToCmd } from '../../helpers'
import BlindsendLogo from '../../../images/blindsend.svg'
import * as PasswordField from '../../components/PasswordField'
import * as LegalLinks from '../../legal/LegalLinks'
import * as HowToTooltip from './tooltip/HowTo'
import * as WeakPassTooltip from './tooltip/WeakPassword'
import * as StrongPassTooltip from './tooltip/StrongPassword'

type PasswordFieldMsg = { type: 'PasswordFieldMsg', msg: PasswordField.Msg }

type SwitchToSend = { type: 'SwitchToSend' }
type SwitchToReceive = { type: 'SwitchToReceive' }
type GenerateLink = { type: 'GenerateLink' }
type GenerateLinkPasswordless = { type: 'GenerateLinkPasswordless' }
type EstimatePass = { type: 'EstimatePass' }
type FailGetLink = { type: 'FailGetLink' }
type GotLink = { type: 'GotLink', linkId: string }
type GotLinkPasswordless = { type: 'GotLinkPasswordless', linkId: string }
type SavedKeyPasswordless = { type: 'SavedKeyPasswordless' }
type Finish = { type: 'Finish', linkId: string, publicKey: string, passwordless: boolean }

type Msg =
  | PasswordFieldMsg
  | SwitchToSend
  | SwitchToReceive
  | GenerateLink
  | GenerateLinkPasswordless
  | EstimatePass
  | FailGetLink
  | GotLink
  | GotLinkPasswordless
  | SavedKeyPasswordless
  | Finish

type Model = {
  passFieldModel: PasswordField.Model,
  passStrength: {
    estimated: boolean,
    n: number
  },
  loading: boolean,
  publicKey?: Uint8Array,
  seed?: Uint8Array,
  linkId?: string
}

function getLink(salt?: Uint8Array): cmd.Cmd<Msg> {

  type Resp = { link_id: string }

  const schema = t.interface({ link_id: t.string })
  const body = salt ? { salt: sodium.to_base64(salt), passwordless: false } : { passwordless: true }

  const req = {
    ...http.post(`http://localhost:9000/request/get-link`, body, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        _ => ({ type: 'FailGetLink' }),
        resp => ({ type: salt ? 'GotLink' : 'GotLinkPasswordless', linkId: resp.link_id })
      )
    )
  )(req)
}

const init: () => [Model, cmd.Cmd<Msg>] = () => {
  const [passFieldModel, passFieldCmd] = PasswordField.init

  return [
    { passFieldModel, passStrength: { estimated: false, n: 0 }, loading: false },
    cmd.batch([
      cmd.map<PasswordField.Msg, Msg>(msg => ({ type: 'PasswordFieldMsg', msg }))(passFieldCmd),
    ])
  ]
}

const update = (msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] => {
  switch (msg.type) {
    case 'PasswordFieldMsg': {
      const [passFieldModel, passFieldCmd] = PasswordField.update(msg.msg, model.passFieldModel)

      if (msg.msg.type == 'ChangePassword' && !model.passStrength.estimated) {

        const estimate: cmd.Cmd<Msg> = pipe(
          task.delay(2000)(task.fromIO(() => undefined)),
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
    case 'EstimatePass': {
      if (model.passStrength.estimated)
        return [model, cmd.none]
      else if (model.passStrength.n > 1)
        return [{ ...model, passStrength: { estimated: false, n: model.passStrength.n - 1 } }, cmd.none]
      else
        return [{ ...model, passStrength: { estimated: true, n: 0 } }, cmd.none]
    }
    case 'SwitchToReceive': {
      return [model, cmd.none]
    }
    case 'SwitchToSend': {
      return [model, cmd.none]
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

      return [{ ...model, loading: true, publicKey }, getLink(salt)]
    }
    case 'GotLink': {
      if (model.publicKey) {
        const encodedKey = sodium.to_base64(model.publicKey)
        return [{ ...model, loading: false }, cmd.of<Msg>({ type: 'Finish', linkId: msg.linkId, publicKey: encodedKey, passwordless: false })]
      }
      else
        throw new Error('public key missing from state')
    }
    case 'GenerateLinkPasswordless': {
      // 32 bytes
      const seed = sodium.randombytes_buf(sodium.crypto_kx_SEEDBYTES)
      const { publicKey } = sodium.crypto_kx_seed_keypair(seed)

      return [{ ...model, loading: true, publicKey, seed }, getLink()]
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
      // TODO
      return [{ ...model, loading: false }, cmd.none]
    }
    case 'Finish': {
      return [model, cmd.none]
    }
  }
}

const view = (model: Model): Html<Msg> => dispatch => {

  const isStrongPass = model.passFieldModel.value.length > 2

  const renderTooltip = () => {
    if (!model.passStrength.estimated)
      return HowToTooltip.view()(dispatch)
    else if (!isStrongPass)
      return WeakPassTooltip.view()(dispatch)
    else
      return StrongPassTooltip.view()(dispatch)
  }

  return (
    <div className="site-page__row row">

      <div className="site-nav__wrap col-lg-2">
        <div className="site-nav">
          <div className="site-nav__img">
            <img src={BlindsendLogo} alt="" />
          </div>
          <div className="site-tabs__wrap">
            <div className="site-tabs site-tabs--send" onClick={() => dispatch({ type: 'SwitchToSend' })}>send</div>
            <div className="site-tabs site-tabs--recieve active" onClick={() => dispatch({ type: 'SwitchToReceive' })}>receive</div>
          </div>
          <ul id="primary-menu" className="primary-menu">
            <li className="menu-item active"><span className="menu-item-number">1</span><span className="menu-item-title">Pick <br /> Password</span></li>
            <li className="menu-item"><span className="menu-item-number">2</span><span className="menu-item-title">Exchange <br /> Link</span></li>
            <li className="menu-item"><span className="menu-item-number">3</span><span className="menu-item-title">Sender <br /> Upload</span></li>
            <li className="menu-item"><span className="menu-item-number">4</span><span className="menu-item-title">Download</span></li>
          </ul>
        </div>
        {LegalLinks.view()(dispatch)}
      </div>

      <div className="site-main__wrap col-lg-7">
        <div className="site-main">
          <div className="site-main__content">
            <div className="main-password">
              <h2 className="main-password__title section-title">Set Password</h2>
              <div className="main-password__form">
                {PasswordField.view(model.passFieldModel)(msg => dispatch({ type: 'PasswordFieldMsg', msg }))}
                <div className="btn-wrap">
                  <input
                    type="submit"
                    className="main-password__submit btn"
                    value="generate Link"
                    onClick={() => dispatch({ type: 'GenerateLink' })}
                    disabled={model.loading}
                  />
                  <span className={model.loading ? "btn-animation sending" : "btn-animation btn"}></span>
                </div>
              </div>
              <span className="main-password__pless">
                or <a className="main-password__pless-link" href="" onClick={e => {
                  e.preventDefault()
                  dispatch({ type: 'GenerateLinkPasswordless' })
                }}>Go Passwordless</a>
              </span>
            </div>
          </div>
        </div>
      </div>

      {renderTooltip()}

    </div>
  )
}

export { Model, Msg, init, update, view }