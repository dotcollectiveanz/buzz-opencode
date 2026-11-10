# Notices

## Buzz (Apache-2.0)

Parts of this plugin are copied from [block/buzz-app](https://github.com/block/buzz-app), Copyright
2026 Block, Inc., under the Apache License 2.0 (the same licence as this repo, [LICENSE](LICENSE)):

- `src/acp/process.ts`, `session.ts`, `agent-sessions.ts`, `steps.ts`, `types.ts` and
  `session-control.ts`: Buzz's ACP client, from `src/features/agent-harness/`. Changed: imports
  point at local files, and a conversation's session records the harness kit's cursor instead of a
  timestamp (`newerCursor`).
- `src/acp/shims.ts`, `src/transcript-model.ts` and `src/sessions.ts`: small helpers from
  `src/buzz-mcp/message-tools.ts`, `src/bundled/claude-code/prompt.ts`,
  `src/features/agents/agent-config.ts`, `src/bundled/codex/config.ts`,
  `src/features/agents/activity-transcript.ts`, `src/features/agent-harness/turn-records.ts` and
  `src/bundled/goose/sessions.ts`, unchanged apart from trimming.
- `src/opencode.ts`, `src/models.ts`, `src/transcript.ts`, `src/settings.ts`, `src/runtime.ts` and
  their tests: the OpenCode harness from block/buzz-app#2432 by Gerard Casas Saez, with contributions
  from Marcus Quinn (casassg/buzz-app#1) and DotCollective (casassg/buzz-app#2). Changed:
  the runtime is rebuilt on the plugin API's harness kit (`ctx.agents.harness`) in place of the app's
  internals, and the tabs are rebuilt on Buzz's global CSS classes.

## OpenCode mark (MIT)

`plugin/icon.png` and the mark in `src/icon.tsx` are OpenCode's, from
[anomalyco/opencode](https://github.com/anomalyco/opencode) at
`6a89e9f287ade1e1ceefc0e4d13df97ff7631567` (`packages/identity/mark-512x512.png` and `mark.svg`),
unchanged.

MIT License

Copyright (c) 2025 opencode

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
