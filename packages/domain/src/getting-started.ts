import type {
  GettingStarted,
  GettingStartedFacts,
  GettingStartedStep,
} from '@apart/contracts'
import { plural } from './format.js'

/**
 * Lot 23 (ADR 0033) : la mise en route d'un espace. Quatre étapes dans
 * l'ordre conseillé : les hypothèses (les calculs en dépendent), les
 * critères (les annonces s'y comparent), une première annonce, puis
 * Claude. Une étape est faite d'après les faits de l'espace, rien d'autre ;
 * Claude n'est vu que s'il a déjà écrit (une lecture ne laisse pas de
 * trace), et le texte le dit. Pur.
 */

/** Le libellé des hypothèses créées d'office, avant tout enregistrement. */
export const DEFAULT_ASSUMPTIONS_LABEL = 'Hypothèses par défaut'

/**
 * Les hypothèses ont été enregistrées par un membre : plus d'une version, ou
 * une version qui n'est pas celle créée d'office.
 */
export function assumptionsSaved(
  versions: readonly { label: string | null }[]
): boolean {
  return (
    versions.length > 1 ||
    versions.some(v => v.label !== DEFAULT_ASSUMPTIONS_LABEL)
  )
}

function steps(facts: GettingStartedFacts): GettingStartedStep[] {
  return [
    {
      key: 'assumptions',
      done: facts.assumptionsSaved,
      title: 'Régler tes hypothèses',
      text: facts.assumptionsSaved
        ? 'Enregistrées : chaque annonce se calcule avec elles.'
        : 'Apport, prêt, loyer visé : tous les calculs des annonces en dépendent.',
    },
    {
      key: 'criteria',
      done: facts.criteriaCount > 0,
      title: 'Dessiner tes critères de recherche',
      text:
        facts.criteriaCount > 0
          ? `${plural(facts.criteriaCount, 'critère actif', 'critères actifs')}.`
          : 'Où chercher, quel budget, quelle surface : chaque annonce s’y compare.',
    },
    {
      key: 'listing',
      done: facts.listingCount > 0,
      title: 'Ajouter une première annonce',
      text:
        facts.listingCount > 0
          ? `${plural(facts.listingCount, 'annonce suivie', 'annonces suivies')}.`
          : facts.draftCount > 0
            ? `${plural(facts.draftCount, 'annonce attend', 'annonces attendent')} à l’étape À valider : garde celles qui te plaisent.`
            : 'Colle le lien ou le texte d’une annonce : l’IA remplit la fiche, tu vérifies.',
    },
    {
      key: 'claude',
      done: facts.claudeSeen,
      title: 'Connecter Claude',
      text: facts.claudeSeen
        ? 'Claude a déjà écrit dans l’espace.'
        : 'Il cherche des annonces, les vérifie et prépare les questions aux agences. L’application le verra à sa première écriture.',
    },
  ]
}

/**
 * La mise en route : en entier tant que l'espace n'a ni annonce ni annonce à
 * valider (elle remplace les chiffres de l'accueil), en bref tant qu'une
 * étape reste, rien quand tout est fait.
 */
export function gettingStarted(facts: GettingStartedFacts): GettingStarted {
  const list = steps(facts)
  const doneCount = list.filter(s => s.done).length
  const empty = facts.listingCount + facts.draftCount === 0
  return {
    mode: empty ? 'full' : doneCount < list.length ? 'compact' : 'none',
    doneCount,
    steps: list,
  }
}
