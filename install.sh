#!/bin/bash
set -euo pipefail

# Cortex Installation Script
# Simplifies deployment by asking Gateway or Node and setting up accordingly

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════╗"
    echo "║           Cortex Installer            ║"
    echo "║    Simplified OpenClaw Architecture   ║"
    echo "╚═══════════════════════════════════════╝"
    echo -e "${NC}"
}

log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

prompt() {
    echo -e "${BLUE}[PROMPT]${NC} $1"
}

check_dependencies() {
    log "Checking dependencies..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        error "Node.js is required but not installed. Please install Node.js >= 22."
    fi
    
    # Check Node.js version
    node_version=$(node --version | sed 's/v//')
    node_major=$(echo "$node_version" | cut -d. -f1)
    if [ "$node_major" -lt 22 ]; then
        error "Node.js >= 22 is required. Current version: $node_version"
    fi
    
    log "Node.js version $node_version ✓"
}

# Detect install mode: npm (global) vs source (in repo)
detect_install_mode() {
    if [ -f "package.json" ] && grep -q '"openclaw"' package.json 2>/dev/null; then
        INSTALL_MODE="source"
    else
        INSTALL_MODE="npm"
    fi
}

install_cortex_npm() {
    log "Installing Cortex from npm..."
    
    # Remove upstream openclaw if present
    if command -v openclaw &> /dev/null; then
        local current_pkg
        current_pkg=$(npm list -g openclaw --depth=0 2>/dev/null | grep openclaw || true)
        if echo "$current_pkg" | grep -q "openclaw@" && ! echo "$current_pkg" | grep -q "openclaw-cortex"; then
            warn "Upstream 'openclaw' package detected. Removing to avoid conflicts..."
            npm uninstall -g openclaw 2>/dev/null || true
        fi
    fi
    
    npm install -g openclaw-cortex
    log "Cortex installed ✓"
    log "Commands available: cortex, openclaw"
}

build_cortex() {
    log "Building Cortex from source..."
    
    if ! command -v pnpm &> /dev/null; then
        log "Installing pnpm..."
        npm install -g pnpm
    fi
    
    log "Installing dependencies..."
    pnpm install
    
    log "Building project..."
    pnpm build
    
    log "Building UI..."
    cd ui && pnpm install && pnpm build && cd ..
    
    log "Linking globally..."
    npm link
    
    log "Build completed ✓"
}

setup_gateway() {
    log "Setting up Gateway mode..."
    
    # Install Cortex
    if [ "$INSTALL_MODE" = "npm" ]; then
        install_cortex_npm
    else
        build_cortex
    fi
    
    # Create default config directory
    CONFIG_DIR="$HOME/.openclaw"
    mkdir -p "$CONFIG_DIR"
    
    # Create basic gateway config if it doesn't exist
    CONFIG_FILE="$CONFIG_DIR/config.toml"
    if [ ! -f "$CONFIG_FILE" ]; then
        log "Creating gateway configuration..."
        cat > "$CONFIG_FILE" << 'EOF'
[gateway]
# Gateway serves the full Cortex experience including web UI
mode = "local"
port = 18789
bind = "loopback"

[gateway.controlUi]
# Enable the Control UI (this is the main interface)
enabled = true
basePath = "/"

[gateway.auth]
# Set up authentication - you'll want to configure this
mode = "token"
# Uncomment and set a secure token:
# token = "your-secure-token-here"

[agents]
# Default agent configuration
defaultModel = "anthropic/claude-sonnet-4"

# Add your model API keys:
# [providers.anthropic]
# apiKey = "sk-ant-..."

# [providers.openai]  
# apiKey = "sk-..."
EOF
        log "Created config file: $CONFIG_FILE"
        warn "Remember to configure API keys and authentication token in $CONFIG_FILE"
    else
        log "Using existing config: $CONFIG_FILE"
    fi
    
    # Install as system service (optional)
    echo
    prompt "Would you like to install the gateway as a system service? (y/N)"
    read -r install_service
    if [[ $install_service =~ ^[Yy]$ ]]; then
        log "Installing gateway service..."
        node ./openclaw.mjs gateway install
        log "Gateway service installed. Use 'cortex gateway start' to start it."
    else
        log "Skipping service installation."
        log "You can run the gateway with: node ./openclaw.mjs gateway run"
    fi
    
    echo
    log "Gateway setup complete! 🎉"
    echo
    echo -e "${GREEN}Next steps:${NC}"
    echo "1. Edit $CONFIG_FILE to add your API keys"
    echo "2. Set up authentication (gateway.auth.token)"
    if [[ $install_service =~ ^[Yy]$ ]]; then
        echo "3. Start the service: cortex gateway start"
    else
        echo "3. Run the gateway: node ./openclaw.mjs gateway run"
    fi
    echo "4. Open http://localhost:18789 in your browser"
}

setup_node() {
    log "Setting up Node mode..."
    
    # Install Cortex
    if [ "$INSTALL_MODE" = "npm" ]; then
        install_cortex_npm
    else
        build_cortex
    fi
    
    # Get gateway connection details
    echo
    prompt "Enter the gateway hostname or IP address:"
    read -r gateway_host
    if [ -z "$gateway_host" ]; then
        error "Gateway host is required."
    fi
    
    prompt "Enter the gateway port (default: 18789):"
    read -r gateway_port
    gateway_port=${gateway_port:-18789}
    
    # Validate port is a number
    if ! [[ "$gateway_port" =~ ^[0-9]+$ ]]; then
        error "Port must be a number."
    fi
    
    prompt "Use TLS/SSL? (y/N):"
    read -r use_tls
    tls_flag=""
    if [[ $use_tls =~ ^[Yy]$ ]]; then
        tls_flag="--tls"
        log "TLS enabled."
    fi
    
    prompt "Enter a display name for this node (optional):"
    read -r display_name
    display_name_flag=""
    if [ -n "$display_name" ]; then
        display_name_flag="--display-name \"$display_name\""
    fi
    
    # Test connection
    log "Testing connection to gateway..."
    timeout 5 bash -c "</dev/tcp/$gateway_host/$gateway_port" 2>/dev/null || {
        error "Cannot connect to $gateway_host:$gateway_port. Please check the gateway is running and accessible."
    }
    log "Connection test successful ✓"
    
    # Install as system service (optional)
    echo
    prompt "Would you like to install the node as a system service? (y/N)"
    read -r install_service
    if [[ $install_service =~ ^[Yy]$ ]]; then
        log "Installing node service..."
        # shellcheck disable=SC2086
        node ./openclaw.mjs node install --host "$gateway_host" --port "$gateway_port" $tls_flag $display_name_flag
        log "Node service installed. Use 'cortex node start' to start it."
    else
        log "Skipping service installation."
        log "You can run the node with:"
        # shellcheck disable=SC2086
        echo "  node ./openclaw.mjs node run --host $gateway_host --port $gateway_port $tls_flag $display_name_flag"
    fi
    
    echo
    log "Node setup complete! 🎉"
    echo
    echo -e "${GREEN}Next steps:${NC}"
    if [[ $install_service =~ ^[Yy]$ ]]; then
        echo "1. Start the service: cortex node start"
    else
        echo "1. Run the node: node ./openclaw.mjs node run --host $gateway_host --port $gateway_port $tls_flag $display_name_flag"
    fi
    echo "2. The node will connect to the gateway and appear in the gateway's web UI"
    echo "3. No further configuration needed - nodes are headless workers"
}

main() {
    print_header
    
    # Check dependencies
    check_dependencies
    detect_install_mode
    
    if [ "$INSTALL_MODE" = "source" ]; then
        log "Detected source install (in repository)"
    else
        log "Will install from npm (openclaw-cortex)"
    fi
    echo
    
    echo -e "${BLUE}Cortex Architecture:${NC}"
    echo "• Gateway: Full service with web UI, agents, memory, channels"
    echo "• Node: Headless worker that connects to a gateway"
    echo ""
    
    prompt "What would you like to install?"
    echo "1) Gateway (full service + web UI)"
    echo "2) Node (headless worker)"
    echo ""
    prompt "Enter your choice (1 or 2):"
    read -r choice
    
    case $choice in
        1)
            setup_gateway
            ;;
        2)
            setup_node
            ;;
        *)
            error "Invalid choice. Please select 1 or 2."
            ;;
    esac
}

# Run main function
main "$@"