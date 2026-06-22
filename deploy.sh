#!/bin/bash
# ============================================================
# Tools API — Build & Deploy to Synology NAS
#
# Thin wrapper — all logic lives in ../deploy-kit/lib.sh
#
# Usage:
#   npm run deploy              # full deploy
#   npm run deploy -- --dry-run # validate without deploying
#   npm run deploy -- --skip-pull
#   npm run deploy -- --no-cache
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE_NAME="tools-service"
DISPLAY_NAME="🔧 Tools Service"

# Pre-build hook: copy workspace-agent standalone files into the
# Docker build context so the container can seed them to MinIO.
PRE_BUILD() {
  local vendor_dir="${SCRIPT_DIR}/vendor/workspace-agent"
  local standalone_source="${SCRIPT_DIR}/../workspace-service/standalone"

  if [ -d "$standalone_source" ]; then
    mkdir -p "$vendor_dir"
    cp "${standalone_source}/workspace-agent.mjs" "$vendor_dir/"
    cp "${standalone_source}/workspace-agent-core.mjs" "$vendor_dir/"
    info "Copied workspace-agent source files into vendor/"
  else
    warn "workspace-service/standalone/ not found — SEA compilation will rely on existing MinIO files"
  fi
}

source "${SCRIPT_DIR}/../deploy-kit/lib.sh"
