import tseslint from 'typescript-eslint'

// The purity gate: the engine never touches ambient time, randomness, or
// the DOM. Time enters as logged input; randomness is state.
const bannedEngineGlobals = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'performance',
]

export default tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', 'planning/', 'coverage/'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['test/**'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Engine randomness is RngState threaded through reducers.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Engine time arrives as the now field of dispatched envelopes.',
        },
        {
          object: 'performance',
          property: 'now',
          message: 'Engine time arrives as the now field of dispatched envelopes.',
        },
      ],
      'no-restricted-globals': [
        'error',
        ...bannedEngineGlobals.map((name) => ({
          name,
          message: 'The engine is headless: no DOM or ambient browser state.',
        })),
      ],
    },
  },
)
