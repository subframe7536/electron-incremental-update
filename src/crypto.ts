import type { Encoding } from 'node:crypto'
import { constants, createCipheriv, createDecipheriv, createHash, createSign, createVerify, generateKeyPairSync } from 'node:crypto'
import { Buffer } from 'node:buffer'

const aesEncode: Encoding = 'base64url'

export function generateRSA(length = 2048) {
  const pair = generateKeyPairSync('rsa', { modulusLength: length })
  const privateKey = pair.privateKey.export({ type: 'pkcs1', format: 'pem' }) as string
  const publicKey = pair.publicKey.export({ type: 'pkcs1', format: 'pem' }) as string
  return {
    privateKey,
    publicKey,
  }
}

export function encrypt(plainText: string, key: string | Buffer, iv: string | Buffer): string {
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(plainText, 'utf8', aesEncode)
  encrypted += cipher.final(aesEncode)
  return encrypted
}

export function decrypt(encryptedText: string, key: string | Buffer, iv: string | Buffer): string {
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encryptedText, aesEncode, 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export function generateKey(buffer: Buffer, str: string, length: number) {
  str += createHash('md5').update(buffer.map((v, i) => i & length / 4 && v)).digest('hex')
  const hash = createHash('SHA256').update(str).digest('binary')
  return Buffer.from(hash).subarray(0, length)
}

export function signature(buffer: Buffer, privateKey: string, publicKey: string, name: string) {
  const sig = createSign('RSA-SHA256')
    .update(buffer)
    .sign({
      key: privateKey,
      padding: constants.RSA_PKCS1_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    }, 'base64')

  return encrypt(sig, generateKey(buffer, publicKey, 32), generateKey(buffer, name, 16))
}

export function verify(buffer: Buffer, signature: string, publicKey: string, name: string): boolean {
  try {
    const sig = decrypt(signature, generateKey(buffer, publicKey, 32), generateKey(buffer, name, 16))
    return createVerify('RSA-SHA256')
      .update(buffer)
      .verify(publicKey, sig, 'base64')
  } catch (error) {
    return false
  }
}
