/**
 * Un paquet chargé au premier usage, puis gardé (ADR 0048).
 *
 * Sur Vercel, chaque démarrage à froid paie le chargement de tout ce que
 * l'application importe, et le temps CPU est compté. Un paquet lourd qui ne
 * sert qu'à une route (SDK Anthropic pour l'extraction, SDK MCP pour /mcp)
 * ou qu'avec une variable (Sentry avec un DSN) passe par ici : les autres
 * démarrages ne le chargent pas.
 */
export function lazyModule<T>(load: () => T): () => T {
  let loaded: { value: T } | null = null
  return () => {
    loaded ??= { value: load() }
    return loaded.value
  }
}
