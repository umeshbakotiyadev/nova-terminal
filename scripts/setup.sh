#!/usr/bin/env bash
# One-time setup for working on Nova Terminal on macOS: checks for Rust,
# Node and pnpm, then installs the packages.
set -euo pipefail

cd "$(dirname "$0")/.."

# Pick up tools installed in this same Terminal session (rustup, nvm).
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if ! command -v node >/dev/null 2>&1 && [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  nvm use --silent 22 >/dev/null 2>&1 || nvm install 22
fi
# pnpm ships with Node through corepack, so there's nothing extra to install.
if ! command -v pnpm >/dev/null 2>&1 && command -v corepack >/dev/null 2>&1; then
  corepack enable pnpm 2>/dev/null || npm install -g pnpm
fi

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "✗ $1 not found. $2"
    exit 1
  fi
}

need cargo "Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
need node  "Install Node 22: brew install node@22   (or: nvm install 22)"
need pnpm  "Install pnpm: npm install -g pnpm   (or: brew install pnpm)"

echo "→ Installing packages"
pnpm install

echo
echo "✓ Ready. Start Nova with:  pnpm tauri dev"
