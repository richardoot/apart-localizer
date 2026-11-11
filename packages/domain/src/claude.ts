import type { ClaudeUsage, ClaudeUsageFacts } from '@apart/contracts'
import { parisDay } from './agency-requests.js'
import { plural } from './format.js'

/**
 * Lot 26 (ADR 0036) : ce que la page « Claude » peut dire de l'usage du
 * connecteur. Seule trace : le journal (canal `mcp`). Une lecture (lister,
 * vérifier sans enregistrer) n'en laisse aucune, et aucune API ne liste les
 * applications autorisées : la page dit « a déjà écrit », jamais « est
 * connecté ». Pur.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** « aujourd'hui », « hier », « le 9 novembre » (heure de Paris). */
export function claudeDayText(at: string, now: Date): string {
  const day = parisDay(at)
  const today = parisDay(now.toISOString())
  if (day === today) return 'aujourd’hui'
  if (day === parisDay(new Date(now.getTime() - DAY_MS).toISOString())) {
    return 'hier'
  }
  return `le ${new Date(at).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  })}`
}

/**
 * L'état du connecteur pour le membre connecté : `me` s'il a déjà écrit par
 * Claude, `workspace` si un autre membre l'a fait, `never` sinon ; et la
 * phrase qui le dit.
 */
export function claudeUsage(facts: ClaudeUsageFacts, now: Date): ClaudeUsage {
  const mine = facts.members.find(m => m.memberId === facts.viewerId) ?? null
  const others = facts.members
    .filter(m => m.memberId !== facts.viewerId && m.writes > 0)
    .sort((a, b) => Date.parse(b.lastWriteAt) - Date.parse(a.lastWriteAt))
  const total = facts.members.reduce((sum, m) => sum + m.writes, 0)
  if (mine && mine.writes > 0) {
    const also = others.length
      ? ` ${others.map(o => o.displayName).join(' et ')} aussi.`
      : ''
    return {
      state: 'me',
      title: 'Claude est branché pour toi',
      text: `Dernière écriture en ton nom ${claudeDayText(mine.lastWriteAt, now)} ; ${plural(mine.writes, 'écriture')} au journal.${also}`,
      lastWriteAt: mine.lastWriteAt,
      writes: total,
    }
  }
  const latest = others[0]
  if (latest) {
    return {
      state: 'workspace',
      title: 'Claude écrit déjà dans l’espace, pas encore pour toi',
      text: `${latest.displayName} l’utilise (dernière écriture ${claudeDayText(latest.lastWriteAt, now)}). Branche-le avec ton propre compte pour qu’il agisse en ton nom.`,
      lastWriteAt: latest.lastWriteAt,
      writes: total,
    }
  }
  return {
    state: 'never',
    title: 'Claude n’a encore rien écrit',
    text: 'L’application le verra à sa première écriture (une annonce, une vérification, une exploration). Une simple lecture ne laisse pas de trace.',
    lastWriteAt: null,
    writes: 0,
  }
}
