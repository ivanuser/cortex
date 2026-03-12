# 🧠 CORTEX — Project Plan

**Version:** v3.10.33
**Date:** March 12, 2026
**Author:** Ivan Honer
**Repository:** https://gitlab.honercloud.com/llm/cortex-fork
**Status:** Production Ready

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Completed Milestones](#4-completed-milestones)
5. [Current State](#5-current-state)
6. [Active Development](#6-active-development)
7. [Roadmap](#7-roadmap)
8. [Key Technical Decisions](#8-key-technical-decisions)
9. [Infrastructure](#9-infrastructure)
10. [Links](#10-links)

---

## 1. Project Overview

### What Cortex IS

**Cortex** is a security-hardened fork of [OpenClaw](https://github.com/openclaw/openclaw) that provides a comprehensive AI assistant command center with a cyberpunk-themed web interface. It's not a hypothetical system — it's built, deployed, and running in production.

**Key differentiators from OpenClaw:**

- **Security-first design**: Role-based access control (RBAC), device pairing with Ed25519 identities, audit logging, and scoped API tokens
- **Cyberpunk UI**: Dark, neon-accented interface with 8 theme presets + custom theme support
- **Production ready**: Docker registry, npm package distribution (`openclaw-cortex`), installer scripts
- **Desktop companion**: Native Tauri v2 app (Cortex Synapse) for Windows/Linux with system integration
- **Complete documentation**: Comprehensive guides and configuration reference

**Distribution channels:**

- **npm package**: `openclaw-cortex` — Gateway + embedded Cortex UI
- **Docker**: Registry at `gitlab.honercloud.com:5050/llm/cortex-fork`
- **GitLab CI/CD**: Automated builds and releases
- **GitHub mirror**: Secondary public repo at `github.com/ivanuser/cortex`

### The Problem It Solved

OpenClaw's built-in Control UI was functional but limited — a small Lit-based admin panel focused on configuration rather than user experience. Cortex provides:

1. **Rich chat experience** with markdown rendering, syntax highlighting, LaTeX math, and Mermaid diagrams
2. **Comprehensive admin interface** with 16 dedicated pages for all gateway management
3. **Security hardening** with audit trails, role-based access, and device pairing
4. **Modern UX** with PWA support, keyboard shortcuts, browser notifications, and mobile responsiveness
5. **Desktop integration** via the Synapse companion app

## 2. Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            CORTEX ECOSYSTEM                             │
│                                                                         │
│  ┌─────────────────┐    ┌──────────────────────────┐    ┌─────────────┐ │
│  │   Web Browser   │    │        Gateway            │    │ Node Worker │ │
│  │   (Cortex UI)   │◄──►│  ┌──────────────────────┐ │◄──►│ (headless)  │ │
│  │                 │    │  │  Control Plane        │ │    │             │ │
│  │  • Chat         │    │  │  • Cortex Web UI      │ │    │ • Exec      │ │
│  │  • Admin Pages  │    │  │  • Agent Engine       │ │    │ • Browser   │ │
│  │  • PWA          │    │  │  • Session Manager    │ │    │ • Camera    │ │
│  │  • Auth         │    │  │  • Model Router       │ │    │ • Screen    │ │
│  └─────────────────┘    │  │  • Channel Adapters   │ │    │ • Canvas    │ │
│                         │  │  • Memory System      │ │    └─────────────┘ │
│  ┌─────────────────┐    │  │  • Cron Scheduler     │ │           ▲        │
│  │ Cortex Synapse  │    │  │  • Security Layer     │ │           │        │
│  │ (Desktop App)   │◄──►│  │  • RBAC Engine        │ │      WebSocket     │
│  │                 │    │  │  • Audit Logger       │ │     Connection     │
│  │ • Native Chat   │    │  └──────────────────────┘ │                    │
│  │ • System Tray   │    └──────────────────────────┘                    │
│  │ • Notifications │           ▲                                         │
│  │ • Auto-reconnect│           │                                         │
│  └─────────────────┘           │ Port 18789                              │
│                           (WS + HTTP)                                    │
│  ┌─────────────────┐           │                                         │
│  │ Discord/Telegram│◄──────────┘                                         │
│  │ WhatsApp/Slack  │                                                     │
│  │ Signal/IRC      │                                                     │
│  └─────────────────┘                                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

**Gateway (Node.js)**

- OpenClaw core with embedded Cortex UI
- Serves both the web interface and API
- Manages all LLM provider connections
- Enforces security policies and RBAC
- Routes messages across all channels

**Cortex UI (SvelteKit 2 + Svelte 5)**

- Static adapter — compiles to pure HTML/CSS/JS
- Served by gateway or standalone (Docker/npm)
- 16 admin pages covering all gateway functionality
- Real-time WebSocket communication
- Progressive Web App (PWA) with offline support

**Synapse Desktop (Tauri v2 + Svelte)**

- Native app for Windows and Linux
- Dual WebSocket connections: webchat (chat) + node (capabilities)
- Full node registration with canvas, screen, and camera capabilities
- System tray integration and native OS notifications
- Auto-reconnect with connection management
- File Manager for workspace file browsing and uploads
- Multi-gateway profile switching
- Auto-update via signed update bundles

**Sentinel (Future)**

- Distributed AI security agents
- Each node runs an AI agent monitoring its host
- Central coordinator correlates threats across the network
- Concept doc: `/home/ihoner/projects/cortex-sentinel/CONCEPT.md`

## 3. Tech Stack

### Frontend

- **SvelteKit 2** with static adapter
- **Svelte 5** with runes for reactive state
- **Tailwind CSS** for styling with cyberpunk theme variables
- **TypeScript** in strict mode
- **Vite** as the build tool

### Content Rendering

- **marked** for Markdown processing with GFM support
- **Shiki** for syntax highlighting (30+ languages)
- **KaTeX** for mathematical expressions
- **Mermaid** for diagrams and flowcharts
- **Prism** for code highlighting fallback

### Backend (Gateway)

- **Node.js 22+** runtime
- **OpenClaw** core engine (forked)
- **WebSocket** for real-time communication
- **SQLite** for session and audit storage

### Desktop (Synapse)

- **Tauri v2** framework (Rust + WebView)
- **Rust** backend with system integration
- **System WebView** (WebView2 on Windows, WebKitGTK on Linux)
- **Svelte frontend** (shared with web UI)

### Infrastructure

- **Docker** with multi-stage builds
- **GitLab CI/CD** with instance runners
- **GitLab Container Registry** (port 5050)
- **GitLab Pages** for documentation
- **npm** for package distribution

## 4. Completed Milestones

### ✅ Phase 0: Proof-of-Concept (February 19, 2026)

**Duration:** 1 day
**Goal:** Validate the technical approach

- WebSocket connection to OpenClaw gateway
- Basic chat streaming interface
- Session management foundation
- SvelteKit + Tailwind setup

**Outcome:** Proved that a modern web UI could replace OpenClaw's Lit-based Control UI

### ✅ Phase 1: Core UI Foundation (February 19-20, 2026)

**Duration:** 2 days, 3 sprints
**Goal:** Build the essential chat and admin interface

**Sprint 1:**

- Chat foundation with streaming support
- Dark cyberpunk theme with neon accents
- Message rendering with basic Markdown
- Session list with create/delete/switch

**Sprint 2:**

- Tool call status indicators
- Rich markdown rendering (Shiki, KaTeX, Mermaid)
- Message actions (copy, edit, delete)
- Real-time typing indicators

**Sprint 3:**

- Polish and bug fixes
- Responsive design for mobile
- Keyboard shortcuts (Ctrl+Enter to send)
- Connection status monitoring

**Outcome:** Production-quality chat interface that exceeded OpenClaw's built-in UI

### ✅ Control UI Parity (February 20-21, 2026)

**Duration:** 2 days
**Goal:** Replace all OpenClaw Control UI functionality

Built 13 admin pages matching OpenClaw's features:

1. **Overview** — System status and quick actions
2. **Channels** — WhatsApp QR codes, bot status
3. **Sessions** — Full session management
4. **Cron Jobs** — Schedule management with CRUD
5. **Exec Approvals** — Command approval workflow
6. **Agents** — Agent configuration
7. **Skills** — Plugin management
8. **Nodes** — Node fleet monitoring
9. **Memory** — Vector database browser
10. **Settings** — Gateway configuration
11. **Debug** — System diagnostics
12. **Logs** — Live log tailing
13. **Config Editor** — Raw JSON configuration

**Outcome:** Feature parity achieved — Cortex could completely replace OpenClaw's built-in UI

### ✅ Phase 6: Polish & PWA (February 21, 2026)

**Duration:** 1 day
**Goal:** Production polish and mobile experience

- **Theme picker**: 8 preset themes + custom theme builder
- **PWA support**: Install as app on mobile/desktop
- **Keyboard shortcuts**: Full hotkey system
- **Browser notifications**: Native notification support
- **Mobile optimization**: Touch-friendly responsive design
- **Performance**: Bundle optimization and lazy loading

**Outcome:** Professional-grade user experience competitive with commercial platforms

### ✅ v1.0.0 Release (February 22, 2026)

**Goal:** Feature-complete initial release

- **Image upload/rendering**: Drag & drop image support
- **Tool call status**: Visual indicators for tool execution
- **Chat polish**: Improved message threading
- **Memory files browser**: UI for memory system exploration

**Outcome:** First stable release ready for production use

### ✅ v2.0.0 Distribution (February 22, 2026)

**Goal:** Production deployment infrastructure

- **Runtime configuration**: No rebuild required for config changes
- **Docker registry**: Automated builds to GitLab registry
- **Installer script**: One-line installation via curl
- **Setup wizard**: First-run configuration interface
- **Node pairing**: Secure device pairing with Ed25519
- **npm package**: `openclaw-cortex` published to npmjs.com

**Outcome:** Self-service deployment for end users

### ✅ OpenClaw Fork (February 23, 2026)

**Goal:** Deep integration rather than overlay

- Forked OpenClaw to `openclaw-cortex`
- Embedded Cortex UI directly into gateway
- Published as `openclaw-cortex@3.x` on npm
- Maintained backward compatibility with OpenClaw configs

**Outcome:** Single package providing both gateway and UI

### ✅ Security Phase 1: Audit Logging (February 23, 2026)

**Goal:** Comprehensive activity tracking

- Full audit trail for all actions
- Structured logging with timestamps and user context
- Audit log viewer in the admin interface
- Configurable retention policies

### ✅ Security Phase 2: Role-Based Access Control (February 23-24, 2026)

**Goal:** Granular permissions and user management

Implemented 4 role levels:

- **admin**: Full access to everything
- **operator**: Management access, limited config changes
- **viewer**: Read-only access to most features
- **chat-only**: Chat interface only, no admin pages

**Outcome:** Multi-user deployments with appropriate access controls

### ✅ Security Phase 3: Method Authorization (February 24, 2026)

**Goal:** Per-API-method permission enforcement

- Granular method-level permissions
- API token system with scoped access
- Device pairing with cryptographic identity
- Rate limiting and abuse prevention

### ✅ Seamless Authentication (February 24, 2026)

**Goal:** Frictionless but secure access

- **Auto-approve first device**: Zero-config single-user setup
- **Token-based auth**: API tokens for programmatic access
- **Pairing codes**: Time-limited codes for device setup
- **Invite links**: Shareable links with embedded tokens
- **QR pairing**: Mobile-friendly device registration
- **LAN auto-approve**: Automatic approval for local network devices

**Outcome:** Security without friction for legitimate users

### ❌ Phase 4: Multi-User (CANCELLED)

**Original goal:** Full multi-user collaboration features

**Cancellation reason:** Ivan decided RBAC defeats the purpose. The person who runs the gateway IS the authority. Simplified to single-operator model with role inheritance.

### ✅ Documentation (February 24, 2026)

**Goal:** Comprehensive user and developer documentation

- **GUIDE.md**: 2500+ line comprehensive user guide
- **CONFIG-REFERENCE.md**: Complete configuration documentation
- **GitLab Pages**: Static site generation with cyberpunk theme
- **HTML conversion**: Markdown to styled HTML with navigation

**Outcome:** Documentation deployed at GitLab Pages with professional presentation

### ✅ Cortex Synapse v0.1.0 (February 24, 2026)

**Goal:** Native desktop application

- **Tauri v2** application framework
- **Linux + Windows** builds via GitLab CI
- **Basic chat** functionality working
- **WebSocket connection** to gateway

**Outcome:** MVP desktop app for testing

### ✅ Synapse Batch 1 (February 24, 2026)

**Goal:** Essential desktop features

- **Markdown rendering**: Full parity with web UI
- **Session management**: Create, switch, and manage sessions
- **Chat history**: Persistent message history
- **Auto-reconnect**: Robust connection management with exponential backoff

**Outcome:** Feature parity with core web UI functionality

### ✅ Synapse Batch 2 (February 25, 2026)

**Goal:** System integration

- **Native notifications** (#25): OS-level notifications for agent messages
- **System tray** (#26): Minimize to tray, tray icon menu
- **Start minimized** (#27): Boot with app hidden to tray

**Outcome:** Desktop-native experience with persistent background presence

### ✅ Synapse Batch 3 (February 25, 2026)

**Goal:** Chat polish

- **Copy button** (#28): Copy messages and code blocks
- **Timestamps** (#29): Message timestamps with relative time
- **Syntax highlighting** (#30): Code syntax highlighting in chat
- **Keyboard shortcuts** (#31): Hotkeys matching web UI (Ctrl+N, Ctrl+Shift+C, Ctrl+/)

**Outcome:** Chat UX parity with web UI

### ✅ Gateway v3.10.3–v3.10.11 (February 25-27, 2026)

**Goal:** Gateway enhancements to support Synapse and webchat

- **v3.10.3**: Canvas `gateway.bind: "lan"` + `OPENCLAW_CANVAS_HOST_URL` env var + origins allowlist, ctx\_ token rate-limiter fix
- **v3.10.4**: Omit `channel` from inbound metadata for webchat
- **v3.10.5**: Helpful error when agent tries messaging via webchat channel
- **v3.10.6**: `emitChatFinal` accumulates image blocks from tool results during runs
- **v3.10.7**: `sanitizeChatHistoryContentBlock` preserves images under 512KB base64
- **v3.10.8**: Auto-node detection for camera_snap, camera_list, camera_clip, screen_record
- **v3.10.9**: Binary file upload via `agents.files.set` with `encoding: "base64"`, new `agents.files.delete`, auto-mkdir
- **v3.10.10**: Added `tick` keepalive handler to gateway + auth bypass
- **v3.10.11**: Added `encoding` field to `AgentsFilesSetParamsSchema` (TypeBox validation fix)

**Additional gateway fixes:**

- `agents.files.set/get/list` support for `uploads/` and `avatars/` directories with path traversal protection
- Binary file detection in `agents.files.get` — returns base64 with `encoding` field for image/binary files
- `resolveAssistantIdentity` parameter name fix
- Assistant branding (name + avatar) in `hello-ok` connect response
- Improved workspace templates (IDENTITY.md, AGENTS.md, BOOTSTRAP.md, TOOLS.md)

**Outcome:** Full image pipeline, file management API, and webchat support for Synapse

### ✅ Synapse v0.7.7–v0.9.9 (February 25-27, 2026)

**Goal:** Full-featured desktop client with node capabilities

**Chat & Rendering (v0.7.7–v0.8.0):**

- Inline image rendering from camera snaps and screenshots
- CSS scaling fixes for images
- MEDIA: URL filtering in message display
- Tool result image merging
- Streaming delta REPLACE (not append) fix

**UX & Features (v0.9.0–v0.9.5):**

- Animated thinking indicator (bouncing dots)
- Tool activity cards showing real-time tool calls
- Multi-gateway profile system with add/edit/switch/delete
- Native OS notifications with toggle control
- File Manager panel with browse/upload/download
- Tauri native file dialog + HTML fallback for uploads

**Node & System (v0.9.6–v0.9.9):**

- Node registration with canvas, screen, and camera capabilities
- Avatar cache-busting (timestamp query param)
- Canvas window with full OS chrome (title bar, move, resize, close)
- Auto-update infrastructure with signed update bundles
- Updater endpoint via GitLab package registry
- CI pipeline: build-linux, build-windows, publish-update, create-release

**Outcome:** Near-complete desktop client — Phases 1, 2, and 4 of the original roadmap largely achieved

### ✅ Sentry Integration (February 28, 2026)

**Goal:** Error tracking and monitoring for gateway and desktop app

**Gateway (cortex-gateway):**

- Attempted `@sentry/node` → unusable in bundled apps (30+ OTel transitive dependencies)
- Tried `@sentry/node-core` and `@sentry/core` — still pulled in auto-detect integrations
- **Final solution**: Zero-dependency HTTP envelope API — direct `POST` to Sentry envelope endpoint
- Used internal IP (`192.168.1.170:9000`) for LAN ingest — Cloudflare tunnel blocks envelope endpoint with 403
- Project: `cortex-gateway` (id 4)

**Synapse (cortex-synapse):**

- `@sentry/svelte` with Session Replay (100% on error, 0% normal)
- Inputs masked, text and media visible
- Internal IP for DSN (same CF tunnel issue)
- Project: `cortex-synapse` (id 3)

**Infrastructure:**

- Sentry self-hosted at `192.168.1.170` (sentry.honercloud.com for UI)
- New Issue Alert + Error Spike Alert (>10 events/hour) for both projects
- Honercloud Infrastructure dashboard (cross-project overview)
- Cortex Synapse Desktop App Health dashboard

**Outcome:** Production error tracking with zero bloat on the gateway side

### ✅ Smart Exec Routing (February 28, 2026)

**Goal:** Intelligent command routing across nodes

- **Auto-host**: When a system-capable node is connected, `exec` defaults to node instead of gateway host
- **Platform targeting**: Route commands to the right OS (Windows/Linux/macOS) based on context
- **Node context injection**: System prompts include node ID prefix when display names collide
- System prompt shows node ID prefix when display names collide for disambiguation

**Outcome:** Agents can seamlessly execute commands on the most appropriate node without manual targeting

### ✅ Gateway v3.10.10–v3.10.15 (February 27 – March 2, 2026)

**Goal:** Gateway enhancements for Synapse integration, monitoring, and admin UX

- **v3.10.10**: `exec.approval.list` RPC method + approval history tracking, `tick` keepalive handler with auth bypass, platform badge on node cards (Windows/Linux/macOS emoji)
- **v3.10.11**: Accept `arch` + `hostname` in connect frame and expose in `node.list`, node detail side drawer UI (fixed-position overlay)
- **v3.10.12**: Audit page scroll fix, time-aware stats, overview page overhaul (hero header, metric cards, activity feed, node fleet, health sidebar)
- **v3.10.13**: Added `notify` to `CronAddParams` schema (`additionalProperties:false` was rejecting cron jobs with notify flag)
- **v3.10.14**: Default audit level changed from `"sensitive"` to `"all"`, `decodeURIComponent` wrapped in try-catch to prevent URI malformed crashes in markdown.ts
- **v3.10.15**: `exec.approval.report` RPC method — allows Synapse to report approval decisions back to the gateway audit trail

**Additional fixes:**

- Desktop app origin fixes: `tauri://` and `capacitor://` treated as secure contexts for Control UI
- Scopes preserved for desktop app origins
- `cortex-synapse` client ID added to known clients
- Canvas host URL fix for Cloudflare tunnel access

**Outcome:** Polished admin experience, full Synapse integration, and robust cron/audit infrastructure

### ✅ Synapse v0.10.0–v0.11.21 (February 27 – March 2, 2026)

**Goal:** Transform Synapse from chat client into a full autonomous work companion

**v0.10.0 — Chat Polish:**

- Chat export, search, thinking display, session delete
- Smart auto-scroll with word count and scroll-to-bottom indicator
- Command palette (`Ctrl+K`) and message reactions (👍/👎)

**v0.11.0 — Local Execution (Cowork-style):**

- `system.run`, `system.which`, `system.notify` capabilities — agents can execute local commands
- Local file browser (browse Desktop, Downloads, Documents, Pictures)
- Task Panel for autonomous task execution with scheduled tasks
- Cross-platform `system.run` (spawn binary directly on all platforms)

**v0.11.3 — Sentry + UI:**

- Sentry error tracking + Session Replay integration
- Internal IP for Sentry DSN (CF tunnel workaround)
- Local files forbidden path fix, device capture dropdown contrast fix

**v0.11.4–v0.11.7 — CI + Platform:**

- Windows CI cache fixes, Tauri binary cache-nuke before build
- Task completion status fix (sessionKey canonicalization)
- Machine context injection into task prompts
- Hostname-based node display names + richer platform metadata

**v0.11.8–v0.11.9 — F#%$-it Mode:**

- Hostname-based node display names + richer platform metadata
- **F#%$-it Mode**: Auto-approve all agent commands — toggle for full autonomous operation
- Blinking F#%$-it Mode badge in header bar with hide option
- F#%$-it auto-approve moved to `App.svelte` (always mounted, survives panel switches)

**v0.11.11–v0.11.12 — Task Scheduling:**

- Schedule tasks for later with presets (15min, 1h, tomorrow, custom datetime)
- Task completion when TaskPanel is not visible (background task tracking)

**v0.11.13–v0.11.15 — Canvas Fixes:**

- Canvas snapshot: native window capture via `xcap` + JavaScript fallback
- Canvas white screen fix on Linux (WebKitGTK initialization issue)

**v0.11.16 — Approval Bridge + TTS Foundation:**

- Approval bridge to gateway (`exec.approval.report` integration)
- TTS foundation: Web Speech API integration for voice output

**v0.11.17 — Voice/TTS:**

- TTS speak button on messages + settings panel
- Canvas blank screen fix (additional)

**v0.11.18 — Task Recovery:**

- Task recovery on gateway reconnect — running tasks survive connection drops

**v0.11.19–v0.11.20 — TTS Fixes:**

- TTS speak button rendering fixes (non-reactive guard removal, own styling)

**v0.11.21 — KittenTTS:**

- **KittenTTS integration**: Local AI text-to-speech engine
- Python ONNX runtime with 8 voice models
- Rust backend bridge for native performance
- No cloud dependency — fully offline voice synthesis

**Outcome:** Synapse evolved from a chat client into an autonomous work companion with local execution, task scheduling, voice output, and full gateway integration

### ✅ Cyberpunk HUD Overhaul (March 3, 2026)

**Goal:** Unified cyberpunk aesthetic across all web UI pages

- **Full-page HUD treatment**: Every admin page restyled with consistent cyberpunk design language
- **Image rendering fixes**: Handle gateway image format, pass raw images alongside sanitized tool results
- **Color consistency**: Unified neon accent colors and dark backgrounds across all 16+ pages
- **Instances page**: Updated styling for node fleet display
- **Memory page**: Updated styling for vector database browser

**Outcome:** Cohesive cyberpunk visual identity across the entire web UI, not just the main pages

### ✅ Agent Management System — v3.10.17–v3.10.18 (March 4-5, 2026)

**Goal:** Rich agent identity, configuration, and management UI

- **Cyberpunk identity cards**: Visual agent cards on agents page showing name, avatar, model, and status
- **Avatar resolution**: `/avatar/{agentId}` endpoint for per-agent avatar images with fallback to letter placeholder
- **Per-agent identity**: `ui.assistant` only applies to default agent — each agent has its own identity
- **Sidebar avatars**: Always tries image avatar, falls back to letter on error
- **Agents page panels**: Permissions matrix, memory config, onboarding wizard, agent groups, activity feed
- **Onboarding banner**: Only shown for truly unconfigured agents
- **Model badge**: Hidden when no model is set (clean display)
- **Contrast fixes**: Boosted contrast on identity card fields and badges for readability

**Outcome:** Agents page transformed from a simple list into a full management dashboard with rich identity cards and configuration panels

### ✅ Agent Message Routing — v3.10.21–v3.10.26 (March 6-8, 2026)

**Goal:** Enable direct message routing between agents and the web UI

- **v3.10.21**: Full agent message routing system with gateway rebuild
- **v3.10.23**: Node connection agent announcements
- **v3.10.24**: Agent name displayed in chat bubbles for agent sessions
- **v3.10.25**: Agent routing debug logging + agent name in chat bubbles
- **v3.10.26**: Standard event format (`type:event, payload`) for agent routing
- **Agent node registration**: Register agent node on `agents.update` (not just create)
- **Lint cleanup**: Async import patterns, typed params

**Outcome:** Agents can be messaged directly through the web UI with proper routing, identity display, and event handling

### ✅ Agent Chat Persistence & Session Safety — v3.10.27–v3.10.32 (March 9-11, 2026)

**Goal:** Persist agent chat messages and handle colon-containing session IDs safely

**File whitelist & bootstrap (v3.10.27, v3.10.30):**

- `NETWORK.md` added to `agents.files.set` whitelist — agents can write network config
- `NETWORK.md` added to bootstrap file loader — loaded automatically on agent startup

**Chat persistence (v3.10.28–v3.10.29):**

- Agent chat messages now persist to session transcripts (previously lost on page reload)
- Colon-safe file paths for agent session keys (e.g., `agent:main:chat` → safe filename)
- History loading fix — agent chat sessions properly reload previous messages

**Config & session ID fixes (v3.10.31–v3.10.32):**

- `context.config` → `cfg/loadConfig()` — fixed config access pattern for agent chat persistence
- `SAFE_SESSION_ID_RE` updated to allow colons (`/^[a-z0-9][a-z0-9._:-]{0,127}$/i`)
- New `sessionIdToFilename()` helper — converts colon-containing session IDs to filesystem-safe names
- Workspace resolution debug logging in `agent-scope.ts` — traces configured vs. fallback workspace paths

**Outcome:** Agent chat sessions are now fully persistent with proper history loading, and the session ID system safely handles the colon-separated format used by agent session keys

### ✅ Web UI Overhaul — v3.10.33 (March 12, 2026)

**Goal:** Major UX improvements across usage, agents, and chat pages

**Usage page — Session detail drawer:**

- Slide-out drawer panel for viewing session details (replaces inline expand)
- Smooth `slide-in-right` animation with backdrop overlay
- Scroll fix with `max-height: 60vh` for long session transcripts
- Session label display with smart naming

**Agent avatars in chat:**

- `MessageBubble` component parses session key to extract agent ID
- Agent sessions show `/avatar/{agentId}` instead of generic assistant avatar
- Fallback to `/avatar/main` for non-agent sessions

**Smart session naming:**

- `agent:xxx:chat` sessions → `🤖 Xxx` (capitalized agent name with robot emoji)
- `cron:*` sessions → `⏰ Cron: {name}` (clock emoji with cron job name)
- Sub-agent sessions → `🤖 Sub-agent {shortId}`
- Clean display names throughout usage and session lists

**Agents page — Chat integration:**

- "Chat with Agent" button on identity cards
- `💬` chat button in sidebar agent list
- `chatWithAgent()` creates `agent:{id}:chat` session and navigates to chat

**Color & styling consistency:**

- Unified color palette across all pages
- Instances page styling updates
- Memory page styling updates
- Consistent cyberpunk theme application

**Outcome:** Polished, cohesive UX with intuitive agent chat access, informative session naming, and a professional drawer-based detail view

## 5. Current State

### Production Deployment

- **Gateway Version**: v3.10.33 deployed on openclaw (.242)
- **Test environment**: Full stack on devclaw (.223) with Cloudflare tunnel
- **Desktop**: Synapse v0.11.21 (CI building for Windows + Linux)
- **Monitoring**: Sentry self-hosted at 192.168.1.170 — error tracking for gateway + Synapse

### Web UI Status

- **16+ admin pages** covering all gateway functionality with unified cyberpunk HUD
- **Overhauled Overview page**: Hero header, metric cards, activity feed, node fleet, health sidebar
- **Full chat interface** with rich markdown rendering and agent avatars
- **Agent management dashboard**: Identity cards, permissions matrix, memory config, onboarding, groups, activity
- **Usage page**: Slide-out drawer for session details with smart session naming
- **Smart session naming**: `🤖 Agent`, `⏰ Cron: name`, `🤖 Sub-agent` labels throughout the UI
- **Agent chat integration**: Chat buttons on agents page (identity card + sidebar), direct agent messaging
- **Agent message routing**: Full routing system with agent name in chat bubbles
- **Binary file rendering** in file viewer (images displayed inline)
- **Node detail side drawer**: Fixed-position overlay with platform badges
- **Audit page**: Scroll fix, time-aware stats, default level "all"
- **Cyberpunk theme** with 8 presets + custom themes, consistent colors across all pages
- **PWA support** with offline capability
- **Mobile responsive** design

### Gateway Status (v3.10.33)

- **Agent chat persistence**: Agent conversations persist to session transcripts with proper history loading
- **Colon-safe session IDs**: `SAFE_SESSION_ID_RE` allows colons; `sessionIdToFilename()` for filesystem safety
- **NETWORK.md support**: In agents.files.set whitelist + bootstrap file loader
- **Agent message routing**: Standard event format routing between agents and web UI
- **Workspace resolution logging**: Debug traces for configured vs. fallback workspace paths
- **Config access fix**: `cfg/loadConfig()` pattern for agent chat (replaced `context.config`)

### Desktop Status (Synapse v0.11.21)

- **Native chat** with streaming, thinking indicators, tool cards, and reactions
- **Dual WebSocket**: webchat connection (chat) + node connection (capabilities)
- **Node capabilities**: Canvas host, screen capture, camera access
- **Local execution**: `system.run`, `system.which`, `system.notify` — agents run commands natively
- **Local file browser**: Browse Desktop, Downloads, Documents, Pictures
- **Task Panel**: Autonomous task execution with scheduled tasks and cron integration
- **F#%$-it Mode**: Auto-approve all agent commands for full autonomous operation
- **Task scheduling**: Schedule tasks for later (presets + custom datetime)
- **Task recovery**: Running tasks survive gateway reconnects
- **Approval bridge**: Report approval decisions back to gateway audit trail
- **Voice/TTS**: Web Speech API + KittenTTS local AI engine (8 voices, Python ONNX, Rust backend)
- **Canvas fixes**: Native snapshot via xcap, white screen fix on Linux (WebKitGTK)
- **Command palette**: `Ctrl+K` for quick actions
- **Chat export/search**: Save and search conversations
- **File Manager**: Browse, upload, download workspace files
- **Multi-gateway profiles**: Add, edit, switch, delete gateway connections
- **Native notifications**: OS-level alerts with toggle control
- **System tray**: Minimize to tray, tray icon menu
- **Keyboard shortcuts**: Ctrl+N, Ctrl+Shift+C, Ctrl+K, Ctrl+/
- **Auto-update**: Signed update bundles via GitLab package registry
- **Auto-reconnect** with exponential backoff
- **Sentry**: Error tracking + Session Replay (100% on error)

### Security Status

- **3-phase security complete**:
  - ✅ Audit logging with retention policies (default level: "all")
  - ✅ RBAC with 4 role levels (admin/operator/viewer/chat-only)
  - ✅ Method authorization with API tokens
  - ✅ Seamless auth with device pairing
- **Smart exec routing**: Auto-host, platform targeting, node context injection
- **Sentry monitoring**: Error tracking + alerts for gateway and Synapse

### Distribution

- **npm**: `openclaw-cortex` published
- **Docker**: Available in GitLab registry
- **Desktop**: Automated Windows/Linux builds (MSI, NSIS, AppImage, deb, rpm)
- **Auto-update**: Signed bundles uploaded to GitLab package registry
- **Documentation**: Live at GitLab Pages

## 6. Active Development

### 🔄 Synapse v1.0 Polish (In Progress)

- ✅ ~~Voice/TTS integration~~: Web Speech API + KittenTTS local AI — **DONE**
- ✅ ~~Chat export~~: Save conversations to file — **DONE**
- ✅ ~~Chat search/history~~: Search across past conversations — **DONE**
- **Auto-update end-to-end testing**: Verify update banner and one-click install
- **Markdown rendering improvements**: Better code blocks and tables
- **KittenTTS voice expansion**: Additional voice models and quality tuning
- **Browser capability**: CDP browser control from desktop app

### 🔄 Gateway & Web UI Improvements

- **Upstream rebase**: ~2,270 commits behind upstream OpenClaw (v2026.2.25)
- **Anthropic API timeout investigation**: 600s timeouts on devclaw
- **Agent chat UX**: Continue refining the agent chat experience (multi-agent conversations, agent-to-agent messaging)
- **Session management**: Further improvements to session lifecycle for agent sessions

### 🔄 Monitoring & Observability

- **Sentry webhook bridge**: Real-time error alerts from Sentry → OpenClaw chat via Ranaye Bot integration
- **Performance monitoring**: Add Sentry performance/tracing to gateway
- **Dashboard refinement**: Custom Sentry dashboards for infrastructure health

## 7. Roadmap

### ✅ Synapse Phase 1: Node Registration (COMPLETE)

**Goal**: Desktop app becomes a full OpenClaw node

- ✅ **Node registration**: App registers with gateway as full node
- ✅ **Canvas host**: Display interactive canvases in native WebView window
- ✅ **System capabilities**: Canvas, screen, camera registered

### ✅ Synapse Phase 2: Sensory Capabilities (COMPLETE)

**Goal**: Screen capture and camera access

- ✅ **Screen capture**: Screenshot and screen recording via xcap crate
- ✅ **Camera access**: Photo and video capture via nokhwa crate
- ✅ **Node settings panel**: Enable/disable node with capability toggles

### 📋 Synapse Phase 3: All-in-One Mode (Q2 2026)

**Goal**: Embedded gateway for single-user deployments

- **Embedded gateway**: Bundle OpenClaw gateway in desktop app
- **Process management**: Start/stop/monitor gateway process
- **First-run wizard**: Complete setup in single package

### ✅ Synapse Phase 4: Distribution (COMPLETE)

**Goal**: Professional distribution and updates

- ✅ **MSI installer**: Windows installer package
- ✅ **NSIS installer**: Windows setup executable
- ✅ **AppImage**: Linux portable application
- ✅ **deb/rpm**: Linux packages
- ✅ **Auto-updater**: Signed update bundles with one-click install
- 🔄 **Code signing**: Update signing implemented, binary signing pending

### 📋 Cortex Sentinel: Distributed AI Security

**Goal**: AI-powered distributed security monitoring

- **Host agents**: AI agents on each monitored machine
- **Central coordinator**: Gateway-based threat correlation
- **Threat intelligence**: Network-wide security analysis
- **Automated response**: AI-driven remediation with human approval

**Status**: Concept phase — full concept document at `/home/ihoner/projects/cortex-sentinel/CONCEPT.md`

### 📋 Public Release: Community Edition

**Goal**: Open source release for broader adoption

- **GitHub primary**: Move from GitLab to GitHub as primary
- **Polished README**: Professional project presentation
- **Community docs**: Contribution guidelines and architecture docs
- **Issue templates**: Standardized bug reports and feature requests

## 8. Key Technical Decisions

### Build vs. Fork vs. Extend

- **Considered**: Build standalone UI, extend OpenClaw Control UI, or fork OpenClaw
- **Decided**: Fork OpenClaw for deeper integration
- **Reasoning**: Forking allows direct UI embedding, better performance, and unified distribution

### Frontend Framework

- **Considered**: React/Next.js, Vue/Nuxt, Svelte/SvelteKit
- **Decided**: SvelteKit 2 with Svelte 5 runes
- **Reasoning**: Smaller bundle size, better performance, existing Open WebUI precedent, simpler state management

### Desktop Technology

- **Considered**: Electron, Tauri v1, Tauri v2
- **Decided**: Tauri v2
- **Reasoning**: 10x smaller binaries, Rust security model, system WebView, built-in auto-updater

### Security Model

- **Considered**: JWT tokens, session cookies, OAuth2
- **Decided**: Ed25519 device pairing + API tokens
- **Reasoning**: Cryptographic identity, offline capability, fine-grained scopes

### Distribution Strategy

- **Considered**: Docker-only, GitHub Releases, package managers
- **Decided**: Multi-channel (npm + Docker + desktop packages)
- **Reasoning**: Different users prefer different installation methods

### Multi-User Architecture

- **Considered**: Full multi-tenant system, role-based collaboration
- **Decided**: Single-operator model with role inheritance (CANCELLED full multi-user)
- **Reasoning**: Complexity didn't justify benefits for primary use case

### Primary Git Platform

- **Considered**: GitHub-first vs. GitLab-first
- **Decided**: GitLab primary, GitHub secondary
- **Reasoning**: GitLab CI/CD, container registry, pages — better integrated DevOps

## 9. Infrastructure

### Production Environments

| Environment | IP                  | Purpose            | Services           |
| ----------- | ------------------- | ------------------ | ------------------ |
| **Gateway** | .242 (openclaw box) | Production gateway | OpenClaw + Cortex  |
| **Dev Box** | .197                | Web UI hosting     | Docker + nginx     |
| **Devclaw** | .223 (Proxmox VM)   | Test environment   | Full stack testing |

### Development Infrastructure

| Service                | Location        | Purpose                |
| ---------------------- | --------------- | ---------------------- |
| **GitLab Server**      | .75             | CI/CD, repos, registry |
| **Container Registry** | .75:5050        | Docker image hosting   |
| **GitLab Pages**       | pages subdomain | Documentation hosting  |
| **npm Registry**       | npmjs.com       | Package distribution   |

### Repositories

| Repo                   | Platform | Purpose                          |
| ---------------------- | -------- | -------------------------------- |
| **llm/cortex-fork**    | GitLab   | Main codebase (web UI + gateway) |
| **llm/cortex-synapse** | GitLab   | Desktop application              |
| **ivanuser/cortex**    | GitHub   | Public mirror                    |

### Build Infrastructure

- **GitLab CI/CD**: Automated testing and builds
- **Instance runners**: Linux build agents on GitLab infrastructure
- **Windows runner**: dev05 (runner ID 18, tag `windows-build`)
- **Multi-platform builds**: Docker buildx for cross-platform images

## 10. Links

### Live Deployments

- **Web UI**: https://cortex.honercloud.com
- **Documentation**: https://llm.pages.honercloud.com/cortex-fork/ (GitLab Pages)

### Source Code

- **Main Repository**: https://gitlab.honercloud.com/llm/cortex-fork
- **Desktop App**: https://gitlab.honercloud.com/llm/cortex-synapse
- **GitHub Mirror**: https://github.com/ivanuser/cortex

### Package Distribution

- **npm Package**: https://npmjs.com/package/openclaw-cortex
- **Container Registry**: https://gitlab.honercloud.com/llm/cortex-fork/container_registry

### Documentation

- **Main Guide**: [GUIDE.md](GUIDE.md)
- **Configuration Reference**: [CONFIG-REFERENCE.md](CONFIG-REFERENCE.md)
- **Desktop App Plan**: [DESKTOP-APP-PLAN.md](DESKTOP-APP-PLAN.md)

### Concept Documents

- **Cortex Sentinel**: `/home/ihoner/projects/cortex-sentinel/CONCEPT.md` (distributed AI security)

---

## Project Status Summary

**✅ Completed**: Production-ready web UI with security hardening and unified cyberpunk HUD, full-featured desktop app with local execution and voice/TTS, Sentry error monitoring, smart exec routing, approval bridge, auto-update infrastructure, comprehensive documentation, agent management dashboard with identity cards and permissions, agent message routing system, agent chat persistence with colon-safe session IDs, web UI overhaul with usage drawer, agent avatars, and smart session naming

**🔄 In Progress**: Synapse v1.0 final polish (markdown rendering, auto-update testing), KittenTTS voice expansion, Sentry webhook bridge, upstream rebase consideration, agent chat UX refinement

**📋 Next**: All-in-one mode (embedded gateway), browser capability for desktop, distributed security agents, public release

**Timeline**: ~21 days of intensive development (Feb 19 – Mar 12) produced a complete replacement for OpenClaw's UI with full agent management, an autonomous desktop companion with local execution, voice/TTS, task scheduling, and Sentry monitoring. Gateway progressed from v3.10.15 to v3.10.33 in 10 days (Mar 2–12), adding agent routing, chat persistence, and a major UI overhaul.

---

_Cortex v3.10.33 — March 12, 2026_
