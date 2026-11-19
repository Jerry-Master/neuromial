# neuromial: remaining tasks

Updated 2026-11-16. The code for every original task is built (commit `adda389`). What is left needs you: accounts, credentials or a human reviewer.

## Current state (for context)
- Frontend: Vite + React + TS on GitHub Pages (`web/`), deployed by `.github/workflows/deploy.yml` on push to `main`.
- Backend: CloudFormation stack `neuromial` in `eu-north-1`. One router Lambda (`ApiFn`, 256 MB) serves every route; a pre-sign-up Lambda links accounts; `DailyMailFn` exists only once email is configured.
- Deploy with `./scripts/deploy.sh`. It reads optional credentials from `~/.config/neuromial/{google,microsoft,amazon,email}.env`. A missing file switches that feature off, so never run a plain `cloudformation deploy`.
- Questions live in `questions/questions.json` (git-ignored). Backup of the pre-audit version: `questions/questions.backup-2026-11-16.json`.

Cognito redirect URI for every provider:
`https://neuromial-464948468425.auth.eu-north-1.amazoncognito.com/oauth2/idpresponse`

---

## 0. Push the frontend
Commit `adda389` (new design, favicon, share, report, weekly tab) is local only.
```bash
git push origin main
```
Then check the site in Chrome, Safari and Firefox, light and dark, and at 360 px width. Look at the favicon in a tab and the icon after "Add to Home Screen".

## 1. Sign in with Microsoft (free)
1. Go to https://entra.microsoft.com, then App registrations > New registration.
2. Supported account types: "Personal Microsoft accounts only". The template defaults to the consumers tenant `9188040d-6c67-4c5b-b112-36a304b66dad`. For work or school accounts as well, choose another type and set `MICROSOFT_TENANT_ID` to your tenant id.
3. Redirect URI: platform "Web", value = the Cognito redirect URI above.
4. Certificates & secrets > New client secret. Copy the **Value**, not the ID.
5. Token configuration > Add optional claim > ID > `email`.
6. Create `~/.config/neuromial/microsoft.env`:
   ```
   MICROSOFT_CLIENT_ID=<Application (client) ID>
   MICROSOFT_CLIENT_SECRET=<secret value>
   # MICROSOFT_TENANT_ID=<only if not personal accounts>
   ```
7. `./scripts/deploy.sh`. "Microsoft" then appears on the hosted sign-in page.

## 2. Login with Amazon (free)
1. Go to https://developer.amazon.com/loginwithamazon/console/site/lwa/overview.html and create a Security Profile (name, description, privacy URL = the site URL).
2. Web Settings > Edit: Allowed Origins = `https://neuromial-464948468425.auth.eu-north-1.amazoncognito.com`, Allowed Return URLs = the Cognito redirect URI above.
3. Create `~/.config/neuromial/amazon.env`:
   ```
   AMAZON_CLIENT_ID=amzn1.application-oa2-client....
   AMAZON_CLIENT_SECRET=...
   ```
4. `./scripts/deploy.sh`.

Skipped on purpose: Apple ($99/year), Facebook (tedious app review), GitHub (needs an OAuth-to-OIDC proxy Lambda).

## 3. Test account linking
1. With a fresh email, sign up with a password and verify it.
2. Sign out, then sign in with Google (or Microsoft) using the same email. The first try may bounce once; the app retries automatically. Points and streak should be the same account.
3. The reverse: sign up with Google first, then try a password sign-up with that email. It should be refused with "Sign in with Google instead".

## 4. Daily email: DONE
Live since 2026-11-16: sender verified, `email.env` created, suppression list on (bounces + complaints), test email and unsubscribe confirmed.
SES production access approved (50,000/day, out of sandbox). Sends daily at 08:00 Europe/Madrid.
The steps below are kept for reference.

Free for 3,000 emails a month during the first 12 months, then about $0.10 per 1,000.
1. Add permissions to IAM user `claude-deployer` (root or admin console):
   - `ses:*` (or at least `ses:GetAccount`, `ses:CreateEmailIdentity`, `ses:GetEmailIdentity`, `ses:PutAccountDetails`, `ses:SendEmail`)
   - `scheduler:*` (the daily schedule uses EventBridge Scheduler)
   - `iam:PassRole` on the scheduler role (already covered if the user has broad IAM rights)
2. Verify the sender:
   ```bash
   aws sesv2 create-email-identity --email-identity you@example.com --profile claude --region eu-north-1
   ```
   Click the link in the email AWS sends.
3. Request production access (otherwise mail only reaches verified addresses). You can do it in the console (SES > Account dashboard > Request production access) or with:
   ```bash
   aws sesv2 put-account-details --profile claude --region eu-north-1 \
     --mail-type TRANSACTIONAL --website-url https://neuromial.com \
     --use-case-description "Opt-in daily reminder with a link to the day's quiz question. One-click unsubscribe in every email." \
     --production-access-enabled
   ```
   Approval takes about a day.
4. Create `~/.config/neuromial/email.env`:
   ```
   SENDER_EMAIL=you@example.com
   EMAIL_SECRET=<output of: openssl rand -hex 32>
   ```
   Never change `EMAIL_SECRET` afterwards: it would break unsubscribe links in emails already sent.
5. `./scripts/deploy.sh`. The "Daily email" switch then appears on the Profile page.
6. Test: opt in, run the function once and check the inbox and the unsubscribe link:
   ```bash
   aws lambda invoke --profile claude --function-name "$(aws cloudformation describe-stack-resource --stack-name neuromial --logical-resource-id DailyMailFn --profile claude --query StackResourceDetail.PhysicalResourceId --output text)" /dev/stdout
   ```

## 5. Human review of the questions
A model has already audited them with the key (fixes applied, all marked `reviewed: "model"`).
1. Give a neurologist or senior student `questions/review.md` (generated by `node scripts/build-questions.mjs`).
2. For each question they approve, set `"reviewed": "human"` and optionally `"source": "<book, chapter>"`. Set `"reviewed": false` to pull a question from the schedule.
3. Check player reports now and then:
   ```bash
   aws dynamodb scan --profile claude --table-name "$(aws cloudformation describe-stack-resource --stack-name neuromial --logical-resource-id ReportsTable --profile claude --query StackResourceDetail.PhysicalResourceId --output text)"
   ```
4. Ship edits with `./scripts/deploy.sh`.

## 6. Optional extras
- Password hardening (free): turn on Cognito's compromised-password check and optional TOTP two-factor.
- Speed: cut the scored answer from two DynamoDB calls (get + transaction) to one.
