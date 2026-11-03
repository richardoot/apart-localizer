/**
 * Les arguments de la ligne de commande, sans le séparateur `--` que pnpm
 * transmet tel quel (`pnpm import:dvf -- --year 2024`) et que `parseArgs`
 * refuserait comme argument positionnel. `pnpm import:dvf --year 2024`
 * fonctionne aussi.
 */
export function cliArgs(argv: readonly string[] = process.argv): string[] {
  return argv.slice(2).filter(arg => arg !== '--')
}
