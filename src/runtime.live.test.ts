/// <reference types="node" />
// A real turn through the runtime against the local `opencode acp`, with a
// stand-in harness kit and Buzz tools served over loopback MCP: nothing
// reaches Buzz. Run with OPENCODE_LIVE=1 (OPENCODE_MODEL picks the model).
import { spawn as spawnChild } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { HostProcessOptions } from "./acp/host";
import { OpenCodeRuntime } from "./runtime";
import { DEFAULT_CONFIG } from "./settings";

const LIVE = process.env.OPENCODE_LIVE === "1";
const MODEL = process.env.OPENCODE_MODEL ?? "openrouter/~anthropic/claude-haiku-latest";
const ARGS: Record<string, string[]> = {
  opencode: ["acp"],
  export: ["session", "export"],
};
const CHANNEL = "c".repeat(36);
const ROOT = "e".repeat(64);
const AGENT = "a".repeat(64);

/** The host's `spawn`, running a declared process with its manifest args. */
const spawn = async (id: string, options: HostProcessOptions = {}) => {
  const child = spawnChild(
    "opencode",
    [...(ARGS[id] ?? []), ...(options.args ?? [])],
    {
      cwd: options.cwd?.replace(/^~/, homedir()),
      env: Object.fromEntries(
        Object.entries({ ...process.env, ...options.env }).filter(
          ([, value]) => typeof value === "string",
        ),
      ) as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdout.setEncoding("utf8").on("data", (d) => options.onStdout?.(d));
  child.stderr.setEncoding("utf8").on("data", (d) => options.onStderr?.(d));
  const exited = new Promise<number | null>((resolve) =>
    child.on("exit", (code) => resolve(code)),
  );
  return {
    write: (data: string) =>
      new Promise<void>((resolve, reject) =>
        child.stdin.write(data, (error) => (error ? reject(error) : resolve())),
      ),
    end: async (data?: string) => void child.stdin.end(data),
    kill: async () => void child.kill(),
    exited,
  };
};

/** The host's `serveMcp`: the handler over loopback HTTP with a bearer token. */
const serveMcp = async (handler: (message: unknown) => Promise<unknown>) => {
  const token = randomBytes(32).toString("base64url");
  const server = createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`)
      return void response.writeHead(404).end();
    if (request.method !== "POST") return void response.writeHead(405).end();
    let body = "";
    request.setEncoding("utf8").on("data", (data) => (body += data));
    request.on("end", async () => {
      const reply = await handler(JSON.parse(body));
      if (reply === undefined) return void response.writeHead(202).end();
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(reply));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const closed = new Promise<void>((resolve) => server.on("close", resolve));
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    headers: [{ name: "Authorization", value: `Bearer ${token}` }],
    close: async () => {
      server.closeAllConnections();
      server.close();
    },
    closed,
  };
};

describe.skipIf(!LIVE)("the runtime against opencode acp", () => {
  it("runs a turn whose Buzz send reaches the conversation, then reads its transcript", {
    timeout: 240_000,
  }, async () => {
    const sends: { conversation: string; text: string }[] = [];
    const conversation = Object.freeze({
      key: `${CHANNEL}/${ROOT}`,
      channel: CHANNEL,
      root: ROOT,
      topLevel: false,
      where: "#general",
    });
    const tools = (_agent: unknown, place: typeof conversation) =>
      async (message: { id?: number; method: string; params?: any }) => {
        const answer = (result: unknown) => ({ jsonrpc: "2.0", id: message.id, result });
        if (message.id === undefined) return undefined;
        if (message.method === "initialize")
          return answer({
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "buzz", version: "test" },
          });
        if (message.method === "tools/list")
          return answer({
            tools: [
              {
                name: "send",
                description: "Posts a message in the conversation.",
                inputSchema: {
                  type: "object",
                  properties: { text: { type: "string" }, final: { type: "boolean" } },
                  required: ["text"],
                },
              },
            ],
          });
        if (message.method === "tools/call") {
          sends.push({ conversation: place.key, text: message.params?.arguments?.text });
          return answer({ content: [{ type: "text", text: "Sent." }] });
        }
        return answer({});
      };
    const agents = {
      harness: {
        conversation: async () => conversation,
        systemPrompt: async () =>
          "You are Ada, an agent in a chat app. Use the Buzz send tool to reply.",
        turnPrompt: async () => ({
          text: "Call the Buzz send tool once with the text `pong` and final true.",
          cursor: JSON.stringify({ seen: 1 }),
          restore: () => {},
        }),
        standalonePrompt: (_a: unknown, text: string) => text,
        tools,
        reply: vi.fn(async () => undefined),
      },
      relay: () => undefined,
      tools: () => [],
      storage: { get: () => null, set: async () => {} },
    };
    const items = new Map<string, string>();
    const runtime = new OpenCodeRuntime(
      agents as never,
      {
        spawn,
        resolveDirectory: async (path: string) => path.replace(/^~/, homedir()),
        serveMcp,
      } as never,
      {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
      } as unknown as Storage,
    );
    const until: Promise<unknown>[] = [];
    const workspace = mkdtempSync(join(tmpdir(), "buzz-opencode-live-"));
    try {
      await runtime.run({
        trigger: { type: "mention", event: { id: ROOT, tags: [["h", CHANNEL]] } },
        agent: { key: AGENT, pubkey: AGENT, owner: "b".repeat(64), name: "Ada" },
        config: { ...DEFAULT_CONFIG, model: MODEL, workspace },
        channelId: CHANNEL,
        signal: new AbortController().signal,
        workingUntil: (done: Promise<unknown>) => until.push(done),
      } as never);
      const [settled] = (await Promise.all(until)) as { ok: boolean; error?: string }[];
      expect(settled?.error).toBeUndefined();
      expect(sends).toEqual([
        { conversation: conversation.key, text: expect.stringContaining("pong") },
      ]);
      expect(agents.harness.reply).not.toHaveBeenCalled();
      const [saved] = runtime.conversations(AGENT);
      expect(saved?.sessions).toHaveLength(1);
      const transcript = await runtime.transcript(
        AGENT,
        { channelId: CHANNEL, root: ROOT, sessions: saved?.sessions ?? [] },
        false,
        new AbortController().signal,
      );
      const items = transcript.turns.flatMap((turn) => turn.items);
      expect(items[0]).toMatchObject({ type: "prompt" });
      // A send shows as posted; with OpenCode's Code Mode it runs inside
      // `execute`, which shows as that tool call.
      expect(
        items.some(
          (item) =>
            (item.type === "message" && item.posted && item.text.includes("pong")) ||
            (item.type === "tool" && item.input.includes("send") && item.input.includes("pong")),
        ),
      ).toBe(true);
    } finally {
      runtime.dispose();
    }
  });
});
