// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * Design-system enforcement (.claude/rules/design-system.md, "Enforcement"):
 * no raw Tailwind palette classes and no hex literals in .tsx files. Components must
 * reference semantic tokens (bg-primary, text-muted, border-border, ...) only.
 */
const HEX_COLOR = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/;
const PALETTE_SCALE = new RegExp(
  '\\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|caret|shadow|accent)-' +
    '(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-' +
    '(?:50|100|200|300|400|500|600|700|800|900|950)\\b',
);

/** @type {import('eslint').Rule.RuleModule} */
const noRawPaletteRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'disallow raw Tailwind palette classes and hex color literals in .tsx files; use semantic design tokens',
    },
    schema: [],
    messages: {
      hex: 'Raw hex color literal "{{value}}" is not allowed. Use a semantic design token instead (see .claude/rules/design-system.md).',
      palette:
        'Raw Tailwind palette class "{{value}}" is not allowed. Use a semantic token class (e.g. bg-primary, text-muted, border-overdue) instead.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!filename.endsWith('.tsx')) return {};

    function checkText(node, raw) {
      if (typeof raw !== 'string') return;
      const hexMatch = raw.match(HEX_COLOR);
      if (hexMatch) {
        context.report({ node, messageId: 'hex', data: { value: hexMatch[0] } });
        return;
      }
      const paletteMatch = raw.match(PALETTE_SCALE);
      if (paletteMatch) {
        context.report({ node, messageId: 'palette', data: { value: paletteMatch[0] } });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') checkText(node, node.value);
      },
      TemplateElement(node) {
        checkText(node, node.value.raw);
      },
    };
  },
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/build/**', '**/node_modules/**', '**/.vercel/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      local: { rules: { 'no-raw-palette': noRawPaletteRule } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'local/no-raw-palette': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Repo tooling: plain Node scripts run by npm, not part of any app bundle. They get
    // Node's globals, which the browser- and library-oriented configs above do not grant.
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', fetch: 'readonly', URL: 'readonly' },
    },
  },
);
