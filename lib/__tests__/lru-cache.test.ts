import { describe, it, expect, beforeEach } from 'vitest'
import { LRUCache, getIndicatorCacheKey } from '../lru-cache'

describe('LRUCache', () => {
  let cache: LRUCache<string, number>

  beforeEach(() => {
    cache = new LRUCache<string, number>(3) // small capacity for easy testing
  })

  // ── Basic get/set ────────────────────────────────────────────────────────────

  it('returns undefined for missing key', () => {
    expect(cache.get('missing')).toBeUndefined()
  })

  it('stores and retrieves a value', () => {
    cache.set('a', 1)
    expect(cache.get('a')).toBe(1)
  })

  it('overwrites an existing key', () => {
    cache.set('a', 1)
    cache.set('a', 99)
    expect(cache.get('a')).toBe(99)
  })

  // ── has / delete / clear ─────────────────────────────────────────────────────

  it('has() returns true for existing key', () => {
    cache.set('a', 1)
    expect(cache.has('a')).toBe(true)
  })

  it('has() returns false for missing key', () => {
    expect(cache.has('missing')).toBe(false)
  })

  it('delete() removes a key and returns true', () => {
    cache.set('a', 1)
    expect(cache.delete('a')).toBe(true)
    expect(cache.has('a')).toBe(false)
  })

  it('delete() returns false for non-existent key', () => {
    expect(cache.delete('nope')).toBe(false)
  })

  it('clear() removes all entries', () => {
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.has('a')).toBe(false)
  })

  // ── size ─────────────────────────────────────────────────────────────────────

  it('size reflects number of entries', () => {
    expect(cache.size).toBe(0)
    cache.set('a', 1)
    expect(cache.size).toBe(1)
    cache.set('b', 2)
    expect(cache.size).toBe(2)
    cache.delete('a')
    expect(cache.size).toBe(1)
  })

  // ── LRU eviction ─────────────────────────────────────────────────────────────

  it('evicts the least recently used entry when at capacity', () => {
    // Fill to capacity: a, b, c (a is LRU)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    expect(cache.size).toBe(3)

    // Adding 'd' should evict 'a' (LRU)
    cache.set('d', 4)
    expect(cache.size).toBe(3)
    expect(cache.has('a')).toBe(false)
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
    expect(cache.get('d')).toBe(4)
  })

  it('evicts the correct LRU after a series of accesses', () => {
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)

    // Access 'a' - now order is b(LRU), c, a(MRU)
    cache.get('a')

    // Adding 'd' should evict 'b' (now LRU)
    cache.set('d', 4)
    expect(cache.has('b')).toBe(false)
    expect(cache.has('a')).toBe(true)
    expect(cache.has('c')).toBe(true)
    expect(cache.has('d')).toBe(true)
  })

  // ── Re-access moves to MRU ───────────────────────────────────────────────────

  it('re-accessing a key moves it to MRU position', () => {
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)

    // Touch 'a' to make it MRU; order becomes b(LRU), c, a(MRU)
    cache.get('a')

    // Insert 'd' → evicts 'b'
    cache.set('d', 4)
    expect(cache.has('b')).toBe(false)
    expect(cache.has('a')).toBe(true)
  })

  it('updating an existing key moves it to MRU position', () => {
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)

    // Update 'a' → moves to MRU; order becomes b(LRU), c, a(MRU)
    cache.set('a', 10)

    // Insert 'd' → evicts 'b'
    cache.set('d', 4)
    expect(cache.has('b')).toBe(false)
    expect(cache.get('a')).toBe(10)
  })

  // ── Default capacity ─────────────────────────────────────────────────────────

  it('defaults to 1000 entries', () => {
    const defaultCache = new LRUCache<number, number>()
    for (let i = 0; i < 1000; i++) {
      defaultCache.set(i, i)
    }
    expect(defaultCache.size).toBe(1000)

    // Adding one more should evict the first entry (key 0)
    defaultCache.set(1000, 1000)
    expect(defaultCache.size).toBe(1000)
    expect(defaultCache.has(0)).toBe(false)
    expect(defaultCache.has(1000)).toBe(true)
  })
})

// ── getIndicatorCacheKey ───────────────────────────────────────────────────────

describe('getIndicatorCacheKey', () => {
  it('formats key correctly', () => {
    expect(getIndicatorCacheKey('BTCUSDT', 'binance', '5m', 'rsi')).toBe(
      'BTCUSDT:binance:5m:rsi',
    )
  })
})
