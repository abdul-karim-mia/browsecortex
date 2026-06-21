import { describe, it, expect } from 'vitest';
import { encryptJson, decryptJson } from '@/backup/crypto';

describe('backup crypto (AES-256-GCM)', () => {
  it('round-trips an object with the correct password', async () => {
    const data = { providers: [{ id: '1', name: 'Groq' }], n: 42 };
    const enc = await encryptJson(data, 'correct horse');
    const back = await decryptJson<typeof data>(enc, 'correct horse');
    expect(back).toEqual(data);
  });

  it('fails to decrypt with the wrong password', async () => {
    const enc = await encryptJson({ secret: true }, 'right');
    await expect(decryptJson(enc, 'wrong')).rejects.toBeTruthy();
  });

  it('produces a fresh salt and iv each time', async () => {
    const a = await encryptJson({ x: 1 }, 'pw');
    const b = await encryptJson({ x: 1 }, 'pw');
    expect(a.salt).not.toEqual(b.salt);
    expect(a.iv).not.toEqual(b.iv);
  });
});
