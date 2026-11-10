# OpenCode for Buzz

A [Buzz](https://github.com/block/buzz-app) desktop plugin that adds **OpenCode** as an agent harness:
Buzz agents that run on your own [OpenCode](https://opencode.ai), with any model provider it supports.

Mention the agent in a channel or thread and OpenCode does the work on your computer, replying in Buzz
with the Buzz tools. Each thread is one continuing OpenCode session.

## Features

- **Harness:** OpenCode in Agents → Harness, for new agents or by switching an existing one. Its
  instructions and workspace carry over.
- **Identity:** OpenCode agent (`build`, `plan` or your own), Model and Thinking, listed from your
  OpenCode, and Instructions.
- **Settings:** Workspace (the folder OpenCode works in) and Conversations (one session per thread, or
  per channel).
- **Activity:** the agent's conversations, whether each is working, and each one's full transcript:
  prompts, thinking, replies and tool calls, read from OpenCode's own history.
- **Synced settings:** agent, model, thinking level and scope sync across your devices.
- A failed turn says so in its thread and tags you.

## Requirements

- Buzz desktop 0.7 (preview 251 or later) on macOS.
- [OpenCode](https://opencode.ai) **2.2 or later** on your PATH, signed in to a provider
  (`opencode auth login`). Earlier versions don't tell Buzz which conversation a tool call belongs to.

## Install

1. Download `opencode-harness-plugin.zip` from the
   [latest release](https://github.com/dotcollectiveanz/buzz-opencode/releases/latest) and unzip it, or
   clone this repo.
2. In Buzz: **Settings → Plugins → Manage plugins → Add → Browse** under "Add from folder", and pick the
   unzipped folder (or `plugin/` in your clone). Use **Browse**, not drag and drop, so Buzz can offer
   updates.
3. Review the access it asks for, select **Install plugin**, and enable it if it shows as disabled.
4. Go to **Agents**, create an agent with **OpenCode** as its Harness, add it to a channel and mention it.

To install straight from GitHub instead, enter `https://github.com/dotcollectiveanz/buzz-opencode.git` in
**Add** and pick the `plugin` folder.

### Access it asks for

- Run `opencode acp`, and `opencode session export <id>` (given only a session id) for transcripts.
- Serve the Buzz tools to OpenCode on this computer (MCP), acting as the agent.
- Read files you ask the agent to upload, from its workspace.

OpenCode runs commands as you, so an agent acts only on your own mentions, or ones you attested.

## How it works

- **Buzz's side of each turn** comes from the plugin API's harness kit (`ctx.agents.harness`): which
  conversation a mention goes to, Buzz's system and turn prompts, the Buzz tools over MCP, and replies.
- **OpenCode's side:** one `opencode acp` process serves every agent, through a copy of Buzz's ACP client
  (`src/acp/`). Each conversation is one ACP session; tool calls are routed to their conversation by the
  session id OpenCode sends.
- **UI:** plain React from `ctx.react`, using Buzz's global `buzz-*` CSS classes so the tabs match the
  built-in harnesses.

It began as the OpenCode harness proposed for Buzz itself in
[block/buzz-app#2432](https://github.com/block/buzz-app/pull/2432), and ships as an installed plugin
because Buzz asks new harnesses to. If Buzz later bundles OpenCode, use one harness or the other for an
agent, not both.

## Develop

See [AGENTS.md](AGENTS.md) for the layout and rules. In short:

```sh
npm install
npm run build        # src/ → plugin/plugin.js
npm test             # unit tests
npm run types        # Buzz's plugin API types, for typecheck (clones block/buzz-app)
npm run check        # typecheck, tests, manifest, icon and build freshness
OPENCODE_LIVE=1 npx vitest run src/runtime.live.test.ts   # a real turn through your OpenCode
```

`plugin/plugin.js` is committed, because Buzz installs built plugins and never runs a build.

## Licence

Apache-2.0, see [LICENSE](LICENSE). Parts are copied from Buzz (Apache-2.0, © Block, Inc.) and the
OpenCode mark is OpenCode's (MIT); see [NOTICE.md](NOTICE.md). Not affiliated with Block or OpenCode.
