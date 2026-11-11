import { z } from 'zod'

/**
 * Lot 26 (ADR 0036) : la page « Claude ». Ce qu'on sait de l'usage du
 * connecteur (le journal, canal `mcp` : une lecture ne laisse pas de trace,
 * aucune API ne liste les applications autorisées) et les demandes courtes
 * qu'un membre tape ou colle dans claude.ai pour lancer les prompts du
 * serveur MCP. Une seule source pour les noms et titres de ces prompts :
 * le serveur MCP les enregistre avec `MCP_PROMPT_TITLES`, la page les
 * affiche, un test vérifie qu'ils ne divergent pas.
 */

/** Les cinq prompts du serveur MCP. */
export const McpPromptNameSchema = z.enum([
  'analyze_listing',
  'explore_listings',
  'review_listings',
  'ask_agencies',
  'check_agency_answers',
])
export type McpPromptName = z.infer<typeof McpPromptNameSchema>

/** Le titre de chaque prompt, tel que claude.ai l'affiche. */
export const MCP_PROMPT_TITLES: Record<McpPromptName, string> = {
  analyze_listing: 'Analyser cette annonce',
  explore_listings: 'Explorer les portails',
  review_listings: 'Tournée de mise à jour des annonces',
  ask_agencies: 'Poser les questions ouvertes aux agences',
  check_agency_answers: 'Relever les réponses des agences',
}

export interface ClaudeRequest {
  prompt: McpPromptName
  /** Ce que la demande fait, en quelques mots. */
  what: string
  /** La demande courte à taper ou coller dans claude.ai. */
  request: string
  /** Une précision (Claude in Chrome, accord demandé…), ou null. */
  note: string | null
}

/**
 * Les demandes à copier, dans l'ordre d'usage : trouver, ajouter, vérifier,
 * questionner, relever. Courtes : le déroulé complet est dans le prompt du
 * serveur, jamais recopié ici.
 */
export const CLAUDE_REQUESTS: readonly ClaudeRequest[] = [
  {
    prompt: 'explore_listings',
    what: 'Chercher des annonces sur les portails',
    request:
      'Explore les portails avec mes critères apart-localizer et range ce que tu trouves dans « À valider ».',
    note: 'Claude in Chrome actif : Claude lit les portails dans ton navigateur ; rien n’entre dans la liste sans ton tri.',
  },
  {
    prompt: 'analyze_listing',
    what: 'Ajouter l’annonce ouverte',
    request:
      'Analyse l’annonce ouverte dans mon navigateur pour apart-localizer et ajoute-la après mon accord.',
    note: 'Claude te montre la fiche lue et attend ton accord avant d’écrire.',
  },
  {
    prompt: 'review_listings',
    what: 'Revérifier les annonces suivies',
    request:
      'Fais la tournée de vérification des annonces apart-localizer à revérifier.',
    note: 'Prix, vendeur, référence ; un changement de statut reste une proposition à confirmer.',
  },
  {
    prompt: 'ask_agencies',
    what: 'Poser les questions aux agences',
    request:
      'Prépare les questions ouvertes aux agences pour mes annonces apart-localizer et montre-les-moi avant d’envoyer.',
    note: 'Rien ne part sans ton accord ; l’envoi se fait depuis ta messagerie.',
  },
  {
    prompt: 'check_agency_answers',
    what: 'Relever les réponses',
    request:
      'Relève les réponses des agences à mes questions apart-localizer et dis-moi ce qui est à confirmer.',
    note: null,
  },
]

/** L'usage du connecteur par un membre, lu dans le journal (canal `mcp`). */
export const ClaudeMemberUsageSchema = z.object({
  memberId: z.string().uuid(),
  displayName: z.string(),
  writes: z
    .number()
    .int()
    .min(0)
    .describe('Écritures au journal par Claude au nom de ce membre'),
  lastWriteAt: z
    .string()
    .datetime()
    .describe('Date de la dernière écriture de Claude en son nom'),
})
export type ClaudeMemberUsage = z.infer<typeof ClaudeMemberUsageSchema>

/** Les faits que `claudeUsage` (domain) lit. */
export interface ClaudeUsageFacts {
  viewerId: string
  members: readonly ClaudeMemberUsage[]
}

export const ClaudeUsageStateSchema = z
  .enum(['never', 'workspace', 'me'])
  .describe(
    'never : Claude n’a rien écrit ; workspace : il écrit pour un autre membre ; me : il a écrit au nom du membre connecté'
  )
export type ClaudeUsageState = z.infer<typeof ClaudeUsageStateSchema>

export const ClaudeUsageSchema = z.object({
  state: ClaudeUsageStateSchema,
  title: z.string(),
  text: z.string(),
  lastWriteAt: z.string().datetime().nullable(),
  writes: z
    .number()
    .int()
    .min(0)
    .describe('Écritures de Claude au journal de l’espace, tous membres'),
})
export type ClaudeUsage = z.infer<typeof ClaudeUsageSchema>

/** `GET /activity/claude` : l'usage du connecteur, vu par le membre connecté. */
export const ClaudeStatusSchema = z.object({
  usage: ClaudeUsageSchema,
  members: z
    .array(ClaudeMemberUsageSchema)
    .describe(
      'Les membres actifs au nom desquels Claude a écrit, le plus récent d’abord'
    ),
})
export type ClaudeStatus = z.infer<typeof ClaudeStatusSchema>
