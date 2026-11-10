// The turn-transcript model the Activity tab shows, and how a Buzz prompt is
// read back into who asked what. Copied from block/buzz-app (Apache-2.0):
// src/features/agents/activity-transcript.ts and
// src/features/agent-harness/turn-records.ts, without the parts for Buzz's
// own observer records.
import { STEER } from "./acp/shims";

export { STEER };
export type PromptSection = Readonly<{ tag: string; body: string }>;
type Base = { id: string; at: number };
export type ToolItem = Base & {
  type: "tool";
  toolCallId: string;
  title: string;
  kind: string;
  status: string;
  input: string;
  output: string;
  diffs: { path: string; oldText?: string; newText: string }[];
  paths: string[];
  completedAt?: number;
  truncated: boolean;
};
export type TranscriptItem =
  | (Base & { type: "system"; sections: PromptSection[] })
  | (Base & {
      type: "prompt";
      text: string;
      author?: string;
      authorPubkey?: string;
      sections: PromptSection[];
      steer: boolean;
    })
  | (Base & {
      type: "message" | "thought";
      text: string;
      messageId?: string;
      /** Posted to Buzz, rather than said only in the session. */
      posted?: boolean;
    })
  | ToolItem
  | (Base & { type: "status"; text: string });
export type TranscriptTurn = {
  turnId: string;
  channelId: string | null;
  /** Null is the channel conversation; undefined means not recoverable. */
  threadRootId: string | null | undefined;
  triggeringEventIds: string[];
  sessionId?: string;
  newSession: boolean;
  /** The first shown turn of a session that began before the shown ones. */
  continued?: boolean;
  /** The opencode agent and model it ran on. */
  config: string[];
  startedAt: number;
  endedAt?: number;
  error?: string;
  stopReason?: string;
  /** The turn's start is not in what was read. */
  partial: boolean;
  items: TranscriptItem[];
};
export type Transcript = Readonly<{ turns: readonly TranscriptTurn[] }>;

const EVENT_TAGS = new Set(["buzz-event", STEER]);
type Json = Record<string, unknown>;
const object = (value: unknown): Json | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : undefined;
const str = (value: unknown) => (typeof value === "string" ? value : "");

/** An exact event record's author and the request it carried. */
export function readEventBody(body: string) {
  const match = /^(\{[^\n]*\})\nRequest: ("[^\n]*")$/.exec(body);
  if (!match?.[1] || !match[2]) return undefined;
  try {
    const event: unknown = JSON.parse(match[1]);
    const request: unknown = JSON.parse(match[2]);
    const pubkey = (event as { pubkey?: unknown } | null)?.pubkey;
    return typeof pubkey === "string" && typeof request === "string"
      ? { pubkey, request }
      : undefined;
  } catch {
    return undefined;
  }
}

/** Split top-level `<tag attrs>` … `</tag>` prompt framing; other text is kept. */
export function promptSections(text: string): PromptSection[] {
  const sections: PromptSection[] = [];
  const loose: string[] = [];
  let open: { tag: string; lines: string[] } | undefined;
  for (const line of text.split("\n")) {
    if (open) {
      if (line === `</${open.tag}>`) {
        sections.push({ tag: open.tag, body: open.lines.join("\n") });
        open = undefined;
      } else open.lines.push(line);
      continue;
    }
    const start = /^<([a-z][a-z0-9-]*)(?:\s[^<>]*)?>$/.exec(line);
    if (start?.[1]) open = { tag: start[1], lines: [] };
    else loose.push(line);
  }
  // An unterminated section is ordinary text, not a silently dropped body.
  if (open) loose.push(`<${open.tag}>`, ...open.lines);
  const rest = loose.join("\n").trim();
  if (rest) sections.push({ tag: "text", body: rest });
  return sections;
}

/** The triggering Buzz event(s): author label and content, without tags.
 * An event sent as an exact record names its author by `name`, if known. */
export function promptMessage(
  sections: PromptSection[],
  name: (pubkey: string) => string | undefined = () => undefined,
) {
  const authors: string[] = [];
  const authorKeys: string[] = [];
  const contents: string[] = [];
  for (const { tag, body } of sections) {
    const record = EVENT_TAGS.has(tag) ? readEventBody(body) : undefined;
    if (record) {
      contents.push(record.request);
      authorKeys.push(record.pubkey);
      const author = name(record.pubkey);
      if (author) authors.push(author);
      continue;
    }
    if (tag !== "buzz-event" && tag !== "buzz-events") continue;
    let event: Json | undefined;
    try {
      event = object(JSON.parse(body));
    } catch {
      // Legacy human-readable event block.
    }
    if (event && typeof event.content === "string") {
      contents.push(event.content);
      const key = str(event.pubkey);
      if (/^[0-9a-f]{64}$/.test(key)) authorKeys.push(key);
      const author = str(event.author) || str(event.npub) || str(event.pubkey);
      if (author) authors.push(author);
      continue;
    }
    for (const block of body.split(/\n(?=--- Event \d+ )/)) {
      const from = /^From: (.*)$/m.exec(block)?.[1];
      const start = block.indexOf("\nContent: ");
      if (start < 0) continue;
      const end = block.lastIndexOf("\nTags: ");
      contents.push(
        block.slice(start + 10, end > start ? end : undefined).trim(),
      );
      if (from) authors.push(from.replace(/ \((?:npub|hex)[^)]*\)$/, ""));
    }
  }
  return {
    text: contents.join("\n\n"),
    author: [...new Set(authors)].join(", ") || undefined,
    authorPubkey:
      contents.length === authorKeys.length && new Set(authorKeys).size === 1
        ? authorKeys[0]
        : undefined,
  };
}
