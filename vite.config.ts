// SPDX-License-Identifier: AGPL-3.0-or-later
// ⚠️ `vitest/config` and NOT `vite`. The `test` block belongs to Vitest, and only its own `defineConfig`
// knows the type — imported from `vite` it typechecks as an unknown property and `tsc` refuses the file.
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright'; // Vitest 4: the provider became its own package

export default defineConfig({
  // The annotation page is the only thing this repository builds. `src/app/` holds it; everything else here
  // is library code the page and the tests import.
  root: 'src/app',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  test: {
    // Two projects, as in the engine: pure logic runs in Node in milliseconds, and anything that needs a
    // real canvas or a real event runs in Chromium. A decoder that only ever ran in jsdom would prove
    // nothing about the browser this tool actually runs in.
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          // ⚠️ FORWARD SLASHES, LITERALLY, AND NEVER `join()`. Vitest's include is a glob, and a backslash
          // in a glob is an escape character, not a separator — on Windows a joined path silently matches
          // ZERO files and the suite reports success having run nothing.
          include: ['tests/**/*.node.test.ts'],
          root: '.',
        },
      },
      {
        test: {
          name: 'browser',
          include: ['tests/**/*.browser.test.ts'],
          root: '.',
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
