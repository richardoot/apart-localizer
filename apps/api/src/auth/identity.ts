import type { User as SupabaseUser } from '@supabase/supabase-js'

/**
 * Ce que l'API retient d'une identité Supabase pour résoudre le membre :
 * l'identifiant, l'adresse et si cette adresse est vérifiée.
 */
export interface AuthIdentity {
  id: string
  /** En minuscules, sans espaces ; null si le compte n'en a pas. */
  email: string | null
  emailVerified: boolean
  displayName: string
}

/** The name Google (or the e-mail) gives this person, for a member created on first sight. */
export function displayNameOf(user: SupabaseUser): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const candidates = [meta?.full_name, meta?.name, user.email?.split('@')[0]]
  const found = candidates.find(
    (value): value is string => typeof value === 'string' && value.trim() !== ''
  )
  return found?.trim() ?? 'Membre'
}

/**
 * L'adresse de ce compte est-elle vérifiée ? (lot 8, ADR 0018)
 *
 * `GET /auth/v1/user` (ce que `SupabaseService.getUser` appelle) rend
 * l'utilisateur GoTrue, pas les revendications brutes du JWT. On s'y fie
 * ainsi :
 *  - `email_confirmed_at` doit être renseigné. GoTrue l'écrit lui-même :
 *    pour Google, à la connexion quand Google dit `email_verified: true` ;
 *    pour un compte e-mail et mot de passe, après le lien de confirmation (ou
 *    tout de suite si la confirmation est désactivée, ce qui n'est le cas
 *    qu'en local, ADR 0016) ;
 *  - aucune identité d'un fournisseur externe (Google…) portant cette
 *    adresse ne doit dire `email_verified: false` dans `identity_data`
 *    (revendications du fournisseur, réécrites par GoTrue à chaque connexion).
 *    Cela couvre un GoTrue réglé pour confirmer d'office (« autoconfirm ») :
 *    il remplirait `email_confirmed_at` même pour une adresse que Google n'a
 *    pas vérifiée.
 * `user_metadata.email_verified` n'est PAS lu : la personne peut le réécrire
 * elle-même (`supabase.auth.updateUser({ data })`).
 */
export function isEmailVerified(user: SupabaseUser): boolean {
  const email = user.email?.trim().toLowerCase()
  if (!email || !user.email_confirmed_at) return false
  for (const identity of user.identities ?? []) {
    if (identity.provider === 'email') continue
    const data = (identity.identity_data ?? {}) as Record<string, unknown>
    const sameAddress =
      typeof data.email === 'string' &&
      data.email.trim().toLowerCase() === email
    if (sameAddress && data.email_verified === false) return false
  }
  return true
}

/** L'identité d'un utilisateur Supabase, telle que les gardes la transmettent. */
export function identityOf(user: SupabaseUser): AuthIdentity {
  const email = user.email?.trim().toLowerCase() || null
  return {
    id: user.id,
    email,
    emailVerified: email !== null && isEmailVerified(user),
    displayName: displayNameOf(user),
  }
}
