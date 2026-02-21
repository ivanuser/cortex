# Cortex Fork Documentation

This document outlines the differences between Cortex and upstream OpenClaw, sync procedures, and architectural decisions.

## Fork Overview

**Cortex** is a security-hardened fork of [OpenClaw](https://github.com/openclaw/openclaw) that maintains full compatibility while adding focused enhancements for enterprise and security-conscious users.

**Fork Repository**: [ivanuser/cortex](https://github.com/ivanuser/cortex)  
**Upstream Repository**: [openclaw/openclaw](https://github.com/openclaw/openclaw)

## What This Fork Changes

### 1. Branding & Identity
- **Package Name**: `cortex` (with `openclaw` alias for backward compatibility)
- **CLI Commands**: Both `cortex` and `openclaw` commands work identically
- **Display Name**: "Cortex" in banners and UI while maintaining OpenClaw compatibility
- **Repository**: Rebranded URLs and references

### 2. Cortex UI (Planned)
- **Unified Interface**: Single web-based management console
- **Enhanced Monitoring**: Real-time system status and performance metrics
- **Security Dashboard**: Centralized security policy and audit management
- **Node Management**: Simplified node pairing and health monitoring

### 3. Security Enhancements (Planned)
- **Hardened Defaults**: More restrictive security settings out-of-the-box
- **Enhanced Authentication**: Improved access control mechanisms
- **Audit Logging**: Comprehensive security event tracking
- **Compliance Features**: Tools for enterprise compliance requirements

### 4. Simplified Architecture (Planned)
- **Streamlined Pairing**: Reduced complexity in node discovery and configuration
- **Resource Management**: Better resource allocation and monitoring
- **Configuration Validation**: Enhanced config validation and error reporting
- **Deployment Options**: Simplified deployment patterns for different environments

## Upstream Sync Process

### Adding Upstream Remote

```bash
# One-time setup to track upstream OpenClaw
git remote add upstream https://github.com/openclaw/openclaw.git
git fetch upstream
```

### Regular Sync Process

```bash
# Fetch latest changes from upstream OpenClaw
git fetch upstream

# Review changes before merging
git log HEAD..upstream/main --oneline

# Merge upstream changes into your local main branch
git checkout main
git merge upstream/main

# Resolve any conflicts if they occur
# Test thoroughly after merge
npm install
npm run build
npm test

# Push updated fork
git push origin main
```

### Conflict Resolution

Common conflict areas:
1. **Package.json**: Name, repository URLs, bin entries
2. **CLI Display**: Banner text and branding
3. **Documentation**: README and other docs
4. **Configuration**: Default settings and security policies

**Resolution Strategy**:
- Preserve Cortex branding and security enhancements
- Integrate upstream functionality improvements
- Maintain backward compatibility with OpenClaw commands
- Document any breaking changes in CHANGELOG.md

### Selective Cherry-Picking

For specific upstream features:

```bash
# Cherry-pick specific commits
git cherry-pick <commit-hash>

# Cherry-pick a range of commits
git cherry-pick <start-commit>..<end-commit>
```

## Additional Features vs Upstream

### Current Additions
- **Dual Command Support**: Both `cortex` and `openclaw` CLI commands
- **Enhanced Package Metadata**: Updated descriptions and repository references
- **Fork-Specific Documentation**: This FORK.md and updated README.md

### Planned Additions (Roadmap)
1. **Cortex UI**
   - Web-based management console
   - Real-time monitoring dashboard
   - Unified configuration interface
   - Node health visualization

2. **Security Hardening**
   - Stricter default permissions
   - Enhanced API authentication
   - Security policy enforcement
   - Audit trail functionality

3. **Enterprise Features**
   - Role-based access control (RBAC)
   - Compliance reporting
   - Multi-tenant support
   - Advanced logging and metrics

4. **Operational Improvements**
   - Simplified deployment workflows
   - Better error handling and diagnostics
   - Enhanced configuration validation
   - Automated health checks

## Architecture Decisions

### Design Principles

1. **Security First**: All features evaluated through security lens
2. **Backward Compatibility**: Maintain compatibility with OpenClaw installations
3. **Operational Simplicity**: Reduce complexity where possible
4. **Enterprise Ready**: Features suitable for professional environments
5. **Upstream Harmony**: Stay compatible with upstream innovations

### Key Architectural Choices

#### 1. CLI Compatibility Layer
**Decision**: Support both `cortex` and `openclaw` commands  
**Rationale**: Smooth migration path and muscle memory preservation  
**Implementation**: Shared entry point with dynamic CLI name resolution

#### 2. Unified UI Approach  
**Decision**: Single Cortex UI instead of distributed interfaces  
**Rationale**: Reduced complexity, better user experience, centralized management  
**Implementation**: Web-based dashboard hosted by gateway

#### 3. Security-First Defaults
**Decision**: More restrictive defaults with opt-in relaxation  
**Rationale**: Better security posture for enterprise environments  
**Implementation**: Enhanced configuration validation and security policies

#### 4. Fork Maintenance Strategy
**Decision**: Regular upstream sync with selective integration  
**Rationale**: Benefit from upstream innovations while maintaining fork identity  
**Implementation**: Documented sync process with conflict resolution guidelines

## Development Guidelines

### Contributing to the Fork

1. **Follow Upstream Patterns**: Use OpenClaw's existing patterns and conventions
2. **Security Review**: All changes require security impact assessment
3. **Compatibility Testing**: Ensure OpenClaw compatibility is maintained
4. **Documentation**: Update both user and developer documentation

### Testing Strategy

- **Unit Tests**: All new features require unit test coverage
- **Integration Tests**: Verify OpenClaw compatibility is preserved
- **Security Tests**: Validate security enhancements work as expected
- **E2E Tests**: Ensure full system functionality after changes

### Release Process

1. **Sync with Upstream**: Merge latest OpenClaw changes
2. **Feature Integration**: Add/update Cortex-specific features
3. **Testing**: Comprehensive test suite execution
4. **Documentation**: Update README.md and CHANGELOG.md
5. **Versioning**: Follow semantic versioning aligned with upstream
6. **Release**: Tag and publish to npm registry

## Migration Notes

### From OpenClaw to Cortex

Existing OpenClaw users can migrate seamlessly:

1. **No Data Loss**: All existing data, configurations, and skills preserved
2. **Command Compatibility**: All existing scripts and workflows continue working
3. **Channel Integrations**: All channel configurations remain functional
4. **Model Configs**: Authentication and model settings transfer directly

### From Cortex back to OpenClaw

Fork users can return to upstream OpenClaw:

1. **Data Portability**: All data formats remain OpenClaw-compatible
2. **Configuration Transfer**: Settings files work with upstream version
3. **Skill Compatibility**: Custom skills continue working in OpenClaw

## Support and Community

- **Issues**: Report fork-specific issues at [Cortex Issues](https://github.com/ivanuser/cortex/issues)
- **Upstream Issues**: OpenClaw compatibility issues should be reported upstream
- **Discussions**: Use [GitHub Discussions](https://github.com/ivanuser/cortex/discussions) for questions
- **Security**: Report security issues privately via GitHub Security Advisories

## Licensing

Cortex maintains the same MIT license as upstream OpenClaw. All contributions follow the same licensing terms.

---

This fork exists to serve specific use cases while contributing back to the broader OpenClaw ecosystem where possible. We aim to be good citizens of the open source community.