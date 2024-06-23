import { createCipheriv, createPrivateKey, createSign } from 'node:crypto'
import type { GeneratorOverrideFunctions } from '../build-plugins/option'
import { hashString } from './utils'

export function encrypt(plainText: string, key: Buffer, iv: Buffer): string {
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(plainText, 'utf8', 'base64url')
  encrypted += cipher.final('base64url')
  return encrypted
}

export const signature: Required<GeneratorOverrideFunctions>['generateSignature'] = (buffer, privateKey, cert, version) => {
  const sig = createSign('RSA-SHA256')
    .update(buffer)
    .sign(createPrivateKey(privateKey), 'base64')

  return encrypt(`${sig}%${version}`, hashString(cert, 32), hashString(buffer, 16))
}
