# Security Policy

## Reporting a vulnerability

**Do not report security vulnerabilities through public GitHub issues.**

Instead, email the maintainers privately with:

- A description of the vulnerability and its impact
- Steps to reproduce
- Any suggested mitigation

You'll receive an acknowledgment within a few days, and we'll keep you informed
as we work on a fix. We ask that you give us a reasonable window to address the
issue before any public disclosure.

## Security model

- **API keys** are stored only in `chrome.storage.local` and never leave the
  device except to the provider endpoint the user configures. They are never
  synced, logged, or included in backups without encryption.
- **Backups** are encrypted with AES-256-GCM (Web Crypto) using a user-set
  password; a lost password means an unrecoverable backup.
- **External content** (page text, clipboard) is treated as untrusted. After it
  is read, destructive tools require explicit user confirmation regardless of
  the agent mode.
- **run_javascript** is opt-in and off by default; errors are sanitized before
  being returned to the model.
- **MCP server connections** require an auth token and default to localhost.
