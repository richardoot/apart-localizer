import { describe, expect, it } from 'vitest'
import { kindWhere } from './activity-query.service'

describe('filtre du journal par sorte', () => {
  it('traduit une sorte en condition SQL', () => {
    expect(kindWhere('status')).toEqual({
      OR: [{ action: { in: ['listing.status_changed'] } }],
    })
    expect(kindWhere('task')).toEqual({
      OR: [{ action: { startsWith: 'task.' } }],
      NOT: {
        action: { in: ['listing.status_changed', 'listing.price_changed'] },
      },
    })
    expect(kindWhere('study')).toMatchObject({
      OR: [
        { action: { startsWith: 'scenario.' } },
        { action: { startsWith: 'rent_comparable.' } },
      ],
    })
    const other = kindWhere('other') as { NOT: unknown[] }
    expect(other.NOT).toContainEqual({ action: { startsWith: 'listing.' } })
    expect(other.NOT).toContainEqual({
      action: { in: ['listing.price_changed'] },
    })
  })
})
