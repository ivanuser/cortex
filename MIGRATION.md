# Migrating from OpenClaw to Cortex

Cortex is a drop-in replacement for OpenClaw. Same engine, same data, same protocols — better UI and clearer architecture.

**Migration time: ~2 minutes.**

## Quick Version

```bash
# 1. Stop OpenClaw
openclaw gateway stop

# 2. Remove OpenClaw, install Cortex
npm uninstall -g openclaw
npm install -g openclaw-cortex

# 3. Start Cortex
cortex gateway start
```

That's it. Your config, memory, nodes, channels, and devices all carry over automatically.

> **Important:** You must uninstall `openclaw` first — the `openclaw` binary from the original package conflicts with the one provided by `openclaw-cortex`. Alternatively, use `npm install -g openclaw-cortex --force` to overwrite in place.

## What Stays the Same

| Component          | Details                                                  |
| ------------------ | -------------------------------------------------------- |
| **Data directory** | `~/.openclaw/` — unchanged, Cortex reads it as-is        |
| **Config file**    | `~/.openclaw/openclaw.json` — same format, same location |
| **Memory**         | SQLite DB at `~/.openclaw/memory/` — no migration needed |
| **Paired nodes**   | All node tokens and pairings are preserved               |
| **Paired devices** | Web UI device identities carry over                      |
| **Channels**       | Discord, Telegram, Signal, etc. — all config stays       |
| **Cron jobs**      | Preserved in `~/.openclaw/cron/`                         |
| **Exec approvals** | `~/.openclaw/exec-approvals.json` — unchanged            |
| **Agent files**    | `~/.openclaw/agents/` — SOUL.md, USER.md, etc.           |
| **Skills**         | All installed skills continue working                    |

## What Changes

| Before                   | After                              |
| ------------------------ | ---------------------------------- |
| `openclaw` CLI command   | `cortex` CLI command (both work)   |
| Stock Control UI (Lit)   | Cortex UI (SvelteKit)              |
| `openclaw gateway start` | `cortex gateway start` (both work) |
| `openclaw node run`      | `cortex node run` (both work)      |

## Detailed Steps

### 1. Stop Your Current Gateway

```bash
openclaw gateway stop
# or: systemctl stop openclaw (if running as service)
```

### 2. Back Up (Optional but Recommended)

```bash
cp -r ~/.openclaw ~/.openclaw-backup
```

### 3. Remove OpenClaw

```bash
npm uninstall -g openclaw
```

This removes the upstream `openclaw` package and its binaries, preventing conflicts.

### 4. Install Cortex

**From npm:**

```bash
npm install -g openclaw-cortex
```

**From source:**

```bash
git clone https://github.com/ivanuser/cortex.git
cd cortex
pnpm install
pnpm build
cd ui && pnpm install && pnpm build && cd ..
npm link
```

### 5. Update systemd Service (if applicable)

If you installed OpenClaw as a systemd service, update the service file:

```bash
# Check current service
systemctl cat openclaw-gateway.service

# Reinstall with Cortex
cortex gateway install
sudo systemctl daemon-reload
```

### 6. Start Cortex

```bash
cortex gateway start
```

### 7. Verify

```bash
cortex status
cortex doctor
```

Everything should report healthy. The `openclaw` command still works as an alias.

## Migrating Nodes

Nodes paired with your gateway **don't need any changes**. They connect via WebSocket to the gateway URL — the protocol is identical.

If you want to update the node binary too:

```bash
# On each node:
npm uninstall -g openclaw
npm install -g openclaw-cortex
# Restart the node service
cortex node run --gateway-url <your-gateway-url>
```

## Web UI Access

The Cortex UI replaces the stock Control UI automatically. Access it at your gateway's URL:

- **Local:** `http://localhost:18789`
- **With tunnel:** Your existing Cloudflare/ngrok/tailscale URL

Previously paired web devices will need to re-authenticate once (the UI changed, but the pairing protocol is the same).

## Upstream Sync

Cortex tracks OpenClaw upstream. To get the latest OpenClaw updates:

```bash
cd cortex
git fetch upstream
git merge upstream/main
pnpm install && pnpm build
```

See [FORK.md](FORK.md) for detailed sync procedures.

## Rollback

If something goes wrong:

```bash
cortex gateway stop
npm uninstall -g openclaw-cortex
npm install -g openclaw
openclaw gateway start
```

Your data is untouched — Cortex doesn't modify `~/.openclaw/` format.

## FAQ

**Q: Why `openclaw-cortex` and not just `cortex`?**
The name `cortex` is taken on npm by an unrelated package. `openclaw-cortex` is the official npm package name, but it installs both `cortex` and `openclaw` commands.

**Q: Will my SOUL.md / USER.md / AGENTS.md work?**
Yes. Cortex reads the same agent files from the same locations.

**Q: Do I lose chat history?**
No. All session history is in `~/.openclaw/` and carries over.

**Q: Will `openclaw` commands still work?**
Yes. Cortex installs both `cortex` and `openclaw` binaries — they're identical.

**Q: Can I run both side by side?**
Not on the same machine (they'd fight over `~/.openclaw/` and port 18789). But you can run them on different machines pointing to different data directories.

**Q: Do I need to reconfigure my Cloudflare tunnel?**
No. The gateway still listens on the same port. Your tunnel config doesn't change.

**Q: What about the `EEXIST` error during install?**
If you see `EEXIST: file already exists` for the `openclaw` binary, it means the upstream `openclaw` package wasn't removed first. Run `npm uninstall -g openclaw` then try again, or use `npm install -g openclaw-cortex --force`.
