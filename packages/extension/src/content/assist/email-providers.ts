/**
 * Webmail provider registry for Quick AI Reply.
 *
 * Each provider supplies best-effort CSS selectors for (a) the message bodies of
 * an open thread, (b) the compose/reply editable, and optionally (c) a toolbar
 * row to inject a native button into. Only Gmail's selectors are verified; the
 * rest are best-effort and fall back to a floating button + generic
 * contenteditable detection, so the feature still works if a selector misses.
 *
 * To tune a provider, open its webmail, inspect the message body / compose box,
 * and add the right selector to the arrays below.
 */
export interface MailProvider {
  id: string;
  name: string;
  /** Matched against location.hostname via `includes`. */
  hosts: string[];
  /** Selectors for the message body blocks of the open thread. */
  body: string[];
  /** Selectors for the compose/reply editable element. */
  compose: string[];
  /** Optional toolbar/action-row selectors for native inline injection. */
  anchors?: string[];
}

export const MAIL_PROVIDERS: MailProvider[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    hosts: ['mail.google.com'],
    body: ['.a3s'],
    compose: [
      'div[aria-label="Message Body"][contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]',
    ],
    anchors: ['.btC', '.amn'],
  },
  {
    id: 'outlook',
    name: 'Outlook',
    hosts: ['outlook.office.com', 'outlook.office365.com', 'outlook.live.com'],
    body: ['div[aria-label="Message body"]', '.allowTextSelection', 'div[role="document"]'],
    compose: [
      'div[role="textbox"][aria-label*="essage body"]',
      'div[contenteditable="true"][aria-label*="essage"]',
    ],
  },
  {
    id: 'proton',
    name: 'Proton Mail',
    hosts: ['mail.proton.me', 'mail.protonmail.com'],
    body: ['.message-content', '.proton-embedded'],
    compose: ['[contenteditable="true"]', '.composer [contenteditable]'],
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    hosts: ['icloud.com'],
    body: ['.mail-message-content', '[class*="MessageBody"]'],
    compose: ['[contenteditable="true"]'],
  },
  {
    id: 'zoho',
    name: 'Zoho Mail',
    hosts: ['mail.zoho.com', 'mail.zoho.eu', 'mail.zoho.in'],
    body: ['#mailContentDiv', '.zmPVContent', '.zmmailcontent'],
    compose: ['.zmEditorContent[contenteditable]', '[contenteditable="true"]'],
  },
  {
    id: 'neo',
    name: 'Neo Mail',
    hosts: ['app.neo.space', 'mail.neo.space'],
    body: ['[class*="MailBody"]', '[class*="message-body"]', '[class*="MessageBody"]'],
    compose: ['[contenteditable="true"]'],
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    hosts: ['app.fastmail.com', 'www.fastmail.com', 'fastmail.com'],
    body: ['.v-Message-body', '.s-message-body', '[class*="Message-body"]'],
    compose: ['[contenteditable="true"]'],
  },
  {
    id: 'tutanota',
    name: 'Tutanota',
    hosts: ['mail.tutanota.com', 'app.tuta.com', 'mail.tuta.com'],
    body: ['.tutaui-message-body', '[class*="mail-body"]', '.selectable'],
    compose: ['[contenteditable="true"]', '[role="textbox"]'],
  },
  {
    id: 'mailfence',
    name: 'Mailfence',
    hosts: ['mailfence.com'],
    body: ['#mf_msgbody', '.mailbody', '.message-body'],
    compose: ['[contenteditable="true"]'],
  },
  {
    id: 'openprovider',
    name: 'Openprovider Mail',
    // Openprovider's webmail is OX App Suite based.
    hosts: ['mail.openprovider.com', 'webmail.openprovider.com'],
    body: ['.mail-detail-content', '.content.user-select-text', '.mail-detail-pane'],
    compose: ['.editor [contenteditable="true"]', '[contenteditable="true"]'],
  },
];

/** The provider whose hosts match the current page, if any. */
export function detectProvider(hostname: string): MailProvider | null {
  return MAIL_PROVIDERS.find((p) => p.hosts.some((h) => hostname.includes(h))) ?? null;
}
