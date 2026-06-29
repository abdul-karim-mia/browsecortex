/**
 * UID-based element snapshot system for dynamic page handling.
 * Generates stable UIDs for interactive elements that survive DOM mutations.
 * Based on AIPex's snapshot architecture but adapted for BrowseCortex.
 */

export interface ElementSnapshot {
  uid: string;
  tagName: string;
  id?: string;
  className?: string;
  type?: string;
  name?: string;
  ariaLabel?: string;
  textContent?: string;
  placeholder?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageSnapshot {
  tabId: number;
  frameId: number;
  timestamp: number;
  elements: Map<string, ElementSnapshot>;
  urlAtSnapshot: string;
}

/**
 * Generates deterministic UID for an element based on stable attributes.
 * Priority: id → (name + type) → (className + tagName + position) → hash-based fallback
 */
function generateUID(el: Element, index: number): string {
  if (el.id) return `id-${el.id}`;

  const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  if (input.name) return `name-${input.name}-${input.type || 'unknown'}`;

  const className = el.className ? (el.className as string).split(' ')[0] : '';
  if (className) return `class-${className}-${el.tagName.toLowerCase()}-${index}`;

  // Fallback: hash of content + position
  const text = el.textContent?.slice(0, 50) || '';
  const hash = Math.abs(
    text.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0)
  ).toString(36);
  return `pos-${el.tagName.toLowerCase()}-${index}-${hash}`;
}

/**
 * Checks if element is interactive (clickable, fillable, etc.)
 */
function isInteractiveElement(el: Element): boolean {
  const interactive = [
    'a',
    'button',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
  ];

  return interactive.some((sel) => {
    if (sel.startsWith('[')) {
      const attr = sel.slice(1, -1).split('=')[0];
      return el.getAttribute(attr) !== null;
    }
    return el.tagName.toLowerCase() === sel;
  });
}

/**
 * Creates a snapshot of all interactive elements on the page.
 * Generates stable UIDs that persist across DOM mutations.
 */
export function createPageSnapshot(tabId: number, frameId: number): PageSnapshot {
  const elements = new Map<string, ElementSnapshot>();
  const allInteractive = document.querySelectorAll(
    'a, button, input, select, textarea, [role="button"], [role="link"], [role="menuitem"]'
  );

  let index = 0;
  allInteractive.forEach((el) => {
    if (!isInteractiveElement(el)) return;

    const uid = generateUID(el, index);
    const rect = el.getBoundingClientRect();
    const input = el as HTMLInputElement;

    elements.set(uid, {
      uid,
      tagName: el.tagName.toLowerCase(),
      id: el.id || undefined,
      className: el.className ? (el.className as string).slice(0, 100) : undefined,
      type: input.type || undefined,
      name: input.name || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      textContent: el.textContent?.slice(0, 100) || undefined,
      placeholder: input.placeholder || undefined,
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });

    index++;
  });

  return {
    tabId,
    frameId,
    timestamp: Date.now(),
    elements,
    urlAtSnapshot: window.location.href,
  };
}

/**
 * Resolves a UID back to a DOM element, handling stale references.
 */
export function resolveElementByUID(snapshot: PageSnapshot, uid: string): Element | null {
  const meta = snapshot.elements.get(uid);
  if (!meta) return null;

  // Priority 1: ID match
  if (meta.id) {
    const byId = document.getElementById(meta.id);
    if (byId && isInteractiveElement(byId)) return byId;
  }

  // Priority 2: Name + type match
  if (meta.name && meta.type) {
    const byName = document.querySelector(
      `${meta.tagName}[name="${meta.name}"][type="${meta.type}"]`
    );
    if (byName) return byName;
  }

  // Priority 3: Best match by attributes + position
  const candidates = document.querySelectorAll(meta.tagName);
  let bestMatch: Element | null = null;
  let bestScore = 0;

  candidates.forEach((el) => {
    let score = 0;
    if (el.id === meta.id) score += 100;
    if ((el as HTMLInputElement).name === meta.name) score += 50;
    if (el.className?.includes(meta.className || '')) score += 30;
    if (el.textContent?.includes(meta.textContent || '')) score += 20;

    const rect = el.getBoundingClientRect();
    const drift = Math.abs(rect.x - meta.x) + Math.abs(rect.y - meta.y);
    if (drift < 50) score += 25;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = el;
    }
  });

  return bestScore > 30 ? bestMatch : null;
}

/**
 * Handle for a snapshotted element with resolve/click/fill capabilities.
 */
export class SnapshotElementHandle {
  constructor(private snapshot: PageSnapshot, private uid: string) {}

  resolve(): Element | null {
    return resolveElementByUID(this.snapshot, this.uid);
  }

  async click(): Promise<boolean> {
    const el = this.resolve();
    if (!el) return false;
    (el as HTMLElement).click();
    return true;
  }

  async fill(value: string): Promise<boolean> {
    const el = this.resolve();
    if (!el) return false;
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  getMetadata() {
    return this.snapshot.elements.get(this.uid);
  }
}

/**
 * Manages snapshots across tab navigations.
 */
export class SnapshotManager {
  private snapshots = new Map<number, PageSnapshot>();

  captureSnapshot(tabId: number, frameId: number = 0): PageSnapshot {
    const snapshot = createPageSnapshot(tabId, frameId);
    this.snapshots.set(tabId, snapshot);
    return snapshot;
  }

  getSnapshot(tabId: number): PageSnapshot | undefined {
    return this.snapshots.get(tabId);
  }

  getHandle(tabId: number, uid: string): SnapshotElementHandle | null {
    const snapshot = this.getSnapshot(tabId);
    if (!snapshot) return null;
    return new SnapshotElementHandle(snapshot, uid);
  }

  clearSnapshot(tabId: number): void {
    this.snapshots.delete(tabId);
  }

  refreshSnapshotIfNeeded(tabId: number, frameId: number = 0): PageSnapshot {
    const existing = this.getSnapshot(tabId);
    const now = Date.now();

    if (!existing || now - existing.timestamp > 30000) {
      return this.captureSnapshot(tabId, frameId);
    }

    return existing;
  }
}

export const snapshotManager = new SnapshotManager();
