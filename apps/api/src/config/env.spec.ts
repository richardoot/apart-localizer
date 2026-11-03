import { describe, expect, it } from 'vitest'
import { corsOrigins, validateEnv } from './env'

const valid = {
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'key',
}

describe('validateEnv', () => {
  it('accepts a minimal configuration with defaults', () => {
    const env = validateEnv(valid)
    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(3000)
    expect(env.FRONTEND_URL).toBe('http://localhost:5173')
    expect(env.LOG_LEVEL).toBeUndefined()
  })

  it('treats empty strings as absent (a copied .env.example)', () => {
    const env = validateEnv({
      ...valid,
      LOG_LEVEL: '',
      LOG_FORMAT: '',
      DIRECT_URL: '',
    })
    expect(env.LOG_LEVEL).toBeUndefined()
    expect(env.DIRECT_URL).toBeUndefined()
  })

  it('lot 6 : stockage, web push et webhook entrant, sans valeur imposée', () => {
    const env = validateEnv({
      ...valid,
      STORAGE_BUCKET_VISIT_PHOTOS: '',
      VAPID_PUBLIC_KEY: '',
      INBOUND_EMAIL_SECRET: '',
    })
    expect(env.STORAGE_BUCKET_VISIT_PHOTOS).toBe('visit-photos')
    expect(env.STORAGE_SIGNED_URL_TTL_SECONDS).toBe(600)
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined()
    expect(env.INBOUND_EMAIL_SECRET).toBeUndefined()
    expect(() =>
      validateEnv({ ...valid, INBOUND_EMAIL_SECRET: 'court' })
    ).toThrow('INBOUND_EMAIL_SECRET')
    expect(() =>
      validateEnv({ ...valid, VAPID_SUBJECT: 'admin@exemple.invalid' })
    ).toThrow('VAPID_SUBJECT')
    expect(
      validateEnv({ ...valid, VAPID_SUBJECT: 'mailto:admin@exemple.invalid' })
        .VAPID_SUBJECT
    ).toBe('mailto:admin@exemple.invalid')
    expect(() =>
      validateEnv({ ...valid, STORAGE_SIGNED_URL_TTL_SECONDS: '5' })
    ).toThrow('STORAGE_SIGNED_URL_TTL_SECONDS')
  })

  it('names the variable that is wrong', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'nope' })).toThrow(
      /DATABASE_URL/
    )
    expect(() => validateEnv({ ...valid, PORT: '99999' })).toThrow(/PORT/)
    expect(() => validateEnv({ SUPABASE_URL: valid.SUPABASE_URL })).toThrow(
      /DATABASE_URL/
    )
    expect(() => validateEnv({ ...valid, LOG_LEVEL: 'info' })).toThrow(
      /LOG_LEVEL/
    )
  })

  it('coerces the port', () => {
    expect(validateEnv({ ...valid, PORT: '3001' }).PORT).toBe(3001)
  })
})

describe('corsOrigins', () => {
  it('splits on commas and trims', () => {
    expect(corsOrigins('http://a, http://b ,')).toEqual([
      'http://a',
      'http://b',
    ])
  })
})
