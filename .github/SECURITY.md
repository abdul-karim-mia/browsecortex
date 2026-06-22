# Security Policy

## Reporting Security Vulnerabilities

🔒 **Please do not open public GitHub issues for security vulnerabilities.**

Instead, please report security issues by emailing:

- **akmia51@gmail.com**

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Your contact information (if you'd like acknowledgment)

We will acknowledge receipt within 48 hours and aim to provide an update within 7 days.

## Security Principles

BrowseCortex follows these security principles:

1. **Zero Vendor Lock-in** — Users own their API keys and provider choice
2. **Private Data** — User data never leaves their browser except to their chosen provider
3. **Open Source** — Security through transparency; anyone can audit the code
4. **No Telemetry** — No tracking or analytics; no data collection
5. **Encrypted Backups** — Backups use AES-256-GCM encryption

## Known Security Considerations

- **API Keys**: Store in browser storage (IndexedDB). Use environment-specific keys.
- **Content Scripts**: Injected into every tab; carefully validated DOM operations.
- **External APIs**: Only communicate with user-selected AI providers over HTTPS.
- **MCP Servers**: Validate and sandbox external server connections.

## Browser Permissions

The extension requests specific Chrome permissions:

- `scripting` — Execute scripts in web pages
- `tabs` — Read tab information
- `webNavigation` — Monitor navigation events
- `storage` — Store conversations and settings
- `alarms` — Schedule keepalive pings

All permissions are essential for functionality and are minimized to reduce attack surface.

## Testing & Fuzzing

- Unit tests in `packages/extension/tests/unit`
- Integration tests in `packages/extension/tests/integration`
- E2E tests with Playwright
- Property-based testing encouraged for tool implementations

## Dependency Security

- Dependencies pinned to specific versions
- Regular `npm audit` checks in CI/CD
- Automated dependency updates via GitHub

## Responsible Disclosure Timeline

- **Day 0**: Report received
- **Day 1**: Acknowledgment sent
- **Day 7**: Target fix or status update
- **Day 30**: Public disclosure (if patch available) or advisory

Thank you for helping keep BrowseCortex secure! 🙏
