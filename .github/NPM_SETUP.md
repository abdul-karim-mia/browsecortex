# NPM Token Setup for Automated Releases

## Step 1: Create NPM Automation Token

1. Go to https://www.npmjs.com/settings/~/tokens
2. Click **Create new token** → **Automation**
3. Copy the token (you won't see it again!)
4. Save it securely

## Step 2: Add to GitHub Secrets

1. Go to GitHub repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Fill in:
   - **Name:** `NPM_TOKEN`
   - **Value:** Paste your npm automation token
4. Click **Add secret**

## Step 3: Verify Setup

Test the release workflow:

```bash
# Local test (won't publish yet)
./scripts/release.sh patch

# Review the changes
git status
git log -1
git tag -l

# If looks good, push and let GitHub Actions publish
git push origin main
git push origin v1.0.1
```

Or use GitHub Actions workflow:

1. Go to **Actions** → **Release**
2. Click **Run workflow**
3. Select bump type and run
4. Monitor the workflow for npm publishing

## Step 4: Verify Publication

After successful workflow run:

```bash
npm view browsecortex-relay versions
npm info browsecortex-relay@latest
```

Or install and test:

```bash
npm install -g browsecortex-relay
browsecortex-relay --version
```

## Troubleshooting

| Issue             | Solution                        |
| ----------------- | ------------------------------- |
| 403 Forbidden     | NPM_TOKEN is invalid or expired |
| 404 Not Found     | Package name is wrong           |
| Already published | Can't republish same version    |
| Token too old     | Regenerate new automation token |

## Scope & Permissions

The automation token should have:

- ✅ **Publish** permission
- ✅ **Automation** scope
- ✅ Access to `browsecortex-relay` package

## Security Notes

- 🔒 Never share NPM_TOKEN publicly
- 🔒 Rotate tokens periodically
- 🔒 Use automation tokens, not personal access tokens
- 🔒 GitHub keeps the token encrypted in Secrets

## Rollback (if needed)

```bash
npm unpublish browsecortex-relay@VERSION --force
```

⚠️ Can only unpublish versions < 24 hours old

---

Once complete, releases will auto-publish to npm! 🚀
