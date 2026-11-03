import { Injectable, Logger } from '@nestjs/common'
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common'
import type { Request } from 'express'
import { from, mergeMap, type Observable } from 'rxjs'
import { NotificationDispatcher } from './notification-dispatcher.service'

const READS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Après chaque requête d'écriture réussie, les notifications en attente
 * partent (push, e-mail) avant la réponse : sur une fonction serverless, ce
 * qui suivrait la réponse ne serait pas garanti. Un échec d'envoi n'échoue
 * jamais la requête.
 */
@Injectable()
export class NotificationDeliveryInterceptor implements NestInterceptor {
  private readonly logger = new Logger(NotificationDeliveryInterceptor.name)

  constructor(private readonly dispatcher: NotificationDispatcher) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()
    const request = context.switchToHttp().getRequest<Request>()
    if (READS.has(request.method)) return next.handle()
    return next.handle().pipe(
      mergeMap(value =>
        from(
          this.dispatcher.deliverPending().then(
            () => value,
            (error: unknown) => {
              this.logger.warn(
                `Envoi des notifications en échec : ${error instanceof Error ? error.message : 'inconnu'}`
              )
              return value
            }
          )
        )
      )
    )
  }
}
