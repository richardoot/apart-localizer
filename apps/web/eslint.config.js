import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import * as parserVue from 'vue-eslint-parser'
import eslintConfigPrettier from 'eslint-config-prettier'
import vueTsEslintConfig from '@vue/eslint-config-typescript'
import {
  sharedIgnores,
  sharedJavaScriptConfig,
  prettierConfig,
} from '../../eslint.config.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default [
  {
    ignores: [
      'eslint.config.js',
      'vite.config.ts',
      'vitest.config.ts',
      'scripts/*.mjs',
      'public/**',
      'dev-dist/**',
    ],
  },
  sharedIgnores,
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  ...vueTsEslintConfig({ rootDir: __dirname }),
  sharedJavaScriptConfig,
  // No `plugins` entry: @vue/eslint-config-typescript has already registered
  // `@typescript-eslint`, and ESLint 10 refuses a second registration.
  {
    name: 'web/typescript',
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', disallowTypeAnnotations: false },
      ],
    },
  },
  {
    name: 'web/vue-rules',
    files: ['**/*.vue'],
    languageOptions: {
      parser: parserVue,
      parserOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
    },
    rules: {
      // Pas de bloc <style> : Tailwind et les jetons de src/style.css.
      'vue/block-order': ['error', { order: ['script', 'template'] }],
      'vue/multi-word-component-names': 'off',
      'vue/component-definition-name-casing': ['error', 'PascalCase'],
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/define-macros-order': [
        'error',
        {
          order: ['defineOptions', 'defineProps', 'defineEmits', 'defineSlots'],
        },
      ],
      'vue/define-emits-declaration': ['error', 'type-based'],
      'vue/define-props-declaration': ['error', 'type-based'],
      'vue/no-empty-component-block': 'error',
      'vue/no-undef-components': [
        'error',
        { ignorePatterns: ['RouterLink', 'RouterView'] },
      ],
      'vue/no-unused-emit-declarations': 'error',
      'vue/no-unused-refs': 'error',
      'vue/block-lang': ['error', { script: { lang: 'ts' } }],
      'vue/no-template-target-blank': 'error',
    },
  },
  eslintConfigPrettier,
  prettierConfig,
]
