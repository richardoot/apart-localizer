/**
 * Le moteur de conteneurs que la CLI Supabase et `compose` doivent viser.
 *
 * La CLI Supabase parle à l'API Docker ; avec podman sur macOS, elle doit
 * passer par le socket de la machine podman (`DOCKER_HOST=unix://…`). Un
 * `DOCKER_HOST` hérité qui pointe vers un socket disparu (ancien Docker
 * Desktop, machine recréée) est la panne la plus fréquente : il est remplacé
 * par le socket podman, en le disant. « Joignable » veut dire qu'un processus
 * écoute sur le socket : un fichier de socket resté sur le disque ne suffit
 * pas.
 */

import net from 'node:net'

export interface DockerHostInput {
  /** `DOCKER_HOST` de l'environnement, s'il est défini. */
  current: string | undefined
  /** Le socket de la machine podman (macOS) ou du service podman (Linux), s'il est connu. */
  podmanSocket: string | null
  /** Le socket Docker par défaut (`/var/run/docker.sock`) répond-il ? */
  dockerSocketAlive: boolean
  /** Un processus écoute-t-il sur ce socket ? Calculé d'avance (`socketAlive`), injecté pour les tests. */
  alive: (path: string) => boolean
}

export interface DockerHostDecision {
  /** La valeur à donner à `DOCKER_HOST` ; `undefined` = laisser le défaut de Docker. */
  value: string | undefined
  /** Ce qui a été décidé, pour le journal du démarrage. */
  reason: string
}

const unixPath = (value: string): string | null =>
  value.startsWith('unix://') ? value.slice('unix://'.length) : null

export function resolveDockerHost(input: DockerHostInput): DockerHostDecision {
  const podman =
    input.podmanSocket && input.alive(input.podmanSocket)
      ? `unix://${input.podmanSocket}`
      : null

  if (input.current) {
    const path = unixPath(input.current)
    if (path === null) {
      return {
        value: input.current,
        reason: `DOCKER_HOST conservé (${input.current})`,
      }
    }
    if (input.alive(path)) {
      return {
        value: input.current,
        reason: `DOCKER_HOST conservé (${input.current})`,
      }
    }
    if (podman) {
      return {
        value: podman,
        reason: `DOCKER_HOST visait un socket qui ne répond pas (${input.current}) : remplacé par celui de podman (${podman})`,
      }
    }
    throw new Error(
      `DOCKER_HOST vise ${input.current}, qui ne répond pas, et aucune machine podman ne répond. ` +
        'Démarrez Docker ou podman (`podman machine start`), ou corrigez DOCKER_HOST.'
    )
  }
  if (podman) {
    return { value: podman, reason: `socket podman (${podman})` }
  }
  if (input.dockerSocketAlive) {
    return {
      value: undefined,
      reason: 'socket Docker par défaut (/var/run/docker.sock)',
    }
  }
  throw new Error(
    'Aucun moteur de conteneurs joignable : ni socket podman ni /var/run/docker.sock. ' +
      'Installez et démarrez podman (`podman machine init && podman machine start`) ou Docker.'
  )
}

/** Vrai si un processus accepte la connexion sur ce socket Unix (une seconde au plus). */
export function socketAlive(path: string, timeoutMs = 1000): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ path })
    const done = (alive: boolean) => {
      socket.destroy()
      resolve(alive)
    }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

/** Une machine podman telle que `podman machine list --format json` la décrit. */
export interface PodmanMachine {
  name: string
  running: boolean
  starting: boolean
  isDefault: boolean
}

export function parsePodmanMachines(json: string): PodmanMachine[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter(
      (m): m is Record<string, unknown> => typeof m === 'object' && m !== null
    )
    .map(m => ({
      name: typeof m.Name === 'string' ? m.Name.replace(/\*$/, '') : '',
      running: m.Running === true,
      starting: m.Starting === true,
      isDefault: m.Default === true,
    }))
    .filter(m => m.name !== '')
}

/** La machine à utiliser : celle qui tourne, sinon la machine par défaut, sinon la première. */
export function pickPodmanMachine(
  machines: PodmanMachine[]
): PodmanMachine | null {
  return (
    machines.find(m => m.running) ??
    machines.find(m => m.isDefault) ??
    machines[0] ??
    null
  )
}
