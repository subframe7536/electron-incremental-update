import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { generate } from 'selfsigned'
import { log } from './log'
import type { CertSubject, DistinguishedName } from './option'

export function generateKeyPair(keyLength: number, subject: CertSubject, days: number, privateKeyPath: string, certPath: string) {
  const privateKeyDir = dirname(privateKeyPath)
  if (!existsSync(privateKeyDir)) {
    mkdirSync(privateKeyDir, { recursive: true })
  }

  const certDir = dirname(certPath)
  if (!existsSync(certDir)) {
    mkdirSync(certDir, { recursive: true })
  }

  const { cert, private: privateKey } = generate(subject, {
    keySize: keyLength,
    algorithm: 'sha256',
    days,
  })

  writeFileSync(privateKeyPath, privateKey.replace(/\r\n?/g, '\n'))
  writeFileSync(certPath, cert.replace(/\r\n?/g, '\n'))
}

export type GetKeysOption = {
  privateKeyPath: string
  certPath: string
  keyLength: number
  subject: DistinguishedName
  days: number
}

export function parseKeys({
  keyLength,
  privateKeyPath,
  certPath,
  subject,
  days,
}: GetKeysOption): { privateKey: string, cert: string } {
  const keysDir = dirname(privateKeyPath)
  !existsSync(keysDir) && mkdirSync(keysDir)

  if (!existsSync(privateKeyPath) || !existsSync(certPath)) {
    log.warn('no key pair found, generate new key pair')
    generateKeyPair(keyLength, parseSubjects(subject), days, privateKeyPath, certPath)
  }

  const privateKey = process.env.UPDATER_PK || readFileSync(privateKeyPath, 'utf-8')
  const cert = process.env.UPDATER_CERT || readFileSync(certPath, 'utf-8')

  return { privateKey, cert }
}

function parseSubjects(subject: DistinguishedName): CertSubject {
  return Object.entries(subject)
    .filter(([_, value]) => !!value)
    .map(([name, value]) => ({ name, value }))
}
