// tests/bundle-parses.test.mjs
//
//   node --test tests/bundle-parses.test.mjs
//
// The bundle compiles with NO WARNINGS, and the warning that matters is one
// specific one.
//
// ── Why this file exists ────────────────────────────────────────────────
//
// A stray `}` inside a JSX element is not a syntax error. esbuild and vite
// both accept it and render it as LITERAL TEXT — a bare `}` appears on the
// screen, next to whatever the surrounding element draws.
//
// That has now happened twice while editing
// frontend/screens/Coverage/GloobalCoverageScreen.jsx, which is a 1,100-line
// file of densely nested inline JSX where a brace is easy to leave behind
// when moving a block. Both times:
//
//   node build_app.mjs            passed — it concatenates, it does not parse
//   esbuild transformSync         passed — it is a warning, not an error
//   vite build                    passed — same reason
//   the whole test suite          passed — no test reads the rendered DOM
//
// Both times, the only thing that caught it was putting the page in a
// browser and looking at it. This test makes the compiler's own warning
// into a failure, so the next one is caught in two seconds on a laptop
// instead of in a screenshot or on somebody's phone.
//
// It deliberately does NOT rebuild the bundle: it checks the committed
// generated file, because that is the artefact Netlify ships. Run
// `node build_app.mjs` first if sources have changed.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(ROOT, 'gloobal-essentials-preview', 'src', 'GloobalApp.jsx');
const require = createRequire(join(ROOT, 'gloobal-essentials-preview', 'package.json'));

describe('the generated bundle compiles cleanly', () => {
  test('the bundle exists — run `node build_app.mjs` if this fails', () => {
    assert.ok(existsSync(BUNDLE), `${BUNDLE} is missing`);
  });

  test('no stray brace renders as literal text in any JSX element', () => {
    const esbuild = require('esbuild');
    const source = readFileSync(BUNDLE, 'utf8');

    const result = esbuild.transformSync(source, { loader: 'jsx', jsx: 'automatic' });
    const warnings = result.warnings || [];

    // Reported with the line and the surrounding text, because a bare
    // "1 warning" tells whoever hits this nothing about where to look.
    const detail = warnings
      .map((w) => {
        const where = w.location ? `line ${w.location.line}` : 'unknown line';
        const line = w.location?.lineText?.trim().slice(0, 160) || '';
        return `  ${where}: ${w.text}\n    ${line}`;
      })
      .join('\n');

    assert.equal(
      warnings.length,
      0,
      `the bundle compiles with ${warnings.length} warning(s):\n${detail}\n\n` +
        'A "character \\"}\\" is not valid inside a JSX element" warning means a brace ' +
        'is being rendered as text on the screen. It is not a syntax error and no other ' +
        'check in this repo catches it.'
    );
  });

  test('no hook is called from inside another function', () => {
    // The bug this catches, which cost a working form and shipped:
    //
    //   const resetProjectForm = () => {
    //     setProjectTitle("");
    //     useBackClose(showProjectForm, ...);   <-- inside the handler
    //   };
    //
    // A block of useBackClose calls was inserted one line above
    // resetProjectForm's closing brace instead of below it. React only
    // throws "Invalid hook call" when the handler RUNS, so the screen
    // rendered perfectly and every test passed — the form simply refused to
    // open, silently, until somebody clicked the button in a browser.
    //
    // Hooks in this codebase live in the component body, which is exactly
    // two spaces of indentation. Anything deeper is inside something.
    const source = readFileSync(join(ROOT, 'frontend/screens/Coverage/GloobalCoverageScreen.jsx'), 'utf8');
    const offenders = [];
    source.split('\n').forEach((line, i) => {
      const call = line.match(/^(\s*)(useBackClose|useState\d*|useEffect\d*|useMemo\d*|useCallback\d*|useRef\d*)\(/);
      if (!call) return;
      // `const [a, setA] = useState16(...)` is a declaration, not a bare
      // call, and is matched by the indentation rule the same way.
      if (call[1].length !== 2) offenders.push(`line ${i + 1}: ${line.trim().slice(0, 70)}`);
    });
    assert.deepEqual(
      offenders,
      [],
      `a hook is called below the component's top level:\n  ${offenders.join('\n  ')}\n\n` +
        'React throws "Invalid hook call" only when that code runs, so this will not fail any other test.'
    );
  });

  test('the sources that feed it parse too', () => {
    // The bundle could be stale. Compiling the one file that keeps producing
    // this fault directly means a source edit is checked even when nobody has
    // rebuilt.
    const esbuild = require('esbuild');
    const screen = readFileSync(join(ROOT, 'frontend/screens/Coverage/GloobalCoverageScreen.jsx'), 'utf8');
    const result = esbuild.transformSync(screen, { loader: 'jsx', jsx: 'automatic' });
    assert.equal(
      (result.warnings || []).length,
      0,
      (result.warnings || []).map((w) => `line ${w.location?.line}: ${w.text}`).join('\n')
    );
  });
});
