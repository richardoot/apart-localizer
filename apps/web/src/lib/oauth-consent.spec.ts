import { describe, expect, it } from 'vitest'
import { describeScope, redirectHost } from './oauth-consent'

describe('describeScope', () => {
  it('turns the known scopes into sentences', () => {
    expect(describeScope('email')).toBe('Connaître votre adresse e-mail')
    expect(describeScope('listings:write')).toMatch(/jamais de suppression/)
  })

  it('still names an unknown scope', () => {
    expect(describeScope('calendar')).toBe('Permission « calendar »')
  })
})

describe('redirectHost', () => {
  it('shows where the client sends the person back', () => {
    expect(redirectHost('http://localhost:33418/callback')).toBe(
      'localhost:33418'
    )
    expect(redirectHost('https://claude.ai/api/mcp/auth_callback')).toBe(
      'claude.ai'
    )
    expect(redirectHost('')).toBe('')
    expect(redirectHost('pas une url')).toBe('pas une url')
  })
})
