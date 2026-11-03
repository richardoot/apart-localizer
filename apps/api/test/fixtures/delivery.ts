/**
 * Fakes for what leaves the machine in lot 6: Supabase Storage (visit
 * photos), the Web Push service and the e-mail sender. In memory, scripted
 * by the specs; nothing reaches a network.
 */
import type {
  PhotoStorage,
  SignedUploadTarget,
  StoredObjectInfo,
} from '../../src/visits/photo-storage'
import { PhotoStorageUnavailableException } from '../../src/visits/photo-storage'
import { PushDeliveryError } from '../../src/notifications/push-sender'
import type {
  PushSender,
  PushTarget,
} from '../../src/notifications/push-sender'
import type {
  EmailMessage,
  EmailSender,
} from '../../src/notifications/email-sender'

export class FakePhotoStorage implements PhotoStorage {
  readonly bucket = 'visit-photos'
  readonly objects = new Map<string, StoredObjectInfo>()
  readonly removed: string[] = []
  readonly uploadUrls: string[] = []
  /** When set, every call fails as if Storage were down. */
  down = false

  private check(): void {
    if (this.down) throw new PhotoStorageUnavailableException('e2e : en panne')
  }

  /** What the browser's PUT to the signed URL would do. */
  put(path: string, size: number, contentType: string): void {
    this.objects.set(path, { size, contentType })
  }

  createSignedUploadUrl(path: string): Promise<SignedUploadTarget> {
    this.check()
    const signedUrl = `https://storage.e2e.invalid/upload/${path}?token=t-${this.uploadUrls.length}`
    this.uploadUrls.push(path)
    return Promise.resolve({ signedUrl, token: `t-${path}`, path })
  }

  createSignedUrls(
    paths: string[],
    expiresIn: number
  ): Promise<Array<string | null>> {
    this.check()
    return Promise.resolve(
      paths.map(path =>
        this.objects.has(path)
          ? `https://storage.e2e.invalid/sign/${path}?expires=${expiresIn}`
          : null
      )
    )
  }

  info(path: string): Promise<StoredObjectInfo | null> {
    this.check()
    return Promise.resolve(this.objects.get(path) ?? null)
  }

  remove(paths: string[]): Promise<void> {
    this.check()
    for (const path of paths) {
      this.objects.delete(path)
      this.removed.push(path)
    }
    return Promise.resolve()
  }

  reset(): void {
    this.objects.clear()
    this.removed.length = 0
    this.uploadUrls.length = 0
    this.down = false
  }
}

export class FakePushSender implements PushSender {
  readonly publicKey = 'BE2E-fake-vapid-public-key-0123456789abcdef'
  readonly sent: Array<{ endpoint: string; payload: Record<string, unknown> }> =
    []
  /** Endpoint → HTTP status the push service answers with. */
  readonly failures = new Map<string, number>()

  send(target: PushTarget, payload: string): Promise<void> {
    const status = this.failures.get(target.endpoint)
    if (status !== undefined) {
      return Promise.reject(new PushDeliveryError(status, `push ${status}`))
    }
    this.sent.push({
      endpoint: target.endpoint,
      payload: JSON.parse(payload) as Record<string, unknown>,
    })
    return Promise.resolve()
  }

  reset(): void {
    this.sent.length = 0
    this.failures.clear()
  }
}

export class FakeEmailSender implements EmailSender {
  enabled = false
  readonly sent: EmailMessage[] = []

  send(message: EmailMessage): Promise<void> {
    if (!this.enabled) return Promise.reject(new Error('désactivé'))
    this.sent.push(message)
    return Promise.resolve()
  }

  reset(): void {
    this.enabled = false
    this.sent.length = 0
  }
}
