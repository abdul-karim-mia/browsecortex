import React, { useState } from 'react';

type ArticleKey = 'quickstart' | 'providers' | 'concepts' | 'mcp';

interface Article {
  title: string;
  render: () => React.ReactNode;
}

export function Docs() {
  const [activeArticle, setActiveArticle] = useState<ArticleKey>('quickstart');

  const articles: Record<ArticleKey, Article> = {
    quickstart: {
      title: 'Quick Start Guide',
      render: () => (
        <article className="docs-article">
          <h2>Getting Started with BrowseCortex</h2>
          <p>
            BrowseCortex is a private, local-first AI browser assistant. Because it is completely open source and runs entirely on your own system, you need to load the extension files manually into Chrome and hook up your own AI API keys.
          </p>

          <h3>1. Installation</h3>
          <ol>
            <li>
              Navigate to the{' '}
              <a href="https://github.com/abdul-karim-mia/browsecortex/releases" target="_blank" rel="noopener noreferrer">
                Latest Releases
              </a>{' '}
              page and download the packaged extension zip (e.g., <code>browsecortex-extension.zip</code>).
            </li>
            <li>Extract the downloaded zip archive to a local folder on your computer.</li>
            <li>Open Google Chrome (or any Chromium-based browser like Brave or Edge) and navigate to <code>chrome://extensions</code>.</li>
            <li>Enable the <strong>Developer mode</strong> toggle located in the top-right corner of the page.</li>
            <li>Click the <strong>Load unpacked</strong> button in the top-left and select the extracted extension folder.</li>
          </ol>

          <div className="note-callout">
            <div className="note-callout-title">Keyboard Shortcuts</div>
            <p>
              • <strong>Toggle side panel</strong>: <code>Ctrl+Shift+B</code> (Mac: <code>Cmd+Shift+B</code>)<br/>
              • <strong>Start new conversation</strong>: <code>Ctrl+Shift+N</code> (Mac: <code>Cmd+Shift+N</code>)<br/>
              • <strong>Inline Assist editor</strong>: <code>Ctrl+Shift+K</code> inside any text area
            </p>
          </div>

          <h3>2. Setup Your First AI Provider</h3>
          <p>
            Once installed, click the BrowseCortex brain icon in your browser toolbar to open the extension side panel.
          </p>
          <ol>
            <li>Click the gear icon in the top-right of the panel to open <strong>Settings</strong>.</li>
            <li>Go to the <strong>Providers</strong> tab.</li>
            <li>Choose a popular provider (e.g. Google Gemini, OpenAI, or a local server like Ollama) and click <strong>Add Provider</strong>.</li>
            <li>Enter your API key and base URL (presets are provided). Then, click <strong>Test Connection</strong> to verify it works.</li>
            <li>Go to the <strong>Models</strong> tab, select your preferred model, and test its tool-calling capabilities.</li>
          </ol>

          <h3>3. Run a Task</h3>
          <p>
            Close settings, type an instruction (e.g. <em>"Go to wikipedia.org, search for 'Artificial Intelligence', and summarize the introduction into a text file"</em>) and press Enter. The agent will plan and execute the task step-by-step.
          </p>
        </article>
      ),
    },
    providers: {
      title: 'AI Providers & Tuning',
      render: () => (
        <article className="docs-article">
          <h2>Configuring AI Providers</h2>
          <p>
            BrowseCortex operates as a bring-your-own-key agent. It communicates with any AI engine exposing an OpenAI-compatible <code>/chat/completions</code> endpoint.
          </p>

          <h3>Supported Endpoint Presets</h3>
          <ul>
            <li><strong>OpenAI</strong>: Base URL: <code>https://api.openai.com/v1</code></li>
            <li><strong>Google AI / Gemini</strong>: Base URL: <code>https://generativelanguage.googleapis.com/v1beta/openai/</code></li>
            <li><strong>Groq (High Speed)</strong>: Base URL: <code>https://api.groq.com/openai/v1</code></li>
            <li><strong>DeepSeek</strong>: Base URL: <code>https://api.deepseek.com/v1</code></li>
            <li><strong>Mistral AI</strong>: Base URL: <code>https://api.mistral.ai/v1</code></li>
            <li><strong>OpenRouter (Proxy)</strong>: Base URL: <code>https://openrouter.ai/api/v1</code> (allows using Anthropic models like Claude)</li>
            <li><strong>Ollama (Local Offline)</strong>: Base URL: <code>http://localhost:11434/v1</code></li>
            <li><strong>LM Studio (Local Offline)</strong>: Base URL: <code>http://localhost:1234/v1</code></li>
          </ul>

          <h3>Tool Calling Requirement</h3>
          <p>
            BrowseCortex relies on tool/function calling to act on the browser. Make sure the model you select supports tool calling. You can verify this by using the <strong>Test capabilities</strong> button on the Models settings tab.
          </p>

          <h3>Rate-Limiting Cooldowns</h3>
          <p>
            If a provider returns an HTTP 429 rate limit error, BrowseCortex puts the provider on a cooldown. It will respect the provider's <code>Retry-After</code> header, or fallback to an exponential backoff.
          </p>

          <h3>Fallback Provider Routing</h3>
          <p>
            You can configure a <strong>Fallback Provider</strong> for each of your primary providers. If your main provider gets rate-limited, the agent will automatically re-route requests to the fallback endpoint to keep the loop running uninterrupted.
          </p>

          <h3>Vision Fallback</h3>
          <p>
            If a selected model does not natively support vision (e.g. a local Llama text model), you can designate a secondary <strong>Vision Model</strong> (like GPT-4o or Gemini Flash). Whenever the agent captures a page screenshot, it will route the image to the designated vision model for interpretation.
          </p>
        </article>
      ),
    },
    concepts: {
      title: 'Core Architecture',
      render: () => (
        <article className="docs-article">
          <h2>Core Concepts & Architecture</h2>
          <p>
            BrowseCortex consists of a planning-and-execution loop running in a Service Worker background script, coordinating browser automation APIs under a zero-trust model.
          </p>

          <h3>1. The Agent Loop</h3>
          <p>
            When you type a command, the agent begins a cyclic loop:
          </p>
          <ol>
            <li><strong>Plan</strong>: The AI model receives your goal, inspects its available tools, and decides which action to take.</li>
            <li><strong>Act</strong>: The background worker executes the chosen tool (e.g., navigating tabs, zipping files, clicking coordinates).</li>
            <li><strong>Observe</strong>: The tool's output is packed as observation turns and returned to the model.</li>
            <li><strong>Compaction</strong>: If the history grows too long, older chat turns are tokenized and summarized, maintaining the active task context.</li>
          </ol>

          <h3>2. Page Annotator</h3>
          <p>
            Feeding raw page HTML into an LLM wastes thousands of tokens. BrowseCortex uses a <code>page-spy</code> content script to number all interactive elements with high-contrast badges (e.g. <code>[1]</code>, <code>[2]</code>) and returns a lightweight coordinate map. The AI clicks elements by referencing these simple IDs, keeping token overhead minimal.
          </p>

          <h3>3. Virtual VFS Sandbox</h3>
          <p>
            The agent has access to a secure, sandboxed workspace filesystem stored locally in your browser's IndexedDB. The agent can write text summaries, crawl pages, extract table CSVs, create directories, and compress directories into zip files. To get files onto your physical machine, use the <code>fs_export</code> tool, which transfers the file to your standard Downloads folder.
          </p>

          <h3>4. Safety Policies</h3>
          <p>
            BrowseCortex includes three user safety levels:
          </p>
          <ul>
            <li><strong>Full Auto</strong>: The agent executes all tools (including typing and submitting forms) without asking.</li>
            <li><strong>Confirm Destructive</strong>: The agent runs read-only tasks automatically, but prompts for permission before taking actions like deleting files, closing user tabs, or clearing cookies.</li>
            <li><strong>Notify Only</strong>: The agent stops and requests confirmation before executing <em>any</em> tool call.</li>
          </ul>
        </article>
      ),
    },
    mcp: {
      title: 'Model Context Protocol',
      render: () => (
        <article className="docs-article">
          <h2>Model Context Protocol (MCP)</h2>
          <p>
            BrowseCortex supports the Model Context Protocol in both directions: it can consume tools from external MCP servers, and it can expose its own browser control tools to external agents.
          </p>

          <h3>1. Consuming MCP Tools</h3>
          <p>
            You can connect external MCP servers in the <strong>MCP</strong> tab under Settings.
          </p>
          <ul>
            <li>Supports standard SSE (Server-Sent Events) HTTP URLs (e.g. <code>http://localhost:3000/sse</code>).</li>
            <li>You can provide custom bearer tokens for authentication.</li>
            <li>Tools imported from the server are namespaced as <code>mcp__&lt;server&gt;__&lt;tool&gt;</code> to avoid conflicts with built-in tools.</li>
            <li>You can toggle individual server tools on or off.</li>
          </ul>

          <h3>2. BrowseCortex as an MCP Server</h3>
          <p>
            You can drive your real browser from command line agents (like Claude Code) or IDEs by exposing BrowseCortex itself as an MCP server.
          </p>
          <p>
            Enable this feature under Settings → <strong>MCP Server</strong>.
          </p>
          <div className="code-block-wrapper">
            <div className="code-block-header">
              <span>Terminal Command</span>
            </div>
            <pre>npx browsecortex-relay --port 7822 --token &lt;your-token&gt;</pre>
          </div>
          <p>
            The extension connects to the local relay server over WebSockets, and the relay translates that connection into standard MCP Server SSE endpoints (default: <code>http://localhost:7822/sse</code>) for your command-line agent.
          </p>

          <h3>Relay Security Policies</h3>
          <ul>
            <li><strong>Restricted Access</strong>: Only accepts connections matching the secure token shown in your settings panel.</li>
            <li><strong>Safe Tools Flag</strong>: Toggling "Safe tools only" blocks external agents from calling destructive tools (like zipping, deleting, or cookie wiping) and arbitrary code engines (like <code>run_javascript</code>).</li>
          </ul>
        </article>
      ),
    },
  };

  return (
    <section className="section-docs">
      <div className="container docs-layout">
        {/* Sidebar Nav */}
        <aside className="docs-sidebar">
          <div className="sidebar-title">Documentation</div>
          <div className="sidebar-nav">
            {(Object.keys(articles) as ArticleKey[]).map((key) => (
              <button
                key={key}
                className={`sidebar-btn ${activeArticle === key ? 'active' : ''}`}
                onClick={() => setActiveArticle(key)}
              >
                {articles[key].title}
              </button>
            ))}
          </div>
        </aside>

        {/* Article content */}
        <main className="docs-content">{articles[activeArticle].render()}</main>
      </div>
    </section>
  );
}
