# OpenCode

Buzz agents that run on your own [OpenCode](https://opencode.ai), with any provider it supports.

## Getting started

1. Install OpenCode 2.2 or later so `opencode` is on your PATH, and sign in to a provider with
   `opencode auth login`.
2. Go to **Agents**, create an agent with **OpenCode** as its **Harness**, or switch an existing agent to
   it. Its instructions and workspace carry over.
3. Add the agent to a channel and mention it. Each thread is one continuing OpenCode session, or each
   channel if you choose that in Settings.

## Settings

- **Identity:** OpenCode agent (`build`, `plan` or your own), Model and Thinking, and Instructions.
- **Settings:** Workspace (the folder OpenCode works in) and Conversations.
- **Activity:** the agent's conversations, whether each is working, and each one's transcript.

## Access it asks for

- Run `opencode acp`, and `opencode session export <id>` with only a session id, to show transcripts.
- Serve the Buzz tools to OpenCode on this computer (MCP), acting as the agent.
- Read files you ask the agent to upload, from its workspace.

OpenCode runs commands as you, so the agent acts only on your own mentions, or ones you attested.

Source and issues: https://github.com/dotcollectiveanz/buzz-opencode
