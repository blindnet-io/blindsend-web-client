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
import { promiseToCmd } from './helpers'
import * as MainNavigation from './components/MainNavigation'
import * as Footer from './components/Footer'
import * as LegalLinks from './legal/LegalLinks'
import * as PrivacyPolicy from './legal/PrivacyPolicy'
import * as LegalMentions from './legal/LegalMentions'
import * as TermsAndConditions from './legal/TermsAndCondidions'

import * as GetLink from './request/GetLink'
import * as ExchangeLink from './request/ExchangeLink'

type InitializedLibsodium = { type: 'InitializedLibsodium' }
type GetLinkMsg = { type: 'GetLinkMsg', msg: GetLink.Msg }
type ExchangeLinkMsg = { type: 'ExchangeLinkMsg', msg: ExchangeLink.Msg }

type Msg =
  | InitializedLibsodium
  | GetLinkMsg
  | ExchangeLinkMsg

type InitializedModel =
  | { type: 'Ready', screen: { type: 'GetLink', model: GetLink.Model } }
  | { type: 'Ready', screen: { type: 'ExchangeLink', model: ExchangeLink.Model } }

type Model =
  | { type: 'Loading' }
  | InitializedModel


const init: () => [Model, cmd.Cmd<Msg>] = () =>
  [
    { type: 'Loading' },
    promiseToCmd(sodium.ready, _ => ({ type: 'InitializedLibsodium' })),
  ]

function update(msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] {
  switch (msg.type) {
    case 'InitializedLibsodium': {
      const [getLinkModel, getLinkCmd] = GetLink.init()

      return [
        { type: 'Ready', screen: { type: 'GetLink', model: getLinkModel } },
        cmd.batch([
          cmd.map<GetLink.Msg, Msg>(msg => ({ type: 'GetLinkMsg', msg }))(getLinkCmd)
        ])
      ]
    }
    case 'GetLinkMsg': {
      if (model.type != 'Ready' || model.screen.type != 'GetLink') throw new Error('wrong state')

      if (msg.msg.type === 'Finish') {
        const link = `localhost:9000#${msg.msg.linkId};${msg.msg.publicKey}`
        const [exchangeLinkModel, exchangeLinkCmd] = ExchangeLink.init(link, msg.msg.passwordless)

        return [
          { type: 'Ready', screen: { type: 'ExchangeLink', model: exchangeLinkModel } },
          cmd.map<ExchangeLink.Msg, Msg>(msg => ({ type: 'ExchangeLinkMsg', msg }))(exchangeLinkCmd)
        ]
      }

      const [getLinkModel, getLinkCmd] = GetLink.update(msg.msg, model.screen.model)

      return [
        { ...model, screen: { ...model.screen, model: getLinkModel } },
        cmd.map<GetLink.Msg, Msg>(msg => ({ type: 'GetLinkMsg', msg }))(getLinkCmd)
      ]
    }
    case 'ExchangeLinkMsg': {
      if (model.type != 'Ready' || model.screen.type != 'ExchangeLink') throw new Error('wrong state')

      if (msg.msg.type === 'GoBack') {
        const [getLinkModel, getLinkCmd] = GetLink.init()

        return [
          { type: 'Ready', screen: { type: 'GetLink', model: getLinkModel } },
          cmd.map<GetLink.Msg, Msg>(msg => ({ type: 'GetLinkMsg', msg }))(getLinkCmd)
        ]
      }

      const [exchangeLinkModel, exchangeLinkCmd] = ExchangeLink.update(msg.msg, model.screen.model)

      return [
        { ...model, screen: { ...model.screen, model: exchangeLinkModel } },
        cmd.map<ExchangeLink.Msg, Msg>(msg => ({ type: 'ExchangeLinkMsg', msg }))(exchangeLinkCmd)
      ]
    }
  }
}

function view(model: Model): Html<Msg> {

  return dispatch => {

    function renderInitializing() {
      return <div>Initializing</div>
    }

    function renderRequest(model: InitializedModel) {

      function renderScreen() {
        switch (model.screen.type) {
          case 'GetLink': return GetLink.view(model.screen.model)(msg => dispatch({ type: 'GetLinkMsg', msg }))
          case 'ExchangeLink': return ExchangeLink.view(model.screen.model)(msg => dispatch({ type: 'ExchangeLinkMsg', msg }))
        }
      }

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

            {renderScreen()}

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
      case 'Ready': return renderRequest(model)
    }
  }

}

export { Model, Msg, init, update, view }