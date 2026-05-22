#!/usr/bin/env bash
# Tear down the Terraform-managed supply-chain stack in AWS (rollback / PoC cleanup).
#
# Prerequisites: Terraform ≥ 1.5, AWS CLI. Same credentials and region used for provision.
#
# Environment:
#   AWS_REGION          default us-east-2
#   TF_AUTO_APPROVE=1   non-interactive terraform destroy (required in CI/automation)
#   CLEAN_LOCAL=1       remove supply-chain/.generated/.env after successful destroy
#
# Usage (from supply-chain/):
#   bash scripts/destroy-terraform-stack.sh
#   TF_AUTO_APPROVE=1 bash scripts/destroy-terraform-stack.sh
#   npm run destroy:aws
#
# Pass extra Terraform args after -- :
#   bash scripts/destroy-terraform-stack.sh -- -var="project_name=my-proj"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AWS_REGION="${AWS_REGION:-us-east-2}"
export AWS_REGION

for cmd in terraform aws; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}"
    exit 1
  fi
done

if ! aws sts get-caller-identity --region "${AWS_REGION}" >/dev/null 2>&1; then
  echo "AWS credentials are not valid for region ${AWS_REGION} (aws sts get-caller-identity failed)."
  exit 1
fi

TF_DIR="${ROOT}/infrastructure/terraform"

if [[ ! -d "${TF_DIR}/.terraform" ]]; then
  echo "==> terraform init (${TF_DIR})"
  (
    cd "${TF_DIR}"
    terraform init -input=false
  )
fi

if [[ "${TF_AUTO_APPROVE:-}" != "1" && "${TF_AUTO_APPROVE:-}" != "true" ]]; then
  echo ""
  echo "WARNING: This will destroy Terraform-managed resources for the supply-chain stack"
  echo "         in region ${AWS_REGION} (Lambda, API Gateway, DynamoDB, Cognito, Secrets Manager, IAM)."
  echo "         Billing for usage already incurred still applies; ongoing charges stop after destroy."
  echo ""
  read -r -p "Type 'destroy' to continue: " confirm
  if [[ "${confirm}" != "destroy" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

DESTROY_ARGS=(-input=false "-var=aws_region=${AWS_REGION}")
if [[ "${TF_AUTO_APPROVE:-}" == "1" || "${TF_AUTO_APPROVE:-}" == "true" ]]; then
  DESTROY_ARGS+=(-auto-approve)
fi

echo "==> terraform destroy"
(
  cd "${TF_DIR}"
  terraform destroy "${DESTROY_ARGS[@]}" "$@"
)

if [[ "${CLEAN_LOCAL:-}" == "1" || "${CLEAN_LOCAL:-}" == "true" ]]; then
  GEN_ENV="${ROOT}/.generated/.env"
  if [[ -f "${GEN_ENV}" || -L "${GEN_ENV}" ]]; then
    rm -f "${GEN_ENV}"
    echo "==> Removed ${GEN_ENV}"
  fi
fi

echo ""
echo "==> Destroy complete."
echo "    Verify in AWS Console (region ${AWS_REGION}) that resources are gone."
echo "    Optional: CLEAN_LOCAL=1 to delete .generated/.env — npm run destroy:aws does this by default."
echo "    Remote Terraform state (if configured) is updated; local terraform.tfstate remains gitignored."
echo ""
