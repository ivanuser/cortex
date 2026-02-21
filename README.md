# 🦞 Cortex — AI Assistant Command Center

<p align="center">
  <strong>A security-hardened fork of OpenClaw with Cortex UI</strong>
</p>

<p align="center">
  <a href="https://github.com/ivanuser/cortex/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/ivanuser/cortex/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://github.com/ivanuser/cortex/releases"><img src="https://img.shields.io/github/v/release/ivanuser/cortex?include_prereleases&style=for-the-badge" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

**Cortex** is a security-hardened fork of OpenClaw that provides a streamlined AI assistant command center for personal and professional use. Built on proven OpenClaw architecture with enhanced security, simplified node pairing, and the powerful Cortex UI.

[Getting Started](#quick-start) · [Features](#features) · [Architecture](#architecture) · [Migration from OpenClaw](#migration-from-openclaw) · [Fork Documentation](FORK.md)

## What is Cortex?

Cortex builds on OpenClaw's foundation as a personal AI assistant that runs on your own infrastructure. It maintains full compatibility with OpenClaw's multi-channel approach (WhatsApp, Telegram, Slack, Discord, Signal, etc.) while adding:

- **Enhanced Security**: Hardened defaults and improved access controls
- **Cortex UI**: A modern, unified interface for management and interaction
- **Simplified Architecture**: Streamlined node pairing and reduced configuration complexity
- **Focused Feature Set**: Curated capabilities optimized for reliability over feature breadth

## Why Fork?

While OpenClaw provides excellent functionality, Cortex addresses specific needs:

1. **Security First**: Stricter defaults, improved authentication, and security-focused features
2. **Enterprise Ready**: Better suited for professional environments with compliance requirements
3. **Simplified Management**: Reduced operational complexity with the Cortex UI
4. **Focused Vision**: Prioritizes stability and security over rapid feature expansion
5. **Upstream Compatibility**: Maintains ability to sync with OpenClaw developments

## Quick Start

**Prerequisites**: Node ≥22

```bash
# Install Cortex globally
npm install -g openclaw-cortex

# Run the onboarding wizard
cortex onboard

# Start your gateway
cortex gateway start
```

The onboarding wizard guides you through:

- Gateway setup and configuration
- Model provider authentication (Anthropic, OpenAI)
- Channel integrations
- Security hardening options
- Cortex UI deployment

**Recommended Models**:

- Anthropic Claude Pro/Max (Sonnet 4/Opus 4.6) for best performance
- OpenAI GPT-4 models as fallback

## Features

### Core Capabilities

- **Multi-Channel AI**: WhatsApp, Telegram, Discord, Slack, Signal, Teams, and more
- **Voice Support**: Natural speech interaction on macOS/iOS/Android
- **Canvas Rendering**: Interactive visual outputs and live updates
- **File Processing**: Documents, images, audio, and code analysis
- **Tool Integration**: Extensible plugin system for custom capabilities

### Cortex Enhancements

- **Cortex UI**: Unified web interface for management and interaction
- **Security Hardening**: Enhanced authentication, access controls, and audit logging
- **Simplified Pairing**: Streamlined node discovery and configuration
- **Resource Management**: Improved monitoring and resource allocation
- **Compliance Ready**: Features designed for enterprise environments

## Architecture

Cortex follows OpenClaw's proven **Gateway + Nodes** architecture:

### Gateway (Control Plane)

- Central coordination and routing
- Model provider management
- Channel integrations
- Security enforcement
- Cortex UI hosting

### Nodes (Execution Plane)

- Distributed processing capabilities
- Platform-specific integrations (camera, screen, location)
- Resource isolation
- Simplified pairing with gateway

### One UI Philosophy

Unlike distributed UIs, Cortex centralizes management through the **Cortex UI**, providing:

- Unified configuration interface
- Real-time monitoring and logging
- Security policy management
- Node status and health monitoring

## Migration from OpenClaw

Cortex is a **drop-in replacement** — same data directory, same config format, same protocols.

```bash
openclaw gateway stop                # Stop OpenClaw
npm uninstall -g openclaw            # Remove upstream package
npm install -g openclaw-cortex       # Install Cortex
cortex gateway start                 # Done. Everything carries over.
```

Your `~/.openclaw/` data, paired nodes, channels, memory, cron jobs, and agent files all work unchanged. The `openclaw` command still works as an alias.

> **Note:** You must uninstall `openclaw` first to avoid binary conflicts. See the full guide for details.

**[Full Migration Guide →](MIGRATION.md)** — detailed steps, node migration, systemd, rollback, FAQ

## Upstream Sync

Cortex maintains compatibility with upstream OpenClaw developments:

```bash
# Add upstream OpenClaw as a remote
git remote add upstream https://github.com/openclaw/openclaw.git

# Sync with latest OpenClaw changes
git fetch upstream
git merge upstream/main
```

See [FORK.md](FORK.md) for detailed sync procedures and architectural differences.

## Installation Options

### Global Install (Recommended)

```bash
npm install -g cortex@latest
cortex onboard
```

### Docker

```bash
git clone https://github.com/ivanuser/cortex.git
cd cortex
docker-compose up -d
```

### From Source

```bash
git clone https://github.com/ivanuser/cortex.git
cd cortex
npm install
npm run build
npm link
cortex onboard
```

## Support & Community

- **Issues**: [GitHub Issues](https://github.com/ivanuser/cortex/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ivanuser/cortex/discussions)
- **Documentation**: [Cortex Docs](docs/) and [OpenClaw Docs](https://docs.openclaw.ai) (compatible)

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [FORK.md](FORK.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Cortex** - Secure, simplified, and powerful AI assistant infrastructure.
