# Yiftach Cloud Platform

Self-hosted cloud control panel, three standalone npm packages — no workspaces.
`platform-backend/`: Node 24 + TypeScript, ESM, no build step (Node strips types
natively, so imports use real `.ts` extensions). `builder-service-backend/`: same
style, a headless worker that performs image builds, no HTTP server. `frontend/`:
React 19 + TypeScript + Vite, Ant Design.

## Code conventions

- **Types live in `interfaces.ts`, not in service files.** Each service folder (e.g.
  `platform-backend/src/services/docker/`) keeps its public interfaces and type
  aliases in an `interfaces.ts` next to the implementation; service files import from
  it and hold only implementation. Exception: private types describing a third-party
  library's wire format (dockerode response shapes) stay in the implementation file,
  so `interfaces.ts` never depends on the library.
- **One class per file**, named after the class in kebab-case (`DockerApiError` →
  `docker-api-error.ts`). Classes never live in `interfaces.ts` — it holds only types.
- **Names say what the thing does, even when that makes them long.** A file or
  function name must tell its job on its own: `run-tool-with-error-mapping.ts`,
  `tool-result-value-formatters.ts`, `toJsonToolResult` — not `run-tool.ts`,
  `tool-format.ts`, `toToolResult`. A generic verb or noun carrying the whole name
  (`run`, `format`, `handle`, `helpers`) means it is too short. Files are named after
  their export in kebab-case; a new folder is welcome when it groups a real kind of
  thing (`src/mcp/server/tool-results-utils/`).
- **An interface is named for what it does; an implementation is a qualifier plus
  the interface name.** `ContainerService` ← `DockerContainerService`,
  `ImageService` ← `DockerImageService`, `LlmClient` ← `OllamaLlmClient`,
  `ToolProvider` ← `McpToolProvider`, `AgentRunTracer` ← `NoOpAgentRunTracer`, the
  builder's `PlatformApiClient` ← `HttpPlatformApiClient`, `RepositoryCloneService` ←
  `GitRepositoryCloneService` and `ImageBuilderService` ← `DockerImageBuilderService`,
  the test fakes (`ManualLlmClient`, `RecordingToolProvider`); no `I` prefix, no `Impl`
  suffix. A consumer is typed by the interface (a route or a tool takes a
  `ContainerService`, the build worker a `PlatformApiClient`) and only a composition
  root names the class, so a test can
  stand a fake behind any consumer. Pairs older than the rule stay as they are:
  `ToolCallApprover` ← `ToolCallApprovalGate`, `AgentRunTracer` ←
  `JsonLinesChatTracer`, `DockerDaemonLifecycle` ← `WslDockerDaemon` /
  `ExternalDockerDaemon`, the frontend's `ChatFetcher` ← `ChatFetcherService`; and
  `DockerImageProvider`, the one-method slice of `ImageService` the container service
  pulls through, keeps its name.
- **Always indent with 4 spaces (not 2)** in all hand-written source and config files.
  Exception: `package.json` stays as npm writes it (2 spaces; npm reformats it on
  every install).
- **Never put a service file directly in `src/`.** Every service lives in a domain
  folder under `src/services/` (`src/services/docker/docker-container-service.ts`). Only
  entry points (`server.ts`, `main.ts`) belong at the `src/` root; startup wiring lives
  in `src/config/config.ts`. The folders beside `services/` are the ways *into* the
  services, not services: `routes/` + `middleware/` (REST, plus `server-sent-events/`
  for the one route that answers with a stream) and, in the platform backend, `mcp/`.
- **Folders depend downward only — no import cycles.** A folder never imports from one
  above it (skipping a level downward is fine). When a lower folder needs something
  from a higher one, it declares an interface the higher one implements (`docker/`'s
  `DockerDaemonLifecycle` ← `wsl/`; `ai-agent/`'s `ToolProvider` ← `mcp/client/` and
  `AgentRunTracer` ← `chat-traces/`). A new folder states its place here when added.
  - Platform backend: `routes/`, `middleware/`, `mcp/` → `services/`, and nothing under
    `services/` imports from those three; `routes/` → `server-sent-events/` →
    `services/` (only `ai-agent/` and `llm/`); inside `mcp/`, `client/` → `server/`.
    `evals/` and `test/` sit *beside* `src/` and import from it; nothing in `src/`
    imports from either, and they never import each other. Inside `evals/`: root
    scripts and `promptfoo/` → `scoring/` → `cases/`; `fakes/` imports only `src/`.
  - Inside `services/`: `validation/` → `builds/`, `build-agents/` → `docker/` ←
    `wsl/`; `validation/` → `ai-agent/` (for `ChatTurn`); `ai-agent/` → `llm/`;
    `chat-traces/` → `ai-agent/`, `llm/`. `docker/`, `build-agents/`, `images/` and
    `llm/` import no other service folder; only the front doors import `validation/`;
    only `server.ts` imports `chat-traces/`. Inside `llm/`, a provider subfolder
    (`ollama/`) imports the folder root, never the reverse.
  - Builder: `worker/` → `platform/`, `git/`, `docker/`, which import neither each
    other nor `worker/`. Frontend: `pages/` → `components/` → `hooks/` → `fetchers/`.
- **Each backend keeps its startup configuration in `src/config/config.ts`.** The
  module loads `.env` itself at the top (ESM import hoisting runs it before any
  entry-point statement, so env cannot be loaded in the entry point), declares
  `export interface IConfig` in-file (a deliberate exception to the `interfaces.ts`
  rule), and exports an eager `export const config: IConfig = { ... }` whose
  UPPER_SNAKE keys mirror the env var names (`config.DOCKER_HOST`), resolved with the
  sanctioned `||` defaulting (`process.env.X || 'default'`, numbers as
  `Number(process.env.X || '2000')`), ending with `console.log('config:', config);`.
  Only the entry point imports it (`import { config } from './config/config.ts';`) and
  passes values into service constructors — services never read `process.env` and
  never import the config module.
- **Routes are thin — one file per endpoint.** `src/routes/<method>-<name>.ts`
  (`get-containers.ts`) exports a factory that takes its service dependencies and
  returns an Express `Router`. A route only translates HTTP ↔ service call; error
  mapping lives in `src/middleware/error-handler.ts`, business logic in services.
- **API routes are versioned.** Every endpoint is served under `/api/v1/...`. Route
  files declare only the resource path (`/containers`); `server.ts` applies the prefix
  once when mounting, so a version bump touches one line. Unversioned: `/health` (an
  infrastructure liveness probe, not API surface) and `/mcp` (MCP negotiates its own
  protocol revision, and a REST version bump must not break the URL MCP clients were
  configured with).
- **Prefer plain, Java-like code over TypeScript shorthand.** Explicit type
  annotations (`Promise<void>`, `readonly url: string`), classic control flow
  (`if {} else {}` with braces), simple method chains (`.filter(...).map(...)`). No ES
  `#` private members (use `private`), no `??` / `?.` / `??=`, no truthiness
  defaulting (`x || fallback`), no defaulting inside object literals
  (`{ all: options.all ?? true }`) — resolve each value into a named local with
  explicit `if`/`else`, then build the object. Type declarations (interfaces, unions,
  generics, optional `?:`) are unaffected — they have no Java equivalent. Two
  carve-outs: `src/config/config.ts` may use `||` defaulting, and boolean logic inside
  conditions (`if (a || b && c)`) is always fine — the ban covers truthiness
  *defaulting*, not boolean tests.

## Platform backend architecture (`platform-backend/`)

Express 5. A request flows route → service → dockerode; errors flow back through the
error handler. MCP is the second way in: tool → service → dockerode, errors through
`mcp/server/tool-results-utils/run-tool-with-error-mapping.ts`. The AI agent uses that
door: agent loop → MCP client → the same tools. The chat is a REST route in front of
it: `POST /api/v1/chat` → `AiAgentChatService` → agent loop, answered as a Server-Sent
Events stream.

- `src/server.ts` — composition root, no logic. Imports `src/config/config.ts`
  (`PORT`, `HOST`, `DOCKER_HOST`, `DOCKER_WSL_KEEPALIVE`, `BUILD_STALE_TIMEOUT_MS`,
  `STATIC_DIR`, `ALLOWED_HOSTS`, `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_NUM_CTX`,
  `CHAT_TRACE_DIR`), builds the services and mounts, in order: host check,
  `express.json()`, unversioned `/health` and `/mcp`, routes under `/api/v1`, static
  frontend, error handler. Its one `if/else` picks the daemon lifecycle: `tcp://` →
  the WSL daemon, `unix://` → `ExternalDockerDaemon`. Assistant: `OllamaLlmClient` +
  the in-process MCP tool provider (one top-level `await`, closed on shutdown) →
  `ToolCallingChatOrchestrator` → `AiAgentChatService`, with
  `createChatTracerForDirectory(CHAT_TRACE_DIR)` as tracer (empty → no traces, the
  `staticFrontend('')` pattern). Building it contacts neither Ollama nor Docker; the
  server starts with both down.
- `src/middleware/error-handler.ts` — the only place service errors become HTTP:
  `ValidationError` and malformed JSON → 400, `DockerApiError` → its status,
  `ImagePullError`/`BuildJobNotFoundError` → 404,
  `ImageNotManagedError`/`ToolCallApprovalNotPendingError` → 409,
  `BuildQueueFullError`/`AiAgentBusyError` → 429, `DockerConnectionError` → 503,
  anything else → 500.
- `src/server-sent-events/` — the stream behind `routes/post-chat.ts`, kept out of
  `routes/` (the endpoint catalog). `ServerSentEventStream` wraps one response:
  `open()` sends the headers at once (the first event may be seconds away);
  `send(event, data)` writes one event, its data one JSON line; `send` and `close`
  are no-ops after the response ends (a late write would be an unhandled Node
  `error`).
  `map-agent-failure-to-error-event.ts` is the third error mapper, beside
  `error-handler.ts` and `run-tool-with-error-mapping.ts`: once the stream is open
  the status line is spent, so a failed run ends with an `error` event
  (`llm_unavailable`, `llm_request_failed`, `internal`; model-server messages pass
  through unchanged, since the provider client already says what to check). **Wire
  contract (`interfaces.ts`):** the `AgentEvent`s
  (`delta`, `tool_call`, `tool_approval`, `tool_result`, the last three paired by
  `callId`), then exactly one `done` (`stopReason`, `modelCalls`, `peakPromptTokens`)
  or `error`; each event's `type` is the SSE event name. A `tool_call` with
  `needsApproval` holds the stream until `POST /chat/approvals`
  (`routes/post-chat-approval.ts`: `{callId, decision}` → 204, 409 when no such call
  waits), echoed as the `tool_approval`. `autoApproveToolCalls: true` in the body
  (absent → false, so older clients keep the ask) skips the wait: destructive calls
  run at once with `needsApproval: false`, `destructive: true`. Route order: validate
  (400) → `startRun` (429 when busy) → open the stream, so every refusal gets a real
  status; `res` `close` aborts the run, a waiting approval included. `fetch` POST,
  not `EventSource` (GET-only).
- `src/middleware/host-check.ts` — answers 403 itself (an HTTP gate, not a service
  error) unless the `Host` header names a host in `ALLOWED_HOSTS` (comma-separated
  hostnames, ports ignored; default `localhost,127.0.0.1`) and any `Origin` header
  does too. The API has no login and controls Docker: `Host` stops DNS rebinding,
  `Origin` stops a foreign page's body-less POST, which no CORS preflight guards.
  Non-browser clients send no `Origin` and pass on `Host` alone. It reads the raw
  header, not `req.hostname`, which follows `X-Forwarded-Host` under `trust proxy`.
  A name the platform is reached under must be in `ALLOWED_HOSTS`; compose adds
  `platform` for the builder.
- `src/middleware/static-frontend.ts` — serves the built frontend (`STATIC_DIR`,
  Vite's `dist`) from the API's origin: real files as-is, any other GET gets
  `index.html` (SPA fallback, Express 5 `/{*splat}`) except under `/api`, `/health`
  and `/mcp`, so an unknown API path stays a 404 rather than HTML with a 200. Empty
  `STATIC_DIR` (the default; Vite owns the UI in dev) returns an empty router, keeping
  the on/off decision out of `server.ts`.
- `src/mcp/` — everything that speaks MCP, by protocol role: `server/` exposes the
  platform's operations as tools, `client/` consumes them for the agent.
- `src/mcp/server/` — the platform's operations as an MCP server (official TypeScript
  SDK **v2**, `@modelcontextprotocol/server` + `/node`; the v1
  `@modelcontextprotocol/sdk` monolith is not used) at `ALL /mcp`
  (`routes/all-mcp.ts`: the protocol owns every method there; the SDK answers older
  clients' GET/DELETE with 405). It sits beside `routes/`, not under `services/`: a
  second thin front door, no business logic.
  - **One file per tool**, `tools/<name>-tool.ts` exporting
    `register<Name>Tool(server, service)`, only translating an MCP call ↔ a service
    call; the folder holds nothing else (`-tool` because `get-container.ts` exists in
    `routes/`). Shared result code in `tool-results-utils/`:
    `run-tool-with-error-mapping.ts`, the only place service errors become tool
    errors (in band, `isError: true`); `tool-result-builders.ts` (`toJsonToolResult`,
    `toTextToolResult`); `tool-result-value-formatters.ts` (short ids, MiB,
    rounding); `map-container-details-to-tool-view.ts` and
    `map-build-job-to-tool-view.ts`. Plumbing (`createPlatformMcpServer`,
    `McpHttpEndpoint`) stays in the `server/` root.
  - **Fifteen tools in one flat folder**, each the counterpart of one REST route,
    registered by the factory in two visible blocks. Readers: `list_containers`,
    `get_container`, `get_container_logs`, `get_container_stats`, `list_images`,
    `get_image`, `get_build`, `list_build_agents`. Writers: `start_container`, `stop_container`,
    `restart_container`, `delete_container`, `create_container`, `delete_image`,
    `start_build`. Annotations say which is which (a `read-tools/` / `write-tools/`
    split was declined as a second copy of that fact): readers carry `readOnlyHint` +
    `idempotentHint`; writers `readOnlyHint: false` plus an explicit
    `destructiveHint`, true for stop, restart and the deletes, false for start,
    create and build. The agent loop and its approval gate consult exactly those.
  - **Writers.** Create and build reuse the REST request parsers: zod describes the
    arguments to the model, the parser enforces the field rules, its
    `ValidationError` becomes an in-band tool error. `delete_container` never passes
    force or volumes, so a running container gets the daemon's refusal; the
    description says "tell the user and ask before stopping it". `start_build`
    answers the queued job and says not to poll `get_build` in the same turn. Start,
    stop and restart answer one line with the state inspected *after* the action
    (`render-container-action-result-text.ts`); a container that exited at once must
    not read as running. `create_container` answers the `get_container` view; the
    build tools answer `BuildJobToolView` (progress log cut to the newest 30 lines).
  - **Results are shaped for a model's context window, not mirrored from REST** (one
    model turn gets 6000 characters of tool results): short ids, MiB not bytes, ports
    as `docker ps` strings (`8080->80/tcp`; `toPortSummaries` collapses the IPv4/IPv6
    twin), stats joined to container names, logs as plain text capped at 200 lines.
    `get_container` answers a diagnostic view (`ContainerToolDetails`): state with
    exit code/OOM/health/restarts, command, ports, env *names* only (values may land
    in a hosted model's context), labels, restart policy, mounts, networks, only the
    limits that are set. `get_container` and the logs take any container's name.
  - **The two container lists show the platform's own containers by default.**
    `list_containers` (also filterable by `state`, applied in the daemon) and
    `get_container_stats` take `includeUnmanaged` (default false,
    `is-platform-managed-container.ts`) and always answer the rows plus
    `hiddenUnmanagedCount`, so a model never reads a filtered list as "nothing is
    running". Above 0 they add a `hiddenUnmanagedNote`
    (`describe-hidden-unmanaged-containers.ts`) naming the call that includes them:
    the count alone, a description sentence and a system-prompt rule all failed on a
    4B model (eval `memory-usage-of-unmanaged-container`).
  - **Tool descriptions are eval-tuned; change a phrasing only with a rerun.** The
    `state` filter says it is usually omitted (else a crashed container was missed);
    the list tool says "which containers exist or run" (else the running question
    went to the stats tool); `list_build_agents` says idle means online.
  - `createPlatformMcpServer` is a factory, not a shared instance: an MCP server binds
    to one transport. `McpHttpEndpoint` wraps the SDK's `createMcpHandler`
    (per-request, stateless; the 2026-07-28 protocol revision with a stateless
    2025-era fallback), closed on shutdown. The handler is validation-free by design;
    `host-check.ts`, mounted app-wide, guards it. **The MCP SDK and zod are
    quarantined in `src/mcp/`**: zod input schemas are the one sanctioned exception
    to the no-schema-library rule of `services/validation/`, `interfaces.ts` stays
    free of both, the route sees only `McpHttpEndpoint`. The SDK is newer than most
    documentation: read the installed `.d.mts` types before using an API.
- `src/mcp/client/` — the MCP *client* side (`@modelcontextprotocol/client`): the
  agent gets its tools through MCP without seeing the SDK. `McpToolProvider` adapts a
  connected SDK `Client` to the agent's `ToolProvider`: `readOnly` from
  `readOnlyHint` (absent → not read-only), `destructive` from `destructiveHint`
  (absent → true, the spec's default), the server's `instructions` as usage
  guidance, and both failure surfaces returned in band: `isError` results (a tool's
  mapped error, and the SDK server's own answer to schema-rejected arguments) and
  thrown protocol errors (an unknown tool name).
  `connect-in-process-mcp-tool-provider.ts` links it to a fresh
  `createPlatformMcpServer` over the SDK's `InMemoryTransport` pair, so the built-in
  agent uses the catalog external clients get at `/mcp`; `server.ts` and the evals
  share that wiring. **The in-process transport is a decision, not a leftover:** MCP
  is the contract, the transport a deployment detail, and here HTTP marks a
  *process* boundary (browser → platform, builder → platform), which the agent and
  the MCP server do not have between them.
  The SDK's suggested loopback `StreamableHTTPClientTransport` was declined: a server
  calling itself would depend on its own port and `ALLOWED_HOSTS`. `InMemoryTransport`
  (labeled "testing and development") is ~40 lines handing each message to the other
  end, omitting only what an in-process link does not need. The agent sees only
  `ToolProvider`, so swapping the transport is a one-file change.
- `src/services/llm/` — the provider-agnostic seam to a language model: `LlmClient`
  (`streamChat(request, onDelta, signal)`), the message and tool-call types, and two
  failures: `LlmUnavailableError` (unreachable, or silent past the idle watchdog) and
  `LlmRequestError` (the server refused). Two outputs on purpose: `onDelta` streams
  text fragments for progress; the resolved `LlmReply` (full text, tool calls, token
  counts) is what the loop decides on. An abort *resolves* with the partial reply
  (Stop is not an error). `LlmToolCall.id` and the result's `toolCallId` are
  optional, carried from call to result for APIs that pair the two by id. Each
  provider is a subfolder keeping its wire format to itself. `llm/ollama/`:
  - `OllamaLlmClient` — plain `fetch` to `/api/chat`, no client library;
    `stream: true`; `num_ctx` always sent (Ollama truncates an over-long prompt silently);
    temperature 0 so tool choice is reproducible; failures arrive as a non-2xx status
    *or* an `{"error"}` line inside a 200 stream. Optional `think` (Ollama's
    reasoning switch) is sent only when configured, so the evals can run a hybrid
    model either way; the thought arrives as `message.thinking` fragments, folded
    into `LlmReply.thinking`, never streamed or shown, kept for the trace.
    `readModelCapabilities()` reads `/api/show`'s list ("tools", "thinking",
    "vision") for the evals' pre-check; the app never calls it. That "thinking" comes
    from the template, so the non-thinking instruct tag carries it too.
  - `ollama-chat-mapper.ts` — the wire shapes: Ollama delivers tool calls whole,
    never as partial JSON, wants `tool_name` on result messages, and issues no call
    id, so the optional ids stay unset.
  - `read-ndjson-stream.ts` — line buffering across chunks, with streamed UTF-8
    decoding so a split multi-byte character survives.
- `src/services/ai-agent/` — `ToolCallingChatOrchestrator`, the hand-written agent
  loop (no agent framework or AI SDK): conversation + tool schemas → model; tool
  calls run and are appended as results; repeat until the model answers in plain
  text. Stateless: a run takes the whole conversation (`ChatTurn[]`, the frontend's
  shape) and keeps nothing. It owns the `ToolProvider`, `ToolCallApprover` and
  `AgentRunTracer` interfaces and imports only `llm/`. The defensive policy:
  - **Model-call cap 6.** The last allowed call offers no tools and appends a system
    message saying so (`NO_TOOLS_LEFT_NOTICE`: tools used up, answer with what you
    know, report what was not done as not done), since a model handed no tools tends
    to claim it complied; it goes after the tool results so the shared prefix stays
    cacheable (`stopReason: 'model_call_limit'`). Unknown tools, exact repeats of an
    executed call and thrown tool errors are fed back in band, never thrown.
  - **Every destructive call waits for the approver.** The tool's `destructive` flag
    decides: stop, restart and the deletes wait; start, create and build run at once,
    since a stop or delete undoes them and will be asked (gating every non-read-only
    call was dropped as one question too many). Consent stays in the host, where MCP
    puts it (elicitation declined: a tool asking for input, not a host asking
    permission). A denied call gets an error result without running, is remembered in
    the run's `RunToolCallLedger` and is refused in band if asked again, so the person
    is asked once. `autoApproveToolCalls` on the `AgentRunRequest` (sent with each
    message; the backend keeps no mode) skips the ask, runs the call at once and
    records it `auto_approved`, the event still flagged `destructive`.
  - **Batches.** All-read-only: `Promise.all`; otherwise serial in the order asked, so
    approvals come one at a time. Calls past the per-turn cap of 5 are refused in
    band; results always go back in call order, one message per call.
  - **Budgets.** Tool results share 12000 characters per run, at most half per turn,
    split across the turn's calls (`trim-tool-result-to-budget.ts` keeps head +
    tail). The conversation gets 3600 characters: an 8192-token window minus the
    measured 3000-token prefix of system prompt and tool schemas, a spent tool-result
    budget and the answer. `select-recent-turns-within-budget.ts` gives the model the
    newest turns that fit (the newest always, no gaps, never opening on an assistant
    turn); the UI sends the whole conversation and Ollama truncates silently.
  - **Events.** Progress is `AgentEvent`s (`delta`, `tool_call`, `tool_approval`,
    `tool_result`). Tool calls are numbered from 1 in the order asked, refused ones
    included; every event of a call carries that `callId`, and a concurrent batch
    reports results as they finish, so a watcher pairs by id, never by name or
    position. `tool_call` says `needsApproval` only for a call now waiting (a repeat
    or already-denied call is refused before it could wait; a UI must not open
    Approve/Deny for it); a denied call still gets its `tool_result`, so every call
    has one. `AgentRunResult` carries the executed calls (result text as the model
    read it, approval outcome) and the peak prompt size.
  - **System prompt.** `build-agent-system-prompt.ts` takes `now` as a parameter,
    fixed per run, so every model call shares one prefix (prompt-cache reuse), and
    swaps its last rule on the catalog: a read-only refusal rule for readers only,
    otherwise "destructive changes run only after the user approves; report only what
    a result confirms".
  - **One run at a time.** `AiAgentChatService` is the chat route's door to the loop.
    One GPU: a second run would queue inside Ollama, silent long enough to trip the
    120s idle watchdog, so it is refused (`AiAgentBusyError` → 429). `startRun` is
    not `async`: the refusal is thrown synchronously, before the route opens its
    stream; the slot is freed in a `finally`. One run at a time also lets an approval
    name its call by `callId` alone: `ToolCallApprovalGate`
    (`tool-call-approval-gate.ts`), the chat's `ToolCallApprover`, parks the waiting
    call's promise until `AiAgentChatService.answerApproval` resolves it from
    `POST /chat/approvals` (`ToolCallApprovalNotPendingError` → 409 when nothing waits
    under that id); the run's abort signal (Stop, tab closing) resolves it as denied
    without an event. No timeout on purpose: the person's absence is Stop. The evals
    bypass the service and construct the orchestrator directly, with their own
    approvers.
  - **Every run is handed to an `AgentRunTracer`** (`tracer` option;
    `NoOpAgentRunTracer` when absent, so the evals trace nothing): `startRun` once
    the request is settled, `recordModelCall` after each `streamChat` with the exact
    `LlmChatRequest` the model read, its `LlmReply` and the duration, `recordEvent`
    for every event before it reaches the caller, `finishRun` with the result or
    `failRun` with the model-server error. The loop never waits for the trace;
    `chat-traces/` implements it.
- `src/services/chat-traces/` — the record of what the assistant was sent and
  answered, for investigating a reply. `JsonLinesChatTracer` writes one `.jsonl` per
  run into `CHAT_TRACE_DIR`, named `<start time>-<8-char run id>` with colons swapped
  for dashes (Windows file names); the server logs `chat trace: <path>` at every
  run. `JsonLinesChatTrace` serializes each record as it arrives (the loop hands over
  its *live* message list) and appends it, so a run that dies mid-way still leaves
  the calls so far. Format (`interfaces.ts`, a union told apart by `type`):
  `run_start` (run id, model, context size, auto-approve, the turns as received, the
  tool catalog once); `model_call` (the messages exactly as sent — windowed history,
  trimmed tool results — the reply, duration, `toolsOffered`, false on the capped
  last call); `event` (tool calls,
  approvals, results; deltas skipped, the reply holds the text whole); `run_end` or
  `run_failed`. A trace, not a log: one file per execution, machine-readable,
  replayable; "logs" already means container and build logs here. A write failure is
  reported once on the console and the rest of that run goes unrecorded: a trace
  must never fail the chat. On by default (`chat-traces`, gitignored, relative to the
  working directory), because the reply worth investigating is never the expected
  one; the files hold the user's chat text and the tool results the
  model read, on the local disk only. **A developer tool for `npm run dev`, not a
  compose feature:** the image switches it off (`CHAT_TRACE_DIR=""` in the root
  `Dockerfile`), since in a container the files would fill its filesystem unread (a
  bind mount was declined). To trace a compose run anyway, set
  `CHAT_TRACE_DIR=chat-traces` on the `platform` service and `docker cp` the files
  out of `/app/chat-traces`.

- `evals/` (beside `src/`, not under it) — terminal drivers of the agent, no HTTP, a
  `test/` folder in all but name: they import from `../src/`, nothing in `src/` knows
  them, the image copies `src/` only. `evals/tsconfig.json` extends the main one with
  `noEmit` (`npm run typecheck` runs both); the main `tsconfig.json` builds `src/`
  alone, so `dist/` keeps its layout. Scripts use the do-nothing
  `ExternalDockerDaemon`, so none boots or holds the WSL distro. **Layout:** the root
  holds the entry points, `print-agent-event-to-terminal.ts`,
  `terminal-tool-call-approver.ts` and `connect-platform-tool-provider-for-evals.ts`;
  `cases/` case data (one file per category, the list, the category list, the default
  rubric) and types;
  `scoring/` the judges (`score-tool-choice-case.ts`, `score-reply-expectation.ts`,
  `judge-case-verdict.ts`); `fakes/` stand-ins for what the agent talks to;
  `promptfoo/` the harness; `results/` committed verdicts and table.
  - **Cases.** `cases/tool-choice-cases.ts` concatenates one file per category
    (`reader-cases.ts`, `no-tool-cases.ts`, `writer-cases.ts`, `follow-up-cases.ts`,
    `error-handling-cases.ts`, `safety-cases.ts`; order and headings in
    `tool-choice-case-categories.ts`). A case: a prompt, the calls that must happen
    (arguments as a structural subset — listed keys only, arrays element by element,
    scalars as text — so `create-container` is held to its ports),
    and extra tools allowed. Optional: a `reply` expectation, a `rubric`, and
    `precedingTurns`, earlier turns as a chat trace records them, which turn a failed
    chat into a regression case (`stop-container-named-in-earlier-turn`). The list
    is plain data the harness loads, not owns. The category is a field on the case,
    mirrored by its file; loading throws on a mismatch or a repeated id. It names
    what the case probes, not the tool it ends in.
  - **Fixture.** Cases run through the real loop and the *real* MCP catalog; only
    `CannedResultsToolProvider` is substituted, answering from
    `canned-platform-tool-results.ts`, so no Docker is needed and runs score
    comparably across models. Fixtures are typed against
    `src/mcp/server/interfaces.ts` (plus the service types the image and build-agent
    tools pass through) and serialized by the tools' own
    `renderValueAsToolResultJson`, so a changed tool shape breaks the typecheck.
    Reads apply the managed-only default and filters; writers answer as the real
    ones would without changing the fixture (a stop reports the container exited;
    deleting a running container gets the daemon's refusal in its words), except
    that `fakes/interfaces.ts`'s `CannedPlatformCaseMemory` (one per case; the
    provider is built fresh per case) remembers a stop, read only by the delete, so
    `stop-then-delete-after-user-confirms` can succeed. The canned agent's heartbeat
    is taken at the call, or `build-agents-online` reads it as offline.
    `auto-approve-tool-call-approver.ts` approves every call: nothing executes, the
    question is the choice. The refused-delete safety case accepts calling
    `delete_container` and relaying the refusal, or asking, and fails on any
    `stop_container`. Promptfoo is the cases' only runner; a failed case is read
    from the results file.
  - **Reply expectations** (`ReplyExpectation`, `scoring/score-reply-expectation.ts`):
    `mustMention` fragments (a string, or alternatives of which one must appear) and
    `mustNotMention` phrases, matched case-insensitively. Typographic spaces and
    hyphens are normalized first (granite's "9.8 MiB" has a narrow no-break space).
    Fragments are values the tool results carry (the figure, the error line, the
    name), not the model's wording; negatives are a wrong answer's claims ("has been
    deleted" after a refused delete) — the check that catches an action reported but
    never run. Deterministic and free. A hosted `llm-rubric` judge for paraphrase
    (default grader an OpenAI model, key from the environment) is left for later as
    a config entry, not code: every row already carries its `rubric` or
    `cases/default-reply-rubric.ts` as a var. A local 4B judge was declined: the GPU
    holds one model, and it would be as fallible as the judged.
  - **Harness: Promptfoo** (`npm run eval`; a dev dependency, chosen over a
    hand-rolled runner, Vercel's eve, Evalite and vitest-evals).
    `promptfoo-config.yaml` is the suite: one provider entry per column, a model or
    one model twice under a `variant` (the variant joins the provider id and the
    results file name, `<model>+<variant>.json`), with `think` where the model can switch it and a wider
    `contextTokens` where the thought needs room. `promptfoo-agent-provider.ts` (an
    `ApiProvider`) runs the whole agent:
    `config` names `llm` and `model`; `readModelCapabilities` first checks the model
    is pulled and can call tools, else the column fails; tool calls ride in `metadata`;
    `cleanup` closes the MCP link. **One model per invocation**
    (`--filter-providers <regex on label or id>`): with several entries Promptfoo
    alternates providers row by row, a model swap every case. Columns, labels worded
    alike: "qwen3 4B, instruct model" (the baseline), "qwen3 4B, thinking model",
    "qwen3.5 4B, thinking off" / "thinking on" (one model, the flag), "granite 4.1
    3B" (the out-of-family control for a prompt tuned on qwen).
    `promptfoo-tests-from-tool-choice-cases.ts`
    makes the case id the description, so `--filter-pattern` selects by id and
    `read-tool-choice-case-of-row.ts` finds the case for the assertions; prompt,
    turns and rubric are vars (expansion off), expectations are not. Two
    `javascript` assertions, `assert-tool-choice.ts` and
    `assert-reply-expectation.ts` (a case without one passes it), delegate to the
    scorers; a row passes only when both do, combined and phrased by
    `scoring/judge-case-verdict.ts`, shared with the rescore. Concurrency 1 for the
    one GPU. Promptfoo loads `.ts` via `tsx`; its state lives under `~/.promptfoo`,
    nothing in the repo; `npm run eval:view` opens its viewer;
    `PROMPTFOO_DISABLE_TELEMETRY=1` stops its pings.
  - **Every run records itself.** The `afterAll` hook `record-eval-run-results.ts`
    (`file://…:afterAll`; no default export, it would shadow the hook) folds the run
    into `evals/results/<model>.json`, **one merged file per model**, typed
    `EvalModelResults`: covered cases replace their entries, the rest stay, each with
    the time and Promptfoo eval id it came from; a rerun changes cells, never adds
    files (Promptfoo's own row output stays in `~/.promptfoo`, reachable by that id).
    A provider failure (model server unreachable; told by `failureReason`, not
    `error`, which a failed assertion sets too) is skipped, not recorded. The hook
    then regenerates
    `evals/results/README.md` through `render-eval-results-table.ts`, a table plus a
    failures list (the failing assertion's reasons only; a missing phrasing named by
    its first alternative). `npm run eval:table` (`regenerate-eval-results-table.ts`)
    rebuilds it by hand. Both are committed: the model files are the evidence, the
    table the summary. **A changed expectation or scorer is a rescore, not a
    rerun:** `npm run eval:rescore` (`rescore-recorded-eval-results.ts`) re-judges
    every recorded verdict with the current cases and scorers, rewriting `passed`
    and `reasons` and keeping time and eval id. It also refreshes provider labels
    (`read-eval-provider-records-from-config.ts`, on `yaml`, sharing
    `parse-promptfoo-agent-provider-config.ts` with the provider) and regenerates
    the table. A new case, prompt or tool description still needs a run.
  - **Cases run back to back** (no `evaluateOptions.delay`; about 12 minutes a
    model). That needs `LLAMA_ARG_CACHE_RAM=0` on the native Ollama unit (Ollama starts
    `llama-server` without `--cache-ram`, so the env var is the switch; systemd
    drop-in `[Service] Environment="LLAMA_ARG_CACHE_RAM=0"`; llama-server then logs
    "prompt cache is disabled") and on the compose `ollama` service; watch the
    unit's `MemoryPeak` growth. Without it llama-server's prompt cache (8 GiB by
    default) grows about 500 MB a case in a 7.7 GB WSL VM until the VM swaps (the
    distro "freezes": Ollama and Docker silent, `wsl -l -v` still Running, only
    `wsl --shutdown` recovers) or the kernel OOM-kills Ollama (`journalctl -u ollama`
    shows `oom-kill`; cases in the restart window fail with `LlmUnavailableError …
    other side closed`). The cache is worth nothing with one slot, whose own KV
    already carries the shared prefix. An errored row is rerun; a provider error is
    never a verdict.
  - `npm run ask:ai-agent -- "<question>"` asks one question with the tools executed
    for real; Ctrl+C aborts. Each destructive call waits for y/n on the terminal
    (`terminal-tool-call-approver.ts`; Ctrl+C at the question denies and re-raises
    SIGINT). A build it starts sits in the script's own queue, which no builder
    polls; a real build test goes through the UI.
  - `npm run replay:model-call -- chat-traces/<file>.jsonl [n] [--current-prompt]`
    (`replay-recorded-model-call.ts`) re-sends one model call of a chat trace, by
    default the last, to Ollama. It prints the recorded and new replies with a
    same/different verdict on tool calls (argument keys sorted) and text. Exact mode
    sends the recorded messages and tools, so at temperature 0 a wrong reply
    reproduces without the chat, Docker or the tools; `--current-prompt` keeps the
    recorded conversation but rebuilds the system prompt (recorded start time as
    "now") and the tool definitions from the current code through the real MCP
    catalog — the loop for fixing a prompt: edit, replay, see whether the model now
    chooses right. Another model's trace replays with a note saying so.
- `src/services/docker/` — the daemon-facing services. `DockerContainerService` is
  the typed facade for container operations; `DockerImageService` owns pulls and the
  list/detail/delete of platform-built images (labeled `cloudplatform.managed=true`).
  The routes and the MCP tools see them as `ContainerService` and `ImageService`
  (`interfaces.ts`); only the composition roots construct the classes.
  `GET /images/:id` serves the inspect-backed `ImageDetails` (exposed ports,
  provenance labels), 409 for unmanaged images, its `sizeBytes` from the list
  endpoint so it matches the images table (containerd-store inspect reports
  compressed size).
  Deletes never pass force, so the daemon refuses in-use images. `DockerImageService`
  has its own timeout-less dockerode client, since pulls run for minutes; hung streams are caught
  by `drain-progress-stream.ts`'s idle watchdog. The container service consumes it
  through `DockerImageProvider`. Both run every daemon request through
  `DaemonRequestRunner`, which boots the daemon via the lifecycle and retries once
  on connection failure; stream draining stays outside it, never retried. Public
  types in `interfaces.ts`;
  dockerode wire shapes are quarantined in `container-mapper.ts`, `image-mapper.ts`,
  `classify-dockerode-error.ts` and `drain-progress-stream.ts`. Image *builds* belong
  to the builder service. `resolve-docker-endpoint.ts` accepts `tcp://host:port`, the
  WSL form, and `unix://<path>`, a mounted socket (`DockerEndpoint.socketPath` is
  set, dockerode gets `{ socketPath }`, `baseUrl` stays a display string).
  `ExternalDockerDaemon` is the do-nothing `DockerDaemonLifecycle` for the socket
  deployment.
- `src/services/builds/` — the FIFO build queue the builder works off. `POST /builds`
  enqueues the whole container config, 202 with status `queued`, 429 past 10 waiting
  jobs; an optional `imageName` ("name" or "name:tag") replaces the generated
  `cloudplatform/build-<owner>-<repo>:<shortid>`. An empty `ports` list means the
  builder publishes the built image's TCP EXPOSEs, nothing when it has none. Clients
  poll `GET /builds/:id`. The builder claims the oldest queued job via
  `POST /builds-queue/claim` (204 when empty; the claim also fire-and-forgets a WSL
  daemon warm-up). It appends progress via `POST /builds-queue/:id/logs`, creates the
  container through the normal `POST /containers`, and reports via
  `POST /builds-queue/:id/result` (first terminal status wins). A running job
  untouched for 10 minutes (`BUILD_STALE_TIMEOUT_MS`) is failed by the sweeper so the
  UI never hangs; finished jobs expire after 30 minutes; a restart forgets all jobs:
  pollers get 404, on which the builder abandons in-flight work.
- `src/services/build-agents/` — `BuildAgentRegistry`, the in-memory presence map the
  Build Agents page reads: builders report via `POST /build-agents/heartbeat`
  (`{name, status: idle|building, currentJobId?, startedAt}`, upserted by name,
  always 204), the UI lists via `GET /build-agents`. Offline is derived at list time
  (silent past 30s → `offline`, stale `currentJobId` dropped); records silent past 30
  minutes are pruned lazily inside `listAgents()`, so no sweeper and no start/stop
  wiring in `server.ts`; a restart forgets all agents until their next beat.
- `src/services/validation/` — hand-rolled request-body validators, no schema
  library, one function per endpoint body, throwing `ValidationError` (→ 400). The
  container name/ports/env field rules live once in `parse-container-fields.ts`,
  shared by the create-container and start-build parsers. `parse-chat-request.ts`
  guards against junk, not long conversations (the agent's history window does): at
  most 100 turns, the last a `user` turn of at most 3600 characters. That is the
  agent's whole history budget, so the one turn the window always keeps fits.
  Consecutive `user` turns are valid: the UI drops a reply that failed before its
  first fragment. Its result is the agent's `AgentRunRequest`: the turns plus
  `autoApproveToolCalls`, an optional boolean (absent → false).
- `src/services/wsl/` — the WSL adapter for the docker service's daemon-lifecycle
  contract. `WslDockerDaemon` implements `DockerDaemonLifecycle`: boots the distro on
  demand and holds it open (see Verification); `bootstrapWslDocker` builds it and
  starts a background warm-up. Wired only for a `tcp://` endpoint: the WSL ping uses
  `fetch`, which cannot speak to a unix socket.

## Builder service architecture (`builder-service-backend/`)

A headless polling worker: no HTTP server, so no routes and no error handler; the
backend code conventions apply. Runs alongside the platform via `npm run dev`, or as
its own container (its `Dockerfile`; the `builder` service in the root
`docker-compose.yml`), separate so an unverified clone never touches the platform's
filesystem. One task at a time: claim → clone → build → resolve ports → create
container → report, then poll again.

- `src/main.ts` — entry point. `src/config/config.ts` — env-driven `config`
  (`IConfig`), loads `.env` and logs itself at import: `PLATFORM_API_URL`,
  `DOCKER_HOST` (`tcp://host:port` or `unix://<path>`, parsed fail-fast into
  `DOCKER_SOCKET_PATH` or else `DOCKER_HOST_NAME`/`DOCKER_HOST_PORT`, the other side
  `undefined`), `POLL_INTERVAL_MS`, `WORKSPACE_DIR`, `GIT_CLONE_TIMEOUT_MS`,
  `AGENT_NAME` (defaults to the machine hostname), `HEARTBEAT_INTERVAL_MS`.
- `src/services/platform/` — `HttpPlatformApiClient`, the only door to the platform
  API (axios, styled after the frontend's `DockerFetcherService`; axios never leaks).
  A 404 on a job-scoped call becomes `BuildJobLostError`, the single abandon signal
  (the platform restarted and forgot the job). The worker sees it as
  `PlatformApiClient`; each of these three folders keeps its interface in its
  `interfaces.ts`, and only `main.ts` constructs the classes.
- `src/services/git/` — `GitRepositoryCloneService` (the worker's
  `RepositoryCloneService`) shallow-clones with the git CLI
  (`--depth 1 --single-branch --no-tags`, prompts disabled, `--` before the URL,
  killed at `GIT_CLONE_TIMEOUT_MS`) and reads HEAD (`readHeadCommit`, via
  `git rev-parse`). The builder's host needs `git` on PATH.
- `src/services/docker/` — `DockerImageBuilderService` (the worker's
  `ImageBuilderService`) streams the clone (minus `.git`) to
  the daemon as a tar build context (BuildKit, `version: '2'`), labeled
  `cloudplatform.managed=true` plus the caller's `extraLabels`. The worker passes the
  provenance `cloudplatform.repo-url`, `.git-ref` (only when a `#ref` was given),
  `.commit` and `.build-job-id`; `frontend/src/components/image-details.tsx` reads
  them, so keep the names in sync. The daemon never runs git.
  `drain-progress-stream.ts` is a deliberate copy of the platform's, in both packages
  **byte-identically** (no workspaces), so edits must touch both, its test and
  `ManualProgressFeed` included; `decode-buildkit-log-line.ts` lives only here.
- `src/services/worker/` — `BuildWorker` (the serial loop; always deletes the clone
  workspace in `finally`); `LogBatcher` (flushes log lines to the platform about once
  a second; records a 404 instead of throwing from the timer); `PortResolver` (a job
  without ports gets them from the built image's TCP EXPOSEs via the platform API,
  host = container port bumped past taken ports, the frontend `port-defaults.ts`
  policy; no TCP EXPOSE publishes nothing); `HeartbeatReporter` (posts to
  `POST /build-agents/heartbeat` every `HEARTBEAT_INTERVAL_MS` on an unref'd timer,
  plus an immediate beat on every idle↔building transition: `BuildWorker` calls
  `setBuilding(jobId)` entering `processTask` and `setIdle()` in its `finally`; a
  dedicated call so long builds never look offline; send failures are swallowed).

## Frontend architecture

The code conventions apply here too (components take the place of classes; JSX
files use `.tsx`).

- `src/pages/` — one thin page per route; they only compose components. Routing lives
  in `App.tsx` (react-router): a pathless layout route renders
  `components/app-layout.tsx` (AntD sidebar + `<Outlet />`); menu keys are the route
  paths.
- `src/components/` — one component per file (`container-list.tsx`).
- `src/fetchers/` — all backend API access. `DockerFetcherService` (axios) throws
  only `DockerFetcherError`, so axios never leaks into components.
  `ChatFetcherService` is the one fetcher on plain `fetch`, whose response body can
  be read as it streams; it throws only `ChatFetcherError`. Wire types in
  `fetchers/interfaces.ts` mirror the platform backend's `interfaces.ts`, except
  JSON-serialized fields (backend `Date` → ISO `string`).
- **Route navigation renders a real anchor.** Anything the user clicks to go
  somewhere (menu items, breadcrumbs, table-cell links, navigation buttons, the
  wizard's source cards, overview node cards) must be an `<a href>`, so ctrl+click
  and middle-click open a new tab:
  react-router `<Link>` where antd styles anchors in context or around card-like
  blocks (with `color: 'inherit'`); otherwise antd `Typography.Link`/`Button` with
  `href` plus an `onClick` delegating to `components/link-click.ts`'s
  `navigateOnPlainClick`, so a plain left click stays an SPA navigation. Imperative
  `navigate()` is only for post-action redirects and `<Navigate>` guards. Table rows
  can't be anchors, so every data cell wraps its content in the row's `<Link>` styled
  by `.app-row-link` (index.css), which swallows the cell padding so the whole row
  reads as one continuous link that looks like plain text. Cells with their own
  interactions skip the wrapper; only the
  primary cell's link is tabbable (the rest get `tabIndex={-1}`); every cell link
  stops propagation; the row keeps its whole-row `onClick` for the leftover surface.
- **Skeletons only when there is nothing to show; re-fetches are silent.** A view
  renders a `Skeleton` only while it has no data yet: first load, or navigation to a
  *different* entity. After that, re-fetches keep the stale content until fresh data
  arrives; a failed re-fetch shows a non-destructive `Alert` above it, cleared by the
  next success. Only an initial-load failure may replace the body with an error
  alert. Component fetches go through `src/hooks/use-fetched-data.ts`, never
  hand-rolled `useEffect` + disposed flags: `requestKey` carries the entity identity,
  `resetOnKeyChange` picks reset-to-skeleton vs. keep-stale when it changes,
  `pollIntervalMs` adds a slow silent re-fetch. Polling that needs cursors, error
  backoff or accumulation (`container-logs-panel.tsx`, `build-progress-panel.tsx`)
  keeps its own timeout loop under the same skeleton and inline-alert rules. One
  such loop is shared: `src/hooks/use-container-stats.ts` polls
  `GET /containers/stats` (success → 3s, silent failure → 10s backoff, no alert).
- The GitHub source in the new-container wizard submits the build **and** the
  container config in one `POST /builds`; the builder creates the container, so the
  wizard only watches the job (`queued` → `running` → terminal) and navigates to My
  Services on success. It never calls `POST /containers` for that source. Its ports
  section starts with no rows: empty means the builder auto-publishes the built
  image's EXPOSEd TCP ports, or nothing when it EXPOSEs none.
- Clicking a My Images row opens `/images/:imageId` (short id; the daemon resolves a
  prefix): `components/image-details.tsx`, fed by `GET /api/v1/images/:id`, shows
  basics, EXPOSEd ports and provenance labels. The wizard's create-from-image deep
  link (`?image=`) uses the same endpoint to pre-fill the ports rows from the image's
  TCP EXPOSEs (host port = container port); a failed lookup leaves the default empty
  row.
- The Overview page (`/overview`) draws the deployment topology with ReactFlow
  (`@xyflow/react`): GitHub repo → image → container, one column each.
  `components/overview-graph-builder.ts` is the pure assembly + layout step: stable
  node ids, deterministic hand-rolled positions (no layout library), registry images
  absent from `GET /images` synthesized from the container rows.
  `overview-graph.tsx` polls both lists via `use-fetched-data` (15s) plus the shared
  `use-container-stats` 3s loop, overlaying samples without touching positions so
  the viewport never resets. Node cards are real links (container →
  `/services/:name`, managed image → `/images/:id`, repo → GitHub in a new tab), kept
  clickable by the canvas's no-op `onNodeClick`: without it xyflow strips their
  pointer events. The managed-only Switch matches the services table. Node cards
  style themselves inline (square, grey); ReactFlow is not antd, so its control
  chrome is squared in `index.css`, not via tokens.
- The Build Agents page (`/build-agents`) is a read-only status table
  (`components/build-agent-list.tsx`, polling `GET /build-agents` via
  `use-fetched-data` every 5s): Name; Status (antd `Badge`, idle/building/offline, the
  `build-progress-panel.tsx` style); Uptime (`components/agent-format.ts`'s
  `formatUptime` from the reported `startedAt`, "—" when offline); Last seen. No
  detail page behind the rows, so none of the row-link machinery.
- **The assistant chat** is a docked right-hand column of the app frame, mounted in
  `app-layout.tsx` *outside* the `<Outlet />`, so a conversation survives route
  changes. It pushes the page aside instead of floating over it: the chat quotes what
  is on screen, and a floating corner card covered exactly that.
  - **Shell** (`components/chat-docked-column.tsx`): an antd `Layout.Sider` as the
    frame's third column (`collapsedWidth={0}`, `trigger={null}`, `transition: none`),
    sticky at viewport height, its header row at `app-layout-constants.ts`'s
    `headerRowHeight` so the divider continues one line across the screen (a separate
    constants file avoids an import cycle). Opens at 380px; resized by dragging its
    left edge (`chat-column-resize-handle.tsx`: a 6px strip on the border line,
    clamped to 320px and 60% of the viewport, a focusable `role="separator"`,
    Left/Right step 16px, Home/End go to the limits, double-click resets to 380). No
    expand button; the drag is the control. Closed means collapsed to zero width,
    never unmounted: the inner frame keeps the open width so the clipped messages
    never reflow, and `inert` takes it out of hit-testing, the tab order and the
    accessibility tree. No outside-click listener: it closes only through its X or
    the mascot. The header's "New conversation" button (the "compose" glyph: it offers
    a fresh chat, and emptying the current one is the means; needed since a reload no
    longer clears the chat) empties the chat, stopping a streaming reply, through the
    panel's `ChatPanelHandle` over a `ref`, so the panel stays the owner.
  - **Launcher** (`chat-mascot-button.tsx`): the bare 72px mascot
    (`public/chatbot-badge.svg`, an `<img>` like `preset-icon.tsx`) as an antd
    `Button` stripped of its box inline (transparent, no border or shadow; inline so
    antd's hover background loses). The hover/focus grow in `index.css`'s
    `.app-chat-mascot` is the affordance. No caption: an antd `Tooltip` "YCP
    Assistant" and the same `aria-label` name it. Its left edge sits on the menu
    icons' line (pulled 11px left, the drawing's inset in the image), pinned to the
    bottom of the left sider, so that sider is sticky at viewport height too. No
    on/off marker: the menu's selected bar means "the page you are on", and the open
    column is the only sign the assistant is on.
  - **What is remembered where.** The open/closed state lives in `app-layout.tsx`,
    which renders both, stored by `chat-column-open-storage.ts`; the width by
    `chat-column-width-storage.ts`, re-clamped on read since the window may have
    shrunk. Both use `session-storage-with-local-storage-fallback.ts`: the tab's own
    entry wins for the life of the tab, a new tab starts as the last tab left it,
    every write goes to both stores, every access is wrapped so blocked storage only
    costs the default. Those two are preferences, not content, so their
    `localStorage` copy is all the app leaves durably in the browser. The
    conversation is `sessionStorage` only (`chat-conversation-storage.ts`, written on
    every change, streamed fragments included, read back at mount): per tab, so two
    tabs never overwrite each other, a ctrl+click tab starts empty, and closing the
    tab ends the conversation; the backend keeps none, so this is the only copy. The
    key is versioned (`v2`; a `v1` entry is not read) and every message is checked
    field by field, so a junk entry starts empty and never crashes the first render.
    A reply still streaming at reload restores as `stopped` with its running and
    waiting tags dashed: the reload aborted the run. Message ids continue from the
    last restored message. The auto-approve switch is
    remembered per tab in `sessionStorage` only (`chat-auto-approve-storage.ts`),
    never `localStorage`: a fresh tab must not open with the assistant allowed to
    delete unasked.
  - **Panel** (`chat-panel.tsx`) owns the conversation (messages + composer) and
    knows nothing about where it is mounted, so a different shell is a one-file
    swap. Between the messages and the text field, `chat-composer.tsx` carries the
    **auto-approve switch**: an antd `Switch` whose "on" color is the warning token
    via a nested `ConfigProvider`, beside a warning-colored "Auto-approve on" label.
    The panel owns it and sends it with every message, so a flip while a reply
    streams applies to the next message and a waiting call keeps its buttons. A
    destructive call that ran under it shows as any running call; a marker would
    need a per-call flag and a `v3` key, left out.
  - **Fetcher.** The panel talks to the `ChatFetcher` interface
    (`fetchers/interfaces.ts`): `streamReply(request, onEvent, signal)` takes the
    turns plus the switch (`ChatReplyRequest`); an abort resolves (Stop is not an
    error), failures reject with `ChatFetcherError`. `ChatFetcherService` (wired in
    `App.tsx`) posts `POST /api/v1/chat` with the newest 100 turns (the backend's
    cap) and `autoApproveToolCalls`, and reads the reply as Server-Sent Events via
    `read-server-sent-events-stream.ts`: a `getReader()` loop, since `EventSource`
    is GET-only, with line and UTF-8 buffering like `read-ndjson-stream.ts`. Events
    reach `onEvent` unchanged (`ChatReplyEvent`). The stream must end with `done`: an
    `error` event rejects with its message, and so does a body ending with neither.
    A non-2xx before the stream (400, 429 "busy", 403) rejects with the error
    handler's `message`. `answerToolCall(callId, decision)` posts Approve/Deny to
    `/api/v1/chat/approvals`; its promise only says the backend took the answer, the
    outcome arrives on the stream. The browser never calls an LLM provider directly.
    The turns sent back stay `{role, text}`: tool calls are not part of the history
    the model reads.
  - **Events into messages.** `applyReplyEvent` folds each event into its reply:
    text fragments grow `text`; tool events grow `toolCalls`, one `ChatToolCall` per
    call, paired to its result by `callId`, never by name or position. A call is
    `awaiting` when its `tool_call` says `needsApproval`, `running` or `denied` on
    the `tool_approval`, and stays `denied` when its error result follows; a reply
    settled by Stop or a failure marks every running or waiting call `stopped`.
    **Tool-call tags** (`chat-tool-call-tags.tsx`): one antd `Tag` per call above
    the reply text, in call order, labeled with the raw MCP tool name (so a reader
    sees which tool the model reached for) plus its primitive arguments
    (`chat-tool-call-formatters.ts`). Icons: question mark (warning color) waiting;
    spinner running; check/cross on a result; stop sign denied; dash stopped.
    Clicking a tag, or Enter/Space (a focusable `role="button"`), opens
    `chat-tool-call-details.tsx` under the row: the arguments as JSON and the result
    text exactly as the model read it, height-capped and scrolling, carrying
    `.app-log-output` so its text is selectable; inline rather than a `Popover`, so
    it scrolls with the conversation. **Approve and Deny live in a row of their own
    under the tags** (`chat-tool-call-approval-row.tsx`), shown only while a call
    waits: "Waiting for your approval" beside two small buttons that disable on the
    first click; Approve is `danger` red and says "(destructive)", since every call
    that waits is one. No tag opens by itself: details stay closed until clicked. The
    decision goes up through
    `onDecide` (list → item → tags → row, plain props) to the panel, which posts it;
    the tag changes only when the stream says so, and a refused answer (409) is only
    logged, the tag being settled already. The "Thinking…" placeholder shows only
    while the reply has neither text nor a running or waiting tag. Of `done`, the UI
    shows only a `model_call_limit` stop reason, as a small note under the reply;
    call and token counts stay off the UI.
  - **Markdown.** Assistant replies render through `chat-reply-markdown.tsx`
    (`react-markdown` + `remark-gfm` for tables + `remark-breaks`, so a model's
    single newline stays a line break); user messages stay plain text. A reply can
    quote tool results, so it is untrusted: raw HTML is never interpreted (no
    `rehype-raw` — keep it that way); `<img>` is disallowed, because an image is
    fetched without a click and would let a log line carry what the model read to a
    foreign server; links open in a new tab (`chat-reply-markdown-link.tsx`). The
    component is memoized on the text, because every streamed fragment re-renders
    the whole message list. Styling is `.app-chat-markdown` in `index.css` (bare
    elements, not antd): code blocks wrap like the log panes, and a table is the one
    block that may scroll sideways.
- The dev server proxies `/api` → `http://127.0.0.1:3000` (`vite.config.ts`); the
  backend has no CORS middleware, so never call the backend origin directly. The
  fetcher's base URL is the relative `/api/v1`, which also lets the app image serve
  the built UI and the API from one origin with no frontend changes.
- App-wide look and feel is set via antd `ConfigProvider` theme tokens in `main.tsx`;
  prefer tokens over CSS overrides of `.ant-*` classes.
- UI chrome is never text-selectable. `index.css` sets `user-select: none` on `body`;
  only copyable content opts back in with `user-select: text`: form fields; table
  *body* cells (headers stay chrome); description values; alert text;
  `.app-log-output` (the log panes); `.app-chat-message` (chat message text).
  Buttons re-disable selection so row actions inside table cells stay chrome. New
  chrome needs no work; a new surface with copyable values must join the opt-in list
  in `index.css`.

## Testing rules

- **Unit tests live in `test/` beside `src/`, mirroring it** (`test/services/ai-agent/`,
  `test/mcp/server/tools/`, `test/middleware/`), in each backend package.
  `test/tsconfig.json` extends the main one with `noEmit`, like `evals/`, and joins
  `npm run typecheck`; the image copies `src/` only. Runner: Node's own `node --test`
  (`npm test` = `node --test "test/**/*.test.ts"`) with `node:assert/strict`; no test
  framework, no mocking library. `test/` imports from `src/`; nothing in `src/` imports
  `test/`, and `test/` and `evals/` never import each other: the evals' fakes feed a
  real model canned platform data, the tests' fakes script the model itself.
- **A test exercises one module alone**, built by hand as `server.ts` or `main.ts` would
  build it, with a fake behind every interface it imports from another folder: never
  Ollama, Docker, WSL, git, the platform API, a real timer or the disk (a temp folder
  for the static frontend and for the build worker's clone workspaces, made and
  removed by its harness). Its own folder's in-memory classes are used for real
  (`AiAgentChatService` runs the real orchestrator and gate over a fake `LlmClient`;
  `BuildQueueService` the real `BuildJobRegistry`). Every test pins one rule the
  module enforces — a budget, a refusal, an ordering — and would fail if that rule were
  removed from `src/`; nothing tests a fake, a getter or the wiring. Tests never read
  `config` or the environment: every setting is passed in.
- **Each fake implements the real interface the module under test already depends on**
  (`LlmClient`, `ToolProvider`, `ToolCallApprover`, `DockerDaemonLifecycle`), declared
  with `implements` so the typecheck holds it to the contract; a fake never stands in
  for a concrete class. Fakes are hand-written, one class per file, named by what they
  do in the test: `Recording…` keeps every call and can `failWith(error)`; `Manual…` is
  driven by the test (the next reply, the next decision); `InMemory…` is a working
  implementation over a map or list with inspection hooks. A fake lives beside the
  interface it implements, in the mirrored tree
  (`test/services/llm/fakes/manual-llm-client.ts`), and other folders' tests import it
  from there. Fakes stay dumb: a failure is injected, never derived — the container fake
  does not re-implement the daemon's refusals, a test hands it the 409 to throw. A fake
  that grows rules of its own gets its own test.
- **Not covered, by decision:** the composition roots (`server.ts`, `config.ts`,
  `main.ts`); `WslDockerDaemon` (it spawns `wsl.exe`) and the builder's
  `GitRepositoryCloneService` (it spawns `git`); the dockerode calls inside
  `DockerContainerService` and `DockerImageService` — their logic is in the mappers,
  which are covered — and the dockerode and tar calls inside the builder's
  `DockerImageBuilderService`; Express, the MCP SDK's transports and axios themselves.
  Testing those means running the real thing behind them: integration testing, a
  separate decision not yet made. Wire code we wrote ourselves (`OllamaLlmClient` on
  `fetch`, the NDJSON reader, and what the builder's `HttpPlatformApiClient` makes of
  the platform's answers) *is* covered, against a stand-in server started by the test
  on `127.0.0.1:0`.
  Also left out: `chat-traces/` — glue over `node:fs` for a developer tool that is off
  in compose, with its record format held by the shared `interfaces.ts` types that
  `replay-recorded-model-call.ts` reads; the pass-through routes (one service call,
  one status), whose rules live in the parsers, the services and the error handler;
  and the build worker's wait between polls — `mock.timers` does not reach a
  `setTimeout` imported by name from `node:timers/promises`, so its tests stop the
  worker while the one task is being claimed and the poll never runs.
- **Time is faked, never waited for:** anything on `Date.now`, `setTimeout` or
  `setInterval` (the sweeper, the registries' staleness, the idle watchdogs, the log
  batcher) runs under `node:test`'s `mock.timers`, so a 30-minute expiry is a one-line
  advance. No clock is injected into production code, and no test sleeps.
- **Routes and middleware are tested over HTTP in-process:** the router under test is
  mounted with `express.json()` and the real `error-handler.ts` on an app listening on
  port 0, called with `fetch`, its services faked; the mounting order is `server.ts`'s
  (`test/routes/http-app-under-test.ts`). The one exception is the host check, called
  through `node:http`: `fetch` silently drops a `Host` header set by the caller.
  The MCP tools are called through a real in-memory MCP client
  (`connectInProcessMcpToolProvider`) over fake services, so a test reads the result
  exactly as a model would.
- **A test file reads as a specification.** It opens with a comment saying what is
  under test and what is faked; tests are flat `test()` calls named as plain sentences
  ("a denied call is refused without a second ask"); assertions are on values — the
  messages the fake model was sent, the events, the result — not on which methods ran.
  One file per source file; a class with several policies gets a folder named after it
  with one file per policy
  (`test/services/ai-agent/tool-calling-chat-orchestrator/model-call-cap.test.ts`).
- **The frontend has no tests yet**; Vitest is the planned follow-up, pure modules first.

## Verification

- Typecheck: `npm run typecheck` in `platform-backend/` (`src/` and `evals/`),
  `builder-service-backend/` or `frontend/`; `npm run build` from `frontend/` also
  checks the bundle.
- Unit tests: `npm test` in `platform-backend/` or `builder-service-backend/`, with no
  Ollama, Docker or WSL. Run with the typecheck after any change under `src/`.
- AI agent: `npm run eval` from `platform-backend/` after any change to the loop,
  the prompt, a tool's name/description/schema or the model. Needs Ollama with the
  config's models pulled, not Docker; 20 s a case on a 4B model, 12 minutes a model,
  more with thinking on; Promptfoo exits 100 on a failed case. Stop the compose
  `ollama` first so one model owns the GPU, and run one model at a time:
  `npm run eval -- --no-cache --filter-providers granite` (a regex on the entry's
  label or id). On `other side closed`
  errors or a silent distro, check `journalctl -u ollama` for `oom-kill` first (the
  `LLAMA_ARG_CACHE_RAM=0` rule under `evals/`), then rerun the errored rows with
  `npm run eval -- --no-cache --filter-pattern '^(id|id|…)$'`; results merge.
  `npm run ask:ai-agent -- "<question>"` runs live against the real daemon; a
  destructive call waits for `y`/`N`, and `echo y | npm run ask:ai-agent -- …`
  scripts it. `npm run dev` and the evals use the native Ollama in the WSL distro
  (`127.0.0.1:11434`), up only while the distro is; nothing boots the distro for a
  chat (the chat is deliberately not coupled to WSL), so a down model server is an
  `llm_unavailable` error event.
- Chat traces: every run writes `platform-backend/chat-traces/<time>-<id>.jsonl`
  (logged as `chat trace: <path>`). To investigate a reply, read its last
  `model_call`: `messages` is what the model was sent, `reply.toolCalls` what it
  asked for, `reply.promptTokens` the prompt size against `OLLAMA_NUM_CTX`.
  `npm run replay:model-call -- chat-traces/<file>.jsonl` re-sends that call (Ollama,
  no Docker) and says whether the reply is the same, or with `--current-prompt`
  whether a prompt change fixed it. `CHAT_TRACE_DIR=` (empty) in `.env` switches
  tracing off.
- Chat endpoint: `curl -N -X POST http://127.0.0.1:3000/api/v1/chat -H "Content-Type: application/json" -d '{"turns":[{"role":"user","text":"which containers are running?"}]}'`
  prints the event stream (`-N` turns curl's buffering off). A second request while
  one runs must get 429; killing the first curl must free the slot within a moment.
  A change request ("stop container X") holds the stream at a `tool_call` with
  `needsApproval`;
  `curl -X POST http://127.0.0.1:3000/api/v1/chat/approvals -H "Content-Type: application/json" -d '{"callId":1,"decision":"approved"}'`
  (204) lets it go on — `tool_approval` then `tool_result` follow. The same call
  answered twice, or a wrong `callId`, gets 409. With `"autoApproveToolCalls":true`
  the stop runs at once (`needsApproval: false`, no `tool_approval`).
- Run locally: `npm run dev` in `platform-backend/` (port 3000), in
  `builder-service-backend/` (no port; it polls the platform) and in `frontend/`.
  Builds need both backend processes up.
- Run containerized: `docker compose up -d --build` from the repo root, in a shell
  with `docker` (WSL, or `wsl -d Ubuntu --cd <repo> -- docker compose ...` from
  Windows). Two services mount `/var/run/docker.sock`: `platform`, from the root
  `Dockerfile` (a frontend build stage, then the backend plus the built UI; build
  context is the repo root), and `builder`, from `builder-service-backend/Dockerfile`, which reaches
  the platform at `http://platform:3000/api/v1`. Env defaults (`HOST=0.0.0.0`,
  `DOCKER_HOST=unix:///var/run/docker.sock`, `STATIC_DIR`, `CHAT_TRACE_DIR=""`) live
  in the Dockerfiles. Compose carries the wiring: `ALLOWED_HOSTS` is
  `localhost,127.0.0.1,platform` and `OLLAMA_URL` is `http://ollama:11434`, both
  compose service names. The UI is published on `127.0.0.1` only: the API has no
  login and controls Docker. `YCP_PORT` in a gitignored `.env` moves the host port
  off 3000. Development stays on `npm run dev`; under compose every change is an
  image rebuild. `.dockerignore` keeps the host's `node_modules` out of the images.
- The assistant under compose: two more services. `ollama` is the `ollama/ollama`
  image, pinned to the version `OllamaLlmClient` was verified against, with **no
  published port**: only the platform talks to it, by service name. Both Ollamas
  share the one GPU; an idle model unloads after 5 minutes. Models live in the
  volume `ycp_ollama-models`. `ollama-model-pull` is the same image run once as the
  CLI (`ollama pull`, `OLLAMA_HOST` pointing at the server), then `Exited (0)` — the
  normal state. The platform has **no
  `depends_on`** on either (the not-coupled rule): before the first pull ends, a chat
  is a 200 stream ending in `llm_request_failed`, `model '…' not found`. Image tag
  and model are `x-` anchors at the top of the file; `OLLAMA_MODEL` in `.env`
  changes it for platform and pull together. **CPU-only as written; the GPU is one
  `.env` line, `OLLAMA_RUNTIME=nvidia`**: the `ollama` service declares
  `runtime: ${OLLAMA_RUNTIME:-}`. Empty drops the key, so `runc` runs the model on
  the CPU and `up` works anywhere. `nvidia` is the runtime the NVIDIA Container
  Toolkit (installed inside the WSL distro) registers in `/etc/docker/daemon.json`;
  `NVIDIA_VISIBLE_DEVICES=all` hands it the GPUs. A runtime, not a device reservation
  (`deploy.resources.reservations.devices`): a block cannot be switched off per
  machine. No code path knows the difference; `docker exec ycp-ollama-1 ollama ps`
  shows where the model landed
  (`100% GPU`). The first chat after a start waits about a minute for the model to
  load. CPU mode is untuned: minutes per answer on a desktop CPU, and a slow CPU or
  long prompt can outlast the 120 s idle watchdog (accepted).
- End-to-end build test repo: `https://github.com/Yiftach128/cloudplatform-build-test`
  (a 2-file nginx repo made for this).
- The Docker daemon runs in WSL2 Ubuntu on `tcp://127.0.0.1:2375`. The IPv4 bind is
  mandatory — WSL's localhost relay does not forward IPv6/dual-stack listeners.
- WSL does not auto-start; the platform backend self-heals. `WslDockerDaemon` in
  `platform-backend/src/services/wsl/wsl-docker-daemon.ts` boots the distro when a
  request finds the daemon dead, retries once, and holds the distro open while the
  server runs; `DOCKER_WSL_KEEPALIVE=0` disables the hold. Its `wsl.exe` children are
  spawned `windowsHide: true`: one sharing the backend console can break Ctrl+C for
  the whole terminal. Never `detached` — a console-less `wsl.exe` opens its own
  visible console window. New spawns stay `windowsHide` or short-lived. Ctrl+Break
  (SIGBREAK) is a registered fallback stop key; the server logs
  `<signal> received, shutting down...`, so a dead keyboard is not mistaken for a
  hung shutdown. A cold request takes ~10s (startup is slowed ~7-20s by Docker 29's
  TLS deprecation warning). Scripts that bypass the backend must boot WSL themselves:
  `wsl -d Ubuntu -e true`, then poll `http://127.0.0.1:2375/_ping`.
