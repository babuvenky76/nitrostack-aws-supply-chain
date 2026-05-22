# Audit remediation — check-in status

**Audit source:** Copilot session `3135d488-513e-4a38-ba89-02bb2c32bc53` (`AWS_SUPPLY_CHAIN_AUDIT_REPORT.md`, `INDEX.md`)  
**Module:** `module-repos/aws/supply-chain`  
**Last reviewed:** 2026-05-22

## Safe to commit (code & config)

| Audit item | Status |
|------------|--------|
| `.gitignore` — `.env`, `.generated/`, tfstate, logs, scratch, local IAM docs | Done |
| `releaseAll` partial-failure logging | Done (`orchestration.ts`) |
| Lambda payload / line limits | Done (`services/common/request-limits.ts`, orders handler) |
| Path / ID validation | Done (`services/common/path-validation.ts`); catalog uses **SKU** ids (matches seed data) |
| MCP env debug logging (keys only, masked) | Done (`supply-chain.tools.ts`) |
| `LOG_LEVEL` in `env_example.txt` + `app.module.ts` | Done |
| `cognito-m2m-token.service.ts` file header | Done |
| Orders modularization | Done (`handler.ts` + `orchestration.ts` + `persistence.ts` + `types.ts`) |
| Shared HTTP utilities | Done (`services/common/*`) |
| Seed script recovery context | Done (`scripts/seed-dynamodb.ts`) |
| Scratch test scripts | Removed / never committed |
| Dev diagnostic `test-backend-query.ts` | Removed |
| `scratch/` folder | Absent |
| `backup/` | Gitignored (local SAM archive only) |

## Operator actions (not in git)

These require **you** or your org admin — the repo cannot fix them:

1. **Rotate AWS credentials** if a local `.env` was ever shared or committed elsewhere. `.env` is gitignored here; confirm with `git log --all -- .env` (should be empty).
2. **Regenerate** `.generated/.env` after clone: `npm run provision:aws` or `npm run tf:write-generated-env`.
3. **Remote Terraform state** for team deploys (see `infrastructure/terraform/README.md`).
4. **Production** items from the audit (WAF, VPC endpoints, penetration test, unit tests) — deferred by design for this reference module.

## Pre-commit checklist

```bash
cd module-repos/aws/supply-chain
npm install
npm run build
git status   # must not list .env, .generated/, node_modules/, docs/aws-admin-*
```

## Files intended for this check-in

- `services/common/` (new)
- `services/orders/src/orchestration.ts`, `persistence.ts`, `types.ts`
- Updated handlers, MCP, Terraform, README, `docs/architecture.svg`, `docs/DEPLOYMENT_RUNBOOK.md`, `docs/AUDIT_CHECKIN_STATUS.md`
