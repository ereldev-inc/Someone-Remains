import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FORBIDDEN: ReadonlyArray<[string, RegExp]> = [
  ['import de three', /from\s+['"]three/],
  ['DOM (document/window/navigator)', /\b(document|window|navigator|localStorage)\b/],
  ['Date.now', /Date\.now\s*\(/],
  ['new Date', /new\s+Date\s*\(/],
  ['performance.now', /performance\.now\s*\(/],
  ['Math.random', /Math\.random\s*\(/],
  ['import hors de sim/', /from\s+['"](\.\.\/)+(client|shared)\//],
];

function sources(dir: string): string[] {
  return (readdirSync(dir, { recursive: true, encoding: 'utf8' }) as string[])
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(dir, f));
}

describe('pureté de src/sim', () => {
  it('n\'utilise ni DOM, ni three, ni horloge, ni Math.random', () => {
    const files = sources(__dirname);
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      // Les commentaires peuvent citer ces noms : on ne contrôle que le code.
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const [label, re] of FORBIDDEN) {
        expect(re.test(code), `${file} : ${label}`).toBe(false);
      }
    }
  });
});
