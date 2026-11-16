#!/usr/bin/env bash
# Bundle, package and deploy the backend, then upload the private question bank.
# Google credentials are read from ~/.config/neuromial/google.env (never from git):
#   GOOGLE_CLIENT_ID=...   GOOGLE_CLIENT_SECRET=...
set -euo pipefail
cd "$(dirname "$0")/.."
PROFILE=claude
BUCKET=neuromial-artifacts-464948468425
ENV_FILE="${NEUROMIAL_ENV:-$HOME/.config/neuromial/google.env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; else echo "note: $ENV_FILE not found, deploying without Google sign-in"; fi

(cd backend && npx esbuild src/handler.ts --bundle --platform=node --target=node20 --format=esm \
  --outfile=dist/handler.mjs --external:'@aws-sdk/*')
node scripts/build-questions.mjs
aws cloudformation package --template-file template.yaml --s3-bucket "$BUCKET" \
  --output-template-file build/packaged.yaml --profile $PROFILE >/dev/null
aws cloudformation deploy --template-file build/packaged.yaml --stack-name neuromial \
  --capabilities CAPABILITY_IAM --profile $PROFILE --no-fail-on-empty-changeset \
  --parameter-overrides "GoogleClientId=${GOOGLE_CLIENT_ID:-}" "GoogleClientSecret=${GOOGLE_CLIENT_SECRET:-}"
DATA=$(aws cloudformation describe-stacks --stack-name neuromial --profile $PROFILE \
  --query "Stacks[0].Outputs[?OutputKey=='DataBucketName'].OutputValue" --output text)
aws s3 cp build/data.json "s3://$DATA/data.json" --profile $PROFILE
echo "deployed"
