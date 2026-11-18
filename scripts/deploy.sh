#!/usr/bin/env bash
# Bundle, package and deploy the backend, then upload the private question bank.
# Credentials are read from ~/.config/neuromial/*.env (never from git). All optional:
#   google.env     GOOGLE_CLIENT_ID=...     GOOGLE_CLIENT_SECRET=...
#   microsoft.env  MICROSOFT_CLIENT_ID=...  MICROSOFT_CLIENT_SECRET=...  [MICROSOFT_TENANT_ID=...]
#   amazon.env     AMAZON_CLIENT_ID=...     AMAZON_CLIENT_SECRET=...
#   email.env      SENDER_EMAIL=...         EMAIL_SECRET=<random, e.g. openssl rand -hex 32>
# A missing file disables that feature, so always deploy through this script.
set -euo pipefail
cd "$(dirname "$0")/.."
PROFILE=claude
BUCKET=neuromial-artifacts-464948468425
CONF="${NEUROMIAL_CONF:-$HOME/.config/neuromial}"
for f in google microsoft amazon email; do
  if [ -f "$CONF/$f.env" ]; then set -a; . "$CONF/$f.env"; set +a; else echo "note: $CONF/$f.env not found, $f disabled"; fi
done

rm -rf backend/dist
(cd backend && npx esbuild src/handler.ts src/presignup.ts src/mail.ts --bundle --platform=node --target=node24\
  --format=esm --out-extension:.js=.mjs --outdir=dist --external:'@aws-sdk/*')
node scripts/build-questions.mjs   # also writes backend/dist/data.json, bundled into the Lambda zip
aws cloudformation package --template-file template.yaml --s3-bucket "$BUCKET" \
  --output-template-file build/packaged.yaml --profile $PROFILE >/dev/null
aws cloudformation deploy --template-file build/packaged.yaml --stack-name neuromial \
  --capabilities CAPABILITY_IAM --profile $PROFILE --no-fail-on-empty-changeset \
  --parameter-overrides "SiteUrl=https://neuromial.com" "GoogleClientId=${GOOGLE_CLIENT_ID:-}" "GoogleClientSecret=${GOOGLE_CLIENT_SECRET:-}" \
    "MicrosoftClientId=${MICROSOFT_CLIENT_ID:-}" "MicrosoftClientSecret=${MICROSOFT_CLIENT_SECRET:-}" \
    ${MICROSOFT_TENANT_ID:+"MicrosoftTenantId=$MICROSOFT_TENANT_ID"} \
    "AmazonClientId=${AMAZON_CLIENT_ID:-}" "AmazonClientSecret=${AMAZON_CLIENT_SECRET:-}" \
    "SenderEmail=${SENDER_EMAIL:-}" "EmailSecret=${EMAIL_SECRET:-}"
DATA=$(aws cloudformation describe-stacks --stack-name neuromial --profile $PROFILE \
  --query "Stacks[0].Outputs[?OutputKey=='DataBucketName'].OutputValue" --output text)
aws s3 cp build/data.json "s3://$DATA/data.json" --profile $PROFILE   # private backup copy of the bank
echo "deployed"
