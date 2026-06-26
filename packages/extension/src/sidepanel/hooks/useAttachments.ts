/** Hook for managing file attachments */

import { useState } from 'preact/hooks';
import type { Attachment } from '../types/chat';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function readFileAsAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isImage = IMAGE_TYPES.includes(file.type);
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.onload = () =>
      resolve(
        isImage
          ? { name: file.name, kind: 'image', dataUrl: reader.result as string }
          : { name: file.name, kind: 'text', text: (reader.result as string).slice(0, 100_000) },
      );
    if (isImage) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const read = await Promise.all(Array.from(files).map(readFileAsAttachment));
    setAttachments((prev) => [...prev, ...read].slice(0, 10));
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return { attachments, setAttachments, addFiles, removeAttachment };
}
