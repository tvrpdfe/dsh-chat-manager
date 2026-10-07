/**
 * Platform seed words — the module-table entities the web shell shares into a
 * client plugin's factory (`packages/client/web/src/seed.ts`).
 *
 * One list, two consumers, for opposite reasons: `scripts/build.mjs` marks these
 * external so esbuild never inlines a second copy of a platform-provided module
 * (including the ones this fork does not import today), and
 * `scripts/verify-bundle.mjs` refuses any module-table request outside the set.
 *
 * It lives here because two hand-kept copies of it drifted: the gate checked
 * `requires ⊆ seeds` only, so deleting an entry from the build's own list
 * inlined that platform module — which SHRINKS the require set, leaving the
 * subset check greener than before, not redder.
 */
export const PLATFORM_SEEDS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]
