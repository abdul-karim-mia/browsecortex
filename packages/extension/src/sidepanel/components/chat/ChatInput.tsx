/** Chat input area with file attachments and controls */

import { RefObject } from 'preact';
import { Icon } from '@/components/Icon';
import { t } from '@/i18n';
import type { Attachment } from '../../types/chat';
import type { Settings } from '@/types';

interface Props {
  input: string;
  onInputChange: (input: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  onAddFiles: (files: FileList | null) => void;
  attachments: Attachment[];
  onRemoveAttachment: (index: number) => void;
  running: boolean;
  connected: boolean;
  settings: Settings | null;
  onSettingsChange?: (settings: Settings) => void;
  modelSupportsThinking: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
  dragOver?: boolean;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: DragEvent) => void;
}

export function ChatInput({
  input,
  onInputChange,
  onSubmit,
  onStop,
  onAddFiles,
  attachments,
  onRemoveAttachment,
  running,
  connected,
  settings,
  modelSupportsThinking,
  textareaRef,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  return (
    <div class="border-t border-gray-200 p-2 dark:border-gray-700">
      {attachments.length > 0 && (
        <div class="mb-2 flex flex-wrap gap-1">
          {attachments.map((a, i) => (
            <span
              key={i}
              class="flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800"
            >
              {a.kind === 'image' && a.dataUrl ? (
                <img src={a.dataUrl} alt={a.name} class="h-6 w-6 rounded object-cover" />
              ) : (
                <Icon name={a.kind === 'image' ? 'image' : 'file'} size={12} />
              )}
              {a.name}
              <button
                type="button"
                onClick={() => onRemoveAttachment(i)}
                class="text-gray-400 hover:text-red-500"
                aria-label={`Remove ${a.name}`}
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        class={`rounded-2xl border bg-white px-3 py-2 dark:bg-gray-900 ${
          dragOver
            ? 'border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700'
            : 'border-gray-300 dark:border-gray-600'
        }`}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onInput={(e) => onInputChange((e.target as HTMLTextAreaElement).value)}
          aria-label={t('type_a_message')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            } else if (e.key === 'Escape') {
              if (running && onStop) onStop();
              else if (input === '') (e.target as HTMLTextAreaElement).blur();
            }
          }}
          placeholder={t('type_a_message')}
          rows={1}
          class="max-h-40 min-h-[40px] w-full resize-none overflow-y-auto border-none bg-transparent p-0 text-sm focus:outline-none"
        />
        <div class="mt-2 flex items-center justify-between">
          <div class="relative flex items-center gap-1">
            <label
              class="flex cursor-pointer items-center rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              title="Attach files"
            >
              <Icon name="plus" size={16} title="Attach files" />
              <input
                type="file"
                multiple
                accept="image/*,.txt,.md,.csv,.json"
                class="hidden"
                aria-label="Attach files"
                onChange={(e) => {
                  onAddFiles((e.target as HTMLInputElement).files);
                  (e.target as HTMLInputElement).value = '';
                }}
              />
            </label>
          </div>
          <div class="relative flex items-center gap-2 text-xs text-gray-400">
            <button
              type="button"
              aria-label="Select model"
              class="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {settings?.selectedModel && <span>{settings.selectedModel}</span>}
              {modelSupportsThinking && (
                <span class="capitalize">{settings?.reasoningEffort ?? 'medium'}</span>
              )}
            </button>
            {running ? (
              <button
                type="button"
                onClick={onStop}
                class="flex items-center rounded-full bg-red-500 p-1.5 text-white"
                title={t('stop')}
                aria-label={t('stop')}
              >
                <Icon name="stop" size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={!connected}
                class="flex items-center rounded-full bg-blue-500 p-1.5 text-white disabled:opacity-50"
                title={t('send_message')}
                aria-label={t('send_message')}
              >
                <Icon name="send" size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
