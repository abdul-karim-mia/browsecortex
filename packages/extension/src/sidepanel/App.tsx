import { useEffect, useState } from 'preact/hooks';
import { t } from '@/i18n';
import { ChatTab } from './tabs/ChatTab';
import { TasksTab } from './tabs/TasksTab';
import { FilesTab } from './tabs/FilesTab';
import { ConversationDrawer } from './ConversationDrawer';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Icon, type IconName } from '@/components/Icon';
import { Logo } from './Logo';
import { Storage } from '@/storage';
import { checkDbHealth } from '@/db';

type Tab = 'chat' | 'tasks' | 'files';

const ALL_TABS: { id: Tab; key: string; icon: IconName }[] = [
  { id: 'chat', key: 'tab_chat', icon: 'chat' },
  { id: 'tasks', key: 'tab_tasks', icon: 'tasks' },
  { id: 'files', key: 'tab_files', icon: 'files' },
];

/** How often to poll for newly-created tasks/files while a conversation is
 * active, so their tabs can appear without the user needing to reload (PLAN §7). */
const TAB_VISIBILITY_POLL_MS = 3000;

export function App() {
  const [tab, setTab] = useState<Tab>('chat');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());
  const [density, setDensity] = useState<string>('comfortable');
  const [dbError, setDbError] = useState<string | null>(null);
  // Tasks/Files tabs only appear once the conversation actually has content
  // for them (PLAN §7) — no point showing an always-empty tab.
  const [hasTasks, setHasTasks] = useState(false);
  const [hasFiles, setHasFiles] = useState(false);

  const newChat = () => {
    setConversationId(crypto.randomUUID());
    setTab('chat');
  };

  // Open the most recent conversation + load density on first load (§8, §26, §35).
  useEffect(() => {
    // Surface IndexedDB migration/eviction failures (PLAN §41, §42).
    checkDbHealth().then((h) => {
      if (!h.ok) setDbError(h.error);
    });
    Storage.conversations.list(1).then(([recent]) => {
      if (recent) setConversationId(recent.id);
    });
    Storage.settings.get().then((s) => setDensity(s.density));

    // New-conversation keyboard command (PLAN §43).
    const onMsg = (msg: { type?: string }) => {
      if (msg?.type === 'command_new_conversation') newChat();
    };
    chrome.runtime?.onMessage?.addListener(onMsg);
    return () => chrome.runtime?.onMessage?.removeListener(onMsg);
  }, []);

  // Detect whether this conversation has tasks/files yet, so their tabs can
  // fade in only once they're actually used. Polled while mounted since tool
  // calls can create tasks/files at any point during a run.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      Storage.tasks.byConversation(conversationId).then((t) => {
        if (!cancelled) setHasTasks(t.length > 0);
      });
      Storage.files.byConversation(conversationId).then((f) => {
        if (!cancelled) setHasFiles(f.some((x) => !x.isFolder));
      });
    };
    refresh();
    const interval = setInterval(refresh, TAB_VISIBILITY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversationId]);

  // Don't strand the user on a tab that just disappeared (e.g. tasks cleared).
  useEffect(() => {
    if (tab === 'tasks' && !hasTasks) setTab('chat');
    if (tab === 'files' && !hasFiles) setTab('chat');
  }, [tab, hasTasks, hasFiles]);

  const visibleTabs = ALL_TABS.filter(
    (tEntry) =>
      tEntry.id === 'chat' ||
      (tEntry.id === 'tasks' && hasTasks) ||
      (tEntry.id === 'files' && hasFiles),
  );

  const openSettings = () => chrome.runtime?.openOptionsPage?.();

  return (
    <div
      class={`density-${density} relative flex h-full flex-col bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100`}
    >
      {/* Header */}
      <header class="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <div class="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            class="rounded p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            title="Conversations"
          >
            <Icon name="menu" />
          </button>
          <span class="flex items-center gap-1.5 font-semibold">
            <Logo size={20} />
            {t('app_name')}
          </span>
        </div>
        <button
          type="button"
          onClick={openSettings}
          class="rounded p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          title={t('settings')}
        >
          <Icon name="settings" />
        </button>
      </header>

      {dbError && (
        <div class="bg-red-100 px-3 py-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
          Some data couldn't be loaded (storage may have been evicted). Your settings and providers
          are intact; conversations and files may need restoring from a backup.
        </div>
      )}

      {/* Tabs — hidden entirely until a conversation actually has tasks/files */}
      {visibleTabs.length > 1 && (
        <nav class="flex border-b border-gray-200 dark:border-gray-700">
          {visibleTabs.map((tEntry) => (
            <button
              key={tEntry.id}
              type="button"
              onClick={() => setTab(tEntry.id)}
              class={`flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-medium ${
                tab === tEntry.id
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon name={tEntry.icon} size={16} />
              {t(tEntry.key)}
            </button>
          ))}
        </nav>
      )}

      {/* Active tab */}
      <main class="min-h-0 flex-1">
        <ErrorBoundary label={tab}>
          {tab === 'chat' && (
            <ChatTab key={conversationId} conversationId={conversationId} onNewChat={newChat} />
          )}
          {tab === 'tasks' && <TasksTab key={conversationId} conversationId={conversationId} />}
          {tab === 'files' && <FilesTab key={conversationId} conversationId={conversationId} />}
        </ErrorBoundary>
      </main>

      <ConversationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentId={conversationId}
        onSelect={setConversationId}
      />
    </div>
  );
}
