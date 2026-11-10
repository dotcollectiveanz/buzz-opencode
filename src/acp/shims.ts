// Small helpers Buzz's ACP client imports from elsewhere in the app, copied
// here unchanged so the client builds without the app's internals.
// From block/buzz-app (Apache-2.0): src/buzz-mcp/message-tools.ts,
// src/bundled/claude-code/prompt.ts, src/features/agents/agent-config.ts and
// src/bundled/codex/config.ts.

/** The Buzz tools that post a message, and so take `final`. */
export const MESSAGE_TOOLS = ["send", "reply_in_subthread"] as const;
export const isMessageTool = (name: unknown) =>
  (MESSAGE_TOOLS as readonly unknown[]).includes(name);
/** Whether a call posts a message marked final, which can end the turn. */
export const isFinalMessage = (name: unknown, args: unknown) =>
  isMessageTool(name) && (args as { final?: unknown } | null)?.final === true;

const EVENT = "buzz-event";
export const STEER = "new-message-arrived-while-you-were-working";
const section = (tag: string, body: string) =>
  `<${tag}>\n${body.trim()}\n</${tag}>`;
/** A turn for a session that is still working on an earlier one. Its event's
 * section becomes the steer's, so the event stays a record of its own; a
 * turn without exactly one, such as a wake's, is wrapped whole. */
export function steerPrompt(turn: string) {
  const open = `\n<${EVENT}>\n`;
  const close = `\n</${EVENT}>`;
  const once = (text: string) =>
    turn.includes(text) && turn.indexOf(text) === turn.lastIndexOf(text);
  const steered =
    once(open) && once(close)
      ? turn.replace(open, `\n<${STEER}>\n`).replace(close, `\n</${STEER}>`)
      : section(STEER, turn);
  return `${steered}\n\nNote: A new message arrived while you were working. Continue your in-progress work and incorporate the new message if it's relevant; if it's unrelated, you may briefly acknowledge it and carry on.`;
}

export const unsupportedSynced = (name: string, value: string, by: string) =>
  `This agent's synced ${name} "${value}" isn't offered by ${by}. Change it in Settings.`;

export const absoluteWorkspace = (path: string) =>
  path.trim().startsWith("/") || /^[A-Za-z]:[\\/]/.test(path.trim());
/** An absolute path, or one under the home directory written `~/…`, which the
 * process host expands. */
export const validWorkspace = (path: string) =>
  /^~(\/|$)/.test(path.trim()) || absoluteWorkspace(path);
