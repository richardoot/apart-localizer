import {
  BadGatewayException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'

/** 503 : pas de clé côté serveur ; le reste de l'application fonctionne. */
export class AiNotConfiguredException extends ServiceUnavailableException {
  constructor() {
    super(
      "IA non configurée : renseignez ANTHROPIC_API_KEY côté serveur pour activer l'extraction."
    )
  }
}

/** 503 : le service IA ne répond pas (limite de débit, panne, réseau, clé refusée). */
export class AiUnavailableException extends ServiceUnavailableException {
  constructor(detail: string) {
    super(`Le service IA est indisponible : ${detail}`)
  }
}

/** 422 : le modèle a refusé d'analyser ce contenu. */
export class AiRefusedException extends UnprocessableEntityException {
  constructor(category: string | null) {
    super(
      `L'IA a refusé d'analyser ce contenu${category ? ` (catégorie ${category})` : ''} ; vérifiez le texte collé.`
    )
  }
}

/** 502 : la réponse du modèle est inexploitable (tronquée, hors schéma). */
export class AiBadResponseException extends BadGatewayException {
  constructor(detail: string) {
    super(`Réponse de l'IA inexploitable : ${detail}`)
  }
}
