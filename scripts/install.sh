#!/usr/bin/env bash
# install.sh -- Build ft-pipeline and install the binary onto a user bin dir.
#
# Prefer order for the install directory:
#   1. $XDG_BIN (if set)
#   2. $XDG_BIN_HOME (if set; common de-facto XDG user-bin)
#   3. $HOME/.local/bin (or %USERPROFILE%\.local\bin on Windows shells)
#   4. Last resort: leave the binary in dist/ and print how to run it
#
# Override destination with INSTALL_DIR=/path/to/bin.
#
# Usage:
#   deno task install
#   ./scripts/install.sh
#   INSTALL_DIR=~/bin ./scripts/install.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NAME="ft-pipeline"
DIST_DIR="$ROOT/dist"
DIST="$DIST_DIR/$NAME"

echo "==> Building host binary (deno task build)"
deno task build

if [[ ! -f "$DIST" && -f "${DIST}.exe" ]]; then
  DIST="${DIST}.exe"
  NAME="${NAME}.exe"
fi

if [[ ! -f "$DIST" ]]; then
  echo "error: build finished but binary missing: $DIST_DIR/$NAME" >&2
  exit 1
fi

# Returns 0 and prints a directory when one can be used; 1 when none.
resolve_bin_dir() {
  if [[ -n "${INSTALL_DIR:-}" ]]; then
    printf '%s\n' "$INSTALL_DIR"
    return 0
  fi
  if [[ -n "${XDG_BIN:-}" ]]; then
    printf '%s\n' "$XDG_BIN"
    return 0
  fi
  if [[ -n "${XDG_BIN_HOME:-}" ]]; then
    printf '%s\n' "$XDG_BIN_HOME"
    return 0
  fi

  local home="${HOME:-}"
  if [[ -z "$home" ]]; then
    home="${USERPROFILE:-}"
  fi
  if [[ -n "$home" ]]; then
    printf '%s\n' "$home/.local/bin"
    return 0
  fi
  return 1
}

path_has_dir() {
  local dir="$1"
  case ":${PATH:-}:" in
    *":${dir}:"*) return 0 ;;
    *) return 1 ;;
  esac
}

install_binary() {
  local dest_dir="$1"
  local dest="$dest_dir/$NAME"

  mkdir -p "$dest_dir"

  if command -v install >/dev/null 2>&1; then
    install -m 755 "$DIST" "$dest"
  else
    cp "$DIST" "$dest"
    chmod 755 "$dest"
  fi

  printf '%s\n' "$dest"
}

if BIN_DIR="$(resolve_bin_dir)"; then
  if ! DEST="$(install_binary "$BIN_DIR")"; then
    echo "warn: could not write to $BIN_DIR -- leaving binary in dist/" >&2
    echo "Binary: $DIST"
    echo "Run:    $DIST <command>"
    exit 0
  fi

  echo "Installed: $DEST"

  if path_has_dir "$BIN_DIR"; then
    echo "On PATH. Try: $NAME --help"
  else
    echo "Not on PATH yet. Add this to your shell config:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
    echo "Then open a new shell, or run: $DEST --help"
  fi
else
  echo "No user bin dir (set XDG_BIN, XDG_BIN_HOME, HOME, or INSTALL_DIR)."
  echo "Binary ready at: $DIST"
  echo "Run:            $DIST <command>"
fi
