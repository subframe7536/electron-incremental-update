import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import * as babel from '@babel/core'
import MagicString from 'magic-string'
import { getPackageInfoSync, isPackageExists } from 'local-pkg'
import { log } from '../log'
import { bytecodeGeneratorScript } from './code'

const electronModulePath = getPackageInfoSync('electron')?.rootPath
export const useStrict = '\'use strict\';'
export const bytecodeModuleLoader = '__loader__.js'
function ensurePackages(packages: string[]) {
  if (process.env.CI || process.stdout.isTTY === false) {
    return true
  }

  return packages.filter(i => i && !isPackageExists(i)).length === 0
}

export function isBabelInstalled() {
  return ensurePackages(['@babel/core', '@babel/plugin-transform-arrow-functions'])
}
export function isMagicStringInstalled() {
  return ensurePackages(['magic-string'])
}

function getElectronPath(): string {
  let electronExecPath = process.env.ELECTRON_EXEC_PATH || ''
  if (!electronExecPath) {
    if (!electronModulePath) {
      throw new Error('Electron is not installed')
    }
    const pathFile = path.join(electronModulePath, 'path.txt')
    let executablePath
    if (fs.existsSync(pathFile)) {
      executablePath = fs.readFileSync(pathFile, 'utf-8')
    }
    if (executablePath) {
      electronExecPath = path.join(electronModulePath, 'dist', executablePath)
      process.env.ELECTRON_EXEC_PATH = electronExecPath
    } else {
      throw new Error('Electron executable file is not existed')
    }
  }
  return electronExecPath
}
function getBytecodeCompilerPath(): string {
  const scriptPath = path.join(electronModulePath!, 'bytenode.cjs')
  if (!fs.existsSync(scriptPath)) {
    fs.writeFileSync(scriptPath, bytecodeGeneratorScript)
  }
  return scriptPath
}
export function toRelativePath(filename: string, importer: string): string {
  const relPath = path.posix.relative(path.dirname(importer), filename)
  return relPath.startsWith('.') ? relPath : `./${relPath}`
}
export function compileToBytecode(code: string): Promise<Buffer> {
  let data = Buffer.from([])
  const logErr = (...args: any[]) => log.error(args.join(' '), { timestamp: true })

  const electronPath = getElectronPath()
  const bytecodePath = getBytecodeCompilerPath()
  return new Promise((resolve, reject) => {
    const proc = spawn(electronPath, [bytecodePath], {
      env: { ELECTRON_RUN_AS_NODE: '1' } as any,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })

    if (proc.stdin) {
      proc.stdin.write(code)
      proc.stdin.end()
    }

    if (proc.stdout) {
      proc.stdout.on('data', chunk => data = Buffer.concat([data, chunk]))
      proc.stdout.on('error', err => logErr(err))
      proc.stdout.on('end', () => resolve(data))
    }

    if (proc.stderr) {
      proc.stderr.on('data', chunk => logErr('Error: ', chunk.toString()))
      proc.stderr.on('error', err => logErr('Error: ', err))
    }

    proc.addListener('error', err => logErr(err))

    proc.on('error', err => reject(err))
    proc.on('exit', () => resolve(data))
  })
}

export function convertArrowToFunction(code: string): { code: string, map: any } {
  if (!isBabelInstalled()) {
    throw new Error('Please make sure `@babel/core` and `@babel/plugin-transform-arrow-functions` installed')
  }
  const result = babel.transform(code, {
    plugins: ['@babel/plugin-transform-arrow-functions'],
  })
  return {
    code: result?.code || code,
    map: result?.map,
  }
}

function escapeRegExpString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/[|{}()[\]^$+*?.]/g, '\\$&')
}

export function convertStringToAscii(
  code: string,
  strings: string[],
  sourcemap?: boolean,
): { code: string, map?: any } {
  if (!isMagicStringInstalled()) {
    throw new Error('Please make sure `magic-string` installed')
  }
  let s: MagicString | null = null

  for (const str of strings.filter(Boolean)) {
    const regex = new RegExp(`["']${escapeRegExpString(str)}["']`, 'g')
    s ||= new MagicString(code).replace(regex, (match) => {
      const codes = Array.from(match.slice(1, -1)).map(s => `0o${s.charCodeAt(0).toString(8)}`).join(',')
      return `String.fromCharCode(${codes})`
    })
  }

  return s
    ? {
        code: s.toString(),
        map: sourcemap ? s.generateMap({ hires: 'boundary' }) : null,
      }
    : { code }
}
