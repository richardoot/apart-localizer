import { describe, expect, it } from 'vitest'
import {
  photoPaths,
  prepTaskLabel,
  suggestedStatusAfterVisit,
  visitsConfig,
} from './visits.service'

describe('visites', () => {
  it('propose « visité » après une visite faite et « à visiter » pour une visite planifiée', () => {
    expect(suggestedStatusAfterVisit('to_study', 'done')).toBe('visited')
    expect(suggestedStatusAfterVisit('to_visit', 'done')).toBe('visited')
    expect(suggestedStatusAfterVisit('visited', 'done')).toBeNull()
    expect(suggestedStatusAfterVisit('offer_made', 'done')).toBeNull()
    expect(suggestedStatusAfterVisit('to_study', 'planned')).toBe('to_visit')
    expect(suggestedStatusAfterVisit('to_visit', 'planned')).toBeNull()
    expect(suggestedStatusAfterVisit('discarded', 'planned')).toBeNull()
  })

  it('libelle la tâche de préparation avec la date de Paris', () => {
    expect(prepTaskLabel('2026-11-12T17:30:00.000Z')).toMatch(
      /^Préparer la visite du 12 novembre 2026 à 18:30 : documents à demander/
    )
  })

  it('range les photos par espace, annonce et visite', () => {
    expect(photoPaths('w', 'l', 'v', 'p', 'image/jpeg', 'image/webp')).toEqual({
      photo: 'w/l/v/p.jpg',
      thumbnail: 'w/l/v/p-thumb.webp',
    })
    expect(photoPaths('w', 'l', 'v', 'p', 'image/png', 'image/png').photo).toBe(
      'w/l/v/p.png'
    )
  })

  it('borne la durée des URL signées', () => {
    expect(visitsConfig({}).signedUrlTtlSeconds).toBe(600)
    expect(
      visitsConfig({ STORAGE_SIGNED_URL_TTL_SECONDS: '120' })
        .signedUrlTtlSeconds
    ).toBe(120)
    expect(
      visitsConfig({ STORAGE_SIGNED_URL_TTL_SECONDS: '99999' })
        .signedUrlTtlSeconds
    ).toBe(600)
  })
})
