import {
  AGENCY_APPROVAL_VIA_LABELS,
  AGENCY_CHANNEL_LABELS,
  AGENCY_REQUEST_STATUS_LABELS,
} from '@apart/contracts'
import type { ActivityChange } from '@apart/contracts'

/**
 * Lot 17 : les phrases du journal pour les échanges avec l'annonceur
 * (contact, demandes, validation, envoi, réponses). Le journal ne garde
 * aucune coordonnée du contact (seulement les noms des champs changés), pour
 * qu'un contact effacé le soit vraiment. `describeActivity` y délègue ; le
 * détail des valeurs de la fiche passe par la fonction `changes` qu'il lui
 * donne (pas d'importation circulaire).
 */

const CONTACT_FIELD_LABELS: Record<string, string> = {
  agencyName: 'agence',
  contactName: 'interlocuteur',
  email: 'e-mail',
  phone: 'téléphone',
  portalMessageUrl: 'messagerie du portail',
  preferredChannel: 'canal préféré',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function text(record: unknown, key: string): string | null {
  return isRecord(record) && typeof record[key] === 'string'
    ? (record[key] as string)
    : null
}
function count(record: unknown, key: string): number {
  const value = isRecord(record) ? record[key] : undefined
  return Array.isArray(value)
    ? value.length
    : typeof value === 'number'
      ? value
      : 0
}

function channelLabel(record: unknown): string | null {
  const channel = text(record, 'channel')
  return channel
    ? ((AGENCY_CHANNEL_LABELS as Record<string, string>)[channel] ?? channel)
    : null
}

function questions(record: unknown): string {
  const n = count(record, 'taskIds')
  return `${n} question${n > 1 ? 's' : ''}`
}

/** Vrai pour une action des échanges avec l'annonceur (lot 17). */
export function isAgencyAction(action: string): boolean {
  return action.startsWith('agency_request.') || action.startsWith('contact.')
}

/**
 * La phrase (sans le nom de l'acteur) et le détail d'une action des
 * échanges ; null pour une action d'une autre sorte.
 */
export function describeAgencyActivity(
  action: string,
  before: unknown,
  after: unknown,
  changes: (before: unknown, after: unknown) => ActivityChange[]
): { summary: string; changes: ActivityChange[] } | null {
  const facts = (record: unknown) => (isRecord(record) ? record.facts : null)
  switch (action) {
    case 'contact.updated': {
      const fields =
        isRecord(after) && Array.isArray(after.fields) ? after.fields : []
      const names = fields
        .map(f =>
          typeof f === 'string' ? (CONTACT_FIELD_LABELS[f] ?? f) : null
        )
        .filter(Boolean)
      return {
        summary: `${text(before, 'state') === 'none' ? "a ajouté le contact de l'annonceur" : "a mis à jour le contact de l'annonceur"}${names.length ? ` (${names.join(', ')})` : ''}`,
        changes: [],
      }
    }
    case 'contact.cleared':
      return { summary: "a effacé le contact de l'annonceur", changes: [] }
    case 'agency_request.drafted': {
      const channel = channelLabel(after)
      const followUp = text(after, 'followUpOf') !== null
      return {
        summary: `a préparé ${followUp ? 'une relance' : 'un message'} pour l'annonceur, à valider (${questions(after)}${channel ? `, ${channel.toLowerCase()}` : ''})`,
        changes: [],
      }
    }
    case 'agency_request.updated':
      return {
        summary:
          text(before, 'status') === 'approved'
            ? "a modifié le message à l'annonceur, qui repasse « à valider »"
            : "a modifié le message à l'annonceur",
        changes: [],
      }
    case 'agency_request.approved': {
      const via = text(after, 'approvedVia')
      return {
        summary: `a validé l'envoi du message à l'annonceur${via ? ` (${(AGENCY_APPROVAL_VIA_LABELS as Record<string, string>)[via] ?? via})` : ''}`,
        changes: [],
      }
    }
    case 'agency_request.cancelled':
      return { summary: "a annulé le message à l'annonceur", changes: [] }
    case 'agency_request.sent': {
      const channel = channelLabel(after)
      const chat = isRecord(after) && after.approvedVia === 'chat'
      return {
        summary: `a envoyé le message à l'annonceur${channel ? ` (${channel.toLowerCase()})` : ''}${chat ? ', validé dans la conversation' : ''} ; ${questions(after)} demandée${count(after, 'taskIds') > 1 ? 's' : ''}`,
        changes: [],
      }
    }
    case 'agency_request.answered': {
      const summary = text(after, 'summary')
      const proposed = count(after, 'proposed')
      return {
        summary: `a enregistré la réponse de l'annonceur${summary ? ` : ${summary}` : ''}${proposed > 0 ? ` (${proposed} valeur${proposed > 1 ? 's' : ''} proposée${proposed > 1 ? 's' : ''}, à confirmer)` : ''}`,
        changes: changes(facts(before), facts(after)),
      }
    }
    case 'agency_request.no_answer':
      return {
        summary:
          text(after, 'followUpId') !== null
            ? "a relancé l'annonceur (premier message sans réponse)"
            : "a noté que l'annonceur n'a pas répondu",
        changes: [],
      }
    case 'agency_request.value_applied':
      return {
        summary: "a appliqué une valeur proposée par l'annonceur",
        changes: changes(facts(before), facts(after)),
      }
    case 'agency_request.signature_changed':
      return {
        summary: text(after, 'signature')
          ? 'a changé la signature des messages aux annonceurs'
          : 'a remis la signature des messages aux annonceurs par défaut',
        changes: [],
      }
    default: {
      if (!isAgencyAction(action)) return null
      const status = text(after, 'status')
      const label = status
        ? (AGENCY_REQUEST_STATUS_LABELS as Record<string, string>)[status]
        : undefined
      return {
        summary: `échange avec l'annonceur${label ? ` (${label.toLowerCase()})` : ''}`,
        changes: [],
      }
    }
  }
}
