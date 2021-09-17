import * as React from 'react'
import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import { cmd, http } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'

import { endpoint } from '../globals'

import BlindsendLogo from '../../images/blindsend.svg'
import * as MainNavigation from '../components/MainNavigation'
import * as Footer from '../components/Footer'
import * as LegalLinks from '../components/legal/LegalLinks'
import * as PrivacyPolicy from '../components/legal/PrivacyPolicy'
import * as LegalMentions from '../components/legal/LegalMentions'
import * as TermsAndConditions from '../components/legal/TermsAndCondidions'

import { b642arr, fromCodec } from '../helpers'
import * as GetLink from './GetLink'
import * as ExchangeLink from './ExchangeLink'
import * as UploadFiles from './UploadFiles'
import * as DownloadFiles from './DownloadFiles'

import * as LoadingScreen from './../components/LoadingScreen'
import * as ErrorScreen from '../components/ErrorScreen'

type GotMetadata = {
  type: 'GotMetadata',
  metadata: {
    encMetadata: string,
    seedHash: string,
    publicKey: string,
    passwordless: boolean,
    salt: string,
    wrappedSk: string,
    numFiles: number
  }
}
type FailGetMetadata = { type: 'FailGetMetadata' }

type GetLinkMsg = { type: 'GetLinkMsg', msg: GetLink.Msg }
type ExchangeLinkMsg = { type: 'ExchangeLinkMsg', msg: ExchangeLink.Msg }
type UploadFilesMsg = { type: 'UploadFilesMsg', msg: UploadFiles.Msg }
type DownloadFilesMsg = { type: 'DownloadFilesMsg', msg: DownloadFiles.Msg }

type Msg =
  | GotMetadata
  | FailGetMetadata

  | GetLinkMsg
  | ExchangeLinkMsg
  | UploadFilesMsg
  | DownloadFilesMsg

type InitializedModel =
  | { type: 'Ready', screen: { type: 'GetLink', model: GetLink.Model } }
  | { type: 'Ready', screen: { type: 'ExchangeLink', model: ExchangeLink.Model } }
  | { type: 'Ready', screen: { type: 'UploadFiles', model: UploadFiles.Model } }
  | { type: 'Ready', screen: { type: 'DownloadFiles', model: DownloadFiles.Model } }

type Model =
  | { type: 'Loading', linkId: string, key: string }
  | InitializedModel
  | { type: 'Error' }

const uploadConstraints = {
  numOfFiles: 10,
  totalSize: 4294967296,
  singleSize: 2147483648
}

function getMetadata(linkId: string) {
  type Resp = {
    enc_metadata: string,
    seed_hash: string,
    public_key: string,
    passwordless: boolean,
    salt: string,
    wrapped_sk: string,
    num_files: number
  }

  const schema = t.interface({
    enc_metadata: t.string,
    seed_hash: t.string,
    public_key: t.string,
    passwordless: t.boolean,
    salt: t.string,
    wrapped_sk: t.string,
    num_files: t.number
  })

  const req = http.get(`${endpoint}/metadata/${linkId}`, fromCodec(schema))

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        _ => ({ type: 'FailGetMetadata' }),
        resp => ({
          type: 'GotMetadata',
          metadata: {
            encMetadata: resp.enc_metadata,
            seedHash: resp.seed_hash,
            publicKey: resp.public_key,
            passwordless: resp.passwordless,
            salt: resp.salt,
            wrappedSk: resp.wrapped_sk,
            numFiles: resp.num_files
          }
        })
      )
    )
  )(req)
}

function init(
  stage: string,
  linkId?: string,
  key?: string
): [Model, cmd.Cmd<Msg>] {
  switch (stage) {
    case '0': {
      const [getLinkModel, getLinkCmd] = GetLink.init()

      return [
        { type: 'Ready', screen: { type: 'GetLink', model: getLinkModel } },
        cmd.batch([
          cmd.map<GetLink.Msg, Msg>(msg => ({ type: 'GetLinkMsg', msg }))(getLinkCmd)
        ])
      ]
    }
    case '1': {
      if (key === undefined || linkId === undefined)
        throw new Error('Wrong state')

      const [uploadFilesModel, uploadFilesCmd] = UploadFiles.init(linkId, key, uploadConstraints)

      return [
        { type: 'Ready', screen: { type: 'UploadFiles', model: uploadFilesModel } },
        cmd.batch([
          cmd.map<UploadFiles.Msg, Msg>(msg => ({ type: 'UploadFilesMsg', msg }))(uploadFilesCmd)
        ])
      ]
    }
    case '2': {
      if (key === undefined || linkId === undefined)
        throw new Error('Wrong state')

      return [
        { type: 'Loading', linkId, key },
        getMetadata(linkId),
      ]
    }
    default:
      throw new Error('undexpected link status')
  }
}

function update(msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] {
  switch (msg.type) {
    case 'GotMetadata': {
      if (model.type != 'Loading')
        throw new Error('unexpected state')

      const [downloadFilesModel, downloadFilesCmd] = DownloadFiles.init(
        model.linkId,
        msg.metadata.publicKey,
        b642arr(msg.metadata.wrappedSk),
        b642arr(msg.metadata.encMetadata),
        b642arr(msg.metadata.seedHash),
        b642arr(msg.metadata.salt),
        msg.metadata.passwordless,
        msg.metadata.numFiles
      )

      return [
        { type: 'Ready', screen: { type: 'DownloadFiles', model: downloadFilesModel } },
        cmd.batch([
          cmd.map<DownloadFiles.Msg, Msg>(msg => ({ type: 'DownloadFilesMsg', msg }))(downloadFilesCmd)
        ])
      ]
    }
    case 'FailGetMetadata': {
      return [
        { type: 'Error' },
        cmd.none
      ]
    }

    case 'GetLinkMsg': {
      if (model.type != 'Ready' || model.screen.type != 'GetLink') throw new Error('wrong state')

      if (msg.msg.type === 'Finish') {
        const link = `${window.location.origin}#${msg.msg.linkId};${msg.msg.publicKey}`
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
    case 'UploadFilesMsg': {
      if (model.type != 'Ready' || model.screen.type != 'UploadFiles') throw new Error('wrong state')

      const [uploadFilesModel, uploadFilesCmd] = UploadFiles.update(msg.msg, model.screen.model)

      return [
        { ...model, screen: { ...model.screen, model: uploadFilesModel } },
        cmd.map<UploadFiles.Msg, Msg>(msg => ({ type: 'UploadFilesMsg', msg }))(uploadFilesCmd)
      ]
    }
    case 'DownloadFilesMsg': {
      if (model.type != 'Ready' || model.screen.type != 'DownloadFiles') throw new Error('wrong state')

      const [downloadFilesModel, downloadFilesCmd] = DownloadFiles.update(msg.msg, model.screen.model)

      return [
        { ...model, screen: { ...model.screen, model: downloadFilesModel } },
        cmd.map<DownloadFiles.Msg, Msg>(msg => ({ type: 'DownloadFilesMsg', msg }))(downloadFilesCmd)
      ]
    }
  }
}

function view(model: Model): Html<Msg> {

  return dispatch => {

    function renderRequest(model: InitializedModel) {

      function renderScreen() {
        switch (model.screen.type) {
          case 'GetLink': return GetLink.view(model.screen.model)(msg => dispatch({ type: 'GetLinkMsg', msg }))
          case 'ExchangeLink': return ExchangeLink.view(model.screen.model)(msg => dispatch({ type: 'ExchangeLinkMsg', msg }))
          case 'UploadFiles': return UploadFiles.view(model.screen.model)(msg => dispatch({ type: 'UploadFilesMsg', msg }))
          case 'DownloadFiles': return DownloadFiles.view(model.screen.model)(msg => dispatch({ type: 'DownloadFilesMsg', msg }))
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
                {/* <li className="site-header__nav-item"><a href="#">Create account</a></li>
                <li className="site-header__nav-item"><a href="#">Log-in</a></li> */}
              </ul>
              <div className="site-header__inner">
                <ul className="site-header__nav">
                  {/* <li className="site-header__nav-item"><a href="#">Create account</a></li>
                  <li className="site-header__nav-item"><a href="#">Log-in</a></li> */}
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
      case 'Loading': return LoadingScreen.view()(dispatch)
      case 'Ready': return renderRequest(model)
      case 'Error': return ErrorScreen.view()(dispatch)
    }
  }

}

export { Model, Msg, init, update, view }