# Security

## Reporting

Please report suspected vulnerabilities to the repository maintainers privately (do not open a public issue with exploit details until a fix is available).

## Secrets and credentials

- Do **not** commit `supply-chain/.env`, `.generated/.env`, or Terraform `*.tfvars` with real values.
- **Terraform state** can contain sensitive material (for example Cognito client secrets in managed secret versions). Use a **remote, encrypted backend** (S3 + DynamoDB locking per Terraform docs) for team or production workflows; keep local `terraform.tfstate` out of version control (see `.gitignore`).
- Application runtime secrets are stored in **AWS Secrets Manager**; rotate and scope IAM policies to least privilege (`nitrostack_mcp_operator_policy_json` output is a starting point for local tooling).

## Local runtime logs

- **MCP / scripts** append structured JSON to **`supply-chain/.supply-chain-runtime.log`** (gitignored). Tail it alongside stderr when debugging Studio or `npm run seed`.
- Bootstrap failures also write **`supply-chain/.mcp-bootstrap-error.log`**.

## Health checks

The MCP **AWS connectivity** health check returns only a **masked account suffix** and principal type — not full IAM ARNs — to reduce accidental disclosure in clients or logs.
