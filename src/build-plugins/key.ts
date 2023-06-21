import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { EOL } from 'node:os'
import { generateRSA } from '../crypto'
import type { BuildKeysOption } from './option'

function generateKey(
  privateKeyPath: string,
  publicKeyPath: string,
  length: number,
) {
  const ret = generateRSA(length)
  writeFileSync(privateKeyPath, ret.privateKey)
  writeFileSync(publicKeyPath, ret.publicKey)
  return ret
}
function writePublicKeyToMain(entryPath: string, publicKey: string) {
  const file = readFileSync(entryPath, 'utf-8')

  const regex = /const SIGNATURE_PUB = ['`][\s\S]*?['`]/
  const replacement = `const SIGNATURE_PUB = \`${publicKey}\``

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
  publicKeyPath,
  entryPath,
}: BuildKeysOption): { privateKey: string ; publicKey: string } {
  const keysDir = dirname(privateKeyPath)
  !existsSync(keysDir) && mkdirSync(keysDir)
  let privateKey, publicKey
  if (!existsSync(privateKeyPath)) {
    const keys = generateKey(privateKeyPath, publicKeyPath, keyLength)
    privateKey = keys.privateKey
    publicKey = keys.publicKey
  } else {
    privateKey = readFileSync(privateKeyPath, 'utf-8')
    publicKey = readFileSync(publicKeyPath, 'utf-8')
  }
  writePublicKeyToMain(entryPath, publicKey)
  return {
    privateKey,
    publicKey,
  }
}
