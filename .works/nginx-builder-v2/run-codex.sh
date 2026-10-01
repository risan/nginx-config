#!/usr/bin/env bash
# Usage: run-codex.sh <prompt-file> <answer-file> <log-file>
set -euo pipefail
cd "$(dirname "$0")/../.."
codex exec -m "$CODEX_SOL" -c model_reasoning_effort=high -s read-only -o "$2" - < "$1" > "$3" 2>&1
