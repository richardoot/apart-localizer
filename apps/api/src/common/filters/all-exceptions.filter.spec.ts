import { describe, it, expect, vi } from 'vitest'
import {
  BadRequestException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { Prisma } from '../../generated/prisma'
import { AllExceptionsFilter } from './all-exceptions.filter'

function run(
  exception: unknown,
  locals: Record<string, unknown> | undefined = {}
) {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn(), locals }
  const host = { switchToHttp: () => ({ getResponse: () => response }) }
  new AllExceptionsFilter().catch(exception, host as never)
  return response
}

describe('AllExceptionsFilter', () => {
  it('passes Nest exceptions through with their status and body', () => {
    const r = run(new NotFoundException('Annonce introuvable'))
    expect(r.status).toHaveBeenCalledWith(404)
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'Annonce introuvable',
      })
    )
    const s = run(new HttpException('Custom', 422))
    expect(s.json).toHaveBeenCalledWith({ statusCode: 422, message: 'Custom' })
    const v = run(
      new BadRequestException({
        statusCode: 400,
        message: ['price'],
        errors: [{ path: ['price'] }],
      })
    )
    expect(v.json).toHaveBeenCalledWith({
      statusCode: 400,
      message: ['price'],
      errors: [{ path: ['price'] }],
    })
  })

  it('maps Prisma errors to the status they mean', () => {
    const known = (code: string) =>
      new Prisma.PrismaClientKnownRequestError('x', {
        code,
        clientVersion: '7',
      })
    expect(run(known('P2002')).status).toHaveBeenCalledWith(409)
    expect(run(known('P2025')).status).toHaveBeenCalledWith(404)
    expect(run(known('P2003')).status).toHaveBeenCalledWith(400)
    expect(run(known('P2028')).status).toHaveBeenCalledWith(503)
    expect(run(known('P9999')).status).toHaveBeenCalledWith(500)
  })

  it('answers 500 without leaking the message, with the request id when stamped', () => {
    const r = run(new Error('password incorrect'), { requestId: 'cdg1::abc' })
    expect(r.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
      requestId: 'cdg1::abc',
    })
    expect(run('string error').status).toHaveBeenCalledWith(500)
    expect(run(null).status).toHaveBeenCalledWith(500)
    expect(run(new Error('boom'), undefined).status).toHaveBeenCalledWith(500)
  })

  it('leaves the message for the request log, joined when it is a list', () => {
    expect(
      run(new UnauthorizedException('Aucun jeton fourni')).locals?.error
    ).toBe('Aucun jeton fourni')
    expect(run(new BadRequestException(['a', 'b'])).locals?.error).toBe('a, b')
    const missing = run(new NotFoundException('nope'), {
      requestId: 'cdg1::abc',
    })
    expect(missing.json).toHaveBeenCalledWith(
      expect.not.objectContaining({ requestId: expect.anything() })
    )
  })
})
