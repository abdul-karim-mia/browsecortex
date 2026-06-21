# Privacy Policy

BrowseCortex is a local-first browser extension. Your data stays on your device.

## What we collect

**Nothing.** BrowseCortex has no servers, no analytics, and no telemetry. We do
not collect, transmit, or store any of your data.

## Where your data lives

- **API keys, provider configs, settings** — `chrome.storage.local` on your device
- **Conversations, messages, memories, tasks, files** — IndexedDB on your device
- **Backups** — encrypted files you export yourself

## Network requests

BrowseCortex only makes network requests to:

1. **The AI provider you configure** — your messages and tool definitions are
   sent to the OpenAI-compatible endpoint you choose, using your API key.
2. **The LiteLLM model catalog** — a public, read-only JSON file used to enrich
   model capability data (no personal data sent).
3. **Pages you ask it to visit** — when you instruct the agent to read or act on
   a web page.
4. **MCP servers you configure** — if you connect any.

We never proxy, intercept, or see any of this traffic — it goes directly from
your browser to the destination you chose.

## Permissions

The extension requests broad browser permissions (`<all_urls>`, tabs, history,
bookmarks, etc.) solely to perform the browser-automation tasks you ask of it.
None of this data is exfiltrated anywhere.
