// Turns Agents deliveries into opencode turns. Every agent of this type shares
// one `opencode acp` process; a delivery becomes a prompt for the agent's ACP
// session for its conversation, and a watch's or timer's wake a one-off turn
// in a session of its own. The run returns once the turn is handed over, so
// one agent works in several conversations at once.
// Buzz's side of each turn comes from the plugin API's harness kit
// (`ctx.agents.harness`): which conversation a delivery goes to, the prompts,
// the Buzz tools over MCP and replies. This file is the bundled OpenCode
// runtime proposed in block/buzz-app#2432 (Apache-2.0), rebuilt on that kit.
import { AgentSessions } from "./acp/agent-sessions";
import type { AcpProcess } from "./acp/process";
import { SessionControls } from "./acp/session-control";
import { steerPrompt } from "./acp/shims";
import type { ServeMcp, Spawn, ToolServer } from "./acp/types";
import type {
  Agent,
  AgentHandle,
  Agents,
  AgentStore,
  Delivery,
  HarnessConversation,
  Host,
  McpHandler,
  SessionControlAction,
  SessionPlace,
  SessionState,
  StandaloneTurn,
  TurnResult,
} from "./buzz";
import { OpenCodeProcess } from "./opencode";
import { type Config, config } from "./settings";
import { localSessions } from "./sessions";
import { type Conversation, readTranscript } from "./transcript";
import type { TranscriptTurn } from "./transcript-model";

export const SESSIONS_KEY = "opencode-harness.sessions.v1";
const PROMPTS_KEY = "opencode-harness.prompts.v1:";
/** Each agent's saved system prompts stay under this many characters. */
const PROMPTS_BUDGET = 600_000;
const TITLE_LIMIT = 80;

type HarnessPrompt = Awaited<
  ReturnType<Agents["harness"]["turnPrompt"]>
>;

/** A session's title in opencode, as harness agents name theirs:
 * `Agent · #channel`, and the thread's root when each thread is a session. */
export function sessionTitle(
  agent: string | undefined,
  place: string,
  root?: string,
) {
  const suffix = root ? ` · ${root.slice(0, 8)}` : "";
  const title = `${agent?.trim() || "Buzz agent"} · ${place}`
    .replace(/\s+/g, " ")
    .slice(0, TITLE_LIMIT - suffix.length)
    .trim();
  return `${title}${suffix}`;
}

/** The thread an event belongs to, or the event itself as its root. */
function threadRoot(event: { id: string; tags: readonly (readonly string[])[] }) {
  let root: string | undefined;
  let reply: string | undefined;
  for (const [name, value, , marker] of event.tags) {
    if (name !== "e" || !value || !/^[0-9a-f]{64}$/i.test(value)) continue;
    if (marker === "root") root = value.toLowerCase();
    if (marker === "reply") reply = value.toLowerCase();
  }
  return (reply && (root ?? reply)) || event.id;
}

/** The one `opencode acp` every OpenCode agent's sessions open in, started in
 * the home folder when a session first needs it, and again after it exits. */
class SharedProcess {
  private ready: Promise<AcpProcess> | undefined;
  constructor(
    private readonly spawn: Spawn,
    private readonly resolveDirectory: (path: string) => Promise<string>,
    private readonly serve: ServeMcp,
  ) {}
  get(): Promise<AcpProcess> {
    if (this.ready) return this.ready;
    const ready = (async () =>
      OpenCodeProcess.start(this.spawn, {
        cwd: await this.resolveDirectory("~"),
        serve: this.serve,
      }))();
    const forget = () => {
      if (this.ready === ready) this.ready = undefined;
    };
    void ready.then((process) => process.exited.then(forget), forget);
    this.ready = ready;
    return ready;
  }
  stop() {
    const ready = this.ready;
    this.ready = undefined;
    void ready?.then((process) => process.kill()).catch(() => undefined);
  }
}

type Entry = {
  sessions: AgentSessions;
  config: Config;
  /** The team sections of the latest run; a change reopens idle sessions. */
  team: string;
  /** The agent's name, for its prompt; a rename reopens idle sessions. */
  name?: string;
  /** The latest delivery, which a new session's system prompt is built for. */
  delivery?: Delivery;
  /** Each conversation's Buzz tools, acting where its latest turn is. */
  tools: Map<string, McpHandler>;
  /** The Buzz tools of a one-off turn, which acts in no conversation. */
  standalone?: McpHandler;
  policies: Map<
    string,
    {
      topLevel: boolean;
      handed: Promise<unknown>;
      settled: Promise<unknown>;
      cancel(): void;
    }
  >;
};

export class OpenCodeRuntime {
  private readonly agents = new Map<string, Entry>();
  private readonly opencode: SharedProcess;
  private readonly listeners = new Set<() => void>();
  private readonly views = new Map<
    string,
    ReturnType<AgentSessions["snapshot"]>
  >();
  private readonly controls = new SessionControls(() => this.notify());

  constructor(
    private readonly buzz: Agents,
    private readonly host: Host,
    private readonly storage: Storage = globalThis.localStorage,
  ) {
    this.opencode = new SharedProcess(
      (id, options) => this.desktop.spawn(id, options),
      (path) => this.desktop.resolveDirectory(path),
      (handler, options) => this.desktop.serveMcp(handler, options),
    );
  }

  private get kit() {
    return this.buzz.harness;
  }
  private get store(): AgentStore {
    return this.buzz.storage;
  }
  /** The desktop host's methods opencode agents run with. */
  private get desktop() {
    const { host } = this;
    if (!host.spawn || !host.resolveDirectory || !host.serveMcp)
      throw new Error("opencode agents run only in the desktop app");
    return {
      spawn: host.spawn.bind(host) as Spawn,
      resolveDirectory: host.resolveDirectory.bind(host),
      serveMcp: host.serveMcp.bind(host) as ServeMcp,
      readFile: host.readFile?.bind(host),
    };
  }

  /** Brings the runtime in line with this type's agents: changed settings
   * reopen idle sessions, and removed agents stop. opencode stops with the
   * last. */
  sync(agents: readonly Agent[]) {
    const current = new Set(agents.map((agent) => agent.key));
    for (const [key, entry] of this.agents)
      if (!current.has(key)) {
        entry.sessions.dispose();
        this.agents.delete(key);
      }
    if (!this.agents.size) this.opencode.stop();
    for (const agent of agents) {
      const next = config(agent.config);
      const entry = this.agents.get(agent.key);
      if (!entry) this.entry(agent.key, next).name = agent.name;
      else if (
        JSON.stringify(entry.config) !== JSON.stringify(next) ||
        entry.name !== agent.name
      ) {
        entry.config = next;
        entry.name = agent.name;
        entry.sessions.reconfigure();
      }
    }
    this.notify();
  }

  /** Conversations each agent has a session for, for its status view. */
  sessions(agent: string) {
    let view = this.views.get(agent);
    if (!view) {
      view = this.agents.get(agent)?.sessions.snapshot() ?? [];
      this.views.set(agent, view);
    }
    return view;
  }
  /** The agent's saved conversations, most recently used first. Removing an
   * agent keeps them. */
  conversations(agent: string) {
    return localSessions(this.storage, agent, SESSIONS_KEY)
      .list()
      .map(([key, { at, sessions = [] }]) => ({ key, at, sessions }));
  }
  private ready(agent: string) {
    const snapshot = this.buzz.relay(agent as never)?.snapshot();
    return snapshot?.status === "ready" ? snapshot.session : undefined;
  }
  /** The community's current name and kind for a channel, if it lists it. */
  channelLabel(agent: string, channelId: string) {
    const summary = this.ready(agent)
      ?.channels.list()
      .channels.find((item) => item.id === channelId);
    return (
      summary && {
        ...(summary.name ? { name: summary.name } : {}),
        ...(summary.private ? { private: summary.private } : {}),
        channelType: summary.channelType,
      }
    );
  }
  /** A person's display name in the agent's community, if known. */
  name(agent: string, pubkey: string) {
    const session = this.ready(agent);
    return (
      session?.names.resolve(pubkey, undefined, undefined) ??
      session?.profiles.snapshot().get(pubkey)?.name ??
      undefined
    );
  }
  /** A conversation's latest turns, read from opencode's own storage, each
   * session's saved system prompt at its top. */
  async transcript(
    agent: string,
    conversation: Conversation & { sessions: readonly string[] },
    working: boolean,
    signal: AbortSignal,
  ) {
    const transcript = await readTranscript(
      this.desktop.spawn,
      conversation.sessions,
      conversation,
      working,
      signal,
      (pubkey) => this.name(agent, pubkey),
    );
    return { ...transcript, turns: this.shown(agent, transcript.turns) };
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private notify() {
    this.views.clear();
    for (const listener of this.listeners) listener();
  }

  private controlKey(agent: Agent, place: SessionPlace) {
    return config(agent.config).scope === "channel" || !place.root
      ? place.channelId
      : `${place.channelId}/${place.root}`;
  }
  sessionState(agent: Agent, place: SessionPlace): SessionState {
    const key = this.controlKey(agent, place);
    if (this.controls.compacting(`${agent.key}/${key}`)) return "compacting";
    return this.controls.active(`${agent.key}/${key}`) ||
      this.agents.get(agent.key)?.policies.has(key) ||
      this.agents.get(agent.key)?.sessions.active(key)
      ? "active"
      : "idle";
  }
  async session(
    agent: Agent,
    place: SessionPlace,
    action: SessionControlAction,
  ) {
    const key = this.controlKey(agent, place);
    const control = `${agent.key}/${key}`;
    const entry = this.entry(agent.key, config(agent.config));
    if (action === "interrupt") {
      this.controls.interrupt(control);
      entry.policies.get(key)?.cancel();
      await entry.sessions.interrupt(key);
      return;
    }
    if (this.sessionState(agent, place) !== "idle")
      throw new Error("Wait for the active turn to finish first.");
    return this.controls.run(control, action, async (signal) => {
      signal.throwIfAborted();
      const result = await entry.sessions.reset(key, action);
      signal.throwIfAborted();
      if (!result.ok) throw new Error(result.error);
    });
  }

  dispose() {
    for (const entry of this.agents.values()) entry.sessions.dispose();
    this.agents.clear();
    this.opencode.stop();
  }

  async run(delivery: Delivery) {
    const {
      trigger,
      agent,
      config: raw,
      team,
      model,
      effort,
      synced,
      workingUntil,
      current,
      ignored,
      signal,
      step,
      acknowledged,
      superseded,
      interruptible,
    } = delivery;
    const settings = config(raw);
    const entry = this.entry(agent.key, settings);
    entry.team = team ?? "";
    entry.delivery = delivery;
    // The kit admits only the owner's own mentions, or ones they attested,
    // and wakes with a conversation to go to: opencode runs commands as you.
    const conversation = await this.kit.conversation(delivery, settings.scope);
    if (!conversation) return ignored?.();
    signal.throwIfAborted();
    const { key, topLevel } = conversation;
    const wake = trigger.type !== "mention";
    const activityScope = topLevel
      ? conversation.channel
      : (conversation.root ??
        (trigger.type === "mention"
          ? threadRoot(trigger.event)
          : conversation.channel));
    // The prompt most recently built for this turn. Building one takes the
    // notes plugins left; building again first puts the last one's back.
    let latest: HarnessPrompt | undefined;
    const build = async (fresh: boolean) => {
      latest?.restore();
      latest = undefined;
      const seen = fresh ? undefined : entry.sessions.seen(key);
      latest = await this.kit.turnPrompt(
        delivery,
        conversation,
        seen === undefined ? {} : { cursor: seen },
      );
      return latest;
    };
    const prepared = await build(false);
    signal.throwIfAborted();
    const handoff = this.controls.deliver(
      `${agent.key}/${key}`,
      async (deferred) => {
        // Accepted deferred work belongs to the captured agent lifetime, not
        // the short deadline for handing a message to the harness.
        if (this.agents.get(agent.key) !== entry) {
          latest?.restore();
          return;
        }
        if (!deferred) signal.throwIfAborted();
        const prior = entry.policies.get(key);
        const same = prior?.topLevel === topLevel;
        const wait = prior && (same ? prior.handed : prior.settled);
        let delivered!: ReturnType<AgentSessions["deliver"]>;
        let interrupted = false;
        const handed = (async () => {
          await wait;
          if (interrupted || this.agents.get(agent.key) !== entry) {
            delivered = Promise.resolve({ ok: true, undelivered: true });
            return;
          }
          // After waiting, the session may have been shown more meanwhile.
          const prompt = wait ? await build(false) : prepared;
          if (interrupted || this.agents.get(agent.key) !== entry) {
            delivered = Promise.resolve({ ok: true, undelivered: true });
            return;
          }
          entry.tools.set(
            key,
            this.kit.tools(agent, conversation, { read: this.reader(entry) }),
          );
          delivered = entry.sessions.deliver(key, prompt.text, prompt.cursor, {
            ...(wake
              ? {
                  current,
                  refresh: async (fresh = false) => (await build(fresh)).text,
                }
              : {}),
            steer: steerPrompt(prompt.text),
            fresh: async () => (await build(true)).text,
            title: sessionTitle(entry.name, conversation.where, conversation.root),
            ...(!deferred && !wait ? { signal } : {}),
            ...(model ? { model } : {}),
            ...(effort ? { effort } : {}),
            // A pick runs on its own level; a synced one is checked.
            ...(synced?.effort && !model && !effort
              ? { kept: synced.effort }
              : {}),
            activityScope,
            ...(step ? { step } : {}),
            ...(acknowledged ? { acknowledged } : {}),
            ...(superseded ? { superseded } : {}),
          });
        })();
        const done = handed.then(() => delivered);
        const policy = {
          topLevel,
          handed,
          settled: Promise.all([same ? prior?.settled : undefined, done]).then(
            () => entry.sessions.idle(key),
          ),
          cancel() {
            interrupted = true;
            prior?.cancel();
          },
        };
        entry.policies.set(key, policy);
        void policy.settled.then(() => {
          if (entry.policies.get(key) !== policy) return;
          entry.policies.delete(key);
          this.notify();
        });
        if (!wait) await handed;
        workingUntil(done);
        interruptible?.(() => {
          policy.cancel();
          return entry.sessions.interrupt(key);
        });
        this.notify();
        void done
          .then((result) => {
            if (result.undelivered) latest?.restore();
            // Of the messages one turn answered, only one has its error. An
            // answer opencode wrote without `send` stays in its own history.
            if (result.error !== undefined)
              return this.report(agent, conversation, result.error);
          })
          .catch((error) => console.warn("opencode turn failed", error))
          .finally(() => this.notify());
      },
    );
    if (!handoff.deferred) return handoff.done;
    workingUntil(handoff.done);
    void handoff.done
      .catch((error) => this.report(agent, conversation, String(error)))
      .catch((error) => console.warn("opencode handover failed", error));
  }

  /** Runs a standalone turn, such as a watch's or a timer's, in a one-off
   * session that joins no conversation. */
  async runOnce({
    delivery,
    key,
    signal,
    prompt,
  }: StandaloneTurn): Promise<TurnResult> {
    const { agent, team } = delivery;
    const entry = this.entry(agent.key, config(delivery.config));
    entry.team = team ?? "";
    entry.delivery = delivery;
    entry.standalone = this.kit.tools(agent, undefined, {
      read: this.reader(entry),
    });
    const done = entry.sessions.runOnce(
      key,
      async () => {
        const text = await prompt();
        return text === undefined
          ? undefined
          : this.kit.standalonePrompt(agent, text);
      },
      {
        signal,
        title: sessionTitle(entry.name, key),
        current: delivery.current,
        ...(delivery.synced?.effort ? { kept: delivery.synced.effort } : {}),
      },
    );
    this.notify();
    return done.finally(() => this.notify());
  }

  /** Reads a file an upload names, from the agent's workspace. */
  private reader(entry: Entry) {
    const read = this.desktop.readFile;
    return read
      ? (path: string) => read(path, { cwd: entry.config.workspace })
      : undefined;
  }

  /** Says in the conversation that a turn failed, so nobody waits on it. */
  private report(
    agent: AgentHandle,
    conversation: HarnessConversation,
    error: string,
  ) {
    return this.kit
      .reply(agent, conversation, `⚠️ I couldn't finish that: ${error.slice(0, 500)}`, {
        notifyOwner: true,
      })
      .catch((failure) => console.warn("opencode could not post", failure));
  }

  private entry(agent: string, initial: Config): Entry {
    const existing = this.agents.get(agent);
    if (existing) return existing;
    const entry: Entry = {
      config: initial,
      team: "",
      sessions: undefined as unknown as AgentSessions,
      tools: new Map(),
      policies: new Map(),
    };
    // Every session of the agent shares it, so it reads the conversation's
    // tools as they are when called. A message without a conversation, such
    // as opencode listing the tools, or a one-off turn's call, is answered
    // acting in none.
    const tools: ToolServer = async (conversation, message) => {
      const agentHandle = entry.delivery?.agent;
      const handler =
        (conversation && entry.tools.get(conversation)) ||
        entry.standalone ||
        (agentHandle &&
          this.kit.tools(agentHandle, undefined, { read: this.reader(entry) }));
      if (!handler)
        return {
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32603, message: "No Buzz turn is running here" },
        };
      return handler(message as Parameters<McpHandler>[0]);
    };
    entry.sessions = new AgentSessions({
      label: "opencode",
      resolveDirectory: (path) => this.desktop.resolveDirectory(path),
      tools,
      process: this.opencode,
      store: localSessions(this.storage, agent, SESSIONS_KEY),
      started: (session, text) => void this.savePrompt(agent, session, text),
      onChange: () => this.notify(),
      // Read as each turn starts, so a change needs no restart.
      choice: () => ({
        provider: "",
        model: entry.config.model.trim(),
        effort: entry.config.effort,
        mode: entry.config.mode,
      }),
      fingerprint: () =>
        JSON.stringify([
          entry.config.workspace,
          entry.config.instructions,
          entry.config.scope,
          entry.team,
          entry.name,
          this.buzz
            .tools()
            .map((tool) => tool.name)
            .join(),
        ]),
      launch: async () => {
        const { workspace, instructions, scope } = entry.config;
        const delivery = entry.delivery;
        if (!delivery) throw new Error("opencode has no turn to start");
        return {
          workspace,
          systemPrompt: await this.kit.systemPrompt(delivery, {
            scope,
            cwd: workspace,
            instructions,
          }),
        };
      },
    });
    this.agents.set(agent, entry);
    return entry;
  }

  /** The system prompts the agent's sessions started with, by session. */
  private prompts(agent: string): Record<string, string> {
    try {
      const value = JSON.parse(this.store.get(PROMPTS_KEY + agent) ?? "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }
  /** Keeps a session's system prompt for its transcript; the oldest go first
   * to stay in budget. A failed save is logged, never thrown. */
  private async savePrompt(agent: string, session: string, text: string) {
    try {
      const all = this.prompts(agent);
      if (all[session]) return;
      const entries = [...Object.entries(all), [session, text] as const];
      while (
        entries.length > 1 &&
        JSON.stringify(Object.fromEntries(entries)).length > PROMPTS_BUDGET
      )
        entries.shift();
      await this.store.set(
        PROMPTS_KEY + agent,
        JSON.stringify(Object.fromEntries(entries)),
      );
    } catch (error) {
      console.error("A session's prompt was not saved", error);
    }
  }
  /** `turns` with each session's saved system prompt at its first turn. */
  private shown(agent: string, turns: readonly TranscriptTurn[]) {
    const prompts = this.prompts(agent);
    const seen = new Set<string>();
    return turns.map((turn): TranscriptTurn => {
      const session = turn.sessionId;
      if (!session || seen.has(session)) return turn;
      seen.add(session);
      const text = prompts[session];
      return text
        ? {
            ...turn,
            items: [
              {
                id: `${session}:system-prompt`,
                at: turn.startedAt,
                type: "system",
                sections: [{ tag: "text", body: text }],
              },
              ...turn.items,
            ],
          }
        : turn;
    });
  }
}
