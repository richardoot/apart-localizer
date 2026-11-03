import { spawnSync } from 'node:child_process'

/**
 * Lancement des commandes externes (supabase, podman, pnpm), injecté pour
 * que l'orchestrateur se teste sans rien lancer.
 */
export interface RunResult {
  status: number
  stdout: string
  stderr: string
}

export interface RunOptions {
  env?: NodeJS.ProcessEnv
  cwd?: string
  /** Garder la sortie (sinon elle s'affiche dans le terminal). */
  capture?: boolean
}

export interface Runner {
  run(command: string, args: readonly string[], options?: RunOptions): RunResult
  /** Vrai si la commande existe dans le PATH. */
  has(command: string): boolean
}

export const processRunner: Runner = {
  run(command, args, options = {}) {
    const result = spawnSync(command, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      encoding: 'utf8',
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      maxBuffer: 64 * 1024 * 1024,
    })
    if (result.error) {
      return { status: 127, stdout: '', stderr: result.error.message }
    }
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    }
  },
  has(command) {
    return (
      spawnSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' })
        .status === 0
    )
  },
}
