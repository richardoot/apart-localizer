import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * La signature du webhook d'e-mails entrants : HMAC-SHA256, avec le secret
 * `INBOUND_EMAIL_SECRET`, de `<horodatage>.<corps brut>` ; l'horodatage
 * (secondes Unix) part dans `X-Apart-Timestamp`, la signature dans
 * `X-Apart-Signature: sha256=<hex>`. Cinq minutes de tolérance contre le
 * rejeu. L'adaptateur du service d'e-mails entrants signe ; l'API vérifie.
 */
export const SIGNATURE_HEADER = 'x-apart-signature'
export const TIMESTAMP_HEADER = 'x-apart-timestamp'
export const SIGNATURE_TOLERANCE_SECONDS = 300

export function signInboundPayload(
  secret: string,
  timestamp: number,
  rawBody: string | Buffer
): string {
  const hmac = createHmac('sha256', secret)
  hmac.update(`${timestamp}.`)
  hmac.update(rawBody)
  return `sha256=${hmac.digest('hex')}`
}

export type SignatureCheck =
  { ok: true } | { ok: false; reason: 'missing' | 'stale' | 'mismatch' }

export function verifyInboundSignature(input: {
  secret: string
  timestamp: string | undefined
  signature: string | undefined
  rawBody: string | Buffer | undefined
  now?: number
}): SignatureCheck {
  const { secret, timestamp, signature, rawBody } = input
  if (!timestamp || !signature || rawBody === undefined) {
    return { ok: false, reason: 'missing' }
  }
  const seconds = Number(timestamp)
  const now = Math.floor((input.now ?? Date.now()) / 1000)
  if (
    !Number.isInteger(seconds) ||
    Math.abs(now - seconds) > SIGNATURE_TOLERANCE_SECONDS
  ) {
    return { ok: false, reason: 'stale' }
  }
  const expected = Buffer.from(signInboundPayload(secret, seconds, rawBody))
  const given = Buffer.from(signature.trim())
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: 'mismatch' }
  }
  return { ok: true }
}
