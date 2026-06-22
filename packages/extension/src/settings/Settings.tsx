import { useState } from 'preact/hooks';
import '@/styles/global.css';
import { ProvidersTab } from './tabs/ProvidersTab';
import { ModelsTab } from './tabs/ModelsTab';
import { MemoryTab } from './tabs/MemoryTab';
import { BackupTab } from './tabs/BackupTab';
import { GeneralTab } from './tabs/GeneralTab';
import { McpTab } from './tabs/McpTab';
import { McpServerTab } from './tabs/McpServerTab';
import { SkillsTab } from './tabs/SkillsTab';
import { PlaygroundTab } from './tabs/PlaygroundTab';
import { Icon } from '@/components/Icon';

type Tab =
  | 'providers'
  | 'models'
  | 'memory'
  | 'skills'
  | 'mcp'
  | 'mcp_server'
  | 'backup'
  | 'general'
  | 'playground';

const TABS: { id: Tab; label: string }[] = [
  { id: 'providers', label: 'Providers' },
  { id: 'models', label: 'Models' },
  { id: 'memory', label: 'Memory' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP' },
  { id: 'mcp_server', label: 'MCP Server' },
  { id: 'backup', label: 'Backup' },
  { id: 'general', label: 'General' },
  // Dev-only Tool Playground (PLAN §38).
  ...(import.meta.env.DEV ? [{ id: 'playground' as Tab, label: '🧪 Playground' }] : []),
];

export function Settings() {
  const [tab, setTab] = useState<Tab>('providers');

  return (
    <div class="mx-auto max-w-3xl p-6 text-gray-900 dark:text-gray-100">
      <h1 class="mb-4 flex items-center gap-2 text-2xl font-bold">
        <Icon name="brain" size={26} class="text-blue-500" />
        BrowseCortex Settings
      </h1>
      <nav class="mb-6 flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700">
        {TABS.map((tEntry) => (
          <button
            key={tEntry.id}
            type="button"
            onClick={() => setTab(tEntry.id)}
            class={`px-3 py-2 text-sm font-medium min-w-[100px] text-center ${
              tab === tEntry.id
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tEntry.label}
          </button>
        ))}
      </nav>

      {tab === 'providers' && <ProvidersTab />}
      {tab === 'models' && <ModelsTab />}
      {tab === 'memory' && <MemoryTab />}
      {tab === 'mcp' && <McpTab />}
      {tab === 'mcp_server' && <McpServerTab />}
      {tab === 'backup' && <BackupTab />}
      {tab === 'general' && <GeneralTab />}
      {tab === 'skills' && <SkillsTab />}
      {tab === 'playground' && <PlaygroundTab />}

      {/* Footer / Sponsorship Section */}
      <footer class="mt-12 border-t border-gray-200 pt-6 text-center text-xs text-gray-500 dark:border-gray-700">
        <p class="mb-3">
          BrowseCortex is open-source. If you enjoy using it, please consider supporting the project!
        </p>
        <div class="flex justify-center">
          <a
            href="https://paypal.me/akmia51"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-1.5 rounded bg-blue-500/10 px-4 py-2 font-medium text-blue-600 hover:bg-blue-500/20 dark:text-blue-400"
          >
            <Icon name="sparkle" size={14} />
            Support on PayPal
          </a>
        </div>
      </footer>
    </div>
  );
}
