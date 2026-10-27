# TreatTracker

Lightweight mobile-friendly React app for logging Halloween trick-or-treaters.

- **Auth:** Amazon Cognito email one-time password (no passwords)
- **Frontend:** Vite + React SPA on CloudFront + S3
- **API:** API Gateway HTTP API + Lambda (TypeScript)
- **Data:** Aurora PostgreSQL Serverless v2 via RDS Data API

## Layout

```text
frontend/           Vite React SPA
backend/            Lambda handlers
infra/              Terraform (dev)
.github/workflows/  OIDC deploy to AWS
```

## Prerequisites

1. aws-backbone trusts `SethDKelly/TreatTracker` on `dev-github-deploy` and allows `treattracker-dev-*` IAM roles ([PR #32](https://github.com/SethDKelly/aws-backbone/pull/32); MFA-backed apply under S-40).
2. Terraform >= 1.5, Node 20+, AWS credentials that can assume `dev-developer` (local) or GitHub OIDC (CI).

## Local frontend

```powershell
cd frontend
npm install
copy .env.example .env   # fill Cognito + API URL from terraform output
npm run dev
```

## Deploy (dev)

Push to `dev` or run **Deploy to dev** via `workflow_dispatch`. The workflow:

1. Assumes `arn:aws:iam::521018312783:role/dev-github-deploy`
2. Applies Terraform (`treattracker/dev/terraform.tfstate`)
3. Builds and packages the Lambda
4. Builds the SPA and syncs to S3 / invalidates CloudFront

DNS defaults to **`treattracker.skellyhouse.com`** in the `skellyhouse.com` hosted zone (looked up by name). Override with GitHub Variables `DOMAIN_NAME`, `HOSTED_ZONE_NAME`, or `HOSTED_ZONE_ID` if needed.

### First deploy checklist

1. Ensure aws-backbone trusts TreatTracker OIDC (immutable subject) and MFA-apply is live.
2. Run **Deploy to dev** (`workflow_dispatch` or push to `main`/`dev`).
3. Open `https://treattracker.skellyhouse.com` (or the printed `app_url`), request an email OTP, submit entries, confirm total + **Download CSV**.

Schema tables are created automatically on the first authenticated API request.

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/entries` | Cognito JWT | List entries + total for caller |
| `POST` | `/entries` | Cognito JWT | Create quick or range entry |
| `DELETE` | `/entries/{id}` | Cognito JWT | Delete own entry |
| `GET` | `/export.csv` | Cognito JWT | Download anonymized CSV (`id`, `user_id`, counts/timestamps — **no emails**) |
