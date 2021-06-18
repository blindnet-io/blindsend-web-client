import * as t from 'io-ts'
import { failure } from 'io-ts/lib/PathReporter'
import { flow } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import { decode } from 'elm-ts'

export function fromCodec<A>(codec: t.Decoder<unknown, A>): decode.Decoder<A> {
  return flow(
    codec.decode,
    E.mapLeft(errors => failure(errors).join('\n'))
  )
}