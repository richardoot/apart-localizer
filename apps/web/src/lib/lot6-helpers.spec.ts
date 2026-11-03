import { afterEach, describe, expect, it, vi } from 'vitest'
import { PhotoRejectedError, preparePhoto } from './photos'
import { pushSupport, urlBase64ToUint8Array } from './push'
import { saveFile } from './download'
import { ApiError, apiDownload, uploadToSignedUrl } from './api'

describe('photos de visite', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sans toile, envoie un petit fichier tel quel, photo et vignette', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    const file = new File([new Uint8Array(1000)], 'sejour.jpg', {
      type: 'image/jpeg',
    })
    const prepared = await preparePhoto(file)
    expect(prepared).toMatchObject({
      photoType: 'image/jpeg',
      thumbnailType: 'image/jpeg',
      width: null,
    })
    expect(prepared.photo).toBe(file)
  })

  it('refuse un type ou une taille impossibles sans toile', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    await expect(
      preparePhoto(new File(['x'], 'plan.gif', { type: 'image/gif' }))
    ).rejects.toBeInstanceOf(PhotoRejectedError)
    await expect(
      preparePhoto(
        new File([new Uint8Array(600 * 1024)], 'grande.jpg', {
          type: 'image/jpeg',
        })
      )
    ).rejects.toThrow('Impossible de réduire')
  })

  it('avec une toile, réencode en JPEG et tire une vignette WebP (EXIF retiré)', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() })
    )
    const sizes: Array<[number, number, string]> = []
    const original = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') return original(tag)
      const canvas = original('canvas') as HTMLCanvasElement
      Object.assign(canvas, {
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (cb: (b: Blob | null) => void, type: string) => {
          sizes.push([canvas.width, canvas.height, type])
          cb(new Blob(['x'], { type }))
        },
      })
      return canvas
    })
    const prepared = await preparePhoto(
      new File(['raw'], 'IMG_0001.HEIC', { type: 'image/heic' })
    )
    expect(prepared).toMatchObject({
      photoType: 'image/jpeg',
      thumbnailType: 'image/webp',
      width: 4000,
      height: 3000,
    })
    expect(sizes).toEqual([
      [2048, 1536, 'image/jpeg'],
      [360, 270, 'image/webp'],
    ])
    vi.restoreAllMocks()
  })
})

describe('web push', () => {
  it('convertit la clé VAPID base64url en octets', () => {
    expect([...urlBase64ToUint8Array('AQID_-8')]).toEqual([1, 2, 3, 255, 239])
  })

  it('détecte ce que l’appareil sait faire', () => {
    expect(pushSupport({})).toBe('unsupported')
    expect(
      pushSupport({
        navigator: { serviceWorker: {} } as unknown as Navigator,
        PushManager: class {},
        Notification: { permission: 'default' },
      })
    ).toBe('supported')
    expect(
      pushSupport({
        navigator: { serviceWorker: {} } as unknown as Navigator,
        PushManager: class {},
        Notification: { permission: 'denied' },
      })
    ).toBe('denied')
  })
})

describe('téléchargements et envois', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lit le nom du fichier exporté et signale un refus', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('a;b', {
          status: 200,
          headers: {
            'content-disposition':
              'attachment; filename="apart-localizer-2026-11-03.csv"',
          },
        })
      )
    )
    const file = await apiDownload('/export?format=csv')
    expect(file.filename).toBe('apart-localizer-2026-11-03.csv')
    expect(await file.blob.text()).toBe('a;b')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Format inconnu' }), {
          status: 400,
        })
      )
    )
    await expect(apiDownload('/export?format=xlsx')).rejects.toThrow(
      'Format inconnu'
    )
  })

  it('envoie un fichier par PUT à l’URL signée, sans jeton', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const target = {
      signedUrl:
        'https://storage.invalid/upload/sign/visit-photos/a.jpg?token=t',
      path: 'a.jpg',
      token: 't',
      contentType: 'image/jpeg' as const,
      maxBytes: 10,
    }
    await uploadToSignedUrl(target, new Blob(['12345']))
    expect(fetchMock).toHaveBeenCalledWith(target.signedUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg', 'x-upsert': 'false' },
      body: expect.any(Blob),
    })
    await expect(
      uploadToSignedUrl(target, new Blob(['12345678901']))
    ).rejects.toBeInstanceOf(ApiError)
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 413 }))
    await expect(uploadToSignedUrl(target, new Blob(['1']))).rejects.toThrow(
      '413'
    )
  })

  it('fait télécharger le fichier par un lien temporaire', () => {
    vi.useFakeTimers()
    const create = vi.fn().mockReturnValue('blob:fake')
    const revoke = vi.fn()
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    )
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    saveFile({ blob: new Blob(['x']), filename: 'export.json' })
    expect(click).toHaveBeenCalledTimes(1)
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:fake')
    vi.useRealTimers()
    click.mockRestore()
  })
})
