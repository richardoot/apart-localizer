import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { Member, Visit } from '@apart/contracts'
import { MEMBERS } from '@/test/fixtures'

const apiMock = vi.hoisted(() => ({
  workspace: vi.fn(),
  visits: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    requestPhotoUpload: vi.fn(),
    completePhoto: vi.fn(),
    removePhoto: vi.fn(),
  },
  notifications: {
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    settings: vi.fn(),
    updatePreferences: vi.fn(),
  },
  whatsNew: { report: vi.fn(), markSeen: vi.fn(), visit: vi.fn() },
  drafts: { list: vi.fn(), decide: vi.fn() },
  activity: { list: vi.fn() },
  export: vi.fn(),
  covers: {
    list: vi.fn(() => Promise.resolve({ covers: [] })),
    choose: vi.fn(),
  },
}))
const upload = vi.hoisted(() => vi.fn())
const routerPush = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: apiMock, uploadToSignedUrl: upload }
})
vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return { ...actual, useRouter: () => ({ push: routerPush }) }
})
vi.mock('@/lib/download', () => ({ saveFile: vi.fn() }))

import VisitsSection from './visits/VisitsSection.vue'
import NotificationBell from './notifications/NotificationBell.vue'
import WhatsNewBanner from './whats-new/WhatsNewBanner.vue'
import DraftsInbox from './drafts/DraftsInbox.vue'
import ExportMenu from './listings/ExportMenu.vue'
import ActivityPage from '@/views/ActivityPage.vue'
import NotificationsPage from '@/views/NotificationsPage.vue'
import {
  emptyVisitForm,
  toLocalInput,
  visitFormToInput,
} from './visits/visit-form'
import {
  resetVisitHeartbeat,
  sendVisitHeartbeat,
} from '@/composables/useWhatsNew'
import { saveFile } from '@/lib/download'
import { sharedListingQuery } from '@/router'

const LISTING = '11111111-1111-4111-8111-111111111111'
const RICHARD = MEMBERS[0] as Member
const CHLOE = MEMBERS[1] as Member

function withClient<T>(component: T, props: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return mount(component as never, {
    props: props as never,
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
}

function visit(over: Partial<Visit> = {}): Visit {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    listingId: LISTING,
    visitedAt: '2026-11-02T17:00:00.000Z',
    status: 'done',
    participantIds: [RICHARD.id, CHLOE.id],
    report: 'Lumineux',
    pros: 'Sud',
    cons: 'Bruit',
    rating: 4,
    prepTaskId: null,
    createdById: RICHARD.id,
    createdAt: '2026-11-02T19:00:00.000Z',
    updatedAt: '2026-11-02T19:00:00.000Z',
    photoCount: 1,
    photos: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        visitId: '55555555-5555-4555-8555-555555555555',
        status: 'ready',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
        width: null,
        height: null,
        caption: 'Séjour',
        uploadedById: CHLOE.id,
        createdAt: '2026-11-02T19:00:00.000Z',
        url: 'https://storage.invalid/sign/a.jpg',
        thumbnailUrl: 'https://storage.invalid/sign/a-thumb.webp',
        urlExpiresAt: '2026-11-02T19:10:00.000Z',
      },
    ],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('formulaire de visite', () => {
  it('passe de la saisie au corps de l’API', () => {
    const form = emptyVisitForm(new Date(2026, 10, 12, 18, 30), 'me')
    expect(form.visitedAt).toBe('2026-11-12T18:30')
    expect(form.participantIds).toEqual(['me'])
    expect(
      visitFormToInput({ ...form, status: 'planned', report: '  ' })
    ).toMatchObject({
      status: 'planned',
      report: null,
      createPrepTask: true,
      visitedAt: new Date(2026, 10, 12, 18, 30).toISOString(),
    })
    expect(
      visitFormToInput({ ...form, createPrepTask: true })?.createPrepTask
    ).toBe(false)
    expect(visitFormToInput({ ...form, visitedAt: 'pas une date' })).toBeNull()
    expect(toLocalInput(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05T09:07')
  })
})

describe('VisitsSection', () => {
  it('liste les visites, leurs photos privées et propose le statut après une visite', async () => {
    apiMock.visits.list.mockResolvedValue([visit()])
    apiMock.visits.create.mockResolvedValue({
      visit: visit({ id: '77777777-7777-4777-8777-777777777777', photos: [] }),
      createdTask: null,
      currentStatus: 'to_study',
      suggestedStatus: 'visited',
    })
    const wrapper = withClient(VisitsSection, {
      listingId: LISTING,
      members: MEMBERS,
      meId: RICHARD.id,
    })
    await flushPromises()
    const text = document.body.textContent ?? ''
    expect(text).toContain('avec Richard, Chloé')
    expect(text).toContain('4/5')
    expect(text).toContain('+ Sud')
    const img = document.body.querySelector('img')
    expect(img?.getAttribute('src')).toBe(
      'https://storage.invalid/sign/a-thumb.webp'
    )
    // La photo de Chloé : pas de bouton de suppression pour Richard.
    expect(
      document.body.querySelector('[aria-label="Supprimer la photo"]')
    ).toBeNull()
    ;(
      document.body.querySelector('[data-testid="visit-add"]') as HTMLElement
    ).click()
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="visit-form"]'
      ) as HTMLFormElement
    ).dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(apiMock.visits.create).toHaveBeenCalledWith(
      LISTING,
      expect.objectContaining({ status: 'done', participantIds: [RICHARD.id] })
    )
    const prompt = document.body.querySelector(
      '[data-testid="visit-suggested-status"]'
    )
    expect(prompt?.textContent).toContain('« Visité »')
    ;(prompt?.querySelector('button') as HTMLElement).click()
    expect(wrapper.emitted('set-status')).toEqual([['visited']])
    wrapper.unmount()
  })

  it('lot 25 : choisir la photo de couverture, puis « Annuler » remet la précédente', async () => {
    const shown = visit()
    const photoId = shown.photos[0]?.id ?? ''
    apiMock.visits.list.mockResolvedValue([shown])
    apiMock.covers.list.mockResolvedValueOnce({ covers: [] })
    apiMock.covers.choose.mockResolvedValue({ covers: [] })
    const wrapper = withClient(VisitsSection, {
      listingId: LISTING,
      members: MEMBERS,
      meId: RICHARD.id,
    })
    await flushPromises()
    const pick = document.body.querySelector(
      '[data-testid="photo-cover-pick"]'
    ) as HTMLElement
    expect(pick.getAttribute('aria-label')).toContain(
      'Choisir comme photo de couverture'
    )
    pick.click()
    await flushPromises()
    expect(apiMock.covers.choose).toHaveBeenCalledWith(LISTING, photoId)
    const { useFeedbackStore } = await import('@/stores/feedback')
    const message = useFeedbackStore().messages.at(-1)
    expect(message?.text).toBe('Photo de couverture choisie.')
    await message?.action?.run()
    expect(apiMock.covers.choose).toHaveBeenLastCalledWith(LISTING, null)
    wrapper.unmount()
  })

  it('envoie des photos : annonce, PUT vers les URL signées, fin d’envoi', async () => {
    apiMock.visits.list.mockResolvedValue([
      visit({ photos: [], photoCount: 0 }),
    ])
    apiMock.visits.requestPhotoUpload.mockResolvedValue({
      photo: { id: 'p1' },
      upload: {
        signedUrl: 'https://s/1',
        path: 'a',
        token: 't',
        contentType: 'image/jpeg',
        maxBytes: 10_000_000,
      },
      thumbnailUpload: {
        signedUrl: 'https://s/2',
        path: 'b',
        token: 't',
        contentType: 'image/jpeg',
        maxBytes: 500_000,
      },
    })
    apiMock.visits.completePhoto.mockResolvedValue({})
    upload.mockResolvedValue(undefined)
    vi.stubGlobal('createImageBitmap', undefined)
    const wrapper = withClient(VisitsSection, {
      listingId: LISTING,
      members: MEMBERS,
      meId: RICHARD.id,
    })
    await flushPromises()
    const input = document.body.querySelector(
      '[data-testid="visit-photos-55555555-5555-4555-8555-555555555555"]'
    ) as HTMLInputElement
    const file = new File([new Uint8Array(2000)], 'cuisine.jpg', {
      type: 'image/jpeg',
    })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(apiMock.visits.requestPhotoUpload).toHaveBeenCalledWith(
      LISTING,
      '55555555-5555-4555-8555-555555555555',
      expect.objectContaining({
        contentType: 'image/jpeg',
        sizeBytes: 2000,
        thumbnail: { contentType: 'image/jpeg', sizeBytes: 2000 },
      })
    )
    expect(upload).toHaveBeenCalledTimes(2)
    expect(apiMock.visits.completePhoto).toHaveBeenCalledWith(
      LISTING,
      '55555555-5555-4555-8555-555555555555',
      'p1'
    )
    // Lot 22 : la réussite dans la zone de messages, au pluriel accordé.
    const { useFeedbackStore } = await import('@/stores/feedback')
    expect(useFeedbackStore().messages.at(-1)?.text).toBe('1 photo envoyée.')
    vi.unstubAllGlobals()
    wrapper.unmount()
  })
})

describe('VisitsSection : visite modifiable (lot 24)', () => {
  it('« Marquer faite » porte le compte rendu ; une visite faite se corrige par l’auteur ou un participant', async () => {
    const planned = visit({
      status: 'planned',
      report: null,
      pros: null,
      cons: null,
      rating: 0,
    })
    apiMock.visits.list.mockResolvedValue([planned])
    apiMock.visits.update.mockResolvedValue({
      visit: { ...planned, status: 'done', report: 'Cave saine' },
      createdTask: null,
      currentStatus: 'to_visit',
      suggestedStatus: 'visited',
    })
    const wrapper = withClient(VisitsSection, {
      listingId: LISTING,
      members: MEMBERS,
      meId: CHLOE.id,
    })
    await flushPromises()
    const link = document.body.querySelector('[data-testid="visit-mode-link"]')
    expect(link).not.toBeNull()
    ;(
      document.body.querySelector(
        '[data-testid="visit-mark-done"]'
      ) as HTMLElement
    ).click()
    await flushPromises()
    const report = document.body.querySelector(
      '[data-testid="visit-edit-report"]'
    ) as HTMLTextAreaElement
    report.value = 'Cave saine'
    report.dispatchEvent(new Event('input'))
    await flushPromises()
    expect(
      document.body
        .querySelector('[data-testid="visit-edit-save"]')
        ?.textContent?.trim()
    ).toBe('Enregistrer comme faite')
    ;(
      document.body.querySelector(
        '[data-testid="visit-edit-form"]'
      ) as HTMLFormElement
    ).dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(apiMock.visits.update).toHaveBeenCalledWith(LISTING, planned.id, {
      expectedUpdatedAt: planned.updatedAt,
      report: 'Cave saine',
      status: 'done',
    })
    expect(
      document.body.querySelector('[data-testid="visit-suggested-status"]')
        ?.textContent
    ).toContain('« Visité »')
    wrapper.unmount()
    document.body.innerHTML = ''
  })

  it('un membre qui n’était pas à la visite faite ne la corrige pas ; un conflit se dit dans la carte', async () => {
    const SAM = '44444444-4444-4444-8444-444444444444'
    apiMock.visits.list.mockResolvedValue([visit({ status: 'done' })])
    const outsider = withClient(VisitsSection, {
      listingId: LISTING,
      members: MEMBERS,
      meId: SAM,
    })
    await flushPromises()
    expect(document.body.querySelector('[data-testid="visit-edit"]')).toBeNull()
    expect(
      document.body.querySelector('[data-testid="visit-edit-refused"]')
        ?.textContent
    ).toContain('Seuls l’auteur de la visite et ses participants')
    outsider.unmount()
    document.body.innerHTML = ''

    const { ApiError } = await import('@/lib/api')
    apiMock.visits.update.mockRejectedValue(
      new ApiError(409, 'La visite a changé depuis ta lecture : relis-la')
    )
    const wrapper = withClient(VisitsSection, {
      listingId: LISTING,
      members: MEMBERS,
      meId: CHLOE.id,
    })
    await flushPromises()
    ;(
      document.body.querySelector('[data-testid="visit-edit"]') as HTMLElement
    ).click()
    await flushPromises()
    const select = document.body.querySelector(
      '[data-testid="visit-edit-form"] select'
    ) as HTMLSelectElement
    select.value = '2'
    select.dispatchEvent(new Event('change'))
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="visit-edit-form"] form, [data-testid="visit-edit-form"]'
      ) as HTMLFormElement
    ).dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(
      document.body.querySelector('[role="alert"]')?.textContent
    ).toContain('relis-la')
    // La saisie reste ouverte : rien de perdu.
    expect(
      document.body.querySelector('[data-testid="visit-edit-form"]')
    ).not.toBeNull()
    wrapper.unmount()
  })
})

describe('VisitsSection : suppressions confirmées dans la carte (lot 19)', () => {
  it('une visite et une photo se suppriment après confirmation en ligne, jamais par window.confirm', async () => {
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    apiMock.visits.list.mockResolvedValue([
      visit({
        photos: [
          {
            ...(visit().photos[0] as Visit['photos'][number]),
            uploadedById: RICHARD.id,
          },
        ],
      }),
    ])
    apiMock.visits.remove.mockResolvedValue(undefined)
    apiMock.visits.removePhoto.mockResolvedValue(undefined)
    const wrapper = withClient(VisitsSection, {
      listingId: LISTING,
      members: MEMBERS,
      meId: RICHARD.id,
    })
    await flushPromises()
    const card = document.getElementById(
      'visit-55555555-5555-4555-8555-555555555555'
    )
    expect(card?.getAttribute('tabindex')).toBe('-1')
    ;(
      document.body.querySelector(
        '[aria-label="Supprimer la photo"]'
      ) as HTMLElement
    ).click()
    await flushPromises()
    expect(
      document.body.querySelector('[data-testid="photo-remove-confirm"]')
        ?.textContent
    ).toContain('Supprimer cette photo ?')
    ;(
      document.body.querySelector(
        '[data-testid="photo-remove-yes"]'
      ) as HTMLElement
    ).click()
    await flushPromises()
    expect(apiMock.visits.removePhoto).toHaveBeenCalledWith(
      LISTING,
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666'
    )
    ;(
      document.body.querySelector('[data-testid="visit-remove"]') as HTMLElement
    ).click()
    await flushPromises()
    expect(apiMock.visits.remove).not.toHaveBeenCalled()
    ;(
      document.body.querySelector(
        '[data-testid="visit-remove-yes"]'
      ) as HTMLElement
    ).click()
    await flushPromises()
    expect(apiMock.visits.remove).toHaveBeenCalledWith(
      LISTING,
      '55555555-5555-4555-8555-555555555555'
    )
    expect(confirm).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
    wrapper.unmount()
  })
})

describe('NotificationBell', () => {
  it('compte les non lues, les montre, et ouvre la fiche en marquant lue', async () => {
    apiMock.notifications.list.mockResolvedValue({
      items: [
        {
          id: 'n1',
          type: 'listing_created',
          title: 'Nouvelle annonce : T3',
          body: 'Ajoutée par Chloé.',
          url: '/annonces/abc',
          listingId: null,
          actorName: 'Chloé',
          readAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
      unreadCount: 1,
      page: 1,
      limit: 10,
      pageCount: 1,
    })
    apiMock.notifications.markRead.mockResolvedValue({})
    const wrapper = withClient(NotificationBell)
    await flushPromises()
    expect(
      document.body.querySelector('[data-testid="bell-count"]')?.textContent
    ).toBe('1')
    ;(
      document.body.querySelector('[data-testid="bell"]') as HTMLElement
    ).click()
    await flushPromises()
    const item = document.body.querySelector(
      '[data-unread="true"]'
    ) as HTMLElement
    expect(item.textContent).toContain('Nouvelle annonce : T3')
    item.click()
    await flushPromises()
    expect(apiMock.notifications.markRead).toHaveBeenCalledWith('n1', true)
    expect(routerPush).toHaveBeenCalledWith('/annonces/abc')
    wrapper.unmount()
  })
})

describe('WhatsNewBanner et DraftsInbox', () => {
  it('résume ce qui a changé et marque tout comme vu', async () => {
    apiMock.whatsNew.report.mockResolvedValue({
      since: '2026-11-02T20:00:00.000Z',
      sinceSource: 'previous_visit',
      generatedAt: '2026-11-03T08:00:00.000Z',
      total: 2,
      counts: {
        new_listing: 1,
        price_change: 1,
        status_change: 0,
        opinion: 0,
        task: 0,
        criteria_match: 0,
      },
      items: [
        {
          kind: 'new_listing',
          listingId: LISTING,
          listingTitle: 'T3',
          at: '2026-11-03T07:00:00.000Z',
          actor: null,
          channel: 'mcp',
          summary: 'Ajoutée par Claude (MCP, pour Richard)',
          before: null,
          after: null,
        },
      ],
      listings: [],
    })
    apiMock.whatsNew.markSeen.mockResolvedValue({
      since: 'x',
      markedListings: 3,
    })
    const wrapper = withClient(WhatsNewBanner)
    await flushPromises()
    expect(
      document.body.querySelector('[data-testid="whats-new-counts"]')
        ?.textContent
    ).toContain('Nouvelles annonces : 1 · Changements de prix : 1')
    ;(document.body.querySelector('[aria-expanded]') as HTMLElement).click()
    await flushPromises()
    ;(document.body.querySelector('li button') as HTMLElement).click()
    expect(wrapper.emitted('open')).toEqual([[LISTING]])
    ;(
      document.body.querySelector(
        '[data-testid="mark-all-seen"]'
      ) as HTMLElement
    ).click()
    await flushPromises()
    expect(apiMock.whatsNew.markSeen).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ne montre rien sans nouveauté', async () => {
    apiMock.whatsNew.report.mockResolvedValue({
      since: '2026-11-02T20:00:00.000Z',
      sinceSource: 'previous_visit',
      generatedAt: 'x',
      total: 0,
      counts: {},
      items: [],
      listings: [],
    })
    const wrapper = withClient(WhatsNewBanner)
    await flushPromises()
    expect(document.body.querySelector('[data-testid="whats-new"]')).toBeNull()
    wrapper.unmount()
  })

  it('résume les annonces à valider (e-mail et Claude) et renvoie vers l’onglet « À valider »', async () => {
    const draft = (id: string, over: Record<string, unknown> = {}) => ({
      id,
      origin: 'email',
      status: 'pending',
      extractedBy: 'parser',
      portal: null,
      distinct: false,
      listing: {
        title: `T2 Bègles ${id}`,
        price: 165000,
        publishedAt: null,
        location: { commune: 'Bègles' },
      },
      duplicates: [],
      receivedAt: new Date().toISOString(),
      ...over,
    })
    apiMock.drafts.list.mockResolvedValue([
      draft('d1', { duplicates: [{ listingId: 'x', reasons: [] }] }),
      draft('d2', { origin: 'exploration', portal: 'leboncoin' }),
      draft('d3'),
      draft('d4'),
    ])
    const wrapper = withClient(DraftsInbox)
    await flushPromises()
    const text =
      document.body.querySelector('[data-testid="drafts"]')?.textContent ?? ''
    expect(text).toContain('À valider')
    expect(text).toContain('T2 Bègles d1')
    expect(text).toContain('E-mail')
    expect(text).toContain('Leboncoin')
    expect(text).toContain('doublon probable')
    expect(text).not.toContain('T2 Bègles d4')
    expect(text).toContain('Et 1 autre.')
    expect(
      document.body.querySelector('[data-testid="drafts-open"]')
    ).not.toBeNull()
    wrapper.unmount()
  })
})

describe('ExportMenu', () => {
  it('télécharge la sélection en CSV ou tout l’espace en JSON', async () => {
    apiMock.export.mockResolvedValue({
      blob: new Blob(['x']),
      filename: 'e.csv',
    })
    const wrapper = withClient(ExportMenu, {
      filters: { commune: ['Talence'] },
    })
    ;(
      document.body.querySelector('[data-testid="export"]') as HTMLElement
    ).click()
    await flushPromises()
    const items = [
      ...document.body.querySelectorAll('[role="menuitem"]'),
    ] as HTMLElement[]
    expect(items.map(i => i.textContent?.trim())).toHaveLength(4)
    items[0]?.click()
    await flushPromises()
    expect(apiMock.export).toHaveBeenCalledWith('csv', 'selection', {
      commune: ['Talence'],
    })
    expect(saveFile).toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('pages Activité et Notifications', () => {
  it('filtre le journal par membre, canal et type', async () => {
    apiMock.workspace.mockResolvedValue({
      workspace: {
        id: RICHARD.workspaceId,
        name: 'Espace',
        createdAt: '2026-11-03T10:00:00.000Z',
        members: MEMBERS,
      },
      me: RICHARD,
    })
    apiMock.activity.list.mockResolvedValue({
      items: [
        {
          id: 'a1',
          createdAt: '2026-11-03T09:00:00.000Z',
          action: 'listing.status_changed',
          kind: 'status',
          channel: 'mcp',
          channelLabel: 'MCP (Claude)',
          actor: { id: RICHARD.id, handle: 'richard', displayName: 'Richard' },
          listing: { id: LISTING, title: 'T2' },
          summary: 'a changé le statut',
          changes: [
            {
              field: 'status',
              label: 'Statut',
              before: 'À étudier',
              after: 'À visiter',
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
      pageCount: 1,
    })
    const wrapper = withClient(ActivityPage)
    await flushPromises()
    expect(document.body.textContent).toContain('Claude pour Richard')
    expect(document.body.textContent).toContain('À étudierdevientÀ visiter')
    const channel = document.body.querySelector(
      '[data-testid="filter-channel"]'
    ) as HTMLSelectElement
    channel.value = 'mcp'
    channel.dispatchEvent(new Event('change'))
    const kind = document.body.querySelector(
      '[data-testid="filter-kind"]'
    ) as HTMLSelectElement
    kind.value = 'status'
    kind.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(apiMock.activity.list).toHaveBeenLastCalledWith({
      channel: 'mcp',
      kind: 'status',
      page: 1,
      limit: 50,
    })
    ;(
      document.body.querySelector(
        '[data-testid="activity-list"] li button'
      ) as HTMLElement
    ).click()
    expect(routerPush).toHaveBeenCalledWith({
      name: 'listing',
      params: { id: LISTING },
    })
    wrapper.unmount()
  })

  it('règle les préférences par type et par canal', async () => {
    apiMock.workspace.mockResolvedValue({
      workspace: {
        id: RICHARD.workspaceId,
        name: 'Espace',
        createdAt: '2026-11-03T10:00:00.000Z',
        members: MEMBERS,
      },
      me: RICHARD,
    })
    apiMock.notifications.list.mockResolvedValue({
      items: [],
      total: 0,
      unreadCount: 0,
      page: 1,
      limit: 50,
      pageCount: 0,
    })
    const settings = {
      preferences: Object.fromEntries(
        [
          'listing_created',
          'status_changed',
          'task_assigned',
          'criteria_matched',
          'offer_response',
          'drafts_received',
          'member_joined',
        ].map(t => [t, { in_app: true, push: true, email: false }])
      ),
      push: { enabled: false, publicKey: null, subscriptions: 0 },
      email: { enabled: false, address: 'richard@e2e.invalid' },
      inbound: {
        enabled: true,
        path: `/inbound/email/${RICHARD.workspaceId}`,
      },
    }
    apiMock.notifications.settings.mockResolvedValue(settings)
    apiMock.notifications.updatePreferences.mockResolvedValue(settings)
    const wrapper = withClient(NotificationsPage)
    await flushPromises()
    expect(
      document.body.querySelector('[data-testid="push"]')?.textContent
    ).toContain('ne sont pas encore activées')
    expect(
      document.body.querySelector('[data-testid="inbound"]')?.textContent
    ).toContain(`/inbound/email/${RICHARD.workspaceId}`)
    const box = document.body.querySelector(
      '[data-pref="status_changed.push"]'
    ) as HTMLInputElement
    box.checked = false
    box.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(apiMock.notifications.updatePreferences).toHaveBeenCalledWith({
      status_changed: { push: false },
    })
    wrapper.unmount()
  })
})

describe('partage et visite', () => {
  it('le partage du téléphone ouvre « Nouvelle annonce » avec le lien trouvé dans le texte', () => {
    expect(
      sharedListingQuery({
        title: 'Appartement T2',
        text: 'Regarde : https://www.leboncoin.fr/ad/ventes_immobilieres/2890123456',
      })
    ).toEqual({
      partage: '1',
      url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/2890123456',
      texte: 'Appartement T2\nRegarde :',
      titre: 'Appartement T2',
    })
    expect(
      sharedListingQuery({ url: ['https://pap.fr/annonces/r1234567'] })
    ).toEqual({
      partage: '1',
      url: 'https://pap.fr/annonces/r1234567',
    })
  })

  it('signale une visite au plus toutes les cinq minutes', async () => {
    resetVisitHeartbeat()
    const send = vi.fn().mockResolvedValue({})
    expect(sendVisitHeartbeat(1_000_000, send)).not.toBeNull()
    expect(sendVisitHeartbeat(1_000_000 + 60_000, send)).toBeNull()
    expect(sendVisitHeartbeat(1_000_000 + 6 * 60_000, send)).not.toBeNull()
    expect(send).toHaveBeenCalledTimes(2)
    const failing = vi.fn().mockRejectedValue(new Error('réseau'))
    await sendVisitHeartbeat(5_000_000, failing)
    // Un échec ne bloque pas le signal suivant.
    expect(sendVisitHeartbeat(5_000_001, send)).not.toBeNull()
  })
})
