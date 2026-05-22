# Deploy, seed, and run for NitroStudio + web portal

Infrastructure is created with **Terraform**. Sensitive application credentials are stored only in **AWS Secrets Manager** (encrypted at rest by AWS). Your checked-in **`supply-chain/.env`** should contain **only AWS credentials**; **`supply-chain/.generated/.env`** is produced from Terraform outputs (gitignored) and holds public `VITE_*` / `NEXT_PUBLIC_*` values plus the Secrets Manager **secret name** (not the secret payload).

## 1. One-shot provision (recommended)

From `module-repos/aws/supply-chain/`:

```bash
export AWS_REGION=us-east-2
cp env_example.txt .env
# Edit .env: set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN (if any), AWS_REGION

# Non-interactive apply + write .generated/.env + optional seed:
export TF_AUTO_APPROVE=1
export RUN_SEED=1
npm install
npm run provision:aws
```

Or interactive apply (omit `TF_AUTO_APPROVE`):

```bash
npm install
npm run provision:aws
```

This runs `npm run build`, `terraform init` / `terraform apply`, then `scripts/write-terraform-generated-env.mjs` to create **`supply-chain/.generated/.env`**.

Attach **`nitrostack_mcp_operator_policy_json`** to your IAM principal if `GetSecretValue` is denied:

```bash
terraform -chdir=infrastructure/terraform output -raw nitrostack_mcp_operator_policy_json
```

## 2. Seed DynamoDB

If you did not set `RUN_SEED=1` during provision:

```bash
npm run seed
```

Requires `dynamodb:PutItem` on the products and inventory tables (same credentials as deploy). Table names are read from the Terraform JSON secret in Secrets Manager.

## 3. NitroStack MCP (NitroStudio)

```bash
cd mcp-server
npm run dev
```

Open **NitroStudio**, register the `mcp-server` folder, open the **Supply chain studio** widget.

## 4. Web portal (browser)

```bash
cd web-portal
npm install && npm run dev
```

`VITE_*` values are merged from **`supply-chain/.generated/.env`** (after provision) and **`supply-chain/.env`**.

## SAM path (archived)

An optional **SAM** stack may exist locally under **`backup/sam-stack-archived/`** (the **`backup/`** directory is gitignored). It does not mirror the Terraform unified secret and `.generated/.env` flow. **Use Terraform** for the documented end-to-end path.
