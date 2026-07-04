#!/usr/bin/env bash
# run-with-llm.sh — Run a CLI command with automatic LLM server lifecycle management.
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
#   ./run-with-llm.sh                    # uses defaults below
#   PIPELINE="my-cli" ./run-with-llm.sh  # override binary name
#   LLM_START_CMD="my-llm-server -p 8080" ./run-with-llm.sh  # custom start command
#
# shellcheck disable=SC2329,SC2034
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────
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

# ── Internal state ─────────────────────────────────────────────────────────
LLM_PID=""
LLM_WAS_RUNNING=false

cleanup() {
    if [ -n "$LLM_PID" ] && [ "$LLM_WAS_RUNNING" = false ]; then
        printf "\n-- Killing %s we started (PID %s) --\n" "$LLM_PROCESS" "$LLM_PID"
        kill "$LLM_PID" 2>/dev/null && wait "$LLM_PID" 2>/dev/null || true
        printf "Stopped.\n"
    fi
}
trap cleanup EXIT

is_llm_down() {
    printf "%s" "$1" | grep -qiE 'connection refused|econnrefused|ECONNREFUSED|LLM server not running'
}

# Single command attempt. Prints output, returns exit code.
run() {
    $PIPELINE "$PIPELINE_CMD" 2>&1
}

ensure_llm() {
    if pgrep -x "$LLM_PROCESS" >/dev/null 2>&1; then
        LLM_WAS_RUNNING=true
        printf "%s already running (will not kill on exit)\n" "$LLM_PROCESS"
        return 0
    fi

    printf "Starting %s ...\n" "$LLM_START_CMD"
    $LLM_START_CMD &
    LLM_PID=$!
    printf "Started PID %s -- waiting for readiness on port %s ...\n" "$LLM_PID" "$LLM_PORT"

    local attempts=$((LLM_TIMEOUT / 2))
    for i in $(seq 1 "$attempts"); do
        if curl -s "http://localhost:$LLM_PORT/v1/models" >/dev/null 2>&1; then
            printf "%s ready\n" "$LLM_PROCESS"
            return 0
        fi
        sleep 2
    done

    printf "FAILED: %s did not become ready within %ss\n" "$LLM_PROCESS" "$LLM_TIMEOUT"
    return 1
}

main() {
    # First attempt
    local output exit_code=0
    output=$(run) || exit_code=$?
    printf "%s\n" "$output"

    # Many CLIs swallow classify/LLM errors and exit 0, so check output directly
    if [ "$exit_code" -eq 0 ] && ! is_llm_down "$output"; then
        printf "\nSUCCESS\n"
        exit 0
    fi

    if ! is_llm_down "$output"; then
        printf "\nFAILED (exit %d) -- not LLM related\n" "$exit_code"
        exit "$exit_code"
    fi

    printf "\nLLM failure detected -- checking server status...\n"
    ensure_llm || exit 1

    # Retry
    printf "\n=== Retry: %s ===\n\n" "$(date)"
    exit_code=0
    output=$(run) || exit_code=$?
    printf "%s\n" "$output"

    if [ "$exit_code" -eq 0 ] && ! is_llm_down "$output"; then
        printf "\nSUCCESS on retry\n"
        exit 0
    fi

    if is_llm_down "$output"; then
        printf "\nFAILED on retry -- LLM still unreachable (exit %d)\n" "$exit_code"
    else
        printf "\nFAILED on retry (exit %d)\n" "$exit_code"
    fi
    exit "$exit_code"
}

main
