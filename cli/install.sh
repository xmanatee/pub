#!/usr/bin/env bash
set -euo pipefail

REPO="xmanatee/pub"
INSTALL_DIR="${PUBBLUE_INSTALL_DIR:-$HOME/.local/bin}"

detect_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    *)
      echo "Unsupported OS: $os" >&2
      exit 1
      ;;
  esac

  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)
      echo "Unsupported architecture: $arch" >&2
      exit 1
      ;;
  esac

  echo "${os}-${arch}"
}

get_latest_tag() {
  curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=10" \
    | grep -o '"tag_name": *"cli-v[^"]*"' \
    | head -1 \
    | sed 's/"tag_name": *"//;s/"//'
}

main() {
  local target tag url

  target="$(detect_target)"
  echo "Detected platform: ${target}"

  if [ -n "${1:-}" ]; then
    tag="$1"
  else
    tag="$(get_latest_tag)"
  fi

  if [ -z "$tag" ]; then
    echo "Could not determine latest CLI release tag." >&2
    exit 1
  fi
  echo "Release: ${tag}"

  url="https://github.com/${REPO}/releases/download/${tag}/pubblue-${target}"

  mkdir -p "$INSTALL_DIR"
  echo "Downloading pubblue-${target}..."
  curl -fsSL -o "${INSTALL_DIR}/pubblue" "$url"
  chmod +x "${INSTALL_DIR}/pubblue"

  echo "Installed to ${INSTALL_DIR}/pubblue"

  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    echo ""
    echo "Add ${INSTALL_DIR} to your PATH:"
    echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
  fi
}

main "$@"
