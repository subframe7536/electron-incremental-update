/* eslint-disable no-eval */
import { describe, expect, it } from 'vitest'
import { convertLiteral, decodeFn, obfuscateString } from '../src/build-plugins/bytecode/utils'

describe('obfuscate', () => {
  function testObfuscate(str: string) {
    expect(eval(decodeFn + obfuscateString(str))).toBe(str)
  }
  it('obfuscate normal', () => {
    testObfuscate('hello world')
  })

  it('obfuscate escape', () => {
    testObfuscate('\\\{\}\'\"`')
  })
})

describe('convert', () => {
  it('convert normal', () => {
    const code = 'const test = "hello world";test'
    const result = convertLiteral(code, false, 4).code
    expect(result).toMatchInlineSnapshot(`
      "const test = _0xstr_([0x6c,0x69,0x70,0x70,0x73,0x24,0x7b,0x73,0x76,0x70,0x68],4);test
      ;function _0xstr_(a,b){return String.fromCharCode.apply(0,a.map(function(x){return x-b}))};"
    `)
    expect(eval(result)).toBe('hello world')
  })

  it('convert escape', () => {
    const code = `const test = '\\\\{}\\'"\`';test`
    const result = convertLiteral(code, false, 4).code
    expect(result).toMatchInlineSnapshot(`
      "const test = _0xstr_([0x60,0x7f,0x81,0x2b,0x26,0x64],4);test
      ;function _0xstr_(a,b){return String.fromCharCode.apply(0,a.map(function(x){return x-b}))};"
    `)
    expect(eval(result)).toBe('\\{}\'\"`')
  })

  it('convert export variable', () => {
    const code = `export const test = 'hello world';`
    const result = convertLiteral(code, false, 4).code
    expect(result).toMatchInlineSnapshot(`
      "export const test = _0xstr_([0x6c,0x69,0x70,0x70,0x73,0x24,0x7b,0x73,0x76,0x70,0x68],4);
      ;function _0xstr_(a,b){return String.fromCharCode.apply(0,a.map(function(x){return x-b}))};"
      `)
  })

  it('convert string key', () => {
    const code = `const test = {'test': 1};test`
    const result = convertLiteral(code, false, 4).code
    expect(result).toMatchInlineSnapshot(`
      "const test = {[_0xstr_([0x78,0x69,0x77,0x78],4)]: 1};test
      ;function _0xstr_(a,b){return String.fromCharCode.apply(0,a.map(function(x){return x-b}))};"
    `)
    expect(eval(result)).toEqual({ test: 1 })
  })

  it('skip convert import', () => {
    const code = `import test from 'test';`
    const result = convertLiteral(code, false, 4).code
    expect(result).toMatchInlineSnapshot(`"import test from 'test';"`)
  })

  it('skip convert inline import', () => {
    const code = `const data = await import('./test');`
    const result = convertLiteral(code, false, 4).code
    expect(result).toMatchInlineSnapshot(`"const data = await import('./test');"`)
  })

  it('skip convert require', () => {
    const code = `const data = require('./test');`
    const result = convertLiteral(code, false, 4).code
    expect(result).toMatchInlineSnapshot(`"const data = require('./test');"`)
  })

  it('skip convert export path', () => {
    const code = `export * from 'test';`
    const result = convertLiteral(code, false, 4).code
    expect(result).toMatchInlineSnapshot(`"export * from 'test';"`)
  })

  it('skip convert default export ', () => {
    const code = `var a = 1;export default a`
    const result = convertLiteral(code, false, 4).code
    expect(result).toMatchInlineSnapshot(`"var a = 1;export default a"`)
  })

  it('skip convert all export', () => {
    const code = `export * as b from 'test';`
    const result = convertLiteral(code, false, 4).code
    expect(result).toMatchInlineSnapshot(`"export * as b from 'test';"`)
  })

  it('skip convert member export', () => {
    const code = `export {c} from 'test';`
    const result = convertLiteral(code, false, 4).code
    expect(result).toMatchInlineSnapshot(`"export {c} from 'test';"`)
  })
})
