import { Buffer } from 'node:buffer'
import { describe, expect, test } from 'vitest'
import { decrypt, encrypt, key, signature, verify } from '../src/crypto'
import { generateKeyPairDefault } from '../src/build-plugins/key'

let plain = ''
for (let i = 0; i < 1_000; i++) {
  plain += 'hello+world'
}
describe('test aes', async () => {
  const k = key(Buffer.from(plain, 'utf-8'), 32)
  const iv = key(Buffer.from(plain, 'utf-8'), 16)
  test('test', async () => {
    const e = encrypt(plain, k, iv)
    expect(decrypt(e, k, iv)).toBe(plain)
  })
})
describe('test verify', () => {
  const buffer = Buffer.from(plain, 'utf-8')
  const { privateKey, cert } = generateKeyPairDefault(2048, {}, new Date())
  const version = '0.0.0-alpha1'
  const sig = signature(buffer, privateKey, cert, version)
  test('verify passed', async () => {
    expect(verify(buffer, sig, cert)).toBe(version)
  })
  test('different buffer will fail to verify', async () => {
    expect(verify(buffer.subarray(1), sig, cert)).toBe(false)
  })
  test('different signature will fail to verify', async () => {
    expect(verify(buffer, `${sig}a`, cert)).toBe(false)
  })
  test('different publicKey will fail to verify', async () => {
    expect(verify(buffer, sig, `${cert}a`)).toBe(false)
  })
})
