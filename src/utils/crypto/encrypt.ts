import { createCipheriv, createPrivateKey, createSign } from 'node:crypto'
import { hashString } from './utils'

export function encrypt(plainText: string, key: Buffer, iv: Buffer): string {
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(plainText, 'utf8', 'base64url')
  encrypted += cipher.final('base64url')
  return encrypted
}

export function signature(buffer: Buffer, privateKey: string, cert: string, version: string): string {
  const sig = createSign('RSA-SHA256')
    .update(buffer)
    .sign(createPrivateKey(privateKey), 'base64')

  return encrypt(`${sig}%${version}`, hashString(cert, 32), hashString(buffer, 16))
}
