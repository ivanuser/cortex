#!/usr/bin/env bash
# Publish the Cortex fork as openclaw-cortex on npm
# Temporarily swaps the package name for publishing, then restores it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

PKG="package.json"
BACKUP="package.json.publish-backup"

# Ensure clean state
if [ -f "$BACKUP" ]; then
  echo "ERROR: $BACKUP exists — previous publish may have failed. Restore manually."
  exit 1
fi

# Check we're built
if [ ! -f "dist/index.js" ]; then
  echo "ERROR: dist/ not found. Run 'pnpm build' first."
  exit 1
fi

if [ ! -f "dist/control-ui/index.html" ]; then
  echo "ERROR: dist/control-ui/ not found. Run 'cd ui && pnpm build' first."
  exit 1
fi

# Parse version from args or use default
VERSION="${1:-3.0.0}"

echo "Publishing openclaw-cortex@${VERSION}"
echo ""

# Backup original package.json
cp "$PKG" "$BACKUP"

# Swap name and version for publishing
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$PKG', 'utf8'));
pkg.name = 'openclaw-cortex';
pkg.version = '$VERSION';
pkg.description = 'Cortex — AI Assistant Command Center. A security-hardened fork of OpenClaw with Cortex UI.';
pkg.repository = { type: 'git', url: 'https://github.com/ivanuser/cortex.git' };
pkg.homepage = 'https://github.com/ivanuser/cortex';
pkg.bugs = { url: 'https://github.com/ivanuser/cortex/issues' };
pkg.author = 'ivanuser <ivan@honercloud.com>';
fs.writeFileSync('$PKG', JSON.stringify(pkg, null, 2) + '\n');
"

echo "Package name swapped to openclaw-cortex@${VERSION}"
echo "Publishing..."

# Publish
npm publish --access public

# Restore original package.json
mv "$BACKUP" "$PKG"

echo ""
echo "✅ Published openclaw-cortex@${VERSION}"
echo "   Install: npm install -g openclaw-cortex"
echo "   Commands: cortex, openclaw"
