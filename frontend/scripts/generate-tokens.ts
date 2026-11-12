// Generates src/styles/tokens.css from docs/design-system/tokens.json.
// Run with `npm run tokens`; src/styles/tokens.test.ts fails when the file is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface ColorToken {
  name: string;
  value: { light: string; dark: string };
}
interface TypeStyle {
  name: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: number;
}
interface SizeToken {
  name: string;
  value: string;
}
export interface DesignTokens {
  color: { tokens: ColorToken[] };
  type: {
    families: Record<string, string>;
    groups: { styles: TypeStyle[] }[];
  };
  spacing: { tokens: SizeToken[] };
  radius: { tokens: SizeToken[] };
}

export const tokensJsonUrl = new URL('../../docs/design-system/tokens.json', import.meta.url);
export const tokensCssUrl = new URL('../src/styles/tokens.css', import.meta.url);

export function generateTokensCss(tokens: DesignTokens): string {
  const light = tokens.color.tokens.map((t) => `  --${t.name}: ${t.value.light};`);
  const dark = tokens.color.tokens.map((t) => `    --${t.name}: ${t.value.dark};`);
  const families = Object.entries(tokens.type.families).map(
    ([name, value]) => `  --font-${name}: ${value};`,
  );
  const styles = tokens.type.groups
    .flatMap((g) => g.styles)
    .flatMap((s) => [
      `  --${s.name}-font-size: ${s.fontSize};`,
      `  --${s.name}-line-height: ${s.lineHeight};`,
      `  --${s.name}-font-weight: ${String(s.fontWeight)};`,
    ]);
  const sizes = [...tokens.spacing.tokens, ...tokens.radius.tokens].map(
    (t) => `  --${t.name}: ${t.value};`,
  );
  return [
    '/* Generated from docs/design-system/tokens.json by `npm run tokens`. Do not edit. */',
    ':root {',
    '  color-scheme: light dark;',
    ...light,
    ...families,
    ...styles,
    ...sizes,
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root {',
    ...dark,
    '  }',
    '}',
    '',
  ].join('\n');
}

export function readTokens(): DesignTokens {
  return JSON.parse(readFileSync(tokensJsonUrl, 'utf8')) as DesignTokens;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(tokensCssUrl, generateTokensCss(readTokens()));
  console.log(`wrote ${fileURLToPath(tokensCssUrl)}`);
}
