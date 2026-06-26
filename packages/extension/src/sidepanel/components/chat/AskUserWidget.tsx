import { useState } from 'preact/hooks';

/** Question shape from the ask_user tool (PLAN §18). id/type are optional in
 * practice — models sometimes omit them despite the schema. */
export interface Question {
  id?: string;
  type?: 'text' | 'single_select' | 'multi_select' | 'confirm';
  question: string;
  placeholder?: string;
  options?: string[];
  allow_custom?: boolean;
  required?: boolean;
}

/** Slug a question into a short, stable answer key. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export interface AskUserPayload {
  message?: string;
  questions: Question[];
}

interface Props {
  payload: AskUserPayload;
  onSubmit: (answers: Record<string, unknown>) => void;
}

/** Inline interactive widget. Locks once submitted (handled by the parent). */
export function AskUserWidget({ payload, onSubmit }: Props) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

  // Models don't always supply `id`/`type` even though the schema requires them.
  // Normalize once so answers are never keyed by `undefined` and rendering has
  // a sensible default. The key prefers a slugged question text so the model can
  // still recognize what each answer maps to.
  const questions = payload.questions.map((q, i) => ({
    ...q,
    key: q.id || slug(q.question) || `question_${i + 1}`,
    type: q.type || 'text',
  }));

  const set = (key: string, value: unknown) => setAnswers((a) => ({ ...a, [key]: value }));

  const toggleMulti = (key: string, option: string) => {
    setAnswers((a) => {
      const current = Array.isArray(a[key]) ? (a[key] as string[]) : [];
      return {
        ...a,
        [key]: current.includes(option)
          ? current.filter((o) => o !== option)
          : [...current, option],
      };
    });
  };

  const canSubmit = questions.every(
    (q) => !q.required || (answers[q.key] !== undefined && answers[q.key] !== ''),
  );

  return (
    <div class="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm dark:border-blue-700 dark:bg-blue-950">
      {payload.message && <p class="mb-2 font-medium">{payload.message}</p>}
      <div class="space-y-3">
        {questions.map((q) => (
          <div key={q.key}>
            <label class="mb-1 block font-medium">{q.question}</label>

            {q.type === 'text' && (
              <input
                placeholder={q.placeholder}
                value={(answers[q.key] as string) ?? ''}
                onInput={(e) => set(q.key, (e.target as HTMLInputElement).value)}
                class="w-full rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
              />
            )}

            {q.type === 'confirm' && (
              <div class="flex gap-2">
                {['Yes', 'No'].map((label) => {
                  const val = label === 'Yes';
                  const active = answers[q.key] === val;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => set(q.key, val)}
                      class={`rounded px-3 py-1 ${active ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-800'}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === 'single_select' && (
              <div class="space-y-1">
                {(q.options ?? []).map((opt) => (
                  <label key={opt} class="flex items-center gap-2">
                    <input
                      type="radio"
                      name={q.key}
                      checked={answers[q.key] === opt}
                      onChange={() => set(q.key, opt)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}

            {q.type === 'multi_select' && (
              <div class="space-y-1">
                {(q.options ?? []).map((opt) => (
                  <label key={opt} class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={
                        Array.isArray(answers[q.key]) && (answers[q.key] as string[]).includes(opt)
                      }
                      onChange={() => toggleMulti(q.key, opt)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => onSubmit(answers)}
        class="mt-3 rounded bg-blue-500 px-4 py-1.5 font-medium text-white disabled:opacity-50"
      >
        Submit
      </button>
    </div>
  );
}
