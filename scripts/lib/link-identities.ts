/**
 * Raccordement des membres pré-créés à leur identité GoTrue locale (ADR 0004).
 *
 * `members.auth_user_id` est une chaîne, pas une clé étrangère vers `auth` :
 * un membre importé (Richard et Chloé, `import:artifact`) n'en a pas avant
 * la première connexion, et un membre restauré d'une autre base pointe vers
 * une identité que ce GoTrue ne connaît pas. Le garde de l'API rattache par
 * e-mail à la première requête ; ce script le fait d'avance, après chaque
 * `stack:up`, pour que la connexion locale tombe tout de suite sur les bonnes
 * annonces.
 *
 * Règles, prudentes :
 *  - seul un membre sans identité, ou dont l'identité n'existe pas dans
 *    `auth.users`, est rattaché ; un membre déjà relié à un compte existant
 *    n'est jamais déplacé ;
 *  - l'e-mail se compare sans la casse (comme le garde) ;
 *  - une identité déjà prise par un autre membre n'est pas volée : le
 *    conflit est signalé, avec sa correction ;
 *  - deux membres du même e-mail : le plus ancien l'emporte (comme le garde).
 */

export interface MemberRow {
  id: string
  handle: string
  email: string | null
  authUserId: string | null
  workspaceName: string
  createdAt: Date
}

export interface AuthUserRow {
  id: string
  email: string | null
}

export interface IdentityLink {
  memberId: string
  label: string
  authUserId: string
  /** L'identité précédente, absente de `auth.users` (restauration, comptes recréés). */
  replaces: string | null
}

export interface IdentityPlan {
  link: IdentityLink[]
  /** Membres déjà reliés à un compte local existant. */
  linked: string[]
  /** Un e-mail sans compte local : se connecter une fois (Google, ou compte e-mail du même nom). */
  orphans: string[]
  /** Un membre sans e-mail : rien à quoi le rattacher. */
  withoutEmail: string[]
  /** L'identité de cet e-mail appartient déjà à un autre membre. */
  conflicts: string[]
}

const labelOf = (m: MemberRow) =>
  `${m.email ?? m.handle} (« ${m.handle} », espace « ${m.workspaceName} »)`

export function planIdentityLinks(
  members: readonly MemberRow[],
  authUsers: readonly AuthUserRow[]
): IdentityPlan {
  const authIds = new Set(authUsers.map(u => u.id))
  const byEmail = new Map<string, string>()
  for (const user of authUsers) {
    if (user.email) byEmail.set(user.email.toLowerCase(), user.id)
  }
  const taken = new Map<string, MemberRow>()
  for (const m of members) {
    if (m.authUserId && authIds.has(m.authUserId)) taken.set(m.authUserId, m)
  }
  const plan: IdentityPlan = {
    link: [],
    linked: [],
    orphans: [],
    withoutEmail: [],
    conflicts: [],
  }
  const ordered = [...members].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
  )
  for (const m of ordered) {
    if (m.authUserId && authIds.has(m.authUserId)) {
      plan.linked.push(labelOf(m))
      continue
    }
    if (!m.email) {
      plan.withoutEmail.push(labelOf(m))
      continue
    }
    const target = byEmail.get(m.email.toLowerCase())
    if (!target) {
      plan.orphans.push(labelOf(m))
      continue
    }
    const holder = taken.get(target)
    if (holder) {
      plan.conflicts.push(
        `${labelOf(m)} : le compte local de ${m.email} est déjà relié à « ${holder.handle} » ` +
          `de l'espace « ${holder.workspaceName} » (créé à une connexion antérieure ?). ` +
          `Pour basculer : UPDATE app.members SET auth_user_id = NULL WHERE id = '${holder.id}'; ` +
          'puis relancez pnpm stack:up.'
      )
      continue
    }
    taken.set(target, m)
    plan.link.push({
      memberId: m.id,
      label: labelOf(m),
      authUserId: target,
      replaces: m.authUserId,
    })
  }
  return plan
}
