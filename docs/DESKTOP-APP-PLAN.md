# Cortex Desktop App — Project Plan

> **Goal:** Build native Windows and Linux desktop apps that provide full node capabilities (canvas, screen, camera, notifications) — matching what the macOS OpenClaw app already does.

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

## The Solution: Cortex Desktop

A native desktop app for Windows and Linux that:

1. **Embeds the Cortex UI** in a native window (no browser needed)
2. **Runs as a node** connecting to the gateway with full capabilities
3. **Hosts canvas** via native WebView
4. **Captures screen** for the AI agent to see
5. **Accesses camera** (if available)
6. **Sends native notifications**
7. **Lives in system tray** for always-on presence
8. **Can optionally run the gateway** itself (all-in-one mode)

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
│              Cortex Desktop                  │
│                                              │
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │  Tauri Rust   │  │   Svelte Frontend    │ │
│  │  Backend      │  │   (Cortex UI)        │ │
│  │              │  │                      │ │
│  │  • Gateway   │◄─┤  • Chat              │ │
│  │    Client    │  │  • Admin Pages       │ │
│  │  • Screen    │  │  • Canvas Host       │ │
│  │    Capture   │──►│  • Settings          │ │
│  │  • Camera    │  │  • Connection Mgmt   │ │
│  │  • Tray Icon │  │                      │ │
│  │  • Notifs    │  └──────────────────────┘ │
│  │  • FS Access │                           │
│  │  • Gateway   │  ┌──────────────────────┐ │
│  │    (optional)│  │   Canvas WebView     │ │
│  └──────────────┘  │   (secondary window) │ │
│                    └──────────────────────┘ │
│         │                                    │
│         │ WebSocket                          │
│         ▼                                    │
│  ┌──────────────┐                           │
│  │   Gateway     │ (local or remote)        │
│  │   :18789      │                           │
│  └──────────────┘                           │
└─────────────────────────────────────────────┘
```

### Two Operating Modes

**1. Client Mode (connect to existing gateway)**

- App connects to a remote or local gateway via WebSocket
- Registers as a node with full capabilities
- User gets the Cortex UI + native OS integration
- Lightweight — just the app, gateway runs elsewhere

**2. All-in-One Mode (embedded gateway)**

- App spawns and manages the gateway process locally
- Everything in one package — no separate install needed
- Best for single-user setups
- Gateway runs as a child process, managed by the app

## Node Capabilities to Implement

| Capability      | What it does                 | Tauri approach                                               |
| --------------- | ---------------------------- | ------------------------------------------------------------ |
| `system`        | Execute commands on the host | Tauri shell plugin + IPC                                     |
| `browser`       | Browser automation (CDP)     | Launch/control system browser via CDP                        |
| `canvas`        | Display interactive WebViews | Tauri secondary window (WebView)                             |
| `screen`        | Screen capture/recording     | `xcap` crate (cross-platform screenshots)                    |
| `camera`        | Photo/video capture          | `nokhwa` crate (cross-platform camera)                       |
| `notifications` | Native OS notifications      | Tauri notification plugin                                    |
| `location`      | Geolocation                  | Platform-specific APIs (Windows Location API, Linux GeoClue) |

## Phased Implementation

### Phase 0: PoC — Tauri + Cortex UI (1-2 days)

**Goal:** Prove Tauri can embed the Cortex Svelte UI and connect to a gateway.

- [ ] Scaffold Tauri v2 project with Svelte frontend
- [ ] Copy/symlink the existing Cortex UI source as the frontend
- [ ] Build and run — verify the UI renders in native window
- [ ] Connect to devclaw gateway — verify chat works
- [ ] System tray icon with quit/show/hide

**Success criteria:** Chat working through native app window on Linux.

### Phase 1: Node Registration + Canvas (3-4 days)

**Goal:** App registers as a full node and can host canvases.

- [ ] Implement gateway WebSocket client in Rust
- [ ] Register with capabilities: `["system", "browser", "canvas"]`
- [ ] Canvas host: secondary WebView window that gateway can push content to
- [ ] Handle `canvas.present`, `canvas.navigate`, `canvas.eval`, `canvas.snapshot` commands
- [ ] Native notifications for agent messages

**Success criteria:** Agent can push a canvas to the desktop app and snapshot it.

### Phase 2: Screen Capture + Camera (3-4 days)

**Goal:** Full sensory capabilities.

- [ ] Screen capture using `xcap` crate
- [ ] Respond to `screen_record` node commands
- [ ] Camera access using `nokhwa` crate
- [ ] Respond to `camera_snap`, `camera_list`, `camera_clip` commands
- [ ] Permission prompts (user must approve screen/camera access)
- [ ] Capability: `["system", "browser", "canvas", "screen", "camera"]`

**Success criteria:** Agent can take a screenshot and a photo through the desktop app.

### Phase 3: All-in-One Mode (2-3 days)

**Goal:** Single-package install for new users.

- [ ] Bundle `cortex` gateway binary (or invoke via npm)
- [ ] "Start Gateway" / "Stop Gateway" in app menu
- [ ] Gateway process management (spawn, monitor, restart on crash)
- [ ] First-run wizard: configure API keys, set up agent
- [ ] Gateway logs viewable in the app

**Success criteria:** Download one app → run it → have a fully working AI assistant.

### Phase 4: Polish + Distribution (2-3 days)

**Goal:** Installable packages for Windows and Linux.

- [ ] Windows: `.msi` installer via WiX
- [ ] Linux: `.deb` + `.AppImage` + `.rpm`
- [ ] Auto-updater (Tauri built-in)
- [ ] Proper app icons (Cortex branding)
- [ ] Start on boot option
- [ ] Minimize to tray on close
- [ ] GitHub Releases CI/CD

**Success criteria:** Users can download from GitHub Releases and install with one click.

## File Structure

```
cortex-desktop/
├── src-tauri/                   # Rust backend
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs              # App entry point
│   │   ├── tray.rs              # System tray setup
│   │   ├── gateway_client.rs    # WS connection to gateway
│   │   ├── node/
│   │   │   ├── mod.rs
│   │   │   ├── screen.rs        # Screen capture
│   │   │   ├── camera.rs        # Camera access
│   │   │   ├── canvas.rs        # Canvas host management
│   │   │   └── system.rs        # System command execution
│   │   ├── gateway_manager.rs   # Embedded gateway process mgmt
│   │   └── commands.rs          # Tauri IPC commands
│   ├── tauri.conf.json
│   └── icons/
├── src/                         # Frontend (Cortex Svelte UI)
│   └── ... (symlinked or copied from ui/)
├── package.json
└── README.md
```

## Discovery Questions

Before starting the PoC:

1. **Gateway location:** Should Phase 0 PoC connect to devclaw (.223) or spin up a local gateway?
2. **Repo structure:** New repo (`cortex-desktop`) or monorepo inside `cortex-fork`?
3. **Rust experience:** I'll be generating Rust code via AI. Any preferences on code style or crate choices?
4. **Priority platform:** Start with Linux (we have dev boxes) or Windows (your daily driver)?
5. **All-in-one priority:** How important is bundling the gateway inside the app vs. just being a client?

## Risk Assessment

| Risk                             | Likelihood | Impact | Mitigation                                                        |
| -------------------------------- | ---------- | ------ | ----------------------------------------------------------------- |
| Tauri v2 WebView quirks on Linux | Medium     | Medium | Test on multiple distros early; WebKitGTK is mature               |
| Camera crate compatibility       | Medium     | Low    | `nokhwa` supports most USB cameras; fallback to ffmpeg            |
| Screen capture permissions       | Low        | Medium | Prompt user; document per-OS requirements                         |
| Gateway protocol complexity      | Low        | High   | Gateway WS client already exists in TypeScript — port logic       |
| Build size with embedded gateway | Medium     | Low    | Gateway is a Node.js process, not compiled in — separate download |

## Timeline Estimate

| Phase                    | Duration       | Deliverable                     |
| ------------------------ | -------------- | ------------------------------- |
| Phase 0: PoC             | 1-2 days       | Native window with working chat |
| Phase 1: Node + Canvas   | 3-4 days       | Full node registration + canvas |
| Phase 2: Screen + Camera | 3-4 days       | All sensory capabilities        |
| Phase 3: All-in-One      | 2-3 days       | Embedded gateway mode           |
| Phase 4: Distribution    | 2-3 days       | Installable packages            |
| **Total**                | **~2-3 weeks** | **Full desktop app**            |

---

_This is the piece that makes Cortex a complete platform — not just a web UI, but a native presence on every desktop._
