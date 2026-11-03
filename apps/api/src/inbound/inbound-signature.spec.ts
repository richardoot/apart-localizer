import { describe, expect, it } from 'vitest'
import { signInboundPayload, verifyInboundSignature } from './inbound-signature'

const SECRET = 'un-secret-de-test-assez-long-0123456789'
const NOW = Date.parse('2026-11-03T12:00:00.000Z')
const TS = Math.floor(NOW / 1000)

describe('signature du webhook entrant', () => {
  it('signe « horodatage.corps » en HMAC-SHA256', () => {
    const signature = signInboundPayload(SECRET, TS, '{"a":1}')
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/)
    expect(signInboundPayload(SECRET, TS, Buffer.from('{"a":1}'))).toBe(
      signature
    )
  })

  it('accepte une signature juste et récente', () => {
    const body = '{"subject":"x"}'
    expect(
      verifyInboundSignature({
        secret: SECRET,
        timestamp: String(TS),
        signature: signInboundPayload(SECRET, TS, body),
        rawBody: Buffer.from(body),
        now: NOW + 60_000,
      })
    ).toEqual({ ok: true })
  })

  it('refuse une signature absente, fausse, d’un autre corps ou périmée', () => {
    const body = '{"subject":"x"}'
    const good = signInboundPayload(SECRET, TS, body)
    const check = (
      over: Partial<Parameters<typeof verifyInboundSignature>[0]>
    ) =>
      verifyInboundSignature({
        secret: SECRET,
        timestamp: String(TS),
        signature: good,
        rawBody: body,
        now: NOW,
        ...over,
      })
    expect(check({ signature: undefined })).toEqual({
      ok: false,
      reason: 'missing',
    })
    expect(check({ rawBody: undefined })).toEqual({
      ok: false,
      reason: 'missing',
    })
    expect(check({ timestamp: 'demain' })).toEqual({
      ok: false,
      reason: 'stale',
    })
    expect(check({ now: NOW + 301_000 })).toEqual({
      ok: false,
      reason: 'stale',
    })
    expect(check({ rawBody: '{"subject":"y"}' })).toEqual({
      ok: false,
      reason: 'mismatch',
    })
    expect(check({ signature: 'sha256=00' })).toEqual({
      ok: false,
      reason: 'mismatch',
    })
    expect(check({ secret: 'autre' })).toEqual({
      ok: false,
      reason: 'mismatch',
    })
  })
})
