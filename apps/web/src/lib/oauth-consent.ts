/**
 * Les portées d'une demande OAuth en phrases : une portée est un mot pour
 * une machine, la personne qui décide lit une phrase. Une portée inconnue
 * reste affichée, nommée telle quelle.
 */
const SCOPE_SENTENCES: Record<string, string> = {
  openid: 'T’identifier auprès de cette application',
  email: 'Connaître ton adresse e-mail',
  profile: 'Connaître ton nom et ta photo de profil',
  phone: 'Connaître ton numéro de téléphone',
  offline_access: 'Rester connectée sans te redemander ton accord',
  'listings:read': 'Lire les annonces, avis, tâches et offres de ton espace',
  'listings:write':
    'Ajouter et modifier des annonces, avis, tâches et offres (jamais de suppression)',
}

export function describeScope(scope: string): string {
  return SCOPE_SENTENCES[scope] ?? `Permission « ${scope} »`
}

/** L'hôte (et le port) de l'adresse de retour du client, pour que la personne sache où elle repart. */
export function redirectHost(uri: string): string {
  if (!uri) return ''
  try {
    return new URL(uri).host
  } catch {
    return uri
  }
}
