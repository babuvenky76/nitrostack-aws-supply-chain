# Backup folder (local / optional artifacts)

This directory is **mostly gitignored** (`backup/**`) so machine-specific or archived material does not enter version control.

## Contents

- **`sam-stack-archived/`** — Optional **AWS SAM** copy of the HTTP API + Lambdas + Cognito stack (superseded for this repo by **Terraform** in `infrastructure/terraform/`). Restored only if your team still needs SAM parity; production documentation targets Terraform only.

If you clone fresh and need SAM, copy a SAM template from your team artifact store or restore from internal documentation.
