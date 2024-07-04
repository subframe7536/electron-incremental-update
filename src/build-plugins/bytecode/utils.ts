import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import * as babel from '@babel/core'
import MagicString from 'magic-string'
import { getPackageInfoSync } from 'local-pkg'
import { log } from '../log'
import { bytecodeGeneratorScript } from './code'

const electronModulePath = getPackageInfoSync('electron')?.rootPath
export const useStrict = '\'use strict\';'
export const bytecodeModuleLoader = '__loader__.js'

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

export function convertString(
  code: string,
  strings: string[],
  sourcemap?: boolean,
): { code: string, map?: any } {
  let s: MagicString | null = null

  for (const str of strings.filter(Boolean)) {
    const regex = new RegExp(`["']${escapeRegExpString(str)}["']`, 'g')
    s ||= new MagicString(code).replace(regex, match => obfuscateString(match.slice(1, -1)))
  }

  return s
    ? {
        code: s.toString(),
        map: sourcemap ? s.generateMap({ hires: 'boundary' }) : null,
      }
    : { code }
}

function obfuscateString(input: string): string {
  const offset = Math.floor(Math.random() * 2 << 4) + 1
  const hexArray = Array.from(input).map(c => '0x' + (c.charCodeAt(0) + offset).toString(16))
  const decodeFn = `function(a,b){return String.fromCharCode.apply(null,a.map(x=>+x-b))}`

  return `(${decodeFn})([${hexArray.join(',')}],${offset})`
}
