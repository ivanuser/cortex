# OpenClaw Configuration Reference

> **Complete reference for every configuration section in `~/.openclaw/openclaw.json`.**
>
> Edit via the **Gateway Config** UI page (Form mode or Raw JSON), or directly in the JSON file.
> Changes require **Apply & Restart** to take effect.

---

## Table of Contents

| #   | Section                        | Description                                                                                                     |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 1   | [Meta](#1-meta)                | Version tracking metadata                                                                                       |
| 2   | [Env](#2-env)                  | Environment variables and shell env                                                                             |
| 3   | [Wizard](#3-wizard)            | Setup wizard state                                                                                              |
| 4   | [Diagnostics](#4-diagnostics)  | OpenTelemetry, cache tracing, debug flags                                                                       |
| 5   | [Logging](#5-logging)          | Log levels, files, console output                                                                               |
| 6   | [Update](#6-update)            | Auto-update channel and behavior                                                                                |
| 7   | [Browser](#7-browser)          | Browser control, CDP, profiles, SSRF                                                                            |
| 8   | [UI](#8-ui)                    | Web UI appearance and assistant identity                                                                        |
| 9   | [Auth](#9-auth)                | API key profiles, failover, cooldowns                                                                           |
| 10  | [Models](#10-models)           | LLM providers, custom endpoints, model definitions                                                              |
| 11  | [Node Host](#11-node-host)     | Node hosting and browser proxy                                                                                  |
| 12  | [Agents](#12-agents)           | Agent list, defaults, identity, heartbeat, sandbox                                                              |
| 13  | [Tools](#13-tools)             | Tool policies, exec, web search/fetch, media understanding                                                      |
| 14  | [Bindings](#14-bindings)       | Channel-to-agent routing                                                                                        |
| 15  | [Broadcast](#15-broadcast)     | Multi-agent broadcast configuration                                                                             |
| 16  | [Audio](#16-audio)             | Audio transcription                                                                                             |
| 17  | [Media](#17-media)             | Media handling settings                                                                                         |
| 18  | [Messages](#18-messages)       | Message processing, queuing, reactions, TTS                                                                     |
| 19  | [Commands](#19-commands)       | Slash commands and chat command access                                                                          |
| 20  | [Approvals](#20-approvals)     | Exec approval forwarding                                                                                        |
| 21  | [Session](#21-session)         | Session scope, reset, maintenance                                                                               |
| 22  | [Cron](#22-cron)               | Scheduled job configuration                                                                                     |
| 23  | [Hooks](#23-hooks)             | Webhook endpoints and Gmail integration                                                                         |
| 24  | [Web](#24-web)                 | WebChat/WebSocket client settings                                                                               |
| 25  | [Channels](#25-channels)       | Channel plugins (Discord, Telegram, WhatsApp, Slack, Signal, IRC, iMessage, MS Teams, Google Chat, BlueBubbles) |
| 26  | [Discovery](#26-discovery)     | mDNS and wide-area service discovery                                                                            |
| 27  | [Canvas Host](#27-canvas-host) | Canvas hosting for rich UI                                                                                      |
| 28  | [Talk](#28-talk)               | Voice/talk mode settings                                                                                        |
| 29  | [Gateway](#29-gateway)         | Core server: port, bind, TLS, auth, Control UI, reload, security                                                |
| 30  | [Memory](#30-memory)           | Memory backend (builtin or QMD)                                                                                 |
| 31  | [Skills](#31-skills)           | Skill loading, limits, per-skill config                                                                         |
| 32  | [Plugins](#32-plugins)         | Plugin system, slots, install records                                                                           |

---

## 1. Meta

**What it is:** Automatic metadata tracking for the config file itself. You rarely edit these manually — OpenClaw sets them when it writes the config.

**When you need it:** Debugging config version mismatches or tracking when the config was last modified.

| Setting                   | Type   | Default | Description                                                 |
| ------------------------- | ------ | ------- | ----------------------------------------------------------- |
| `meta.lastTouchedVersion` | string | —       | Auto-set to the OpenClaw version that last wrote the config |
| `meta.lastTouchedAt`      | string | —       | ISO timestamp of the last config write (auto-set)           |

```json
{
  "meta": {
    "lastTouchedVersion": "0.42.0",
    "lastTouchedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

> **Note:** These fields are auto-managed. You generally don't need to touch them.

---

## 2. Env

**What it is:** Environment variable injection for the gateway process and agent exec runs. You can define custom variables or enable shell environment loading.

**When you need it:** Passing API keys via environment, setting PATH overrides, or injecting custom env vars into agent exec runs without modifying shell profiles.

| Setting                  | Type    | Default | Description                                                 |
| ------------------------ | ------- | ------- | ----------------------------------------------------------- |
| `env.shellEnv.enabled`   | boolean | —       | Load variables from the user's shell environment on startup |
| `env.shellEnv.timeoutMs` | number  | —       | Timeout for shell env loading (ms)                          |
| `env.vars`               | object  | —       | Key-value map of environment variables to inject            |

```json
{
  "env": {
    "shellEnv": {
      "enabled": true,
      "timeoutMs": 5000
    },
    "vars": {
      "OPENAI_API_KEY": "sk-...",
      "CUSTOM_PATH": "/opt/bin"
    }
  }
}
```

> **Tip:** The `env` object also accepts arbitrary string keys at the top level (catchall), but `shellEnv` and `vars` are the structured settings.

---

## 3. Wizard

**What it is:** Tracks the state of the setup wizard — when it last ran, which version, and which mode.

**When you need it:** You don't edit this manually. OpenClaw updates it after running the setup wizard.

| Setting                 | Type   | Default | Description                         |
| ----------------------- | ------ | ------- | ----------------------------------- |
| `wizard.lastRunAt`      | string | —       | ISO timestamp of last wizard run    |
| `wizard.lastRunVersion` | string | —       | OpenClaw version at wizard run time |
| `wizard.lastRunCommit`  | string | —       | Git commit hash at wizard run time  |
| `wizard.lastRunCommand` | string | —       | Command used for the wizard run     |
| `wizard.lastRunMode`    | string | —       | `"local"` or `"remote"`             |

```json
{
  "wizard": {
    "lastRunAt": "2025-01-10T08:00:00Z",
    "lastRunVersion": "0.42.0",
    "lastRunMode": "local"
  }
}
```

---

## 4. Diagnostics

**What it is:** Controls diagnostic logging, OpenTelemetry export, and cache tracing for debugging.

**When you need it:** Troubleshooting agent behavior, sending traces to Jaeger/Grafana, or debugging cache behavior in embedded agent runs.

### Core Diagnostics

| Setting               | Type     | Default | Description                                                                                                          |
| --------------------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `diagnostics.enabled` | boolean  | —       | Master toggle for diagnostics                                                                                        |
| `diagnostics.flags`   | string[] | —       | Enable targeted diagnostic logs by flag (e.g., `["telegram.http"]`). Supports wildcards like `"telegram.*"` or `"*"` |

### OpenTelemetry (OTEL)

| Setting                            | Type    | Default | Description                         |
| ---------------------------------- | ------- | ------- | ----------------------------------- |
| `diagnostics.otel.enabled`         | boolean | —       | Enable OpenTelemetry export         |
| `diagnostics.otel.endpoint`        | string  | —       | OTEL collector endpoint URL         |
| `diagnostics.otel.protocol`        | string  | —       | `"http/protobuf"` or `"grpc"`       |
| `diagnostics.otel.headers`         | object  | —       | Extra headers for the OTEL exporter |
| `diagnostics.otel.serviceName`     | string  | —       | Service name reported to OTEL       |
| `diagnostics.otel.traces`          | boolean | —       | Enable trace export                 |
| `diagnostics.otel.metrics`         | boolean | —       | Enable metrics export               |
| `diagnostics.otel.logs`            | boolean | —       | Enable log export                   |
| `diagnostics.otel.sampleRate`      | number  | —       | Trace sample rate (0.0–1.0)         |
| `diagnostics.otel.flushIntervalMs` | number  | —       | Flush interval in milliseconds      |

### Cache Trace

| Setting                                  | Type    | Default                                      | Description                                       |
| ---------------------------------------- | ------- | -------------------------------------------- | ------------------------------------------------- |
| `diagnostics.cacheTrace.enabled`         | boolean | `false`                                      | Log cache trace snapshots for embedded agent runs |
| `diagnostics.cacheTrace.filePath`        | string  | `$OPENCLAW_STATE_DIR/logs/cache-trace.jsonl` | JSONL output path                                 |
| `diagnostics.cacheTrace.includeMessages` | boolean | `true`                                       | Include full message payloads                     |
| `diagnostics.cacheTrace.includePrompt`   | boolean | `true`                                       | Include prompt text                               |
| `diagnostics.cacheTrace.includeSystem`   | boolean | `true`                                       | Include system prompt                             |

```json
{
  "diagnostics": {
    "enabled": true,
    "flags": ["telegram.*"],
    "otel": {
      "enabled": true,
      "endpoint": "http://localhost:4318",
      "protocol": "http/protobuf",
      "serviceName": "openclaw-gateway",
      "traces": true,
      "metrics": true,
      "sampleRate": 0.5
    },
    "cacheTrace": {
      "enabled": false
    }
  }
}
```

> **Tip:** Use `diagnostics.flags` with wildcards for targeted debugging without enabling full trace export.

---

## 5. Logging

**What it is:** Controls log levels, output destinations, formatting, and sensitive data redaction.

**When you need it:** Adjusting verbosity for troubleshooting, writing logs to a file, or ensuring sensitive data (API keys, tokens) is redacted.

| Setting                   | Type     | Default    | Description                                                                                |
| ------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------ |
| `logging.level`           | string   | `"info"`   | File log level: `"silent"`, `"fatal"`, `"error"`, `"warn"`, `"info"`, `"debug"`, `"trace"` |
| `logging.file`            | string   | —          | Path to log file                                                                           |
| `logging.consoleLevel`    | string   | —          | Console output level (same options as `level`)                                             |
| `logging.consoleStyle`    | string   | `"pretty"` | Console format: `"pretty"`, `"compact"`, `"json"`                                          |
| `logging.redactSensitive` | string   | —          | Redaction mode: `"off"` or `"tools"` (redact sensitive values in tool output)              |
| `logging.redactPatterns`  | string[] | —          | Additional regex patterns to redact from logs                                              |

```json
{
  "logging": {
    "level": "info",
    "file": "/var/log/openclaw/gateway.log",
    "consoleLevel": "warn",
    "consoleStyle": "pretty",
    "redactSensitive": "tools",
    "redactPatterns": ["password", "secret"]
  }
}
```

> **Tip:** Use `"json"` console style for machine-parsable output when piping to log aggregators. Use `"trace"` level only for deep debugging — it's very verbose.

---

## 6. Update

**What it is:** Controls auto-update behavior — which release channel to track and whether to check for updates on startup.

**When you need it:** Switching between stable, beta, and dev releases, or disabling startup update checks for air-gapped environments.

| Setting               | Type    | Default    | Description                                      |
| --------------------- | ------- | ---------- | ------------------------------------------------ |
| `update.channel`      | string  | `"stable"` | Update channel: `"stable"`, `"beta"`, or `"dev"` |
| `update.checkOnStart` | boolean | `true`     | Check for npm updates when the gateway starts    |

```json
{
  "update": {
    "channel": "stable",
    "checkOnStart": true
  }
}
```

---

## 7. Browser

**What it is:** Controls the built-in browser automation system — Playwright/CDP management, browser profiles, SSRF protection, and snapshot defaults.

**When you need it:** Enabling browser-based tools for web scraping, configuring multiple browser profiles (e.g., one for automation, one via Chrome extension), or restricting which hosts the browser can access.

### Core Settings

| Setting                               | Type    | Default | Description                                             |
| ------------------------------------- | ------- | ------- | ------------------------------------------------------- |
| `browser.enabled`                     | boolean | —       | Enable browser control                                  |
| `browser.evaluateEnabled`             | boolean | —       | Allow JavaScript evaluation in the browser              |
| `browser.cdpUrl`                      | string  | —       | Default CDP (Chrome DevTools Protocol) URL              |
| `browser.remoteCdpTimeoutMs`          | number  | —       | Timeout for remote CDP connections (ms)                 |
| `browser.remoteCdpHandshakeTimeoutMs` | number  | —       | Timeout for remote CDP handshake (ms)                   |
| `browser.color`                       | string  | —       | Default highlight color for browser interactions        |
| `browser.executablePath`              | string  | —       | Path to browser executable                              |
| `browser.headless`                    | boolean | —       | Run browser in headless mode                            |
| `browser.noSandbox`                   | boolean | —       | Disable Chromium sandbox (needed in some Docker setups) |
| `browser.attachOnly`                  | boolean | —       | Only attach to existing browser instances, never launch |
| `browser.defaultProfile`              | string  | —       | Default browser profile name                            |

### Snapshot Defaults

| Setting                         | Type   | Default | Description                  |
| ------------------------------- | ------ | ------- | ---------------------------- |
| `browser.snapshotDefaults.mode` | string | —       | Snapshot mode: `"efficient"` |

### SSRF Policy

| Setting                                  | Type     | Default | Description                                            |
| ---------------------------------------- | -------- | ------- | ------------------------------------------------------ |
| `browser.ssrfPolicy.allowPrivateNetwork` | boolean  | —       | Allow navigation to private/internal IPs               |
| `browser.ssrfPolicy.allowedHostnames`    | string[] | —       | Hostnames explicitly allowed despite SSRF restrictions |
| `browser.ssrfPolicy.hostnameAllowlist`   | string[] | —       | Alias for allowedHostnames                             |

### Browser Profiles

Profiles let you define multiple browser instances with different CDP ports, drivers, and highlight colors. Profile names must be alphanumeric with hyphens only.

| Setting                           | Type   | Default | Description                                                  |
| --------------------------------- | ------ | ------- | ------------------------------------------------------------ |
| `browser.profiles.<name>.cdpPort` | number | —       | CDP port for this profile (1–65535)                          |
| `browser.profiles.<name>.cdpUrl`  | string | —       | CDP URL for this profile (alternative to cdpPort)            |
| `browser.profiles.<name>.driver`  | string | —       | Driver: `"clawd"` (built-in) or `"extension"` (Chrome relay) |
| `browser.profiles.<name>.color`   | string | —       | Hex highlight color for this profile (e.g., `"#00bcd4"`)     |

> **Note:** Each profile must set either `cdpPort` or `cdpUrl`.

```json
{
  "browser": {
    "enabled": true,
    "headless": true,
    "noSandbox": true,
    "evaluateEnabled": false,
    "defaultProfile": "openclaw",
    "profiles": {
      "openclaw": {
        "cdpPort": 18792,
        "driver": "clawd",
        "color": "#00bcd4"
      },
      "chrome": {
        "cdpPort": 9222,
        "driver": "extension",
        "color": "#ff5722"
      }
    },
    "ssrfPolicy": {
      "allowPrivateNetwork": false
    }
  }
}
```

> **⚠️ Warning:** Setting `evaluateEnabled: true` allows the agent to execute arbitrary JavaScript in the browser. Only enable this if you trust the agent fully.

---

## 8. UI

**What it is:** Controls the appearance of the OpenClaw web interface — accent color and assistant identity shown in WebChat.

**When you need it:** Customizing the look and feel of the Control UI or WebChat interface.

| Setting               | Type   | Default | Description                                     |
| --------------------- | ------ | ------- | ----------------------------------------------- |
| `ui.seamColor`        | string | —       | Hex accent color for the UI (e.g., `"#7c4dff"`) |
| `ui.assistant.name`   | string | —       | Assistant display name (max 50 chars)           |
| `ui.assistant.avatar` | string | —       | Assistant avatar URL or path (max 200 chars)    |

```json
{
  "ui": {
    "seamColor": "#7c4dff",
    "assistant": {
      "name": "Cortex",
      "avatar": "https://example.com/avatar.png"
    }
  }
}
```

---

## 9. Auth

**What it is:** Manages API authentication profiles for LLM providers. Profiles define how OpenClaw authenticates with each provider, and the `order` field controls failover priority.

**When you need it:** Setting up multiple API keys (personal + work), configuring automatic failover between providers, or managing billing backoff when credits run low.

### Auth Profiles

| Setting                         | Type   | Default | Description                                                 |
| ------------------------------- | ------ | ------- | ----------------------------------------------------------- |
| `auth.profiles.<name>.provider` | string | —       | Provider name (e.g., `"anthropic"`, `"openai"`, `"google"`) |
| `auth.profiles.<name>.mode`     | string | —       | Auth mode: `"api_key"`, `"oauth"`, or `"token"`             |
| `auth.profiles.<name>.email`    | string | —       | Optional associated email                                   |

### Profile Order

| Setting                 | Type     | Default | Description                                                              |
| ----------------------- | -------- | ------- | ------------------------------------------------------------------------ |
| `auth.order.<provider>` | string[] | —       | Ordered profile IDs for each provider (first = primary, rest = failover) |

### Cooldowns

| Setting                                        | Type   | Default | Description                                        |
| ---------------------------------------------- | ------ | ------- | -------------------------------------------------- |
| `auth.cooldowns.billingBackoffHours`           | number | `5`     | Base backoff (hours) after billing/credit errors   |
| `auth.cooldowns.billingBackoffHoursByProvider` | object | —       | Per-provider overrides for billing backoff (hours) |
| `auth.cooldowns.billingMaxHours`               | number | `24`    | Cap (hours) for billing backoff                    |
| `auth.cooldowns.failureWindowHours`            | number | `24`    | Failure window (hours) for backoff counters        |

```json
{
  "auth": {
    "profiles": {
      "anthropic-main": {
        "provider": "anthropic",
        "mode": "api_key"
      },
      "openai-backup": {
        "provider": "openai",
        "mode": "api_key"
      }
    },
    "order": {
      "anthropic": ["anthropic-main"],
      "openai": ["openai-backup"]
    },
    "cooldowns": {
      "billingBackoffHours": 5,
      "billingMaxHours": 24,
      "failureWindowHours": 24
    }
  }
}
```

> **Tip:** With multiple profiles per provider, OpenClaw automatically fails over when one profile hits billing limits. The `order` array determines priority.

---

## 10. Models

**What it is:** Defines LLM provider endpoints, API keys, and custom model definitions. This is where you configure OpenAI, Anthropic, Google, Ollama, AWS Bedrock, and any OpenAI-compatible endpoint.

**When you need it:** Adding new model providers, configuring custom base URLs (proxies, local models), defining model cost/capability metadata, or setting up Bedrock auto-discovery.

### Top-Level

| Setting       | Type   | Default   | Description                                                                  |
| ------------- | ------ | --------- | ---------------------------------------------------------------------------- |
| `models.mode` | string | `"merge"` | `"merge"` extends built-in providers; `"replace"` uses only your definitions |

### Providers

Each key under `models.providers` is a provider ID (e.g., `"openai"`, `"anthropic"`, `"ollama"`, or any custom name).

| Setting                            | Type    | Default      | Description                                                                                                                                                           |
| ---------------------------------- | ------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models.providers.<id>.baseUrl`    | string  | **required** | API base URL for this provider                                                                                                                                        |
| `models.providers.<id>.apiKey`     | string  | —            | API key (⚠️ sensitive)                                                                                                                                                |
| `models.providers.<id>.auth`       | string  | —            | Auth method: `"api-key"`, `"aws-sdk"`, `"oauth"`, `"token"`                                                                                                           |
| `models.providers.<id>.api`        | string  | —            | API type: `"openai-completions"`, `"openai-responses"`, `"anthropic-messages"`, `"google-generative-ai"`, `"github-copilot"`, `"bedrock-converse-stream"`, `"ollama"` |
| `models.providers.<id>.headers`    | object  | —            | Extra HTTP headers for all requests to this provider                                                                                                                  |
| `models.providers.<id>.authHeader` | boolean | —            | Whether to send the API key in the Authorization header                                                                                                               |
| `models.providers.<id>.models`     | array   | **required** | Array of model definitions (see below)                                                                                                                                |

### Model Definitions

Each entry in the `models` array defines a model available from the provider:

| Setting           | Type     | Default      | Description                                         |
| ----------------- | -------- | ------------ | --------------------------------------------------- |
| `id`              | string   | **required** | Model ID (e.g., `"claude-sonnet-4-20250514"`)       |
| `name`            | string   | **required** | Human-readable name                                 |
| `api`             | string   | —            | Override the provider-level API type for this model |
| `reasoning`       | boolean  | —            | Whether this is a reasoning/thinking model          |
| `input`           | string[] | —            | Input modalities: `["text"]` or `["text", "image"]` |
| `cost.input`      | number   | —            | Cost per million input tokens (USD)                 |
| `cost.output`     | number   | —            | Cost per million output tokens (USD)                |
| `cost.cacheRead`  | number   | —            | Cost per million cached read tokens                 |
| `cost.cacheWrite` | number   | —            | Cost per million cached write tokens                |
| `contextWindow`   | number   | —            | Context window size in tokens                       |
| `maxTokens`       | number   | —            | Max output tokens                                   |
| `headers`         | object   | —            | Extra headers for this specific model               |
| `compat`          | object   | —            | Compatibility flags (see below)                     |

### Model Compatibility Flags

| Setting                                   | Type    | Description                                                     |
| ----------------------------------------- | ------- | --------------------------------------------------------------- |
| `compat.supportsStore`                    | boolean | Whether the model supports the `store` parameter                |
| `compat.supportsDeveloperRole`            | boolean | Whether the model supports the `developer` role                 |
| `compat.supportsReasoningEffort`          | boolean | Whether the model supports reasoning effort control             |
| `compat.supportsUsageInStreaming`         | boolean | Whether usage stats are included in streaming responses         |
| `compat.supportsStrictMode`               | boolean | Whether the model supports strict mode for tool schemas         |
| `compat.maxTokensField`                   | string  | Which field to use: `"max_completion_tokens"` or `"max_tokens"` |
| `compat.thinkingFormat`                   | string  | Thinking format: `"openai"`, `"zai"`, or `"qwen"`               |
| `compat.requiresToolResultName`           | boolean | Whether tool results must include the `name` field              |
| `compat.requiresAssistantAfterToolResult` | boolean | Whether an assistant message is required after tool results     |
| `compat.requiresThinkingAsText`           | boolean | Whether thinking content must be sent as text blocks            |
| `compat.requiresMistralToolIds`           | boolean | Whether Mistral-style tool call IDs are required                |

### Bedrock Discovery

| Setting                                        | Type     | Default | Description                                  |
| ---------------------------------------------- | -------- | ------- | -------------------------------------------- |
| `models.bedrockDiscovery.enabled`              | boolean  | —       | Enable AWS Bedrock model auto-discovery      |
| `models.bedrockDiscovery.region`               | string   | —       | AWS region for discovery                     |
| `models.bedrockDiscovery.providerFilter`       | string[] | —       | Filter discovered models by provider         |
| `models.bedrockDiscovery.refreshInterval`      | number   | —       | Refresh interval (ms) for re-discovery       |
| `models.bedrockDiscovery.defaultContextWindow` | number   | —       | Default context window for discovered models |
| `models.bedrockDiscovery.defaultMaxTokens`     | number   | —       | Default max tokens for discovered models     |

```json
{
  "models": {
    "mode": "merge",
    "providers": {
      "ollama": {
        "baseUrl": "http://192.168.1.167:11434",
        "api": "ollama",
        "models": [
          {
            "id": "llama3.1:70b",
            "name": "Llama 3.1 70B",
            "input": ["text"],
            "contextWindow": 131072
          }
        ]
      },
      "custom-openai": {
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "sk-...",
        "api": "openai-completions",
        "models": [
          {
            "id": "gpt-4o",
            "name": "GPT-4o",
            "input": ["text", "image"],
            "contextWindow": 128000,
            "maxTokens": 16384,
            "cost": { "input": 2.5, "output": 10.0 }
          }
        ]
      }
    },
    "bedrockDiscovery": {
      "enabled": true,
      "region": "us-east-1"
    }
  }
}
```

> **Tip:** Use `"mode": "merge"` (default) to add custom providers alongside the built-in catalog. Use `"replace"` only if you want full control over the model list.

---

## 11. Node Host

**What it is:** Controls settings for when this machine acts as a node host — specifically the browser proxy feature that exposes local browser control to the gateway.

**When you need it:** Running OpenClaw on a separate node and wanting to share browser access back to the gateway.

| Setting                               | Type     | Default | Description                                            |
| ------------------------------------- | -------- | ------- | ------------------------------------------------------ |
| `nodeHost.browserProxy.enabled`       | boolean  | —       | Expose the local browser control server via node proxy |
| `nodeHost.browserProxy.allowProfiles` | string[] | —       | Optional allowlist of browser profile names to expose  |

```json
{
  "nodeHost": {
    "browserProxy": {
      "enabled": true,
      "allowProfiles": ["openclaw"]
    }
  }
}
```

---

## 12. Agents

**What it is:** The core agent configuration — defines the agent list, default settings, models, heartbeat, identity, memory search, sandbox, and more.

**When you need it:** Always — this is where you define your agents, set the default model, configure workspace paths, heartbeat behavior, and per-agent overrides.

### Agent Defaults

These defaults apply to all agents unless overridden at the agent level.

#### Model & Workspace

| Setting                                  | Type     | Default  | Description                                                    |
| ---------------------------------------- | -------- | -------- | -------------------------------------------------------------- |
| `agents.defaults.model.primary`          | string   | —        | Primary model (provider/model format)                          |
| `agents.defaults.model.fallbacks`        | string[] | —        | Ordered fallback models                                        |
| `agents.defaults.imageModel.primary`     | string   | —        | Image-capable model for vision tasks                           |
| `agents.defaults.imageModel.fallbacks`   | string[] | —        | Fallback image models                                          |
| `agents.defaults.models`                 | object   | —        | Configured model catalog with aliases and params               |
| `agents.defaults.workspace`              | string   | —        | Default workspace directory for agents                         |
| `agents.defaults.repoRoot`               | string   | —        | Repository root shown in system prompt (overrides auto-detect) |
| `agents.defaults.skipBootstrap`          | boolean  | —        | Skip loading workspace bootstrap files (AGENTS.md, etc.)       |
| `agents.defaults.bootstrapMaxChars`      | number   | `20000`  | Max chars per bootstrap file injected into system prompt       |
| `agents.defaults.bootstrapTotalMaxChars` | number   | `150000` | Max total chars across all bootstrap files                     |

#### Timezone & Envelope

| Setting                             | Type   | Default  | Description                                                                   |
| ----------------------------------- | ------ | -------- | ----------------------------------------------------------------------------- |
| `agents.defaults.userTimezone`      | string | —        | User timezone (IANA format, e.g., `"America/New_York"`)                       |
| `agents.defaults.timeFormat`        | string | `"auto"` | Time format: `"auto"`, `"12"`, or `"24"`                                      |
| `agents.defaults.envelopeTimezone`  | string | —        | Timezone for message envelopes (`"utc"`, `"local"`, `"user"`, or IANA string) |
| `agents.defaults.envelopeTimestamp` | string | —        | Include timestamps in envelopes: `"on"` or `"off"`                            |
| `agents.defaults.envelopeElapsed`   | string | —        | Include elapsed time in envelopes: `"on"` or `"off"`                          |

#### Context & Compaction

| Setting                                                      | Type    | Default     | Description                                   |
| ------------------------------------------------------------ | ------- | ----------- | --------------------------------------------- |
| `agents.defaults.contextTokens`                              | number  | —           | Token budget for context window               |
| `agents.defaults.compaction.mode`                            | string  | `"default"` | Compaction mode: `"default"` or `"safeguard"` |
| `agents.defaults.compaction.reserveTokens`                   | number  | —           | Tokens to reserve for response                |
| `agents.defaults.compaction.keepRecentTokens`                | number  | —           | Recent tokens to always keep                  |
| `agents.defaults.compaction.reserveTokensFloor`              | number  | —           | Minimum reserved tokens                       |
| `agents.defaults.compaction.maxHistoryShare`                 | number  | —           | Max share of context for history (0.1–0.9)    |
| `agents.defaults.compaction.memoryFlush.enabled`             | boolean | —           | Enable memory flush on compaction             |
| `agents.defaults.compaction.memoryFlush.softThresholdTokens` | number  | —           | Token threshold for soft flush                |
| `agents.defaults.compaction.memoryFlush.prompt`              | string  | —           | Custom prompt for memory flush                |
| `agents.defaults.compaction.memoryFlush.systemPrompt`        | string  | —           | Custom system prompt for flush                |

#### Context Pruning

| Setting                                               | Type   | Default | Description                                        |
| ----------------------------------------------------- | ------ | ------- | -------------------------------------------------- |
| `agents.defaults.contextPruning.mode`                 | string | `"off"` | `"off"` or `"cache-ttl"`                           |
| `agents.defaults.contextPruning.ttl`                  | string | —       | TTL duration for cached context                    |
| `agents.defaults.contextPruning.keepLastAssistants`   | number | —       | Number of recent assistant messages to always keep |
| `agents.defaults.contextPruning.softTrimRatio`        | number | —       | Ratio threshold for soft trimming (0–1)            |
| `agents.defaults.contextPruning.hardClearRatio`       | number | —       | Ratio threshold for hard clearing (0–1)            |
| `agents.defaults.contextPruning.minPrunableToolChars` | number | —       | Minimum chars in tool result to be prunable        |

#### Behavior Defaults

| Setting                                 | Type   | Default | Description                                                                            |
| --------------------------------------- | ------ | ------- | -------------------------------------------------------------------------------------- |
| `agents.defaults.thinkingDefault`       | string | —       | Default thinking level: `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"`, `"xhigh"` |
| `agents.defaults.verboseDefault`        | string | —       | Default verbose mode: `"off"`, `"on"`, `"full"`                                        |
| `agents.defaults.elevatedDefault`       | string | —       | Default elevated exec mode: `"off"`, `"on"`, `"ask"`, `"full"`                         |
| `agents.defaults.blockStreamingDefault` | string | —       | Default block streaming: `"off"` or `"on"`                                             |
| `agents.defaults.blockStreamingBreak`   | string | —       | Block break point: `"text_end"` or `"message_end"`                                     |
| `agents.defaults.humanDelay.mode`       | string | —       | Delay style: `"off"`, `"natural"`, `"custom"`                                          |
| `agents.defaults.humanDelay.minMs`      | number | `800`   | Minimum delay (ms) for custom mode                                                     |
| `agents.defaults.humanDelay.maxMs`      | number | `2500`  | Maximum delay (ms) for custom mode                                                     |
| `agents.defaults.timeoutSeconds`        | number | —       | Default timeout for agent responses                                                    |
| `agents.defaults.mediaMaxMb`            | number | —       | Max media attachment size in MB                                                        |
| `agents.defaults.imageMaxDimensionPx`   | number | `1200`  | Max image side length in pixels                                                        |
| `agents.defaults.typingIntervalSeconds` | number | —       | How often to send typing indicators                                                    |
| `agents.defaults.typingMode`            | string | —       | When to show typing: `"never"`, `"instant"`, `"thinking"`, `"message"`                 |
| `agents.defaults.maxConcurrent`         | number | —       | Max concurrent agent runs                                                              |

#### Heartbeat

| Setting                                               | Type    | Default | Description                                                 |
| ----------------------------------------------------- | ------- | ------- | ----------------------------------------------------------- |
| `agents.defaults.heartbeat.every`                     | string  | —       | Heartbeat interval (duration string, e.g., `"30m"`, `"1h"`) |
| `agents.defaults.heartbeat.activeHours.start`         | string  | —       | Active hours start (24h format, e.g., `"08:00"`)            |
| `agents.defaults.heartbeat.activeHours.end`           | string  | —       | Active hours end (e.g., `"23:00"`)                          |
| `agents.defaults.heartbeat.activeHours.timezone`      | string  | —       | Timezone for active hours                                   |
| `agents.defaults.heartbeat.model`                     | string  | —       | Model to use for heartbeat runs                             |
| `agents.defaults.heartbeat.session`                   | string  | —       | Session key for heartbeat                                   |
| `agents.defaults.heartbeat.includeReasoning`          | boolean | —       | Include reasoning output in heartbeat                       |
| `agents.defaults.heartbeat.target`                    | string  | —       | Delivery target channel                                     |
| `agents.defaults.heartbeat.to`                        | string  | —       | Delivery target peer                                        |
| `agents.defaults.heartbeat.accountId`                 | string  | —       | Account ID for delivery                                     |
| `agents.defaults.heartbeat.prompt`                    | string  | —       | Custom heartbeat prompt                                     |
| `agents.defaults.heartbeat.ackMaxChars`               | number  | —       | Max chars for heartbeat ack messages (0 = suppress)         |
| `agents.defaults.heartbeat.suppressToolErrorWarnings` | boolean | —       | Suppress tool error warnings during heartbeat               |

#### Subagents

| Setting                                         | Type          | Default | Description                                  |
| ----------------------------------------------- | ------------- | ------- | -------------------------------------------- |
| `agents.defaults.subagents.maxConcurrent`       | number        | —       | Max concurrent sub-agents                    |
| `agents.defaults.subagents.maxSpawnDepth`       | number        | `1`     | Maximum nesting depth (1–5)                  |
| `agents.defaults.subagents.maxChildrenPerAgent` | number        | `5`     | Max active children per agent session (1–20) |
| `agents.defaults.subagents.archiveAfterMinutes` | number        | —       | Auto-archive sub-agents after N minutes      |
| `agents.defaults.subagents.model`               | string/object | —       | Model override for sub-agents                |
| `agents.defaults.subagents.thinking`            | string        | —       | Thinking level override for sub-agents       |

#### Memory Search (per-agent)

| Setting                                                                | Type     | Default      | Description                                                                |
| ---------------------------------------------------------------------- | -------- | ------------ | -------------------------------------------------------------------------- |
| `agents.defaults.memorySearch.enabled`                                 | boolean  | —            | Enable vector search over memory files                                     |
| `agents.defaults.memorySearch.sources`                                 | string[] | `["memory"]` | Sources to index: `"memory"`, `"sessions"`                                 |
| `agents.defaults.memorySearch.extraPaths`                              | string[] | —            | Extra paths to include in search index                                     |
| `agents.defaults.memorySearch.provider`                                | string   | —            | Embedding provider: `"openai"`, `"local"`, `"gemini"`, `"voyage"`          |
| `agents.defaults.memorySearch.model`                                   | string   | —            | Embedding model name                                                       |
| `agents.defaults.memorySearch.fallback`                                | string   | —            | Fallback provider: `"openai"`, `"gemini"`, `"local"`, `"voyage"`, `"none"` |
| `agents.defaults.memorySearch.remote.baseUrl`                          | string   | —            | Custom base URL for remote embeddings                                      |
| `agents.defaults.memorySearch.remote.apiKey`                           | string   | —            | API key for remote embedding provider (⚠️ sensitive)                       |
| `agents.defaults.memorySearch.store.path`                              | string   | —            | SQLite index path                                                          |
| `agents.defaults.memorySearch.store.vector.enabled`                    | boolean  | `true`       | Enable sqlite-vec extension for vector search                              |
| `agents.defaults.memorySearch.store.vector.extensionPath`              | string   | —            | Override path to sqlite-vec library                                        |
| `agents.defaults.memorySearch.chunking.tokens`                         | number   | —            | Tokens per chunk                                                           |
| `agents.defaults.memorySearch.chunking.overlap`                        | number   | —            | Overlap tokens between chunks                                              |
| `agents.defaults.memorySearch.query.maxResults`                        | number   | —            | Max search results                                                         |
| `agents.defaults.memorySearch.query.minScore`                          | number   | —            | Minimum similarity score (0–1)                                             |
| `agents.defaults.memorySearch.query.hybrid.enabled`                    | boolean  | `true`       | Enable hybrid BM25 + vector search                                         |
| `agents.defaults.memorySearch.query.hybrid.vectorWeight`               | number   | —            | Vector similarity weight (0–1)                                             |
| `agents.defaults.memorySearch.query.hybrid.textWeight`                 | number   | —            | BM25 text relevance weight (0–1)                                           |
| `agents.defaults.memorySearch.query.hybrid.mmr.enabled`                | boolean  | `false`      | Enable MMR re-ranking to reduce duplicates                                 |
| `agents.defaults.memorySearch.query.hybrid.mmr.lambda`                 | number   | `0.7`        | MMR balance (0=diversity, 1=relevance)                                     |
| `agents.defaults.memorySearch.query.hybrid.temporalDecay.enabled`      | boolean  | `false`      | Enable recency decay                                                       |
| `agents.defaults.memorySearch.query.hybrid.temporalDecay.halfLifeDays` | number   | `30`         | Half-life in days                                                          |
| `agents.defaults.memorySearch.cache.enabled`                           | boolean  | `true`       | Cache chunk embeddings                                                     |
| `agents.defaults.memorySearch.sync.onSessionStart`                     | boolean  | —            | Reindex on session start                                                   |
| `agents.defaults.memorySearch.sync.onSearch`                           | boolean  | —            | Lazy reindex on search                                                     |
| `agents.defaults.memorySearch.sync.watch`                              | boolean  | —            | Watch memory files for changes                                             |

#### Sandbox

| Setting                                   | Type          | Default | Description                                          |
| ----------------------------------------- | ------------- | ------- | ---------------------------------------------------- |
| `agents.defaults.sandbox.mode`            | string        | —       | Sandbox mode: `"off"`, `"non-main"`, `"all"`         |
| `agents.defaults.sandbox.workspaceAccess` | string        | —       | Workspace access: `"none"`, `"ro"`, `"rw"`           |
| `agents.defaults.sandbox.scope`           | string        | —       | Scope: `"session"`, `"agent"`, `"shared"`            |
| `agents.defaults.sandbox.docker.image`    | string        | —       | Docker image for sandbox containers                  |
| `agents.defaults.sandbox.docker.network`  | string        | —       | Docker network (not `"host"` — blocked for security) |
| `agents.defaults.sandbox.docker.memory`   | string/number | —       | Memory limit                                         |
| `agents.defaults.sandbox.docker.cpus`     | number        | —       | CPU limit                                            |
| `agents.defaults.sandbox.browser.enabled` | boolean       | —       | Enable browser in sandbox containers                 |

### Agent List

Each entry in `agents.list` defines an individual agent:

| Setting                         | Type          | Default      | Description                                            |
| ------------------------------- | ------------- | ------------ | ------------------------------------------------------ |
| `agents.list[].id`              | string        | **required** | Unique agent ID                                        |
| `agents.list[].default`         | boolean       | —            | Whether this is the default agent                      |
| `agents.list[].name`            | string        | —            | Display name                                           |
| `agents.list[].workspace`       | string        | —            | Override workspace directory                           |
| `agents.list[].agentDir`        | string        | —            | Custom agent data directory                            |
| `agents.list[].model`           | string/object | —            | Model override (string or `{primary, fallbacks}`)      |
| `agents.list[].skills`          | string[]      | —            | Skill allowlist (omit = all, empty = none)             |
| `agents.list[].identity.name`   | string        | —            | Agent's display name                                   |
| `agents.list[].identity.theme`  | string        | —            | Agent's theme                                          |
| `agents.list[].identity.emoji`  | string        | —            | Agent's emoji                                          |
| `agents.list[].identity.avatar` | string        | —            | Avatar path, URL, or data URI                          |
| `agents.list[].heartbeat`       | object        | —            | Per-agent heartbeat override (same schema as defaults) |
| `agents.list[].memorySearch`    | object        | —            | Per-agent memory search override                       |
| `agents.list[].tools`           | object        | —            | Per-agent tool policy override                         |
| `agents.list[].sandbox`         | object        | —            | Per-agent sandbox override                             |
| `agents.list[].groupChat`       | object        | —            | Group chat settings (mentionPatterns, historyLimit)    |
| `agents.list[].subagents`       | object        | —            | Per-agent subagent settings                            |
| `agents.list[].humanDelay`      | object        | —            | Per-agent human delay settings                         |

```json
{
  "agents": {
    "defaults": {
      "model": { "primary": "anthropic/claude-sonnet-4-20250514" },
      "workspace": "/home/user",
      "userTimezone": "America/Denver",
      "thinkingDefault": "high",
      "memorySearch": {
        "enabled": true,
        "provider": "openai"
      },
      "heartbeat": {
        "every": "30m",
        "activeHours": { "start": "08:00", "end": "23:00", "timezone": "America/Denver" },
        "prompt": "Read HEARTBEAT.md if it exists. If nothing needs attention, reply HEARTBEAT_OK."
      }
    },
    "list": [
      {
        "id": "main",
        "default": true,
        "identity": { "name": "Assistant", "emoji": "🤖" },
        "model": "anthropic/claude-sonnet-4-20250514"
      }
    ]
  }
}
```

---

## 13. Tools

**What it is:** Global tool policies — which tools agents can use, exec settings, web search/fetch configuration, media understanding, link analysis, messaging cross-context rules, and loop detection.

**When you need it:** Restricting tool access, configuring web search (Brave/Perplexity), setting exec security levels, enabling media understanding (images/audio/video), or tuning loop detection.

### Tool Policy

| Setting            | Type     | Default | Description                                                    |
| ------------------ | -------- | ------- | -------------------------------------------------------------- |
| `tools.profile`    | string   | —       | Tool profile: `"minimal"`, `"coding"`, `"messaging"`, `"full"` |
| `tools.allow`      | string[] | —       | Explicit tool allowlist (overrides profile)                    |
| `tools.alsoAllow`  | string[] | —       | Additional tools on top of the profile                         |
| `tools.deny`       | string[] | —       | Tools to deny regardless of allow/profile                      |
| `tools.byProvider` | object   | —       | Per-provider tool policy overrides                             |

> **⚠️ Warning:** Don't set both `allow` and `alsoAllow` in the same scope — use `allow` for full control or `alsoAllow` to extend a profile.

### Exec Settings

| Setting                               | Type     | Default | Description                                                 |
| ------------------------------------- | -------- | ------- | ----------------------------------------------------------- |
| `tools.exec.host`                     | string   | —       | Where to run: `"sandbox"`, `"gateway"`, `"node"`            |
| `tools.exec.security`                 | string   | —       | Security level: `"deny"`, `"allowlist"`, `"full"`           |
| `tools.exec.ask`                      | string   | —       | Approval mode: `"off"`, `"on-miss"`, `"always"`             |
| `tools.exec.node`                     | string   | —       | Pin exec to a specific node                                 |
| `tools.exec.pathPrepend`              | string[] | —       | Directories to prepend to PATH                              |
| `tools.exec.safeBins`                 | string[] | —       | Safe stdin-only binaries allowed without explicit allowlist |
| `tools.exec.backgroundMs`             | number   | —       | Default background timeout (ms)                             |
| `tools.exec.timeoutSec`               | number   | —       | Default exec timeout (seconds)                              |
| `tools.exec.cleanupMs`                | number   | —       | Cleanup timeout (ms) after exec completes                   |
| `tools.exec.notifyOnExit`             | boolean  | `true`  | Enqueue system event when backgrounded exec exits           |
| `tools.exec.notifyOnExitEmptySuccess` | boolean  | `false` | Notify even on empty successful exit                        |
| `tools.exec.applyPatch.enabled`       | boolean  | —       | Enable apply_patch for OpenAI models                        |
| `tools.exec.applyPatch.workspaceOnly` | boolean  | `true`  | Restrict apply_patch to workspace                           |
| `tools.exec.applyPatch.allowModels`   | string[] | —       | Model allowlist for apply_patch                             |

### File System

| Setting                  | Type    | Default | Description                                      |
| ------------------------ | ------- | ------- | ------------------------------------------------ |
| `tools.fs.workspaceOnly` | boolean | `false` | Restrict filesystem tools to workspace directory |

### Web Search

| Setting                                 | Type    | Default                  | Description                                                        |
| --------------------------------------- | ------- | ------------------------ | ------------------------------------------------------------------ |
| `tools.web.search.enabled`              | boolean | —                        | Enable web_search tool                                             |
| `tools.web.search.provider`             | string  | —                        | Provider: `"brave"`, `"perplexity"`, `"grok"`                      |
| `tools.web.search.apiKey`               | string  | —                        | Brave Search API key (⚠️ sensitive; fallback: `BRAVE_API_KEY` env) |
| `tools.web.search.maxResults`           | number  | —                        | Default results count (1–10)                                       |
| `tools.web.search.timeoutSeconds`       | number  | —                        | Request timeout (seconds)                                          |
| `tools.web.search.cacheTtlMinutes`      | number  | —                        | Cache TTL (minutes)                                                |
| `tools.web.search.perplexity.apiKey`    | string  | —                        | Perplexity/OpenRouter API key (⚠️ sensitive)                       |
| `tools.web.search.perplexity.baseUrl`   | string  | —                        | Base URL override                                                  |
| `tools.web.search.perplexity.model`     | string  | `"perplexity/sonar-pro"` | Model override                                                     |
| `tools.web.search.grok.apiKey`          | string  | —                        | Grok API key (⚠️ sensitive)                                        |
| `tools.web.search.grok.model`           | string  | —                        | Grok model                                                         |
| `tools.web.search.grok.inlineCitations` | boolean | —                        | Enable inline citations                                            |

### Web Fetch

| Setting                           | Type    | Default | Description                         |
| --------------------------------- | ------- | ------- | ----------------------------------- |
| `tools.web.fetch.enabled`         | boolean | —       | Enable web_fetch tool               |
| `tools.web.fetch.maxChars`        | number  | —       | Max characters returned (truncated) |
| `tools.web.fetch.maxCharsCap`     | number  | —       | Hard cap for maxChars               |
| `tools.web.fetch.timeoutSeconds`  | number  | —       | Request timeout (seconds)           |
| `tools.web.fetch.cacheTtlMinutes` | number  | —       | Cache TTL (minutes)                 |
| `tools.web.fetch.maxRedirects`    | number  | `3`     | Maximum redirects                   |
| `tools.web.fetch.userAgent`       | string  | —       | Custom User-Agent header            |

### Media Understanding

| Setting                      | Type    | Default | Description                           |
| ---------------------------- | ------- | ------- | ------------------------------------- |
| `tools.media.models`         | array   | —       | Shared models for media understanding |
| `tools.media.concurrency`    | number  | —       | Max concurrent media processing       |
| `tools.media.image.enabled`  | boolean | —       | Enable image understanding            |
| `tools.media.image.maxBytes` | number  | —       | Max image file size                   |
| `tools.media.image.maxChars` | number  | —       | Max chars in analysis output          |
| `tools.media.image.prompt`   | string  | —       | Custom prompt for image analysis      |
| `tools.media.audio.enabled`  | boolean | —       | Enable audio understanding            |
| `tools.media.audio.language` | string  | —       | Audio language hint                   |
| `tools.media.video.enabled`  | boolean | —       | Enable video understanding            |

### Link Understanding

| Setting                      | Type    | Default | Description                         |
| ---------------------------- | ------- | ------- | ----------------------------------- |
| `tools.links.enabled`        | boolean | —       | Enable link extraction and analysis |
| `tools.links.maxLinks`       | number  | —       | Max links to process per message    |
| `tools.links.timeoutSeconds` | number  | —       | Timeout per link                    |

### Messaging

| Setting                                           | Type    | Default | Description                              |
| ------------------------------------------------- | ------- | ------- | ---------------------------------------- |
| `tools.message.crossContext.allowWithinProvider`  | boolean | `true`  | Allow sends within same provider         |
| `tools.message.crossContext.allowAcrossProviders` | boolean | `false` | Allow sends across providers             |
| `tools.message.crossContext.marker.enabled`       | boolean | `true`  | Add origin marker on cross-context sends |
| `tools.message.broadcast.enabled`                 | boolean | `true`  | Enable broadcast action                  |

### Session Tools

| Setting                     | Type   | Default  | Description                                                |
| --------------------------- | ------ | -------- | ---------------------------------------------------------- |
| `tools.sessions.visibility` | string | `"tree"` | Session visibility: `"self"`, `"tree"`, `"agent"`, `"all"` |

### Elevated Exec

| Setting                    | Type    | Default | Description                                 |
| -------------------------- | ------- | ------- | ------------------------------------------- |
| `tools.elevated.enabled`   | boolean | —       | Enable elevated/sudo exec                   |
| `tools.elevated.allowFrom` | object  | —       | Per-provider allowlists for elevated access |

### Loop Detection

| Setting                                             | Type    | Default | Description                            |
| --------------------------------------------------- | ------- | ------- | -------------------------------------- |
| `tools.loopDetection.enabled`                       | boolean | `false` | Enable repetitive tool-call detection  |
| `tools.loopDetection.historySize`                   | number  | `30`    | Tool history window size               |
| `tools.loopDetection.warningThreshold`              | number  | `10`    | Warning threshold                      |
| `tools.loopDetection.criticalThreshold`             | number  | `20`    | Critical threshold (must be > warning) |
| `tools.loopDetection.globalCircuitBreakerThreshold` | number  | `30`    | Global no-progress breaker             |
| `tools.loopDetection.detectors.genericRepeat`       | boolean | `true`  | Detect repeated same-tool calls        |
| `tools.loopDetection.detectors.knownPollNoProgress` | boolean | `true`  | Detect poll tools with no progress     |
| `tools.loopDetection.detectors.pingPong`            | boolean | `true`  | Detect alternating call patterns       |

```json
{
  "tools": {
    "profile": "full",
    "exec": {
      "host": "gateway",
      "security": "full",
      "timeoutSec": 300
    },
    "web": {
      "search": {
        "enabled": true,
        "provider": "brave",
        "apiKey": "BSA..."
      },
      "fetch": {
        "enabled": true,
        "maxChars": 50000
      }
    },
    "loopDetection": {
      "enabled": true
    }
  }
}
```

---

## 14. Bindings

**What it is:** Routes specific channels, accounts, or peers to specific agents. Without bindings, all messages go to the default agent.

**When you need it:** Running multiple agents where certain Discord guilds, Telegram groups, or DM peers should talk to a specific agent.

Each binding entry has:

| Setting                      | Type     | Default      | Description                                    |
| ---------------------------- | -------- | ------------ | ---------------------------------------------- |
| `bindings[].agentId`         | string   | **required** | Agent ID to route to                           |
| `bindings[].match.channel`   | string   | **required** | Channel type (e.g., `"discord"`, `"telegram"`) |
| `bindings[].match.accountId` | string   | —            | Account ID filter                              |
| `bindings[].match.peer.kind` | string   | —            | Peer type: `"direct"`, `"group"`, `"channel"`  |
| `bindings[].match.peer.id`   | string   | —            | Peer ID                                        |
| `bindings[].match.guildId`   | string   | —            | Discord guild ID filter                        |
| `bindings[].match.teamId`    | string   | —            | MS Teams team ID filter                        |
| `bindings[].match.roles`     | string[] | —            | Role filter                                    |

```json
{
  "bindings": [
    {
      "agentId": "work-agent",
      "match": {
        "channel": "discord",
        "guildId": "123456789"
      }
    },
    {
      "agentId": "personal-agent",
      "match": {
        "channel": "telegram",
        "peer": { "kind": "direct", "id": "user123" }
      }
    }
  ]
}
```

---

## 15. Broadcast

**What it is:** Configures multi-agent broadcast — when a message comes from a peer, it can be broadcast to multiple agents simultaneously.

**When you need it:** Having multiple specialized agents that all need to see the same incoming message (e.g., one for coding, one for research).

| Setting              | Type     | Default | Description                                                    |
| -------------------- | -------- | ------- | -------------------------------------------------------------- |
| `broadcast.strategy` | string   | —       | Execution strategy: `"parallel"` or `"sequential"`             |
| `broadcast.<peerId>` | string[] | —       | Array of agent IDs that should receive messages from this peer |

```json
{
  "broadcast": {
    "strategy": "parallel",
    "discord:123456": ["research-agent", "code-agent"]
  }
}
```

> **Note:** Agent IDs in broadcast entries are validated against `agents.list` — unknown IDs cause validation errors.

---

## 16. Audio

**What it is:** Audio transcription settings — configures how incoming voice messages/audio files are transcribed to text.

**When you need it:** Processing voice messages from WhatsApp, Telegram, or Discord voice channels.

| Setting                              | Type     | Default | Description                                        |
| ------------------------------------ | -------- | ------- | -------------------------------------------------- |
| `audio.transcription.command`        | string[] | —       | Transcription command (array of executable + args) |
| `audio.transcription.timeoutSeconds` | number   | —       | Timeout for transcription                          |

```json
{
  "audio": {
    "transcription": {
      "command": ["whisper", "--model", "base", "--output_format", "txt"],
      "timeoutSeconds": 60
    }
  }
}
```

> **Note:** The first element of the `command` array must be a safe executable name or path.

---

## 17. Media

**What it is:** Global media handling settings.

**When you need it:** Controlling how filenames are preserved when agents handle media attachments.

| Setting                   | Type    | Default | Description                                       |
| ------------------------- | ------- | ------- | ------------------------------------------------- |
| `media.preserveFilenames` | boolean | —       | Preserve original filenames for media attachments |

```json
{
  "media": {
    "preserveFilenames": true
  }
}
```

---

## 18. Messages

**What it is:** Global message processing — how inbound messages are queued, debounced, how group chats work, ack reactions, status reactions, tool error suppression, and TTS (text-to-speech).

**When you need it:** Tuning message handling behavior, enabling TTS for voice responses, configuring message queuing, or customizing status reactions.

### Core Settings

| Setting                       | Type    | Default | Description                                    |
| ----------------------------- | ------- | ------- | ---------------------------------------------- |
| `messages.messagePrefix`      | string  | —       | Prefix prepended to all inbound messages       |
| `messages.responsePrefix`     | string  | —       | Prefix prepended to all outbound responses     |
| `messages.suppressToolErrors` | boolean | `false` | Suppress ⚠️ tool error warnings shown to users |

### Group Chat

| Setting                              | Type     | Default | Description                                       |
| ------------------------------------ | -------- | ------- | ------------------------------------------------- |
| `messages.groupChat.mentionPatterns` | string[] | —       | Regex patterns that trigger responses in groups   |
| `messages.groupChat.historyLimit`    | number   | —       | Max history messages to include for group context |

### Message Queue

| Setting                              | Type   | Default | Description                                                                                                      |
| ------------------------------------ | ------ | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `messages.queue.mode`                | string | —       | Queue mode: `"steer"`, `"followup"`, `"collect"`, `"steer-backlog"`, `"steer+backlog"`, `"queue"`, `"interrupt"` |
| `messages.queue.byChannel`           | object | —       | Per-channel queue mode overrides                                                                                 |
| `messages.queue.debounceMs`          | number | —       | Debounce window (ms) for batching messages                                                                       |
| `messages.queue.debounceMsByChannel` | object | —       | Per-channel debounce overrides                                                                                   |
| `messages.queue.cap`                 | number | —       | Max queued messages                                                                                              |
| `messages.queue.drop`                | string | —       | Drop strategy: `"old"`, `"new"`, `"summarize"`                                                                   |

### Inbound Debounce

| Setting                       | Type   | Default | Description                                              |
| ----------------------------- | ------ | ------- | -------------------------------------------------------- |
| `messages.inbound.debounceMs` | number | —       | Debounce window (ms) for batching rapid inbound messages |
| `messages.inbound.byChannel`  | object | —       | Per-channel debounce overrides                           |

### Ack Reactions

| Setting                        | Type    | Default | Description                                                         |
| ------------------------------ | ------- | ------- | ------------------------------------------------------------------- |
| `messages.ackReaction`         | string  | —       | Emoji to acknowledge inbound messages (empty = disabled)            |
| `messages.ackReactionScope`    | string  | —       | When to ack: `"group-mentions"`, `"group-all"`, `"direct"`, `"all"` |
| `messages.removeAckAfterReply` | boolean | —       | Remove ack reaction after reply is sent                             |

### Status Reactions

| Setting                                       | Type    | Default | Description                                                         |
| --------------------------------------------- | ------- | ------- | ------------------------------------------------------------------- |
| `messages.statusReactions.enabled`            | boolean | `false` | Enable lifecycle status reactions (queued→thinking→tool→done/error) |
| `messages.statusReactions.emojis.thinking`    | string  | —       | Emoji for thinking state                                            |
| `messages.statusReactions.emojis.tool`        | string  | —       | Emoji for tool execution                                            |
| `messages.statusReactions.emojis.coding`      | string  | —       | Emoji for coding                                                    |
| `messages.statusReactions.emojis.web`         | string  | —       | Emoji for web browsing                                              |
| `messages.statusReactions.emojis.done`        | string  | —       | Emoji for completion                                                |
| `messages.statusReactions.emojis.error`       | string  | —       | Emoji for error                                                     |
| `messages.statusReactions.emojis.stallSoft`   | string  | —       | Emoji for soft stall                                                |
| `messages.statusReactions.emojis.stallHard`   | string  | —       | Emoji for hard stall                                                |
| `messages.statusReactions.timing.debounceMs`  | number  | `700`   | Debounce between reaction updates                                   |
| `messages.statusReactions.timing.stallSoftMs` | number  | `25000` | Soft stall timeout                                                  |
| `messages.statusReactions.timing.stallHardMs` | number  | `60000` | Hard stall timeout                                                  |
| `messages.statusReactions.timing.doneHoldMs`  | number  | `1500`  | How long to show done emoji                                         |
| `messages.statusReactions.timing.errorHoldMs` | number  | `2500`  | How long to show error emoji                                        |

### TTS (Text-to-Speech)

| Setting                      | Type    | Default | Description                                                 |
| ---------------------------- | ------- | ------- | ----------------------------------------------------------- |
| `messages.tts.enabled`       | boolean | —       | Enable TTS globally                                         |
| `messages.tts.auto`          | string  | —       | Auto-TTS mode: `"off"`, `"always"`, `"inbound"`, `"tagged"` |
| `messages.tts.mode`          | string  | —       | TTS output mode: `"final"` or `"all"`                       |
| `messages.tts.provider`      | string  | —       | Provider: `"elevenlabs"`, `"openai"`, `"edge"`              |
| `messages.tts.summaryModel`  | string  | —       | Model for generating TTS summaries                          |
| `messages.tts.maxTextLength` | number  | —       | Max text length for TTS                                     |
| `messages.tts.timeoutMs`     | number  | —       | TTS timeout (1000–120000 ms)                                |
| `messages.tts.prefsPath`     | string  | —       | Path to TTS preferences file                                |

#### ElevenLabs TTS

| Setting                                                 | Type   | Default | Description                       |
| ------------------------------------------------------- | ------ | ------- | --------------------------------- |
| `messages.tts.elevenlabs.apiKey`                        | string | —       | ElevenLabs API key (⚠️ sensitive) |
| `messages.tts.elevenlabs.baseUrl`                       | string | —       | Custom base URL                   |
| `messages.tts.elevenlabs.voiceId`                       | string | —       | Voice ID                          |
| `messages.tts.elevenlabs.modelId`                       | string | —       | Model ID                          |
| `messages.tts.elevenlabs.seed`                          | number | —       | Random seed (0–4294967295)        |
| `messages.tts.elevenlabs.languageCode`                  | string | —       | Language code                     |
| `messages.tts.elevenlabs.voiceSettings.stability`       | number | —       | Voice stability (0–1)             |
| `messages.tts.elevenlabs.voiceSettings.similarityBoost` | number | —       | Similarity boost (0–1)            |
| `messages.tts.elevenlabs.voiceSettings.style`           | number | —       | Style (0–1)                       |
| `messages.tts.elevenlabs.voiceSettings.speed`           | number | —       | Speed (0.5–2)                     |

#### OpenAI TTS

| Setting                      | Type   | Default | Description                   |
| ---------------------------- | ------ | ------- | ----------------------------- |
| `messages.tts.openai.apiKey` | string | —       | OpenAI API key (⚠️ sensitive) |
| `messages.tts.openai.model`  | string | —       | TTS model                     |
| `messages.tts.openai.voice`  | string | —       | Voice name                    |

#### Edge TTS

| Setting                     | Type    | Default | Description               |
| --------------------------- | ------- | ------- | ------------------------- |
| `messages.tts.edge.enabled` | boolean | —       | Enable Microsoft Edge TTS |
| `messages.tts.edge.voice`   | string  | —       | Voice name                |
| `messages.tts.edge.lang`    | string  | —       | Language                  |
| `messages.tts.edge.rate`    | string  | —       | Speech rate               |
| `messages.tts.edge.pitch`   | string  | —       | Pitch                     |
| `messages.tts.edge.volume`  | string  | —       | Volume                    |

```json
{
  "messages": {
    "queue": { "mode": "steer" },
    "ackReaction": "👀",
    "ackReactionScope": "group-mentions",
    "statusReactions": { "enabled": true },
    "tts": {
      "enabled": true,
      "provider": "elevenlabs",
      "elevenlabs": {
        "apiKey": "your-elevenlabs-key",
        "voiceId": "EXAVITQu4vr4xnSDxMaL"
      }
    }
  }
}
```

---

## 19. Commands

**What it is:** Configures slash commands and chat commands — which commands are available, who can run them, and whether to register native commands with channels.

**When you need it:** Enabling `/bash` for shell access, restricting `/config` and `/debug` to owner-only, or registering native slash commands with Discord/Telegram.

| Setting                     | Type               | Default  | Description                                                          |
| --------------------------- | ------------------ | -------- | -------------------------------------------------------------------- |
| `commands.native`           | boolean/string     | `"auto"` | Register native commands with channels: `true`, `false`, or `"auto"` |
| `commands.nativeSkills`     | boolean/string     | `"auto"` | Register native skill commands: `true`, `false`, or `"auto"`         |
| `commands.text`             | boolean            | —        | Allow text command parsing (slash commands only)                     |
| `commands.bash`             | boolean            | `false`  | Allow `!` / `/bash` shell command (requires `tools.elevated`)        |
| `commands.bashForegroundMs` | number             | `2000`   | How long bash waits before backgrounding (0 = immediate)             |
| `commands.config`           | boolean            | `false`  | Allow `/config` to read/write config on disk                         |
| `commands.debug`            | boolean            | `false`  | Allow `/debug` for runtime-only overrides                            |
| `commands.restart`          | boolean            | `true`   | Allow `/restart` and gateway restart                                 |
| `commands.useAccessGroups`  | boolean            | —        | Enforce access-group allowlists for commands                         |
| `commands.ownerAllowFrom`   | (string\|number)[] | —        | Owner allowlist for owner-only commands. Use channel-native IDs      |
| `commands.allowFrom`        | object             | —        | Per-provider allowlists for command access                           |

```json
{
  "commands": {
    "native": "auto",
    "bash": false,
    "config": false,
    "debug": false,
    "restart": true,
    "ownerAllowFrom": ["discord:123456789"]
  }
}
```

---

## 20. Approvals

**What it is:** Configures exec approval forwarding — how approval requests for sensitive exec commands are routed to human reviewers.

**When you need it:** Forwarding exec approval requests to a specific Discord channel, Telegram chat, or the originating session.

| Setting                        | Type     | Default | Description                                                                                  |
| ------------------------------ | -------- | ------- | -------------------------------------------------------------------------------------------- |
| `approvals.exec.enabled`       | boolean  | —       | Enable exec approval forwarding                                                              |
| `approvals.exec.mode`          | string   | —       | Forwarding mode: `"session"` (back to session), `"targets"` (to specific channels), `"both"` |
| `approvals.exec.agentFilter`   | string[] | —       | Only forward approvals from these agent IDs                                                  |
| `approvals.exec.sessionFilter` | string[] | —       | Only forward approvals from these session keys                                               |
| `approvals.exec.targets`       | array    | —       | Target channels for forwarding (see below)                                                   |

### Forward Targets

| Setting               | Type          | Description                                    |
| --------------------- | ------------- | ---------------------------------------------- |
| `targets[].channel`   | string        | Channel type (e.g., `"discord"`, `"telegram"`) |
| `targets[].to`        | string        | Target peer/channel ID                         |
| `targets[].accountId` | string        | Optional account ID                            |
| `targets[].threadId`  | string/number | Optional thread ID                             |

```json
{
  "approvals": {
    "exec": {
      "enabled": true,
      "mode": "both",
      "targets": [
        {
          "channel": "discord",
          "to": "approval-channel-id"
        }
      ]
    }
  }
}
```

---

## 21. Session

**What it is:** Controls session lifecycle — scoping, reset behavior, idle timeouts, maintenance/cleanup, typing indicators, and agent-to-agent communication limits.

**When you need it:** Isolating DM sessions per peer, configuring automatic session reset, setting up session storage, or managing transcript cleanup.

### Scope & Key

| Setting                 | Type   | Default | Description                                                                            |
| ----------------------- | ------ | ------- | -------------------------------------------------------------------------------------- |
| `session.scope`         | string | —       | Session scope: `"per-sender"` or `"global"`                                            |
| `session.dmScope`       | string | —       | DM scoping: `"main"`, `"per-peer"`, `"per-channel-peer"`, `"per-account-channel-peer"` |
| `session.mainKey`       | string | —       | Custom main session key                                                                |
| `session.identityLinks` | object | —       | Map canonical identities to provider-prefixed peer IDs                                 |

### Reset

| Setting                      | Type     | Default | Description                         |
| ---------------------------- | -------- | ------- | ----------------------------------- |
| `session.resetTriggers`      | string[] | —       | Messages that trigger session reset |
| `session.idleMinutes`        | number   | —       | Reset session after N minutes idle  |
| `session.reset.mode`         | string   | —       | Reset mode: `"daily"` or `"idle"`   |
| `session.reset.atHour`       | number   | —       | Hour for daily reset (0–23)         |
| `session.reset.idleMinutes`  | number   | —       | Idle minutes before reset           |
| `session.resetByType.direct` | object   | —       | Reset config for direct messages    |
| `session.resetByType.group`  | object   | —       | Reset config for groups             |
| `session.resetByType.thread` | object   | —       | Reset config for threads            |
| `session.resetByChannel`     | object   | —       | Per-channel reset config            |

### Typing

| Setting                         | Type   | Default | Description                                                     |
| ------------------------------- | ------ | ------- | --------------------------------------------------------------- |
| `session.typingIntervalSeconds` | number | —       | How often to send typing indicators                             |
| `session.typingMode`            | string | —       | When to type: `"never"`, `"instant"`, `"thinking"`, `"message"` |

### Send Policy

| Setting                      | Type   | Default | Description                                     |
| ---------------------------- | ------ | ------- | ----------------------------------------------- |
| `session.sendPolicy.default` | string | —       | Default action: `"allow"` or `"deny"`           |
| `session.sendPolicy.rules`   | array  | —       | Array of allow/deny rules with match conditions |

### Agent-to-Agent

| Setting                                 | Type   | Default | Description                               |
| --------------------------------------- | ------ | ------- | ----------------------------------------- |
| `session.agentToAgent.maxPingPongTurns` | number | —       | Max reply-back turns between agents (0–5) |

### Maintenance

| Setting                           | Type          | Default | Description                                     |
| --------------------------------- | ------------- | ------- | ----------------------------------------------- |
| `session.store`                   | string        | —       | Session storage path                            |
| `session.maintenance.mode`        | string        | —       | Maintenance mode: `"enforce"` or `"warn"`       |
| `session.maintenance.pruneAfter`  | string/number | —       | Auto-prune sessions older than this duration    |
| `session.maintenance.maxEntries`  | number        | —       | Max session entries                             |
| `session.maintenance.rotateBytes` | string/number | —       | Rotate session files when they exceed this size |

```json
{
  "session": {
    "scope": "per-sender",
    "dmScope": "per-peer",
    "reset": { "mode": "idle", "idleMinutes": 120 },
    "typingMode": "thinking",
    "maintenance": {
      "mode": "enforce",
      "pruneAfter": "30d",
      "rotateBytes": "50mb"
    }
  }
}
```

---

## 22. Cron

**What it is:** The built-in cron scheduler for running agent tasks on a schedule.

**When you need it:** Scheduling periodic tasks (daily summaries, check-ins, data collection), setting up reminders, or running maintenance jobs.

| Setting                  | Type         | Default | Description                                                            |
| ------------------------ | ------------ | ------- | ---------------------------------------------------------------------- |
| `cron.enabled`           | boolean      | —       | Enable the cron scheduler                                              |
| `cron.store`             | string       | —       | Path to cron job database                                              |
| `cron.maxConcurrentRuns` | number       | —       | Max jobs running simultaneously                                        |
| `cron.webhook`           | string       | —       | Webhook URL for cron notifications (must be http/https)                |
| `cron.webhookToken`      | string       | —       | Webhook authentication token (⚠️ sensitive)                            |
| `cron.sessionRetention`  | string/false | —       | Auto-cleanup of cron sessions (duration string, or `false` to disable) |

```json
{
  "cron": {
    "enabled": true,
    "store": "~/.openclaw/cron.db",
    "maxConcurrentRuns": 3,
    "sessionRetention": "7d"
  }
}
```

> **Tip:** Cron jobs are managed via the `/cron` chat command or the Control UI. The config only sets global cron behavior.

---

## 23. Hooks

**What it is:** Webhook endpoint configuration — receive external HTTP webhooks that trigger agent actions. Includes Gmail integration and internal hook handlers.

**When you need it:** Triggering agent actions from GitHub webhooks, receiving Gmail notifications, integrating with CI/CD pipelines, or building custom automations.

### Core Settings

| Setting                           | Type     | Default | Description                                        |
| --------------------------------- | -------- | ------- | -------------------------------------------------- |
| `hooks.enabled`                   | boolean  | —       | Enable webhook endpoint                            |
| `hooks.path`                      | string   | —       | URL path for webhooks (e.g., `"/hooks"`)           |
| `hooks.token`                     | string   | —       | Webhook authentication token (⚠️ sensitive)        |
| `hooks.defaultSessionKey`         | string   | —       | Default session key for hook-triggered sessions    |
| `hooks.allowRequestSessionKey`    | boolean  | —       | Allow webhook callers to specify a session key     |
| `hooks.allowedSessionKeyPrefixes` | string[] | —       | Allowed prefixes for caller-specified session keys |
| `hooks.allowedAgentIds`           | string[] | —       | Restrict which agents can be triggered via hooks   |
| `hooks.maxBodyBytes`              | number   | —       | Max webhook body size in bytes                     |
| `hooks.presets`                   | string[] | —       | Hook preset names to load                          |
| `hooks.transformsDir`             | string   | —       | Directory for custom hook transform modules        |

### Hook Mappings

Each mapping defines how an incoming webhook is processed:

| Setting                             | Type    | Default | Description                                                 |
| ----------------------------------- | ------- | ------- | ----------------------------------------------------------- |
| `hooks.mappings[].id`               | string  | —       | Unique mapping ID                                           |
| `hooks.mappings[].match.path`       | string  | —       | URL path pattern to match                                   |
| `hooks.mappings[].match.source`     | string  | —       | Source identifier to match                                  |
| `hooks.mappings[].action`           | string  | —       | Action: `"wake"` or `"agent"`                               |
| `hooks.mappings[].wakeMode`         | string  | —       | Wake mode: `"now"` or `"next-heartbeat"`                    |
| `hooks.mappings[].agentId`          | string  | —       | Agent to trigger                                            |
| `hooks.mappings[].sessionKey`       | string  | —       | Session key for the triggered action                        |
| `hooks.mappings[].messageTemplate`  | string  | —       | Template for the message sent to the agent                  |
| `hooks.mappings[].textTemplate`     | string  | —       | Template for plain text                                     |
| `hooks.mappings[].deliver`          | boolean | —       | Whether to deliver the result to a channel                  |
| `hooks.mappings[].channel`          | string  | —       | Delivery channel: `"last"`, `"discord"`, `"telegram"`, etc. |
| `hooks.mappings[].to`               | string  | —       | Delivery target                                             |
| `hooks.mappings[].model`            | string  | —       | Model override for this hook                                |
| `hooks.mappings[].thinking`         | string  | —       | Thinking level override                                     |
| `hooks.mappings[].timeoutSeconds`   | number  | —       | Timeout for hook processing                                 |
| `hooks.mappings[].transform.module` | string  | —       | Custom transform module (safe relative path)                |
| `hooks.mappings[].transform.export` | string  | —       | Export name from the transform module                       |

### Gmail Integration

| Setting                         | Type    | Default | Description                            |
| ------------------------------- | ------- | ------- | -------------------------------------- |
| `hooks.gmail.account`           | string  | —       | Gmail account                          |
| `hooks.gmail.label`             | string  | —       | Gmail label to watch                   |
| `hooks.gmail.topic`             | string  | —       | Google Cloud Pub/Sub topic             |
| `hooks.gmail.subscription`      | string  | —       | Pub/Sub subscription                   |
| `hooks.gmail.pushToken`         | string  | —       | Push notification token (⚠️ sensitive) |
| `hooks.gmail.hookUrl`           | string  | —       | Webhook URL for Gmail push             |
| `hooks.gmail.includeBody`       | boolean | —       | Include email body in webhook payload  |
| `hooks.gmail.maxBytes`          | number  | —       | Max email body bytes                   |
| `hooks.gmail.renewEveryMinutes` | number  | —       | Auto-renew watch interval              |
| `hooks.gmail.model`             | string  | —       | Model for processing emails            |
| `hooks.gmail.thinking`          | string  | —       | Thinking level for email processing    |

### Internal Hooks

| Setting                         | Type     | Default | Description                                      |
| ------------------------------- | -------- | ------- | ------------------------------------------------ |
| `hooks.internal.enabled`        | boolean  | —       | Enable internal hook handlers                    |
| `hooks.internal.handlers`       | array    | —       | Array of event+module handler definitions        |
| `hooks.internal.entries`        | object   | —       | Per-hook configuration (enable/disable + config) |
| `hooks.internal.load.extraDirs` | string[] | —       | Extra directories to load hook modules from      |
| `hooks.internal.installs`       | object   | —       | CLI-managed install metadata for hook packages   |

```json
{
  "hooks": {
    "enabled": true,
    "path": "/hooks",
    "token": "your-webhook-secret",
    "maxBodyBytes": 1048576,
    "mappings": [
      {
        "id": "github-push",
        "match": { "path": "/hooks/github" },
        "action": "agent",
        "agentId": "main",
        "messageTemplate": "GitHub push: {{body.ref}} by {{body.pusher.name}}",
        "deliver": true,
        "channel": "discord",
        "to": "dev-channel-id"
      }
    ]
  }
}
```

---

## 24. Web

**What it is:** WebChat/WebSocket client settings — controls the web-based chat interface behavior.

**When you need it:** Adjusting WebChat heartbeat interval or reconnection behavior.

| Setting                     | Type    | Default | Description                              |
| --------------------------- | ------- | ------- | ---------------------------------------- |
| `web.enabled`               | boolean | —       | Enable WebChat                           |
| `web.heartbeatSeconds`      | number  | —       | WebSocket heartbeat interval (seconds)   |
| `web.reconnect.initialMs`   | number  | —       | Initial reconnection delay (ms)          |
| `web.reconnect.maxMs`       | number  | —       | Maximum reconnection delay (ms)          |
| `web.reconnect.factor`      | number  | —       | Backoff factor for reconnection          |
| `web.reconnect.jitter`      | number  | —       | Jitter factor (0–1) for reconnection     |
| `web.reconnect.maxAttempts` | number  | —       | Max reconnection attempts (0 = infinite) |

```json
{
  "web": {
    "enabled": true,
    "heartbeatSeconds": 30,
    "reconnect": {
      "initialMs": 1000,
      "maxMs": 30000,
      "factor": 2,
      "jitter": 0.3,
      "maxAttempts": 0
    }
  }
}
```

---

## 25. Channels

**What it is:** Configuration for all messaging channel plugins — Discord, Telegram, WhatsApp, Signal, Slack, IRC, iMessage, MS Teams, Google Chat, and BlueBubbles. Each channel has its own nested configuration.

**When you need it:** Connecting your bot to messaging platforms, setting DM policies, configuring group access, managing multi-account setups.

### Channel Defaults

| Setting                         | Type   | Default | Description                                                 |
| ------------------------------- | ------ | ------- | ----------------------------------------------------------- |
| `channels.defaults.groupPolicy` | string | —       | Default group policy: `"open"`, `"disabled"`, `"allowlist"` |
| `channels.defaults.heartbeat`   | object | —       | Default heartbeat visibility settings                       |
| `channels.modelByChannel`       | object | —       | Map provider→channel ID→model override                      |

### Common Settings (shared across most channels)

These settings appear in most channel configurations:

| Setting                  | Type    | Description                                                   |
| ------------------------ | ------- | ------------------------------------------------------------- |
| `enabled`                | boolean | Enable/disable this channel                                   |
| `name`                   | string  | Display name for the account                                  |
| `configWrites`           | boolean | Allow the channel to write config changes                     |
| `dmPolicy`               | string  | DM access: `"pairing"`, `"allowlist"`, `"open"`, `"disabled"` |
| `allowFrom`              | array   | Allowed sender IDs for DMs                                    |
| `defaultTo`              | string  | Default send target                                           |
| `groupPolicy`            | string  | Group access: `"open"`, `"disabled"`, `"allowlist"`           |
| `groupAllowFrom`         | array   | Allowed sender IDs in groups                                  |
| `historyLimit`           | number  | Max history messages for context                              |
| `dmHistoryLimit`         | number  | Max DM history messages                                       |
| `textChunkLimit`         | number  | Max characters per message chunk                              |
| `chunkMode`              | string  | Chunking mode: `"length"` or `"newline"`                      |
| `blockStreaming`         | boolean | Enable block streaming mode                                   |
| `blockStreamingCoalesce` | object  | Coalescing settings for block streaming                       |
| `mediaMaxMb`             | number  | Max media attachment size (MB)                                |
| `heartbeat`              | object  | Heartbeat visibility (showOk, showAlerts, useIndicator)       |
| `responsePrefix`         | string  | Prefix for all responses                                      |
| `ackReaction`            | string  | Emoji for message acknowledgment                              |
| `markdown.tables`        | string  | Table rendering: `"off"`, `"bullets"`, `"code"`               |
| `capabilities`           | array   | Feature capabilities for this channel                         |
| `actions`                | object  | Channel-specific action toggles                               |
| `replyToMode`            | string  | Reply threading: `"off"`, `"first"`, `"all"`                  |

### 25.1 Discord

| Setting                                       | Type     | Default | Description                                                                            |
| --------------------------------------------- | -------- | ------- | -------------------------------------------------------------------------------------- |
| `channels.discord.token`                      | string   | —       | Discord bot token (⚠️ sensitive)                                                       |
| `channels.discord.proxy`                      | string   | —       | Proxy URL for Discord API/gateway requests                                             |
| `channels.discord.allowBots`                  | boolean  | `false` | Allow bot-authored messages                                                            |
| `channels.discord.guilds.<id>`                | object   | —       | Per-guild configuration                                                                |
| `channels.discord.guilds.<id>.slug`           | string   | —       | Guild slug/nickname                                                                    |
| `channels.discord.guilds.<id>.requireMention` | boolean  | —       | Require @mention in guild                                                              |
| `channels.discord.guilds.<id>.users`          | string[] | —       | Allowed user IDs                                                                       |
| `channels.discord.guilds.<id>.roles`          | string[] | —       | Allowed role IDs                                                                       |
| `channels.discord.guilds.<id>.channels.<id>`  | object   | —       | Per-channel config within guild                                                        |
| `channels.discord.dm`                         | object   | —       | DM-specific settings                                                                   |
| `channels.discord.streamMode`                 | string   | `"off"` | Stream preview: `"off"`, `"partial"`, `"block"`                                        |
| `channels.discord.maxLinesPerMessage`         | number   | `17`    | Soft max lines per message                                                             |
| `channels.discord.execApprovals`              | object   | —       | Exec approval forwarding via Discord                                                   |
| `channels.discord.slashCommand.ephemeral`     | boolean  | —       | Make slash command responses ephemeral                                                 |
| `channels.discord.intents.presence`           | boolean  | `false` | Guild Presences privileged intent                                                      |
| `channels.discord.intents.guildMembers`       | boolean  | `false` | Guild Members privileged intent                                                        |
| `channels.discord.voice.enabled`              | boolean  | —       | Enable voice channel support                                                           |
| `channels.discord.voice.autoJoin`             | array    | —       | Voice channels to auto-join                                                            |
| `channels.discord.pluralkit.enabled`          | boolean  | —       | Resolve PluralKit proxied messages                                                     |
| `channels.discord.activity`                   | string   | —       | Presence activity text                                                                 |
| `channels.discord.status`                     | string   | —       | Presence status: `"online"`, `"dnd"`, `"idle"`, `"invisible"`                          |
| `channels.discord.activityType`               | number   | —       | Activity type (0=Playing, 1=Streaming, 2=Listening, 3=Watching, 4=Custom, 5=Competing) |
| `channels.discord.activityUrl`                | string   | —       | Streaming URL (required for activityType=1)                                            |
| `channels.discord.ui.components.accentColor`  | string   | —       | Accent color for component containers                                                  |
| `channels.discord.accounts`                   | object   | —       | Multi-account configuration                                                            |

```json
{
  "channels": {
    "discord": {
      "token": "your-discord-bot-token",
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist",
      "streamMode": "off",
      "guilds": {
        "123456789": {
          "requireMention": true,
          "channels": {
            "987654321": { "allow": true }
          }
        }
      },
      "activity": "Helping humans",
      "status": "online"
    }
  }
}
```

> **Note:** Discord IDs must be strings (wrap numeric IDs in quotes).

### 25.2 Telegram

| Setting                                      | Type    | Default     | Description                                                     |
| -------------------------------------------- | ------- | ----------- | --------------------------------------------------------------- |
| `channels.telegram.botToken`                 | string  | —           | Telegram bot token (⚠️ sensitive)                               |
| `channels.telegram.tokenFile`                | string  | —           | Path to file containing bot token                               |
| `channels.telegram.replyToMode`              | string  | —           | Reply threading mode                                            |
| `channels.telegram.groups.<id>`              | object  | —           | Per-group configuration                                         |
| `channels.telegram.streamMode`               | string  | `"partial"` | Stream preview: `"off"`, `"partial"`, `"block"`                 |
| `channels.telegram.draftChunk`               | object  | —           | Draft chunk settings for block stream mode                      |
| `channels.telegram.timeoutSeconds`           | number  | `500`       | API request timeout                                             |
| `channels.telegram.retry`                    | object  | —           | Retry settings (attempts, delays, jitter)                       |
| `channels.telegram.network.autoSelectFamily` | boolean | —           | Override Node autoSelectFamily                                  |
| `channels.telegram.proxy`                    | string  | —           | HTTP proxy for Telegram API                                     |
| `channels.telegram.webhookUrl`               | string  | —           | Webhook URL for Telegram updates                                |
| `channels.telegram.webhookSecret`            | string  | —           | Webhook verification secret (⚠️ sensitive)                      |
| `channels.telegram.linkPreview`              | boolean | —           | Enable link preview in messages                                 |
| `channels.telegram.customCommands`           | array   | —           | Additional bot menu commands                                    |
| `channels.telegram.accounts`                 | object  | —           | Multi-account configuration                                     |
| `channels.telegram.reactionLevel`            | string  | —           | Reaction handling: `"off"`, `"ack"`, `"minimal"`, `"extensive"` |
| `channels.telegram.reactionNotifications`    | string  | —           | Reaction notifications: `"off"`, `"own"`, `"all"`               |

```json
{
  "channels": {
    "telegram": {
      "botToken": "123456:ABC-DEF...",
      "dmPolicy": "pairing",
      "allowFrom": ["your-telegram-user-id"],
      "streamMode": "partial"
    }
  }
}
```

### 25.3 WhatsApp

| Setting                                 | Type    | Default | Description                                    |
| --------------------------------------- | ------- | ------- | ---------------------------------------------- |
| `channels.whatsapp.sendReadReceipts`    | boolean | —       | Send read receipts                             |
| `channels.whatsapp.messagePrefix`       | string  | —       | Inbound message prefix                         |
| `channels.whatsapp.selfChatMode`        | boolean | —       | Same-phone setup (bot on your personal number) |
| `channels.whatsapp.debounceMs`          | number  | `0`     | Debounce window for rapid messages             |
| `channels.whatsapp.groups.<id>`         | object  | —       | Per-group configuration                        |
| `channels.whatsapp.mediaMaxMb`          | number  | `50`    | Max media size (MB)                            |
| `channels.whatsapp.ackReaction`         | object  | —       | Ack reaction config (emoji, direct, group)     |
| `channels.whatsapp.accounts`            | object  | —       | Multi-account configuration                    |
| `channels.whatsapp.actions.reactions`   | boolean | —       | Enable reactions                               |
| `channels.whatsapp.actions.sendMessage` | boolean | —       | Enable message sending                         |
| `channels.whatsapp.actions.polls`       | boolean | —       | Enable polls                                   |

```json
{
  "channels": {
    "whatsapp": {
      "dmPolicy": "pairing",
      "allowFrom": ["+15551234567"],
      "groupPolicy": "allowlist",
      "selfChatMode": false
    }
  }
}
```

### 25.4 Signal

| Setting                             | Type    | Default | Description                              |
| ----------------------------------- | ------- | ------- | ---------------------------------------- |
| `channels.signal.account`           | string  | —       | Signal phone number                      |
| `channels.signal.httpUrl`           | string  | —       | signal-cli HTTP endpoint URL             |
| `channels.signal.httpHost`          | string  | —       | signal-cli HTTP host                     |
| `channels.signal.httpPort`          | number  | —       | signal-cli HTTP port                     |
| `channels.signal.cliPath`           | string  | —       | Path to signal-cli executable            |
| `channels.signal.autoStart`         | boolean | —       | Auto-start signal-cli daemon             |
| `channels.signal.startupTimeoutMs`  | number  | —       | Startup timeout (1000–120000 ms)         |
| `channels.signal.receiveMode`       | string  | —       | Receive mode: `"on-start"` or `"manual"` |
| `channels.signal.ignoreAttachments` | boolean | —       | Ignore incoming attachments              |
| `channels.signal.ignoreStories`     | boolean | —       | Ignore stories                           |
| `channels.signal.sendReadReceipts`  | boolean | —       | Send read receipts                       |
| `channels.signal.accounts`          | object  | —       | Multi-account configuration              |

```json
{
  "channels": {
    "signal": {
      "account": "+15551234567",
      "dmPolicy": "pairing",
      "allowFrom": ["+15559876543"]
    }
  }
}
```

### 25.5 Slack

| Setting                            | Type    | Default           | Description                                       |
| ---------------------------------- | ------- | ----------------- | ------------------------------------------------- |
| `channels.slack.botToken`          | string  | —                 | Slack bot token `xoxb-...` (⚠️ sensitive)         |
| `channels.slack.appToken`          | string  | —                 | Slack app token `xapp-...` (⚠️ sensitive)         |
| `channels.slack.userToken`         | string  | —                 | Slack user token `xoxp-...` (⚠️ sensitive)        |
| `channels.slack.userTokenReadOnly` | boolean | `true`            | Restrict user token to read-only                  |
| `channels.slack.mode`              | string  | `"socket"`        | Connection mode: `"socket"` or `"http"`           |
| `channels.slack.signingSecret`     | string  | —                 | Slack signing secret for HTTP mode (⚠️ sensitive) |
| `channels.slack.webhookPath`       | string  | `"/slack/events"` | Webhook path for HTTP mode                        |
| `channels.slack.allowBots`         | boolean | `false`           | Allow bot-authored messages                       |
| `channels.slack.requireMention`    | boolean | —                 | Require @mention in channels                      |
| `channels.slack.streaming`         | boolean | —                 | Enable streaming responses                        |
| `channels.slack.channels.<id>`     | object  | —                 | Per-channel configuration                         |
| `channels.slack.thread`            | object  | —                 | Thread behavior (historyScope, inheritParent)     |
| `channels.slack.slashCommand`      | object  | —                 | Slash command settings                            |
| `channels.slack.accounts`          | object  | —                 | Multi-account configuration                       |

```json
{
  "channels": {
    "slack": {
      "botToken": "xoxb-...",
      "appToken": "xapp-...",
      "mode": "socket",
      "dmPolicy": "pairing"
    }
  }
}
```

### 25.6 IRC

| Setting                               | Type     | Default      | Description                                  |
| ------------------------------------- | -------- | ------------ | -------------------------------------------- |
| `channels.irc.host`                   | string   | —            | IRC server hostname                          |
| `channels.irc.port`                   | number   | —            | IRC server port (1–65535)                    |
| `channels.irc.tls`                    | boolean  | —            | Use TLS connection                           |
| `channels.irc.nick`                   | string   | —            | Bot nickname                                 |
| `channels.irc.username`               | string   | —            | IRC username                                 |
| `channels.irc.realname`               | string   | —            | IRC real name                                |
| `channels.irc.password`               | string   | —            | Server password (⚠️ sensitive)               |
| `channels.irc.passwordFile`           | string   | —            | Path to file containing server password      |
| `channels.irc.nickserv.enabled`       | boolean  | —            | Enable NickServ identify                     |
| `channels.irc.nickserv.service`       | string   | `"NickServ"` | NickServ service nick                        |
| `channels.irc.nickserv.password`      | string   | —            | NickServ password (⚠️ sensitive)             |
| `channels.irc.nickserv.register`      | boolean  | —            | Send NickServ REGISTER on connect            |
| `channels.irc.nickserv.registerEmail` | string   | —            | Email for NickServ registration              |
| `channels.irc.channels`               | string[] | —            | Channels to auto-join (e.g., `["#general"]`) |
| `channels.irc.mentionPatterns`        | string[] | —            | Custom mention patterns                      |
| `channels.irc.groups.<channel>`       | object   | —            | Per-channel configuration                    |
| `channels.irc.accounts`               | object   | —            | Multi-account configuration                  |

```json
{
  "channels": {
    "irc": {
      "host": "irc.libera.chat",
      "port": 6697,
      "tls": true,
      "nick": "mybot",
      "channels": ["#general"],
      "dmPolicy": "pairing"
    }
  }
}
```

### 25.7 iMessage

| Setting                                   | Type     | Default | Description                              |
| ----------------------------------------- | -------- | ------- | ---------------------------------------- |
| `channels.imessage.cliPath`               | string   | —       | Path to iMessage CLI tool                |
| `channels.imessage.dbPath`                | string   | —       | Path to iMessage database                |
| `channels.imessage.remoteHost`            | string   | —       | SSH host for remote Mac access           |
| `channels.imessage.service`               | string   | —       | Service: `"imessage"`, `"sms"`, `"auto"` |
| `channels.imessage.region`                | string   | —       | Phone number region                      |
| `channels.imessage.includeAttachments`    | boolean  | —       | Include inbound attachments              |
| `channels.imessage.attachmentRoots`       | string[] | —       | Allowed local attachment paths           |
| `channels.imessage.remoteAttachmentRoots` | string[] | —       | Allowed remote attachment paths          |
| `channels.imessage.accounts`              | object   | —       | Multi-account configuration              |

### 25.8 MS Teams

| Setting                             | Type    | Default | Description                              |
| ----------------------------------- | ------- | ------- | ---------------------------------------- |
| `channels.msteams.appId`            | string  | —       | Azure Bot App ID                         |
| `channels.msteams.appPassword`      | string  | —       | Azure Bot App Password (⚠️ sensitive)    |
| `channels.msteams.tenantId`         | string  | —       | Azure tenant ID                          |
| `channels.msteams.webhook.port`     | number  | —       | Webhook listener port                    |
| `channels.msteams.webhook.path`     | string  | —       | Webhook path                             |
| `channels.msteams.requireMention`   | boolean | —       | Require @mention in channels             |
| `channels.msteams.replyStyle`       | string  | —       | Reply style: `"thread"` or `"top-level"` |
| `channels.msteams.teams.<id>`       | object  | —       | Per-team configuration                   |
| `channels.msteams.sharePointSiteId` | string  | —       | SharePoint site ID for file uploads      |

### 25.9 Google Chat

| Setting                                  | Type          | Default     | Description                                            |
| ---------------------------------------- | ------------- | ----------- | ------------------------------------------------------ |
| `channels.googlechat.serviceAccount`     | string/object | —           | Service account JSON or path                           |
| `channels.googlechat.serviceAccountFile` | string        | —           | Path to service account file                           |
| `channels.googlechat.audienceType`       | string        | —           | Audience type: `"app-url"` or `"project-number"`       |
| `channels.googlechat.audience`           | string        | —           | Audience value                                         |
| `channels.googlechat.webhookPath`        | string        | —           | Webhook path                                           |
| `channels.googlechat.webhookUrl`         | string        | —           | Webhook URL                                            |
| `channels.googlechat.botUser`            | string        | —           | Bot user identifier                                    |
| `channels.googlechat.streamMode`         | string        | `"replace"` | Stream mode: `"replace"`, `"status_final"`, `"append"` |
| `channels.googlechat.typingIndicator`    | string        | —           | Typing indicator: `"none"`, `"message"`, `"reaction"`  |
| `channels.googlechat.accounts`           | object        | —           | Multi-account configuration                            |

### 25.10 BlueBubbles

| Setting                                 | Type     | Default | Description                                   |
| --------------------------------------- | -------- | ------- | --------------------------------------------- |
| `channels.bluebubbles.serverUrl`        | string   | —       | BlueBubbles server URL                        |
| `channels.bluebubbles.password`         | string   | —       | Server password (⚠️ sensitive)                |
| `channels.bluebubbles.webhookPath`      | string   | —       | Webhook path                                  |
| `channels.bluebubbles.sendReadReceipts` | boolean  | —       | Send read receipts                            |
| `channels.bluebubbles.mediaLocalRoots`  | string[] | —       | Local media roots                             |
| `channels.bluebubbles.actions`          | object   | —       | Actions: reactions, edit, unsend, reply, etc. |
| `channels.bluebubbles.accounts`         | object   | —       | Multi-account configuration                   |

---

## 26. Discovery

**What it is:** Service discovery settings — how OpenClaw nodes find each other on the network.

**When you need it:** Enabling mDNS for automatic LAN discovery or wide-area DNS discovery for remote connections.

| Setting                      | Type    | Default     | Description                                                                                      |
| ---------------------------- | ------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `discovery.wideArea.enabled` | boolean | `false`     | Enable wide-area DNS discovery                                                                   |
| `discovery.mdns.mode`        | string  | `"minimal"` | mDNS mode: `"off"` (disable), `"minimal"` (basic broadcast), `"full"` (includes cliPath/sshPort) |

```json
{
  "discovery": {
    "wideArea": { "enabled": false },
    "mdns": { "mode": "minimal" }
  }
}
```

> **Tip:** Use `"minimal"` for LAN-only setups. Use `"full"` if you need nodes to discover each other's SSH/CLI info. Use `"off"` to disable all mDNS traffic.

---

## 27. Canvas Host

**What it is:** Canvas hosting for rich UI rendering — serves web-based canvases that nodes with GUI support can display.

**When you need it:** Serving interactive UI canvases to paired nodes with display capabilities (macOS, iOS, Android apps).

| Setting                 | Type    | Default | Description                        |
| ----------------------- | ------- | ------- | ---------------------------------- |
| `canvasHost.enabled`    | boolean | —       | Enable canvas hosting              |
| `canvasHost.root`       | string  | —       | Root directory for canvas assets   |
| `canvasHost.port`       | number  | —       | Canvas server port                 |
| `canvasHost.liveReload` | boolean | —       | Enable live reload for development |

```json
{
  "canvasHost": {
    "enabled": true,
    "port": 18793,
    "liveReload": false
  }
}
```

> **Note:** Canvas requires a companion app with WebView support (macOS, iOS, or Android). Headless nodes (Linux/Windows `openclaw-node`) don't support canvas.

---

## 28. Talk

**What it is:** Voice/talk mode settings — configures real-time voice conversations using ElevenLabs or other TTS providers.

**When you need it:** Setting up voice conversations, selecting voices, or configuring voice aliases.

| Setting                  | Type    | Default | Description                                        |
| ------------------------ | ------- | ------- | -------------------------------------------------- |
| `talk.voiceId`           | string  | —       | Default voice ID for talk mode                     |
| `talk.voiceAliases`      | object  | —       | Map of alias names to voice IDs                    |
| `talk.modelId`           | string  | —       | TTS model ID                                       |
| `talk.outputFormat`      | string  | —       | Audio output format                                |
| `talk.apiKey`            | string  | —       | API key for talk provider (⚠️ sensitive)           |
| `talk.interruptOnSpeech` | boolean | —       | Interrupt current output when user starts speaking |

```json
{
  "talk": {
    "voiceId": "EXAVITQu4vr4xnSDxMaL",
    "voiceAliases": {
      "sarah": "EXAVITQu4vr4xnSDxMaL",
      "adam": "pNInz6obpgDQGcFmaJgB"
    },
    "interruptOnSpeech": true
  }
}
```

---

## 29. Gateway

**What it is:** Core gateway server configuration — network binding, ports, TLS, authentication, Control UI, security, node management, Tailscale integration, config reload, HTTP endpoints, and remote gateway connections.

**When you need it:** Always. This is the foundational config for how the gateway listens, authenticates, and serves.

### Core Network

| Setting                             | Type   | Default   | Description                                                             |
| ----------------------------------- | ------ | --------- | ----------------------------------------------------------------------- |
| `gateway.port`                      | number | `18789`   | WebSocket/HTTP server port                                              |
| `gateway.mode`                      | string | `"local"` | Gateway mode: `"local"` or `"remote"`                                   |
| `gateway.bind`                      | string | `"auto"`  | Bind strategy: `"auto"`, `"lan"`, `"loopback"`, `"custom"`, `"tailnet"` |
| `gateway.customBindHost`            | string | —         | Custom bind hostname (when bind=`"custom"`)                             |
| `gateway.channelHealthCheckMinutes` | number | —         | Channel health check interval (0 = disable)                             |

### Authentication

| Setting                                     | Type     | Default  | Description                                                                |
| ------------------------------------------- | -------- | -------- | -------------------------------------------------------------------------- |
| `gateway.auth.mode`                         | string   | `"none"` | Auth mode: `"none"`, `"token"`, `"password"`, `"trusted-proxy"`            |
| `gateway.auth.token`                        | string   | —        | Gateway auth token (⚠️ sensitive)                                          |
| `gateway.auth.password`                     | string   | —        | Gateway password (⚠️ sensitive)                                            |
| `gateway.auth.allowTailscale`               | boolean  | —        | Allow Tailscale-authenticated connections                                  |
| `gateway.auth.rateLimit.maxAttempts`        | number   | —        | Max failed auth attempts before lockout                                    |
| `gateway.auth.rateLimit.windowMs`           | number   | —        | Rate limit window (ms)                                                     |
| `gateway.auth.rateLimit.lockoutMs`          | number   | —        | Lockout duration (ms)                                                      |
| `gateway.auth.rateLimit.exemptLoopback`     | boolean  | —        | Exempt loopback connections from rate limiting                             |
| `gateway.auth.trustedProxy.userHeader`      | string   | —        | Header containing the authenticated user (required for trusted-proxy mode) |
| `gateway.auth.trustedProxy.requiredHeaders` | string[] | —        | Headers that must be present                                               |
| `gateway.auth.trustedProxy.allowUsers`      | string[] | —        | Allowed users                                                              |
| `gateway.trustedProxies`                    | string[] | —        | IPs treated as trusted reverse proxies                                     |

### Security

| Setting                               | Type    | Default | Description                            |
| ------------------------------------- | ------- | ------- | -------------------------------------- |
| `gateway.security.lanAutoApprove`     | boolean | `false` | Auto-approve device pairing from LAN   |
| `gateway.security.lanAutoApproveRole` | string  | —       | Role assigned to auto-approved devices |

### Control UI

| Setting                                          | Type     | Default | Description                     |
| ------------------------------------------------ | -------- | ------- | ------------------------------- |
| `gateway.controlUi.enabled`                      | boolean  | `true`  | Enable the web UI               |
| `gateway.controlUi.basePath`                     | string   | `"/"`   | URL base path                   |
| `gateway.controlUi.root`                         | string   | —       | Custom UI assets directory      |
| `gateway.controlUi.allowedOrigins`               | string[] | —       | CORS allowed origins            |
| `gateway.controlUi.allowInsecureAuth`            | boolean  | `false` | Allow auth over plain HTTP      |
| `gateway.controlUi.dangerouslyDisableDeviceAuth` | boolean  | `false` | ⚠️ Disable device auth entirely |

### TLS

| Setting                    | Type    | Default | Description                            |
| -------------------------- | ------- | ------- | -------------------------------------- |
| `gateway.tls.enabled`      | boolean | —       | Enable TLS                             |
| `gateway.tls.autoGenerate` | boolean | —       | Auto-generate self-signed certificates |
| `gateway.tls.certPath`     | string  | —       | Path to TLS certificate                |
| `gateway.tls.keyPath`      | string  | —       | Path to TLS private key                |
| `gateway.tls.caPath`       | string  | —       | Path to CA certificate                 |

### Gateway Tools

| Setting               | Type     | Default | Description                  |
| --------------------- | -------- | ------- | ---------------------------- |
| `gateway.tools.deny`  | string[] | —       | Gateway-level tool denylist  |
| `gateway.tools.allow` | string[] | —       | Gateway-level tool allowlist |

### Tailscale

| Setting                         | Type    | Default | Description                                    |
| ------------------------------- | ------- | ------- | ---------------------------------------------- |
| `gateway.tailscale.mode`        | string  | —       | Tailscale mode: `"off"`, `"serve"`, `"funnel"` |
| `gateway.tailscale.resetOnExit` | boolean | —       | Reset Tailscale serve/funnel on exit           |

### Remote Gateway

| Setting                         | Type   | Default | Description                                               |
| ------------------------------- | ------ | ------- | --------------------------------------------------------- |
| `gateway.remote.url`            | string | —       | Remote gateway WebSocket URL (ws:// or wss://)            |
| `gateway.remote.transport`      | string | —       | Transport: `"ssh"` or `"direct"`                          |
| `gateway.remote.token`          | string | —       | Remote gateway token (⚠️ sensitive)                       |
| `gateway.remote.password`       | string | —       | Remote gateway password (⚠️ sensitive)                    |
| `gateway.remote.tlsFingerprint` | string | —       | Expected TLS fingerprint (sha256:...) for MITM protection |
| `gateway.remote.sshTarget`      | string | —       | SSH target (user@host or user@host:port)                  |
| `gateway.remote.sshIdentity`    | string | —       | SSH identity file path                                    |

### Config Reload

| Setting                     | Type   | Default | Description                                                |
| --------------------------- | ------ | ------- | ---------------------------------------------------------- |
| `gateway.reload.mode`       | string | —       | Reload strategy: `"off"`, `"restart"`, `"hot"`, `"hybrid"` |
| `gateway.reload.debounceMs` | number | —       | Debounce window before applying changes                    |

### Node Management

| Setting                       | Type     | Default | Description                                         |
| ----------------------------- | -------- | ------- | --------------------------------------------------- |
| `gateway.nodes.browser.mode`  | string   | —       | Node browser routing: `"auto"`, `"manual"`, `"off"` |
| `gateway.nodes.browser.node`  | string   | —       | Pin browser routing to specific node                |
| `gateway.nodes.allowCommands` | string[] | —       | Extra allowed node.invoke commands                  |
| `gateway.nodes.denyCommands`  | string[] | —       | Commands to block on nodes                          |

### HTTP Endpoints

| Setting                                          | Type    | Default | Description                                                   |
| ------------------------------------------------ | ------- | ------- | ------------------------------------------------------------- |
| `gateway.http.endpoints.chatCompletions.enabled` | boolean | `false` | Enable OpenAI-compatible `/v1/chat/completions` endpoint      |
| `gateway.http.endpoints.responses.enabled`       | boolean | —       | Enable the Responses API endpoint                             |
| `gateway.http.endpoints.responses.maxBodyBytes`  | number  | —       | Max request body size                                         |
| `gateway.http.endpoints.responses.files`         | object  | —       | File upload settings (allowUrl, allowedMimes, maxBytes, etc.) |
| `gateway.http.endpoints.responses.images`        | object  | —       | Image upload settings                                         |

```json
{
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "lan",
    "auth": {
      "mode": "token",
      "token": "your-secret-token",
      "rateLimit": {
        "maxAttempts": 5,
        "windowMs": 60000,
        "lockoutMs": 300000
      }
    },
    "controlUi": {
      "enabled": true,
      "allowedOrigins": ["https://openclaw.example.com"]
    },
    "tls": {
      "enabled": false
    },
    "reload": {
      "mode": "hybrid"
    },
    "security": {
      "lanAutoApprove": false
    }
  }
}
```

> **⚠️ Warning:** Never set `dangerouslyDisableDeviceAuth: true` in production — this completely removes authentication.

> **Tip:** Use `bind: "lan"` to accept connections from your local network. Use `"loopback"` for local-only access behind a reverse proxy.

---

## 30. Memory

**What it is:** Global memory backend configuration — choose between the built-in embedding-based memory or the QMD sidecar, and configure citation behavior.

**When you need it:** Enabling memory search, switching to the QMD backend, configuring QMD paths and indexing, or tuning search limits.

### Core

| Setting            | Type   | Default     | Description                                                                |
| ------------------ | ------ | ----------- | -------------------------------------------------------------------------- |
| `memory.backend`   | string | `"builtin"` | Memory backend: `"builtin"` (OpenClaw embeddings) or `"qmd"` (QMD sidecar) |
| `memory.citations` | string | `"auto"`    | Citation mode: `"auto"`, `"on"`, `"off"`                                   |

### QMD Configuration

| Setting                           | Type    | Default     | Description                                      |
| --------------------------------- | ------- | ----------- | ------------------------------------------------ |
| `memory.qmd.command`              | string  | —           | Path to QMD binary (default: resolves from PATH) |
| `memory.qmd.searchMode`           | string  | `"search"`  | Search mode: `"query"`, `"search"`, `"vsearch"`  |
| `memory.qmd.includeDefaultMemory` | boolean | `true`      | Auto-index MEMORY.md + memory/\*_/_.md           |
| `memory.qmd.paths`                | array   | —           | Additional paths to index                        |
| `memory.qmd.paths[].path`         | string  | —           | Absolute or ~-relative path                      |
| `memory.qmd.paths[].name`         | string  | —           | Stable name for the collection                   |
| `memory.qmd.paths[].pattern`      | string  | `"**/*.md"` | Glob pattern for files                           |

### QMD Sessions

| Setting                             | Type    | Default | Description                                |
| ----------------------------------- | ------- | ------- | ------------------------------------------ |
| `memory.qmd.sessions.enabled`       | boolean | `false` | Enable session transcript indexing         |
| `memory.qmd.sessions.exportDir`     | string  | —       | Export directory for sanitized transcripts |
| `memory.qmd.sessions.retentionDays` | number  | —       | Retention window before pruning            |

### QMD Update Schedule

| Setting                              | Type    | Default  | Description                              |
| ------------------------------------ | ------- | -------- | ---------------------------------------- |
| `memory.qmd.update.interval`         | string  | `"5m"`   | Refresh interval (duration string)       |
| `memory.qmd.update.debounceMs`       | number  | `15000`  | Minimum delay between refresh runs       |
| `memory.qmd.update.onBoot`           | boolean | `true`   | Run update on gateway startup            |
| `memory.qmd.update.waitForBootSync`  | boolean | `false`  | Block startup until boot sync finishes   |
| `memory.qmd.update.embedInterval`    | string  | `"60m"`  | Embedding refresh interval (0 = disable) |
| `memory.qmd.update.commandTimeoutMs` | number  | `30000`  | Timeout for QMD maintenance commands     |
| `memory.qmd.update.updateTimeoutMs`  | number  | `120000` | Timeout for `qmd update`                 |
| `memory.qmd.update.embedTimeoutMs`   | number  | `120000` | Timeout for `qmd embed`                  |

### QMD Limits

| Setting                              | Type   | Default | Description                            |
| ------------------------------------ | ------ | ------- | -------------------------------------- |
| `memory.qmd.limits.maxResults`       | number | `6`     | Max results returned per query         |
| `memory.qmd.limits.maxSnippetChars`  | number | `700`   | Max characters per snippet             |
| `memory.qmd.limits.maxInjectedChars` | number | —       | Max total characters injected per turn |
| `memory.qmd.limits.timeoutMs`        | number | `4000`  | Per-query timeout                      |

### QMD Scope

| Setting                    | Type   | Default | Description                                    |
| -------------------------- | ------ | ------- | ---------------------------------------------- |
| `memory.qmd.scope.default` | string | —       | Default action: `"allow"` or `"deny"`          |
| `memory.qmd.scope.rules`   | array  | —       | Allow/deny rules by channel/chatType/keyPrefix |

```json
{
  "memory": {
    "backend": "builtin",
    "citations": "auto",
    "qmd": {
      "searchMode": "search",
      "includeDefaultMemory": true,
      "paths": [
        {
          "path": "~/docs/notes",
          "name": "my-notes",
          "pattern": "**/*.md"
        }
      ],
      "update": {
        "interval": "10m",
        "onBoot": true
      },
      "limits": {
        "maxResults": 10,
        "maxSnippetChars": 500,
        "maxInjectedChars": 15000
      }
    }
  }
}
```

---

## 31. Skills

**What it is:** Skill loading and configuration — controls which skills are available, where to load them from, resource limits, and per-skill settings.

**When you need it:** Enabling bundled skills (Docker, Git, SSH), loading custom skills from external directories, or configuring per-skill API keys.

### Core

| Setting               | Type     | Default | Description                                                         |
| --------------------- | -------- | ------- | ------------------------------------------------------------------- |
| `skills.allowBundled` | string[] | —       | Allowlist of bundled skill names (e.g., `["docker", "git", "ssh"]`) |

### Loading

| Setting                       | Type     | Default | Description                           |
| ----------------------------- | -------- | ------- | ------------------------------------- |
| `skills.load.extraDirs`       | string[] | —       | Extra directories to load skills from |
| `skills.load.watch`           | boolean  | —       | Watch skill directories for changes   |
| `skills.load.watchDebounceMs` | number   | —       | Debounce for watch events (ms)        |

### Installation

| Setting                      | Type    | Default | Description                                                |
| ---------------------------- | ------- | ------- | ---------------------------------------------------------- |
| `skills.install.preferBrew`  | boolean | —       | Prefer Homebrew for dependency installation                |
| `skills.install.nodeManager` | string  | —       | Node package manager: `"npm"`, `"pnpm"`, `"yarn"`, `"bun"` |

### Limits

| Setting                                  | Type   | Default | Description                             |
| ---------------------------------------- | ------ | ------- | --------------------------------------- |
| `skills.limits.maxCandidatesPerRoot`     | number | —       | Max skill candidates per root directory |
| `skills.limits.maxSkillsLoadedPerSource` | number | —       | Max skills loaded per source            |
| `skills.limits.maxSkillsInPrompt`        | number | —       | Max skills injected into prompts        |
| `skills.limits.maxSkillsPromptChars`     | number | —       | Max total chars for skill prompts       |
| `skills.limits.maxSkillFileBytes`        | number | —       | Max bytes per skill file                |

### Per-Skill Entries

| Setting                         | Type    | Default | Description                           |
| ------------------------------- | ------- | ------- | ------------------------------------- |
| `skills.entries.<name>.enabled` | boolean | —       | Enable/disable this skill             |
| `skills.entries.<name>.apiKey`  | string  | —       | API key for this skill (⚠️ sensitive) |
| `skills.entries.<name>.env`     | object  | —       | Environment variables for this skill  |
| `skills.entries.<name>.config`  | object  | —       | Custom config payload for this skill  |

```json
{
  "skills": {
    "allowBundled": ["docker", "git", "ssh", "1password"],
    "load": {
      "extraDirs": ["/opt/custom-skills"],
      "watch": true
    },
    "limits": {
      "maxSkillsInPrompt": 10,
      "maxSkillsPromptChars": 50000
    },
    "entries": {
      "my-custom-skill": {
        "enabled": true,
        "apiKey": "sk-...",
        "config": { "customOption": true }
      }
    }
  }
}
```

---

## 32. Plugins

**What it is:** The plugin/extension system — controls plugin loading, allowlists/denylists, plugin slots (like the memory slot), per-plugin configuration, and install metadata.

**When you need it:** Installing third-party plugins, configuring the memory plugin, restricting which plugins can load, or managing plugin install records.

### Core

| Setting           | Type     | Default | Description                                           |
| ----------------- | -------- | ------- | ----------------------------------------------------- |
| `plugins.enabled` | boolean  | `true`  | Enable plugin loading                                 |
| `plugins.allow`   | string[] | —       | Plugin allowlist (when set, only listed plugins load) |
| `plugins.deny`    | string[] | —       | Plugin denylist (deny wins over allow)                |

### Loading

| Setting              | Type     | Default | Description                               |
| -------------------- | -------- | ------- | ----------------------------------------- |
| `plugins.load.paths` | string[] | —       | Extra plugin files or directories to load |

### Slots

| Setting                | Type   | Default | Description                                               |
| ---------------------- | ------ | ------- | --------------------------------------------------------- |
| `plugins.slots.memory` | string | —       | Select active memory plugin by ID, or `"none"` to disable |

### Per-Plugin Entries

| Setting                        | Type    | Default | Description                                   |
| ------------------------------ | ------- | ------- | --------------------------------------------- |
| `plugins.entries.<id>.enabled` | boolean | —       | Enable/disable this plugin (restart required) |
| `plugins.entries.<id>.config`  | object  | —       | Plugin-defined config payload                 |

### Install Records

Managed by the CLI (`openclaw plugins install/update`). You generally don't edit these manually.

| Setting                                 | Type   | Description                                    |
| --------------------------------------- | ------ | ---------------------------------------------- |
| `plugins.installs.<id>.source`          | string | Install source: `"npm"`, `"archive"`, `"path"` |
| `plugins.installs.<id>.spec`            | string | Original npm spec                              |
| `plugins.installs.<id>.installPath`     | string | Resolved install directory                     |
| `plugins.installs.<id>.version`         | string | Version at install time                        |
| `plugins.installs.<id>.resolvedName`    | string | Resolved npm package name                      |
| `plugins.installs.<id>.resolvedVersion` | string | Resolved npm version                           |
| `plugins.installs.<id>.resolvedSpec`    | string | Resolved exact npm spec                        |
| `plugins.installs.<id>.integrity`       | string | npm dist integrity hash                        |
| `plugins.installs.<id>.shasum`          | string | npm dist shasum                                |
| `plugins.installs.<id>.resolvedAt`      | string | ISO timestamp of resolution                    |
| `plugins.installs.<id>.installedAt`     | string | ISO timestamp of installation                  |

```json
{
  "plugins": {
    "enabled": true,
    "allow": ["memory-chromadb"],
    "load": {
      "paths": ["/opt/openclaw-plugins"]
    },
    "slots": {
      "memory": "memory-chromadb"
    },
    "entries": {
      "memory-chromadb": {
        "enabled": true,
        "config": {
          "url": "http://localhost:8000",
          "collection": "openclaw"
        }
      }
    }
  }
}
```

---

## Quick Tips

> **📁 Config location:** `~/.openclaw/openclaw.json`
>
> **🖥️ Edit methods:** Gateway Config UI (Form mode or Raw JSON), or edit the file directly.
>
> **🔄 Apply changes:** All changes require **Apply & Restart** from the UI, or restart the gateway process.
>
> **🔒 Sensitive fields:** Fields marked with ⚠️ sensitive are redacted in the UI and API responses. They're stored in plain text in the config file — protect file permissions accordingly.
>
> **✅ Validation:** The config uses Zod schemas for validation. Invalid values will be flagged on save, and the gateway may run in "best-effort" mode if critical fields are missing.
>
> **🔀 JSON Schema:** You can add `"$schema": "..."` at the top of your config for editor autocompletion support.
