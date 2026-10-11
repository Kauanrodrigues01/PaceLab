import { describe, it, expect } from 'vitest'

describe('setup sanity check', () => {
  it('vitest está configurado corretamente', () => {
    expect(1 + 1).toBe(2)
  })

  it('typescript strict mode funciona', () => {
    const add = (a: number, b: number): number => a + b
    expect(add(3, 4)).toBe(7)
  })
})
