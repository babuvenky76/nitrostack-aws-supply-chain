# Deployment Runbook

**Supply Chain AWS Module — Production Deployment Guide**

---

## Overview

This runbook covers deploying the AWS Supply Chain module to production. It assumes you have:
- AWS account access with appropriate IAM permissions
- Terraform ≥ 1.5 installed
- Node.js 20+ installed
- All security prerequisites completed (see [README Security Section](../README.md#security--credentials-management))

---

## Pre-Deployment Checklist

### Security
- [ ] All AWS credentials rotated (old credentials revoked)
- [ ] `.env` file is in `.gitignore` and not committed
- [ ] `.generated/` folder is in `.gitignore`
- [ ] `terraform.tfstate*` files are gitignored
- [ ] Remote Terraform backend configured (S3 + DynamoDB for teams)
- [ ] Security scanning passed (SAST/DAST)

### Code Quality
- [ ] All tests passing: `npm run test`
- [ ] Build succeeds: `npm run build`
- [ ] No lint errors: `npm run lint` (if configured)
- [ ] Code review approved
- [ ] Security audit completed (see [AWS_SUPPLY_CHAIN_AUDIT_REPORT.md](../docs/AWS_SUPPLY_CHAIN_AUDIT_REPORT.md))

### Infrastructure
- [ ] Terraform configuration reviewed
- [ ] AWS region verified (default: `us-east-2`)
- [ ] DynamoDB capacity reviewed (on-demand vs provisioned)
- [ ] Lambda memory/timeout settings reviewed
- [ ] API Gateway rate limiting configured
- [ ] Cognito user pool and client configured

### Operations
- [ ] CloudWatch dashboard created
- [ ] Alarms configured (latency, errors, throttling)
- [ ] Log retention policies set
- [ ] Incident response plan documented
- [ ] On-call rotation established
- [ ] Rollback procedure tested

---

## Deployment Steps

### Phase 1: Build & Validate

```bash
cd /path/to/module-repos/aws/supply-chain

# Ensure dependencies are installed
npm install

# Build Lambda packages and MCP
npm run build

# Verify build artifacts
ls services/catalog/dist/handler.js
ls services/inventory/dist/handler.js
ls services/orders/dist/handler.js
```

### Phase 2: Deploy to Staging (Recommended First)

```bash
# Set variables
export AWS_REGION=us-east-2
export ENVIRONMENT=staging
export TF_AUTO_APPROVE=0  # Review changes before applying

# Navigate to Terraform
cd infrastructure/terraform

# Initialize Terraform (first time only)
terraform init

# Plan deployment
terraform plan \
  -var="environment=staging" \
  -var="project_name=nsupply-staging" \
  -out=tfplan

# Review the plan output carefully!
# Verify:
# - New resources are expected
# - No destructive changes unless intentional
# - Resource names are correct

# Apply (if plan looks good)
terraform apply tfplan

# Note the outputs
terraform output
```

### Phase 3: Post-Deployment Validation

```bash
# Verify Lambda functions deployed
aws lambda list-functions --region us-east-2 | grep nsupply

# Verify DynamoDB tables created
aws dynamodb list-tables --region us-east-2 | grep nsupply

# Verify Cognito user pool
aws cognito-idp list-user-pools --max-results 10 --region us-east-2

# Verify Secrets Manager secret
aws secretsmanager get-secret-value \
  --secret-id nsupply/nitrostack-app \
  --region us-east-2

# Generate .generated/.env
npm run tf:write-generated-env

# Seed data (staging only)
npm run seed
```

### Phase 4: Smoke Testing

```bash
# Test Lambda invoke (catalog)
aws lambda invoke \
  --function-name nsupply-catalog \
  --region us-east-2 \
  --payload '{"internal":true,"action":"getBySku","sku":"SKU-001","correlationId":"test"}' \
  /tmp/response.json

# Test API Gateway
curl -s https://<api-id>.execute-api.us-east-2.amazonaws.com/v1/catalog/products \
  -H "Authorization: Bearer <token>"

# Check CloudWatch logs
aws logs tail /aws/lambda/nsupply-catalog --follow --region us-east-2
```

### Phase 5: Deploy to Production

Once staging validation passes:

```bash
export ENVIRONMENT=production
export TF_AUTO_APPROVE=0

cd infrastructure/terraform

# Plan production deployment
terraform plan \
  -var="environment=production" \
  -var="project_name=nsupply" \
  -out=tfplan

# CAREFULLY review plan — this affects production!
# Verify no data loss or destructive changes

# Apply
terraform apply tfplan

# Generate production .generated/.env
npm run tf:write-generated-env

# Seed production data
npm run seed
```

---

## Post-Deployment Verification

### API Health Check

```bash
# Get API Gateway URL from Terraform output
API_URL=$(terraform output -raw http_api_invoke_url)
REGION=us-east-2

# Check healthcheck
curl -s "$API_URL/health" | jq

# Expected: 200 OK with health status
```

### Lambda Logs

```bash
# Tail catalog lambda
aws logs tail /aws/lambda/nsupply-catalog --follow --region us-east-2

# Tail orders lambda
aws logs tail /aws/lambda/nsupply-orders --follow --region us-east-2

# Tail inventory lambda
aws logs tail /aws/lambda/nsupply-inventory --follow --region us-east-2
```

### DynamoDB Validation

```bash
# Scan products table
aws dynamodb scan \
  --table-name nsupply-products \
  --max-items 5 \
  --region us-east-2

# Scan inventory table
aws dynamodb scan \
  --table-name nsupply-inventory \
  --region us-east-2

# Check orders table is empty (should be)
aws dynamodb scan \
  --table-name nsupply-orders \
  --region us-east-2
```

### CloudWatch Metrics

```bash
# Get Lambda invocation count (last hour)
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=nsupply-catalog \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region us-east-2
```

---

## Monitoring & Alarms

### Essential CloudWatch Alarms

```bash
# High error rate
aws cloudwatch put-metric-alarm \
  --alarm-name nsupply-catalog-errors-high \
  --alarm-description "Catalog Lambda error rate > 5%" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=FunctionName,Value=nsupply-catalog \
  --evaluation-periods 2

# High latency
aws cloudwatch put-metric-alarm \
  --alarm-name nsupply-catalog-duration-high \
  --alarm-description "Catalog Lambda P99 latency > 5s" \
  --metric-name Duration \
  --namespace AWS/Lambda \
  --statistic Maximum \
  --period 60 \
  --threshold 5000 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=FunctionName,Value=nsupply-catalog \
  --evaluation-periods 3

# DynamoDB throttling
aws cloudwatch put-metric-alarm \
  --alarm-name nsupply-ddb-throttle \
  --alarm-description "DynamoDB write throttling detected" \
  --metric-name ConsumedWriteCapacityUnits \
  --namespace AWS/DynamoDB \
  --statistic Sum \
  --period 60 \
  --threshold 100 \
  --comparison-operator GreaterThanThreshold
```

---

## Rollback Procedure

If critical issues occur after deployment:

### Quick Rollback (Terraform)

```bash
# View deployment history
terraform show

# Rollback to previous state
# Option 1: Revert git commit
git log --oneline infrastructure/terraform/

# Option 2: Manual rollback
cd infrastructure/terraform
terraform destroy -var="environment=production"

# Reapply previous version
git checkout <previous-commit> infrastructure/terraform
terraform apply
```

### Coordinate with Team

1. **Alert:** Notify on-call team and stakeholders
2. **Document:** Log incident with timestamp and error
3. **Isolate:** Route traffic away if possible (DNS/LB)
4. **Root Cause:** Investigate logs before full rollback
5. **Rollback:** Execute rollback procedure above
6. **Verify:** Re-run smoke tests
7. **Post-Mortem:** Document and prevent recurrence

---

## Troubleshooting

### Lambda Timeout

**Symptom:** Lambda execution timeout in CloudWatch logs

**Solution:**
```bash
# Increase timeout
terraform apply -var="lambda_timeout=300"

# Check actual duration
aws logs filter-log-events \
  --log-group-name /aws/lambda/nsupply-catalog \
  --query 'events[0].message' | grep Duration
```

### DynamoDB Throttling

**Symptom:** Throttled request errors, slow queries

**Solution:**
```bash
# Check current capacity
aws dynamodb describe-table --table-name nsupply-products

# Switch to on-demand (if available in your region)
aws dynamodb update-billing-mode \
  --table-name nsupply-products \
  --billing-mode PAY_PER_REQUEST
```

### Cognito Auth Failures

**Symptom:** 401 Unauthorized on API calls

**Solution:**
```bash
# Verify token endpoint
aws cognito-idp get-signing-certificate \
  --user-pool-id us-east-2_xxxxx

# Check Cognito logs (if enabled)
aws logs tail /aws/cognito/ --follow

# Rotate Secrets Manager secret
aws secretsmanager rotate-secret \
  --secret-id nsupply/nitrostack-app
```

### High Latency

**Symptom:** P99 latency > 5 seconds

**Solution:**
```bash
# Check Lambda cold starts
aws logs filter-log-events \
  --log-group-name /aws/lambda/nsupply-orders \
  --filter-pattern "REPORT Init Duration" \
  --query 'events[0].message'

# Increase Lambda memory (improves CPU)
terraform apply -var="lambda_memory=512"

# Enable Lambda Reserved Concurrency to reduce cold starts
aws lambda put-provisioned-concurrency-config \
  --function-name nsupply-catalog \
  --provisioned-concurrent-executions 10
```

---

## Operations Checklist (Daily)

- [ ] Check CloudWatch dashboards for anomalies
- [ ] Monitor error rates and latency metrics
- [ ] Review DynamoDB consumed capacity
- [ ] Check Lambda concurrent execution
- [ ] Verify no stuck transactions in DynamoDB
- [ ] Review CloudWatch Logs for errors
- [ ] Monitor Cognito authentication failures

---

## Contacts & Escalation

| Role | Contact | Availability |
|------|---------|--------------|
| On-Call Engineer | [TBD] | 24/7 |
| Platform Lead | [TBD] | Business hours |
| AWS Support | [Support Case] | Depends on plan |

---

## References

- Infrastructure: [infrastructure/terraform/README.md](../../infrastructure/terraform/README.md)
- Security: [SECURITY.md](../SECURITY.md)
- Architecture: [docs/ARCHITECTURE.md](./ARCHITECTURE.md)
- Audit Report: [docs/AWS_SUPPLY_CHAIN_AUDIT_REPORT.md](./AWS_SUPPLY_CHAIN_AUDIT_REPORT.md)

---

**Last Updated:** 2026-05-22  
**Reviewed By:** [TBD]  
**Next Review:** [TBD]
