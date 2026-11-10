// OpenCode's New agent choices, agent settings and activity: which opencode
// agent it runs as, its model and thinking level, instructions, folder and
// conversation scope, and its conversations' transcripts. Agents, models and
// levels are listed from `opencode acp`; transcripts are opencode's own.
import type { ReactNode } from "react";
import { validWorkspace } from "./acp/shims";
import type { AgentCreateProps, AgentViewProps, Models } from "./buzz";
import type { Modes } from "./models";
import { React } from "./react";
import type { OpenCodeRuntime } from "./runtime";
import { type Config, config as readConfig, DEFAULT_CONFIG } from "./settings";
import { TURN_LIMIT } from "./transcript";
import type { TranscriptItem, TranscriptTurn } from "./transcript-model";
import {
  Button,
  type Choice,
  ChoiceRow,
  Field,
  Instructions,
  layout,
  SectionHeader,
  SettingsGroup,
  TextInput,
} from "./ui";

const SCOPES: readonly Choice[] = [
  { value: "thread", label: "One conversation per thread" },
  { value: "channel", label: "One conversation per channel" },
];
const WORKSPACE_DESCRIPTION =
  "The folder OpenCode works in. Use ~/ for your home folder.";
const WORKSPACE_ERROR = "Enter an absolute or ~/… workspace path.";
const CONVERSATION_LIMIT = 30;

type Read<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; error: string };
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** `read()` as it settles, read again on `retry`. */
function useRead<T>(read: () => Promise<T>, key = "") {
  const [state, setState] = React.useState<Read<T>>({ status: "loading" });
  const [round, setRound] = React.useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` and `key` read again.
  React.useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    read().then(
      (value) => current && setState({ status: "ready", value }),
      (reason: unknown) =>
        current && setState({ status: "error", error: errorText(reason) }),
    );
    return () => {
      current = false;
    };
  }, [round, key]);
  return [state, () => setRound((value) => value + 1)] as const;
}

/** The thinking levels OpenCode lists for the model `model` runs on; it lists
 * them only for its own default model, so another one has none. */
const levelsOf = (model: string, models: Models | undefined) =>
  models?.models.find((item) => item.id === (model || models.current))
    ?.efforts ?? [];

/** A model id's provider, the part before its first `/`. */
const providerOf = (id: string) =>
  id.includes("/") ? id.slice(0, id.indexOf("/")) : "";

const time = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

export function createTabs({
  models,
  modes,
  runtime,
}: Readonly<{
  models: () => Promise<Models>;
  modes: () => Promise<Modes>;
  runtime: Pick<
    OpenCodeRuntime,
    "subscribe" | "sessions" | "conversations" | "channelLabel" | "transcript"
  >;
}>) {
  /** The opencode agent turns run as: opencode's default, or one it lists. */
  function ModeRow({
    value,
    disabled = false,
    onChange,
  }: Readonly<{
    value: string;
    disabled?: boolean;
    onChange(mode: string): void;
  }>) {
    const [listed] = useRead(modes);
    const offered = listed.status === "ready" ? listed.value.modes : [];
    const fallback =
      (listed.status === "ready" &&
        (offered.find((mode) => mode.id === listed.value.current)?.label ||
          listed.value.current)) ||
      "OpenCode default";
    return (
      <ChoiceRow
        title="OpenCode agent"
        value={value}
        valueLabel={value ? undefined : fallback}
        disabled={disabled}
        loading={listed.status === "loading"}
        {...(listed.status === "error"
          ? { description: `Could not list OpenCode's agents: ${listed.error}` }
          : {})}
        choices={[
          { value: "", label: `${fallback} · Default` },
          // A saved agent OpenCode no longer lists, or not yet read.
          ...(value && !offered.some((mode) => mode.id === value)
            ? [
                {
                  value,
                  label:
                    listed.status === "ready" ? `${value} (unavailable)` : value,
                },
              ]
            : []),
          ...offered.map((mode) => ({ value: mode.id, label: mode.label })),
        ]}
        onChange={onChange}
      />
    );
  }

  /** The model and thinking level turns run on. */
  function ModelRows({
    draft,
    listing,
    disabled = false,
    onChange,
  }: Readonly<{
    draft: Config;
    listing: Read<Models>;
    disabled?: boolean;
    onChange(next: Config): void;
  }>) {
    const listed = listing.status === "ready" ? listing.value : undefined;
    const fallback = listed?.models.find((item) => item.id === listed.current);
    const levels = levelsOf(draft.model, listed);
    const resting = draft.model
      ? undefined
      : levels.find((level) => level.id === fallback?.effort)?.label;
    const sorted = [...(listed?.models ?? [])].sort(
      (a, b) =>
        providerOf(a.id).localeCompare(providerOf(b.id)) ||
        a.label.localeCompare(b.label),
    );
    const defaultLabel = fallback
      ? `OpenCode default (${fallback.label})`
      : "OpenCode default";
    return (
      <>
        <ChoiceRow
          title="Model"
          value={draft.model}
          valueLabel={draft.model ? undefined : defaultLabel}
          disabled={disabled}
          loading={listing.status === "loading"}
          {...(listing.status === "error"
            ? { description: `Could not list models: ${listing.error}` }
            : {})}
          choices={[
            { value: "", label: defaultLabel },
            ...(draft.model && !sorted.some((item) => item.id === draft.model)
              ? [
                  {
                    value: draft.model,
                    label: listed
                      ? `${draft.model} (unavailable)`
                      : draft.model,
                  },
                ]
              : []),
            ...sorted.map((item) => ({
              value: item.id,
              label: item.label,
              group: providerOf(item.id) || "Other",
            })),
          ]}
          onChange={(model) =>
            onChange({
              ...draft,
              model,
              // A level the new model doesn't list goes back to OpenCode's.
              effort: levelsOf(model, listed).some(
                (level) => level.id === draft.effort,
              )
                ? draft.effort
                : "",
            })
          }
        />
        <ChoiceRow
          title="Thinking"
          value={draft.effort}
          disabled={disabled}
          choices={[
            { value: "", label: resting ? `${resting} · Default` : "Default" },
            // A saved level the model doesn't list, or not yet read.
            ...(draft.effort &&
            !levels.some((level) => level.id === draft.effort)
              ? [
                  {
                    value: draft.effort,
                    label: listed
                      ? `${draft.effort} (unavailable)`
                      : draft.effort,
                  },
                ]
              : []),
            ...levels.map(({ id, label }) => ({ value: id, label })),
          ]}
          onChange={(effort) => onChange({ ...draft, effort })}
        />
      </>
    );
  }

  /** The opencode agent, workspace and instructions a new agent starts with. */
  function Create({ config, onChange, disabled }: AgentCreateProps<Config>) {
    // Unnormalized, so the workspace can be cleared and retyped; the runtime
    // falls back to the default for a blank or relative path.
    const current: Config = { ...DEFAULT_CONFIG, ...config };
    const workspace = current.workspace.trim();
    const id = React.useId();
    return (
      <>
        <SettingsGroup>
          <ModeRow
            value={current.mode}
            disabled={disabled}
            onChange={(mode) => onChange({ ...current, mode })}
          />
        </SettingsGroup>
        <Field
          id={id}
          label="Workspace"
          description={WORKSPACE_DESCRIPTION}
          error={workspace && !validWorkspace(workspace) ? WORKSPACE_ERROR : undefined}
        >
          <TextInput
            id={id}
            value={current.workspace}
            disabled={disabled}
            invalid={!!workspace && !validWorkspace(workspace)}
            onChange={(value) => onChange({ ...current, workspace: value })}
          />
        </Field>
        <Instructions
          creation
          value={current.instructions}
          disabled={disabled}
          onChange={(instructions) => onChange({ ...current, instructions })}
        />
      </>
    );
  }

  function SettingsTab({
    agent,
    save,
    settingsHost,
    settingsSection,
    settingsContent,
  }: AgentViewProps<Config>) {
    const form = React.useId();
    const workspaceId = React.useId();
    const saved = readConfig(agent.config);
    const [draft, setDraft] = React.useState(saved);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState("");
    const errorRef = React.useRef<HTMLParagraphElement>(null);
    const [listing, retry] = useRead(models);
    React.useEffect(() => {
      if (error) errorRef.current?.focus();
    }, [error]);
    const configChanged = JSON.stringify(draft) !== JSON.stringify(saved);
    const changed = configChanged || Boolean(settingsHost?.pendingSave);
    const submit = async () => {
      setSaving(true);
      setError("");
      try {
        const workspace = draft.workspace.trim() || DEFAULT_CONFIG.workspace;
        if (!validWorkspace(workspace)) throw new Error(WORKSPACE_ERROR);
        await save({ ...draft, workspace });
      } catch (reason) {
        setError(errorText(reason));
      } finally {
        setSaving(false);
      }
    };
    return (
      <form
        id={form}
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error && (
          <p
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="buzz-field-error"
          >
            {error}
          </p>
        )}
        {settingsSection !== "runtime" && (
          <>
            <SettingsGroup>
              {settingsHost?.typeControl?.(configChanged)}
              <ModeRow
                value={draft.mode}
                onChange={(mode) => setDraft({ ...draft, mode })}
              />
              <ModelRows draft={draft} listing={listing} onChange={setDraft} />
            </SettingsGroup>
            {listing.status === "error" && (
              <div>
                <Button onClick={retry}>Try again</Button>
              </div>
            )}
            <Instructions
              value={draft.instructions}
              onChange={(instructions) => setDraft({ ...draft, instructions })}
            />
          </>
        )}
        {settingsSection !== "identity" && (
          <>
            <Field
              id={workspaceId}
              label="Workspace"
              description={WORKSPACE_DESCRIPTION}
            >
              <TextInput
                id={workspaceId}
                value={draft.workspace}
                onChange={(workspace) => setDraft({ ...draft, workspace })}
              />
            </Field>
            <SettingsGroup>
              <ChoiceRow
                title="Conversations"
                value={draft.scope}
                choices={SCOPES}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    scope: value === "channel" ? "channel" : "thread",
                  })
                }
              />
            </SettingsGroup>
          </>
        )}
        <Button
          type="submit"
          variant="prominent"
          disabled={!changed || saving}
          wide
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        {settingsSection !== "identity" && settingsContent}
      </form>
    );
  }

  /** A conversation the agent has opencode sessions in. */
  type Row = Readonly<{
    key: string;
    channelId: string;
    root?: string;
    at: number;
    name?: string;
    channelType?: string;
    /** Its opencode sessions, newest first. */
    sessions: readonly string[];
  }>;
  const place = ({ channelId, name, channelType, root }: Row) =>
    `${name ? `#${name}` : channelType === "dm" ? "DM" : channelId.slice(0, 8)}${root ? ` · thread ${root.slice(0, 8)}` : ""}`;

  /** The agent's conversations: saved ones, and a running first session,
   * which is saved only once its first turn ends. */
  function useRows(agentKey: string) {
    const live = React.useSyncExternalStore(
      (listener) => runtime.subscribe(listener),
      () => runtime.sessions(agentKey),
      () => runtime.sessions(agentKey),
    );
    // biome-ignore lint/correctness/useExhaustiveDependencies: a session change can save one.
    const saved = React.useMemo(
      () => runtime.conversations(agentKey),
      [agentKey, live],
    );
    const label = (channelId: string) => {
      const found = runtime.channelLabel(agentKey, channelId);
      return {
        ...(found?.name ? { name: found.name } : {}),
        ...(found?.channelType ? { channelType: found.channelType } : {}),
      };
    };
    const rows: Row[] = saved.map(({ key, at, sessions }) => {
      const [channelId = key, root] = key.split("/");
      const running = live.find((session) => session.key === key)?.sessionId;
      return {
        key,
        channelId,
        ...(root ? { root } : {}),
        at,
        sessions: running
          ? [running, ...sessions.filter((id) => id !== running)]
          : sessions,
        ...label(channelId),
      };
    });
    for (const session of live)
      if (session.sessionId && !rows.some((row) => row.key === session.key)) {
        const [channelId = session.key, root] = session.key.split("/");
        rows.unshift({
          key: session.key,
          channelId,
          ...(root ? { root } : {}),
          at: session.at ?? Date.now(),
          sessions: [session.sessionId],
          ...label(channelId),
        });
      }
    const busy = (row: Row) =>
      live.some((session) => session.key === row.key && session.busy);
    return { rows, busy };
  }

  /** The conversation the profile was opened from, and the agent's other
   * recent ones, each with its transcript from opencode's storage. */
  function ActivityTab({
    agent,
    conversation,
    initialTranscript,
  }: AgentViewProps<Config>) {
    const { rows, busy } = useRows(agent.key);
    const scope = readConfig(agent.config).scope;
    // The opened conversation's session: its thread's, else its channel's.
    const here =
      conversation &&
      ((conversation.rootId &&
        rows.find(
          (row) =>
            row.channelId === conversation.channelId &&
            row.root === conversation.rootId,
        )) ||
        rows.find(
          (row) => row.channelId === conversation.channelId && !row.root,
        ));
    const [open, setOpen] = React.useState<string>();
    // Asked to show the opened conversation's transcript: shown at once when
    // its session is known, as OpenCode's are saved here.
    const opening = initialTranscript?.opening;
    // biome-ignore lint/correctness/useExhaustiveDependencies: once per opening.
    React.useEffect(() => {
      if (opening === undefined) return;
      if (here) setOpen(here.key);
      initialTranscript?.done();
    }, [opening]);
    const shown = open && rows.find((row) => row.key === open);
    if (shown)
      return (
        <TranscriptView
          agentKey={agent.key}
          row={shown}
          title={place(shown)}
          working={busy(shown)}
          back={() => setOpen(undefined)}
        />
      );
    const recent = rows
      .filter((row) => row.key !== here?.key)
      .slice(0, CONVERSATION_LIMIT);
    const status = (row: Row) => (busy(row) ? "Working" : undefined);
    const hereTitle = !conversation
      ? ""
      : conversation.rootId && scope === "thread"
        ? "This thread"
        : "This channel";
    const entry = (row: Row, index: number, all: readonly Row[]) => (
      <li key={row.key} style={layout.entry(index === 0, index === all.length - 1)}>
        <div style={layout.row}>
          <span style={layout.copy}>
            <span className="block truncate text-label-sm" title={place(row)}>
              {place(row)}
            </span>
            <span className="block text-body-sm text-subtle">
              {[
                row.root ? "Thread" : "Channel",
                status(row),
                time(row.at),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <Button
            variant="subtle"
            size="sm"
            label={`View transcript: ${place(row)}`}
            onClick={() => setOpen(row.key)}
          >
            View transcript
          </Button>
        </div>
      </li>
    );
    return (
      <div style={layout.activity}>
        {conversation && (
          <section aria-label={hereTitle} style={layout.section}>
            <SectionHeader title={hereTitle} />
            {here ? (
              <SettingsGroup layout="form">
                <ul style={layout.list}>{entry(here, 0, [here])}</ul>
              </SettingsGroup>
            ) : (
              <p className="m-0 text-body-sm text-subtle">
                No OpenCode session here yet.
              </p>
            )}
          </section>
        )}
        <section aria-label="Recent conversations" style={layout.section}>
          <SectionHeader title="Recent conversations" />
          {recent.length ? (
            <SettingsGroup layout="form">
              <ul style={layout.list}>{recent.map(entry)}</ul>
            </SettingsGroup>
          ) : (
            <p className="m-0 text-body-sm text-subtle">
              None. A conversation starts when the agent is mentioned.
            </p>
          )}
        </section>
      </div>
    );
  }

  /** One conversation's latest turns, from opencode's storage. */
  function TranscriptView({
    agentKey,
    row,
    title,
    working,
    back,
  }: {
    agentKey: string;
    row: Row;
    title: string;
    working: boolean;
    back(): void;
  }) {
    const [read, refresh] = useRead(
      () => {
        const abort = new AbortController();
        return runtime.transcript(agentKey, row, working, abort.signal);
      },
      `${agentKey}\u0000${row.key}\u0000${row.sessions.join()}`,
    );
    // Keeps the last transcript while a refresh reads, or fails.
    const [kept, setKept] = React.useState<
      Awaited<ReturnType<typeof runtime.transcript>>
    >();
    React.useEffect(() => {
      if (read.status === "ready") setKept(read.value);
    }, [read]);
    // Reads again when a running turn ends.
    const wasWorking = React.useRef(working);
    React.useEffect(() => {
      if (wasWorking.current && !working) refresh();
      wasWorking.current = working;
    });
    return (
      <div style={{ ...layout.activity, gap: "var(--space-4)" }}>
        <div style={layout.row}>
          <Button variant="subtle" size="sm" onClick={back}>
            ← Back to profile
          </Button>
          <span style={layout.copy} className="truncate text-label-md">
            {title}
          </span>
          <Button size="sm" label="Refresh transcript" onClick={refresh}>
            Refresh
          </Button>
        </div>
        {read.status === "error" && (
          <p role="alert" className="buzz-field-error m-0">
            Could not read the OpenCode session: {read.error}
          </p>
        )}
        {read.status === "loading" && !kept && (
          <p role="status" className="m-0 text-body-sm text-subtle">
            Reading the OpenCode session…
          </p>
        )}
        {kept?.more && (
          <p className="m-0 text-body-sm text-subtle">
            Showing the latest {TURN_LIMIT} turns.
          </p>
        )}
        {kept && !kept.turns.length && (
          <p className="m-0 text-body-sm text-subtle">Nothing yet.</p>
        )}
        {kept?.turns.map((turn) => (
          <Turn key={turn.turnId} turn={turn} />
        ))}
      </div>
    );
  }

  return { ActivityTab, Create, SettingsTab };
}

const block = {
  margin: 0,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
} as const;
const code = {
  ...block,
  maxHeight: "24rem",
  overflow: "auto",
  padding: "var(--space-2) var(--space-3)",
  borderRadius: "var(--radius-control)",
  background: "var(--surface-inset)",
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  fontSize: "0.8125rem",
} as const;

function Disclosure({
  summary,
  children,
  open,
}: {
  summary: ReactNode;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} style={{ minWidth: 0 }}>
      <summary
        className="text-body-sm"
        style={{ cursor: "pointer", color: "var(--text-subtle)" }}
      >
        {summary}
      </summary>
      <div style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
        {children}
      </div>
    </details>
  );
}

const STATUS: Record<string, string> = {
  completed: "Done",
  failed: "Failed",
  in_progress: "Running",
  terminated: "Stopped",
};

function Item({ item }: { item: TranscriptItem }) {
  switch (item.type) {
    case "system":
      return (
        <Disclosure summary="System prompt">
          <pre style={code}>{item.sections.map((part) => part.body).join("\n\n")}</pre>
        </Disclosure>
      );
    case "prompt":
      return (
        <div style={{ display: "grid", gap: "var(--space-1)" }}>
          <span className="text-label-sm">
            {item.steer ? "New message while working" : "Prompt"}
            {item.author ? ` · ${item.author}` : ""}
          </span>
          <p className="text-body" style={block}>
            {item.text}
          </p>
          {item.sections.length > 1 && (
            <Disclosure summary="Full prompt">
              {item.sections.map((part, index) => (
                <div key={`${part.tag}:${index}`} style={{ display: "grid", gap: "var(--space-1)" }}>
                  <span className="text-body-sm text-subtle">{part.tag}</span>
                  <pre style={code}>{part.body}</pre>
                </div>
              ))}
            </Disclosure>
          )}
        </div>
      );
    case "thought":
      return (
        <Disclosure summary="Thinking">
          <p className="text-body-sm text-subtle" style={block}>
            {item.text}
          </p>
        </Disclosure>
      );
    case "message":
      return (
        <div style={{ display: "grid", gap: "var(--space-1)" }}>
          <span className="text-label-sm">
            {item.posted ? "Posted to Buzz" : "Reply"}
          </span>
          <p className="text-body" style={block}>
            {item.text}
          </p>
        </div>
      );
    case "tool":
      return (
        <Disclosure
          summary={
            <>
              <span style={{ color: "var(--text-standard)" }}>{item.title}</span>
              {` · ${STATUS[item.status] ?? item.status}`}
            </>
          }
        >
          <span className="text-body-sm text-subtle">Input</span>
          <pre style={code}>{item.input}</pre>
          {item.output && (
            <>
              <span className="text-body-sm text-subtle">Output</span>
              <pre style={code}>{item.output}</pre>
            </>
          )}
        </Disclosure>
      );
    case "status":
      return (
        <p className="text-body-sm text-subtle" style={{ ...block, fontStyle: "italic" }}>
          {item.text}
        </p>
      );
  }
}

function Turn({ turn }: { turn: TranscriptTurn }) {
  const ended = turn.error
    ? "Failed"
    : turn.stopReason
      ? "Stopped"
      : turn.endedAt === undefined
        ? "Working"
        : undefined;
  return (
    <SettingsGroup layout="form">
      <div style={{ display: "grid", gap: "var(--space-3)", minWidth: 0 }}>
        <span className="text-body-sm text-subtle">
          {[
            turn.newSession ? "New session" : undefined,
            time(turn.startedAt),
            ...turn.config,
            ended,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {turn.items.map((item) => (
          <Item key={item.id} item={item} />
        ))}
        {turn.error && (
          <p role="note" className="buzz-field-error m-0">
            {turn.error}
          </p>
        )}
      </div>
    </SettingsGroup>
  );
}
