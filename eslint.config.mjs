import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-plugin-prettier'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import unusedImports from 'eslint-plugin-unused-imports'
import eslintConfigPrettier from 'eslint-config-prettier'

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.tsbuildinfo', 'packages/qa-lens.db'],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    plugins: {js, prettier},
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'prettier/prettier': 'error',
      ...js.configs.recommended.rules,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      js,
      prettier,
      '@typescript-eslint': tseslint,
      'unused-imports': unusedImports,
    },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {...globals.node, ...globals.browser},
    },
    rules: {
      'prettier/prettier': 'error',
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: true,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': ['error', {allowDeclarations: true}],
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
  eslintConfigPrettier,
]
