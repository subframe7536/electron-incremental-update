import { join } from 'node:path/posix'
import { readFileSync, rmSync } from 'node:fs'
import { afterAll, describe, expect, test } from 'vitest'
import { decrypt, encrypt, key, signature, verify } from '../src/crypto'
import { generateKeyPair } from '../src/build-plugins/key'

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
describe('test verify', async () => {
  const buffer = Buffer.from(plain, 'utf-8')
  const dir = join(__dirname.replace(/\\/g, '/'), '/keys')
  const privateKeyPath = join(dir, '/keys/key.pem')
  const certPath = join(dir, '/keys/cert.pem')
  generateKeyPair(2048, [{ name: 'commonName', value: 'test' }, { name: 'organizationName', value: 'org.test' }], 365, privateKeyPath, certPath)
  const privateKey = readFileSync(privateKeyPath, { encoding: 'utf-8' })
  const cert = readFileSync(certPath, { encoding: 'utf-8' })
  const version = '0.0.0-alpha1'
  const sig = await signature(buffer, privateKey, cert, version)
  test('verify passed', () => {
    expect(verify(buffer, sig, cert)).toBe(version)
  })
  test('different buffer will fail to verify', () => {
    expect(verify(buffer.subarray(1), sig, cert)).toBe(false)
  })
  test('different signature will fail to verify', () => {
    expect(verify(buffer, `${sig}a`, cert)).toBe(false)
  })
  test('different publicKey will fail to verify', () => {
    expect(verify(buffer, sig, `${cert}a`)).toBe(false)
  })
  afterAll(() => {
    rmSync(dir, { recursive: true })
  })
})
