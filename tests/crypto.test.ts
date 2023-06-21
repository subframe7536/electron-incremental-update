import { Buffer } from 'node:buffer'
import { describe, expect, test } from 'vitest'
import { decrypt, encrypt, generateKey, generateRSA, signature, verify } from '../src/crypto'

let plain = ''
for (let i = 0; i < 1_000; i++) {
  plain += 'hello+world'
}
describe('test aes', async () => {
  const key = generateKey(Buffer.from(plain, 'utf-8'), 'crypto test', 32)
  const iv = generateKey(Buffer.from(plain, 'utf-8'), 'crypto test', 16)
  test('test', async () => {
    const e = encrypt(plain, key, iv)
    expect(decrypt(e, key, iv)).toBe(plain)
  })
})
describe('test verify', () => {
  const buffer = Buffer.from(plain, 'utf-8')
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
