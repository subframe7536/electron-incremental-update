import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { EOL } from 'node:os'
import { generateKeyPairSync } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import { CertificateSigningRequest } from '@cyyynthia/jscert'
import type { DistinguishedName } from '@cyyynthia/jscert'
import type { GetKeysOption } from './option'

export function generateCert(privateKey: KeyObject, dn: DistinguishedName, expires: Date) {
  const csr = new CertificateSigningRequest(dn, privateKey, { digest: 'sha256' })
  return csr.createSelfSignedCertificate(expires).toPem()
}
export function generateKeyPairDefault(length: number, subjects: DistinguishedName, expires: Date) {
  const { privateKey: _key } = generateKeyPairSync('rsa', { modulusLength: length })
  const cert = generateCert(_key, subjects, expires)
  const privateKey = _key.export({ type: 'pkcs1', format: 'pem' }) as string
  return {
    privateKey,
    cert,
  }
}
function writeCertToMain(entryPath: string, cert: string) {
  const file = readFileSync(entryPath, 'utf-8')

  const regex = /const SIGNATURE_CERT = ['`][\s\S]*?['`]/
  const replacement = `const SIGNATURE_CERT = \`${cert}\``

  let replaced = file
  const signaturePubExists = regex.test(file)

  if (signaturePubExists) {
    replaced = file.replace(regex, replacement)
  } else {
    const lines = file.split(EOL)
    const r = `${EOL}${replacement}${EOL}`
    let isMatched = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.startsWith('import') && !line.startsWith('/')) {
        lines.splice(i, 0, r)
        isMatched = true
        break
      }
    }

    !isMatched && lines.push(r)
    replaced = lines.join(EOL)
  }

  writeFileSync(entryPath, replaced)
}

export function getKeys({
  keyLength,
  privateKeyPath,
  certPath,
  entryPath,
  subject,
  expires,
  generateKeyPair,
}: GetKeysOption): { privateKey: string ; cert: string } {
  const keysDir = dirname(privateKeyPath)
  !existsSync(keysDir) && mkdirSync(keysDir)

  let privateKey: string, cert: string

  if (!existsSync(privateKeyPath) || !existsSync(certPath)) {
    const _func = generateKeyPair ?? generateKeyPairDefault
    const keys = _func(keyLength, subject, expires)
    privateKey = keys.privateKey
    cert = keys.cert
    writeFileSync(privateKeyPath, privateKey)
    writeFileSync(certPath, cert)
  } else {
    privateKey = readFileSync(privateKeyPath, 'utf-8')
    cert = readFileSync(certPath, 'utf-8')
  }
  writeCertToMain(entryPath, cert)
  return {
    privateKey,
    cert,
  }
}
