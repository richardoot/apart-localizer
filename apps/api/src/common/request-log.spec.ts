import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Logger } from '@nestjs/common'
import type { Request, Response } from 'express'
import {
  REQUEST_ID_HEADER,
  formatRequestLog,
  requestIdOf,
  requestLogLevel,
  requestLogger,
} from './request-log'
import type { RequestLogEntry } from './request-log'

const entry = (over: Partial<RequestLogEntry> = {}): RequestLogEntry => ({
  method: 'GET',
  path: '/listings',
  status: 200,
  durationMs: 12.3,
  requestId: 'cdg1::abc-123',
  ...over,
})

describe('requestIdOf', () => {
  const fresh = (): string => 'generated'

  it("prefers Vercel's own id", () => {
    expect(
      requestIdOf(
        { 'x-vercel-id': 'cdg1::abcde-1712345678901-0123456789ab' },
        fresh
      )
    ).toBe('cdg1::abcde-1712345678901-0123456789ab')
  })

  it('accepts a well-formed id a caller sends, first value of a repeated header', () => {
    expect(requestIdOf({ [REQUEST_ID_HEADER]: 'trace-42' }, fresh)).toBe(
      'trace-42'
    )
    expect(requestIdOf({ 'x-vercel-id': ['one', 'two'] }, fresh)).toBe('one')
  })

  it('mints one when nothing usable was sent, or the id could carry anything else', () => {
    expect(requestIdOf({}, fresh)).toBe('generated')
    expect(requestIdOf({ [REQUEST_ID_HEADER]: '' }, fresh)).toBe('generated')
    expect(requestIdOf({ [REQUEST_ID_HEADER]: 'a b\n[FAKE]' }, fresh)).toBe(
      'generated'
    )
    expect(requestIdOf({ [REQUEST_ID_HEADER]: 'x'.repeat(129) }, fresh)).toBe(
      'generated'
    )
    expect(requestIdOf({})).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/)
  })
})

describe('requestLogLevel', () => {
  it('grades by status and demotes a healthy probe', () => {
    expect(requestLogLevel(entry({ status: 200 }))).toBe('log')
    expect(requestLogLevel(entry({ status: 401 }))).toBe('warn')
    expect(requestLogLevel(entry({ status: 500 }))).toBe('error')
    expect(requestLogLevel(entry({ path: '/health' }))).toBe('debug')
    expect(requestLogLevel(entry({ path: '/health', status: 503 }))).toBe(
      'error'
    )
  })
})

describe('formatRequestLog', () => {
  it('hands the fields over untouched for JSON, one readable line otherwise', () => {
    const e = entry({ memberId: 'm1', error: 'nope' })
    expect(formatRequestLog(e, 'json')).toBe(e)
    expect(formatRequestLog(entry(), 'pretty')).toBe(
      'GET /listings 200 12.3ms id=cdg1::abc-123'
    )
    expect(formatRequestLog(e, 'pretty')).toBe(
      'GET /listings 200 12.3ms member=m1 id=cdg1::abc-123 — nope'
    )
  })
})

describe('requestLogger', () => {
  function run(over: {
    headers?: Record<string, string>
    url?: string
    status?: number
    member?: { id: string }
    error?: string
  }) {
    const req = {
      method: 'GET',
      originalUrl: over.url ?? '/listings?search=secret',
      headers: over.headers ?? {},
      member: over.member,
    } as unknown as Request
    const res = Object.assign(new EventEmitter(), {
      statusCode: over.status ?? 200,
      locals: {} as Record<string, unknown>,
      setHeader: vi.fn(),
    }) as unknown as Response & EventEmitter
    if (over.error) res.locals.error = over.error
    const logger = {
      debug: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    const next = vi.fn()
    requestLogger('json', logger as unknown as Logger)(req, res, next)
    res.emit('finish')
    return { res, logger, next }
  }

  it('lets the request through, stamps the id, logs one line without the query', () => {
    const f = run({ headers: { 'x-vercel-id': 'cdg1::abc' } })
    expect(f.next).toHaveBeenCalledOnce()
    expect(f.res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'cdg1::abc')
    expect(f.res.locals.requestId).toBe('cdg1::abc')
    const line = f.logger.log.mock.calls[0]?.[0] as RequestLogEntry
    expect(line).toMatchObject({
      method: 'GET',
      path: '/listings',
      status: 200,
      requestId: 'cdg1::abc',
    })
    expect(JSON.stringify(line)).not.toContain('secret')
  })

  it("names the member and carries the filter's reason at warn", () => {
    expect(
      run({ member: { id: 'm1' } }).logger.log.mock.calls[0]?.[0]
    ).toMatchObject({ memberId: 'm1' })
    const f = run({ status: 401, error: 'Aucun jeton fourni' })
    expect(f.logger.warn.mock.calls[0]?.[0]).toMatchObject({
      status: 401,
      error: 'Aucun jeton fourni',
    })
    expect(run({ status: 500 }).logger.error).toHaveBeenCalledOnce()
    expect(run({ url: '/health' }).logger.debug).toHaveBeenCalledOnce()
  })
})
