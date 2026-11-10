// Each agent's conversations and the opencode sessions they used, saved in
// local storage. From block/buzz-app (Apache-2.0): src/bundled/goose/sessions.ts.
import {
  type SavedConversation,
  type SessionStore,
  savedConversation,
} from "./acp/agent-sessions";

/** Saved conversations per agent; the least recently used are forgotten. */
const SAVED_LIMIT = 200;

/** Conversations saved in local storage, by agent and then conversation. */
export function localSessions(
  storage: Storage,
  agent: string,
  name: string,
): SessionStore & {
  /** Saved conversations, most recently used first. */
  list(): [string, SavedConversation][];
} {
  const readAll = (): Record<string, Record<string, SavedConversation>> => {
    try {
      const value = JSON.parse(storage.getItem(name) ?? "{}");
      if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
      // Each agent's damaged conversations are dropped, keeping the rest.
      return Object.fromEntries(
        Object.entries(value).map(([agent, saved]) => [
          agent,
          Object.fromEntries(
            Object.entries(
              saved && typeof saved === "object" ? saved : {},
            ).flatMap(([key, conversation]) => {
              const kept = savedConversation(conversation);
              return kept ? [[key, kept]] : [];
            }),
          ),
        ]),
      );
    } catch {
      return {};
    }
  };
  const list = (saved: Record<string, SavedConversation> = {}) =>
    Object.entries(saved).sort(([, a], [, b]) => b.at - a.at);
  return {
    list: () => list(readAll()[agent]),
    get: (key) => readAll()[agent]?.[key],
    set: (key, saved) => {
      const all = readAll();
      const kept = list({ ...all[agent], [key]: saved }).slice(0, SAVED_LIMIT);
      all[agent] = Object.fromEntries(kept);
      try {
        storage.setItem(name, JSON.stringify(all));
      } catch (error) {
        console.warn("opencode sessions were not saved", error);
      }
    },
  };
}
