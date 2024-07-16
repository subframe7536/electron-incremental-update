import { join } from 'node:path/posix'
import { readFileSync, rmSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { generateKeyPair } from '../src/build-plugins/key'
import { decrypt, encrypt, hashString, signature, verifySignatureDefault } from '../src/utils/crypto'

let plain = ''
for (let i = 0; i < 1_000; i++) {
  plain += 'hello+world'
}
describe('test aes', async () => {
  const k = hashString(Buffer.from(plain, 'utf-8'), 32)
  const iv = hashString(Buffer.from(plain, 'utf-8'), 16)
  it('test', async () => {
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
  it('verify passed', () => {
    expect(verifySignatureDefault(buffer, sig, cert)).toBe(version)
  })
  it('different buffer will fail to verify', () => {
    expect(verifySignatureDefault(buffer.subarray(1), sig, cert)).toBe(undefined)
  })
  it('different signature will fail to verify', () => {
    expect(verifySignatureDefault(buffer, `${sig}a`, cert)).toBe(undefined)
  })
  it('different publicKey will fail to verify', () => {
    expect(verifySignatureDefault(buffer, sig, `${cert}a`)).toBe(undefined)
  })
  // test('cert variable', async () => {
  //   const filePath = './tests/test-cert.ts'
  //   if (!existsSync(filePath)) {
  //     // await rm(filePath)
  //     await writeFile(filePath, 'import { join } from \'node:path/posix\'')
  //   }
  //   writeCertToMain(filePath, cert)
  // })
  afterAll(() => {
    rmSync(dir, { recursive: true })
  })
})
