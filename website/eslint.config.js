// ESLint flat config for the FoodOS.ai marketing site.
// Owned by DevOps (FOO-4); run by `npm run lint` and by CI.
//
// Three environments live in this one package and they do NOT share globals:
//   src/        browser  — DOM, window, sessionStorage
//   functions/  Workers  — fetch/Request/Response, no DOM, no Node
//   *.config.ts Node     — build tooling
// Each gets its own block below so a mistake like using `window` inside a
// Pages Function is caught by lint rather than at runtime in production.

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.wrangler/**', 'coverage/**'],
  },

  // Baseline for every TypeScript file in the package.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      parserOptions: { sourceType: 'module' },
    },
    rules: {
      // Unused args are fine when they're there to document a signature,
      // as long as they're explicitly marked with a leading underscore.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Leads are the whole point of this site; a swallowed error is a lost
      // lead. Force every catch to name and handle what it caught.
      'no-empty': ['error', { allowEmptyCatch: false }],
      eqeqeq: ['error', 'smart'],
      // New in eslint:recommended as of ESLint 10. It fires on defensive
      // initialisation (`let x = null` before a try/catch that always assigns),
      // which is a readability preference rather than a defect. Kept visible as
      // a warning so it doesn't block a PR over style.
      'no-useless-assignment': 'warn',
    },
  },

  // Frontend: browser globals + React Hooks correctness.
  {
    files: ['src/**/*.{ts,tsx}'],
    // `configs.flat` is the flat-config namespace; `configs['recommended-latest']`
    // at the top level is still the legacy eslintrc shape and will not load.
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: {
      globals: globals.browser,
    },
  },

  // Pages Functions: Workers runtime. Deliberately NOT browser globals.
  {
    files: ['functions/**/*.ts'],
    languageOptions: {
      globals: globals.worker,
    },
    rules: {
      // A stray console.log in a Function writes to production logs, which is
      // where lead payloads land on a 502. Warn, don't block.
      'no-console': 'warn',
    },
  },

  // Tests run under Vitest, in Node.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.worker },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // Build tooling runs in Node.
  {
    files: ['*.config.ts', '*.config.js', 'vite.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
)
