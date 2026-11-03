import { createECDH } from 'node:crypto'

/**
 * Une paire de clés VAPID (web push) pour la pile locale, au format de
 * `web-push generate-vapid-keys` : point public P-256 non compressé
 * (65 octets) et scalaire privé (32 octets), en base64url sans remplissage.
 * Générée une fois, si `apps/api/.env` n'en a pas ; jamais commitée.
 */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const priv = ecdh.getPrivateKey()
  const padded = Buffer.concat([
    Buffer.alloc(Math.max(0, 32 - priv.length)),
    priv,
  ])
  return {
    publicKey: ecdh.getPublicKey().toString('base64url'),
    privateKey: padded.toString('base64url'),
  }
}
