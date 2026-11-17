import { describe, expect, it, vi } from 'vitest'
import { ConsoleLogger } from '@nestjs/common'
import {
  BOOT_CONTEXTS,
  QuietBootLogger,
  createLogger,
  logFormat,
  logLevels,
  quietBoot,
} from './logging'

describe('logFormat', () => {
  it('is JSON in production, where a machine reads the lines', () => {
    expect(logFormat({ NODE_ENV: 'production' })).toBe('json')
  })

  it('is readable anywhere else', () => {
    expect(logFormat({})).toBe('pretty')
    expect(logFormat({ NODE_ENV: 'development' })).toBe('pretty')
    expect(logFormat({ NODE_ENV: 'test' })).toBe('pretty')
  })

  it('lets LOG_FORMAT override the environment in both directions', () => {
    expect(logFormat({ NODE_ENV: 'production', LOG_FORMAT: 'pretty' })).toBe(
      'pretty'
    )
    expect(logFormat({ NODE_ENV: 'development', LOG_FORMAT: 'json' })).toBe(
      'json'
    )
  })

  it('ignores a LOG_FORMAT it does not know', () => {
    expect(logFormat({ NODE_ENV: 'production', LOG_FORMAT: 'xml' })).toBe(
      'json'
    )
  })
})

describe('logLevels', () => {
  it('prints everything but verbose at a desk', () => {
    expect(logLevels({})).toEqual(['debug', 'log', 'warn', 'error', 'fatal'])
  })

  it('drops debug once the lines are stored', () => {
    expect(logLevels({ NODE_ENV: 'production' })).toEqual([
      'log',
      'warn',
      'error',
      'fatal',
    ])
  })

  it('starts at LOG_LEVEL when one is given', () => {
    expect(logLevels({ LOG_LEVEL: 'warn' })).toEqual(['warn', 'error', 'fatal'])
  })

  it('never silences the process on a mistyped LOG_LEVEL', () => {
    expect(logLevels({ NODE_ENV: 'production', LOG_LEVEL: 'info' })).toEqual([
      'log',
      'warn',
      'error',
      'fatal',
    ])
  })
})

describe('createLogger', () => {
  it("builds Nest's console logger", () => {
    expect(createLogger({ NODE_ENV: 'production' })).toBeInstanceOf(
      ConsoleLogger
    )
  })
})

describe('quiet boot (ADR 0048)', () => {
  it('drops the start narration where lines are stored, unless debug is asked', () => {
    expect(quietBoot({ NODE_ENV: 'production' })).toBe(true)
    expect(quietBoot({ NODE_ENV: 'production', LOG_LEVEL: 'debug' })).toBe(
      false
    )
    expect(quietBoot({ NODE_ENV: 'development' })).toBe(false)
    expect(createLogger({ NODE_ENV: 'production' })).toBeInstanceOf(
      QuietBootLogger
    )
    expect(createLogger({})).not.toBeInstanceOf(QuietBootLogger)
  })

  it('leaves out module, controller and route lines, keeps the rest', () => {
    const logger = new QuietBootLogger({ json: true })
    const print = vi
      .spyOn(ConsoleLogger.prototype, 'log')
      .mockImplementation(() => undefined)
    for (const context of BOOT_CONTEXTS) {
      logger.log('Mapped {/listings, GET} route', context)
    }
    expect(print).not.toHaveBeenCalled()
    logger.log('Nest application successfully started', 'NestApplication')
    logger.log({ method: 'GET', path: '/listings' }, 'HTTP')
    expect(print).toHaveBeenCalledTimes(2)
    print.mockRestore()
  })
})
