import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createLogger } from 'vite'
import * as babel from '@babel/core'
import MagicString from 'magic-string'
import { bytecodeId } from '../constant'
import { bytecodeGeneratorScript } from './staticCode'

const electronModulePath = path.dirname(createRequire(import.meta.url).resolve('electron'))
export const log = createLogger('info', { prefix: `[${bytecodeId}]` })
export const useStrict = '\'use strict\';'
export const bytecodeModuleLoader = 'bytecode-loader.cjs'

function getElectronPath(): string {
  let electronExecPath = process.env.ELECTRON_EXEC_PATH || ''
  if (!electronExecPath) {
    const pathFile = path.join(electronModulePath, 'path.txt')
    let executablePath
    if (fs.existsSync(pathFile)) {
      executablePath = fs.readFileSync(pathFile, 'utf-8')
    }
    if (executablePath) {
      electronExecPath = path.join(electronModulePath, 'dist', executablePath)
      process.env.ELECTRON_EXEC_PATH = electronExecPath
    } else {
      throw new Error('Electron uninstall')
    }
  }
  return electronExecPath
}
function getBytecodeCompilerPath(): string {
  const scriptPath = path.join(electronModulePath, 'bytenode.cjs')
  fs.writeFileSync(scriptPath, bytecodeGeneratorScript)
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
    .replace(/\\/g, '\\\\\\\\')
    .replace(/[|{}()[\]^$+*?.]/g, '\\$&')
    .replace(/-/g, '\\u002d')
}

export function convertStringToAscii(
  code: string,
  protectedStrings: string[] = [],
  sourcemap?: boolean,
): { code: string, map?: any } {
  let match: RegExpExecArray | null
  let s: MagicString | undefined

  protectedStrings.forEach((str) => {
    const escapedStr = escapeRegExpString(str)
    const re = new RegExp(`\\u0027${escapedStr}\\u0027|\\u0022${escapedStr}\\u0022`, 'g')
    const charCodes = Array.from(str).map(s => s.charCodeAt(0))
    const replacement = `String.fromCharCode(${charCodes.toString()})`
    // eslint-disable-next-line no-cond-assign
    while ((match = re.exec(code))) {
      s ||= new MagicString(code)
      const [full] = match
      s.overwrite(match.index, match.index + full.length, replacement, {
        contentOnly: true,
      })
    }
  })

  return s
    ? {
        code: s.toString(),
        map: sourcemap ? s.generateMap({ hires: 'boundary' }) : null,
      }
    : {
        code,
      }
}
