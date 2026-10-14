import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['**/node_modules/**', '**/dist/**', '**/.test-build/**', '**/coverage/**'] },
    {
        files: ['**/*.{js,mjs,cjs,ts}'],
        extends: [js.configs.recommended],
        languageOptions: { globals: globals.node },
        linterOptions: { reportUnusedDisableDirectives: 'error' },
        rules: {
            eqeqeq: ['error', 'always'],
            'no-var': 'error',
            'prefer-const': 'error',
            'no-debugger': 'error',
        },
    },
    {
        files: ['**/*.ts'],
        extends: [tseslint.configs.recommended],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
        },
    },
    {
        files: ['**/tests/**/*.ts'],
        rules: {
            // node:test owns these promises and reports test failures through the runner.
            '@typescript-eslint/no-floating-promises': ['error', {
                allowForKnownSafeCalls: [
                    { from: 'package', package: 'node', name: ['test', 'it', 'describe', 'suite'] },
                ],
            }],
        },
    },
);
