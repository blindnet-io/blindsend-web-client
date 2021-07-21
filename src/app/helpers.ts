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