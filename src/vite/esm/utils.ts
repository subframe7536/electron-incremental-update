import MagicString from 'magic-string'

import { shim } from './constant'

// eslint-disable-next-line regexp/no-super-linear-backtracking
const ESMStaticImportRe = /(?<=\s|^|;)import\s*([\s"']*(?<imports>[\p{L}\p{M}\w\t\n\r $*,/{}@.]+)from\s*)?["']\s*(?<specifier>(?<=")[^"]*[^\s"](?=\s*")|(?<=')[^']*[^\s'](?=\s*'))\s*["'][\s;]*/gmu

interface StaticImport {
  end: number
}

export function findStaticImports(code: string): StaticImport[] {
  const matches: StaticImport[] = []
  for (const match of code.matchAll(ESMStaticImportRe)) {
    matches.push({ end: (match.index || 0) + match[0].length })
  }
  return matches
}

export function insertCJSShim(code: string, sourcemap: any, insertPosition = 0): { code: string, map: any } | null {
  if (code.includes(shim) || !/__filename|__dirname|require\(|require\.resolve\(|require\.apply\(/.test(code)) {
    return null
  }

  const s = new MagicString(code)
  s.appendRight(insertPosition, shim)
  return {
    code: s.toString(),
    map: sourcemap ? s.generateMap({ hires: 'boundary' }) : null,
  }
}
