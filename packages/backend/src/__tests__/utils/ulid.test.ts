import {describe, it, expect} from 'vitest'
import {ulid} from '../../utils/ulid.js'

describe('ulid', () => {
  it('generates 26-character string', () => {
    expect(ulid()).toHaveLength(26)
  })

  it('contains only uppercase alphanumeric characters', () => {
    expect(ulid()).toMatch(/^[A-Z0-9]{26}$/)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({length: 200}, () => ulid()))
    expect(ids.size).toBe(200)
  })

  it('later IDs sort after earlier ones (time-sortable)', async () => {
    const id1 = ulid()
    await new Promise((r) => setTimeout(r, 5))
    const id2 = ulid()
    expect(id1 < id2).toBe(true)
  })
})
