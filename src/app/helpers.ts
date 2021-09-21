import * as t from 'io-ts'
import { failure } from 'io-ts/lib/PathReporter'
import { flow } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import { decode } from 'elm-ts'
import { cmd } from 'elm-ts'
import { pipe } from 'fp-ts/lib/function'
import { perform } from 'elm-ts/lib/Task'

export function fromCodec<A>(codec: t.Decoder<unknown, A>): decode.Decoder<A> {
  return flow(
    codec.decode,
    E.mapLeft(errors => failure(errors).join('\n'))
  )
}

export function promiseToCmd<A, M>(promise: Promise<A>, f: (a: A) => M): cmd.Cmd<M> {
  return pipe(
    () => promise,
    perform(f)
  )
}

export function uuidv4() {
  // @ts-ignore
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

export function concat(buffer1: ArrayBuffer, buffer2: ArrayBuffer): ArrayBuffer {
  var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength)
  tmp.set(new Uint8Array(buffer1), 0)
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength)
  return tmp.buffer
}

export function equal(a: Uint8Array, b: Uint8Array) {
  if (a.byteLength !== b.byteLength) return false

  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false
  }

  return true
}

export function b642arr(b64str: string): Uint8Array {
  return Uint8Array.from(atob(b64str), c => c.charCodeAt(0))
}

export function arr2b64(arr: ArrayBuffer | Uint8Array): string {
  return btoa(Array.from(new Uint8Array(arr)).map(val => String.fromCharCode(val)).join(''))
}

export function arr2b64url(byteArray: ArrayBuffer): string {
  return btoa(Array.from(new Uint8Array(byteArray)).map(val => {
    return String.fromCharCode(val)
  }).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/\=/g, '');
}

export function b64url2arr(b64str: string): Uint8Array {
  const unescaped =
    (b64str + '==='.slice((b64str.length + 3) % 4))
      .replace(/-/g, '+')
      .replace(/_/g, '/')

  return Uint8Array.from(atob(unescaped), c => c.charCodeAt(0))
}