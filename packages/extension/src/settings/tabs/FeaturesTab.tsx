import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import { DEFAULT_SETTINGS, type Settings } from '@/types';

type FeatureKey = keyof Settings['assistFeatures'];

interface FeatureInfo {
  key: FeatureKey;
  title: string;
  icon: string;
  description: string;
  howTo: string[];
}

const FEATURES: FeatureInfo[] = [
  {
    key: 'highlightToolbar',
    title: 'Highlight Toolbar',
    icon: '✎',
    description:
      'A contextual toolbar that appears when you select text on any page. Rewrite for clarity, ' +
      'translate across 25 languages, shift the tone, expand into more detail, or have it read ' +
      'aloud (text-to-speech).',
    howTo: [
      'Select any text on a web page with your mouse.',
      'A toolbar appears just below the selection.',
      'Pick an action — Rewrite, Translate, Tone, Expand, or Read.',
      'In an editable field you also get a Replace button; otherwise use Copy.',
    ],
  },
  {
    key: 'inlineAssist',
    title: 'Inline Assist',
    icon: '⌨',
    description:
      'An inline editor you trigger with Ctrl+Shift+K inside any text field. Give a direct ' +
      'instruction or apply one of your saved templates (installed skills), then insert or replace ' +
      'the text in place.',
    howTo: [
      'Click into any text field, comment box, or editor.',
      'Press Ctrl+Shift+K (use Ctrl, not Cmd, on macOS — Cmd+Shift+K is reserved by the browser).',
      'Type an instruction and press Enter, or pick a template chip.',
      'Choose Insert (at the cursor) or Replace.',
    ],
  },
  {
    key: 'floatingBubble',
    title: 'Floating Bubble',
    icon: '✦',
    description:
      'A small floating brain icon pinned to the bottom-right of every page. One click summarizes ' +
      'the current page into a TL;DR plus key points. The icon animates while it’s thinking.',
    howTo: [
      'Look for the brain icon at the bottom-right of the page.',
      'Click it to summarize the current page.',
      'Read the streamed summary, then Copy if you want to keep it.',
    ],
  },
  {
    key: 'emailReply',
    title: 'Quick AI Email Reply',
    icon: '✉',
    description:
      'Reads the entire open email thread and drafts a tailored reply with one click, dropping it ' +
      'straight into the compose box. Works in Gmail, Outlook, Proton Mail, iCloud Mail, Zoho Mail, ' +
      'Neo Mail, Fastmail, Tutanota, Mailfence, and Openprovider Mail.',
    howTo: [
      'Open a conversation in your webmail.',
      'Click the “AI Reply” button — inline in the thread on Gmail, or the floating pill (bottom-right) on other providers.',
      'Review the drafted reply, then Insert it into your compose box.',
      'If no reply box is open, the draft is copied to your clipboard.',
    ],
  },
];

/** Features (in-page assist): descriptions, how-to, and per-feature toggles. */
export function FeaturesTab() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    Storage.settings.get().then(setSettings);
  }, []);

  const toggle = async (key: FeatureKey, value: boolean) => {
    const assistFeatures = { ...settings.assistFeatures, [key]: value };
    const next = await Storage.settings.update({ assistFeatures });
    setSettings(next);
  };

  return (
    <div class="space-y-5 text-sm">
      <p class="text-gray-600 dark:text-gray-300">
        In-page assistant features that work on any website. Toggle any of them off below. Changes
        apply to pages you load or reload after saving.
      </p>

      {FEATURES.map((f) => {
        const on = settings.assistFeatures[f.key];
        return (
          <div
            key={f.key}
            class="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-start gap-3">
                <span class="text-lg leading-none" aria-hidden="true">
                  {f.icon}
                </span>
                <div>
                  <div class="font-semibold text-gray-800 dark:text-gray-100">{f.title}</div>
                  <p class="mt-1 text-gray-600 dark:text-gray-400">{f.description}</p>
                </div>
              </div>
              <label class="relative inline-flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  class="peer sr-only"
                  checked={on}
                  onChange={(e) => toggle(f.key, (e.target as HTMLInputElement).checked)}
                />
                <div class="h-6 w-11 rounded-full bg-gray-300 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-blue-500 peer-checked:after:translate-x-5 dark:bg-gray-600" />
              </label>
            </div>

            <div class="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
              <div class="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                How to use
              </div>
              <ol class="list-decimal space-y-0.5 pl-5 text-gray-600 dark:text-gray-400">
                {f.howTo.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        );
      })}

      <p class="text-xs text-gray-500">
        All features use the provider/model configured under{' '}
        <span class="font-medium">General → Assist provider</span> (defaults to your active
        selection).
      </p>
    </div>
  );
}
