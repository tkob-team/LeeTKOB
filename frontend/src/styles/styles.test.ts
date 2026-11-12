// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateTokensCss, readTokens, tokensCssUrl } from '../../scripts/generate-tokens.ts';

describe('design-system stylesheets', () => {
  it('tokens.css matches docs/design-system/tokens.json (run `npm run tokens`)', () => {
    expect(readFileSync(tokensCssUrl, 'utf8')).toBe(generateTokensCss(readTokens()));
  });

  it('ui.css is a verbatim copy of docs/design-system/components/bundle.css', () => {
    const bundle = new URL('../../../docs/design-system/components/bundle.css', import.meta.url);
    const ui = new URL('./ui.css', import.meta.url);
    expect(readFileSync(ui, 'utf8')).toBe(readFileSync(bundle, 'utf8'));
  });
});
