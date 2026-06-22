import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import type { Subtask, Task } from '@/types';

function countSubtasks(subtasks: Subtask[], forceDone = false): { total: number; done: number } {
  let total = 0;
  let done = 0;
  for (const s of subtasks) {
    const effectiveDone = forceDone || s.done;
    if (s.subtasks && s.subtasks.length > 0) {
      const nested = countSubtasks(s.subtasks, effectiveDone);
      total += nested.total;
      done += nested.done;
    } else {
      total += 1;
      if (effectiveDone) done += 1;
    }
  }
  return { total, done };
}

function SubtaskIcon({ done }: { done: boolean }) {
  return (
    <span class={`mr-1 inline-block w-3.5 text-xs ${done ? 'text-green-500' : 'text-gray-400'}`}>
      {done ? '✓' : '○'}
    </span>
  );
}

function SubtaskList({
  subtasks,
  depth,
  forceDone,
}: {
  subtasks: Subtask[];
  depth: number;
  forceDone?: boolean;
}) {
  return (
    <ul class="space-y-0.5">
      {subtasks.map((s, i) => {
        const done = forceDone || s.done;
        return (
          <li key={i}>
            <div class="flex items-center" style={{ paddingLeft: `${depth * 16}px` }}>
              <SubtaskIcon done={done} />
              <span class={done ? 'text-gray-400 line-through' : ''}>{s.title}</span>
            </div>
            {s.subtasks && s.subtasks.length > 0 && (
              <SubtaskList subtasks={s.subtasks} depth={depth + 1} forceDone={done} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

const GROUPS: { status: Task['status']; label: string }[] = [
  { status: 'in_progress', label: 'In Progress' },
  { status: 'pending', label: 'Pending' },
  { status: 'done', label: 'Done' },
  { status: 'failed', label: 'Failed' },
];

interface Props {
  conversationId: string;
}

export function TasksTab({ conversationId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetch = () => {
      Storage.tasks
        .byConversation(conversationId)
        .then((t) => {
          if (mounted) setTasks(t);
        })
        .catch(() => {
          if (mounted) setTasks([]);
        });
    };
    fetch();
    const id = setInterval(fetch, 3000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [conversationId]);

  return (
    <div class="h-full space-y-4 overflow-y-auto p-3 text-sm">
      {tasks.length === 0 && <p class="mt-8 text-center text-gray-400">No tasks yet.</p>}
      {GROUPS.map(({ status, label }) => {
        const group = tasks.filter((t) => t.status === status);
        if (group.length === 0) return null;
        return (
          <section key={status}>
            <h3 class="mb-1 font-semibold text-gray-500">{label}</h3>
            <ul class="space-y-1">
              {group.map((task) => {
                const { total, done } = countSubtasks(task.subtasks);
                return (
                  <li
                    key={task.id}
                    class="rounded border border-gray-200 px-2 py-1 dark:border-gray-700"
                  >
                    <div class="font-medium">{task.title}</div>
                    {task.subtasks.length > 0 && (
                      <>
                        <div class="mt-1 h-1.5 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
                          <div
                            class="h-full bg-blue-500 transition-all"
                            style={{ width: `${(done / (total || 1)) * 100}%` }}
                          />
                        </div>
                        <div class="mt-0.5 text-xs text-gray-400">
                          {done}/{total} {total === 1 ? 'subtask' : 'subtasks'}
                        </div>
                        <SubtaskList subtasks={task.subtasks} depth={0} />
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
