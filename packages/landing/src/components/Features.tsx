import { useState } from 'react';

interface Tool {
  name: string;
  category: string;
  description: string;
  params: Record<string, string>;
  safety: 'safe' | 'destructive' | 'read-external';
  timeout: string;
}

const TOOLS_DATABASE: Tool[] = [
  // Navigation
  {
    name: 'navigate_to',
    category: 'Navigation',
    description: 'Navigate the active tab (or a given tab) to a URL. Automatically checks domain validity and prepends https:// if missing.',
    params: { url: 'string (e.g. google.com)', tab_id: 'number (optional)' },
    safety: 'safe',
    timeout: 'navigation (15s)'
  },
  {
    name: 'go_back',
    category: 'Navigation',
    description: 'Navigate back in the active tab history. Implemented via history.back() script injection to ensure reliability in Service Workers.',
    params: { tab_id: 'number (optional)' },
    safety: 'safe',
    timeout: 'navigation (15s)'
  },
  {
    name: 'go_forward',
    category: 'Navigation',
    description: 'Navigate forward in the active tab history.',
    params: { tab_id: 'number (optional)' },
    safety: 'safe',
    timeout: 'navigation (15s)'
  },
  {
    name: 'wait_for_page_load',
    category: 'Navigation',
    description: 'Wait until the tab finishes loading (document ready state is complete). Useful when navigating to slow pages.',
    params: { tab_id: 'number (optional)' },
    safety: 'safe',
    timeout: 'navigation (15s)'
  },
  {
    name: 'wait_for_network_idle',
    category: 'Navigation',
    description: 'Wait until network activity goes quiet (no new resource requests for ~1s). Highly recommended for heavy Single Page Applications (SPAs).',
    params: { tab_id: 'number (optional)', timeout: 'number (ms, optional)' },
    safety: 'safe',
    timeout: 'network_idle (10s)'
  },

  // Tabs
  {
    name: 'open_tab',
    category: 'Tabs',
    description: 'Open a new tab at the given URL and focus it.',
    params: { url: 'string' },
    safety: 'safe',
    timeout: 'tab (5s)'
  },
  {
    name: 'close_tab',
    category: 'Tabs',
    description: 'Close a tab by its ID. Triggers confirmation if closing a user-opened tab.',
    params: { tab_id: 'number' },
    safety: 'destructive',
    timeout: 'tab (5s)'
  },
  {
    name: 'get_active_tab',
    category: 'Tabs',
    description: 'Get the details (ID, title, URL) of the currently active tab.',
    params: {},
    safety: 'safe',
    timeout: 'instant (5s)'
  },
  {
    name: 'get_all_tabs',
    category: 'Tabs',
    description: 'List all open tabs across all browser windows.',
    params: {},
    safety: 'safe',
    timeout: 'instant (5s)'
  },
  {
    name: 'switch_to_tab',
    category: 'Tabs',
    description: 'Focus an existing browser tab by its ID.',
    params: { tab_id: 'number' },
    safety: 'safe',
    timeout: 'tab (5s)'
  },
  {
    name: 'group_tabs',
    category: 'Tabs',
    description: 'Group one or more tabs together, optionally assigning a title and color to the group.',
    params: { tab_ids: 'number[]', title: 'string (optional)', color: 'string (optional)' },
    safety: 'safe',
    timeout: 'tab (5s)'
  },
  {
    name: 'ungroup_tabs',
    category: 'Tabs',
    description: 'Remove the specified tabs from their active tab group.',
    params: { tab_ids: 'number[]' },
    safety: 'safe',
    timeout: 'tab (5s)'
  },
  {
    name: 'pin_tab',
    category: 'Tabs',
    description: 'Pin or unpin a browser tab.',
    params: { tab_id: 'number', pinned: 'boolean' },
    safety: 'safe',
    timeout: 'tab (5s)'
  },

  // Page Read (Scraping)
  {
    name: 'read_page_content',
    category: 'Page Read',
    description: 'Read the main readable text content of the active tab. Automatically strips out scripts, CSS styling, and visual clutter. Web content is marked untrusted.',
    params: { tab_id: 'number (optional)' },
    safety: 'read-external',
    timeout: 'page_read (10s)'
  },
  {
    name: 'get_page_links',
    category: 'Page Read',
    description: 'Retrieve up to 100 links from the current web page, returning their visible text and href URLs.',
    params: { tab_id: 'number (optional)' },
    safety: 'read-external',
    timeout: 'page_read (10s)'
  },
  {
    name: 'get_page_metadata',
    category: 'Page Read',
    description: 'Extract structured metadata from the page, including Open Graph tags, Twitter cards, meta description, and JSON-LD markup.',
    params: { tab_id: 'number (optional)' },
    safety: 'read-external',
    timeout: 'page_read (10s)'
  },
  {
    name: 'extract_table_data',
    category: 'Page Read',
    description: 'Find and parse HTML tables on the page, returning them formatted as arrays of rows. Extracts up to 5 tables.',
    params: { tab_id: 'number (optional)', selector: 'string (optional)' },
    safety: 'read-external',
    timeout: 'page_read (10s)'
  },
  {
    name: 'find_text_on_page',
    category: 'Page Read',
    description: 'Check if a specific text string exists on the page, returning occurrences and surrounding sentence context.',
    params: { text: 'string', tab_id: 'number (optional)' },
    safety: 'read-external',
    timeout: 'page_read (10s)'
  },

  // Page Interact
  {
    name: 'annotate_page',
    category: 'Page Interact',
    description: 'Number all interactive components (buttons, links, inputs) with high-contrast [n] badges. Returns a list of element descriptions, tags, and types.',
    params: { tab_id: 'number (optional)' },
    safety: 'safe',
    timeout: 'page_interact (8s)'
  },
  {
    name: 'click_element',
    category: 'Page Interact',
    description: 'Click a page element by its annotation ID (from annotate_page), a CSS selector, visible text, or XPath. Prefer annotation ID for SPA routers.',
    params: { annotation_id: 'number (optional)', selector: 'string (optional)', text: 'string (optional)' },
    safety: 'safe',
    timeout: 'page_interact (8s)'
  },
  {
    name: 'fill_input',
    category: 'Page Interact',
    description: 'Set the value of an input field or textarea identified by CSS selector.',
    params: { selector: 'string', value: 'string', tab_id: 'number (optional)' },
    safety: 'safe',
    timeout: 'page_interact (8s)'
  },
  {
    name: 'select_dropdown',
    category: 'Page Interact',
    description: 'Select an option in a dropdown element (<select>) by its value or visible label.',
    params: { selector: 'string', value: 'string', tab_id: 'number (optional)' },
    safety: 'safe',
    timeout: 'page_interact (8s)'
  },
  {
    name: 'submit_form',
    category: 'Page Interact',
    description: 'Submit the form matching a CSS selector or the form containing the selected element.',
    params: { selector: 'string', tab_id: 'number (optional)' },
    safety: 'safe',
    timeout: 'page_interact (8s)'
  },

  // Debugger
  {
    name: 'debugger_click',
    category: 'Debugger',
    description: 'Perform viewport clicks at exact pixel coordinates (x, y) using Chrome DevTools Protocol events. Extremely reliable for canvas elements, interactive maps, or buttons that resist standard clicks.',
    params: { x: 'number', y: 'number', button: 'string (left/right/middle)', tab_id: 'number (optional)' },
    safety: 'safe',
    timeout: 'page_interact (8s)'
  },
  {
    name: 'debugger_type',
    category: 'Debugger',
    description: 'Type text into the active element using DevTools insertText event. Essential for rich editor panels (like Monaco or CodeMirror) that bypass standard DOM value setters.',
    params: { text: 'string', tab_id: 'number (optional)' },
    safety: 'safe',
    timeout: 'page_interact (8s)'
  },
  {
    name: 'upload_file',
    category: 'Debugger',
    description: 'Upload a local workspace file to an <input type="file"> field using debugger DOM nodes. Avoids OS prompt blocks.',
    params: { selector: 'string', file_path: 'string (absolute path)', tab_id: 'number (optional)' },
    safety: 'safe',
    timeout: 'page_interact (8s)'
  },

  // VFS (Filesystem)
  {
    name: 'fs_create_file',
    category: 'VFS Filesystem',
    description: 'Create a new text file inside the local conversation sandbox.',
    params: { path: 'string', content: 'string (optional)' },
    safety: 'safe',
    timeout: 'file (10s)'
  },
  {
    name: 'fs_read_file',
    category: 'VFS Filesystem',
    description: 'Read the contents of a file from the conversation sandbox.',
    params: { path: 'string' },
    safety: 'safe',
    timeout: 'file (10s)'
  },
  {
    name: 'fs_update_file',
    category: 'VFS Filesystem',
    description: 'Overwrite or append text content to an existing sandboxed file.',
    params: { path: 'string', content: 'string', append: 'boolean (optional)' },
    safety: 'safe',
    timeout: 'file (10s)'
  },
  {
    name: 'fs_delete_file',
    category: 'VFS Filesystem',
    description: 'Delete a file or folder (recursively) from the sandbox.',
    params: { path: 'string' },
    safety: 'destructive',
    timeout: 'file (10s)'
  },
  {
    name: 'fs_create_zip',
    category: 'VFS Filesystem',
    description: 'Zip sandbox files located under a path prefix and export the archive to the workspace.',
    params: { zip_path: 'string', source_prefix: 'string' },
    safety: 'safe',
    timeout: 'file (10s)'
  },
  {
    name: 'fs_export',
    category: 'VFS Filesystem',
    description: 'Export a sandboxed file to your physical computer Downloads directory.',
    params: { path: 'string', filename: 'string' },
    safety: 'safe',
    timeout: 'file (10s)'
  },

  // Memory
  {
    name: 'save_memory',
    category: 'Memory',
    description: 'Save user details, provider execution patterns, or conversation context in a persistent database to recall in future chat threads.',
    params: { fact: 'string', type: 'string (user/agent/global/conversation)' },
    safety: 'safe',
    timeout: 'instant (5s)'
  },
  {
    name: 'search_memories',
    category: 'Memory',
    description: 'Search persistently saved memories by keyword.',
    params: { query: 'string' },
    safety: 'safe',
    timeout: 'instant (5s)'
  },

  // OCR
  {
    name: 'ocr_tesseract',
    category: 'OCR',
    description: 'Run OCR on the active tab, a specific selector, or a base64 string using Tesseract.js. Fully local and offline-friendly.',
    params: { image: 'string (optional)', selector: 'string (optional)' },
    safety: 'read-external',
    timeout: 'page_read (10s)'
  },
  {
    name: 'ocr_native',
    category: 'OCR',
    description: 'Perform fast OCR using Chrome\'s hardware-accelerated TextDetector API. Requires enabling Experimental Web Platform features flags in Chrome.',
    params: { image: 'string (optional)', selector: 'string (optional)' },
    safety: 'read-external',
    timeout: 'page_read (10s)'
  },

  // Subagents
  {
    name: 'spawn_agent',
    category: 'Subagents',
    description: 'Delegate a standalone sub-task to a specialized subagent (General, Researcher, Summarizer, Form Filler). The subagent runs in its own context window to avoid token clutter.',
    params: { agent_type: 'string (general/researcher/summarizer/form_filler)', task: 'string' },
    safety: 'safe',
    timeout: 'instant (runs nested loop)'
  },

  // MCP
  {
    name: 'list_mcp_servers',
    category: 'MCP',
    description: 'List all connected and configured Model Context Protocol (MCP) servers, including URLs, tools count, and enabled state.',
    params: {},
    safety: 'safe',
    timeout: 'instant (5s)'
  },
  {
    name: 'connect_mcp_server',
    category: 'MCP',
    description: 'Connect a new MCP server. You can specify a server from the BrowseCortex directory, or connect a custom SSE URL.',
    params: { id: 'string (optional)', name: 'string (optional)', url: 'string (optional)', authToken: 'string (optional)' },
    safety: 'destructive',
    timeout: 'mcp (30s)'
  },
  {
    name: 'call_mcp_tool',
    category: 'MCP',
    description: 'Call a custom tool on an active external MCP server. Fetches tool definitions dynamically.',
    params: { server: 'string', tool: 'string', arguments: 'object' },
    safety: 'safe',
    timeout: 'mcp (30s)'
  },

  // Caching
  {
    name: 'cache_content',
    category: 'Caching',
    description: 'Store text data temporarily (TTL 1 hour) across tab navigation, page loads, or reloads. Useful for long multi-step workflows.',
    params: { key: 'string', value: 'string', tab_id: 'number (optional)' },
    safety: 'safe',
    timeout: 'instant (5s)'
  },
  {
    name: 'get_cached_content',
    category: 'Caching',
    description: 'Retrieve cached content by key. If key is omitted, returns a directory list of all cached values.',
    params: { key: 'string (optional)', tab_id: 'number (optional)' },
    safety: 'safe',
    timeout: 'instant (5s)'
  },

  // Task Management
  {
    name: 'create_task',
    category: 'Tasks',
    description: 'Create a progress task tracker. Visually rendering a checklist keeps the user informed and the agent structured.',
    params: { title: 'string', subtasks: 'string[] (optional)' },
    safety: 'safe',
    timeout: 'instant (5s)'
  },
  {
    name: 'update_task',
    category: 'Tasks',
    description: 'Update checklist state: check subtasks, alter progress percentages, or set notes.',
    params: { id: 'string', status: 'string', notes: 'string (optional)' },
    safety: 'safe',
    timeout: 'instant (5s)'
  },

  // Misc
  {
    name: 'ask_user',
    category: 'Misc',
    description: 'Pause the agent loop and prompt the user with questions. Prompts a desktop notification and service worker badge overlay.',
    params: { questions: 'any' },
    safety: 'safe',
    timeout: 'instant (waits for user input)'
  },
  {
    name: 'run_javascript',
    category: 'Misc',
    description: 'Execute arbitrary JavaScript expressions directly in the active tab context. Opt-in tool; blocked under strict safe tools relays.',
    params: { code: 'string' },
    safety: 'safe',
    timeout: 'instant (5s)'
  },
  {
    name: 'screenshot_tab',
    category: 'Misc',
    description: 'Capture a PNG screenshot of the visible viewport area of the active tab. Returns base64 representation.',
    params: { tab_id: 'number (optional)' },
    safety: 'safe',
    timeout: 'instant (5s)'
  },
  {
    name: 'create_backup',
    category: 'Misc',
    description: 'Export an encrypted backup (.browsecortex file) containing all providers, models, history, database credentials, and settings to your Downloads folder.',
    params: { password: 'string (min 8 chars)' },
    safety: 'safe',
    timeout: 'instant (5s)'
  }
];

export function Features() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const categories = ['All', ...Array.from(new Set(TOOLS_DATABASE.map((t) => t.category)))];

  const filteredTools = TOOLS_DATABASE.filter((tool) => {
    const matchesSearch =
      tool.name.toLowerCase().includes(search.toLowerCase()) ||
      tool.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'All' || tool.category === category;
    return matchesSearch && matchesCategory;
  });

  return (
    <section className="section-tools">
      <div className="container tools-layout">
        <div className="section-header-center" style={{ marginBottom: '40px' }}>
          <h2 className="section-title">Tools & Features Reference</h2>
          <p className="section-subtitle">
            BrowseCortex ships with over 100+ browser interaction tools. Search and filter below to discover what the AI agent can execute.
          </p>
        </div>

        {/* Filters Bar */}
        <div className="tools-filters-bar">
          <div className="tools-search-wrapper">
            <svg
              className="tools-search-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search tools by name, utility or description..."
              className="tools-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="tools-categories-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <span className="tools-count-pill">
            {filteredTools.length} Tools Found
          </span>
        </div>

        {/* Tools Grid */}
        <div className="tools-grid">
          {filteredTools.map((tool) => (
            <div key={tool.name} className="tool-card glass hover-glow">
              <div className="tool-card-header">
                <span className="tool-card-name">{tool.name}</span>
                <span className={`tool-badge ${tool.safety}`}>
                  {tool.safety}
                </span>
              </div>
              <p className="tool-card-desc">{tool.description}</p>
              
              <div className="tool-card-meta">
                <div className="tool-meta-row">
                  <span className="tool-meta-lbl">Category</span>
                  <span className="tool-meta-val" style={{ fontWeight: 600 }}>{tool.category}</span>
                </div>
                <div className="tool-meta-row">
                  <span className="tool-meta-lbl">Timeout</span>
                  <span className="tool-meta-val">{tool.timeout}</span>
                </div>
                
                {Object.keys(tool.params).length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <span className="tool-meta-lbl" style={{ display: 'block', marginBottom: '4px' }}>
                      Parameters:
                    </span>
                    <ul style={{ paddingLeft: '16px', listStyleType: 'circle', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {Object.entries(tool.params).map(([pName, pType]) => (
                        <li key={pName} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <code style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>{pName}</code>: {pType}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
