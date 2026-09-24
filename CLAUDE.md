# Yiftach Cloud Platform

Self-hosted cloud control panel, built as three standalone npm packages — no workspaces.
The platform backend lives in `platform-backend/` (Node 24 + TypeScript, ESM, no build
step — Node strips types natively, so imports use real `.ts` extensions). The builder
service lives in `builder-service-backend/` (same Node 24 + TS style — a headless worker
that performs image builds; no HTTP server). The frontend lives in `frontend/`
(React 19 + TypeScript + Vite, Ant Design UI).

## Code conventions

- **Types live in `interfaces.ts`, not in service files.** Each service folder (e.g.
  `platform-backend/src/services/docker/`) keeps its public interfaces and type aliases
  in an `interfaces.ts` file next to the implementation. Service files import from it and
  contain only implementation. Exception: private types that describe a third-party
  library's wire format (e.g. dockerode response shapes) stay in the implementation
  file so `interfaces.ts` never depends on the underlying library.
- **One class per file.** Every class gets its own file, named after the class in
  kebab-case (`DockerApiError` → `docker-api-error.ts`). Classes never live in
  `interfaces.ts` — it holds only types.
- **Names say what the thing does, even when that makes them long.** A file or
  function name must tell a reader its job on its own:
  `run-tool-with-error-mapping.ts`, `tool-result-value-formatters.ts`,
  `toJsonToolResult` — not `run-tool.ts`, `tool-format.ts`, `toToolResult`. A generic
  verb or noun carrying the whole name (`run`, `format`, `handle`, `helpers`) is the
  sign it is too short. Files are still named after their export in kebab-case, and
  a new folder is welcome when it groups a real kind of thing (e.g.
  `src/mcp/server/tool-results-utils/`).
- **Always indent with 4 spaces (not 2).** Applies to all hand-written source and
  config files. Exception: `package.json` stays as npm writes it (2 spaces), since
  npm reformats it on every install.
- **Never put a service file directly in `src/`.** Every service lives in a domain
  folder under `src/services/` (e.g. `src/services/docker/docker-manager-service.ts`).
  Only entry points (like `server.ts`, `main.ts`) belong at the `src/` root; startup
  wiring lives in `src/config/config.ts`. The folders beside `services/` are the
  ways *into* the services, not services themselves: `routes/` + `middleware/` (REST,
  plus `server-sent-events/` for the one route that answers with a stream) and, in
  the platform backend, `mcp/` (MCP).
- **Folders depend downward only — no import cycles.** Each package has one import
  direction; a folder never imports from one above it (skipping a level downward is
  fine). Platform backend: `routes/`, `middleware/`, `mcp/` → `services/`, and nothing
  under `services/` imports from those three; `routes/` → `server-sent-events/` →
  `services/` (it imports only `ai-agent/` and `llm/`, for the events and the
  failures it maps); `evals/`, which sits *beside* `src/`,
  imports from `src/` and nothing in `src/` imports from it (the `test/`-folder
  relationship); inside `mcp/`, `client/` → `server/`; inside `services/`: `validation/` → `builds/`, `build-agents/` →
  `docker/` ← `wsl/`, `validation/` → `ai-agent/` (for `ChatTurn`, the type its chat
  parser returns), and `ai-agent/` → `llm/` (`docker/`, `build-agents/`, `images/`
  and `llm/` import no other service folder, `ai-agent/` imports only `llm/`, and
  only the front doors import `validation/`); inside `llm/`, a provider subfolder
  (`ollama/`) imports the folder root, never the reverse. Builder: `worker/` → `platform/`, `git/`, `docker/`, which import
  neither each other nor `worker/`. Frontend: `pages/` → `components/` → `hooks/` →
  `fetchers/`. When a lower folder needs something from a higher one, it declares an
  interface the higher one implements (`docker/`'s `DockerDaemonLifecycle`,
  implemented by `wsl/`; `ai-agent/`'s `ToolProvider`, implemented by `mcp/client/`)
  instead of importing upward. A new folder states its place
  in the chain here when it is added.
- **Each backend keeps its startup configuration in `src/config/config.ts`.** The
  module loads `.env` itself at the top of the file (ESM import hoisting evaluates it
  before any entry-point statement runs, so env must be loaded here, not in the entry
  point), declares `export interface IConfig` in-file — a deliberate exception to the
  types-live-in-`interfaces.ts` rule — and exports an eager
  `export const config: IConfig = { ... }` whose UPPER_SNAKE keys mirror the env var
  names exactly (`config.DOCKER_HOST`), resolved with the sanctioned `||` defaulting
  (`process.env.X || 'default'`; numbers as `Number(process.env.X || '2000')`), ending
  with `console.log('config:', config);`. Only the entry point imports it
  (`import { config } from './config/config.ts';`) and passes values into service
  constructors — services never read `process.env` and never import the config module.
- **Routes are thin — one file per endpoint.** Each endpoint gets its own file in
  `src/routes/`, named `<method>-<name>.ts` (e.g. `get-containers.ts`), exporting a
  factory that takes its service dependencies and returns an Express `Router`. A route
  only translates HTTP ↔ service call; error mapping lives in
  `src/middleware/error-handler.ts`, business logic in services.
- **API routes are versioned.** Every API endpoint is served under `/api/v1/...`
  (e.g. `/api/v1/containers`). Route files declare only the resource path
  (`/containers`); the version prefix is applied once in `server.ts` when mounting,
  so a version bump touches one line. Two exceptions stay unversioned: `/health` — an
  infrastructure liveness probe, not part of the API surface — and `/mcp`, because
  MCP negotiates its own protocol revision and a REST version bump must not break
  the URL MCP clients were configured with.
- **Prefer plain, Java-like code over TypeScript shorthand.** Runtime code should read
  the way it would in Java: explicit type annotations (`Promise<void>`,
  `readonly url: string`), classic control flow (`if {} else {}` with braces), and
  simple method chains (`.filter(...).map(...)`) are the house style. Avoid
  TypeScript/JavaScript-specific shorthand: no ES `#` private members (use the
  `private` keyword), no `??` / `?.` / `??=`, no truthiness defaulting (`x || fallback`),
  and no defaulting inside object literals (`{ all: options.all ?? true }`) — resolve
  each value into a named local with explicit `if`/`else` first, then build the object.
  Type declarations (interfaces, unions, generics, optional `?:` properties) are not
  affected — they have no Java equivalent and stay idiomatic TypeScript.
  Two carve-outs: `src/config/config.ts` env-resolution files may use `||` defaulting
  (`process.env.X || "default"`), and boolean logic with `||`/`&&` inside conditions
  (`if (a || b && c)`) is always fine — the ban covers truthiness *defaulting* for
  value resolution, not boolean tests.

## Platform backend architecture (`platform-backend/`)

Express 5. A request flows route → service → dockerode; errors flow back through the
error handler. MCP is the second way in: tool → service → dockerode, with errors
flowing back through `mcp/server/tool-results-utils/run-tool-with-error-mapping.ts`.
The AI agent is a consumer of that second door, not a third one: agent loop → MCP
client → the same MCP tools. The chat is an ordinary REST route in front of that
agent: `POST /api/v1/chat` → `AiAgentChatService` → agent loop, answered as a
Server-Sent Events stream.

- `src/server.ts` — composition root: imports `src/config/config.ts` (which loads
  `.env` and logs itself — `PORT`, `HOST`, `DOCKER_HOST`, `DOCKER_WSL_KEEPALIVE`,
  `BUILD_STALE_TIMEOUT_MS`, `STATIC_DIR`, `ALLOWED_HOSTS`, and the assistant's
  `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_NUM_CTX`), builds the services, mounts
  the host check first, then `express.json()`, the unversioned `/health` and `/mcp`,
  the routes under `/api/v1`, the static frontend after them, and the error handler
  last. No logic — its one `if/else` picks
  the daemon lifecycle from the endpoint kind: a `tcp://` `DOCKER_HOST` gets the WSL
  daemon, a `unix://` one gets `ExternalDockerDaemon`. The assistant is wired here
  too: `OllamaLlmClient` + the in-process MCP tool provider (one top-level `await`
  — connecting it is a handshake; closed again on shutdown) →
  `ToolCallingChatOrchestrator` → `AiAgentChatService`. Building it contacts neither
  Ollama nor Docker, so the server starts with both down.
- `src/middleware/error-handler.ts` — the only place service errors become HTTP:
  `ValidationError` and malformed JSON → 400, `DockerApiError` → its status,
  `ImagePullError`/`BuildJobNotFoundError` → 404, `ImageNotManagedError` → 409,
  `BuildQueueFullError`/`AiAgentBusyError` → 429, `DockerConnectionError` → 503,
  anything else → 500.
- `src/server-sent-events/` — what `routes/post-chat.ts` needs to answer with a
  stream, kept out of `routes/` so that folder stays the endpoint catalog.
  `ServerSentEventStream` wraps one response: `open()` sends the headers at once
  (the first event may be seconds away), `send(event, data)` writes one event with
  the data as one line of JSON, and both `send` and `close` do nothing once the
  response is over — the reader leaving mid-reply is normal (the Stop button), and
  a write after the end would make Node emit an unhandled `error`.
  `map-agent-failure-to-error-event.ts` is the third error mapper, beside
  `error-handler.ts` and `run-tool-with-error-mapping.ts`: once the stream is open
  the status line is spent, so a failed run ends the stream with an `error` event
  (`llm_unavailable` / `llm_request_failed` / `internal`; the two model-server
  messages pass through untouched — the provider client already says what to
  check). The wire contract lives in its `interfaces.ts`: the agent's `AgentEvent`s
  as they are (`delta`, `tool_call`, `tool_result` — the last two paired by
  `callId`), then exactly one `done`
  (`stopReason`, `modelCalls`, `peakPromptTokens`) or `error`; every event's data
  carries its `type`, which is also the SSE event name. The route's order matters:
  validate (400) → `startRun` (429 when busy) → *then* open the stream, so
  everything refusable up front still gets a real status; `res` `close` aborts the
  run. SSE over a `fetch` POST, not `EventSource` (GET-only).
- `src/middleware/host-check.ts` — answers 403 itself (an HTTP gate, not a service
  error) unless the request's `Host` header names a host in `ALLOWED_HOSTS`
  (comma-separated hostnames, ports ignored; default `localhost,127.0.0.1`) and its
  `Origin` header — when a browser sends one — does too. The API has no login and
  controls Docker, so a browser on this machine is the way past the loopback bind:
  `Host` stops DNS rebinding, `Origin` stops a foreign page firing a body-less POST
  (stop/restart) at localhost, which no CORS preflight guards. Non-browser clients
  (the builder, the healthcheck) send no `Origin` and pass on `Host` alone. It reads
  the raw `Host` header, not `req.hostname`, which would follow `X-Forwarded-Host`
  under `trust proxy`. A client that reaches the platform under a new name needs
  that name in `ALLOWED_HOSTS` — compose adds `platform` for the builder.
- `src/middleware/static-frontend.ts` — serves the built frontend (`STATIC_DIR`,
  Vite's `dist`) from the API's own origin: real files as-is, any other GET gets
  `index.html` (the SPA fallback, Express 5 `/{*splat}`). The fallback never answers
  `/api`, `/health` or `/mcp` paths, so an unknown API path stays a 404 instead of becoming
  HTML with a 200 that an API client would read as success. An empty `STATIC_DIR`
  (the default — local dev, where Vite owns the UI) returns an empty router, which
  keeps the on/off decision out of `server.ts`.
- `src/mcp/` — everything that speaks MCP, split by protocol role: `server/` exposes
  the platform's operations as tools, `client/` consumes them for the AI agent.
- `src/mcp/server/` — the platform's own operations as an MCP server (official
  TypeScript SDK **v2**: `@modelcontextprotocol/server` + `/node`; the v1
  `@modelcontextprotocol/sdk` monolith is not used), served at `ALL /mcp`
  (`routes/all-mcp.ts` — `all` because the protocol owns every method on its
  endpoint: the SDK answers older clients' GET/DELETE with 405 itself). It sits
  beside `routes/`, not under `services/`, because it is the same kind of thing: a
  second thin front door onto the services, holding no business logic of its own.
  One file per tool in
  `tools/` (`tools/<name>-tool.ts`, exporting `register<Name>Tool(server, service)`
  — the folder is the tool catalog the way `routes/` is the endpoint catalog, and
  holds nothing but tools; the `-tool` suffix stays because `get-container.ts`
  and friends already exist in `routes/`), each only translating an MCP call ↔ a
  service call. What the tool files share for producing their results sits in
  `tool-results-utils/`: `run-tool-with-error-mapping.ts` is the only place
  service errors become tool errors (in band, `isError: true` with a message a
  model can act on) — the counterpart of `error-handler.ts`;
  `tool-result-builders.ts` wraps a success (`toJsonToolResult`,
  `toTextToolResult`); `tool-result-value-formatters.ts` shapes raw values for a
  model (short ids, MiB, rounding). The server plumbing (`createPlatformMcpServer`,
  `McpHttpEndpoint`) stays in the `server/` root. The v1 tool set is
  read-only (`list_containers`, `get_container`, `get_container_logs`,
  `get_container_stats`, `list_images`, `get_image`, `list_build_agents`), every
  tool annotated `readOnlyHint` + `idempotentHint`. Results are shaped for a
  language model's context window, not mirrored from REST — the loop gives one
  model turn 6000 characters of tool results, and the raw shapes blew through it
  (18 containers listed = 5.5K, one raw inspect = 4.9K): short ids, MiB instead of
  bytes, ports as `docker ps` strings (`8080->80/tcp`; the daemon's IPv4/IPv6
  twin collapsed — `toPortSummaries`), stats joined to container names, logs as
  plain text capped at 200 lines, and `get_container` answers a diagnostic view
  (`ContainerToolDetails`: state with exit code/OOM/health/restarts, command,
  ports, env *names* only — values may land in a hosted model's context — labels,
  restart policy, mounts, networks, and only the resource limits that are set)
  instead of the raw inspect. **The two container lists show the platform's own
  containers by default**, like the services table's managed-only switch:
  `list_containers` (also filterable by `state`, applied in the daemon) and
  `get_container_stats` take `includeUnmanaged` (default false, decided by
  `is-platform-managed-container.ts`) and always answer an object with the rows
  plus `hiddenUnmanagedCount`, so a model never reads a filtered list as "nothing
  is running"; `get_container` and the logs take any container's name.
  `createPlatformMcpServer` is a factory, not a shared instance, because an MCP
  server binds to one transport; `McpHttpEndpoint` wraps the SDK's
  `createMcpHandler` (per-request, stateless; serves the 2026-07-28 protocol
  revision and falls back to stateless 2025-era serving) and is closed on shutdown.
  The SDK handler is validation-free by design — `host-check.ts`, mounted app-wide,
  is its Host/Origin guard. **The MCP SDK and zod are quarantined in `src/mcp/`**
  (the dockerode rule): zod input schemas are the one sanctioned exception to the
  no-schema-library rule of `services/validation/`, `interfaces.ts` stays free of
  both, and the route sees only `McpHttpEndpoint`. The SDK is newer than most
  documentation — read the installed `.d.mts` types before using an API.
- `src/mcp/client/` — the MCP *client* side (`@modelcontextprotocol/client`), which
  exists so the AI agent gets its tools through MCP without ever seeing the SDK.
  `McpToolProvider` adapts a connected SDK `Client` to the agent's `ToolProvider`
  contract: tools with `readOnly` read from the `readOnlyHint` annotation (absent →
  not read-only, the cautious reading), the server's `instructions` as usage
  guidance, and both MCP failure surfaces — `isError` results and thrown protocol
  errors such as schema-rejected arguments — returned in band, so the model can
  correct itself. `connect-in-process-mcp-tool-provider.ts` links it to a fresh
  `createPlatformMcpServer` over the SDK's `InMemoryTransport` pair, so the built-in
  agent uses exactly the catalog external clients get at `/mcp`, minus the HTTP hop.
  `server.ts` and the evals share that one wiring. **The in-process transport is a
  decision, not a leftover:** MCP is the contract between the agent and the tools,
  the transport a deployment detail — and in this codebase HTTP marks a *process*
  boundary (browser → platform, builder → platform), which the agent and the MCP
  server do not have between them. The SDK labels `InMemoryTransport` "testing and
  development" and suggests a loopback `StreamableHTTPClientTransport` instead; that
  was weighed and declined — a server calling itself would depend on its own port
  and its own `ALLOWED_HOSTS`, need a connection lifecycle per chat, and make
  production run a path the evals do not test. The transport is ~40 lines handing
  each message object to the other end's handler; what it omits (serialization,
  sessions, auth) an in-process link does not need. Because the agent only sees
  `ToolProvider`, swapping the transport stays a one-file change.
- `src/services/llm/` — the provider-agnostic seam to a language model: `LlmClient`
  (`streamChat(request, onDelta, signal)`), the message and tool-call types, and the
  two failures — `LlmUnavailableError` (unreachable, or silent past the idle
  watchdog) and `LlmRequestError` (the server answered with a refusal). Two outputs
  on purpose: `onDelta` streams text fragments for whoever shows progress, while the
  resolved `LlmReply` (full text + tool calls + token counts) is what the loop
  decides on. An abort *resolves* with the partial reply (Stop is not an error — the
  frontend `ChatFetcher` rule). Each provider is a subfolder that keeps its wire
  format to itself: `llm/ollama/` holds `OllamaLlmClient` (plain `fetch` to
  `/api/chat`, no client library; `stream: true`; `num_ctx` always sent, since
  Ollama truncates an over-long prompt silently; temperature 0 so tool choice is
  reproducible; failures arrive as a non-2xx status *or* an `{"error"}` line inside
  a 200 stream, like Docker's progress streams), `ollama-chat-mapper.ts` (the wire
  shapes and the mapping — Ollama delivers tool calls whole, never as partial JSON,
  and wants `tool_name` on result messages) and `read-ndjson-stream.ts` (line
  buffering across network chunks, with streamed UTF-8 decoding so a multi-byte
  character split between chunks survives).
- `src/services/ai-agent/` — `ToolCallingChatOrchestrator`, the hand-written agent
  loop (deliberately no agent framework or AI SDK): conversation + tool schemas →
  model; tool calls are executed and appended as results; repeat until the model
  answers in plain text. Stateless — a run takes the whole conversation
  (`ChatTurn[]`, the frontend's shape) and keeps nothing. It owns the `ToolProvider`
  interface and imports only `llm/`. The defensive policy lives here: a model-call
  cap (6) whose last call offers no tools, forcing an answer
  (`stopReason: 'model_call_limit'`); unknown tools, exact repeats of an executed
  call, and thrown tool errors are fed back in band, never thrown; one model turn
  may carry several calls — an all-read-only batch runs with `Promise.all`, a batch
  containing any other tool runs serially in the order asked, calls past the
  per-turn cap (5) are refused in band, and results always go back in call order,
  one message per call; tool results share a character budget (12000 per run, at
  most half of it per turn, split across the turn's calls —
  `trim-tool-result-to-budget.ts` keeps head + tail); and the conversation has a
  character budget of its own (8000 — what an 8192-token window leaves beside the
  system prompt, a spent tool-result budget and the answer):
  `select-recent-turns-within-budget.ts` gives the model the newest turns that fit —
  the newest always, no gaps, never opening on an assistant turn — because the chat
  UI sends the whole conversation every time and Ollama truncates silently. Progress
  is reported as `AgentEvent`s (`delta` / `tool_call` / `tool_result` — sent as SSE
  events by the chat route as they are); a run numbers its tool calls from 1 in
  the order the model asked, refused ones included, and both events of a call
  carry that `callId` — a concurrent batch reports its results as they finish,
  so a watcher pairs them by id, never by name or position; the
  resolved `AgentRunResult` carries the executed calls and the peak prompt size,
  which is how context pressure is watched. `build-agent-system-prompt.ts` takes
  `now` as a parameter, fixed per run, so every model call of a run shares one
  prefix (prompt-cache reuse). `AiAgentChatService` is the chat route's door to the
  loop and runs one conversation at a time: one GPU, so a second run would only
  queue inside Ollama, silent long enough to trip the 120s idle watchdog — it is
  refused instead (`AiAgentBusyError` → 429). `startRun` is deliberately not `async`:
  the refusal is thrown synchronously, before the route has opened its stream, and
  the slot is freed in a `finally` — answered, failed or aborted. The evals bypass
  it and construct the orchestrator directly.
- `evals/` (beside `src/`, not under it) — terminal entry points that drive the agent
  without HTTP. They stand to `src/` as a `test/` folder would: they import from
  `../src/` and exercise it, nothing in `src/` knows they exist, and they are not
  part of the app — the image copies `src/` only, so the scripts, the canned data
  and the test-double provider never ship. `evals/tsconfig.json` extends the main
  one with `noEmit` (`npm run typecheck` runs both projects); the main
  `tsconfig.json` deliberately keeps building `src/` alone, so `dist/` keeps its
  layout. The scripts build their own services with the do-nothing
  `ExternalDockerDaemon`, so a script never boots or holds the WSL distro.
  `npm run check:tool-choice`
  (`run-tool-choice-check.ts`) runs the cases in `tool-choice-cases.ts` (prompt →
  expected calls with subset-matched arguments, plus allowed extras; includes
  no-tool and multi-tool cases) through the real loop, the configured model and the
  *real* MCP tool catalog, with one substitution — `CannedResultsToolProvider`
  answers every call from `canned-platform-tool-results.ts` — so it needs no Docker
  and scores comparably across runs and models
  (`OLLAMA_MODEL=… npm run check:tool-choice`); exit 1 on a failed case. The
  canned fixtures are typed against the tools' result interfaces
  (`src/mcp/server/interfaces.ts`, plus the service types the image and
  build-agent tools pass through) and serialized by the tools' own
  `renderValueAsToolResultJson`, so a tool whose shape changes breaks the
  typecheck instead of leaving the check testing a shape that no longer exists;
  the canned list and stats apply the managed-only default and the filters too.
  `npm run ask:ai-agent -- "<question>"` asks one question with the tools executed
  for real (Ctrl+C aborts the run). The case list is plain data on purpose: the
  later eval harness loads it rather than replacing it.
- `src/services/docker/` — the daemon-facing services. `DockerManagerService` is the
  typed facade for container operations (list/inspect/create/start/stop/logs/delete);
  `DockerImageService` owns image acquisition and lifecycle (exists-check, registry
  pull, plus list/detail/delete of platform-built images — those labeled
  `cloudplatform.managed=true`; `GET /images/:id` serves the inspect-backed
  `ImageDetails` with exposed ports and the provenance labels, 409 for unmanaged
  images — its `sizeBytes` is deliberately taken from the list endpoint so it
  matches the images table (containerd-store inspect reports compressed content
  size instead); deletes never pass force, so the daemon itself
  refuses in-use images) with its own timeout-less dockerode client, since
  pulls run for minutes — hung streams are caught by
  `drain-progress-stream.ts`'s idle watchdog instead. The manager consumes it
  through the `DockerImageProvider` interface. Both run every daemon request
  through `DaemonRequestRunner`, which asks the daemon lifecycle to boot the
  daemon and retries once when the connection fails (stream draining stays
  outside the runner — never retried). Public types in `interfaces.ts`;
  dockerode/daemon wire shapes are quarantined in `container-mapper.ts`,
  `image-mapper.ts`, `classify-dockerode-error.ts`, and `drain-progress-stream.ts`.
  Image *builds* do not happen in this process — they belong to the builder service.
  `resolve-docker-endpoint.ts` accepts both docker CLI endpoint forms:
  `tcp://host:port` (the WSL deployment) and `unix://<path>` (a mounted socket — the
  resolved `DockerEndpoint.socketPath` is then set and both services hand dockerode
  `{ socketPath }` instead of host/port; `baseUrl` stays a display string either way).
  `ExternalDockerDaemon` is the do-nothing `DockerDaemonLifecycle` for the socket
  deployment (the daemon is somebody else's to keep up).
- `src/services/builds/` — the FIFO build queue the builder service works off:
  `POST /builds` enqueues (202, status `queued`; 429 past 10 waiting jobs) with the
  whole container config riding along (an empty `ports` list means the builder
  resolves published ports from the built image's TCP EXPOSEs after the build —
  nothing published when it has none), plus an optional `imageName` ("name" or
  "name:tag") used as the image tag instead of the generated
  `cloudplatform/build-<owner>-<repo>:<shortid>`; clients poll `GET /builds/:id`. The builder
  claims the oldest queued job via `POST /builds-queue/claim` (204 when empty; the
  claim also fire-and-forgets a WSL daemon warm-up), appends progress lines via
  `POST /builds-queue/:id/logs`, creates the container through the normal
  `POST /containers`, and reports via `POST /builds-queue/:id/result` (the first
  terminal status wins). A running job untouched for 10 minutes
  (`BUILD_STALE_TIMEOUT_MS`) is failed by the sweeper so the UI never hangs; finished
  jobs expire after 30 minutes; a restart forgets all jobs (pollers get 404, and the
  builder abandons in-flight work on that same 404).
- `src/services/build-agents/` — `BuildAgentRegistry`, the in-memory presence map
  the Build Agents page reads: builders report via `POST /build-agents/heartbeat`
  (`{name, status: idle|building, currentJobId?, startedAt}`, upserted by name,
  always 204) and the UI lists via `GET /build-agents`. Offline is derived at list
  time (silent past 30s → `offline`, its stale `currentJobId` dropped); records
  silent past 30 minutes are pruned lazily inside `listAgents()` — no sweeper, so
  no start/stop wiring in `server.ts`; a restart forgets all agents until their
  next beat.
- `src/services/validation/` — hand-rolled request-body validators (no schema
  library), one function per endpoint body, throwing `ValidationError` (→ 400).
  The container name/ports/env field rules live once in `parse-container-fields.ts`,
  shared by the create-container and start-build parsers. `parse-chat-request.ts`
  guards against junk, not against long conversations (that is the agent's history
  window): at most 100 turns, the last one a `user` turn of at most 4000 characters
  — the one turn the window always keeps, so the one whose size must be bounded.
  Consecutive `user` turns are valid: the UI drops a reply that failed before its
  first fragment.
- `src/services/wsl/` — the WSL deployment adapter for the docker service's
  daemon-lifecycle contract. `WslDockerDaemon` implements `DockerDaemonLifecycle`:
  boots the WSL distro on demand and holds it open (operational details under
  Verification); `bootstrapWslDocker` builds it and starts a background warm-up.
  Wired only for a `tcp://` endpoint — the WSL ping uses `fetch`, which cannot speak
  to a unix socket.

## Builder service architecture (`builder-service-backend/`)

A headless polling worker — no HTTP server, so no routes and no error handler; the
backend code conventions apply. It runs alongside the platform via `npm run dev`, or
as its own container (its `Dockerfile`; the `builder` service in the root
`docker-compose.yml`) — a separate container on purpose, so an unverified clone never
touches the platform's filesystem. One task at a time: claim → clone → build →
resolve ports → create container → report, then poll again.

- `src/main.ts` — entry point; `src/config/config.ts` — env-driven `config`
  (`IConfig`), loads `.env` and logs itself at import (`PLATFORM_API_URL`,
  `DOCKER_HOST` — `tcp://host:port` or `unix://<path>`, with `DOCKER_SOCKET_PATH`
  or else `DOCKER_HOST_NAME`/`DOCKER_HOST_PORT` parsed fail-fast from it (the side
  that does not apply is `undefined`) — `POLL_INTERVAL_MS`, `WORKSPACE_DIR`, `GIT_CLONE_TIMEOUT_MS`, `AGENT_NAME` —
  defaults to the machine hostname — and `HEARTBEAT_INTERVAL_MS`; defaults suit
  local dev).
- `src/services/platform/` — `PlatformApiClient`, the only door to the platform API
  (axios, styled after the frontend's `DockerFetcherService`; axios never leaks).
  A 404 on a job-scoped call becomes `BuildJobLostError` — the single abandon signal
  (the platform restarted and forgot the job).
- `src/services/git/` — `GitCloneService` shallow-clones with the git CLI
  (`--depth 1 --single-branch --no-tags`, prompts disabled, `--` before the URL,
  killed at `GIT_CLONE_TIMEOUT_MS`) and reads the clone's HEAD commit
  (`readHeadCommit`, via `git rev-parse`). The host running the builder needs
  `git` on PATH.
- `src/services/docker/` — `ImageBuilderService` streams the cloned directory
  (minus `.git`) to the daemon as a tar build context (BuildKit, `version: '2'`,
  labels the image `cloudplatform.managed=true` plus the caller's `extraLabels` —
  the worker passes the build provenance: `cloudplatform.repo-url`, `.git-ref`
  (only when a `#ref` was given), `.commit`, and `.build-job-id`; the frontend's
  image-detail page reads these, so keep the names in sync with
  `frontend/src/components/image-details.tsx`). The daemon never runs git.
  `drain-progress-stream.ts` and `decode-buildkit-log-line.ts` here are deliberate
  copies of the platform's docker-folder logic (`drain-progress-stream.ts` exists in
  both packages **byte-identically** — no workspaces, so edits must touch both).
- `src/services/worker/` — `BuildWorker` (the serial loop; always deletes the clone
  workspace in `finally`), `LogBatcher` (flushes log lines to the platform about
  once a second; records a 404 instead of throwing from the timer), and
  `PortResolver` (when the job's container config carries no ports, resolves them
  from the built image's TCP EXPOSEs via the platform API — host = container port
  bumped past taken ports, the frontend `port-defaults.ts` policy; no TCP EXPOSE
  publishes nothing), and `HeartbeatReporter` (posts the agent's presence to
  `POST /build-agents/heartbeat` every `HEARTBEAT_INTERVAL_MS` on an unref'd timer,
  plus an immediate beat on every idle↔building transition — `BuildWorker` calls
  `setBuilding(jobId)` entering `processTask` and `setIdle()` in its `finally`.
  Deliberately a dedicated call, not a claim-poll side effect, so long builds never
  look offline; send failures are swallowed silently, matching the quiet claim
  loop).

## Frontend architecture

The code conventions above apply to the frontend too (components take the place of
classes; JSX files use `.tsx`).

- `src/pages/` — one thin page per route, like backend route files: they only compose
  components. Routing lives in `App.tsx` (react-router): a pathless layout route renders
  `components/app-layout.tsx` (AntD sidebar + `<Outlet />`); menu keys are the route paths.
- `src/components/` — one component per file (e.g. `container-list.tsx`).
- `src/fetchers/` — all backend API access. `DockerFetcherService` (axios) throws only
  `DockerFetcherError`, so axios never leaks into components. `ChatFetcherService` is
  the one fetcher on plain `fetch` — a streamed reply has to be read while it
  arrives, which is `fetch`'s response body — and throws only `ChatFetcherError`. Wire types in
  `fetchers/interfaces.ts` mirror the platform backend's `interfaces.ts`, except
  JSON-serialized fields (backend `Date` → frontend ISO `string`).
- **Route navigation renders a real anchor.** Anything the user clicks to go somewhere
  — sidebar menu items, breadcrumb crumbs, table-cell links, navigation buttons, the
  wizard's source cards, overview node cards — must be an `<a href>` so ctrl+click and
  middle-click open a new tab: react-router `<Link>` where antd styles anchors in
  context (Menu labels, Breadcrumb titles) or around card-like blocks (with
  `color: 'inherit'`), and antd `Typography.Link`/`Button` with `href` plus an
  `onClick` delegating to `components/link-click.ts`'s `navigateOnPlainClick` so a
  plain left click stays an SPA navigation. Imperative `navigate()` is reserved for
  post-action redirects (after a create/delete succeeds) and `<Navigate>` guards.
  Table rows can't be anchors, so every data cell wraps its content in the row's
  `<Link>` styled by `.app-row-link` (index.css), which swallows the cell padding so
  the whole row surface is one continuous link that reads as plain text. Cells with
  their own interactions (the platform-built image link, the action buttons) skip the
  wrapper; only the primary cell's link is tabbable (the rest get `tabIndex={-1}`);
  every cell link stops propagation, and the row keeps its whole-row `onClick` as the
  fallback for the leftover surface.
- **Skeletons only when there is nothing to show; re-fetches are silent.** A view renders
  a loading `Skeleton` only while it has no data yet — first load, or navigation to a
  *different* entity. Once content is on screen, re-fetches keep the stale content
  rendered and swap it when fresh data arrives; a failed re-fetch shows a non-destructive
  `Alert` above the kept content (cleared by the next success) instead of replacing it.
  Only an initial-load failure may replace the body with an error alert. The mechanism is
  `src/hooks/use-fetched-data.ts` — component fetches go through it rather than
  hand-rolling `useEffect` + disposed flags (`requestKey` carries the entity
  identity; `resetOnKeyChange` chooses reset-to-skeleton vs. keep-stale when it changes,
  e.g. the new-container wizard keeps the current form while a newly picked image's
  prefill loads; `pollIntervalMs` adds a slow silent re-fetch cadence, e.g. the
  container table's row refresh). Polling that needs more than a cadence — cursors,
  error backoff, accumulation (`container-logs-panel.tsx`, `build-progress-panel.tsx`)
  — keeps its own timeout loop instead, but follows the same skeleton-per-session and
  inline-alert rules. One such loop is shared: `src/hooks/use-container-stats.ts`
  polls `GET /containers/stats` (success → 3s, silent failure → 10s backoff, no
  alert) for the services table, the overview graph, and the container details
  page's Resources block.
- The GitHub source in the new-container wizard submits the build **and** the container
  config in one `POST /builds`; the builder service creates the container server-side,
  so the wizard only watches the job (`queued` → `running` → terminal) and navigates to
  My Services when it succeeds. It never calls `POST /containers` for that source. Its
  ports section starts with no rows — empty means the builder auto-publishes the built
  image's EXPOSEd TCP ports (or nothing when it EXPOSEs none).
- Clicking a My Images row opens `/images/:imageId` (short id in the URL — the daemon
  resolves it as an id prefix): `components/image-details.tsx`, fed by
  `GET /api/v1/images/:id`, showing the basics, the EXPOSEd ports, and the builder's
  provenance labels (repository link, branch/tag, commit, build job). The wizard's
  create-from-image deep link (`?image=`) uses the same endpoint to pre-fill the
  ports rows from the image's TCP EXPOSEs (host port = container port, like presets;
  best-effort — a failed lookup just leaves the default empty row).
- The Overview page (`/overview`) draws the deployment topology with ReactFlow
  (`@xyflow/react`): GitHub repo → image → container, one column each.
  `components/overview-graph-builder.ts` is the pure assembly + layout step — stable
  node ids and deterministic hand-rolled positions (no layout library), with registry
  images absent from `GET /images` synthesized from the container rows.
  `overview-graph.tsx` polls both lists via `use-fetched-data` (15s) plus the shared
  `use-container-stats` 3s loop, overlaying samples without touching
  positions so the pan/zoom viewport never resets. Node cards are real links
  (container → `/services/:name`, managed image → `/images/:id`, repo → GitHub in a
  new tab), kept clickable by the canvas's no-op `onNodeClick` — xyflow strips
  pointer events from nodes with no interaction props, so removing that handler
  makes every node card inert; the managed-only Switch matches the services table. The custom node cards
  style themselves inline (square, grey) — ReactFlow is not antd, so its control
  chrome is squared in `index.css`, not via tokens.
- The Build Agents page (`/build-agents`) is a read-only status table
  (`components/build-agent-list.tsx`, polling `GET /build-agents` via
  `use-fetched-data` every 5s): Name, Status (antd `Badge` — idle/building/offline,
  the `build-progress-panel.tsx` style), Uptime (`components/agent-format.ts`'s
  `formatUptime` from the agent's reported `startedAt`; "—" when offline), and
  Last seen. No detail page behind the rows, so none of the row-link machinery.
- The assistant chat is a docked right-hand column of the app frame, mounted in
  `app-layout.tsx` *outside* the `<Outlet />`, so a conversation survives route
  changes. It pushes the page aside instead of floating over it: the chat quotes
  what is on screen (rows, logs, tool results), and the floating corner card it
  started as covered exactly that (the table's right columns, the overview graph's
  container column, the logs pane). `components/chat-docked-column.tsx` is only
  the shell — an antd `Layout.Sider` as the frame's third column
  (`collapsedWidth={0}`, `trigger={null}`; `transition: none`, like the rest of
  the app's click feedback), sticky at viewport height like the sider on the
  left, its header row on `app-layout-constants.ts`'s `headerRowHeight` so the
  divider under it continues the one line across the screen (the constants have
  their own file because the layout imports the column, and the column importing
  the layout back would be a cycle). It opens at 380px and is sized by dragging
  its left edge — `chat-column-resize-handle.tsx`, a 6px strip over the border
  line that captures the pointer on press, clamps to 320px and 60% of the
  viewport, is the ARIA window splitter (a focusable `role="separator"`:
  Left/Right step 16px, Home/End go to the limits) and resets to 380 on
  double-click; there is no expand button, the drag is the control. The width is
  remembered by `chat-column-width-storage.ts` in `sessionStorage` with a
  `localStorage` fallback — the tab's own entry wins for the life of the tab,
  a new tab starts at the width last dragged anywhere, every write goes to
  both stores, every access wrapped so blocked storage only costs the default
  width; that session-then-local policy is written once, in
  `session-storage-with-local-storage-fallback.ts`, which the open-state
  store below shares — and re-clamped on read, since the window may have
  shrunk. Closed means collapsed to zero width, never unmounted: antd clips a
  zero-width sider's children, the frame inside keeps the open width so the
  clipped messages never reflow (the history, a reply still streaming and the
  list's scroll position survive), and the `inert` attribute takes it out of
  hit-testing, the tab order and the accessibility tree. Nothing listens for
  outside clicks: the column closes only through its X or the mascot. The
  header's other button, "Delete conversation" (a red trash icon — it must
  read as deletion, not as "new"), empties the chat (stopping a reply still
  streaming) through the panel's `ChatPanelHandle` — the shell asks over the
  panel's `ref`, the panel acts, so the panel stays the conversation's owner;
  it exists because a reload no longer clears the chat. The launcher
  is `chat-mascot-button.tsx`: the bare 72px mascot (`public/chatbot-badge.svg`, an
  `<img>` like `preset-icon.tsx`) as an antd `Button` stripped of its box inline
  (transparent background, no border or shadow — inline so antd's hover background
  loses to it; what remains of antd is the click handling and the keyboard focus
  ring; with no box to signal a button, the hover/focus grow in `index.css`'s
  `.app-chat-mascot` is the affordance), with no caption — an antd `Tooltip`
  "YCP Assistant" to its right on hover, and the same text as the button's
  `aria-label` (the row-action icon-button pattern), is how it is named. Its
  left edge sits on the menu icons' line (the robot's drawn edge, not its
  transparent image box: the drawing sits 11px inside the image, so the image is
  pulled left by that much), but it is pinned to the bottom of the screen inside the
  left sider, which is why that sider is sticky at viewport height too, with the
  empty stretch of sider between it and the menu. It has no on/off marker on
  purpose: the menu's selected bar means "the page you are on", and the open
  column is the only sign the assistant is on. The open/closed state lives in `app-layout.tsx`,
  the one place that renders both, and is remembered by
  `chat-column-open-storage.ts` the way the width is (sessionStorage first,
  localStorage as the fallback), so a reload brings the column back as it was
  and a new tab starts as the last tab left it. `chat-panel.tsx` owns the conversation
  (messages + composer) and knows nothing about where it is mounted, so a
  different shell (the floating card it started in) is a one-file swap. The
  conversation survives a reload: `chat-conversation-storage.ts` writes the
  message list to `sessionStorage` on every change (streamed fragments
  included) and the panel reads it back at mount. `sessionStorage`, not
  `localStorage`, on purpose: per tab, so two tabs never overwrite each other's
  chat, a ctrl+click tab starts empty, and closing the tab is the end of the
  conversation. The width and the open state are the two things that may
  outlive a tab: they are preferences, not content, so their `localStorage`
  copy is all the app leaves durably in the browser. The backend keeps no
  conversation, so this is the only copy. The key is versioned and every message is checked field by field
  (a junk entry starts empty, never crashes the first render); a reply that was
  still streaming at reload restores as `stopped` with its running tags dashed
  — the reload closed the response and the backend aborted the run on that
  close, the Stop case, nothing to reattach to. Message ids continue from the
  last restored message. It talks
  to the `ChatFetcher` interface (`fetchers/interfaces.ts`):
  `streamReply(turns, onEvent, signal)` — streaming-shaped from the start; an abort
  resolves (Stop is not an error), failures reject with `ChatFetcherError`.
  `ChatFetcherService` (wired in `App.tsx`) is the real one: `POST /api/v1/chat`
  with the conversation (only the newest 100 turns — the backend's cap), the reply
  read as Server-Sent Events by `read-server-sent-events-stream.ts` (a
  `getReader()` loop, since `EventSource` is GET-only; line and UTF-8 buffering
  across chunks like the backend's `read-ndjson-stream.ts`). `delta`, `tool_call`,
  `tool_result` and `done` go to `onEvent` as they are (`ChatReplyEvent`); the
  stream must end with `done` — an `error` event rejects with its
  message, and so does a body that ends with neither (the backend went away). A
  non-2xx before the stream (400, 429 "busy", 403) rejects with the error handler's
  `message`. The browser never calls an LLM provider directly. The panel folds
  each event into the reply message it belongs to (`applyReplyEvent`): text
  fragments grow `text`, and the tool events grow `toolCalls` — one `ChatToolCall`
  per call, paired to its result by `callId`, never by name or position (a
  concurrent batch reports results as they finish). The turns sent back stay
  `{role, text}`: tool calls are not part of the history the model reads.
  **Tool-call tags** (`chat-tool-call-tags.tsx`) draw that list above the reply
  text, in call order: one antd `Tag` per call, labeled with the raw MCP tool name
  plus its primitive arguments (`chat-tool-call-formatters.ts`) — the raw name on
  purpose, it is where a reader sees which tool the model reached for — a spinner
  while it runs, a check or a cross once its result is in, and a dash when the
  reply ended first (settling the reply, on Stop or a failure, settles every
  still-running call as `stopped`). Clicking a tag (or Enter/Space — it is a
  focusable `role="button"`) opens `chat-tool-call-details.tsx` under the row:
  the arguments as JSON and the result text exactly as the model read it, on the
  log panes' dark monospace surface, height-capped and scrolling inside the 380px
  column — inline rather than a `Popover`, so it scrolls with the conversation; it
  carries `.app-log-output`, so its text is selectable. The "Thinking…"
  placeholder shows only while the reply has neither text nor a running tag. Of
  `done`, the UI shows one thing: a `model_call_limit` stop reason becomes a small
  note under the reply; the call and token counts stay off the UI (they are for
  the evals and the logs). Assistant replies are rendered as markdown
  — the format models answer in — by `chat-reply-markdown.tsx` (`react-markdown` +
  `remark-gfm` for tables + `remark-breaks`, so a model's single newline stays a
  line break); user messages stay plain text, exactly as typed. A reply can quote
  tool results (container logs, image labels), so it is treated as untrusted: raw
  HTML is never interpreted (no `rehype-raw` — keep it that way), `<img>` is
  disallowed (an image is fetched without a click, which would let a log line
  carry what the model read to a foreign server), and links open in a new tab
  (`chat-reply-markdown-link.tsx`). The component is memoized on the text, because
  every streamed fragment re-renders the whole message list. The element styling
  is `.app-chat-markdown` in `index.css` (bare elements, not antd — the ReactFlow
  situation), sized for the 380px column: code blocks wrap like the log panes, and
  a table is the one block that may scroll sideways.
- The dev server proxies `/api` → `http://127.0.0.1:3000` (`vite.config.ts`); the backend
  deliberately has no CORS middleware, so never call the backend origin directly. The
  fetcher's base URL is the relative `/api/v1`, which is also what lets the app image
  serve the built UI and the API from one origin with no frontend changes.
- App-wide look and feel is set via antd `ConfigProvider` theme tokens in `main.tsx` —
  prefer tokens over CSS overrides of `.ant-*` classes.
- UI chrome is never text-selectable. `index.css` sets `user-select: none` on `body`;
  only copyable content opts back in with `user-select: text` — form fields, table
  *body* cells (headers/column names stay chrome), description values, alert text,
  `.app-log-output` (the log panes), and `.app-chat-message` (chat message text).
  Buttons re-disable selection so row actions
  inside table cells stay chrome. New chrome (buttons, menus, cards, breadcrumbs,
  table headers) needs no work — it inherits none; a new surface that displays
  copyable values must join the opt-in list in `index.css`.

## Verification

- Typecheck: `npm run typecheck` (from `platform-backend/`, `builder-service-backend/`,
  or `frontend/`); `npm run build` from `frontend/` also verifies the bundle. In
  `platform-backend/` it covers two projects: `src/` and `evals/`.
- AI agent: `npm run check:tool-choice` from `platform-backend/` (needs Ollama up and
  the `OLLAMA_MODEL` pulled — no Docker; about 80s on a 4B model) after any change to
  the agent loop, the system prompt, a tool's name/description/schema, or the model;
  `npm run ask:ai-agent -- "<question>"` for a live run against the real daemon.
  For `npm run dev` and the evals, Ollama runs natively in the WSL distro (systemd
  service, `127.0.0.1:11434` — compose brings its own, see Run containerized), so it
  is up only while the distro is — and nothing boots the distro for a chat (only a
  failed Docker request does): the chat is deliberately not coupled to WSL, a down
  model server is an `llm_unavailable` error event.
- Chat endpoint: `curl -N -X POST http://127.0.0.1:3000/api/v1/chat -H "Content-Type:
  application/json" -d '{"turns":[{"role":"user","text":"which containers are
  running?"}]}'` prints the event stream as it arrives (`-N` turns curl's own
  buffering off). A second request while one runs must get 429; killing the first
  curl must free the slot within a moment (the disconnect aborts the run).
- Run locally: `npm run dev` in `platform-backend/` (port 3000) and in
  `builder-service-backend/` (no port — it polls the platform), `npm run dev` in
  `frontend/`. Builds need both backend processes up.
- Run containerized: `docker compose up -d --build` from the repo root, in a shell
  that has `docker` (here: WSL, or `wsl -d Ubuntu --cd <repo> -- docker compose ...`
  from Windows). Two services with `/var/run/docker.sock` mounted: `platform`
  (the root `Dockerfile` — a frontend build stage, then the backend plus the built
  UI; build context is the repo root) and `builder`
  (`builder-service-backend/Dockerfile`, which finds the platform at
  `http://platform:3000/api/v1`). Container env defaults (`HOST=0.0.0.0`,
  `DOCKER_HOST=unix:///var/run/docker.sock`, `STATIC_DIR`) live in the two
  Dockerfiles; compose carries only the wiring — which includes the platform's
  `ALLOWED_HOSTS` (`localhost,127.0.0.1,platform`), because `platform` is a compose
  service name, and `OLLAMA_URL` (`http://ollama:11434`) for the same reason. The
  UI is published on `127.0.0.1`
  only, on purpose — the API has no login and controls Docker. `YCP_PORT` (a
  gitignored `.env` next to the compose file) moves the host port off 3000. Compose
  is for running the app; development stays on `npm run dev`, since every code
  change there means an image rebuild. The `.dockerignore` files keep the host's
  `node_modules` (built for the host OS) out of the images.
- The assistant under compose: two more services, no application code. `ollama` is
  the stock `ollama/ollama` image, pinned to the version `OllamaLlmClient`'s wire
  format was verified against, with **no published port** — only the platform talks
  to it, by service name, which is also why it coexists with the native Ollama that
  `npm run dev` and the evals use (they share the one GPU: Ollama unloads an idle
  model after 5 minutes). Models live in the named volume `ycp_ollama-models`.
  `ollama-model-pull` is the same image run once as the CLI (`ollama pull` with
  `OLLAMA_HOST` pointing at the server), then `Exited (0)` — the normal state; about
  2 s when the model is already there. The platform deliberately has **no
  `depends_on`** on either (the not-coupled rule above): until the first pull ends,
  a chat is a 200 stream ending in `llm_request_failed` with Ollama's
  `model '…' not found`. What two services must agree on — the image tag and the
  model — is written once, as `x-` anchors at the top of the file; `OLLAMA_MODEL` in
  the `.env` swaps the model for the platform and the pull together. **The file is
  CPU-only as written; the GPU is one `.env` line, `OLLAMA_RUNTIME=nvidia`**: the
  `ollama` service declares `runtime: ${OLLAMA_RUNTIME:-}` — empty, Compose drops
  the key and the daemon's default `runc` runs the model on the CPU, so `up` works
  on any machine; `nvidia` picks the runtime the NVIDIA Container Toolkit
  registers, which hands the container the GPUs its own `NVIDIA_VISIBLE_DEVICES=all`
  asks for. The runtime rather than a device reservation
  (`deploy.resources.reservations.devices`) on purpose: a reservation is a block,
  Compose interpolates scalars only, so it could not be switched off per machine,
  and on a Docker without the toolkit it makes `up` fail outright — which is why it
  once needed an override file of its own (`docker-compose.gpu.yml`, since
  removed). No code path knows the difference — Ollama picks the device
  (`docker exec ycp-ollama-1 ollama ps` says which: `100% GPU`, 3.9 GB of VRAM with
  the 8192 context). The host side is the NVIDIA Container Toolkit inside the WSL
  distro (it registers the `nvidia` runtime in `/etc/docker/daemon.json`; the
  Windows driver covers the rest). Measured on the GTX 1660 Ti: the first chat
  after a start waits about a minute for the model to load, after that a tool call
  comes back in 4 s and an answer takes about 20 s — the native Ollama's range.
  CPU mode is a fallback that is not tuned: measured here at about 2 tokens/s,
  5 minutes for a containers answer (first token after 48 s, inside the client's
  120 s idle watchdog — a slower CPU or a longer prompt can outlast it, which is
  accepted).
- End-to-end build test repo: `https://github.com/Yiftach128/cloudplatform-build-test`
  (a 2-file nginx repo that exists for exactly this).
- The Docker daemon runs in WSL2 Ubuntu on `tcp://127.0.0.1:2375` (IPv4 bind is
  mandatory — WSL's localhost relay does not forward IPv6/dual-stack listeners).
- WSL does not auto-start, but the platform backend self-heals: `WslDockerDaemon`
  (`platform-backend/src/services/wsl/wsl-docker-daemon.ts`) boots the distro when a
  request finds the daemon dead, retries once, and holds the distro open while the
  server runs (`DOCKER_WSL_KEEPALIVE=0` disables the hold-open). Its `wsl.exe`
  children are spawned with `windowsHide: true` on purpose: a `wsl.exe` sharing the
  backend terminal's console can flip that console's input modes and interfere with
  Ctrl+C for the whole terminal. Don't switch it to `detached` — a console-less
  `wsl.exe` allocates its own *visible* console window. Keep any new `wsl.exe`
  spawn `windowsHide` (or short-lived) for the same reason. Ctrl+Break (SIGBREAK)
  is a registered fallback stop key, and the server logs
  `<signal> received, shutting down...` so a dead keyboard is distinguishable from
  a hung shutdown. A cold request takes
  ~10s (daemon startup is deliberately slowed ~7-20s by Docker 29's TLS deprecation
  warning). The build queue also warms the daemon on every claim. Standalone scripts
  that bypass the backend must still boot WSL themselves: `wsl -d Ubuntu -e true`,
  then poll `http://127.0.0.1:2375/_ping`.
