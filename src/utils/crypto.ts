import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createSign,
  createVerify,
} from 'node:crypto'

export function hashBuffer(data: string | Buffer, length: number): Buffer {
  const hash = createHash('SHA256').update(data).digest('binary')
  return Buffer.from(hash).subarray(0, length)
}

export function aesEncrypt(plainText: string, key: Buffer, iv: Buffer): string {
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  return cipher.update(plainText, 'utf8', 'base64url') + cipher.final('base64url')
}

export function defaultSignature(buffer: Buffer, privateKey: string, cert: string, version: string): string {
  const sig = createSign('RSA-SHA256')
    .update(buffer)
    .sign(createPrivateKey(privateKey), 'base64')

  return aesEncrypt(`${sig}%${version}`, hashBuffer(cert, 32), hashBuffer(buffer, 16))
}

export function aesDecrypt(encryptedText: string, key: Buffer, iv: Buffer): string {
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  return decipher.update(encryptedText, 'base64url', 'utf8') + decipher.final('utf8')
}

export function defaultVerify(buffer: Buffer, signature: string, cert: string): string | undefined {
  try {
    const [sig, version] = aesDecrypt(signature, hashBuffer(cert, 32), hashBuffer(buffer, 16)).split('%')
    const result = createVerify('RSA-SHA256')
      .update(buffer)
      .verify(cert, sig, 'base64')
    return result ? version : undefined
  } catch {
    return undefined
  }
}
