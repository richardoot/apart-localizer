import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import {
  sharedIgnores,
  sharedJavaScriptConfig,
  sharedTypeScriptConfig,
  prettierConfig,
} from '../eslint.config.js'

export default [
  { ignores: ['eslint.config.js', 'vitest.config.ts'] },
  sharedIgnores,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ...sharedTypeScriptConfig,
    languageOptions: {
      ...sharedTypeScriptConfig.languageOptions,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  sharedJavaScriptConfig,
  eslintConfigPrettier,
  prettierConfig,
]
