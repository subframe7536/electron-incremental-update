import { defineEslintConfig } from '@subframe7536/eslint-config'

export default defineEslintConfig({
  solid: false,
  overrideRules: {
    'prefer-template': 'off',
  },
})
