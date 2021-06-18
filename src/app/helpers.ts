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
