import { describe, expect, it, vi } from 'vitest'
import {
  DisabledEmailSender,
  HttpEmailSender,
  createEmailSender,
} from './email-sender'
import { PushDeliveryError, createPushSender, vapidConfig } from './push-sender'

const VAPID = {
  publicKey: 'BPublicKey0123456789abcdef',
  privateKey: 'PrivateKey0123456789abcdef',
  subject: 'mailto:test@exemple.invalid',
}

describe('web push', () => {
  it('lit les clés VAPID de l’environnement, toutes ou rien', () => {
    expect(
      vapidConfig({
        VAPID_PUBLIC_KEY: VAPID.publicKey,
        VAPID_PRIVATE_KEY: VAPID.privateKey,
        VAPID_SUBJECT: VAPID.subject,
      })
    ).toEqual(VAPID)
    expect(vapidConfig({ VAPID_PUBLIC_KEY: VAPID.publicKey })).toBeNull()
    expect(createPushSender(null)).toBeNull()
  })

  it('envoie avec les détails VAPID à chaque appel et traduit les refus', async () => {
    const send = vi.fn().mockResolvedValue({ statusCode: 201 })
    const sender = createPushSender(VAPID, send)
    expect(sender?.publicKey).toBe(VAPID.publicKey)
    const target = {
      endpoint: 'https://push.exemple.invalid/abc',
      keys: { p256dh: 'k', auth: 'a' },
    }
    await sender?.send(target, '{"title":"x"}')
    expect(send).toHaveBeenCalledWith(target, '{"title":"x"}', {
      vapidDetails: VAPID,
      TTL: 86_400,
      urgency: 'normal',
    })
    send.mockRejectedValueOnce(
      Object.assign(new Error('Gone'), { statusCode: 410 })
    )
    const gone = await sender?.send(target, '{}').catch((e: unknown) => e)
    expect(gone).toBeInstanceOf(PushDeliveryError)
    expect((gone as PushDeliveryError).statusCode).toBe(410)
    expect((gone as PushDeliveryError).expired).toBe(true)
    send.mockRejectedValueOnce('réseau')
    const network = await sender?.send(target, '{}').catch((e: unknown) => e)
    expect((network as PushDeliveryError).statusCode).toBe(0)
    expect((network as PushDeliveryError).expired).toBe(false)
    expect((network as PushDeliveryError).message).toBe('Envoi push impossible')
  })
})

describe('e-mail', () => {
  it('reste inerte sans point d’envoi', async () => {
    const sender = createEmailSender({})
    expect(sender).toBeInstanceOf(DisabledEmailSender)
    expect(sender.enabled).toBe(false)
    await expect(
      sender.send({ to: 'a@exemple.invalid', subject: 's', text: 't' })
    ).rejects.toThrow('pas configuré')
    expect(
      createEmailSender({ EMAIL_HTTP_URL: 'https://x.invalid' }).enabled
    ).toBe(false)
  })

  it('poste le message en JSON, jeton en Bearer, et signale un refus', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const sender = createEmailSender(
      {
        EMAIL_HTTP_URL: 'https://mail.exemple.invalid/emails',
        EMAIL_FROM: 'apart <apart@exemple.invalid>',
        EMAIL_HTTP_TOKEN: 'jeton',
      },
      fetchImpl
    )
    expect(sender).toBeInstanceOf(HttpEmailSender)
    await sender.send({
      to: 'chloe@exemple.invalid',
      subject: 'Sujet',
      text: 'Texte',
      html: '<p>Texte</p>',
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mail.exemple.invalid/emails',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer jeton',
        },
        body: JSON.stringify({
          from: 'apart <apart@exemple.invalid>',
          to: ['chloe@exemple.invalid'],
          subject: 'Sujet',
          text: 'Texte',
          html: '<p>Texte</p>',
        }),
      }
    )
    fetchImpl.mockResolvedValueOnce({ ok: false, status: 422 })
    await expect(
      new HttpEmailSender(
        'https://x.invalid',
        'f@x.invalid',
        null,
        fetchImpl
      ).send({
        to: 'a@x.invalid',
        subject: 's',
        text: 't',
      })
    ).rejects.toThrow('422')
    expect(fetchImpl.mock.calls[1]?.[1].headers.authorization).toBeUndefined()
  })
})
