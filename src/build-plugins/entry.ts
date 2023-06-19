import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { generateKeyPairSync } from 'node:crypto'
import { EOL } from 'node:os'
import { isCI } from 'ci-info'
import { build } from 'esbuild'
import type { BuildEntryOption } from './option'

async function generateKey(
  privateKeyPath: string,
  publicKeyPath: string,
  length: number,
) {
  const pair = generateKeyPairSync('rsa', { modulusLength: length })
  const privateKey = pair.privateKey.export({ type: 'pkcs1', format: 'pem' })
  const publicKey = pair.publicKey.export({ type: 'pkcs1', format: 'pem' })

  await writeFile(privateKeyPath, privateKey)
  await writeFile(publicKeyPath, publicKey)
}

async function writePublicKeyToMain(updatePath: string, publicKeyPath: string) {
  const file = await readFile(updatePath, 'utf-8')
  const key = await readFile(publicKeyPath, 'utf-8')

  const regex = /const SIGNATURE_PUB = ['`][\s\S]*?['`]/
  const replacement = `const SIGNATURE_PUB = \`${key}\``

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

  await writeFile(updatePath, replaced)
}

export async function buildEntry({
  privateKeyPath,
  publicKeyPath,
  entryPath,
  entryOutputPath: outfile,
  minify,
  keyLength,
}: BuildEntryOption) {
  if (!isCI) {
    const keysDir = dirname(privateKeyPath)
    !existsSync(keysDir) && await mkdir(keysDir)
    !existsSync(privateKeyPath) && await generateKey(privateKeyPath, publicKeyPath, keyLength)
    await writePublicKeyToMain(entryPath, publicKeyPath)
  }
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: 'node',
    outfile,
    minify,
    external: ['electron'],
  })
}
