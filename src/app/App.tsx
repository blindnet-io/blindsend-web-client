import * as React from 'react'
import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import { of } from 'fp-ts/lib/Task'
import { cmd, http } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import { perform } from 'elm-ts/lib/Task'
import * as sodium from 'libsodium-wrappers'

import BlindsendLogo from '../images/blindsend.svg'

import * as ReceiveFileScreen from './request/GetLink'
import * as MainNavigation from './MainNavigation'
import * as Footer from './components/Footer'
import * as LegalLinks from './legal/LegalLinks'
import * as PrivacyPolicy from './legal/PrivacyPolicy'
import * as LegalMentions from './legal/LegalMentions'
import * as TermsAndConditions from './legal/TermsAndCondidions'

type InitializedLibsodium = { type: 'InitializedLibsodium' }
type ReceiveFileScreenMsg = { type: 'ReceiveFileScreenMsg', msg: ReceiveFileScreen.Msg }

type Msg =
  | InitializedLibsodium
  | ReceiveFileScreenMsg

type Model =
  | { type: 'Loading' }
  | { type: 'Ready', receiveFileScreenModel: ReceiveFileScreen.Model }

function promiseToCmd<A, M>(promise: Promise<A>, f: (a: A) => M): cmd.Cmd<M> {
  return pipe(
    () => promise,
    perform(f)
  )
}

const init: () => [Model, cmd.Cmd<Msg>] = () =>
  [
    { type: 'Loading' },
    promiseToCmd(sodium.ready, _ => ({ type: 'InitializedLibsodium' })),
  ]

function update(msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] {
  switch (msg.type) {
    case 'InitializedLibsodium': {
      const [receiveFileScreenModel, receiveFileScreenCmd] = ReceiveFileScreen.init()

      return [
        { type: 'Ready', receiveFileScreenModel },
        cmd.batch([
          cmd.map<ReceiveFileScreen.Msg, Msg>(msg => ({ type: 'ReceiveFileScreenMsg', msg }))(receiveFileScreenCmd)
        ])
      ]
    }
    case 'ReceiveFileScreenMsg': {
      if (model.type != 'Ready') throw new Error('')

      const [receiveFileScreenModel, receiveFileScreenCmd] = ReceiveFileScreen.update(msg.msg, model.receiveFileScreenModel)

      return [
        { ...model, receiveFileScreenModel },
        cmd.map<ReceiveFileScreen.Msg, Msg>(msg => ({ type: 'ReceiveFileScreenMsg', msg }))(receiveFileScreenCmd)
      ]
    }
  }
}

function view(model: Model): Html<Msg> {

  return dispatch => {

    function renderInitializing() {
      return <div>Initializing</div>
    }

    function renderRequest(model: ReceiveFileScreen.Model) {

      return (
        <div className="site-page">
          <div className="site-page__container container">

            <header className="site-header">
              {MainNavigation.view()(dispatch)}
              <div className="site-header__logo">
                <img src={BlindsendLogo} alt="" />
              </div>
              <ul className="site-header__nav-desktop">
                <li className="site-header__nav-item"><a href="">Create account</a></li>
                <li className="site-header__nav-item"><a href="">Log-in</a></li>
              </ul>
              <div className="site-header__inner">
                <ul className="site-header__nav">
                  <li className="site-header__nav-item"><a href="">Create account</a></li>
                  <li className="site-header__nav-item"><a href="">Log-in</a></li>
                </ul>
                {LegalLinks.view(true)(dispatch)}
              </div>
            </header>

            {ReceiveFileScreen.view(model)(msg => dispatch({ type: 'ReceiveFileScreenMsg', msg }))}

            {Footer.view()(dispatch)}

            {PrivacyPolicy.view()(dispatch)}
            {LegalMentions.view()(dispatch)}
            {TermsAndConditions.view()(dispatch)}

          </div>
        </div>
      )
    }

    switch (model.type) {
      case 'Loading': return renderInitializing()
      case 'Ready': return renderRequest(model.receiveFileScreenModel)
    }
  }

}

export { Model, Msg, init, update, view }