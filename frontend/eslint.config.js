import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    // Feature code uses ui components and tokens; it never hard-codes colours, sizes or radii.
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='style']",
          message: 'Feature code must not use inline styles; use ui components and tokens.',
        },
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b|\\b\\d+(\\.\\d+)?(px|rem|em)\\b/]',
          message: 'Feature code must not hard-code colours or sizes; use tokens.',
        },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['*.css'], message: 'Feature code must not add stylesheets.' }] },
      ],
    },
  },
]);
