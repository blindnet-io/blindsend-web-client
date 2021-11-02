import * as React from 'react'
import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import { cmd, http } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'

import { endpoint } from '../globals'
import { fromCodec, b642arr, arr2b64 } from '../helpers'

import * as UploadFiles from './UploadFiles'
import * as DownloadFiles from './DownloadFiles'
import * as ExchangeLink from './ExchangeLink'

import BlindsendLogo from '../../images/blindsend.svg'
import * as LoadingScreen from '../components/LoadingScreen'
import * as ErrorScreen from '../components/ErrorScreen'
import * as MainNavigation from '../components/MainNavigation'
import * as Footer from '../components/Footer'
import * as LegalLinks from '../components/legal/LegalLinks'
import * as PrivacyPolicy from '../components/legal/PrivacyPolicy'
import * as LegalMentions from '../components/legal/LegalMentions'
import * as TermsAndConditions from '../components/legal/TermsAndCondidions'

type GotMetadata = { type: 'GotMetadata', encMetadata: string, seedHash: string, salt: string, passwordless: boolean, numFiles: number }
type FailGetMetadata = { type: 'FailGetMetadata' }

type UploadFilesMsg = { type: 'UploadFilesMsg', msg: UploadFiles.Msg }
type ExchangeLinkMsg = { type: 'ExchangeLinkMsg', msg: ExchangeLink.Msg }
type DownloadFilesMsg = { type: 'DownloadFilesMsg', msg: DownloadFiles.Msg }

type Msg =
  | GotMetadata
  | FailGetMetadata

  | UploadFilesMsg
  | ExchangeLinkMsg
  | DownloadFilesMsg

type InitializedModel =
  | { type: 'Ready', screen: { type: 'UploadFiles', model: UploadFiles.Model } }
  | { type: 'Ready', screen: { type: 'ExchangeLink', model: ExchangeLink.Model } }
  | { type: 'Ready', screen: { type: 'DownloadFiles', model: DownloadFiles.Model } }

type Model =
  | { type: 'Loading', linkId: string, seed: Uint8Array }
  | { type: 'Error', reason: 'AppError' | 'ServerError' | 'LinkMalformed' }
  | InitializedModel

const uploadConstraints = {
  numOfFiles: 10,
  totalSize: 4294967296,
  singleSize: 2147483648
}

function getMetadata(linkId: string) {
  type Resp = { enc_metadata: string, seed_hash: string, salt: string, passwordless: boolean, num_files: number }

  const schema = t.interface({
    enc_metadata: t.string,
    seed_hash: t.string,
    salt: t.string,
    passwordless: t.boolean,
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
          encMetadata: resp.enc_metadata,
          seedHash: resp.seed_hash,
          salt: resp.salt,
          passwordless: resp.passwordless,
          numFiles: resp.num_files
        })
      )
    )
  )(req)
}

function init(
  stage:
    | { type: '0' }
    | { type: '1', linkId: string, seed: Uint8Array }
): [Model, cmd.Cmd<Msg>] {
  switch (stage.type) {
    case '0': {
      const [uploadFilesModel, uploadFilesCmd] = UploadFiles.init(uploadConstraints)

      return [
        { type: 'Ready', screen: { type: 'UploadFiles', model: uploadFilesModel } },
        cmd.batch([
          cmd.map<UploadFiles.Msg, Msg>(msg => ({ type: 'UploadFilesMsg', msg }))(uploadFilesCmd)
        ])
      ]
    }
    case '1': {
      const { linkId, seed } = stage
      return [
        { type: 'Loading', linkId, seed },
        getMetadata(linkId!)
      ]
    }
  }
}

function update(msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] {
  switch (msg.type) {
    case 'GotMetadata': {
      if (model.type != 'Loading')
        return [{ type: 'Error', reason: 'AppError' }, cmd.none]

      const [downloadFilesModel, downloadFilesCmd] = DownloadFiles.init(
        model.linkId,
        model.seed,
        b642arr(msg.encMetadata),
        b642arr(msg.seedHash),
        b642arr(msg.salt),
        msg.passwordless,
        msg.numFiles
      )

      return [
        { type: 'Ready', screen: { type: 'DownloadFiles', model: downloadFilesModel } },
        cmd.map<DownloadFiles.Msg, Msg>(msg => ({ type: 'DownloadFilesMsg', msg }))(downloadFilesCmd)
      ]
    }
    case 'FailGetMetadata': {
      return [
        { type: 'Error', reason: 'ServerError' },
        cmd.none
      ]
    }

    case 'UploadFilesMsg': {
      if (model.type != 'Ready' || model.screen.type != 'UploadFiles')
        return [{ type: 'Error', reason: 'AppError' }, cmd.none]

      if (msg.msg.type === 'UploadFinished') {
        if (model.screen.model.status.type !== 'Uploading')
          return [{ type: 'Error', reason: 'ServerError' }, cmd.none]

        const { linkId, seed } = model.screen.model.status

        const link = `${window.location.origin}#${linkId};${arr2b64(seed)}`
        const [exchangeLinkModel, exchangeLinkCmd] = ExchangeLink.init(link)

        return [
          { type: 'Ready', screen: { type: 'ExchangeLink', model: exchangeLinkModel } },
          cmd.map<ExchangeLink.Msg, Msg>(msg => ({ type: 'ExchangeLinkMsg', msg }))(exchangeLinkCmd)
        ]
      }

      const [uploadFilesModel, uploadFilesCmd] = UploadFiles.update(msg.msg, model.screen.model)

      return [
        { ...model, screen: { ...model.screen, model: uploadFilesModel } },
        cmd.map<UploadFiles.Msg, Msg>(msg => ({ type: 'UploadFilesMsg', msg }))(uploadFilesCmd)
      ]
    }
    case 'ExchangeLinkMsg': {
      if (model.type != 'Ready' || model.screen.type != 'ExchangeLink')
        return [{ type: 'Error', reason: 'AppError' }, cmd.none]

      const [exchangeLinkModel, exchangeLinkCmd] = ExchangeLink.update(msg.msg, model.screen.model)

      return [
        { ...model, screen: { ...model.screen, model: exchangeLinkModel } },
        cmd.map<ExchangeLink.Msg, Msg>(msg => ({ type: 'ExchangeLinkMsg', msg }))(exchangeLinkCmd)
      ]
    }
    case 'DownloadFilesMsg': {
      if (model.type != 'Ready' || model.screen.type != 'DownloadFiles')
        return [{ type: 'Error', reason: 'AppError' }, cmd.none]

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
          case 'UploadFiles': return UploadFiles.view(model.screen.model)(msg => dispatch({ type: 'UploadFilesMsg', msg }))
          case 'ExchangeLink': return ExchangeLink.view(model.screen.model)(msg => dispatch({ type: 'ExchangeLinkMsg', msg }))
          case 'DownloadFiles': return DownloadFiles.view(model.screen.model)(msg => dispatch({ type: 'DownloadFilesMsg', msg }))
        }
      }

      return (
        <div className="site-page">
          <div className="site-page__container container">

            <header className="site-header">
              {MainNavigation.view()(dispatch)}
              <div className="site-header__logo">
                <a href="/" style={{ 'borderBottom': 'none' }}><img src={BlindsendLogo} alt="" /></a>
              </div>
              <ul className="site-header__nav-desktop">
                {/* <li className="site-header__nav-item"><a href="#">Create account</a></li>
                <li className="site-header__nav-item"><a href="#">Log-in</a></li> */}
              </ul>
              <div className="site-header__inner hidden">
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
      case 'Error': return ErrorScreen.view(model.reason)(dispatch)
    }
  }

}

export { Model, Msg, init, update, view }