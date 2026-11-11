import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Response } from 'express'
import * as Sentry from '@sentry/nestjs'
import { Prisma } from '../../generated/prisma'

/** What the request-log middleware stamped on this response, if it ran. */
function requestIdOf(response: Response): string | undefined {
  const id: unknown = response.locals?.requestId
  return typeof id === 'string' ? id : undefined
}

/** The shape every error answer takes; what Nest's own exceptions produce. */
interface ErrorBody {
  statusCode: number
  message: string | string[]
  [key: string]: unknown
}

/**
 * One answer shape for every failure, and nothing internal leaked.
 *
 * Nest's HttpExceptions (including nestjs-zod's ZodValidationException, a
 * BadRequestException carrying the issues) pass through as they are. Known
 * Prisma errors become the status they mean. Everything else is a 500 with
 * the request id in the body, so the reference a user reads in a toast is
 * the one to search the logs for.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const exceptionResponse = exception.getResponse()
      this.answer(
        response,
        typeof exceptionResponse === 'string'
          ? { statusCode: status, message: exceptionResponse }
          : (exceptionResponse as ErrorBody)
      )
      return
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.answer(response, this.handlePrismaError(exception))
      return
    }

    const message =
      exception instanceof Error ? exception.message : 'Internal server error'
    this.logger.error(
      `Unhandled exception: ${message} [${requestIdOf(response) ?? '-'}]`,
      exception instanceof Error ? exception.stack : undefined
    )
    // Sans DSN le SDK n'est pas initialisé et cet appel ne fait rien.
    Sentry.captureException(exception, {
      tags: { requestId: requestIdOf(response) ?? 'none' },
    })
    this.answer(response, {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    })
  }

  /**
   * Send the error, and leave two things behind for the request log line:
   * the message, so a 4xx is explained without a second line of its own;
   * and, on a 5xx, the request id in the body.
   */
  private answer(response: Response, body: ErrorBody): void {
    const requestId = requestIdOf(response)
    if (response.locals) {
      response.locals.error = Array.isArray(body.message)
        ? body.message.join(', ')
        : body.message
    }
    const payload =
      body.statusCode >= 500 && requestId ? { ...body, requestId } : body
    response.status(body.statusCode).json(payload)
  }

  private handlePrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    statusCode: number
    message: string
  } {
    switch (exception.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'Un enregistrement avec cette valeur existe déjà',
        }
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Enregistrement introuvable',
        }
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Enregistrement lié introuvable',
        }
      case 'P2028':
        return {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message:
            "L'écriture a pris trop de temps et a été annulée : rien n'a été enregistré. Réessaie.",
        }
      default:
        this.logger.error(
          `Prisma error ${exception.code}: ${exception.message}`
        )
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
        }
    }
  }
}
