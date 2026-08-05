import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Generated output is not ours to lint, and routeTree.gen.ts is rebuilt on
    // every dev/build. Linting either produces noise nobody can act on.
    ignores: ['dist', 'src/api/generated', 'src/routeTree.gen.ts', 'coverage', 'playwright-report'],
  },
  js.configs.recommended,
  {
    // Type-aware rules apply only to files in the TS project. Applying them
    // repo-wide makes ESLint fail on its own config file.
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The failure mode that matters here: an unawaited refresh or navigation
      // fails silently in the browser.
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    // TanStack Router's documented control-flow for guards is `throw redirect(...)`
    // and `throw notFound()`, which are plain objects by design. The rule is
    // right in general and wrong for exactly these files.
    files: ['src/routes/**/*.tsx'],
    rules: { '@typescript-eslint/only-throw-error': 'off' },
  },
  {
    // A provider paired with its hook in one file is the idiomatic shape, and
    // splitting them buys nothing but an extra import. The cost is losing Fast
    // Refresh for this one file.
    files: ['src/auth/auth-context.tsx', 'src/main.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**', 'e2e/**'],
    rules: {
      // Playwright fixtures take a parameter named `use`, which the React
      // plugin reads as the `use` hook being called outside a component.
      'react-hooks/rules-of-hooks': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    // Config files are plain JS/ESM and not part of the TS program.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
);
