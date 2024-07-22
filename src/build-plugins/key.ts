import fs from 'node:fs'
import path from 'node:path'
import { generate } from 'selfsigned'
import { log } from './constant'
import type { CertSubject, DistinguishedName } from './option'

export function generateKeyPair(
  keyLength: number,
  subject: CertSubject,
  days: number,
  privateKeyPath: string,
  certPath: string,
): void {
  const privateKeyDir = path.dirname(privateKeyPath)
  if (!fs.existsSync(privateKeyDir)) {
    fs.mkdirSync(privateKeyDir, { recursive: true })
  }

  const certDir = path.dirname(certPath)
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true })
  }

  const { cert, private: privateKey } = generate(subject, {
    keySize: keyLength,
    algorithm: 'sha256',
    days,
  })

  fs.writeFileSync(privateKeyPath, privateKey.replace(/\r\n?/g, '\n'))
  fs.writeFileSync(certPath, cert.replace(/\r\n?/g, '\n'))
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
  const keysDir = path.dirname(privateKeyPath)
  let privateKey = process.env.UPDATER_PK
  let cert = process.env.UPDATER_CERT

  if (privateKey && cert) {
    log.info('use UPDATER_PK and UPDATER_CERT from environment variables', { timestamp: true })
    return { privateKey, cert }
  }

  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir)
  }

  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(certPath)) {
    log.info('no key pair found, generate new key pair', { timestamp: true })
    generateKeyPair(keyLength, parseSubjects(subject), days, privateKeyPath, certPath)
  }

  privateKey = fs.readFileSync(privateKeyPath, 'utf-8')
  cert = fs.readFileSync(certPath, 'utf-8')

  return { privateKey, cert }
}

function parseSubjects(subject: DistinguishedName): CertSubject {
  return Object.entries(subject)
    .filter(([_, value]) => !!value)
    .map(([name, value]) => ({ name, value }))
}
