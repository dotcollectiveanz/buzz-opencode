/// <reference types="node" />
import { expect, it, vi } from "vitest";
import type { HostProcessOptions } from "./acp/host";
import { OpenCodeRuntime, sessionTitle } from "./runtime";
import { DEFAULT_CONFIG } from "./settings";

const AGENT = "a".repeat(64);
const CHANNEL = "c".repeat(36);
const ROOT = "e".repeat(64);

/** A stand-in for `opencode acp`: answers prompts with `answer`. */
function fakeOpencode(answer: () => Record<string, unknown>) {
  const received: { method: string; params: Record<string, unknown> }[] = [];
  let sessions = 0;
  const spawn = vi.fn(async (_id: string, options: HostProcessOptions = {}) => ({
    write: async (data: string) => {
      const { id, method, params } = JSON.parse(data);
      received.push({ method, params });
      if (id === undefined) return;
      const result =
        method === "initialize"
          ? { agentCapabilities: { mcpCapabilities: { http: true } } }
          : method === "session/new"
            ? { sessionId: `ses_${++sessions}`, configOptions: [] }
            : method === "session/prompt"
              ? answer()
              : {};
      setTimeout(() =>
        options.onStdout?.(
          `${JSON.stringify({ jsonrpc: "2.0", id, ...("error" in result ? result : { result }) })}\n`,
        ),
      );
    },
    end: async () => undefined,
    kill: async () => undefined,
    exited: new Promise<number | null>(() => undefined),
  }));
  return { spawn, received };
}

function fakeBuzz(admit = true) {
  const store = new Map<string, string>();
  const conversation = Object.freeze({
    key: `${CHANNEL}/${ROOT}`,
    channel: CHANNEL,
    root: ROOT,
    topLevel: false,
    where: "#general",
  });
  const harness = {
    conversation: vi.fn(async () => (admit ? conversation : undefined)),
    systemPrompt: vi.fn(async () => "SYSTEM PROMPT"),
    turnPrompt: vi.fn(async (_d: unknown, _c: unknown, options: { cursor?: string } = {}) => ({
      text: `TURN after ${options.cursor ?? "nothing"}`,
      cursor: JSON.stringify({ seen: 100 }),
      restore: vi.fn(),
    })),
    standalonePrompt: (_a: unknown, text: string) => text,
    tools: vi.fn(() => async () => ({})),
    reply: vi.fn(async () => undefined),
  };
  const agents = {
    harness,
    relay: () => undefined,
    tools: () => [],
    storage: {
      keys: () => [...store.keys()],
      get: (key: string) => store.get(key) ?? null,
      set: async (key: string, value: string | null) => {
        if (value === null) store.delete(key);
        else store.set(key, value);
      },
    },
  };
  return { agents, harness, conversation, store };
}

function delivery() {
  const until: Promise<unknown>[] = [];
  return {
    until,
    value: {
      trigger: { type: "mention", event: { id: ROOT, tags: [["h", CHANNEL]] } },
      agent: { key: AGENT, pubkey: AGENT, owner: "b".repeat(64), name: "Ada" },
      config: DEFAULT_CONFIG,
      channelId: CHANNEL,
      signal: new AbortController().signal,
      workingUntil: (done: Promise<unknown>) => until.push(done),
      ignored: vi.fn(),
    },
  };
}

const memory = () => {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  } as unknown as Storage;
};

function runtime(buzz: ReturnType<typeof fakeBuzz>, spawn: unknown) {
  return new OpenCodeRuntime(
    buzz.agents as never,
    {
      spawn,
      resolveDirectory: async (path: string) => path.replace(/^~/, "/home"),
      serveMcp: async () => ({
        url: "http://127.0.0.1:1/mcp",
        headers: [],
        close: async () => undefined,
        closed: new Promise(() => undefined),
      }),
    } as never,
    memory(),
  );
}

it("runs a mention as a turn with the kit's prompts, in the conversation's session", async () => {
  const buzz = fakeBuzz();
  const opencode = fakeOpencode(() => ({ stopReason: "end_turn" }));
  const oc = runtime(buzz, opencode.spawn);
  const { value, until } = delivery();
  await oc.run(value as never);
  await Promise.all(until);

  expect(buzz.harness.conversation).toHaveBeenCalledWith(value, "thread");
  expect(buzz.harness.systemPrompt).toHaveBeenCalledWith(value, {
    scope: "thread",
    cwd: "~/.buzz",
    instructions: "",
  });
  expect(buzz.harness.tools).toHaveBeenCalledWith(
    value.agent,
    buzz.conversation,
    expect.anything(),
  );
  const opened = opencode.received.find((m) => m.method === "session/new");
  expect(opened?.params.cwd).toBe("/home/.buzz");
  const prompt = opencode.received.find((m) => m.method === "session/prompt");
  expect(JSON.stringify(prompt?.params)).toContain("TURN after nothing");
  expect(oc.conversations(AGENT)).toEqual([
    { key: `${CHANNEL}/${ROOT}`, at: expect.any(Number), sessions: ["ses_1"] },
  ]);
  expect(buzz.harness.reply).not.toHaveBeenCalled();

  // The next turn in the conversation reuses the session, from its cursor.
  const next = delivery();
  await oc.run(next.value as never);
  await Promise.all(next.until);
  expect(
    opencode.received.filter((m) => m.method === "session/new"),
  ).toHaveLength(1);
  expect(buzz.harness.turnPrompt).toHaveBeenLastCalledWith(
    next.value,
    buzz.conversation,
    { cursor: JSON.stringify({ seen: 100 }) },
  );
  oc.dispose();
});

it("ignores what the kit does not admit", async () => {
  const buzz = fakeBuzz(false);
  const opencode = fakeOpencode(() => ({ stopReason: "end_turn" }));
  const oc = runtime(buzz, opencode.spawn);
  const { value } = delivery();
  await oc.run(value as never);
  expect(value.ignored).toHaveBeenCalled();
  expect(opencode.spawn).not.toHaveBeenCalled();
  oc.dispose();
});

it("says in the conversation when a turn fails, tagging the owner", async () => {
  const buzz = fakeBuzz();
  const opencode = fakeOpencode(() => ({
    error: { code: -32603, message: "Rate limited" },
  }));
  const oc = runtime(buzz, opencode.spawn);
  const { value, until } = delivery();
  await oc.run(value as never);
  await Promise.all(until);
  await vi.waitFor(() =>
    expect(buzz.harness.reply).toHaveBeenCalledWith(
      value.agent,
      buzz.conversation,
      expect.stringContaining("Rate limited"),
      { notifyOwner: true },
    ),
  );
  oc.dispose();
});

it("names sessions after the agent and where they are", () => {
  expect(sessionTitle("Ada", "#general", ROOT)).toBe(
    `Ada · #general · ${ROOT.slice(0, 8)}`,
  );
  expect(sessionTitle(undefined, "DM")).toBe("Buzz agent · DM");
});
