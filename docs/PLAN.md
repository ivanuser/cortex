# 🧠 CORTEX — Project Plan

**Version:** v3.10.11
**Date:** February 27, 2026
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

## 5. Current State

### Production Deployment

- **Gateway Version**: v3.10.11 deployed on devclaw (.223)
- **Test environment**: Full stack on devclaw with Cloudflare tunnel
- **Desktop**: Synapse v0.9.9 (CI building)

### Web UI Status

- **16 admin pages** covering all gateway functionality
- **Full chat interface** with rich markdown rendering
- **Binary file rendering** in file viewer (images displayed inline)
- **Cyberpunk theme** with 8 presets + custom themes
- **PWA support** with offline capability
- **Mobile responsive** design

### Desktop Status (Synapse v0.9.9)

- **Native chat** with full streaming, thinking indicators, and tool cards
- **Dual WebSocket**: webchat connection (chat) + node connection (capabilities)
- **Node capabilities**: Canvas host, screen capture, camera access
- **File Manager**: Browse, upload, download workspace files
- **Multi-gateway profiles**: Add, edit, switch, delete gateway connections
- **Native notifications**: OS-level alerts with toggle control
- **System tray**: Minimize to tray, tray icon menu
- **Keyboard shortcuts**: Ctrl+N, Ctrl+Shift+C, Ctrl+/
- **Auto-update**: Signed update bundles via GitLab package registry
- **Auto-reconnect** with exponential backoff

### Security Status

- **3-phase security complete**:
  - ✅ Audit logging with retention policies
  - ✅ RBAC with 4 role levels (admin/operator/viewer/chat-only)
  - ✅ Method authorization with API tokens
  - ✅ Seamless auth with device pairing

### Distribution

- **npm**: `openclaw-cortex` published
- **Docker**: Available in GitLab registry
- **Desktop**: Automated Windows/Linux builds (MSI, NSIS, AppImage, deb, rpm)
- **Auto-update**: Signed bundles uploaded to GitLab package registry
- **Documentation**: Live at GitLab Pages

## 6. Active Development

### 🔄 Synapse v1.0 Polish (In Progress)

- **Auto-update end-to-end testing**: Verify update banner and one-click install
- **Markdown rendering improvements**: Better code blocks and tables
- **Voice/TTS integration**: Audio playback in chat
- **Chat export**: Save conversations to file
- **Chat search/history**: Search across past conversations

### 🔄 Gateway Improvements

- **Upstream rebase**: ~2,270 commits behind upstream OpenClaw (v2026.2.25)
- **Anthropic API timeout investigation**: 600s timeouts on devclaw

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

**✅ Completed**: Production-ready web UI with security hardening, full-featured desktop app with node capabilities, auto-update infrastructure, comprehensive documentation

**🔄 In Progress**: Synapse v1.0 polish (markdown, voice, chat export), auto-update end-to-end testing, upstream rebase consideration

**📋 Next**: All-in-one mode (embedded gateway), distributed security agents, public release

**Timeline**: ~8 days of intensive development (Feb 19-27) produced a complete replacement for OpenClaw's UI, a full desktop companion with node capabilities, and auto-update distribution — from zero to near-v1.0 in just over a week.

---

_Cortex v3.10.11 — February 27, 2026_
