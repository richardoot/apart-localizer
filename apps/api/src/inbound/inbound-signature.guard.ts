import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyInboundSignature,
} from './inbound-signature'

type RawRequest = Request & { rawBody?: Buffer }

/**
 * Le webhook n'accepte qu'un appel signé avec le secret du serveur, avant
 * même la lecture du corps. Sans secret configuré, il est désactivé (503).
 */
@Injectable()
export class InboundSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env.INBOUND_EMAIL_SECRET?.trim()
    if (!secret) {
      throw new ServiceUnavailableException(
        "Le webhook d'alertes e-mail n'est pas configuré (INBOUND_EMAIL_SECRET)."
      )
    }
    const request = context.switchToHttp().getRequest<RawRequest>()
    const header = (name: string): string | undefined => {
      const value = request.headers[name]
      return Array.isArray(value) ? value[0] : value
    }
    const check = verifyInboundSignature({
      secret,
      timestamp: header(TIMESTAMP_HEADER),
      signature: header(SIGNATURE_HEADER),
      rawBody: request.rawBody,
    })
    if (!check.ok) {
      throw new UnauthorizedException(
        check.reason === 'stale'
          ? 'Signature périmée : horodatage hors des cinq minutes.'
          : 'Signature du webhook absente ou invalide.'
      )
    }
    return true
  }
}
