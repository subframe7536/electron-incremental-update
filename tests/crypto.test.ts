import { Buffer } from 'node:buffer'
import { describe, expect, test } from 'vitest'
import { generateRSA, signature, verify } from '../src/crypto'

describe('test crypto', () => {
  let base = ''
  for (let i = 0; i < 1_000; i++) {
    base += 'hello+world'
  }
  const buffer = Buffer.from(base, 'utf-8')
  const { privateKey, publicKey } = generateRSA()
  const name = 'crypto test'
  const sig = signature(buffer, privateKey, publicKey, name)
  test('verify passed', async () => {
    expect(verify(buffer, sig, publicKey, name)).toBe(true)
  })
  test('different buffer will fail to verify', async () => {
    expect(verify(buffer.subarray(1), sig, publicKey, name)).toBe(false)
  })
  test('different signature will fail to verify', async () => {
    expect(verify(buffer, `${sig}a`, publicKey, name)).toBe(false)
  })
  test('different publicKey will fail to verify', async () => {
    expect(verify(buffer, sig, `${publicKey}a`, name)).toBe(false)
  })
  test('different name will fail to verify', async () => {
    expect(verify(buffer, sig, publicKey, `${name}a`)).toBe(false)
  })
})
