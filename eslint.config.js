/**
 * ESLint Configuration for Chrome Extension (Flat Config Format - ESLint 9+)
 *
 * Special rule: Content scripts may only use relative (./) imports
 */

import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    // Global ignores
    ignores: [
      'node_modules/**',
      'dist/**',
      'public/**',
      '*.config.js',
      '*.config.ts',
    ],
  },
  {
    // Base config for all TypeScript files
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Content scripts are classic scripts, so the BUILT bundle must have no import/export.
    // Vite/Rollup inlines relative imports (./x, ../x) into each entry, which is safe as long as
    // no module is shared between two content entries (Rollup would then emit a shared
    // chunk that the entry imports). scripts/check-content-bundles.mjs enforces that after
    // every build. Only relative imports are allowed here; bare or aliased ('@/...') imports
    // reach into app code (React, idb, chrome-only APIs) and bloat or break the bundle.
    files: ['src/content/**/*.ts', 'src/content/**/*.tsx'],
    // Tests run under Vitest, not as content scripts
    ignores: ['src/content/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportDeclaration[source.value!=/^[.]/]',
          message: 'Content scripts may only import relative modules (./x or ../x). See the comment in eslint.config.js and scripts/check-content-bundles.mjs.',
        },
      ],
    },
  },
];
