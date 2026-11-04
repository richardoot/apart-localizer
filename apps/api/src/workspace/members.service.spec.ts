import { afterEach, describe, expect, it } from 'vitest'
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { MembersService, refusalException } from './members.service'

describe('refusalException', () => {
  it('traduit les refus de domain en réponses HTTP', () => {
    const forbidden = refusalException({ code: 'forbidden', message: 'non' })
    expect(forbidden).toBeInstanceOf(ForbiddenException)
    expect(forbidden.message).toBe('non')
    expect(
      refusalException({ code: 'not_found', message: 'absent' })
    ).toBeInstanceOf(NotFoundException)
    expect(
      refusalException({ code: 'conflict', message: 'déjà' })
    ).toBeInstanceOf(ConflictException)
  })
})

describe('MembersService.ttlDays', () => {
  const previous = process.env.INVITATION_TTL_DAYS
  afterEach(() => {
    if (previous === undefined) delete process.env.INVITATION_TTL_DAYS
    else process.env.INVITATION_TTL_DAYS = previous
  })

  it('lit INVITATION_TTL_DAYS, 14 jours par défaut', () => {
    const service = new MembersService(
      null as never,
      null as never,
      null as never,
      null as never
    )
    delete process.env.INVITATION_TTL_DAYS
    expect(service.ttlDays).toBe(14)
    process.env.INVITATION_TTL_DAYS = '7'
    expect(service.ttlDays).toBe(7)
    process.env.INVITATION_TTL_DAYS = '365'
    expect(service.ttlDays).toBe(14)
  })
})
