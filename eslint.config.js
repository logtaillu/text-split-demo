import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import {globalIgnores} from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      quotes: ['error', 'single', {avoidEscape: true}],
      // 行末不使用分号
      semi: ['error', 'never'],
      eqeqeq: ['error', 'always'],
      'line-comment-position': ['error', {
        // 要求行内注释必须写在代码上方
        position: 'above',
        ignorePattern: 'eslint-disable', // 忽略 eslint-disable 这类特殊注释
        applyDefaultPatterns: true
      }],
      // 禁止代码块内的空行填充
      'padded-blocks': ['error', 'never']
    }
  },
])
