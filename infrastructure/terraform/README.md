# Terraform — supply-chain AWS stack (us-east-2 default)

This stack mirrors the original SAM-shaped API: **DynamoDB** (products, inventory, orders), **Cognito** (web + MCP clients, resource server, domain), **Lambda** (catalog, inventory, orders), **API Gateway HTTP API** (JWT authorizer, `/v1/...` routes), and a **Secrets Manager** secret whose JSON is the single runtime config for MCP-style tooling (API URLs, Cognito M2M credentials, table names). Secret values are **encrypted at rest by AWS**; Terraform manages the secret and version.

## Prerequisites

1. **AWS credentials** in the **same shell** you use for Terraform (exported keys, SSO, or profile). Cursor’s agent sandbox often **does not** see variables from another terminal.
2. **Node build artifacts** — Lambda zips are built from `services/*/dist/index.js`:

```bash
cd module-repos/aws/supply-chain
npm install
npm run build
```

3. **Terraform** ≥ 1.5, **AWS provider** (declared in `versions.tf`).

## End-to-end install (from repo root `supply-chain/`)

```bash
cp env_example.txt .env
# Edit .env — AWS credentials only

export AWS_REGION=us-east-2
export TF_AUTO_APPROVE=1   # optional; omit for interactive apply
export RUN_SEED=1          # optional; runs npm run seed after apply
npm install
npm run provision:aws
```

This is equivalent to `bash scripts/provision-terraform-stack.sh` and writes **`supply-chain/.generated/.env`** from outputs (public browser vars + `SUPPLY_CHAIN_APP_SECRET_NAME`). Do not commit `.generated/`.

## Manual Terraform (without the script)

```bash
cd module-repos/aws/supply-chain/infrastructure/terraform
terraform init
terraform plan -var="aws_region=us-east-2"
terraform apply -var="aws_region=us-east-2"
cd ../..
npm run tf:write-generated-env
```

## After apply

1. **`supply-chain/.env`**: only `AWS_*` credentials (and optional overrides). See [`env_example.txt`](../../env_example.txt).
2. **`supply-chain/.generated/.env`**: created by `npm run tf:write-generated-env` or `npm run provision:aws` — `VITE_*`, `NEXT_PUBLIC_*`, `SUPPLY_CHAIN_APP_SECRET_NAME`.
3. **IAM**: local MCP/seed need **`secretsmanager:GetSecretValue`** on the app secret (output **`nitrostack_mcp_operator_policy_json`**).
4. **Seed**: `npm run seed` from `supply-chain/` (or `RUN_SEED=1` during provision).

## Destroy / rollback

From `supply-chain/`:

```bash
export AWS_REGION=us-east-2
export TF_AUTO_APPROVE=1
npm run destroy:aws
```

Or `bash scripts/destroy-terraform-stack.sh`. Interactive mode prompts you to type `destroy` before proceeding. See [README rollback section](../../README.md#rollback--teardown) for cost and cleanup notes.

## Remote state (recommended for teams)

Configure a **remote Terraform backend** (S3 state bucket + DynamoDB lock table) per [Terraform AWS backend documentation](https://developer.hashicorp.com/terraform/language/settings/backends/s3). Do not commit secrets.
