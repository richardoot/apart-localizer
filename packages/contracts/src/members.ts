import { z } from 'zod'
import { MemberRoleSchema } from './enums.js'
import type { MemberRole, MemberStatus } from './enums.js'

/**
 * Invitations et rôles (lot 8, besoins K5 et K6). Une invitation est une
 * ligne de membre en attente (`status = invited`, sans compte rattaché),
 * datée et qui expire ; la personne la rejoint à sa première connexion
 * Google (e-mail vérifié) ou, si elle a déjà son propre espace, par le
 * bandeau du web. Seul un propriétaire invite, annule ou retire ; un espace
 * garde toujours au moins un propriétaire. Voir l'ADR 0018.
 */

/** Durée de validité d'une invitation par défaut, en jours. */
export const DEFAULT_INVITATION_TTL_DAYS = 14
/** Durée de validité maximale réglable (`INVITATION_TTL_DAYS`), en jours. */
export const MAX_INVITATION_TTL_DAYS = 90
/** Invitations en attente (non expirées) par espace, au plus. */
export const MAX_PENDING_INVITATIONS = 10

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Propriétaire',
  member: 'Membre',
}

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  active: 'Membre',
  invited: 'Invité',
  canceled: 'Invitation annulée',
  declined: 'Invitation refusée',
  removed: 'Ancien membre',
}

export const InvitationStateSchema = z
  .enum(['pending', 'expired', 'declined', 'canceled', 'accepted'])
  .describe(
    "État d'une invitation : en attente, expirée, refusée par la personne, annulée par un propriétaire, acceptée"
  )
export type InvitationState = z.infer<typeof InvitationStateSchema>

export const INVITATION_STATE_LABELS: Record<InvitationState, string> = {
  pending: 'En attente',
  expired: 'Expirée',
  declined: 'Refusée',
  canceled: 'Annulée',
  accepted: 'Acceptée',
}

/** Adresse e-mail saisie : espaces retirés, en minuscules, 254 caractères au plus. */
export const InvitationEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Adresse e-mail invalide')
  .max(254)
  .describe(
    'Adresse e-mail de la personne invitée (celle de son compte Google)'
  )

/** Un nom d'une ligne : ni retour à la ligne ni caractère de contrôle (il entre dans le sujet d'un e-mail). */
const NO_CONTROL_CHARACTERS = /^[^\p{Cc}]*$/u

/** `POST /workspace/invitations` : qui inviter. */
export const InvitationInputSchema = z.object({
  email: InvitationEmailSchema,
  displayName: z
    .string()
    .trim()
    .min(1, 'Nom affiché requis')
    .max(120)
    .regex(NO_CONTROL_CHARACTERS, 'Le nom tient sur une ligne')
    .describe("Nom affiché dans l'espace (« Léa »)"),
})
export type InvitationInput = z.infer<typeof InvitationInputSchema>

const MemberRefSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
})

/** Une invitation de l'espace, telle que ses membres la voient. */
export const InvitationSchema = z.object({
  id: z
    .string()
    .uuid()
    .describe('Identifiant de la ligne de membre en attente'),
  workspaceId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  state: InvitationStateSchema,
  invitedAt: z.string().datetime(),
  expiresAt: z.string().datetime().describe("Date d'échéance de l'invitation"),
  invitedBy: MemberRefSchema.nullable().describe(
    "Le propriétaire qui a invité ; null s'il n'est plus connu"
  ),
  closedAt: z
    .string()
    .datetime()
    .nullable()
    .describe("Date de l'annulation ou du refus ; null sinon"),
})
export type Invitation = z.infer<typeof InvitationSchema>

/** Comment l'invitation est parvenue (ou doit parvenir) à la personne. */
export const InvitationDeliverySchema = z.object({
  email: z
    .enum(['sent', 'failed', 'disabled'])
    .describe(
      "E-mail d'invitation : envoyé, en échec, ou envoi non configuré (lien à transmettre soi-même)"
    ),
  link: z
    .string()
    .url()
    .describe("Le lien de l'application à transmettre à la personne invitée"),
})
export type InvitationDelivery = z.infer<typeof InvitationDeliverySchema>

/** Réponse de `POST /workspace/invitations`. */
export const InvitationWriteResultSchema = z.object({
  invitation: InvitationSchema,
  renewed: z
    .boolean()
    .describe(
      'Vrai si une invitation expirée, annulée ou refusée de la même adresse a été renouvelée'
    ),
  delivery: InvitationDeliverySchema,
})
export type InvitationWriteResult = z.infer<typeof InvitationWriteResultSchema>

/** Une invitation reçue par la personne connectée, vers un autre espace (bandeau). */
export const ReceivedInvitationSchema = z.object({
  id: z.string().uuid(),
  workspace: z.object({ id: z.string().uuid(), name: z.string() }),
  displayName: z
    .string()
    .describe('Le nom sous lequel la personne est invitée'),
  invitedByName: z.string().nullable(),
  invitedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
})
export type ReceivedInvitation = z.infer<typeof ReceivedInvitationSchema>

/** `PATCH /workspace/members/:id` : changer le rôle d'un membre. */
export const MemberRoleUpdateSchema = z.object({
  role: MemberRoleSchema,
})
export type MemberRoleUpdate = z.infer<typeof MemberRoleUpdateSchema>

/** `PATCH /workspace` : renommer l'espace. */
export const WorkspaceUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nom requis')
    .max(120)
    .regex(NO_CONTROL_CHARACTERS, 'Le nom tient sur une ligne')
    .describe("Nom de l'espace (« Appartement à Bordeaux »)"),
})
export type WorkspaceUpdate = z.infer<typeof WorkspaceUpdateSchema>
