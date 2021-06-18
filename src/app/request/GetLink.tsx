import * as React from 'react'
import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import * as task from 'fp-ts/lib/Task'
import { cmd, http } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import { perform } from 'elm-ts/lib/Task'
import * as sodium from 'libsodium-wrappers'

import BlindsendLogo from '../../images/blindsend.svg'

import * as PasswordField from '../components/PasswordField'
import * as LegalLinks from '../legal/LegalLinks'

import * as HowToTooltip from './tooltip/HowTo'
import * as WeakPassTooltip from './tooltip/WeakPassword'
import * as StrongPassTooltip from './tooltip/StrongPassword'

type PasswordFieldMsg = { type: 'PasswordFieldMsg', msg: PasswordField.Msg }

type SwitchToSend = { type: 'SwitchToSend' }
type SwitchToReceive = { type: 'SwitchToReceive' }
type GenerateLink = { type: 'GenerateLink' }
type GoPasswordless = { type: 'GoPasswordless' }
type EstimatePass = { type: 'EstimatePass' }

type Msg =
  | PasswordFieldMsg
  | SwitchToSend
  | SwitchToReceive
  | GenerateLink
  | GoPasswordless
  | EstimatePass

type Model = {
  passFieldModel: PasswordField.Model,
  passStrength: {
    estimated: boolean,
    n: number
  }
}

const init: () => [Model, cmd.Cmd<Msg>] = () => {
  const [passFieldModel, passFieldCmd] = PasswordField.init

  return [
    { passFieldModel, passStrength: { estimated: false, n: 0 } },
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
    case 'GoPasswordless': {
      return [model, cmd.none]
    }
    case 'GenerateLink': {
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
              {PasswordField.view(model.passFieldModel)(msg => dispatch({ type: 'PasswordFieldMsg', msg }))}
              <span className="main-password__pless">
                or <a className="main-password__pless-link" href="" onClick={e => {
                  e.preventDefault()
                  dispatch({ type: 'GoPasswordless' })
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