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

import { fromCodec } from './helpers'
import * as GetLink from './request/GetLink'
import * as ExchangeLink from './request/ExchangeLink'
import * as UploadFiles from './request/UploadFiles'
import * as DownloadFiles from './request/DownloadFiles'

type InitializedLibsodium = { type: 'InitializedLibsodium' }
type FailBadLink = { type: 'FailBadLink' }
type FailGetStatus = { type: 'FailGetStatus' }
type GotStatus = { type: 'GotStatus', status: string, uploadConstraints: UploadFiles.Constraints }
type GotMetadata = {
  type: 'GotMetadata', metadata: {
    encMetadata: string, keyHash: string, publicKey: string, salt: string, passwordless: boolean, numFiles: number
  }
}
type FailGetMetadata = { type: 'FailGetMetadata' }

type GetLinkMsg = { type: 'GetLinkMsg', msg: GetLink.Msg }
type ExchangeLinkMsg = { type: 'ExchangeLinkMsg', msg: ExchangeLink.Msg }
type UploadFilesMsg = { type: 'UploadFilesMsg', msg: UploadFiles.Msg }
type DownloadFilesMsg = { type: 'DownloadFilesMsg', msg: DownloadFiles.Msg }

type Msg =
  | InitializedLibsodium
  | FailBadLink
  | FailGetStatus
  | GotStatus
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
  | { type: 'Loading', linkData?: { linkId: string, key: string } }
  | InitializedModel


// function getLinkData(): cmd.Cmd<Msg> {

//   const getLinkId = () => {
//     if (window.location.pathname === '/request' || window.location.pathname === '/request/')
//       return Opt.none
//     else {
//       const linkId = window.location.pathname.substring(9)
//       const pk1 = window.location.hash.substring(1)
//       return Opt.some({ linkId, pk1 })
//     }
//   }

//   return pipe(
//     fromIO(getLinkId),
//     perform(linkData => ({ type: 'GotLinkData', linkData }))
//   )
// }

function getLinkStatus(linkId: string): cmd.Cmd<Msg> {

  type Resp = {
    status: string,
    upload_constraints: {
      num_of_files: number,
      total_size: string,
      single_size: string
    }
  }
  const schema = t.interface({
    status: t.string,
    upload_constraints: t.interface({
      num_of_files: t.number,
      total_size: t.string,
      single_size: t.string
    })
  })
  const req = {
    ...http.get(`http://localhost:9000/link-status/${linkId}`, fromCodec(schema)),
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
        resp => ({
          type: 'GotStatus',
          status: resp.status,
          uploadConstraints: {
            numOfFiles: resp.upload_constraints.num_of_files,
            totalSize: parseInt(resp.upload_constraints.total_size),
            singleSize: parseInt(resp.upload_constraints.single_size)
          }
        })
      )
    )
  )(req)
}

function getMetadata(linkId: string) {
  type Resp = { enc_metadata: string, key_hash: string, public_key: string, salt: string, passwordless: boolean, num_files: number }

  const schema = t.interface({
    enc_metadata: t.string,
    key_hash: t.string,
    public_key: t.string,
    salt: t.string,
    passwordless: t.boolean,
    num_files: t.number
  })

  const req = http.get(`http://localhost:9000/request/get-metadata/${linkId}`, fromCodec(schema))

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        _ => ({ type: 'FailGetMetadata' }),
        resp => ({
          type: 'GotMetadata',
          metadata: { encMetadata: resp.enc_metadata, keyHash: resp.key_hash, publicKey: resp.public_key, salt: resp.salt, passwordless: resp.passwordless, numFiles: resp.num_files }
        })
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

      const [linkIdWithHash, key] = window.location.hash.split(';')
      const linkId = linkIdWithHash.substr(1)

      if (linkId != null && key != null) {
        return [
          { ...model, linkData: { linkId, key } },
          getLinkStatus(linkId)
        ]
      }

      const [getLinkModel, getLinkCmd] = GetLink.init()

      return [
        { type: 'Ready', screen: { type: 'GetLink', model: getLinkModel } },
        cmd.batch([
          cmd.map<GetLink.Msg, Msg>(msg => ({ type: 'GetLinkMsg', msg }))(getLinkCmd)
        ])
      ]
    }
    case 'FailBadLink': {
      // TODO
      return [model, cmd.none]
    }
    case 'FailGetStatus': {
      // TODO
      return [model, cmd.none]
    }
    case 'GotStatus': {
      if (model.type != 'Loading' || model.linkData == undefined)
        throw new Error('unexpected state')

      switch (msg.status) {
        case '1': {
          const [uploadFilesModel, uploadFilesCmd] = UploadFiles.init(model.linkData.linkId, sodium.from_base64(model.linkData.key), msg.uploadConstraints)

          return [
            { type: 'Ready', screen: { type: 'UploadFiles', model: uploadFilesModel } },
            cmd.batch([
              cmd.map<UploadFiles.Msg, Msg>(msg => ({ type: 'UploadFilesMsg', msg }))(uploadFilesCmd)
            ])
          ]
        }
        case '2': {
          return [
            model,
            getMetadata(model.linkData.linkId),
          ]
        }
        default:
          throw new Error('undexpected link status')
      }
    }
    case 'GotMetadata': {
      if (model.type != 'Loading' || model.linkData == undefined)
        throw new Error('unexpected state')

      const [downloadFilesModel, downloadFilesCmd] = DownloadFiles.init(
        model.linkData.linkId,
        sodium.from_base64(model.linkData.key),
        sodium.from_base64(msg.metadata.encMetadata),
        sodium.from_base64(msg.metadata.keyHash),
        sodium.from_base64(msg.metadata.publicKey),
        sodium.from_base64(msg.metadata.salt),
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
        model,
        cmd.none
      ]
    }

    case 'GetLinkMsg': {
      if (model.type != 'Ready' || model.screen.type != 'GetLink') throw new Error('wrong state')

      if (msg.msg.type === 'Finish') {
        const link = `http://localhost:8080#${msg.msg.linkId};${msg.msg.publicKey}`
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

    function renderInitializing() {
      return <div>Initializing</div>
    }

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