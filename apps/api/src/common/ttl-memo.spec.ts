import { describe, expect, it, vi } from 'vitest'
import { ttlMemo } from './ttl-memo'

describe('ttlMemo', () => {
  it('relit après la durée, pas avant', async () => {
    let t = 0
    const memo = ttlMemo<number>(1_000, () => t)
    const load = vi.fn(() => Promise.resolve(t))
    expect(await memo.get('k', load)).toBe(0)
    t = 999
    expect(await memo.get('k', load)).toBe(0)
    expect(load).toHaveBeenCalledTimes(1)
    t = 1_000
    expect(await memo.get('k', load)).toBe(1_000)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('une clé par lecture, et les appels simultanés partagent la même', async () => {
    const memo = ttlMemo<string>(1_000)
    const load = vi.fn((key: string) => Promise.resolve(key))
    const [a, b, c] = await Promise.all([
      memo.get('a', () => load('a')),
      memo.get('a', () => load('a')),
      memo.get('b', () => load('b')),
    ])
    expect([a, b, c]).toEqual(['a', 'a', 'b'])
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('une lecture qui échoue n’est pas gardée', async () => {
    const memo = ttlMemo<number>(1_000)
    await expect(
      memo.get('k', () => Promise.reject(new Error('base injoignable')))
    ).rejects.toThrow('base injoignable')
    expect(await memo.get('k', () => Promise.resolve(1))).toBe(1)
  })

  it('clear oublie tout : une écriture du même processus se voit tout de suite', async () => {
    const memo = ttlMemo<number>(60_000)
    expect(await memo.get('k', () => Promise.resolve(1))).toBe(1)
    memo.clear()
    expect(await memo.get('k', () => Promise.resolve(2))).toBe(2)
  })
})
