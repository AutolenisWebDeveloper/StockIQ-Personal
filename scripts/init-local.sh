#!/usr/bin/env sh
# Helper to create a local `.env` from `.env.example` and inject hashes non-interactively.

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env.example ]; then
  echo ".env.example not found in $ROOT" >&2
  exit 1
fi

if [ -f .env ]; then
  echo ".env already exists — leaving it untouched." >&2
else
  cp .env.example .env
  echo "Created .env from .env.example"
fi

sed_i() {
  # cross-platform sed -i wrapper: GNU sed supports -i, BSD/mac needs -i ''
  if sed --version >/dev/null 2>&1; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

set_or_append() {
  KEY="$1"
  VALUE="$2"
  if grep -q "^${KEY}=" .env; then
    # replace whole line
    sed_i "s|^${KEY}=.*|${KEY}=${VALUE}|" .env
  else
    echo "${KEY}=${VALUE}" >> .env
  fi
}

# Accept values from environment for non-interactive use
if [ -n "${AUTH_HASH:-}" ]; then
  set_or_append AUTH_PASSWORD_HASH "$AUTH_HASH"
  echo "Set AUTH_PASSWORD_HASH"
fi

if [ -n "${SEED_HASH:-}" ]; then
  set_or_append SEED_USER_PASSWORD_HASH "$SEED_HASH"
  echo "Set SEED_USER_PASSWORD_HASH"
fi

if [ -n "${SEC_USER_AGENT:-}" ]; then
  # wrap value in quotes if it contains spaces
  UA="$SEC_USER_AGENT"
  case "$UA" in
    *\ *) UA="\"$UA\"" ;;
  esac
  set_or_append SEC_USER_AGENT "$UA"
  echo "Set SEC_USER_AGENT"
fi

echo "Done. Edit .env to finalize any remaining values."
