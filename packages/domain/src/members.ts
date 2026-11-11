import {
  DEFAULT_INVITATION_TTL_DAYS,
  MAX_INVITATION_TTL_DAYS,
  MAX_PENDING_INVITATIONS,
} from '@apart/contracts'
import type {
  InvitationState,
  MemberRole,
  MemberStatus,
} from '@apart/contracts'
import { formatActivityDate } from './activity.js'

/**
 * Les règles des membres d'un espace (lot 8, besoins K5 et K6) : qui peut
 * inviter, annuler, retirer, changer un rôle ou partir ; quelle ligne une
 * identité rattache à sa première connexion ; ce que devient l'espace qu'on
 * quitte pour en rejoindre un autre. Pur : l'API applique, le web affiche.
 *
 * Invariant : un espace garde toujours au moins un propriétaire actif, sauf
 * l'espace personnel que son unique membre quitte pour rejoindre un autre
 * espace (il reste intact, sans membre actif : ADR 0018).
 */

/** Ce que les règles lisent d'une ligne de membre. */
export interface MemberLike {
  id: string
  role: MemberRole
  status: MemberStatus
  email: string | null
  authUserId: string | null
  /** Null pour un membre pré-créé (import) ou créé à sa première connexion. */
  invitedAt: Date | string | null
  invitationExpiresAt: Date | string | null
  createdAt?: Date | string
}

/** Un refus, avec la sorte d'erreur HTTP qu'il appelle. */
export interface MemberRefusal {
  code: 'forbidden' | 'not_found' | 'conflict'
  message: string
}

const time = (value: Date | string | null | undefined): number =>
  value === null || value === undefined ? Number.NaN : new Date(value).getTime()

/** Une adresse e-mail comparable : sans espaces, en minuscules ; null si vide. */
export function normalizeEmail(
  email: string | null | undefined
): string | null {
  const flat = email?.trim().toLowerCase()
  return flat ? flat : null
}

/** Vrai si deux adresses sont la même, sans la casse. */
export function sameEmail(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = normalizeEmail(a)
  return left !== null && left === normalizeEmail(b)
}

/**
 * La durée de validité d'une invitation, en jours, d'après la variable
 * `INVITATION_TTL_DAYS` : entier de 1 à 90, sinon la valeur par défaut (14).
 */
export function invitationTtlDays(
  raw: string | number | null | undefined
): number {
  const value =
    typeof raw === 'number' ? raw : Number(raw?.trim() || Number.NaN)
  return Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_INVITATION_TTL_DAYS
    ? value
    : DEFAULT_INVITATION_TTL_DAYS
}

/** L'échéance d'une invitation envoyée maintenant. */
export function invitationExpiry(now: Date, ttlDays: number): Date {
  return new Date(now.getTime() + ttlDays * 24 * 3600 * 1000)
}

/** Vrai pour un membre actif de l'espace (relié à son compte ou pré-créé). */
export function isActiveMember(member: Pick<MemberLike, 'status'>): boolean {
  return member.status === 'active'
}

/**
 * L'état de l'invitation d'une ligne de membre, ou null si la ligne n'a
 * jamais été une invitation (membre pré-créé, créé à sa première connexion).
 */
export function invitationState(
  member: Pick<MemberLike, 'status' | 'invitedAt' | 'invitationExpiresAt'>,
  now: Date
): InvitationState | null {
  if (member.invitedAt === null) return null
  switch (member.status) {
    case 'invited':
      return time(member.invitationExpiresAt) > now.getTime()
        ? 'pending'
        : 'expired'
    case 'canceled':
      return 'canceled'
    case 'declined':
      return 'declined'
    default:
      return 'accepted'
  }
}

/** Vrai pour une invitation en attente et non expirée. */
export function isPendingInvitation(
  member: Pick<MemberLike, 'status' | 'invitedAt' | 'invitationExpiresAt'>,
  now: Date
): boolean {
  return invitationState(member, now) === 'pending'
}

/** Les propriétaires actifs. */
export function activeOwners<T extends Pick<MemberLike, 'role' | 'status'>>(
  members: readonly T[]
): T[] {
  return members.filter(m => m.status === 'active' && m.role === 'owner')
}

/**
 * La ligne qu'une identité dont l'e-mail est vérifié rattache à sa première
 * connexion (ADR 0004, prolongé par l'ADR 0018) :
 *  1. un membre pré-créé (import, sans invitation) de même e-mail, le plus
 *     ancien ;
 *  2. sinon l'invitation en attente et non expirée de même e-mail la plus
 *     récente.
 * Jamais une ligne déjà reliée, retirée, annulée, refusée ou expirée.
 */
export function claimableMember<T extends MemberLike>(
  candidates: readonly T[],
  email: string,
  now: Date
): T | null {
  const free = candidates.filter(
    m => m.authUserId === null && sameEmail(m.email, email)
  )
  const preCreated = free
    .filter(m => m.status === 'active' && m.invitedAt === null)
    .sort((a, b) => time(a.createdAt) - time(b.createdAt))
  if (preCreated[0]) return preCreated[0]
  const invitations = free
    .filter(m => isPendingInvitation(m, now))
    .sort((a, b) => time(b.invitedAt) - time(a.invitedAt))
  return invitations[0] ?? null
}

/** Une action réservée aux propriétaires actifs (« inviter », « renommer l'espace »…). */
export function ownerRefusal(
  actor: Pick<MemberLike, 'role' | 'status'>,
  action: string
): MemberRefusal | null {
  return actor.status === 'active' && actor.role === 'owner'
    ? null
    : {
        code: 'forbidden',
        message: `Seul un propriétaire de l'espace peut ${action}.`,
      }
}

/**
 * Inviter cette adresse : refus si l'auteur n'est pas propriétaire, si
 * l'adresse est celle d'un membre actif, si une invitation est déjà en
 * attente pour elle, ou si l'espace a déjà trop d'invitations en attente.
 */
export function invitationRefusal(input: {
  actor: MemberLike
  email: string
  members: readonly MemberLike[]
  now: Date
  maxPending?: number
}): MemberRefusal | null {
  const forbidden = ownerRefusal(input.actor, 'inviter')
  if (forbidden) return forbidden
  const max = input.maxPending ?? MAX_PENDING_INVITATIONS
  if (
    input.members.some(
      m => isActiveMember(m) && sameEmail(m.email, input.email)
    )
  ) {
    return {
      code: 'conflict',
      message: "Cette adresse est déjà celle d'un membre de l'espace.",
    }
  }
  const pending = input.members.filter(m => isPendingInvitation(m, input.now))
  if (pending.some(m => sameEmail(m.email, input.email))) {
    return {
      code: 'conflict',
      message: 'Une invitation est déjà en attente pour cette adresse.',
    }
  }
  if (pending.length >= max) {
    return {
      code: 'conflict',
      message: `Déjà ${max} invitations en attente : annules-en une avant d'inviter.`,
    }
  }
  return null
}

/**
 * La ligne à réutiliser pour inviter cette adresse : un ancien membre de
 * même e-mail d'abord (réinvité, il retrouve son historique), sinon une
 * invitation expirée, annulée ou refusée ; la plus récente dans chaque cas.
 */
export function reusableMemberRow<T extends MemberLike>(
  members: readonly T[],
  email: string,
  now: Date
): T | null {
  const rows = members
    .filter(
      m =>
        m.authUserId === null &&
        sameEmail(m.email, email) &&
        m.status !== 'active' &&
        !isPendingInvitation(m, now)
    )
    .sort(
      (a, b) =>
        Number(b.status === 'removed') - Number(a.status === 'removed') ||
        time(b.createdAt) - time(a.createdAt)
    )
  return rows[0] ?? null
}

/** Annuler cette invitation (en attente, expirée ou refusée). */
export function cancelRefusal(
  actor: MemberLike,
  target: MemberLike | null
): MemberRefusal | null {
  const forbidden = ownerRefusal(actor, 'annuler une invitation')
  if (forbidden) return forbidden
  if (!target || target.invitedAt === null || target.status === 'removed') {
    return { code: 'not_found', message: 'Invitation introuvable' }
  }
  if (target.status === 'active') {
    return {
      code: 'conflict',
      message:
        "Cette personne a déjà rejoint l'espace : retire-la de la liste des membres.",
    }
  }
  if (target.status === 'canceled') {
    return { code: 'conflict', message: 'Cette invitation est déjà annulée.' }
  }
  return null
}

/** Retirer ce membre : par un propriétaire, jamais le dernier propriétaire. */
export function removalRefusal(
  actor: MemberLike,
  target: MemberLike | null,
  members: readonly MemberLike[]
): MemberRefusal | null {
  const forbidden = ownerRefusal(actor, 'retirer un membre')
  if (forbidden) return forbidden
  if (!target || !isActiveMember(target)) {
    return { code: 'not_found', message: "Membre introuvable dans l'espace" }
  }
  if (target.role === 'owner' && activeOwners(members).length <= 1) {
    return {
      code: 'conflict',
      message:
        "Le dernier propriétaire ne peut pas être retiré : nomme d'abord un autre propriétaire.",
    }
  }
  return null
}

/** Quitter l'espace soi-même : jamais le dernier propriétaire. */
export function leaveRefusal(
  member: MemberLike,
  members: readonly MemberLike[]
): MemberRefusal | null {
  if (member.role !== 'owner' || activeOwners(members).length > 1) return null
  const others = members.filter(m => isActiveMember(m) && m.id !== member.id)
  return {
    code: 'conflict',
    message:
      others.length > 0
        ? "Tu es le dernier propriétaire de l'espace : nomme un autre propriétaire avant de partir."
        : 'Tu es le seul membre de cet espace : le quitter ne servirait à rien (tu en recevrais un nouveau, vide).',
  }
}

/** Changer le rôle de ce membre : par un propriétaire, l'espace garde un propriétaire. */
export function roleChangeRefusal(
  actor: MemberLike,
  target: MemberLike | null,
  role: MemberRole,
  members: readonly MemberLike[]
): MemberRefusal | null {
  const forbidden = ownerRefusal(actor, 'changer un rôle')
  if (forbidden) return forbidden
  if (!target || !isActiveMember(target)) {
    return { code: 'not_found', message: "Membre introuvable dans l'espace" }
  }
  if (
    target.role === 'owner' &&
    role === 'member' &&
    activeOwners(members).length <= 1
  ) {
    return {
      code: 'conflict',
      message: "L'espace doit garder au moins un propriétaire.",
    }
  }
  return null
}

/** Ce que devient l'espace quitté pour en rejoindre un autre. */
export interface Departure {
  refusal: MemberRefusal | null
  /** Vrai si l'espace quitté n'a plus aucun membre actif (il reste intact). */
  orphaned: boolean
}

/**
 * Rejoindre un autre espace détache l'identité de son membre actuel. Refusé
 * au seul propriétaire d'un espace qui a d'autres membres actifs : il nomme
 * d'abord un autre propriétaire. Un espace sans autre membre actif (le
 * « Mon espace » de la première connexion) reste intact, orphelin.
 */
export function departureFor(
  member: MemberLike,
  members: readonly MemberLike[],
  workspaceName: string
): Departure {
  const others = members.filter(m => isActiveMember(m) && m.id !== member.id)
  const otherOwners = others.filter(m => m.role === 'owner')
  if (
    member.role === 'owner' &&
    otherOwners.length === 0 &&
    others.length > 0
  ) {
    return {
      refusal: {
        code: 'conflict',
        message: `Tu es le seul propriétaire de « ${workspaceName} », qui compte d'autres membres : nomme un autre propriétaire (page Espace) avant de rejoindre un autre espace.`,
      },
      orphaned: false,
    }
  }
  return { refusal: null, orphaned: others.length === 0 }
}

/** Un identifiant court libre dans l'espace : `lea`, sinon `lea-2`, `lea-3`… (40 caractères au plus). */
export function availableHandle(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const root = base.slice(0, 40) || 'membre'
  if (!used.has(root)) return root
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`
    const candidate = `${root.slice(0, 40 - suffix.length)}${suffix}`
    if (!used.has(candidate)) return candidate
  }
}

/** Le texte de l'e-mail d'invitation. */
export function invitationEmail(input: {
  workspaceName: string
  inviterName: string
  inviteeName: string
  email: string
  expiresAt: Date | string
  link: string
}): { subject: string; text: string } {
  const expires = formatActivityDate(new Date(input.expiresAt).toISOString())
  // Le sujet tient sur une ligne, quoi que contiennent les noms.
  const line = (value: string) => value.replace(/\s+/g, ' ').trim()
  return {
    subject: `${line(input.inviterName)} t’invite dans « ${line(input.workspaceName)} » (apart-localizer)`,
    text: [
      `Bonjour ${input.inviteeName},`,
      '',
      `${input.inviterName} t’invite à rejoindre l'espace « ${input.workspaceName} » sur apart-localizer, l'outil de suivi des annonces d'appartement.`,
      '',
      `Pour accepter, ouvre ${input.link} et connecte-toi avec Google, avec l'adresse ${input.email}.`,
      `L'invitation expire le ${expires}.`,
      '',
      'Si tu as déjà un espace dans l’application, un bandeau te proposera de rejoindre celui-ci ou de refuser.',
      'Si tu ne t’attendais pas à ce message, ignore-le : rien ne se passera.',
    ].join('\n'),
  }
}
