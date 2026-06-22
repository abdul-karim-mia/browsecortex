/**
 * Local OpenAI-compatible servers (Ollama, LM Studio, Jan, LiteLLM) reject
 * browser requests whose Origin header isn't on their allowlist — and a
 * fetch from an extension sends `Origin: chrome-extension://<id>`, which none
 * of them recognize. They respond with a bare 403 Forbidden. Stripping the
 * Origin header makes the request look like a normal non-browser client
 * (e.g. curl), which all of them accept by default.
 */
const RULE_ID = 9001;

export async function registerLocalOriginFix(): Promise<void> {
  if (!chrome.declarativeNetRequest) return;
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
    addRules: [
      {
        id: RULE_ID,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            { header: 'Origin', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
          ],
        },
        condition: {
          requestDomains: ['localhost', '127.0.0.1'],
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
        },
      },
    ],
  });
}
