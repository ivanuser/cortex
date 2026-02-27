# Cortex Synapse — Desktop App Plan

> **Goal:** Build native Windows and Linux desktop apps that provide full node capabilities (canvas, screen, camera, notifications) — matching what the macOS OpenClaw app already does.
>
> **Status:** ✅ Phases 0–2 and 4 COMPLETE. Phase 3 (All-in-One) planned for Q2 2026.
> **Current Version:** v0.9.9 (February 27, 2026)

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
11. 📋 **Can optionally run the gateway** itself (all-in-one mode) — Phase 3

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
│  │  • Notifs    │  └──────────────────────┘ │
│  │  • FS Access │                           │
│  │  • Updater   │  ┌──────────────────────┐ │
│  │  • Gateway   │  │   Canvas WebView     │ │
│  │    (planned) │  │   (secondary window) │ │
│  └──────────────┘  └──────────────────────┘ │
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

| Capability      | Status | Implementation                                |
| --------------- | ------ | --------------------------------------------- |
| `canvas`        | ✅     | Tauri secondary WebView window with OS chrome |
| `screen`        | ✅     | `xcap` crate for screenshots and recording    |
| `camera`        | ✅     | `nokhwa` crate for photo/video capture        |
| `notifications` | ✅     | Tauri notification plugin                     |
| `system`        | 📋     | Tauri shell plugin + IPC (planned)            |
| `browser`       | 📋     | CDP browser control (planned)                 |
| `location`      | 📋     | Platform-specific APIs (planned)              |

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

## Feature Summary (v0.9.9)

### Chat

- Real-time streaming with live thinking indicator (animated bouncing dots)
- Tool activity cards showing real-time tool calls
- Inline image rendering (camera snaps, screenshots, generated images)
- Image attachments (drag & drop or paste)
- Markdown rendering with code blocks
- Message history persisted across sessions
- Keyboard shortcuts: `Ctrl+N` new chat, `Ctrl+Shift+C` copy last, `Ctrl+/` reference

### File Management

- File Manager panel with browse/upload/download
- Tauri native file dialog + HTML fallback for uploads
- Binary file support via base64 encoding

### Profiles & Settings

- Multi-gateway profile system (add, edit, switch, delete)
- Gateway panel with connection status and auto-start toggle
- Node settings with capability toggles
- Notification controls (enable/disable)

### System Integration

- System tray with minimize-to-tray
- Native OS notifications
- Auto-reconnect with exponential backoff
- Auto-update with signed bundles

## CI/CD Pipeline

```
main branch push
    │
    ├── build-linux (GitLab runner)
    │   ├── .deb package
    │   ├── .rpm package
    │   └── .AppImage.tar.gz + .sig
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

## What's Next for v1.0

1. **Auto-update end-to-end testing** — verify update banner + one-click install
2. **Voice/TTS integration** — audio playback in chat
3. **Improved markdown** — better code blocks, tables, syntax highlighting
4. **Chat export** — save conversations to file
5. **Chat search** — search across past conversations
6. **All-in-One Mode** — embedded gateway for zero-config setup

---

_Cortex Synapse v0.9.9 — February 27, 2026_
_From concept to near-v1.0 in 3 days._
