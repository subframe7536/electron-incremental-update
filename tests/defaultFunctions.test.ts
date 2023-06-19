import { describe, expect, it } from 'vitest'
import { compareVersionDefault } from '../src/updater/defaultFunctions'

describe('compareVersionDefault', () => {
  it('should return true when new version is greater than old version', () => {
    expect(compareVersionDefault('1.0.0', '2.0.0')).toBe(true)
    expect(compareVersionDefault('1.0.0', '1.1.0')).toBe(true)
    expect(compareVersionDefault('1.0.0', '1.0.1')).toBe(true)
    expect(compareVersionDefault('1.0.0-alpha', '1.0.0')).toBe(true)
    expect(compareVersionDefault('1.0.0-alpha', '1.0.0-beta')).toBe(true)
  })

  it('should return false when old version is greater than or equal to new version', () => {
    expect(compareVersionDefault('2.0.0', '1.0.0')).toBe(false)
    expect(compareVersionDefault('1.1.0', '1.0.0')).toBe(false)
    expect(compareVersionDefault('1.0.1', '1.0.0')).toBe(false)
    expect(compareVersionDefault('1.0.0', '1.0.0')).toBe(false)
    expect(compareVersionDefault('1.0.0-beta', '1.0.0-alpha')).toBe(false)
  })

  it('should throw an error when given an invalid version', () => {
    expect(() => compareVersionDefault('1.0', '1.0.a')).toThrowError()
    expect(() => compareVersionDefault('1.0.0', '')).toThrowError()
    expect(() => compareVersionDefault('1.0.0', '1.0.a')).toThrowError()
    expect(() => compareVersionDefault('1.p.2', '1.0.0')).toThrowError()
    expect(() => compareVersionDefault('1.0.0', 'invalid')).toThrowError()
  })
})
