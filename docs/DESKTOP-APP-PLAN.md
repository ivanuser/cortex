# Cortex Synapse — Desktop App Plan

> **Goal:** Build native Windows and Linux desktop apps that provide full node capabilities (canvas, screen, camera, notifications) — matching what the macOS OpenClaw app already does.
>
> **Status:** ✅ Phases 0–2, 4–7 COMPLETE. Phase 3 (All-in-One) planned for Q2 2026.
> **Current Version:** v0.12.2 (March 12, 2026)

## The Problem

OpenClaw's ecosystem has a gap:

- **macOS/iOS** → Native apps with full capabilities (canvas host, screen capture, camera, notifications, location)
- **Windows/Linux** → `openclaw-node` CLI only — headless, no GUI, no canvas, no screen capture
- **Web UI (Cortex)** → Admin + chat interface, but runs in a browser — can't access system-level APIs

This means Windows and Linux users are second-class citizens. They can chat and manage, but the AI agent can't:

- See their screen
- Show them interactive canvases
- Take photos
- Send native OS notifications
- Control their desktop

## The Solution: Cortex Synapse

A native desktop app for Windows and Linux that:

1. ✅ **Chat interface** with streaming, thinking indicators, tool cards, and markdown
2. ✅ **Runs as a node** connecting to the gateway with full capabilities
3. ✅ **Hosts canvas** via native WebView with full window chrome
4. ✅ **Captures screen** for the AI agent to see
5. ✅ **Accesses camera** (front/back)
6. ✅ **Sends native notifications**
7. ✅ **Lives in system tray** for always-on presence
8. ✅ **File Manager** for workspace file browsing, upload, and download
9. ✅ **Multi-gateway profiles** with add/edit/switch/delete
10. ✅ **Auto-update** with signed bundles
11. ✅ **Local execution** — agents run system commands natively (`system.run`)
12. ✅ **Task Panel** — autonomous task execution with scheduling
13. ✅ **F#%$-it Mode** — auto-approve all agent commands for full autonomy
14. ✅ **Voice/TTS** — Web Speech API + KittenTTS local AI engine
15. ✅ **Approval bridge** — report decisions back to gateway audit trail
16. ✅ **Task recovery** — running tasks survive gateway reconnects
17. ✅ **Multi-Agent System** — agent registry, summon protocol, shared memory, identity cards
18. ✅ **Agent Network** — onboarding, permissions/RBAC, cross-agent memory, inter-agent communication
19. ✅ **Group Chat** — multi-agent conversations with sequential turn-taking and remote agent routing
20. ✅ **Activity Feed** — real-time event logging for agent actions and system events
21. ✅ **CLI Auto-Update** — automatically update OpenClaw CLI when version is too old
22. 📋 **Can optionally run the gateway** itself (all-in-one mode) — Phase 3

## Technology: Tauri v2

| Criteria         | Electron                           | Tauri v2                      | Winner              |
| ---------------- | ---------------------------------- | ----------------------------- | ------------------- |
| Binary size      | ~150MB                             | ~10-15MB                      | Tauri               |
| Memory usage     | ~200MB+                            | ~30-50MB                      | Tauri               |
| Security model   | Full Chromium (big attack surface) | Minimal, explicit permissions | Tauri               |
| WebView          | Bundled Chromium                   | System WebView2/WebKitGTK     | Tauri               |
| Backend language | Node.js                            | Rust                          | Tauri (performance) |
| Frontend         | Any web framework                  | Any web framework             | Tie                 |
| Screen capture   | desktopCapturer API                | Via xcap/scrap crate          | Tie                 |
| Camera           | Via native modules                 | Via nokhwa crate              | Tie                 |
| System tray      | Yes                                | Yes (built-in)                | Tie                 |
| Auto-updater     | electron-updater                   | Built-in                      | Tauri               |
| Cross-compile    | Tricky                             | Supported                     | Tauri               |
| Maturity         | 10+ years                          | v2 stable (2024)              | Electron            |
| Brand alignment  | "Another Electron app"             | "Lightweight & secure"        | Tauri               |

**Decision: Tauri v2.** Aligns with Cortex's security-first identity. Lighter, faster, smaller. The frontend is our existing Svelte UI — zero rewrite needed.

## Architecture

```
┌─────────────────────────────────────────────┐
│              Cortex Synapse                  │
│                                              │
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │  Tauri Rust   │  │   Svelte Frontend    │ │
│  │  Backend      │  │                      │ │
│  │              │  │  • Chat w/ streaming  │ │
│  │  • Node WS   │◄─┤  • Tool cards        │ │
│  │    Client    │  │  • File Manager      │ │
│  │  • Screen    │  │  • Node Settings     │ │
│  │    Capture   │──►│  • Gateway Panel     │ │
│  │  • Camera    │  │  • Profile Switcher  │ │
│  │  • Canvas    │  │  • Notifications     │ │
│  │  • Tray Icon │  │  • Keyboard Shortcuts│ │
│  │  • Notifs    │  │  • Agent Network     │ │
│  │  • FS Access │  │  • Group Chat        │ │
│  │  • Updater   │  │  • Activity Feed     │ │
│  │  • Agent Reg │  └──────────────────────┘ │
│  │  • Group Chat│                           │
│  │    Manager   │  ┌──────────────────────┐ │
│  │  • Activity  │  │   Canvas WebView     │ │
│  │    Log       │  │   (secondary window) │ │
│  │  • Gateway   │  └──────────────────────┘ │
│  │    (planned) │                           │
│  └──────────────┘                           │
│         │                                    │
│         │ Dual WebSocket                     │
│         ▼                                    │
│  ┌──────────────┐                           │
│  │   Gateway     │ (local or remote)        │
│  │   :18789      │                           │
│  │               │                           │
│  │  WS 1: webchat (chat messages)           │
│  │  WS 2: node (capabilities + RPC)        │
│  └──────────────┘                           │
└─────────────────────────────────────────────┘
```

### Dual WebSocket Design

Synapse maintains **two simultaneous WebSocket connections** to the gateway:

1. **Webchat connection** — handles chat messages, session management, streaming responses
2. **Node connection** — registers capabilities (canvas, screen, camera), handles RPC commands

Both authenticate via `ctx_` API token. This separation allows the chat and node systems to operate independently.

### Two Operating Modes

**1. Client Mode (connect to existing gateway)** ✅ IMPLEMENTED

- App connects to a remote or local gateway via WebSocket
- Registers as a node with full capabilities
- User gets full chat UI + native OS integration
- Lightweight — just the app, gateway runs elsewhere

**2. All-in-One Mode (embedded gateway)** 📋 PLANNED

- App spawns and manages the gateway process locally
- Everything in one package — no separate install needed
- Best for single-user setups
- Gateway runs as a child process, managed by the app

## Node Capabilities

| Capability      | Status | Implementation                                     |
| --------------- | ------ | -------------------------------------------------- |
| `canvas`        | ✅     | Tauri secondary WebView window with OS chrome      |
| `screen`        | ✅     | `xcap` crate for screenshots and recording         |
| `camera`        | ✅     | `nokhwa` crate for photo/video capture             |
| `notifications` | ✅     | Tauri notification plugin                          |
| `system`        | ✅     | Shell execution + approval bridge + exec approvals |
| `browser`       | 📋     | CDP browser control (planned)                      |
| `location`      | 📋     | Platform-specific APIs (planned)                   |

## Implementation Progress

### ✅ Phase 0: PoC — Tauri + Svelte Chat (COMPLETE - Feb 24)

- [x] Scaffold Tauri v2 project with Svelte 5 frontend
- [x] WebSocket connection to gateway
- [x] Chat streaming with real-time display
- [x] Build and run on Linux and Windows
- [x] System tray icon with quit/show/hide

### ✅ Phase 1: Node Registration + Canvas (COMPLETE - Feb 25-26)

- [x] Dual WebSocket: webchat + node connections
- [x] Node registration with capabilities: `["canvas", "screen", "camera"]`
- [x] Canvas host: secondary WebView window with full OS chrome
- [x] Handle canvas commands (present, navigate, eval, snapshot)
- [x] Native notifications for agent messages
- [x] RPC handler at App level (survives panel switches)

### ✅ Phase 2: Screen Capture + Camera (COMPLETE - Feb 26)

- [x] Screen capture using `xcap` crate
- [x] Respond to `screen_record` node commands
- [x] Camera access using `nokhwa` crate
- [x] Respond to `camera_snap`, `camera_list`, `camera_clip` commands
- [x] Node settings panel with enable/disable toggle
- [x] Auto-node detection on gateway side (v3.10.8)

### 📋 Phase 3: All-in-One Mode (PLANNED - Q2 2026)

- [ ] Bundle `openclaw-cortex` gateway (or invoke via npm)
- [ ] "Start Gateway" / "Stop Gateway" in gateway panel
- [ ] Gateway process management (spawn, monitor, restart on crash)
- [ ] First-run wizard: configure API keys, set up agent
- [ ] Gateway logs viewable in the app

### ✅ Phase 4: Distribution + Auto-Update (COMPLETE - Feb 27)

- [x] Windows: `.msi` installer (WiX) + `.exe` installer (NSIS)
- [x] Linux: `.deb` + `.rpm` + `.AppImage`
- [x] Auto-updater with signed update bundles (Tauri built-in)
- [x] GitLab CI pipeline: build-linux, build-windows, publish-update, create-release
- [x] Update endpoint: `update.json` auto-generated and committed by CI
- [x] Updater signing key (minisign) for tamper-proof updates
- [x] Proper app icons (Cortex branding)
- [x] Start on boot option (autostart plugin)
- [x] Minimize to tray on close

### ✅ Phase 5: Autonomous Work Companion (COMPLETE - Feb 27 – Mar 2)

**Goal**: Transform Synapse from a chat client into a full autonomous work companion

#### v0.10.x — Chat Polish & UX (Feb 27-28)

- [x] Chat export, search, thinking display, session delete
- [x] Smart auto-scroll with word count and scroll-to-bottom indicator
- [x] Command palette (`Ctrl+K`) for quick actions
- [x] Message reactions (👍/👎)

#### v0.11.0 — Local Execution (Feb 28)

- [x] `system.run` capability — agents execute local shell commands
- [x] `system.which` — check for installed binaries
- [x] `system.notify` — native OS notifications from commands
- [x] Local file browser (browse Desktop, Downloads, Documents, Pictures)
- [x] Task Panel — autonomous task execution with scheduled tasks
- [x] Cross-platform `system.run` (spawn binary directly on all platforms)

#### v0.11.1–v0.11.3 — Sentry Integration (Feb 28)

- [x] `@sentry/svelte` error tracking integration
- [x] Session Replay (100% on error, 0% normal sessions)
- [x] Internal IP for Sentry DSN (Cloudflare tunnel blocks envelope API)
- [x] Windows `system.run` cross-platform fix
- [x] Local files forbidden path fix, device capture dropdown contrast fix

#### v0.11.4–v0.11.7 — CI + Platform Fixes (Feb 28 – Mar 1)

- [x] Windows CI cache-nuke (Test-Path before Remove-Item)
- [x] Nuke cached Tauri binary before build (stale binary fix)
- [x] Task completion status fix (sessionKey canonicalization)
- [x] Machine context injection into task prompts
- [x] Hostname-based node display names + richer platform metadata

#### v0.11.8–v0.11.9 — F#%$-it Mode (Mar 1)

- [x] **F#%$-it Mode**: Auto-approve all agent commands — full autonomous operation
- [x] Blinking F#%$-it Mode badge in header bar with hide option
- [x] F#%$-it auto-approve moved to `App.svelte` (always mounted, survives panel switches)
- [x] Hostname-based node display names

#### v0.11.11–v0.11.12 — Task Scheduling (Mar 1)

- [x] Schedule tasks for later with presets (15min, 1h, tomorrow, custom datetime)
- [x] Task completion when TaskPanel is not visible (background task tracking)

#### v0.11.13–v0.11.15 — Canvas Fixes (Mar 1)

- [x] Canvas snapshot: native window capture via `xcap` crate + JavaScript fallback
- [x] Canvas white screen fix on Linux (WebKitGTK initialization issue)

#### v0.11.16 — Approval Bridge + TTS Foundation (Mar 1)

- [x] Approval bridge to gateway (`exec.approval.report` RPC integration)
- [x] TTS foundation: Web Speech API integration for voice output

#### v0.11.17 — Voice/TTS (Mar 1)

- [x] TTS speak button on messages + settings panel
- [x] Canvas blank screen additional fix

#### v0.11.18 — Task Recovery (Mar 1–2)

- [x] Task recovery on gateway reconnect — running tasks survive connection drops

#### v0.11.19–v0.11.20 — TTS Fixes (Mar 2)

- [x] TTS speak button rendering fixes (non-reactive guard removal, own styling)

#### v0.11.21 — KittenTTS (Mar 2)

- [x] **KittenTTS integration**: Local AI text-to-speech engine
- [x] Python ONNX runtime with 8 voice models
- [x] Rust backend bridge for native performance
- [x] Fully offline voice synthesis — no cloud dependency

### ✅ Phase 6: Multi-Agent System + Agent Network (COMPLETE - Mar 2 – Mar 8)

**Goal**: Transform Synapse from a single-agent chat client into a multi-agent orchestration platform

#### v0.11.22–v0.11.30 — KittenTTS Hardening (Mar 2–3)

- [x] Hide cmd windows on Windows for KittenTTS subprocess
- [x] Auto-install `espeak-ng` dependency with KittenTTS
- [x] AudioContext unlock on user gesture + error feedback
- [x] Python discovery: Windows py launcher, pyenv scan, Python 3.10-3.12 constraint
- [x] Windows backslash path escaping in Python scripts
- [x] Venv isolation to avoid PEP 668 externally-managed-environment errors

#### v0.11.35 — Exec Approval Commands (Mar 4)

- [x] `system.execApprovals.get` and `system.execApprovals.set` node commands
- [x] Remote approval state management via RPC

#### v0.11.36–v0.11.38 — UI Overhaul + Canvas Fixes (Mar 4–5)

- [x] **Cyberpunk HUD aesthetic** — full UI overhaul with new visual language
- [x] Enable `webview-data-url` Tauri feature for canvas support
- [x] Base64 → blob URL conversion for WebKitGTK image compatibility
- [x] Image rendering diagnostic logging and fixes

#### v0.11.38–v0.11.61 — Multi-Agent System (Mar 5–8)

Massive feature: **~5,100 new lines across 25 files, 14 new Svelte components, 3 new Rust modules, 20+ new Tauri commands.**

**Phase 1: Agent Registry + Summon Protocol**

- [x] SQLite-backed agent registry (`agents.db`) with full agent metadata
- [x] Agent identity cards with cyberpunk styling (name, avatar, accent color, personality)
- [x] Summon protocol — agents can summon other agents for collaboration
- [x] Agent status tracking (online/offline) with heartbeat keep-alive

**Phase 2: Gateway Integration**

- [x] Agent announcement to gateway on connect (sub-gateway discovery)
- [x] Sync agent identities (including base64 avatars) to gateway
- [x] Conversation-based agent setup flow

**Phase 3: Shared Memory + Agent Wizard**

- [x] Cross-agent shared memory system (personal, shared, collaborative memory types)
- [x] 6-step guided agent onboarding wizard (1,813 lines)

**Phase 4: Permissions & Access Control**

- [x] SQLite RBAC permission system with toggle matrix
- [x] Agent groups for permission management

**Phase 5: Inter-Agent Communication**

- [x] Real summon routing with notification UI
- [x] Agent-to-agent message delivery

**Phase 6: Polish & Activity Feed**

- [x] Activity feed component with event logging
- [x] Status badges and keyboard shortcuts
- [x] NETWORK.md template for network context

#### v0.11.62–v0.11.87 — Agent Chat Pipeline (Mar 8–10)

Extensive work to get agent-to-agent chat working end-to-end through the OpenClaw CLI:

- [x] CLI path discovery: nvm hardcoded paths, PATH injection for agent subprocesses (v0.11.76–77)
- [x] Agent chat response parsing: handle both `payload` and `data` keys, extract text from `payloads[]` (v0.11.74–75)
- [x] Show correct agent names in chat sessions (v0.11.78)
- [x] Agent avatar + name display in chat messages (v0.11.79)
- [x] Write bootstrap files (AGENTS.md, SOUL.md) to local agent workspace (v0.11.80)
- [x] Register agents in local `openclaw.json` for correct CLI workspace resolution (v0.11.81)
- [x] `workspace-{id}` path convention to match OpenClaw defaults (v0.11.82)
- [x] Kill entire process tree on shutdown + auto-free stale ports (v0.11.83)
- [x] Windows `CommandExt` import fix for `creation_flags` (v0.11.84)
- [x] `agents.list` array format fix in `openclaw.json` (v0.11.85)
- [x] Parse both payloads response formats from CLI (v0.11.86)
- [x] `agent:{id}:chat` session key format for CLI invocation (v0.11.87)

### ✅ Phase 7: Group Chat + Activity Feed (COMPLETE - Mar 10–12)

**Goal**: Multi-agent group conversations with real-time turn-taking and remote agent routing

#### v0.11.88–v0.11.89 — Activity Feed + CLI Auto-Update (Mar 10)

- [x] **Activity Feed** wired up with automatic event logging (`ActivityFeed.svelte`)
- [x] Rust `ActivityLog` backend with JSON persistence (`activity.json`, FIFO 500 entries)
- [x] Activity events logged from gateway context (chat, agent actions, system events)
- [x] Toggle activity feed sidebar (`Ctrl+Shift+F`)
- [x] **CLI auto-update on startup**: Synapse detects when the OpenClaw CLI version is too old and auto-runs `npm update -g openclaw` before connecting

#### v0.11.90–v0.11.91 — Auto-Update Threshold + Agent Session Naming (Mar 10)

- [x] Auto-update CLI version threshold bumped (→ 3.10.31, then 3.10.32)
- [x] Re-detect CLI path after auto-update completes
- [x] Agent sessions show the **agent's name** in the sidebar (not generic session IDs)

#### v0.11.92 — Windows npm Discovery (Mar 10)

- [x] Find `npm` on Windows for CLI auto-update (search Program Files + common install paths)

#### v0.11.93 — Summon UX Improvements (Mar 10)

- [x] **Summon auto-switches to chat**: when an agent is summoned, the UI automatically navigates to the chat panel
- [x] Card chat button wired up: click "Chat" on an agent's identity card to open a chat session

#### v0.11.94 — Multi-Agent Group Chat Backend (Mar 10–11)

- [x] **Group chat with sequential turn-taking**: send a message and all participating agents respond one by one
- [x] Agents see each other's replies — conversation context (last 20 messages) included in each prompt
- [x] Real-time UI updates via Tauri `group-message` event emission
- [x] Error handling: if an agent fails to respond, a system message shows the error
- [x] Agents prompted to "respond naturally" in conversational style

#### v0.11.95–v0.11.96 — Windows CLI Fixes (Mar 11)

- [x] Windows CLI batch argument fix: bypass `.cmd` wrappers by invoking `node.exe` directly
- [x] Find `node.exe` in Program Files + sanitize batch arguments for Windows shell
- [x] Allow remote agents in group chat participants

#### v0.11.97 — Network-Wide Agent Discovery (Mar 11)

- [x] Group chat agent picker shows **all agents across the network** (gateway + local merged)
- [x] Fetch remote agents via gateway WebSocket RPC alongside local agent registry

#### v0.11.98 — Group Chat Persistence (Mar 11)

- [x] **JSON file persistence** for group chat sessions (`~/.openclaw/group-chats.json`)
- [x] Groups survive app restarts — load on startup, save after every mutation
- [x] **Delete groups** from the group list panel
- [x] Debounce group creation to prevent duplicate rapid-fire creates
- [x] Group list with time-ago display and participant badges

#### v0.11.99 — Gateway Agent Fetch Fix (Mar 11)

- [x] Fix `sendRpc` import in `App.svelte` for fetching agents from gateway

#### v0.12.0 — Agent Identity in Group Picker (Mar 11)

- [x] **Agent identity names + emoji badges** in group chat agent picker
- [x] Pull display names and emoji from agent registry instead of raw IDs
- [x] Visual agent picker with accent colors and identity cards

#### v0.12.1 — Remote Agent Routing (Mar 12)

- [x] **Remote agent routing through gateway WebSocket** in group chat
- [x] `is_local_agent()` check: reads `openclaw.json` to determine if agent has a local workspace
- [x] Local agents: routed through CLI (`process_remote_chat_request`)
- [x] Remote agents: routed through main gateway WebSocket (`send_chat_via_gateway`)
- [x] Global `GATEWAY_WS` sink for sending RPC messages on the node WebSocket
- [x] Response channel system (`RESPONSE_CHANNELS`) with oneshot receivers for async RPC responses
- [x] 120-second timeout for remote agent responses with cleanup

#### v0.12.2 — Session Key Fix (Mar 12)

- [x] Fix session key prefix: use `agent:` not `group:` for correct workspace resolution
- [x] Ensures agent chat sessions route to the right workspace directory

## Feature Summary (v0.12.2)

### Chat

- Real-time streaming with live thinking indicator (animated bouncing dots)
- Tool activity cards showing real-time tool calls
- Inline image rendering (camera snaps, screenshots, generated images)
- Image attachments (drag & drop or paste)
- Markdown rendering with code blocks
- Message reactions (👍/👎)
- Chat export to file
- Chat search across conversations
- Thinking display for reasoning models
- Message history persisted across sessions
- Keyboard shortcuts: `Ctrl+N` new chat, `Ctrl+Shift+C` copy last, `Ctrl+K` command palette, `Ctrl+/` reference

### Voice / TTS

- **Web Speech API**: Browser-native text-to-speech with system voices
- **KittenTTS**: Local AI voice engine — Python ONNX runtime, 8 voice models, Rust backend
- TTS speak button on each message
- Voice settings panel (engine selection, voice picker)
- Fully offline — no cloud TTS dependency
- Hardened Python discovery (pyenv, venv isolation, Windows py launcher)

### Multi-Agent System

- **Agent Registry**: SQLite-backed agent database with full metadata (name, avatar, accent color, model, personality, status)
- **Identity Cards**: Cyberpunk-styled agent cards with avatars, emoji badges, and accent colors
- **Agent Onboarding**: 6-step guided wizard for creating and configuring new agents (1,813 lines)
- **Summon Protocol**: Agents can summon other agents — auto-switches to chat panel on summon
- **Agent Status**: Online/offline tracking with heartbeat keep-alive
- **Gateway Sync**: Agent identities (including avatars) announced and synced to gateway on connect
- **Bootstrap**: Writes AGENTS.md and SOUL.md to new agent workspaces automatically
- **Agent Sessions**: Show agent names in sidebar (not raw session IDs)

### Group Chat

- **Multi-agent group conversations**: Create named groups with any combination of agents
- **Sequential turn-taking**: All agents respond one-by-one, seeing each other's messages
- **Network-wide agent discovery**: Picker shows all agents across gateway + local registry
- **Agent identity in picker**: Names, emoji badges, accent colors from agent identity system
- **Local + remote routing**: Local agents via CLI, remote agents via gateway WebSocket RPC
- **JSON persistence**: Groups saved to `~/.openclaw/group-chats.json`, survive restarts
- **Group management**: Create, delete, end sessions; add/remove participants
- **Real-time updates**: Tauri event emission (`group-message`) for live UI refresh
- **Conversation context**: Last 20 messages included in agent prompts for coherent responses
- **Error resilience**: Failed agent responses shown as system messages, don't block other agents

### Activity Feed

- **Event logging**: Automatic logging of agent actions, chat events, system events
- **Rust backend**: `ActivityLog` with JSON persistence (`activity.json`), FIFO capped at 500 entries
- **Sidebar panel**: Toggle with `Ctrl+Shift+F`, shows recent events in reverse chronological order
- **Gateway integration**: Events logged from gateway context (agent connections, RPC calls)

### Permissions & Access Control

- SQLite RBAC permission system with toggle matrix
- Agent groups for permission management
- Per-agent capability controls

### Cross-Agent Memory

- Personal, shared, and collaborative memory types
- Memory entries searchable across agents

### Task System

- **Task Panel**: Autonomous task execution (Cowork-style)
- **Task scheduling**: Schedule tasks for later (15min, 1h, tomorrow, custom datetime)
- **Task recovery**: Running tasks survive gateway reconnects
- **F#%$-it Mode**: Auto-approve all agent commands — full autonomous operation
- Blinking mode badge in header with hide option

### Local Execution

- `system.run` — agents execute local shell commands natively
- `system.which` — check for installed binaries
- `system.notify` — trigger native OS notifications from commands
- `system.execApprovals.get` / `system.execApprovals.set` — remote approval state management
- Local file browser (Desktop, Downloads, Documents, Pictures)
- Cross-platform execution (Linux + Windows)
- Process tree cleanup on shutdown + stale port auto-free

### CLI Auto-Update

- Detects OpenClaw CLI version on startup
- Auto-runs `npm update -g openclaw` when version is below threshold
- Re-detects CLI path after update completes
- Windows npm discovery (searches Program Files + common install paths)

### Approval Bridge

- Report approval decisions back to gateway audit trail
- `exec.approval.report` RPC integration
- Synapse approvals visible in gateway audit page

### File Management

- File Manager panel with browse/upload/download
- Local file browser for common directories
- Tauri native file dialog + HTML fallback for uploads
- Binary file support via base64 encoding

### Canvas

- Canvas host via native WebView with full OS chrome
- Canvas snapshot: native window capture via `xcap` + JS fallback
- White screen fix on Linux (WebKitGTK)
- `webview-data-url` Tauri feature enabled
- Base64 → blob URL conversion for WebKitGTK compatibility

### Profiles & Settings

- Multi-gateway profile system (add, edit, switch, delete)
- Gateway panel with connection status and auto-start toggle
- Node settings with capability toggles
- Notification controls (enable/disable)
- TTS engine and voice settings

### System Integration

- System tray with minimize-to-tray
- Native OS notifications
- Auto-reconnect with exponential backoff
- Auto-update with signed bundles
- Sentry error tracking + Session Replay
- Smart auto-scroll with word count indicator
- Command palette (`Ctrl+K`)
- Cyberpunk HUD aesthetic UI

### Monitoring

- Sentry error tracking (`@sentry/svelte`)
- Session Replay (100% on error, inputs masked)
- Internal IP DSN for LAN ingest

## CI/CD Pipeline

```
main branch push
    │
    ├── build-linux (GitLab runner)
    │   ├── .deb package
    │   ├── .rpm package
    │   └── AppImage → uploaded to package registry (too large for artifacts)
    │
    ├── build-windows (dev05 runner)
    │   ├── .msi + .msi.zip + .sig
    │   └── .exe (NSIS) + .nsis.zip + .sig
    │
    ├── publish-update (uploads to GitLab package registry)
    │   ├── Generates update.json from build artifacts
    │   └── Commits update.json to repo
    │
    └── create-release (tag-triggered)
        └── Creates GitLab release with all artifacts
```

### CI Notes

- **Linux**: Builds `.deb` + `.rpm` only; AppImage build skipped in CI (linuxdeploy/FUSE fails in CI environment)
- **AppImage**: When built, uploaded to GitLab package registry (>50MB artifact limit)
- **Windows**: Tauri CLI verified before build; explicit target architecture argument

### CI Variables

- `TAURI_SIGNING_PRIVATE_KEY` — minisign private key for update signing
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — key password (empty for current key)
- `CI_API_TOKEN` — GitLab PAT for API access and package registry

### Update Endpoint

- URL: `https://gitlab.honercloud.com/llm/cortex-synapse/-/raw/main/update.json`
- Format: Tauri v2 updater JSON with per-platform download URLs and signatures

## Repository

- **GitLab**: https://gitlab.honercloud.com/llm/cortex-synapse (project ID: 100)
- **Tech stack**: Tauri v2 + Svelte 5 + TypeScript + Rust
- **Build**: `npm run build` (wraps `tauri build`)
- **Dev**: `npm run dev` (wraps `tauri dev`)

## Key Source Files (v0.12.2)

| File                              | Purpose                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `src-tauri/src/lib.rs`            | Tauri commands: group_create, group_send_message, group_delete, activity_log, etc.  |
| `src-tauri/src/gateway.rs`        | Gateway WS client, remote agent routing (`send_chat_via_gateway`, `is_local_agent`) |
| `src-tauri/src/group_chat.rs`     | GroupChatManager with JSON persistence, session CRUD, message history               |
| `src-tauri/src/agent_registry.rs` | SQLite agent registry (AgentInfo with identity metadata)                            |
| `src-tauri/src/activity_log.rs`   | ActivityLog with JSON persistence, FIFO 500 entries                                 |
| `src/App.svelte`                  | Main app shell, group chat UI, agent picker with gateway fetch                      |
| `src/lib/GroupChatPanel.svelte`   | Group chat conversation panel with real-time message display                        |
| `src/lib/GroupListPanel.svelte`   | Group list with create/delete/open, time-ago display                                |
| `src/lib/ActivityFeed.svelte`     | Activity feed sidebar with event display                                            |
| `.gitlab-ci.yml`                  | CI builds: deb+rpm (AppImage skipped), Windows MSI+NSIS                             |

## What's Next for v1.0

1. ✅ ~~Voice/TTS integration~~ — Web Speech API + KittenTTS — **DONE**
2. ✅ ~~Chat export~~ — save conversations to file — **DONE**
3. ✅ ~~Chat search~~ — search across past conversations — **DONE**
4. ✅ ~~Multi-Agent System~~ — registry, summon, shared memory, permissions — **DONE**
5. ✅ ~~Group Chat~~ — multi-agent conversations with remote routing — **DONE**
6. ✅ ~~Activity Feed~~ — real-time event logging — **DONE**
7. **Auto-update end-to-end testing** — verify update banner + one-click install
8. **Improved markdown** — better code blocks, tables, syntax highlighting
9. **KittenTTS voice expansion** — additional voice models and quality tuning
10. **Browser capability** — CDP browser control from desktop app
11. **All-in-One Mode** — embedded gateway for zero-config setup (Phase 3)
12. **Group chat streaming** — stream agent responses in real-time (currently waits for full response)
13. **Group chat @mentions** — direct messages to specific agents within a group

---

_Cortex Synapse v0.12.2 — March 12, 2026_
_From concept to multi-agent orchestration platform in 16 days._
