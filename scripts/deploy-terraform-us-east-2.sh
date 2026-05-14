#!/usr/bin/env bash
# Thin wrapper: us-east-2 + auto-approve. Prefer scripts/provision-terraform-stack.sh for the full flow.
set -euo pipefail
export AWS_REGION="${AWS_REGION:-us-east-2}"
export TF_AUTO_APPROVE="${TF_AUTO_APPROVE:-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "${ROOT}/scripts/provision-terraform-stack.sh" "$@"
