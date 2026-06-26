/**
 * External-AI site adapters (B7, PLAN §16). Each adapter is plain data — the
 * URL to open plus candidate CSS selectors for the prompt input, send button,
 * and assistant response. Selectors are best-effort and WILL drift as these
 * sites change their markup; they're isolated here so they can be updated
 * without touching the tool logic. Community-maintainable by design.
 */
export interface ExternalAiAdapter {
  id: string;
  name: string;
  url: string;
  /** Candidate selectors for the prompt box (textarea or contenteditable). */
  inputSelectors: string[];
  /** Candidate selectors for the send button (optional — falls back to Enter). */
  sendSelectors: string[];
  /** Candidate selectors for assistant response blocks (the last is read). */
  responseSelectors: string[];
  /** Candidate selectors for the file-upload input (image passing, best-effort). */
  fileInputSelectors: string[];
  /**
   * How to attach an image. `file` feeds a hidden <input type=file> (ChatGPT,
   * Claude); `paste` dispatches a paste event onto the composer (Gemini, whose
   * uploader isn't a plain file input). Defaults to `file`, falling back to
   * `paste` when no file input is present.
   */
  imageMethod?: 'file' | 'paste';
}

export const EXTERNAL_AI_ADAPTERS: ExternalAiAdapter[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com/',
    inputSelectors: ['#prompt-textarea', 'div[contenteditable="true"]', 'textarea'],
    sendSelectors: ['button[data-testid="send-button"]', 'button[aria-label*="Send"]'],
    responseSelectors: ['div[data-message-author-role="assistant"]', '.markdown'],
    fileInputSelectors: ['input[type="file"]'],
  },
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai/new',
    inputSelectors: ['div.ProseMirror[contenteditable="true"]', '.ProseMirror', 'div[contenteditable="true"]'],
    sendSelectors: [
      'button[aria-label="Send message"]',
      'button[aria-label*="Send"]',
      'button[type="submit"]',
    ],
    responseSelectors: [
      'div[data-is-streaming] .font-claude-message',
      '.font-claude-message',
      'div[data-testid="message-content"]',
      '.prose',
    ],
    fileInputSelectors: ['input[type="file"]'],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com/app',
    inputSelectors: ['rich-textarea .ql-editor', 'div[contenteditable="true"]', 'textarea'],
    sendSelectors: ['button[aria-label*="Send"]', 'button.send-button'],
    responseSelectors: ['message-content', '.model-response-text', '.markdown'],
    fileInputSelectors: ['input[type="file"]'],
    imageMethod: 'paste',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    url: 'https://www.perplexity.ai/',
    inputSelectors: [
      'textarea[placeholder*="Ask anything"]',
      'textarea#ask-input',
      'textarea[placeholder]',
      'textarea',
      'div[contenteditable="true"]',
    ],
    sendSelectors: [
      'button[aria-label="Submit"]',
      'button[aria-label*="Submit"]',
      'button[data-testid="submit-button"]',
      'button[type="submit"]',
    ],
    responseSelectors: ['div[id^="markdown-content"]', '.prose', 'div[dir="auto"]'],
    fileInputSelectors: ['input[type="file"]'],
  },
];

export function getAdapter(id: string): ExternalAiAdapter | undefined {
  return EXTERNAL_AI_ADAPTERS.find((a) => a.id === id.toLowerCase());
}
