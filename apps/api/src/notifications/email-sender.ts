/**
 * L'envoi d'e-mails de notification, facultatif et injectable. Sans
 * configuration, l'implémentation est inerte (rien ne part, les
 * notifications e-mail sont marquées « ignorées »). Avec `EMAIL_HTTP_URL`,
 * un POST JSON `{ from, to, subject, text, html }` part vers ce point
 * d'envoi (un relais maison ou l'API HTTP d'un fournisseur qui accepte ce
 * format), jeton en `Authorization: Bearer`. Aucun fournisseur n'est imposé
 * (ADR 0014).
 */
export const EMAIL_SENDER = Symbol('EMAIL_SENDER')

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

export interface EmailSender {
  readonly enabled: boolean
  send(message: EmailMessage): Promise<void>
}

/** Rien ne part : l'e-mail est désactivé. */
export class DisabledEmailSender implements EmailSender {
  readonly enabled = false

  send(): Promise<void> {
    return Promise.reject(new Error("L'envoi d'e-mails n'est pas configuré"))
  }
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; status: number }>

export class HttpEmailSender implements EmailSender {
  readonly enabled = true

  constructor(
    private readonly url: string,
    private readonly from: string,
    private readonly token: string | null,
    private readonly fetchImpl: FetchLike
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (this.token) headers.authorization = `Bearer ${this.token}`
    const response = await this.fetchImpl(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    })
    if (!response.ok) {
      throw new Error(`Le point d'envoi d'e-mails a répondu ${response.status}`)
    }
  }
}

/** L'envoi d'e-mails selon l'environnement : HTTP si `EMAIL_HTTP_URL` et `EMAIL_FROM`, sinon inerte. */
export function createEmailSender(
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike = (url, init) => fetch(url, init)
): EmailSender {
  const url = env.EMAIL_HTTP_URL?.trim()
  const from = env.EMAIL_FROM?.trim()
  if (!url || !from) return new DisabledEmailSender()
  return new HttpEmailSender(
    url,
    from,
    env.EMAIL_HTTP_TOKEN?.trim() || null,
    fetchImpl
  )
}
