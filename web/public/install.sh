#!/usr/bin/env bash
set -euo pipefail

REPO="xmanatee/pub"
INSTALL_DIR="${PUB_INSTALL_DIR:-$HOME/.local/bin}"
BIN_NAME="pub"

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

version_gt() {
  local IFS=.
  local -a a=($1) b=($2)
  local i
  for i in 0 1 2; do
    if [ "${a[$i]:-0}" -gt "${b[$i]:-0}" ]; then return 0; fi
    if [ "${a[$i]:-0}" -lt "${b[$i]:-0}" ]; then return 1; fi
  done
  return 1
}

get_latest_tag() {
  local page response best_tag="" best_ver="0.0.0" tag ver

  for page in 1 2 3 4 5 6 7 8 9 10; do
    response="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}")"

    while IFS= read -r tag; do
      [ -z "$tag" ] && continue
      ver="${tag#cli-v}"
      if version_gt "$ver" "$best_ver"; then
        best_tag="$tag"
        best_ver="$ver"
      fi
    done <<< "$(printf '%s' "$response" \
      | grep -o '"tag_name": *"cli-v[^"]*"' \
      | sed 's/"tag_name": *"//;s/"//')"

    if [ -n "$best_tag" ]; then
      printf '%s\n' "$best_tag"
      return 0
    fi

    if ! printf '%s' "$response" | grep -q '"tag_name"'; then
      break
    fi
  done

  return 1
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
  echo "# Added by pub installer" >> "$rc_file"
  echo "$export_line" >> "$rc_file"
  echo "Added ${INSTALL_DIR} to PATH in ${rc_file}"
  echo "Run \`source ${rc_file}\` or open a new terminal to use pub."
}

main() {
  local target tag url bin_path tmp_path reported_version

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

  if ! reported_version="$(PUB_SKIP_UPDATE_CHECK=1 "$tmp_path" --version 2>/dev/null)"; then
    echo "Downloaded binary failed validation; aborting install." >&2
    exit 1
  fi
  reported_version="$(printf '%s' "$reported_version" | tr -d '\r' | tail -n 1)"
  if [ "$reported_version" != "$version" ]; then
    echo "Downloaded binary reported version ${reported_version:-<empty>}; expected ${version}. Aborting install." >&2
    exit 1
  fi

  mv "$tmp_path" "$bin_path"
  trap - EXIT

  echo ""
  echo "pub v${version} installed to ${bin_path}"

  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    add_to_path
  fi
}

main "$@"
