import { describe, expect, it } from 'vitest'
import { obfuscateString } from '../src/build-plugins/bytecode/utils'

describe('obfuscate', () => {
  it('obfuscate', () => {
    // eslint-disable-next-line no-eval
    expect(eval(obfuscateString('hello world'))).toBe('hello world')
    // eslint-disable-next-line no-eval
    expect(eval(obfuscateString('\\\{\}\'\"`'))).toBe('\\\{\}\'\"`')
  })
})
