#!/usr/bin/env bash
# run-with-llm.sh -- Run a CLI command with automatic LLM server lifecycle management.
#
# If the command fails due to an LLM connection error, this script:
#   1. Detects the failure by scanning output for common connection-refused patterns
#   2. Checks if an LLM server is already running (pgrep)
#   3. Starts one if not, waits for readiness, retries the command
#   4. Cleans up only the server it started (not pre-existing ones)
#
# Customize the variables below, then drop this script anywhere.
# Designed for cron jobs where you want deterministic runs without manual LLM babysitting.
#
# Usage:
#   ./run-with-llm.sh                    # quiet mode (errors only -- for cron)
#   ./run-with-llm.sh --verbose          # show all output (manual runs)
#   PIPELINE="my-cli" ./run-with-llm.sh  # override binary name
#   LLM_START_CMD="my-llm-server -p 8080" ./run-with-llm.sh  # custom start command
#
# shellcheck disable=SC2329,SC2034
set -euo pipefail

# -- Configuration ----------------------------------------------------------
# Binary/command to run. Must accept a subcommand as its first argument.
PIPELINE="${PIPELINE:-ft-pipeline}"

# Subcommand to pass to the binary (change if your tool uses a different verb).
PIPELINE_CMD="${PIPELINE_CMD:-full}"

# LLM server process name used by pgrep -x (must match the process name exactly).
LLM_PROCESS="${LLM_PROCESS:-llama-server}"

# Command to start the LLM server. Run in background; the PID is tracked for cleanup.
LLM_START_CMD="${LLM_START_CMD:-llama-me -r}"

# Port the LLM server listens on. Used for readiness checks via /v1/models.
LLM_PORT="${LLM_PORT:-1234}"

# Max seconds to wait for the LLM server to become ready.
LLM_TIMEOUT="${LLM_TIMEOUT:-60}"

# -- Flags ------------------------------------------------------------------
QUIET=true
for arg in "$@"; do
    case "$arg" in
        -v|--verbose) QUIET=false ;;
    esac
done

# -- Internal state ---------------------------------------------------------
LLM_PID=""
LLM_WAS_RUNNING=false

_out() {
    if [ "$QUIET" = false ]; then
        printf "%s\n" "$@"
    fi
}

_err() {
    # Errors always print (even in quiet mode) -- they are the reason to deliver.
    # Uses first arg as printf format string, rest as values.
    printf "$1\n" "${@:2}"
}

cleanup() {
    if [ -n "$LLM_PID" ] && [ "$LLM_WAS_RUNNING" = false ]; then
        _out "-- Killing %s we started (PID %s)" "$LLM_PROCESS" "$LLM_PID"
        kill "$LLM_PID" 2>/dev/null && wait "$LLM_PID" 2>/dev/null || true
        _out "Stopped."
    fi
}
trap cleanup EXIT

is_llm_down() {
    printf "%s" "$1" | grep -qiE 'connection refused|econnrefused|ECONNREFUSED|LLM server not running'
}

# Single command attempt. Returns exit code.
run() {
    $PIPELINE "$PIPELINE_CMD" 2>&1
}

ensure_llm() {
    if pgrep -x "$LLM_PROCESS" >/dev/null 2>&1; then
        LLM_WAS_RUNNING=true
        _out "%s already running (will not kill on exit)" "$LLM_PROCESS"
        return 0
    fi

    _out "Starting %s ..." "$LLM_START_CMD"
    $LLM_START_CMD &
    LLM_PID=$!
    _out "Started PID %s -- waiting for readiness on port %s ..." "$LLM_PID" "$LLM_PORT"

    local attempts=$((LLM_TIMEOUT / 2))
    for i in $(seq 1 "$attempts"); do
        if curl -s "http://localhost:$LLM_PORT/v1/models" >/dev/null 2>&1; then
            _out "%s ready" "$LLM_PROCESS"
            return 0
        fi
        sleep 2
    done

    _err "FAILED: %s did not become ready within %ss" "$LLM_PROCESS" "$LLM_TIMEOUT"
    return 1
}

main() {
    # First attempt
    local output exit_code=0
    output=$(run) || exit_code=$?

    # Many CLIs swallow classify/LLM errors and exit 0, so check output directly
    if [ "$exit_code" -eq 0 ] && ! is_llm_down "$output"; then
        exit 0
    fi

    if ! is_llm_down "$output"; then
        _err "FAILED (exit %d) -- not LLM related" "$exit_code"
        _err "%s" "$output"
        exit 1
    fi

    _err "LLM failure detected -- checking server status..."
    ensure_llm || exit 1

    # Retry
    _err "Retrying at %s ..." "$(date)"
    exit_code=0
    output=$(run) || exit_code=$?

    if [ "$exit_code" -eq 0 ] && ! is_llm_down "$output"; then
        exit 0
    fi

    if is_llm_down "$output"; then
        _err "FAILED on retry -- LLM still unreachable (exit %d)" "$exit_code"
    else
        _err "FAILED on retry (exit %d)" "$exit_code"
    fi
    _err "%s" "$output"
    exit 1
}

main
