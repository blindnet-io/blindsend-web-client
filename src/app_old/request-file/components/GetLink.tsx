import * as React from 'react'
import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import { of } from 'fp-ts/lib/Task'
import { cmd, http } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import { perform } from 'elm-ts/lib/Task'
import * as sodium from 'libsodium-wrappers'
import { fromCodec } from '../../helpers'
import { endpoint } from '../../globals'

type CryptoData = {
  pk: Uint8Array,
  kdfSalt: Uint8Array,
  kdfOps: number,
  kdfMemLimit: number,
}

type InitializedLibsodium = { type: 'InitializedLibsodium' }
type GenerateLink = { type: 'GenerateLink' }
type FailGenerateLink = { type: 'FailGenerateLink' }
type GotLinkId = { type: 'GotLinkId', linkId: string }
type GeneratedKeys = { type: 'GeneratedKeys', cryptoData: CryptoData }
type GotLink = { type: 'GotLink', link: string }
type TypePass = { type: 'TypePass', pass: string }
type CopyLink = { type: 'CopyLink' }

type Msg =
  | InitializedLibsodium
  | GenerateLink
  | FailGenerateLink
  | GotLinkId
  | GeneratedKeys
  | GotLink
  | TypePass
  | CopyLink

type WithPass = { pass: string }

type PageError = { type: 'PageError' }
type Initializing = { type: 'Initializing' }
type GeneratingLinkFailed = { type: 'GeneratingLinkFailed' } & WithPass
type AwaitingUserInputToGenerateLink = { type: 'AwaitingUserInputToGenerateLink' } & WithPass
type SentRequestToGenerateLink = { type: 'SentRequestToGenerateLink' } & WithPass
type GeneratingKeys = { type: 'GeneratingKeys', linkId: string } & WithPass
type SavingKeys = { type: 'SavingKeys', cryptoData: CryptoData } & WithPass
type GeneratedLink = { type: 'GeneratedLink', link: string, copied: boolean } & WithPass

type Model =
  | PageError
  | Initializing
  | AwaitingUserInputToGenerateLink
  | GeneratingLinkFailed
  | SentRequestToGenerateLink
  | GeneratingKeys
  | SavingKeys
  | GeneratedLink

function loadLibsoium(): cmd.Cmd<Msg> {
  return pipe(
    () => sodium.ready,
    perform(_ => ({ type: 'InitializedLibsodium' }))
  )
}

function getLink(): cmd.Cmd<Msg> {

  type Resp = { link_id: string }
  const schema = t.interface({
    link_id: t.string,
  })
  const req = http.get(`${endpoint}/request/init-link-id`, fromCodec(schema))

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        _ => ({ type: 'FailGenerateLink' }),
        resp => ({ type: 'GotLinkId', linkId: resp.link_id })
      )
    )
  )(req)
}

function generateKeys(pass: string): cmd.Cmd<Msg> {

  function generate(): CryptoData {
    const kdfSalt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES) // 16 bytes
    // TODO: to web worker so this can be larger
    const kdfOps = sodium.crypto_pwhash_OPSLIMIT_MIN
    const kdfMemLimit = sodium.crypto_pwhash_MEMLIMIT_MIN
    const keyPairSeed = sodium.crypto_pwhash(
      sodium.crypto_kx_SEEDBYTES,
      pass,
      kdfSalt,
      kdfOps,
      kdfMemLimit,
      sodium.crypto_pwhash_ALG_DEFAULT
    ) // Argon2id, 32 bytes

    const { publicKey: pk } = sodium.crypto_kx_seed_keypair(keyPairSeed) // X25519, 2x 32 bytes

    return { pk, kdfSalt, kdfOps, kdfMemLimit }
  }

  return pipe(
    of(generate()),
    perform(
      cryptoData => ({ type: 'GeneratedKeys', cryptoData })
    )
  )
}

function saveKeys(linkId: string, keys: CryptoData): cmd.Cmd<Msg> {

  const { kdfSalt, kdfOps, kdfMemLimit } = keys
  const body = {
    link_id: linkId,
    kdf_salt: sodium.to_hex(kdfSalt),
    kdf_ops: kdfOps,
    kdf_memory_limit: kdfMemLimit
  }

  type Resp = { link: string }
  const schema = t.interface({
    link: t.string,
  })
  const req = {
    ...http.post(`${endpoint}/request/init-session`, body, fromCodec(schema)),
    headers: { 'Content-Type': 'application/json' }
  }

  return http.send<Resp, Msg>(result =>
    pipe(
      result,
      E.fold<http.HttpError, Resp, Msg>(
        _ => ({ type: 'FailGenerateLink' }),
        res => ({ type: 'GotLink', link: res.link })
      )
    )
  )(req)

}

const initModel: Model = { type: 'Initializing' }

const init: [Model, cmd.Cmd<Msg>] = [initModel, loadLibsoium()]

function update(msg: Msg, model: Model): [Model, cmd.Cmd<Msg>] {
  console.log(msg)
  switch (msg.type) {
    case 'InitializedLibsodium': {
      if (model.type != 'Initializing') throw new Error("Wrong state")
      else return [{ type: 'AwaitingUserInputToGenerateLink', pass: '' }, cmd.none]
    }
    case 'FailGenerateLink': {
      if (model.type != 'SentRequestToGenerateLink' && model.type != 'GeneratingKeys' && model.type != 'SavingKeys') throw new Error("Wrong state")
      return [{ ...model, type: 'GeneratingLinkFailed' }, cmd.none]
    }
    case 'GenerateLink': {
      if (model.type != 'AwaitingUserInputToGenerateLink' && model.type != 'GeneratingLinkFailed' && model.type != 'GeneratedLink') throw new Error("Wrong state")
      else return [{ ...model, type: 'SentRequestToGenerateLink' }, getLink()]
    }
    case 'GotLinkId': {
      if (model.type != 'SentRequestToGenerateLink') throw new Error("Wrong state")
      else return [{ ...model, type: 'GeneratingKeys', linkId: msg.linkId }, generateKeys(model.pass)]
    }
    case 'GeneratedKeys': {
      if (model.type != 'GeneratingKeys') throw new Error("Wrong state")
      else return [{ ...model, type: 'SavingKeys', cryptoData: msg.cryptoData }, saveKeys(model.linkId, msg.cryptoData)]
    }
    case 'GotLink': {
      if (model.type != 'SavingKeys') throw new Error("Wrong state")
      else {
        const fullLink = `${msg.link}#${sodium.to_base64(model.cryptoData.pk)}`
        return [{ ...model, type: 'GeneratedLink', link: fullLink, copied: false }, cmd.none]
      }
    }
    case 'CopyLink': {
      if (model.type != 'GeneratedLink') throw new Error("Wrong state")
      else return [{ ...model, copied: true }, cmd.none]
    }
    case 'TypePass': {
      if ('pass' in model)
        return [{ ...model, pass: msg.pass }, cmd.none]
      else
        return [model, cmd.none]
    }
  }
}

function view(model: Model): Html<Msg> {

  return dispatch => {

    const renderError = () =>
      <div className="alert alert-danger" role="alert" style={{ marginTop: '20px', textAlign: 'center' }}>
        Error, refresh page
      </div>

    const renderInitializing = () =>
      <div style={{ textAlign: 'center', margin: '80px' }}>
        <div className="spinner-grow" role="status" />
      </div>

    const renderGetLinkButton = (disabled: boolean) =>
      <input
        disabled={disabled}
        type="submit"
        className="form-control btn bs-btn"
        value="generate Link"
      />

    const renderPassField = (pass: string, disabled: boolean) =>
      <input
        type="password"
        disabled={disabled}
        value={pass}
        onChange={e => dispatch({ type: 'TypePass', pass: e.target.value })}
        style={{ "border": "1px solid #ced4da" }}
        className="form-control"
        placeholder=""
      />

    const renderCopyButton = (link: string) =>
      <input
        type="button"
        className="form-control btn bs-btn-reverse"
        value="copy to clipboard"
        onClick={_ => {
          const el = document.createElement('textarea')
          el.value = link
          document.body.appendChild(el)
          el.select()
          document.execCommand('copy')
          document.body.removeChild(el)
          dispatch({ type: 'CopyLink' })
        }}
      />

    const renderAll = (pass: string, disabled: boolean, error: boolean, loading: boolean, link?: string, copied?: boolean) =>
      <div>
        <div className="get-file-wrap">
          <div className="row m-0">
            <div className="col-lg-10 offset-lg-1 text-center">
              <p>
                Fill in a password to generate a link.<br />
                Send the link to a friend to upload a file.<br />
                Open the link and type the password to decrypt the file.<br />
              </p>
              <div className="bs-form">
                {error ? <div className="alert alert-danger" role="alert" style={{ marginTop: '20px', textAlign: 'center' }}> Generating link failed, try again. </div> : <div />}
                <form onSubmit={e => { e.preventDefault(); dispatch({ type: 'GenerateLink' }) }}>
                  <div className="form-group">
                    {renderPassField(pass, disabled)}
                  </div>
                  <div className="form-group">
                    {renderGetLinkButton(disabled)}
                  </div>
                  {link != undefined &&
                    <div className="form-group" >
                      {renderCopyButton(link)}
                    </div>
                  }
                </form>
                {loading &&
                  <div style={{ textAlign: 'center', margin: '10px' }}>
                    <div className="spinner-grow" role="status" />
                  </div>
                }
              </div>
              {link != undefined &&
                <div>
                  <div className="Link-generated text-center" >
                    <div className="link" style={{ padding: "10px" }}>
                      <a style={{ wordWrap: 'break-word' }} href={link}>{link}</a>
                    </div>
                  </div>
                  {copied != undefined && copied &&
                    <div className="alert alert-success" role="alert" style={{ marginTop: '20px', textAlign: 'center' }}>
                      Link copied to clipboard
                </div>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      </div>

    function render() {
      switch (model.type) {
        case 'PageError': return renderError()
        case 'Initializing': return renderInitializing()
        case 'GeneratingLinkFailed': return renderAll(model.pass, false, true, false)
        case 'AwaitingUserInputToGenerateLink': return renderAll(model.pass, false, false, false)
        case 'SentRequestToGenerateLink':
        case 'GeneratingKeys':
        case 'SavingKeys': return renderAll(model.pass, true, false, true)
        case 'GeneratedLink': return renderAll(model.pass, false, false, false, model.link, model.copied)
      }
    }

    return render()
  }
}

export { Model, Msg, init, update, view }