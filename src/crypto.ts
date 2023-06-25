import type { Encoding } from 'node:crypto'
import { constants, createCipheriv, createDecipheriv, createHash, createSign, createVerify } from 'node:crypto'
import { Buffer } from 'node:buffer'
import type { FunctionGenerateSignature } from './build-plugins/option'
import type { FunctionVerifySignature } from './updater'

const aesEncode: Encoding = 'base64url'

export function encrypt(plainText: string, key: Buffer, iv: Buffer): string {
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(plainText, 'utf8', aesEncode)
  encrypted += cipher.final(aesEncode)
  return encrypted
}

export function decrypt(encryptedText: string, key: Buffer, iv: Buffer): string {
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encryptedText, aesEncode, 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export function key(data: string | Buffer, length: number) {
  const hash = createHash('SHA256').update(data).digest('binary')
  return Buffer.from(hash).subarray(0, length)
}

export const signature: FunctionGenerateSignature = (buffer, privateKey, cert, version) => {
  const sig = createSign('RSA-SHA256')
    .update(buffer)
    .sign({
      key: privateKey,
      padding: constants.RSA_PKCS1_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    }, 'base64')

  return encrypt(`${sig}%${version}`, key(cert, 32), key(buffer, 16))
}

export const verify: FunctionVerifySignature = (buffer, signature, cert) => {
  try {
    const [sig, version] = decrypt(signature, key(cert, 32), key(buffer, 16)).split('%')
    const result = createVerify('RSA-SHA256')
      .update(buffer)
      .verify(cert, sig, 'base64')
    return result ? version : false
  } catch (error) {
    return false
  }
}
