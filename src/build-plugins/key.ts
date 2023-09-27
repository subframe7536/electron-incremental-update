import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { generate } from 'selfsigned'
import type { CertSubject, DistinguishedName, GetKeysOption } from './option'

export function generateKeyPair(keyLength: number, subject: CertSubject, days: number, privateKeyPath: string, certPath: string) {
  const privateKeyDir = dirname(privateKeyPath)
  existsSync(privateKeyDir) || mkdirSync(privateKeyDir, { recursive: true })
  const certDir = dirname(certPath)
  existsSync(certDir) || mkdirSync(certDir, { recursive: true })

  const { cert, private: privateKey } = generate(subject, {
    keySize: keyLength, algorithm: 'sha256', days,
  })

  writeFileSync(privateKeyPath, privateKey.replace(/\r\n?/g, '\n'))
  writeFileSync(certPath, cert.replace(/\r\n?/g, '\n'))
}

export function writeCertToMain(entryPath: string, cert: string) {
  const file = readFileSync(entryPath, 'utf-8')

  const initRegex = /(?<=const SIGNATURE_CERT\s*=\s*)['"]{2}/m
  const existRegex = /(?<=const SIGNATURE_CERT\s*=\s*)(['"]-----BEGIN CERTIFICATE-----[\s\S]*-----END CERTIFICATE-----\\n['"])/m
  const eol = file.includes('\r') ? '\r\n' : '\n'
  const replacement = cert
    .split('\n')
    .filter(Boolean)
    .map(s => `'${s}\\n'`)
    .join(`${eol}+ `)

  let replaced = file

  if (initRegex.test(file)) {
    replaced = file.replace(initRegex, replacement)
  } else if (existRegex.test(file)) {
    replaced = file.replace(existRegex, replacement)
  } else {
    const lines = file.split(eol)
    const r = `${eol}const SIGNATURE_CERT = ${replacement}${eol}`
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
    replaced = lines.join(eol)
  }

  writeFileSync(entryPath, replaced)
}

export function parseKeys({
  keyLength,
  privateKeyPath,
  certPath,
  entryPath,
  subject,
  days,
}: GetKeysOption): { privateKey: string ; cert: string } {
  const keysDir = dirname(privateKeyPath)
  !existsSync(keysDir) && mkdirSync(keysDir)

  if (!existsSync(privateKeyPath) || !existsSync(certPath)) {
    generateKeyPair(keyLength, parseSubjects(subject), days, privateKeyPath, certPath)
  }
  const privateKey = readFileSync(privateKeyPath, 'utf-8')
  const cert = readFileSync(certPath, 'utf-8')
  writeCertToMain(entryPath, cert)
  return {
    privateKey,
    cert,
  }
}
function parseSubjects(subject: DistinguishedName): CertSubject {
  const ret = [] as CertSubject
  Object.keys(subject).forEach((name: string) => {
    const value = subject[name as keyof DistinguishedName]
    value && ret.push({ name, value })
  })
  return ret
}
