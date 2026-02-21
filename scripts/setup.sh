#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Pub Platform — Setup Script
#
# This script sets up the entire Pub platform:
# 1. Installs dependencies for web app and CLI
# 2. Initializes Convex project
# 3. Configures Vercel project
# 4. Sets up environment variables
# 5. Configures GitHub Actions secrets
#
# Prerequisites:
#   - Node.js 22+
#   - npm
#   - GitHub CLI (gh) — for setting secrets
#   - Vercel CLI — will be installed if missing
#   - Convex CLI — will be installed if missing
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PUB_DIR/../.." && pwd)"
CLI_DIR="$PUB_DIR/cli"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ─────────────────────────────────────────────────────────────
# Step 1: Check prerequisites
# ─────────────────────────────────────────────────────────────
check_prerequisites() {
  info "Checking prerequisites..."

  if ! command -v node &>/dev/null; then
    err "Node.js is required. Install it from https://nodejs.org"
    exit 1
  fi

  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -lt 20 ]; then
    err "Node.js 20+ required, found $(node -v)"
    exit 1
  fi
  ok "Node.js $(node -v)"

  if ! command -v npm &>/dev/null; then
    err "npm is required"
    exit 1
  fi
  ok "npm $(npm -v)"

  if ! command -v gh &>/dev/null; then
    warn "GitHub CLI (gh) not found — GitHub Actions secrets won't be configured automatically"
    warn "Install from https://cli.github.com"
  else
    ok "GitHub CLI $(gh --version | head -1)"
  fi
}

# ─────────────────────────────────────────────────────────────
# Step 2: Install dependencies
# ─────────────────────────────────────────────────────────────
install_dependencies() {
  info "Installing web app dependencies..."
  cd "$PUB_DIR"
  npm install
  ok "Web app dependencies installed"

  info "Installing CLI dependencies..."
  cd "$CLI_DIR"
  npm install
  ok "CLI dependencies installed"
}

# ─────────────────────────────────────────────────────────────
# Step 3: Set up Convex
# ─────────────────────────────────────────────────────────────
setup_convex() {
  info "Setting up Convex..."
  cd "$PUB_DIR"

  if ! npx convex --version &>/dev/null; then
    warn "Convex CLI not available via npx, installing..."
    npm install -g convex
  fi

  echo ""
  echo "────────────────────────────────────────────"
  echo "  Convex Setup"
  echo "────────────────────────────────────────────"
  echo ""
  echo "This will create a new Convex project or connect to an existing one."
  echo "You'll need to log in to Convex if you haven't already."
  echo ""

  npx convex dev --once --configure=new

  # Get deployment URLs
  CONVEX_URL=$(npx convex env get CONVEX_URL 2>/dev/null || echo "")
  if [ -z "$CONVEX_URL" ]; then
    echo ""
    read -rp "Enter your Convex deployment URL (from dashboard): " CONVEX_URL
  fi

  CONVEX_SITE_URL="${CONVEX_URL//.convex.cloud/.convex.site}"

  # Write .env.local
  cat > "$PUB_DIR/.env.local" <<EOF
VITE_CONVEX_URL=$CONVEX_URL
VITE_CONVEX_SITE_URL=$CONVEX_SITE_URL
EOF

  ok "Convex configured"
  info "Deployment URL: $CONVEX_URL"
  info "Site URL: $CONVEX_SITE_URL"
}

# ─────────────────────────────────────────────────────────────
# Step 4: Set up Vercel
# ─────────────────────────────────────────────────────────────
setup_vercel() {
  info "Setting up Vercel..."

  if ! command -v vercel &>/dev/null; then
    info "Installing Vercel CLI..."
    npm install -g vercel
  fi

  cd "$PUB_DIR"

  echo ""
  echo "────────────────────────────────────────────"
  echo "  Vercel Setup"
  echo "────────────────────────────────────────────"
  echo ""
  echo "This will link your project to Vercel."
  echo ""

  vercel link

  # Set environment variables on Vercel
  if [ -f "$PUB_DIR/.env.local" ]; then
    source <(grep -v '^#' "$PUB_DIR/.env.local" | sed 's/^/export /')
    echo "$VITE_CONVEX_URL" | vercel env add VITE_CONVEX_URL production preview development 2>/dev/null || true
    echo "$VITE_CONVEX_SITE_URL" | vercel env add VITE_CONVEX_SITE_URL production preview development 2>/dev/null || true
  fi

  ok "Vercel configured"
}

# ─────────────────────────────────────────────────────────────
# Step 5: Set up GitHub Actions secrets
# ─────────────────────────────────────────────────────────────
setup_github_secrets() {
  if ! command -v gh &>/dev/null; then
    warn "Skipping GitHub secrets setup (gh CLI not available)"
    echo ""
    echo "To set up CI/CD manually, add these repository secrets:"
    echo "  CONVEX_DEPLOY_KEY  — from Convex dashboard → Settings → Deploy keys"
    echo "  VERCEL_TOKEN       — from Vercel → Settings → Tokens"
    echo "  NPM_TOKEN          — from npmjs.com → Access Tokens (for CLI releases)"
    return
  fi

  cd "$REPO_ROOT"

  echo ""
  echo "────────────────────────────────────────────"
  echo "  GitHub Actions Secrets"
  echo "────────────────────────────────────────────"
  echo ""

  read -rp "Enter Convex deploy key (from dashboard → Settings → Deploy keys): " CONVEX_DEPLOY_KEY
  if [ -n "$CONVEX_DEPLOY_KEY" ]; then
    echo "$CONVEX_DEPLOY_KEY" | gh secret set CONVEX_DEPLOY_KEY
    ok "CONVEX_DEPLOY_KEY set"
  fi

  read -rp "Enter Vercel token (from Vercel → Settings → Tokens): " VERCEL_TOKEN
  if [ -n "$VERCEL_TOKEN" ]; then
    echo "$VERCEL_TOKEN" | gh secret set VERCEL_TOKEN
    ok "VERCEL_TOKEN set"
  fi

  read -rp "Enter npm token (for CLI publishing, or press Enter to skip): " NPM_TOKEN
  if [ -n "$NPM_TOKEN" ]; then
    echo "$NPM_TOKEN" | gh secret set NPM_TOKEN
    ok "NPM_TOKEN set"
  fi

  ok "GitHub secrets configured"
}

# ─────────────────────────────────────────────────────────────
# Step 6: Build CLI
# ─────────────────────────────────────────────────────────────
build_cli() {
  info "Building CLI..."
  cd "$CLI_DIR"
  npm run build
  ok "CLI built successfully"
  echo ""
  echo "To install the CLI globally:"
  echo "  cd $CLI_DIR && npm link"
  echo ""
  echo "Then configure it:"
  echo "  pubblue configure --api-key YOUR_KEY --url YOUR_CONVEX_SITE_URL"
}

# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────
main() {
  echo ""
  echo "╔═══════════════════════════════════════════╗"
  echo "║   Pub Platform — Setup                    ║"
  echo "╚═══════════════════════════════════════════╝"
  echo ""

  check_prerequisites
  echo ""
  install_dependencies
  echo ""
  setup_convex
  echo ""
  setup_vercel
  echo ""
  setup_github_secrets
  echo ""
  build_cli
  echo ""

  echo "╔═══════════════════════════════════════════╗"
  echo "║   Setup complete!                         ║"
  echo "╚═══════════════════════════════════════════╝"
  echo ""
  echo "Next steps:"
  echo "  1. Start the dev server:  cd apps/pub && npm run dev"
  echo "  2. Sign up at http://localhost:3000"
  echo "  3. Get an API key from the dashboard"
  echo "  4. Configure CLI: pubblue configure --api-key KEY --url URL"
  echo "  5. Publish something: pubblue publish my-file.html"
  echo ""
}

main "$@"
