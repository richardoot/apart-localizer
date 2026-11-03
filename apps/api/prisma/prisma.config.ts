import path from 'node:path'
import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'

// Les scripts `prisma:*` s'exécutent depuis apps/api (pnpm --filter) ; les
// chemins sont résolus depuis ce répertoire. Pas d'`import.meta` ici : le
// fichier est type-checké avec le reste de l'API, qui compile en CommonJS.
const apiRoot = process.cwd()

// apps/api/.env : jamais commité, voir .env.example.
config({ path: path.join(apiRoot, '.env') })

// Les migrations passent par la connexion directe quand elle existe (le
// pooler Supabase ne supporte pas les instructions DDL de longue durée).
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL

export default defineConfig({
  schema: path.join(apiRoot, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(apiRoot, 'prisma', 'migrations'),
  },
  // `prisma generate` n'a pas besoin de base ; les commandes de migration si.
  ...(connectionString ? { datasource: { url: connectionString } } : {}),
})
