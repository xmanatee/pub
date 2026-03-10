#!/usr/bin/env bash
set -euo pipefail

REPO="xmanatee/pub"
INSTALL_DIR="${PUBBLUE_INSTALL_DIR:-$HOME/.local/bin}"
BIN_NAME="pubblue"

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

detect_shell_rc() {
  local shell_name
  shell_name="$(basename "${SHELL:-}")"
  case "$shell_name" in
    zsh)  echo "$HOME/.zshrc" ;;
    bash)
      if [ -f "$HOME/.bashrc" ]; then
        echo "$HOME/.bashrc"
      elif [ -f "$HOME/.bash_profile" ]; then
        echo "$HOME/.bash_profile"
      else
        echo "$HOME/.bashrc"
      fi
      ;;
    fish) echo "$HOME/.config/fish/config.fish" ;;
    *)    echo "" ;;
  esac
}

add_to_path() {
  local rc_file export_line
  rc_file="$(detect_shell_rc)"
  if [ -z "$rc_file" ]; then
    echo "Add ${INSTALL_DIR} to your PATH manually."
    return
  fi

  if [ "$(basename "${SHELL:-}")" = "fish" ]; then
    export_line="fish_add_path ${INSTALL_DIR}"
  else
    export_line="export PATH=\"${INSTALL_DIR}:\$PATH\""
  fi

  if [ -f "$rc_file" ] && grep -qF "$INSTALL_DIR" "$rc_file" 2>/dev/null; then
    return
  fi

  echo "" >> "$rc_file"
  echo "# Added by pubblue installer" >> "$rc_file"
  echo "$export_line" >> "$rc_file"
  echo "Added ${INSTALL_DIR} to PATH in ${rc_file}"
  echo "Run \`source ${rc_file}\` or open a new terminal to use pubblue."
}

main() {
  local target tag url bin_path tmp_path

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

  local version="${tag#cli-v}"
  url="https://github.com/${REPO}/releases/download/${tag}/${BIN_NAME}-${target}"
  bin_path="${INSTALL_DIR}/${BIN_NAME}"
  tmp_path="${INSTALL_DIR}/.${BIN_NAME}.tmp.$$"

  mkdir -p "$INSTALL_DIR"
  echo "Downloading ${BIN_NAME} v${version} for ${target}..."
  trap 'rm -f "$tmp_path"' EXIT
  curl -fSL --progress-bar -o "$tmp_path" "$url"
  chmod +x "$tmp_path"

  if ! "$tmp_path" --version >/dev/null 2>&1; then
    echo "Warning: installed binary failed to run." >&2
  fi

  mv "$tmp_path" "$bin_path"
  trap - EXIT

  echo ""
  echo "pubblue v${version} installed to ${bin_path}"

  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    add_to_path
  fi
}

main "$@"
