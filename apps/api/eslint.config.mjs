import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import {
  sharedIgnores,
  sharedJavaScriptConfig,
  sharedTypeScriptConfig,
  prettierConfig,
} from '../../eslint.config.js'

export default [
  {
    ignores: ['eslint.config.mjs', 'vitest.config.ts', 'vitest.config.e2e.ts'],
  },
  sharedIgnores,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ...sharedTypeScriptConfig,
    languageOptions: {
      ...sharedTypeScriptConfig.languageOptions,
      parserOptions: {
        // One project for sources, specs, the e2e harness and prisma.config.ts.
        projectService: false,
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  sharedJavaScriptConfig,
  eslintConfigPrettier,
  prettierConfig,
]
