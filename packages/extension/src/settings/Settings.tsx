import { useState } from 'preact/hooks';
import '@/styles/global.css';
import { ProvidersTab } from './tabs/ProvidersTab';
import { ModelsTab } from './tabs/ModelsTab';
import { MemoryTab } from './tabs/MemoryTab';
import { BackupTab } from './tabs/BackupTab';
import { GeneralTab } from './tabs/GeneralTab';
import { FeaturesTab } from './tabs/FeaturesTab';
import { McpTab } from './tabs/McpTab';
import { McpServerTab } from './tabs/McpServerTab';
import { SkillsTab } from './tabs/SkillsTab';
import { SitesTab } from './tabs/SitesTab';
import { PlaygroundTab } from './tabs/PlaygroundTab';
import { Icon } from '@/components/Icon';
import { Logo } from '@/sidepanel/Logo';

type Tab =
  | 'providers'
  | 'models'
  | 'memory'
  | 'skills'
  | 'mcp'
  | 'mcp_server'
  | 'backup'
  | 'general'
  | 'features'
  | 'sites'
  | 'playground';

const TABS: { id: Tab; label: string }[] = [
  // Connection setup
  { id: 'providers', label: 'Providers' },
  { id: 'models', label: 'Models' },
  // Behaviour
  { id: 'general', label: 'General' },
  { id: 'features', label: 'Features' },
  // Extensions / capabilities
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP' },
  { id: 'mcp_server', label: 'MCP Server' },
  // Data & scope
  { id: 'memory', label: 'Memory' },
  { id: 'sites', label: 'Sites' },
  { id: 'backup', label: 'Backup' },
  // Dev-only Tool Playground (PLAN §38).
  ...(import.meta.env.DEV ? [{ id: 'playground' as Tab, label: '🧪 Playground' }] : []),
];

export function Settings() {
  const [tab, setTab] = useState<Tab>('providers');

  return (
    <div class="h-full overflow-y-auto bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 dark:from-gray-950 dark:to-gray-900 dark:text-gray-100">
      {/* Sticky brand header */}
      <header class="sticky top-0 z-10 border-b border-gray-200/70 bg-white/80 backdrop-blur-md dark:border-gray-800/70 dark:bg-gray-950/70">
        <div class="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <Logo size={34} />
          <div class="leading-tight">
            <h1 class="text-lg font-bold tracking-tight">BrowseCortex</h1>
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Settings</p>
          </div>
        </div>
      </header>

      <div class="mx-auto max-w-3xl px-6 py-8">
        {/* Segmented pill navigation */}
        <nav class="mb-6 flex flex-wrap gap-1.5">
          {TABS.map((tEntry) => (
            <button
              key={tEntry.id}
              type="button"
              onClick={() => setTab(tEntry.id)}
              class={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                tab === tEntry.id
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-800/60 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-800 dark:hover:text-white'
              }`}
            >
              {tEntry.label}
            </button>
          ))}
        </nav>

        {/* Content card */}
        <section class="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
      {tab === 'providers' && <ProvidersTab />}
      {tab === 'models' && <ModelsTab />}
      {tab === 'memory' && <MemoryTab />}
      {tab === 'mcp' && <McpTab />}
      {tab === 'mcp_server' && <McpServerTab />}
      {tab === 'backup' && <BackupTab />}
      {tab === 'general' && <GeneralTab />}
      {tab === 'features' && <FeaturesTab />}
      {tab === 'skills' && <SkillsTab />}
      {tab === 'sites' && <SitesTab />}
      {tab === 'playground' && <PlaygroundTab />}
        </section>

        {/* Footer / Sponsorship Section */}
        <footer class="mt-10 flex flex-col items-center gap-3 text-center text-xs text-gray-500 dark:text-gray-400">
          <p>
            BrowseCortex is open-source. If you enjoy using it, please consider supporting the
            project!
          </p>
          <a
            href="https://paypal.me/akmia51"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 rounded-full bg-blue-600/10 px-4 py-2 font-medium text-blue-600 transition-colors hover:bg-blue-600/20 dark:text-blue-400"
          >
            <Icon name="sparkle" size={14} />
            Support on PayPal
          </a>
        </footer>
      </div>
    </div>
  );
}
