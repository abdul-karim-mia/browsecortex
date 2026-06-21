/**
 * Thin typed wrapper over chrome.storage.local (PLAN §4, §25).
 * Falls back to an in-memory map when chrome.storage is unavailable
 * (e.g. unit tests / non-extension context).
 */

type Listener = (changes: Record<string, chrome.storage.StorageChange>) => void;

const memoryStore = new Map<string, unknown>();

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

export async function get<T>(key: string): Promise<T | undefined> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  }
  return memoryStore.get(key) as T | undefined;
}

export async function set<T>(key: string, value: T): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  memoryStore.set(key, value);
}

export async function remove(key: string): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.remove(key);
    return;
  }
  memoryStore.delete(key);
}

export function onChange(listener: Listener): () => void {
  if (hasChromeStorage()) {
    const wrapped = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'local') listener(changes);
    };
    chrome.storage.onChanged.addListener(wrapped);
    return () => chrome.storage.onChanged.removeListener(wrapped);
  }
  return () => {};
}
