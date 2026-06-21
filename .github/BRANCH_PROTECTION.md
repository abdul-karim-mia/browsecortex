# Branch Protection Setup Guide

## Protect the `main` Branch

This guide helps you set up branch protection rules on GitHub.

### Steps

1. Go to repository **Settings** → **Branches**
2. Click **Add rule** under "Branch protection rules"
3. Enter `main` as the branch name pattern
4. Enable the following:

#### Required Checks
- ✅ **Require a pull request before merging**
  - Require approvals: **1**
  - Dismiss stale pull request approvals when new commits are pushed: **✓**
  - Require review from code owners: **✓** (if CODEOWNERS exists)

- ✅ **Require status checks to pass before merging**
  - Require branches to be up to date before merging: **✓**
  - CI status checks (select all):
    - `quality` (typecheck, lint, test, build)
    - `e2e` (integration tests)

#### Additional Protection
- ✅ **Require a conversation resolution before merging**
- ✅ **Include administrators** (enforce rules on yourself too)
- ✅ **Restrict who can push to matching branches** (optional)

#### Merge Settings
- Allow merge commits: **✓**
- Allow squash merging: **✓**
- Allow rebase merging: **✓**
- Delete head branch on merge: **✓**

5. Click **Create** or **Save changes**

---

## Why These Settings?

| Setting | Why |
|---------|-----|
| Require 1 approval | Catch issues before merge |
| Require status checks | Ensure CI passes (typecheck, tests, build) |
| Dismiss stale approvals | Re-approval required after new commits |
| Code owner reviews | Core changes require maintainer approval |
| Up-to-date branches | Prevent merging with outdated main |
| Delete head branch | Cleanup after merge |

---

## GitHub CLI Setup (Alternative)

```bash
gh repo edit abdul-karim-mia/browsecortex \
  --enable-merge-commit \
  --enable-squash-merge \
  --enable-rebase-merge \
  --delete-branch-on-merge
```

Note: GUI is required for full branch protection rules (GitHub CLI has limited support).

---

## Verify Protection

```bash
gh api repos/abdul-karim-mia/browsecortex/branches/main/protection
```

Should show protection rules in JSON format.
