/**
 * Dates civiles (AAAA-MM-JJ) en UTC : mois et années révolus, ajout de mois.
 * Les calculs du lot 5 raisonnent en mois depuis l'acquisition.
 */

import { isoDay } from './rent-reference.js'

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

function parts(day: string): [number, number, number] {
  const match = DAY.exec(day)
  if (!match) throw new RangeError(`Date invalide : ${day}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** L'année d'une date AAAA-MM-JJ. */
export function yearOf(day: string): number {
  return parts(day)[0]
}

/** Nombre de jours dans un mois (1 à 12). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Ajoute des mois à une date ; le jour est ramené au dernier du mois si besoin (31 janvier + 1 mois = 28 ou 29 février). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = parts(day)
  const index = y * 12 + (m - 1) + months
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  const clamped = Math.min(d, daysInMonth(year, month))
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`
}

/** Le jour précédent. */
export function previousDay(day: string): string {
  const [y, m, d] = parts(day)
  return isoDay(new Date(Date.UTC(y, m - 1, d - 1)))
}

/** Mois révolus de `from` à `to` (négatif si `to` est avant `from`). */
export function monthsBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from)
  const [y2, m2, d2] = parts(to)
  let months = (y2 - y1) * 12 + (m2 - m1)
  if (months > 0 && d2 < d1) months -= 1
  if (months < 0 && d2 > d1) months += 1
  return months
}

/** Années révolues de `from` à `to` (0 si `to` est avant). */
export function fullYearsBetween(from: string, to: string): number {
  return Math.max(0, Math.floor(monthsBetween(from, to) / 12))
}
