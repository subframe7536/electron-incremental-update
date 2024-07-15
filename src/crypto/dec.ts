import { createDecipheriv, createVerify } from 'node:crypto'
import type { UpdaterOverrideFunctions } from '../updater'
import { hashString } from './utils'

export function decrypt(encryptedText: string, key: Buffer, iv: Buffer): string {
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encryptedText, 'base64url', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export const verify: Required<UpdaterOverrideFunctions>['verifySignaure'] = (buffer, signature, cert) => {
  try {
    const [sig, version] = decrypt(signature, hashString(cert, 32), hashString(buffer, 16)).split('%')
    const result = createVerify('RSA-SHA256')
      .update(buffer)
      .verify(cert, sig, 'base64')
    return result ? version : undefined
  } catch (error) {
    return undefined
  }
}
