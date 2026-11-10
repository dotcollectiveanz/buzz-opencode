// The host types Buzz's ACP client uses, taken from the plugin API's own types
// (`@buzz/author`) rather than the app's internals.
import type { Host, HostMcpServer, McpHandler } from "@buzz/author";

type HostSpawn = NonNullable<Host["spawn"]>;
type HostServeMcp = NonNullable<Host["serveMcp"]>;

export type { HostMcpServer, McpHandler };
export type HostProcessOptions = NonNullable<Parameters<HostSpawn>[1]>;
export type HostProcess = Awaited<ReturnType<HostSpawn>>;
export type HostMcpOptions = Parameters<HostServeMcp>[1];
/** What a session control does to a conversation's session. */
export type SessionAction = "compact" | "new";
