/**
 * Storage quota monitoring (PLAN §41). Wraps navigator.storage so the UI can
 * warn before IndexedDB fills up and the VFS can block writes past 95%.
 */
export interface StorageEstimate {
  usageMB: number;
  quotaMB: number;
  percent: number;
}

export async function getStorageEstimate(): Promise<StorageEstimate> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usageMB: 0, quotaMB: 0, percent: 0 };
  }
  const est = await navigator.storage.estimate();
  const usage = est.usage ?? 0;
  const quota = est.quota ?? 0;
  return {
    usageMB: usage / 1024 / 1024,
    quotaMB: quota / 1024 / 1024,
    percent: quota > 0 ? (usage / quota) * 100 : 0,
  };
}

/** True when storage is too full to accept new VFS writes (PLAN §41 >95%). */
export async function isStorageFull(): Promise<boolean> {
  return (await getStorageEstimate()).percent > 95;
}

/** Ask the browser to keep this data under storage pressure (PLAN §41). */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
