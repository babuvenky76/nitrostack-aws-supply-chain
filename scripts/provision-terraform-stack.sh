#!/usr/bin/env bash
# End-to-end Terraform apply for the supply-chain stack, then write gitignored
# supply-chain/.generated/.env from outputs (public Vite/OIDC vars + Secrets Manager *name* only).
# Sensitive values stay in AWS Secrets Manager (encrypted at rest by AWS); MCP/seed read them via IAM.
#
# Prerequisites: Terraform ≥ 1.5, AWS CLI, Node 20+, npm. AWS credentials in the environment
# (or default profile) must be able to deploy the stack.
#
# Environment:
#   AWS_REGION          default us-east-2
#   TF_AUTO_APPROVE=1   non-interactive terraform apply
#   RUN_SEED=1          run npm run seed after apply (uses same credentials)
#
# Usage (from supply-chain/):
#   bash scripts/provision-terraform-stack.sh
#   bash scripts/provision-terraform-stack.sh -- -var-file=extra.tfvars
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AWS_REGION="${AWS_REGION:-us-east-2}"
export AWS_REGION

for cmd in terraform aws node npm; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}"
    exit 1
  fi
done

if ! aws sts get-caller-identity --region "${AWS_REGION}" >/dev/null 2>&1; then
  echo "AWS credentials are not valid for region ${AWS_REGION} (aws sts get-caller-identity failed)."
  exit 1
fi

echo "==> npm install"
npm install

echo "==> npm run build (Lambda bundles + MCP)"
npm run build

TF_DIR="${ROOT}/infrastructure/terraform"
echo "==> terraform init (${TF_DIR})"
(
  cd "${TF_DIR}"
  terraform init -input=false
)

APPLY_ARGS=(-input=false "-var=aws_region=${AWS_REGION}")
if [[ "${TF_AUTO_APPROVE:-}" == "1" || "${TF_AUTO_APPROVE:-}" == "true" ]]; then
  APPLY_ARGS+=(-auto-approve)
fi

echo "==> terraform apply"
(
  cd "${TF_DIR}"
  terraform apply "${APPLY_ARGS[@]}" "$@"
)

echo "==> Write .generated/.env from Terraform outputs"
node "${ROOT}/scripts/write-terraform-generated-env.mjs"

echo ""
echo "==> Done."
echo "    Secret name: $(cd "${TF_DIR}" && terraform output -raw supply_chain_app_secret_name)"
echo "    Put only AWS credentials in supply-chain/.env — see env_example.txt"
echo "    Optional IAM for local MCP/seed: terraform -chdir=infrastructure/terraform output -raw nitrostack_mcp_operator_policy_json"
echo ""

if [[ "${RUN_SEED:-}" == "1" || "${RUN_SEED:-}" == "true" ]]; then
  echo "==> RUN_SEED=1 → npm run seed"
  npm run seed
fi
