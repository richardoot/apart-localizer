import { describe, expect, it } from 'vitest'
import {
  CAPTURE_HINTS,
  QUICK_FIELDS,
  captureState,
  clipboardToCapture,
  errorsOutsideQuick,
} from './capture'

describe('Lot 24 : la capture courte', () => {
  it('le presse-papiers : un lien au milieu d’une phrase, un texte assez long pour être l’annonce', () => {
    expect(clipboardToCapture('  ')).toEqual({ url: null, text: null })
    expect(
      clipboardToCapture(
        'Regarde cette annonce : https://www.leboncoin.fr/ad/ventes_immobilieres/2890123456'
      )
    ).toEqual({
      url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/2890123456',
      text: null,
    })
    const long = `Appartement T2 de 45 m² à Talence, proche tram, 189 000 € FAI, troisième étage avec balcon. https://www.seloger.com/annonces/achat/appartement/talence-33/1.htm`
    const read = clipboardToCapture(long)
    expect(read.url).toBe(
      'https://www.seloger.com/annonces/achat/appartement/talence-33/1.htm'
    )
    expect(read.text).toContain('Appartement T2 de 45 m²')
    expect(clipboardToCapture('T2 Talence 45 m²')).toEqual({
      url: null,
      text: 'T2 Talence 45 m²',
    })
  })

  it('l’état du premier écran et son indication honnête', () => {
    expect(captureState({ url: '', text: '', images: 0 })).toBe('empty')
    expect(captureState({ url: 'https://x.fr/a', text: ' ', images: 0 })).toBe(
      'link-only'
    )
    expect(captureState({ url: 'https://x.fr/a', text: '', images: 1 })).toBe(
      'analyzable'
    )
    expect(captureState({ url: '', text: 'T2', images: 0 })).toBe('analyzable')
    expect(CAPTURE_HINTS['link-only']).toContain(
      'Un lien seul ne dit rien à l’IA'
    )
  })

  it('les cinq champs, et les erreurs qu’ils n’affichent pas', () => {
    expect(QUICK_FIELDS).toEqual([
      'title',
      'price',
      'surface',
      'location.commune',
      'url',
    ])
    expect(
      errorsOutsideQuick({
        title: 'Titre requis',
        dpeDate: 'Date illisible',
        'location.commune': 'x',
      })
    ).toEqual(['Date illisible'])
  })
})
