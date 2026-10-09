import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', '.wrangler', 'worker/worker-configuration.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // The engine, the rating model and the table server are deterministic:
    // randomness and time are injected (CSPRNG deck, Durable Object alarms,
    // idle periods), never ambient.
    files: ['src/engine/**/*.ts', 'src/rating/**/*.ts', 'worker/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'setTimeout',
          message: 'Use an injected deadline or a DO alarm.',
        },
        {
          name: 'setInterval',
          message: 'Use an injected deadline or a DO alarm.',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Inject randomness (shuffleWith).',
        },
        { object: 'Date', property: 'now', message: 'Inject the clock.' },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
)
