# BrowseCortex — Complete Fix Plan

> **Audit Issues:** 103 total (10 Critical, 22 High, 44 Medium, 27 Low)  
> **Estimated Effort:** ~40 hours across 6 phases, 20 work items  
> **Strategy:** Fix in severity order. Each phase is independently shippable.

> [!NOTE]
> **Status (2026-06-23): Implemented for v1.1.0.** All critical/high issues and the
> bulk of medium/low ones are fixed and verified (`npm run typecheck && lint && test
> && build` all green; relay smoke-tested). Deliberately **not** changed, with reasons:
> - **M-EXT-1** (`synthModel` defaults `hasToolCalling: true`) — kept optimistic; the
>   product is a tool-calling agent and an unknown model is far more likely to support
>   tools than not. Flipping it would degrade the common case.
> - **M-LAND-5 / L-LAND-2** (1200×630 OG image) — requires a binary asset that can't be
>   generated from source; left as a design task.
> - A few low-value polish items (M-EXT-5 autoName debounce, M-EXT-10 tool-abort
>   propagation, L-EXT-1/2 screenshot/search scans) deferred as non-blocking.

---

## Phase 1: Critical Security Hotfixes
**Priority:** 🔴 DO NOW — ship as `v1.1.0`  
**Estimated time:** ~6 hours  
**Covers:** 5 CRITICAL + 3 HIGH issues

---

### 1.1 Fix XSS in Landing Page Contributor Rendering

> [!CAUTION]
> An attacker with a crafted GitHub username can execute arbitrary JS on your landing page for every visitor.

**Files to modify:**
- [MODIFY] [main.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/landing/main.ts) — Lines 110–126

**Change:** Replace `innerHTML` template interpolation with safe DOM API calls.

```diff
-// Lines 110-113 — CURRENT (XSS vulnerable)
-item.innerHTML = `
-  <img src="${c.avatar_url}" alt="${c.login}" .../>
-  <span class="contributor-name">${c.login}</span>
-`;

+// FIXED — safe DOM construction
+const img = document.createElement('img');
+img.setAttribute('src', c.avatar_url);
+img.setAttribute('alt', c.login);
+img.className = 'contributor-avatar';
+img.width = 40; img.height = 40;
+img.loading = 'lazy';
+img.addEventListener('error', () => {
+  img.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(c.login)}`;
+});
+const name = document.createElement('span');
+name.className = 'contributor-name';
+name.textContent = c.login;  // textContent is XSS-safe
+item.append(img, name);
```

Apply the same pattern to the fallback contributor block (lines 120–126).

**Verification:** Search for all remaining `innerHTML` assignments in `main.ts`; ensure none interpolate external data.

---

### 1.2 Add Body Size Limit to Relay `/messages` Endpoint

> [!CAUTION]
> Any unauthenticated client can OOM-crash the relay server with a single HTTP request.

**Files to modify:**
- [MODIFY] [index.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/relay/src/index.ts) — Lines 125–128

**Change:** Add 1MB body limit:

```diff
+const MAX_BODY = 1_048_576; // 1MB
 let body = '';
-req.on('data', (c) => { body += c; });
+req.on('data', (c) => {
+  body += c;
+  if (body.length > MAX_BODY) {
+    res.writeHead(413).end('Payload too large');
+    req.destroy();
+  }
+});
```

**Verification:** `curl -X POST -d "$(head -c 2000000 /dev/zero | tr '\0' 'A')" http://localhost:7822/messages?token=...` → should get 413.

---

### 1.3 Move Auth Tokens from URL to Headers

> [!CAUTION]
> Tokens in URLs are logged in server access logs, browser devtools, proxy logs, and `Referer` headers.

**Files to modify (Relay server):**
- [MODIFY] [index.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/relay/src/index.ts)

**HTTP auth change (line ~100):**
```diff
-const authed = url.searchParams.get('token') === token;
+const authHeader = req.headers.authorization ?? '';
+const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
+// Timing-safe comparison to prevent side-channel attacks
+const authed = bearerToken.length === token.length &&
+  crypto.timingSafeEqual(Buffer.from(bearerToken), Buffer.from(token));
```

Add at top of file:
```ts
import { timingSafeEqual } from 'node:crypto';
```

**WebSocket auth change (line ~150):**
```diff
-const wsToken = new URL(req.url!, 'http://localhost').searchParams.get('token');
-if (wsToken !== token) { socket.close(1008, 'Bad token'); return; }
+const proto = req.headers['sec-websocket-protocol'] ?? '';
+const wsToken = proto.startsWith('token.') ? proto.slice(6) : '';
+if (!wsToken || wsToken.length !== token.length ||
+    !timingSafeEqual(Buffer.from(wsToken), Buffer.from(token))) {
+  socket.close(1008, 'Bad token'); return;
+}
```

**Files to modify (Extension relay client):**
- [MODIFY] [relay-client.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/mcp-server/relay-client.ts) — Line 114

```diff
-const url = `ws://localhost:${cfg.port}/ws?token=${encodeURIComponent(cfg.token)}`;
-socket = new WebSocket(url);
+const url = `ws://localhost:${cfg.port}/ws`;
+socket = new WebSocket(url, [`token.${cfg.token}`]);
```

**Verification:** Old URL-based auth should fail (401/1008). New header-based auth should succeed.

---

### 1.4 Add Content Security Policy to Landing Page

**Files to modify:**
- [MODIFY] [index.html](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/landing/index.html) — Inside `<head>`

**Add after the existing `<meta>` tags:**
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' https://fonts.googleapis.com;
  font-src https://fonts.gstatic.com;
  img-src 'self' https://avatars.githubusercontent.com https://api.dicebear.com data:;
  connect-src https://api.github.com;
">
```

**Verification:** Open landing page → DevTools Console should show no CSP violations. Test that fonts, images, and GitHub API calls still work.

---

### 1.5 Harden `run_javascript` Against Prompt Injection

**Files to modify:**
- [MODIFY] [misc.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/tools/builtin/misc.ts) — Lines 84–120
- [MODIFY] [registry.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/tools/registry.ts) — `executeTool` function

**Change 1:** Mark `run_javascript` as requiring confirmation even in `full_auto` mode when external content was read:

In [registry.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/tools/registry.ts), add a new flag to the tool definition type and check it:

```diff
 // In executeTool, before running:
+if (def.forceConfirmOnExternalRead && ctx.externalContentRead) {
+  // Escalate: require explicit user confirmation regardless of agent mode
+  return { error: 'run_javascript blocked: external content was read this session. ' +
+    'Ask the user to explicitly approve this action.' };
+}
```

**Change 2:** Switch `run_javascript` from `MAIN` to `ISOLATED` world by default:

```diff
-world: 'MAIN',
+world: 'ISOLATED',  // Prevents access to page's cookies, localStorage, etc.
```

And add `forceConfirmOnExternalRead: true` to the `runJavascript` tool definition.

**Note:** `ISOLATED` world still has DOM access but not `window.localStorage`, cookies, or page-global JS variables. This significantly reduces the blast radius of prompt injection while keeping the tool useful.

**Verification:** Test that `run_javascript` still works for basic DOM queries. Verify it cannot access `document.cookie` or `window.localStorage` from the `ISOLATED` world.

---

## Phase 2: Relay Server Stability
**Priority:** 🟠 Ship within 3 days  
**Estimated time:** ~6 hours  
**Covers:** 6 HIGH + 8 MEDIUM relay issues

---

### 2.1 Fix Resource Leaks and Crash Vectors

**Files to modify:**
- [MODIFY] [index.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/relay/src/index.ts)

**All changes in a single pass to `index.ts`:**

**a) Drain pending RPCs on extension disconnect (line ~170):**
```diff
 socket.on('close', () => {
   if (extension === socket) extension = null;
+  for (const [id, p] of pending) {
+    p.reject(new Error('Extension disconnected'));
+    pending.delete(id);
+  }
 });
```

**b) Guard SSE writes against destroyed responses (line ~65):**
```diff
-const reply = (result: Json) => {
+const reply = (result: Json) => {
+  if (res2.destroyed || res2.writableEnded) return;
   res2.write(`data: ${JSON.stringify(...)}\n\n`);
 };
-const fail = (err: string) => {
+const fail = (err: string) => {
+  if (res2.destroyed || res2.writableEnded) return;
   res2.write(`data: ${JSON.stringify(...)}\n\n`);
 };
```

**c) Close old extension socket on replacement (line ~152):**
```diff
+if (extension && extension !== socket) {
+  extension.close(1000, 'Replaced by new connection');
+  for (const [id, p] of pending) {
+    p.reject(new Error('Extension replaced'));
+    pending.delete(id);
+  }
+}
 extension = socket;
```

**d) Add error handlers (after socket assignment):**
```diff
+socket.on('error', (err) => console.error('[relay] WS error:', err.message));
+// After wss creation:
+wss.on('error', (err) => console.error('[relay] WSS error:', err.message));
+// After server creation:
+server.on('error', (err) => {
+  console.error('[relay] Server error:', err.message);
+  if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
+    console.error(`Port ${opts.port} already in use`);
+    process.exit(1);
+  }
+});
```

**e) Guard SSE ping writes (line ~113):**
```diff
-const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
+const ping = setInterval(() => {
+  if (!res.destroyed) res.write(': ping\n\n');
+}, 25_000);
+res.on('error', () => {});  // suppress write errors on destroyed responses
```

**f) Add `headersSent` check in POST handler catch (line ~128):**
```diff
 } catch (e) {
+  if (res.headersSent) return;
   res.writeHead(400).end(...)
 }
```

---

### 2.2 Add Graceful Shutdown

**Files to modify:**
- [MODIFY] [index.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/relay/src/index.ts) — Add at end of `main()`

```ts
function shutdown() {
  console.log('[relay] Shutting down...');
  // Clear all SSE sessions
  for (const [, res] of sessions) {
    if (!res.destroyed) res.end();
  }
  sessions.clear();
  // Close extension socket
  extension?.close(1000, 'Server shutting down');
  // Reject pending RPCs
  for (const [id, p] of pending) {
    p.reject(new Error('Server shutting down'));
    pending.delete(id);
  }
  // Close servers
  wss.close();
  server.close(() => process.exit(0));
  // Force exit after 5s
  setTimeout(() => process.exit(1), 5000).unref();
}
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, shutdown);
}
```

---

### 2.3 Add Port Validation and Arg Safety

**Files to modify:**
- [MODIFY] [index.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/relay/src/index.ts) — Lines 24–35

```diff
 case '--port':
-  opts.port = Number(argv[++i]);
+  if (i + 1 >= argv.length) { console.error('--port requires a value'); process.exit(1); }
+  const p = Number(argv[++i]);
+  if (!Number.isInteger(p) || p < 1 || p > 65535) {
+    console.error('--port must be 1-65535'); process.exit(1);
+  }
+  opts.port = p;
   break;
 case '--token':
-  opts.token = argv[++i] ?? '';
+  if (i + 1 >= argv.length) { console.error('--token requires a value'); process.exit(1); }
+  opts.token = argv[++i];
   break;
```

---

### 2.4 Authenticate `/status` Endpoint

**Files to modify:**
- [MODIFY] [index.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/relay/src/index.ts) — Line ~139

```diff
 if (url.pathname === '/status') {
+  if (!authed) return void res.writeHead(401).end('Unauthorized');
   return void res.writeHead(200, { 'Content-Type': 'application/json' })
     .end(JSON.stringify({ extension: !!extension, sessions: sessions.size }));
 }
```

---

### 2.5 Rewrite Relay README

**Files to modify:**
- [MODIFY] [README.md](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/relay/README.md)

**Replace entirely** to match actual implementation:
- Default port: `7822`
- Endpoints: `GET /sse`, `POST /messages`, `GET /status` (all require `Authorization: Bearer` header after Phase 1.3)
- WebSocket: `ws://localhost:7822/ws` (auth via sub-protocol `token.<value>`)
- CLI args: `--port <n>`, `--token <string>`
- Remove all references to env vars, `/tools`, `/tool-call`, `/events`, ports 3000/3001

**Verification:** Compare every endpoint/port/arg mentioned in README against `src/index.ts`.

---

## Phase 3: Extension Agent Loop & Tool Fixes
**Priority:** 🟠 Ship within 1 week  
**Estimated time:** ~8 hours  
**Covers:** 5 HIGH + 10 MEDIUM extension issues

---

### 3.1 Fix Tool Call Name Accumulation

**Files to modify:**
- [MODIFY] [chat.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/providers/chat.ts) — Line 155

```diff
-if (tc.function?.name) existing.name += tc.function.name;
+if (tc.function?.name && !existing.name) existing.name = tc.function.name;
```

**Verification:** Add unit test with a mock provider that sends the tool name in multiple chunks.

---

### 3.2 Handle `finishReason` in Agent Loop

**Files to modify:**
- [MODIFY] [loop.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/agent/loop.ts) — Inside the `for await` loop (~L139–161)

```diff
+if (ev.type === 'done') {
+  if (ev.finishReason === 'content_filter') {
+    emit({ type: 'warning', message: 'Response was filtered by the provider\'s content policy.' });
+  }
+}
```

---

### 3.3 Fix `pendingAsk` Leak on Port Disconnect

**Files to modify:**
- [MODIFY] [background/index.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/background/index.ts) — In the `onDisconnect` handler (~L290–296)

```diff
 port.onDisconnect.addListener(() => {
+  pendingAsk?.({});
+  pendingAsk = null;
   abortController?.abort();
   // ...rest of cleanup
 });
```

---

### 3.4 Fix `parseArgs` to Return Structured Errors

**Files to modify:**
- [MODIFY] [loop.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/agent/loop.ts) — Lines 51–58

```diff
 function parseArgs(raw: string): Record<string, unknown> {
   if (!raw || raw === '{}') return {};
   try {
     return JSON.parse(raw);
-  } catch {
-    return {};
+  } catch (e) {
+    log.warn('[loop] malformed tool call args:', raw.slice(0, 200));
+    return { __parseError: true, __raw: raw.slice(0, 500) };
   }
 }
```

Then in the tool execution section, before calling `executeTool`:
```diff
+if (args.__parseError) {
+  toolResults.push({
+    role: 'tool', tool_call_id: call.id,
+    content: JSON.stringify({
+      error: 'Malformed JSON arguments. Please fix the JSON syntax and retry.',
+      rawPreview: args.__raw,
+    }),
+  });
+  continue;
+}
```

---

### 3.5 Fix `estimateTokens` for Multimodal Content

**Files to modify:**
- [MODIFY] [compaction.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/agent/compaction.ts) — Lines 13–23

```diff
 export function estimateTokens(messages: ApiMessage[]): number {
   let chars = 0;
   for (const m of messages) {
-    if (typeof m.content === 'string') chars += m.content.length;
+    if (typeof m.content === 'string') {
+      chars += m.content.length;
+    } else if (Array.isArray(m.content)) {
+      for (const part of m.content) {
+        if (part.type === 'text') chars += part.text.length;
+        else if (part.type === 'image_url') chars += 4000; // ~1000 tokens per image
+      }
+    }
     if (m.role === 'assistant' && m.tool_calls) {
       for (const tc of m.tool_calls)
         chars += tc.function.arguments.length + tc.function.name.length;
     }
   }
   return Math.ceil(chars / 4);
 }
```

---

### 3.6 Fix `extractKeywords` for Unicode/i18n

**Files to modify:**
- [MODIFY] [retrieval.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/memory/retrieval.ts) — Lines 42–46

```diff
 export function extractKeywords(text: string): string[] {
   return text
     .toLowerCase()
-    .split(/[^a-z0-9]+/)
+    .split(/[\s\p{P}\p{S}]+/u)  // Unicode-aware: split on whitespace, punctuation, symbols
     .filter((w) => w.length > 2 && !STOPWORDS.has(w));
 }
```

**Verification:** Test with Chinese, Arabic, Hindi text — keywords should be extracted correctly.

---

### 3.7 Add Timeout to MCP Client Fetch

**Files to modify:**
- [MODIFY] [mcp/client.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/mcp/client.ts) — Line ~39

```diff
 const res = await fetch(url, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
+  signal: AbortSignal.timeout(30_000),
 });
```

---

### 3.8 Fix `fsExport` Unicode Handling

**Files to modify:**
- [MODIFY] [filesystem.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/tools/builtin/filesystem.ts) — Line 153

```diff
-const dataUrl = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(content)))}`;
-const id = await chrome.downloads.download({ url: dataUrl, filename: name });
+const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
+const blobUrl = URL.createObjectURL(blob);
+const id = await chrome.downloads.download({ url: blobUrl, filename: name });
+// Clean up blob URL after download starts
+setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
```

---

### 3.9 Additional Medium-Priority Fixes

| Fix | File | Change |
|-----|------|--------|
| Cache Fuse instance | [retrieval.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/memory/retrieval.ts) | Add module-level `let fuseCache` + invalidation on memory write |
| Make `KEEP_RECENT` configurable | [compaction.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/agent/compaction.ts) L10 | Read from `settings.compactionKeepRecent` with default 5 |
| Log offscreen creation errors | [offscreen-manager.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/background/offscreen-manager.ts) L27 | `.catch((e) => log.warn('[offscreen]', e))` |
| Add vision call timeout | [vision.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/agent/vision.ts) | Add `signal: AbortSignal.timeout(30_000)` to fetch |
| Parallelize image analysis | [loop.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/src/agent/loop.ts) L309 | Wrap in `Promise.all()` |

---

## Phase 4: Version Sync & Release Pipeline
**Priority:** 🟡 Ship within 1 week  
**Estimated time:** ~4 hours  
**Covers:** 3 CRITICAL + 14 MEDIUM build/config issues

---

### 4.1 Synchronize All Package Versions

**Files to modify — set ALL to `1.1.0`:**

| File | Current | Action |
|------|---------|--------|
| [package.json](file:///Users/abdulkarimmia/Desktop/browsecortex/package.json) | `1.0.5` | → `1.1.0` |
| [packages/extension/package.json](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/package.json) | `1.0.2` | → `1.1.0` |
| [packages/relay/package.json](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/relay/package.json) | `1.0.6` | → `1.1.0` |
| [packages/landing/package.json](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/landing/package.json) | `1.0.0` | → `1.1.0` |
| [packages/extension/manifest.json](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/manifest.json) | `1.0.0` | → `1.1.0` |
| [VERSION](file:///Users/abdulkarimmia/Desktop/browsecortex/VERSION) | `1.0.0` | → `1.1.0` |

---

### 4.2 Fix Release Script to Update ALL Version Sources

**Files to modify:**
- [MODIFY] [release.sh](file:///Users/abdulkarimmia/Desktop/browsecortex/scripts/release.sh) — Lines 52–56

```diff
 # Update versions
 echo "📝 Updating version files..."
 npm version $NEW_VERSION --no-git-tag-version
 (cd packages/relay && npm version $NEW_VERSION --no-git-tag-version)
 (cd packages/extension && npm version $NEW_VERSION --no-git-tag-version 2>/dev/null || true)
+(cd packages/landing && npm version $NEW_VERSION --no-git-tag-version 2>/dev/null || true)
+
+# Update manifest.json
+jq --arg v "$NEW_VERSION" '.version = $v' packages/extension/manifest.json > tmp.json && mv tmp.json packages/extension/manifest.json
+
+# Update VERSION file
+echo "$NEW_VERSION" > VERSION
```

Also fix the `git add` line (line 77):
```diff
-git add package.json packages/*/package.json CHANGELOG.md
+git add package.json packages/*/package.json packages/extension/manifest.json CHANGELOG.md VERSION
```

---

### 4.3 Fix Release Workflow (CI)

**Files to modify:**
- [MODIFY] [release.yml](file:///Users/abdulkarimmia/Desktop/browsecortex/.github/workflows/release.yml)

**a) Move version bump BEFORE build (swap lines 44–45 with lines 73–93):**

```yaml
      # STEP 1: Bump versions FIRST
      - name: Update versions
        run: |
          NEW_VERSION="${{ steps.bump.outputs.version }}"
          npm version $NEW_VERSION --no-git-tag-version --allow-same-version
          cd packages/relay && npm version $NEW_VERSION --no-git-tag-version --allow-same-version && cd ../..
          cd packages/extension && npm version $NEW_VERSION --no-git-tag-version --allow-same-version && cd ../..
          cd packages/landing && npm version $NEW_VERSION --no-git-tag-version --allow-same-version && cd ../..
          jq --arg v "$NEW_VERSION" '.version = $v' packages/extension/manifest.json > tmp.json && mv tmp.json packages/extension/manifest.json
          echo "$NEW_VERSION" > VERSION

      # STEP 2: Build AFTER bump (so build-time version embedding is correct)
      - name: Build
        run: npm run build
```

**b) Remove the fragile `dist/manifest.json` jq hack (line 92):**
```diff
-jq --arg v "$NEW_VERSION" '.version = $v' dist/manifest.json > dist/manifest.tmp && mv dist/manifest.tmp dist/manifest.json
```

**c) Add `VERSION` to the git add (line 150):**
```diff
-git add package.json packages/*/package.json packages/extension/manifest.json CHANGELOG.md
+git add package.json packages/*/package.json packages/extension/manifest.json CHANGELOG.md VERSION
```

---

### 4.4 Fix Corrupted CHANGELOG

**Files to modify:**
- [MODIFY] [CHANGELOG.md](file:///Users/abdulkarimmia/Desktop/browsecortex/CHANGELOG.md)

**Replace the entire file** with a clean version:

```markdown
# Changelog

All notable changes to BrowseCortex are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

## [1.1.0] - 2026-06-23

### Fixed
- Critical XSS vulnerability in landing page contributor rendering
- Relay server DoS vector (no body size limit)
- Auth tokens exposed in URL query strings (moved to headers)
- Four-way version desync across all packages
- run_javascript prompt injection risk (switched to ISOLATED world)
- Resource leaks on extension disconnect in relay server
- Tool call name accumulation bug in streaming parser
- Unicode keyword extraction for non-English memory retrieval

### Added
- Content Security Policy for landing page
- Graceful shutdown for relay server
- Body size limits on relay endpoints
- Timing-safe token comparison

## [1.0.5] - 2026-06-21

### Added
- Incremental bugfixes and stability improvements.

## [1.0.1] - 2026-06-21

### Added
- Monorepo scaffold (extension + relay) with Vite, CRXJS, Preact, Tailwind v4.
- Streaming agent loop with parallel tool calls, iteration cap, and abort.
- 100+ browser tools: tabs, navigation, page read/interaction, and more.
- Memory (Fuse.js), tasks, and a per-conversation virtual filesystem.
- Provider/model management with LiteLLM capability enrichment + ping test.
- Provider cooldown & fallback routing on 429.
- Skills system, MCP client, and BrowseCortex-as-MCP-server via relay.
- File attachments, vision fallback, context compaction, message pinning.
- Backup & restore (AES-256-GCM), notifications, i18n foundation.

[Unreleased]: https://github.com/abdul-karim-mia/browsecortex/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/abdul-karim-mia/browsecortex/compare/v1.0.5...v1.1.0
[1.0.5]: https://github.com/abdul-karim-mia/browsecortex/compare/v1.0.1...v1.0.5
[1.0.1]: https://github.com/abdul-karim-mia/browsecortex/releases/tag/v1.0.1
```

---

### 4.5 Fix Documentation Naming

**Files to modify:**
- [MODIFY] [TASK.md](file:///Users/abdulkarimmia/Desktop/browsecortex/TASK.md) — Line 1 and any other occurrence
  - Replace all `BrowserMind` → `BrowseCortex`
- [MODIFY] [VERSIONS.md](file:///Users/abdulkarimmia/Desktop/browsecortex/VERSIONS.md)
  - Update v1.0.0 status from "In Development" to "Released"
  - Add entries for versions through 1.1.0

---

## Phase 5: Landing Page UX, A11y & Performance
**Priority:** 🟡 Ship within 2 weeks  
**Estimated time:** ~8 hours  
**Covers:** 8 HIGH + 12 MEDIUM + 7 LOW landing issues

---

### 5.1 Add Mobile Hamburger Menu

**Files to modify:**
- [MODIFY] [index.html](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/landing/index.html) — Inside `<nav>`
- [MODIFY] [style.css](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/landing/style.css) — Add mobile nav styles
- [MODIFY] [main.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/landing/main.ts) — Add toggle handler

**HTML — add before `.nav-links`:**
```html
<button class="mobile-menu-btn" aria-label="Toggle navigation" aria-expanded="false">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path d="M3 12h18M3 6h18M3 18h18"/>
  </svg>
</button>
```

**CSS:**
```css
.mobile-menu-btn { display: none; background: none; border: none; color: var(--text-primary); cursor: pointer; padding: 8px; }
@media (max-width: 768px) {
  .mobile-menu-btn { display: flex; }
  .nav-links { display: none; position: absolute; top: 100%; left: 0; right: 0; flex-direction: column; background: var(--bg-secondary); padding: 16px; gap: 8px; }
  .nav-links.open { display: flex; }
}
```

**JS:**
```ts
const menuBtn = document.querySelector('.mobile-menu-btn');
const navLinks = document.querySelector('.nav-links');
menuBtn?.addEventListener('click', () => {
  const expanded = menuBtn.getAttribute('aria-expanded') === 'true';
  menuBtn.setAttribute('aria-expanded', String(!expanded));
  navLinks?.classList.toggle('open');
});
```

---

### 5.2 Add ARIA Attributes Throughout

**Files to modify:**
- [MODIFY] [index.html](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/landing/index.html)

**Key changes:**
| Element | Add |
|---------|-----|
| `<nav>` | `role="navigation" aria-label="Main navigation"` |
| All decorative SVGs | `aria-hidden="true"` |
| Brand logo SVG | `role="img" aria-label="BrowseCortex logo"` |
| Simulator tabs | `role="tablist"`, each tab: `role="tab" aria-selected="true/false"` |
| Capability cards | `tabindex="0" role="button" aria-expanded="false"` |
| FAQ items | Convert to `<details><summary>Q</summary><p>A</p></details>` |

---

### 5.3 Fix Remaining Landing Issues

| Fix | File | Change |
|-----|------|--------|
| Fix SVG path typo | `index.html` L442 | `-2 2V5` → `-2-2V5` |
| Add `mb-4` class | `style.css` | `.mb-4 { margin-bottom: 1rem; }` |
| Restart sim loop on tab click | `main.ts` L350-358 | Add `simTimeout = setTimeout(runSimulationStep, 3000)` after tab switch |
| Clear DOM on sim reset | `main.ts` L346 | `chatMessages.innerHTML = ''` when `currentStep` wraps |
| Keyboard a11y for accordions | `main.ts` L361-368 | Add `tabindex="0"`, `keydown` listener for Enter/Space |
| Fix `prefers-reduced-motion` | `style.css` | Add media query to disable animations |
| Parallelize GitHub API calls | `main.ts` L40,71,95 | Wrap in `Promise.all()` with `localStorage` TTL cache |
| Create proper OG image | `public/` | Generate 1200×630 social preview image |
| Add `dns-prefetch` | `index.html` `<head>` | `<link rel="dns-prefetch" href="https://api.github.com">` |
| Fix footer brand | `index.html` L698 | Wrap in `<a href="#">` |

---

### 5.4 Non-null Safety for DOM Queries

**Files to modify:**
- [MODIFY] [main.ts](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/landing/main.ts) — Lines 329, 331, 333

```diff
-statusText!.textContent = step.status;
-dots!.style.display = step.showDots ? '' : 'none';
+if (statusText) statusText.textContent = step.status;
+if (dots) dots.style.display = step.showDots ? '' : 'none';
```

---

## Phase 6: Test Coverage, CI & Tooling
**Priority:** 🟢 Ship within 3 weeks  
**Estimated time:** ~10 hours  
**Covers:** Remaining MEDIUM + LOW across all packages

---

### 6.1 Add Relay Server Tests

**Files to create:**
- [NEW] `packages/relay/vitest.config.ts`
- [NEW] `packages/relay/tests/server.test.ts`
- [NEW] `packages/relay/tests/args.test.ts`

**Test cases:**
```ts
// args.test.ts
describe('parseArgs', () => {
  test('validates port range 1-65535');
  test('rejects NaN port');
  test('requires --token');
  test('handles missing value after --port');
});

// server.test.ts
describe('relay server', () => {
  test('rejects unauthenticated requests with 401');
  test('rejects oversized POST bodies with 413');
  test('/status requires auth');
  test('SSE session receives RPC results');
  test('handles extension disconnect gracefully');
  test('drains pending RPCs on disconnect');
  test('replaces old extension connection cleanly');
});
```

**Modify [package.json](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/relay/package.json):**
```diff
 "scripts": {
   "build": "tsc",
   "dev": "node --watch --import tsx src/index.ts --token $RELAY_DEV_TOKEN",
   "start": "node dist/index.js",
-  "typecheck": "tsc --noEmit"
+  "typecheck": "tsc --noEmit",
+  "test": "vitest run",
+  "lint": "eslint src tests"
 }
```

Add `vitest`, `eslint`, `eslint-config-prettier`, `typescript-eslint` to devDependencies.

---

### 6.2 Add Extension Test Coverage Config

**Files to create:**
- [NEW] `packages/extension/vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/ui/**'],
      thresholds: { lines: 60, branches: 50 },
    },
  },
});
```

**Modify [package.json](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/extension/package.json):**
```diff
-"test": "vitest run"
+"test": "vitest run",
+"test:coverage": "vitest run --coverage"
```

---

### 6.3 Fix CI Pipeline

**Files to modify:**
- [MODIFY] [ci.yml](file:///Users/abdulkarimmia/Desktop/browsecortex/.github/workflows/ci.yml)

**Add coverage reporting step:**
```diff
       - name: Unit tests
-        run: npm run test
+        run: npm run test -- --coverage
+      - name: Upload coverage
+        uses: actions/upload-artifact@v4
+        with:
+          name: coverage
+          path: packages/*/coverage/lcov.info
```

---

### 6.4 Fix Config Inconsistencies

| Fix | File | Change |
|-----|------|--------|
| Move Preact JSX to extension only | [tsconfig.base.json](file:///Users/abdulkarimmia/Desktop/browsecortex/tsconfig.base.json) | Remove `jsx` + `jsxImportSource` from base; add to extension's tsconfig |
| Fix relay module resolution | [packages/relay/tsconfig.json](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/relay/tsconfig.json) | Change to `"module": "nodenext"`, `"moduleResolution": "nodenext"` |
| Add `.js` extensions to relay imports | `packages/relay/src/index.ts` | Verify all imports have `.js` extensions for Node ESM |
| Fix dev token exposure | [packages/relay/package.json](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/relay/package.json) L12 | Change `--token dev-token-12345` → `--token $RELAY_DEV_TOKEN` |
| Fix format glob | [package.json](file:///Users/abdulkarimmia/Desktop/browsecortex/package.json) | Add `html,css` to prettier glob |
| Make release script portable | [package.json](file:///Users/abdulkarimmia/Desktop/browsecortex/package.json) L18 | Change to `"release": "bash scripts/release.sh"` |

---

### 6.5 Landing Page Lint Setup

**Files to create:**
- [NEW] `packages/landing/eslint.config.js`

**Files to modify:**
- [MODIFY] [packages/landing/package.json](file:///Users/abdulkarimmia/Desktop/browsecortex/packages/landing/package.json)

```diff
-"lint": "echo 'No lint rules for landing'"
+"lint": "eslint main.ts"
```

Add `eslint`, `typescript-eslint` to devDependencies.

---

## Verification Plan

### Automated Tests
```bash
# Run all tests after each phase
npm run typecheck          # All packages compile
npm run lint               # All packages pass lint
npm run test               # All unit tests pass
npm run build              # All packages build

# Extension E2E
cd packages/extension && npm run e2e

# Relay-specific
cd packages/relay && npm run test
```

### Manual Verification
| Check | Phase | How |
|-------|-------|-----|
| XSS fix | 1 | Set GitHub username to `<img src=x onerror=alert(1)>` → no alert |
| DoS fix | 1 | Send 2MB POST to relay → 413 response |
| Token in headers | 1 | Check devtools Network tab → no token in URLs |
| CSP active | 1 | DevTools → no CSP violations in Console |
| Mobile nav | 5 | Resize browser to 375px → hamburger menu visible and functional |
| Screen reader | 5 | Navigate landing page with VoiceOver → all sections reachable |
| Version sync | 4 | `grep -r '"version"' packages/*/package.json manifest.json VERSION` → all match |
| Relay stability | 2 | Kill/restart extension rapidly while agents are connected → no relay crash |

---

## Open Questions

> [!IMPORTANT]
> **Q1:** Should `run_javascript` be removed entirely or is the `ISOLATED` world + confirmation approach sufficient? Removing it eliminates the attack surface but reduces functionality.

> [!IMPORTANT]
> **Q2:** The relay server is a 184-line single-file monolith. Should Phase 2 include splitting it into modules (`args.ts`, `rpc.ts`, `sessions.ts`, `server.ts`) for testability, or keep it simple for now?

> [!IMPORTANT]
> **Q3:** The `.gitignore` excludes `PLAN.md`, `TASK.md`, and `toolIdea.md`. Should these be unignored so other contributors can see them, or are they intentionally private?

> [!IMPORTANT]
> **Q4:** The `<all_urls>` host permission in `manifest.json` will trigger Chrome Web Store manual review. Should we narrow it to specific patterns before the next store submission?
