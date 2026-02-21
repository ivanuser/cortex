# Cortex Architecture

This document describes the simplified Cortex architecture where gateways serve the web UI and nodes are headless workers.

## Gateway Mode
- **Full brain**: agents, sessions, cron, channels, memory, model catalog
- **Serves Cortex web UI** - the ONLY place with a web interface
- **Accepts node connections** via WebSocket on port 18789 (configurable)
- **Manages device pairing and authentication** for web clients
- **HTTP API endpoints** for OpenAI-compatible chat completions and OpenResponses
- **Control plane**: configuration management, plugin registry, skill management

### Gateway Configuration
The gateway's web UI can be controlled via configuration:

```toml
[gateway.controlUi]
# Disable the Control UI entirely (nodes will remain headless)
enabled = false
# Optional base path for UI (default: "/")
basePath = "/cortex"
# Optional custom UI assets root
root = "/path/to/custom/ui"
```

### Starting a Gateway
```bash
# Run gateway in foreground (for development)
cortex gateway run

# Install as system service
cortex gateway install

# Service management
cortex gateway start
cortex gateway stop
cortex gateway restart
cortex gateway status
```

## Node Mode  
- **Lightweight worker** that connects to a gateway
- **Executes commands** on behalf of the gateway (system, browser, camera, etc.)
- **NO web UI, NO admin interface, NO HTTP server**
- **Single command to join**: `cortex node run --host <gateway-host> --port <gateway-port>`
- **Capabilities**: exec, camera, screen, browser, location, canvas (when supported)
- **Auto-reconnection** to gateway with exponential backoff

### Node Capabilities
Current nodes provide these capabilities to gateways:
- `system` - Command execution, file system access, process management
- `browser` - Browser automation proxy (when browser proxy is enabled)
- Future: `camera`, `screen`, `location`, `canvas` (OS-dependent)

### Starting a Node
```bash
# Run node in foreground, connecting to a gateway
cortex node run --host gateway.example.com --port 18789

# Install as system service
cortex node install --host gateway.example.com --port 18789

# Service management  
cortex node start
cortex node stop
cortex node restart
cortex node status
```

### Node Configuration
Nodes store their configuration in `~/.openclaw/node-host.json`:

```json
{
  "nodeId": "unique-node-id",
  "displayName": "My Node",
  "gateway": {
    "host": "gateway.example.com",
    "port": 18789,
    "tls": false,
    "tlsFingerprint": null
  }
}
```

## Security Model
- **Gateway is the single security boundary**
- **Nodes authenticate** via token issued during pairing with gateway
- **Web UI only accessible** on the gateway
- **Device pairing** for new web clients happens through the gateway
- **No direct node access** - all commands routed through gateway

## Network Architecture
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Browser   │◄──►│     Gateway      │◄──►│   Node Worker   │
│   (port 18789)  │    │  Full Service    │    │   (headless)    │
└─────────────────┘    │  • Web UI        │    │  • Exec         │
                       │  • API           │    │  • Browser      │
┌─────────────────┐    │  • Auth          │    │  • Camera       │
│   Mobile App    │◄──►│  • Agents        │    │  • Screen       │
│                 │    │  • Memory        │    │  • Canvas       │
└─────────────────┘    │  • Channels      │    └─────────────────┘
                       └──────────────────┘           ▲
                              ▲                       │
                              │                WebSocket
                         Port 18789              Connection
                      (WebSocket + HTTP)
```

## Migration from OpenClaw
This architecture aligns with the current OpenClaw implementation:

1. **Nodes are already headless** - they connect to gateways as `GatewayClient` instances
2. **Gateway already serves UI** - through the `control-ui.ts` module
3. **No breaking changes needed** - existing deployments continue to work
4. **Clean separation** - gateway = brain + UI, nodes = workers

The key insight is that **OpenClaw's architecture already implements this pattern**. This documentation formalizes the intended usage and provides tooling to make it easier to deploy in this pattern.