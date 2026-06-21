import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import type { Task } from '@/types';

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
    Storage.tasks
      .byConversation(conversationId)
      .then(setTasks)
      .catch(() => setTasks([]));
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
                const done = task.subtasks.filter((s) => s.done).length;
                return (
                  <li
                    key={task.id}
                    class="rounded border border-gray-200 px-2 py-1 dark:border-gray-700"
                  >
                    <div>{task.title}</div>
                    {task.subtasks.length > 0 && (
                      <>
                        <div class="mt-1 h-1.5 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
                          <div
                            class="h-full bg-blue-500 transition-all"
                            style={{ width: `${(done / task.subtasks.length) * 100}%` }}
                          />
                        </div>
                        <div class="mt-0.5 text-xs text-gray-400">
                          {done}/{task.subtasks.length} subtasks
                        </div>
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
