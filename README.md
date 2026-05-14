# Supply Chain MCP — NitroStack, AWS & Terraform

A standalone [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) reference for **supply chain and order fulfilment** on AWS: product catalog, stock reservation, and order orchestration behind a single **HTTP API** with **Cognito** authentication. It demonstrates an **end-to-end** path: **[NitroStack Studio](https://nitrostack.ai/)** (tools + widgets) → **API Gateway (HTTP API)** → **Lambda** (bounded contexts) → **DynamoDB**, with **Terraform** as the source of truth for infrastructure and **Secrets Manager** for runtime credentials—**no mock APIs** in the happy path.

---

## Table of contents

- [Significance](#significance)
- [Business benefits & pain points](#business-benefits--pain-points)
- [Target audience](#target-audience)
- [Solution architecture](#solution-architecture)
- [Tool stack](#tool-stack)
- [AWS deployment, security & operations](#aws-deployment-security--operations)
- [Prerequisites](#prerequisites)
- [Configuration & environment](#configuration--environment)
- [Setup & run](#setup--run)
- [Deployment](#deployment)
- [Observability (CloudWatch & correlation IDs)](#observability-cloudwatch--correlation-ids)
- [Tools reference](#tools-reference)
- [Layout](#layout)
- [References](#references)
- [License](#license)
- [Contributing](#contributing)
- [Conclusion](#conclusion)

---

## Significance

**Executive summary.** Organizations modernizing B2B or internal supply workflows often struggle to connect **AI assistants and operations tools** to the same APIs and policies their web and mobile apps use. This module shows how **NitroStack** can front a real AWS stack so that **Studio**, agents, and humans share one contract: **JWT-authorized HTTP APIs**, **machine-to-machine** access for automation, and **DynamoDB-backed** inventory rules—without duplicating business logic in ad hoc scripts. Terraform provisions the full footprint (API, Lambdas, tables, Cognito, Secrets Manager), while a thin **Vite web portal** proves the **human (PKCE)** path and the **MCP (client credentials)** path against the **same** API surface.

---

## Business benefits & pain points

**Pain points addressed**

- **Disjoint channels** — Catalog, inventory, and orders often live in separate consoles, spreadsheets, or legacy UIs; teams lack one composable surface for assistants and operators. This module consolidates access behind **one HTTP API** and an **MCP tool** surface with widgets.
- **Credential sprawl** — API URLs, OAuth endpoints, and machine secrets copied into many `.env` files drift and leak. Here, **Terraform** writes a **unified app secret** in **Secrets Manager** (encrypted at rest by AWS); local tooling reads it via **IAM**, and only **AWS keys** plus generated **public** Vite vars live on disk in a controlled split (`.env` + `.generated/.env`).
- **Fragile demos** — Reference apps that rely on mocks hide real failure modes. This stack is **explicitly non-mocking** for the AWS path: failures surface as structured JSON and logs so teams can rehearse production-like debugging.

**Benefits**

- **Clear ownership** — **Bounded contexts** (`catalog`, `inventory`, `orders`) map to Lambdas and tables; orders orchestrates peers via **invoke**, inventory stays **off the public HTTP surface** for reserve/release.
- **Predictable security model** — **Cognito JWT authorizer** on API routes; **resource-server scopes** for fine-grained access; **Secrets Manager** for MCP client credentials and table metadata.
- **Repeatable environments** — `npm run provision:aws` (or `bash scripts/provision-terraform-stack.sh`) builds Lambdas, applies Terraform, and regenerates `.generated/.env` from outputs.

---

## Target audience

- Teams evaluating **NitroStack** for **industry MCP servers** with **Studio widgets** and real backend integration.
- **Platform and cloud engineers** who want a **Terraform-first** AWS pattern (HTTP API + Lambda + DynamoDB + Cognito) they can fork for other domains.
- **Solution architects** comparing **human (browser PKCE)** vs **machine (client credentials)** flows against a **single** API.

---

## Solution architecture

```
┌──────────────────────────┐     MCP / Studio      ┌──────────────────────────┐
│  NitroStack Studio / AI  │ ◄──────────────────► │  Supply Chain MCP (Node)  │
│  (widgets, @Tool, …)      │                       │  @Tool · @Widget · …        │
└──────────────────────────┘                       └─────────────┬────────────┘
                                                                  │ HTTPS + Bearer
                                                                  ▼
┌──────────────────────────┐   PKCE + Bearer    ┌──────────────────────────────┐
│  Web portal (Vite/React) │ ◄────────────────►│  Amazon API Gateway (HTTP) │
│  Cognito hosted UI       │                    │  JWT authorizer (Cognito)     │
└──────────────────────────┘                    └──────────────┬───────────────┘
                                                               │
                    ┌────────────────────────────────────────┼────────────────────────┐
                    │                                        ▼                        │
                    │              ┌─────────────────────────────────────┐             │
                    │              │  Lambda: catalog  │  Lambda: orders │             │
                    │              │  (DynamoDB read)  │  (orchestration)│             │
                    │              └─────────┬─────────────────┬───────┘             │
                    │                        │                 │ invoke                │
                    │                        ▼                 ▼                       │
                    │              ┌──────────────┐   ┌─────────────────────┐             │
                    │              │  DynamoDB   │   │  Lambda: inventory │             │
                    │              │  Products   │   │  (reserve / release)│             │
                    │              └──────────────┘   └──────────┬────────┘             │
                    │                                            │                       │
                    │              ┌──────────────────────────────────────────┐         │
                    │              │  DynamoDB: Inventory · Orders (+ GSI)    │         │
                    │              └──────────────────────────────────────────┘         │
                    │                                                                     │
                    │   Cognito User Pool + app clients (web + MCP)                       │
                    │   Secrets Manager: unified JSON (API URLs, M2M secret, table names)   │
                    └─────────────────────────────────────────────────────────────────────┘

        Terraform: full stack + secret version · Local MCP/seed: IAM + GetSecretValue
```

**Call flow (operator path):** Studio → **NitroStack MCP** → obtains **access token** (client credentials, scopes from Secrets Manager JSON) → **API Gateway** → **Lambda** → **DynamoDB**.

**Call flow (human path):** Browser → **OIDC auth code + PKCE** (web app client) → calls the **same** API with the **user** access token.

---

## Tool stack

| Layer | Technology |
|--------|------------|
| MCP / DI / decorators | [NitroStack](https://nitrostack.ai/) (`@nitrostack/core`, CLI) |
| Studio UI | Next.js widgets, `@nitrostack/widgets` |
| HTTP API | **Amazon API Gateway HTTP API** + **JWT authorizer** (Cognito) |
| Auth | **Amazon Cognito** — web (public, PKCE), MCP (confidential, client credentials), **resource server** scopes |
| Compute | **AWS Lambda** (Node.js 20), **X-Ray** tracing enabled in template |
| Data | **Amazon DynamoDB** (products, inventory, orders + GSI for listing) |
| Secrets / config | **AWS Secrets Manager** (JSON written by **Terraform**); local **`.generated/.env`** for public `VITE_*` / secret **name** only |
| IaC | **Terraform** ≥ 1.5 (production path). Optional SAM reference archived under `backup/sam-stack-archived/` (not used for documented deploy). |
| Browser app | **Vite** + React, **oidc-client-ts** |
| Validation | **Zod** (shared contracts package + MCP tool schemas) |

---

## AWS deployment, security & operations

| Topic | How this repo handles it |
|--------|---------------------------|
| **Least privilege (runtime)** | Per-Lambda IAM: catalog reads **products**; inventory mutates **inventory** only; orders reads/writes **orders** + GSI and **invokes** catalog/inventory. |
| **Secrets** | MCP client secret and URLs live in **Secrets Manager**, not in Git. `.env` holds **only AWS credentials** for local tooling; regenerate `.generated/.env` after apply. |
| **State** | Local `terraform.tfstate` is **gitignored**; use a **remote, encrypted backend** for teams (see [infrastructure/terraform/README.md](./infrastructure/terraform/README.md)). |
| **Operator IAM** | Terraform needs broad IAM in the deploy account; post-deploy developers can use output **`nitrostack_mcp_operator_policy_json`** for **GetSecretValue** on the app secret. |
| **Region defaults** | **`us-east-2`** in examples; override with `AWS_REGION` / `-var=aws_region=...`. |

**Security:** Never commit real credentials or Terraform state. Rotate keys if a `.env` was shared. See [SECURITY.md](./SECURITY.md).

---

## Prerequisites

- **Node.js** 20+
- **Terraform** ≥ 1.5 and **AWS CLI**
- **AWS account** and an IAM principal able to deploy the stack (see [SECURITY.md](./SECURITY.md) and org policies)
- **Optional:** [NitroStack Studio](https://nitrostack.ai/studio) for interactive MCP and widget testing

---

## Configuration & environment

| File / variable | Purpose |
|------------------|---------|
| **`supply-chain/.env`** | **Only** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN`, `AWS_REGION` (or use SSO/profile via AWS SDK default chain). |
| **`supply-chain/.generated/.env`** | Created by **`npm run provision:aws`** or **`npm run tf:write-generated-env`**: `VITE_*`, `NEXT_PUBLIC_*`, `SUPPLY_CHAIN_APP_SECRET_NAME`. **Gitignored.** |
| **Secrets Manager JSON** | Written by Terraform: HTTP API base URL, Cognito token URL, MCP client id/secret, OAuth scope, DynamoDB table names. |

Copy [`.env.example`](./.env.example) to **`.env`** and fill AWS fields. Run provision after Terraform apply so **`.generated/.env`** exists before **web-portal** or **MCP** dev.

---

## Setup & run

```bash
cd module-repos/aws/supply-chain

cp .env.example .env
# Edit .env — AWS credentials only

npm install
```

**One-shot infrastructure + generated env (recommended)**

```bash
export AWS_REGION=us-east-2
export TF_AUTO_APPROVE=1    # omit for interactive terraform apply
export RUN_SEED=1           # optional: seed DynamoDB after apply
npm run provision:aws
```

Equivalent:

```bash
bash scripts/provision-terraform-stack.sh
# Optional: bash scripts/provision-terraform-stack.sh -- -var="project_name=my-proj"
```

**MCP only (Docker not required)**

```bash
cd mcp-server
npm run dev
```

Attach [NitroStack Studio](https://nitrostack.ai/studio) to the **`mcp-server`** directory. Sidebar label follows the **folder name** you register (same behavior as the [Automotive](../../automotive/) module).

**Production build (Lambdas + MCP)**

```bash
npm run build
```

**Web portal**

```bash
cd web-portal
npm install && npm run dev
```

**Seed catalog + inventory (after deploy)**

```bash
cd module-repos/aws/supply-chain
npm run seed
```

Full operational checklist: [docs/DEPLOY_AND_DEVELOP.md](./docs/DEPLOY_AND_DEVELOP.md).

---

## Deployment

1. **Install** dependencies: `npm install` from `supply-chain/`.
2. **Build** Lambda bundles and MCP: `npm run build`.
3. **Apply** Terraform with credentials in your shell: `npm run provision:aws` (or `terraform apply` under `infrastructure/terraform/` then `npm run tf:write-generated-env`).
4. **Attach** IAM policy for local MCP/seed if needed: `terraform output -raw nitrostack_mcp_operator_policy_json`.
5. **Seed** DynamoDB: `npm run seed` (unless `RUN_SEED=1` was used during provision).
6. **Connect** Studio to `mcp-server/` and open the **Supply chain** widget; use **web-portal** for browser OIDC testing.

**Optional SAM reference:** an archived SAM copy lives under **`backup/sam-stack-archived/`** (gitignored except `backup/README.md`). The documented production path is **Terraform** only. See [backup/README.md](./backup/README.md).

---

## Observability (CloudWatch & correlation IDs)

| Mechanism | Role |
|-----------|------|
| **Amazon CloudWatch Logs** | Lambda **`console.error` / `console.log`** JSON lines; standard for AWS—no separate Prometheus stack in this reference. |
| **`x-correlation-id`** | Propagated on API responses and MCP HTTP calls; use the same id in **CloudWatch**, MCP **stderr**, and **`.supply-chain-runtime.log`**. |
| **AWS X-Ray** | Enabled on Lambdas in Terraform for distributed trace segments (where account policy allows). |
| **MCP health checks** | `@HealthCheck` for process and **STS** connectivity; details avoid leaking full IAM ARNs (masked account suffix). |

---

## Tools reference

| Surface | Description |
|---------|-------------|
| **`supply_chain` MCP tool** | Single tool with `action`: `catalog_list`, `catalog_get`, `order_create`, `order_list`, `order_get`, `order_cancel` — calls the real HTTP API with Cognito **client credentials** from Secrets Manager. **`@RateLimit`** (120/min) on the tool. |
| **Widgets** | e.g. **Supply chain studio** — `@Widget` + Next export; optional direct API path via `NEXT_PUBLIC_AWS_HTTP_API_BASE_URL`. |

---

## Layout

```text
supply-chain/
  packages/contracts/       # Zod contracts + Lambda observability helpers
  services/catalog|inventory|orders/
  mcp-server/               # NitroStack MCP + widgets
  web-portal/               # Vite + React OIDC client
  infrastructure/terraform/ # Production IaC (Terraform)
  scripts/                  # provision, seed, write-generated-env
  backup/                   # Local archive (gitignored); see backup/README.md
  docs/
```

---

## References

- NitroStack: [nitrostack.ai](https://nitrostack.ai/) · [docs.nitrostack.ai](https://docs.nitrostack.ai/)
- NitroStack Studio: [nitrostack.ai/studio](https://nitrostack.ai/studio)
- Architecture notes: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- Planned NitroChat follow-up: [docs/NITROCHAT.md](./docs/NITROCHAT.md)

---

## License

This module follows the **license policy of the parent NitroStack / monorepo** it lives in. If this folder is extracted to a standalone repository, add a root **LICENSE** file (e.g. MIT) to match your organization’s open-source policy.

---

## Contributing

Contributions are welcome. Please open an issue for larger changes. Preserve architecture boundaries: **Terraform** for AWS resources and secret lifecycle, **Lambdas** for domain logic, **NitroStack** for MCP and widgets, **Cognito + API Gateway** for auth and ingress. Follow **Conventional Commits** (`feat:`, `fix:`, `docs:`, …). Do not commit `.env`, `.generated/`, or Terraform state.

---

## Conclusion

This repository is a **credible AWS reference** for **NitroStack-backed supply chain and order workflows**: one **HTTP API** fronting **Lambda** and **DynamoDB**, **Cognito** for both people and machines, **Secrets Manager** for credentials and config, and **Terraform** so environments stay **reproducible**. It directly answers the **business pain** of fragmented tools and scattered secrets by giving teams a **single contract**—the same API for the **browser**, the **MCP**, and future agents—while keeping production hygiene (IAM, encryption at rest, correlation IDs, CloudWatch) in view.

**Further reading**

- NitroStack: [nitrostack.ai](https://nitrostack.ai/) · [docs.nitrostack.ai](https://docs.nitrostack.ai/)  
- AWS API Gateway HTTP APIs: [docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html)  
- AWS Secrets Manager: [docs.aws.amazon.com/secretsmanager/](https://docs.aws.amazon.com/secretsmanager/)

For a **MongoDB + LangChain** parallel narrative in the same NitroStack family, see the [Automotive](../../automotive/) module README.
