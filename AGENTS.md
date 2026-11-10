# Instructions for coding agents

This repo is a Buzz desktop plugin (`opencode-harness`) that registers an OpenCode agent harness. Read
[README.md](README.md) first.

## Hard rules

- **One self-contained module.** Buzz loads `plugin/plugin.js` from a blob URL: no runtime imports, no
  CSS or asset files, no code splitting. `build.mjs` and `scripts/check.mjs` enforce it.
- **React comes from Buzz.** Never import `react` or `react-dom` at runtime. JSX compiles to
  `React.createElement` against `src/react.ts`, set from `ctx.react` in `apply`. Tests may import React.
- **Types only from Buzz.** `@buzz/author` (via `src/buzz.ts`) is type-only; never import it at runtime.
- **No Buzz UI components.** Buzz exposes none to plugins. Build UI in `src/ui.tsx` with Buzz's global
  `buzz-*` classes and design tokens (`var(--space-2)` etc.), matching Buzz's own markup.
- **Commit the build.** After changing `src/`, run `npm run build` and commit `plugin/plugin.js`;
  `npm run check` fails if it's stale.
- **Manifest `host` changes need the owner's approval** on update in Buzz; keep them minimal, and update
  `scripts/check.mjs` and `src/opencode.test.ts` with them.
- **Never pass anything but a checked `ses_…` id** to the `export` process (`src/transcript.ts`).

## Layout

| Path | What it is |
| --- | --- |
| `src/index.tsx` | `apply(ctx)`: registers the agent type, its tabs and icon |
| `src/runtime.ts` | Turns Buzz deliveries into OpenCode turns, on the harness kit |
| `src/acp/` | Buzz's ACP client, copied (see NOTICE.md); keep changes small and noted there |
| `src/opencode.ts` | OpenCode's ACP hooks: model, thinking level and agent (`mode`) selection |
| `src/models.ts` | Lists models, levels and agents from a short-lived `opencode acp` session |
| `src/settings.ts` | Config, defaults, synced settings, and carry/adopt across harness changes |
| `src/tabs.tsx` | New agent fields, Identity/Settings tab, Activity tab and transcript view |
| `src/transcript.ts` | Reads `opencode session export` into Buzz's turn model |
| `src/ui.tsx` | Buzz-styled controls |

## Checks

- `npm test`: unit tests, including loading the built `plugin.js` and rendering every tab.
- `npm run typecheck` after `npm run types` (or `node scripts/types.mjs <buzz-app checkout>`).
- `OPENCODE_LIVE=1 npx vitest run src/runtime.live.test.ts`: a real turn against the local OpenCode
  (needs OpenCode 2.2+ and a signed-in provider; `OPENCODE_MODEL` picks the model). Nothing reaches Buzz.
- Before a release, also try the change in Buzz itself: install from `plugin/`, switch an agent to
  OpenCode, mention it, and open its Activity.

## Releases

1. Update `version` in `package.json` and add notes to `CHANGELOG.md`.
2. `npm run build && npm run check`.
3. Commit, tag `vX.Y.Z`, push with tags, and create a GitHub release with the changelog section and
   `opencode-harness-plugin.zip` (the contents of `plugin/`) attached.
