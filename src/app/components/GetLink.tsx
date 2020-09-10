import * as React from 'react'
import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import { of } from 'fp-ts/lib/Task'
import { cmd, http } from 'elm-ts'
import { Html } from 'elm-ts/lib/React'
import { perform } from 'elm-ts/lib/Task'
import * as sodium from 'libsodium-wrappers'
import { fromCodec } from '../helpers'
import { endpoint } from '../globals'

type RequesterKeys = {
  pk: Uint8Array,
  skEncryptionNonce: Uint8Array,
  encryptedSk: Uint8Array,
  kdfSalt: Uint8Array,
  kdfOps: number,
  kdfMemLimit: number,
  skEncryptionKeyHash: Uint8Array
}

type InitializedLibsodium = { type: 'InitializedLibsodium' }
type GenerateLink = { type: 'GenerateLink' }
type FailGenerateLink = { type: 'FailGenerateLink' }
type GotLinkId = { type: 'GotLinkId', linkId: string }
type GeneratedKeys = { type: 'GeneratedKeys', keys: RequesterKeys }
type GotLink = { type: 'GotLink', link: string }
type TypePass = { type: 'TypePass', pass: string }

type Msg =
  | InitializedLibsodium
  | GenerateLink
  | FailGenerateLink
  | GotLinkId
  | GeneratedKeys
  | GotLink
  | TypePass

type WithPass = { pass: string }

type PageError = { type: 'PageError' }
type Initializing = { type: 'Initializing' }
type GeneratingLinkFailed = { type: 'GeneratingLinkFailed' } & WithPass
type AwaitingUserInputToGenerateLink = { type: 'AwaitingUserInputToGenerateLink' } & WithPass
type SentRequestToGenerateLink = { type: 'SentRequestToGenerateLink' } & WithPass
type GeneratingKeys = { type: 'GeneratingKeys', linkId: string } & WithPass
type SavingKeys = { type: 'SavingKeys' } & WithPass
type Finished = { type: 'Finished', link: string } & WithPass

type Model =
  | PageError
  | Initializing
  | AwaitingUserInputToGenerateLink
  | GeneratingLinkFailed
  | SentRequestToGenerateLink
  | GeneratingKeys
  | SavingKeys
  | Finished

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
  const req = http.get(`${endpoint}/get-link`, fromCodec(schema))

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

  function generate(): RequesterKeys {
    const { publicKey: pk, privateKey: sk } = sodium.crypto_kx_keypair() // X25519, 2x 32 bytes
    const kdfSalt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES) // 16 bytes
    const kdfOps = sodium.crypto_pwhash_OPSLIMIT_MIN
    const kdfMemLimit = sodium.crypto_pwhash_MEMLIMIT_MIN
    const skEncryptionKey = sodium.crypto_pwhash(
      sodium.crypto_secretbox_KEYBYTES,
      pass,
      kdfSalt,
      kdfOps,
      kdfMemLimit,
      sodium.crypto_pwhash_ALG_DEFAULT
    ) // Argon2id, 32 bytes
    const skEncryptionKeyHash = sodium.crypto_generichash(32, skEncryptionKey) // BLAKE2b

    const skEncryptionNonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES) // 24 bytes
    const encryptedSk = sodium.crypto_secretbox_easy(sk, skEncryptionNonce, skEncryptionKey) // XSalsa20-Poly1305

    return { pk, skEncryptionNonce, encryptedSk, kdfSalt, kdfOps, kdfMemLimit, skEncryptionKeyHash }
  }

  return pipe(
    of(generate()),
    perform(
      keys => ({ type: 'GeneratedKeys', keys })
    )
  )
}

function saveKeys(linkId: string, keys: RequesterKeys): cmd.Cmd<Msg> {

  const { pk, skEncryptionNonce, encryptedSk, kdfSalt, kdfOps, kdfMemLimit, skEncryptionKeyHash } = keys
  const body = {
    link_id: linkId,
    public_key: sodium.to_hex(pk),
    secret_key_encryption_nonce: sodium.to_hex(skEncryptionNonce),
    encrypted_secret_key: sodium.to_hex(encryptedSk),
    kdf_salt: sodium.to_hex(kdfSalt),
    kdf_ops: kdfOps,
    kdf_memory_limit: kdfMemLimit,
    key_hash: sodium.to_hex(skEncryptionKeyHash),
  }

  type Resp = { link: string }
  const schema = t.interface({
    link: t.string,
  })
  const req = {
    ...http.post(`${endpoint}/begin-hs`, body, fromCodec(schema)),
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
      if (model.type != 'AwaitingUserInputToGenerateLink' && model.type != 'GeneratingLinkFailed' && model.type != 'Finished') throw new Error("Wrong state")
      else return [{ ...model, type: 'SentRequestToGenerateLink' }, getLink()]
    }
    case 'GotLinkId': {
      if (model.type != 'SentRequestToGenerateLink') throw new Error("Wrong state")
      else return [{ ...model, type: 'GeneratingKeys', linkId: msg.linkId }, generateKeys(model.pass)]
    }
    case 'GeneratedKeys': {
      if (model.type != 'GeneratingKeys') throw new Error("Wrong state")
      else return [{ ...model, type: 'SavingKeys' }, saveKeys(model.linkId, msg.keys)]
    }
    case 'GotLink': {
      if (model.type != 'SavingKeys') throw new Error("Wrong state")
      else return [{ ...model, type: 'Finished', link: msg.link }, cmd.none]
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
      <div className="alert alert-danger" role="alert" style={{ marginTop: '20px' }}>
        Error, refresh page
      </div>

    const renderInitializing = () =>
      <div style={{ textAlign: 'center', margin: '80px' }}>
        <div className="spinner-grow" role="status" />
      </div>

    const renderDescription =
      <div className="row">
        <div className="col-2" />
        <div className="col-8" style={{ textAlign: 'center', marginTop: '40px' }}>
          <div>Fill in a password to generate a link.</div>
          <div>Send the link to a friend to upload a file.</div>
          <div>Open the link and type the password to decrypt the file.</div>
        </div>
        <div className="col-2" />
      </div>

    const renderButton = (disabled?: true) =>
      <div style={{ textAlign: "center", margin: '10px' }}>
        <button
          disabled={disabled || false}
          type="button"
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={_ => dispatch({ type: 'GenerateLink' })}
        >
          Generate link
        </button>
      </div>

    const renderPassField = (pass: string, disabled?: true) =>
      <div style={{ textAlign: "center", padding: '10px' }}>
        <input
          type='password'
          disabled={disabled || false}
          value={pass}
          style={{ width: '100%' }}
          onChange={e => dispatch({ type: 'TypePass', pass: e.target.value })}
        />
      </div>

    const renderAll = (pass: string, disabled?: true, error?: true, loading?: true) =>
      <div>
        {renderDescription}
        {error ?
          <div className="alert alert-danger" role="alert" style={{ marginTop: '20px' }}>
            Generating link failed, try again.
          </div> : <div />
        }
        <div style={{ marginTop: '20px' }} className="row">
          <div className="col-4" />
          <div className="col-4">
            {renderPassField(pass, disabled)}
            {renderButton(disabled)}
          </div>
          <div className="col-4" />
        </div>
        {loading ?
          <div style={{ textAlign: 'center', margin: '10px' }}>
            <div className="spinner-grow" role="status" />
          </div> : <div />}
      </div>

    const renderAwaitingUserInput = (pass: string) => renderAll(pass)

    const renderAwaitingUserInputWithError = (pass: string) => renderAll(pass, undefined, true)

    const renderLinkGeneration = (pass: string) => renderAll(pass, true, undefined, true)

    function renderLink(pass: string, link: string) {
      return (
        <div>
          {renderAll(pass)}

          <div style={{ textAlign: 'center', marginTop: '20px' }} >
            <div>Link generated.</div>
            <div>Click to copy to clipboard.</div>
            <div style={{ marginTop: '10px' }}>
              <a href={link} onClick={e => {
                e.preventDefault()
                const el = document.createElement('textarea')
                el.value = link
                document.body.appendChild(el)
                el.select()
                document.execCommand('copy')
                document.body.removeChild(el)

              }}>{link}</a>
            </div>
          </div>
        </div>
      )
    }

    function render() {
      switch (model.type) {
        case 'PageError': return renderError()
        case 'Initializing': return renderInitializing()
        case 'GeneratingLinkFailed': return renderAwaitingUserInputWithError(model.pass)
        case 'AwaitingUserInputToGenerateLink': return renderAwaitingUserInput(model.pass)
        case 'SentRequestToGenerateLink':
        case 'GeneratingKeys':
        case 'SavingKeys': return renderLinkGeneration(model.pass)
        case 'Finished': return renderLink(model.pass, model.link)
      }
    }

    return render()
  }
}

export { Model, Msg, init, update, view }