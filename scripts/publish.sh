#!/usr/bin/env bash
# Publish the Cortex fork as openclaw-cortex
# Default: publish to GitLab generic package registry (dev iterations)
# With --npm: also publish to npmjs.com (stable releases)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

PKG="package.json"
BACKUP="package.json.publish-backup"
GITLAB_PROJECT_ID=98
GITLAB_HOST="192.168.1.75"
GITLAB_TOKEN="gitlab_honercloud-4MssKsyjnO53SDkF5oBvVm86MQp1OjEH.01.0w0hj2xv0"

# Parse args
PUBLISH_NPM=false
VERSION=""
for arg in "$@"; do
  case "$arg" in
    --npm) PUBLISH_NPM=true ;;
    *) VERSION="$arg" ;;
  esac
done

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/publish.sh <version> [--npm]"
  echo ""
  echo "  <version>   Version to publish (e.g. 3.6.0)"
  echo "  --npm       Also publish to npmjs.com (stable releases only)"
  echo ""
  echo "Default: publishes to GitLab package registry only"
  exit 1
fi

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
  echo "ERROR: dist/control-ui/ not found. Run 'pnpm ui:build' first."
  exit 1
fi

echo "Publishing openclaw-cortex@${VERSION}"
echo "  → GitLab registry: always"
echo "  → npm registry: $([ "$PUBLISH_NPM" = true ] && echo 'YES' || echo 'no (use --npm for stable releases)')"
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

# Pack the tarball
echo ""
echo "📦 Packing tarball..."
TARBALL="openclaw-cortex-${VERSION}.tgz"
npm pack --quiet 2>&1 | tail -1
echo "   Packed: ${TARBALL} ($(du -h "$TARBALL" | cut -f1))"

# --- GitLab Package Registry (generic upload via curl) ---
echo ""
echo "📦 Uploading to GitLab..."
UPLOAD_RESPONSE=$(curl -sk \
  --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
  --upload-file "$TARBALL" \
  "https://${GITLAB_HOST}/api/v4/projects/${GITLAB_PROJECT_ID}/packages/generic/openclaw-cortex/${VERSION}/${TARBALL}" 2>&1)
echo "   $UPLOAD_RESPONSE"

# --- npm (only if --npm flag) ---
if [ "$PUBLISH_NPM" = true ]; then
  echo ""
  echo "📦 Publishing to npmjs.com..."
  npm publish "$TARBALL" --access public --registry "https://registry.npmjs.org/"
fi

# Restore original package.json
mv "$BACKUP" "$PKG"

# Clean up tarball
rm -f "$TARBALL"

echo ""
echo "✅ Published openclaw-cortex@${VERSION}"
echo "   GitLab: curl -L https://${GITLAB_HOST}/api/v4/projects/${GITLAB_PROJECT_ID}/packages/generic/openclaw-cortex/${VERSION}/${TARBALL}"
if [ "$PUBLISH_NPM" = true ]; then
  echo "   npm:    npm install -g openclaw-cortex@${VERSION}"
fi
