import { useState, useEffect, useRef } from 'react';
import { Page } from '../App';

interface Contributor {
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
}

interface HomeProps {
  onNavigate: (page: Page) => void;
  downloadUrl: string;
}

interface SimStep {
  tab: 'extension' | 'browser';
  url?: string;
  status: string;
  showDots: boolean;
  action: (chatEl: HTMLDivElement | null, viewportEl: HTMLDivElement | null) => void;
  delay: number;
}

export function Home({ onNavigate, downloadUrl }: HomeProps) {
  const [activeTab, setActiveTab] = useState<'extension' | 'browser'>('extension');
  const [simStatus, setSimStatus] = useState('Analyzing user request...');
  const [showDots, setShowDots] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stats, setStats] = useState({ stars: '12', forks: '3', issues: '0' });
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [openCap, setOpenCap] = useState<string | null>(null);

  const chatRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch GitHub stars & contributors
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const repoRes = await fetch('https://api.github.com/repos/abdul-karim-mia/browsecortex');
        if (repoRes.ok) {
          const data = await repoRes.json();
          setStats({
            stars: String(data.stargazers_count ?? '12'),
            forks: String(data.forks_count ?? '3'),
            issues: String(data.open_issues_count ?? '0'),
          });
        }

        const contribRes = await fetch('https://api.github.com/repos/abdul-karim-mia/browsecortex/contributors');
        if (contribRes.ok) {
          const list = await contribRes.json();
          if (Array.isArray(list)) {
            setContributors(list.slice(0, 12));
          }
        }
      } catch (err) {
        console.warn('Failed to load home statistics:', err);
      }
    };
    fetchStats();
  }, []);

  // Simulator sequence steps
  const simulationSequence: SimStep[] = [
    {
      tab: 'extension',
      status: 'Analyzing user request...',
      showDots: true,
      action: (chat, _viewport) => {
        if (chat) {
          chat.innerHTML = `
            <div class="chat-message user animate-fade-in">
              <div class="avatar">U</div>
              <div class="msg-body">Find the best tech events in San Francisco happening this week and compile them into a text file.</div>
            </div>
          `;
        }
      },
      delay: 2500,
    },
    {
      tab: 'extension',
      status: 'Executing: navigate_to',
      showDots: false,
      action: (chat, _viewport) => {
        if (chat) {
          const row = document.createElement('div');
          row.className = 'tool-run-row animate-fade-in';
          row.innerHTML = `
            <span>Call: <span class="tool-name">navigate_to({ url: 'google.com' })</span></span>
            <span class="tool-status">Running...</span>
          `;
          chat.appendChild(row);
          chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
        }
      },
      delay: 1500,
    },
    {
      tab: 'browser',
      url: 'https://www.google.com',
      status: 'Loading page...',
      showDots: true,
      action: (chat, viewport) => {
        const lastRowStatus = chat?.querySelector('.tool-run-row:last-child .tool-status');
        if (lastRowStatus) lastRowStatus.textContent = 'Success';

        if (viewport) {
          viewport.innerHTML = `
            <div class="browser-page-google animate-fade-in">
              <div class="google-logo">
                <span style="color:#4285F4">G</span>
                <span style="color:#EA4335">o</span>
                <span style="color:#FBBC05">o</span>
                <span style="color:#4285F4">g</span>
                <span style="color:#34A853">l</span>
                <span style="color:#EA4335">e</span>
              </div>
              <div class="google-search-container">
                <span><span class="element-badge">[1]</span> san francisco tech events this week</span>
                <span>🔍</span>
              </div>
            </div>
          `;
        }
      },
      delay: 2500,
    },
    {
      tab: 'extension',
      status: 'Executing: click_element',
      showDots: false,
      action: (chat, _viewport) => {
        if (chat) {
          const row = document.createElement('div');
          row.className = 'tool-run-row animate-fade-in';
          row.innerHTML = `
            <span>Call: <span class="tool-name">click_element({ annotation_id: 1 })</span></span>
            <span class="tool-status">Running...</span>
          `;
          chat.appendChild(row);
          chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
        }
      },
      delay: 1500,
    },
    {
      tab: 'browser',
      url: 'https://www.google.com/search?q=sf+tech+events',
      status: 'Navigating...',
      showDots: true,
      action: (chat, viewport) => {
        const lastRowStatus = chat?.querySelector('.tool-run-row:last-child .tool-status');
        if (lastRowStatus) lastRowStatus.textContent = 'Success';

        if (viewport) {
          viewport.innerHTML = `
            <div class="browser-page-results animate-fade-in">
              <div class="result-card">
                <h4><span class="element-badge">[1]</span> SF Tech Events — June 2026 Listings</h4>
                <p>Top networking nights, hardware demos, and developer meetups happening in SOMA this week.</p>
              </div>
              <div class="result-card">
                <h4><span class="element-badge">[2]</span> AI Innovators Forum (June 24)</h4>
                <p>Join top researchers and engineers at the annual SF AI Forum in downtown San Francisco.</p>
              </div>
            </div>
          `;
        }
      },
      delay: 2500,
    },
    {
      tab: 'extension',
      status: 'Compiling results...',
      showDots: true,
      action: (chat, _viewport) => {
        if (chat) {
          const rowRead = document.createElement('div');
          rowRead.className = 'tool-run-row animate-fade-in';
          rowRead.innerHTML = `
            <span>Call: <span class="tool-name">read_page_content()</span></span>
            <span class="tool-status">Success</span>
          `;
          chat.appendChild(rowRead);

          const rowWrite = document.createElement('div');
          rowWrite.className = 'tool-run-row animate-fade-in';
          rowWrite.style.marginTop = '4px';
          rowWrite.innerHTML = `
            <span>Call: <span class="tool-name">fs_create_file({ path: '/sf-events.txt' })</span></span>
            <span class="tool-status">Success</span>
          `;
          chat.appendChild(rowWrite);
          chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
        }
      },
      delay: 2000,
    },
    {
      tab: 'extension',
      status: 'Task completed',
      showDots: false,
      action: (chat, _viewport) => {
        if (chat) {
          const rowAnswer = document.createElement('div');
          rowAnswer.className = 'chat-message assistant animate-fade-in';
          rowAnswer.innerHTML = `
            <div class="avatar">A</div>
            <div class="msg-body">
              I have compiled the SF tech events into a text file at <span class="tool-name">/sf-events.txt</span>. 
              Key events include:<br/>
              • <strong>SF Tech Events Listings</strong> (Networking & Hardware)<br/>
              • <strong>AI Innovators Forum</strong> (Downtown SF, June 24)
            </div>
          `;
          chat.appendChild(rowAnswer);
          chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
        }
      },
      delay: 4500,
    },
  ];

  // Simulator driving hook
  useEffect(() => {
    if (!isPlaying) return;

    const runStep = () => {
      const step = simulationSequence[currentStepIndex];
      setActiveTab(step.tab);
      setSimStatus(step.status);
      setShowDots(step.showDots);
      step.action(chatRef.current, viewportRef.current);

      timerRef.current = setTimeout(() => {
        setCurrentStepIndex((prev) => (prev + 1) % simulationSequence.length);
      }, step.delay);
    };

    runStep();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, currentStepIndex]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (chatRef.current) chatRef.current.innerHTML = '';
    if (viewportRef.current) viewportRef.current.innerHTML = '';
    setCurrentStepIndex(0);
    setIsPlaying(true);
  };

  const toggleCap = (capName: string) => {
    setOpenCap(openCap === capName ? null : capName);
  };

  return (
    <div>
      {/* Hero Section */}
      <section className="section-hero">
        <div className="container hero-container">
          <div className="hero-text-content">
            <div className="badge-container">
              <span className="hero-badge">🚀 Private AI Browser Agent</span>
              <a href="https://abdulkarimmia.in" target="_blank" rel="noopener noreferrer" className="creator-badge-link">
                <span className="creator-badge">By Abdul karim mia</span>
              </a>
            </div>
            <h1 className="hero-title">
              Your Web Browser.<br />
              <span className="text-gradient">Driven by AI.</span>
            </h1>
            <p className="hero-subtitle">
              BrowseCortex is an open-source Chrome extension giving you a persistent AI companion with autonomous browser control. Bring your own AI provider (OpenAI, Gemini, Groq, Ollama) and let it work for you.
            </p>
            <div className="hero-actions">
              <a href={downloadUrl} className="btn btn-primary btn-lg">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="M7 10l5 5 5-5" />
                  <path d="M12 15V3" />
                </svg>
                Install for Chrome
              </a>
              <span className="btn btn-secondary btn-lg" onClick={() => onNavigate('docs')}>
                Read Documentation
              </span>
            </div>
            <div className="hero-bullets">
              <div className="bullet-item">
                <svg className="bullet-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 5 12" />
                </svg>
                <span>No Vendor Lock-in</span>
              </div>
              <div className="bullet-item">
                <svg className="bullet-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 5 12" />
                </svg>
                <span>Local & Private</span>
              </div>
              <div className="bullet-item">
                <svg className="bullet-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 5 12" />
                </svg>
                <span>MCP Connected</span>
              </div>
            </div>
          </div>

          {/* Interactive Simulator Area */}
          <div className="hero-visual">
            <div className="simulator-wrapper glass">
              <div className="simulator-header">
                <div className="window-controls">
                  <span className="control red" onClick={handleReset} style={{ cursor: 'pointer' }} title="Reset Simulation"></span>
                  <span className="control yellow" onClick={handlePlayPause} style={{ cursor: 'pointer' }} title={isPlaying ? 'Pause' : 'Play'}></span>
                  <span className="control green"></span>
                </div>
                <div className="simulator-tabs" role="tablist">
                  <button
                    className={`sim-tab ${activeTab === 'extension' ? 'active' : ''}`}
                    onClick={() => setActiveTab('extension')}
                  >
                    BrowseCortex Panel
                  </button>
                  <button
                    className={`sim-tab ${activeTab === 'browser' ? 'active' : ''}`}
                    onClick={() => setActiveTab('browser')}
                  >
                    Browser Tab View
                  </button>
                </div>
              </div>
              
              <div className="simulator-content">
                {/* Tab 1: Extension Panel */}
                <div className={`panel-extension ${activeTab === 'extension' ? 'active' : ''}`}>
                  <div className="extension-header">
                    <div className="extension-title">
                      <span className="pulse-icon"></span>
                      <span>cortex-agent-loop</span>
                    </div>
                    <div className="provider-badge">Groq: llama3-70b</div>
                  </div>
                  <div className="chat-area" ref={chatRef}>
                    {/* Elements injected dynamically by simulator */}
                  </div>
                  <div className="input-toolbar-mock">
                    <div className="toolbar-left">
                      <span className="mock-btn-tool">✦ Skills</span>
                      <span className="mock-btn-tool">📎 Attach</span>
                    </div>
                    <div className="mock-input-field">
                      <span>{simStatus}</span>
                      {showDots && (
                        <div className="loader-dots">
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tab 2: Browser Mockup */}
                <div className={`panel-browser ${activeTab === 'browser' ? 'active' : ''}`}>
                  <div className="browser-address-bar">
                    <div className="nav-arrows">
                      <span className="arrow">&larr;</span>
                      <span className="arrow">&rarr;</span>
                      <span className="arrow">&#x21bb;</span>
                    </div>
                    <div className="address-input">
                      {simulationSequence[currentStepIndex]?.url || 'https://www.google.com'}
                    </div>
                    <div className="extension-indicator">🧠</div>
                  </div>
                  <div className="browser-viewport" ref={viewportRef}>
                    {/* Elements injected dynamically by simulator */}
                  </div>
                </div>
              </div>
            </div>

            <div className="sim-controls-row">
              <button className="sim-btn" onClick={handlePlayPause}>
                {isPlaying ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="4" y="4" width="4" height="16" />
                      <rect x="16" y="4" width="4" height="16" />
                    </svg>
                    Pause Simulation
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Resume Simulation
                  </>
                )}
              </button>
              <button className="sim-btn" onClick={handleReset}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                Reset
              </button>
              <span className="sim-progress-indicator">
                Step {currentStepIndex + 1} / {simulationSequence.length}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid Features Section */}
      <section className="section-features">
        <div className="container">
          <div className="section-header-center">
            <h2 className="section-title">Designed for Power. Built for Privacy.</h2>
            <p className="section-subtitle">
              A feature set engineered for complete independence and absolute browser control.
            </p>
          </div>
          
          <div className="bento-grid">
            {/* Feature 1 */}
            <div className="bento-card bento-w-2 glass hover-glow">
              <div className="card-icon-wrapper">
                <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
              </div>
              <h3 className="card-title">Bring Your Own Provider & Model Tuning</h3>
              <p className="card-text">
                Connect to OpenAI, Google Gemini, Mistral, xAI, Groq, or open local engines like Ollama and LM Studio. Toggle safety modes (Full Auto, Notify, Confirm Destructive), adjust reasoning parameters, and define safety caps for execution runs.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bento-card glass hover-glow" onClick={() => onNavigate('features')} style={{ cursor: 'pointer' }}>
              <div className="card-icon-wrapper">
                <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
              </div>
              <h3 className="card-title">100+ Core Browser Tools &rarr;</h3>
              <p className="card-text">
                Equipped with rich tools covering browser tabs manipulation, advanced navigation, history audits, bookmark folders, alarms, offscreen text detector OCR, and system notification overlays.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bento-card glass hover-glow">
              <div className="card-icon-wrapper">
                <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h3 className="card-title">Virtual Sandboxed Filesystem</h3>
              <p className="card-text">
                Allows the agent to write, read, search, rename, zip, and export files safely within a local sandboxed space built on IndexedDB, preventing direct access to your physical computer drives.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bento-card bento-w-2 glass hover-glow">
              <div className="card-icon-wrapper">
                <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5a3 3 0 0 0-5.6-1.5A2.5 2.5 0 0 0 4 6.5 2.5 2.5 0 0 0 4 11a2.5 2.5 0 0 0 2.5 2.5A3 3 0 0 0 12 12V5Zm0 0a3 3 0 0 1 5.6-1.5A2.5 2.5 0 0 1 20 6.5 2.5 2.5 0 0 1 20 11a2.5 2.5 0 0 1-2.5 2.5A3 3 0 0 1 12 12" />
                </svg>
              </div>
              <h3 className="card-title">Context Compaction & Page Annotation</h3>
              <p className="card-text">
                BrowseCortex automatically summarizes older parts of your conversations to prevent token bloat. Additionally, its page annotator maps page elements with numbered badges, allowing the AI to interact with the DOM without feeding raw HTML back to the provider.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bento-card bento-w-2 glass hover-glow">
              <div className="card-icon-wrapper">
                <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="5" cy="6" r="3" />
                  <circle cx="19" cy="6" r="3" />
                  <circle cx="12" cy="18" r="3" />
                  <path d="M5 9v1a2 2 0 0 0 2 2h3" />
                  <path d="M19 9v1a2 2 0 0 1-2 2h-3" />
                  <path d="M12 12v3" />
                </svg>
              </div>
              <h3 className="card-title">Specialized Subagent Delegation</h3>
              <p className="card-text">
                Delegate sub-tasks to isolated, specialized subagents: <strong>Researcher</strong> (read-only investigator), <strong>Summarizer</strong> (condenses pages in-place), and <strong>Form Filler</strong>. Each runs in a clean context window and reports findings back to keep the parent loop lightweight.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bento-card glass hover-glow github-stats-card">
              <h3 className="card-title">Project Health</h3>
              <p className="card-text mb-4">
                BrowseCortex is actively maintained and built out by the developer community. Live stats:
              </p>
              <div className="github-stats-bento">
                <div className="stat-bento-item">
                  <span className="stat-bento-val">{stats.stars}</span>
                  <span className="stat-bento-lbl">Stars</span>
                </div>
                <div className="stat-bento-item">
                  <span className="stat-bento-val">{stats.forks}</span>
                  <span className="stat-bento-lbl">Forks</span>
                </div>
                <div className="stat-bento-item">
                  <span className="stat-bento-val">{stats.issues}</span>
                  <span className="stat-bento-lbl">Issues</span>
                </div>
              </div>
            </div>

            {/* Feature 7 */}
            <div className="bento-card glass hover-glow creator-card-bento">
              <div className="card-icon-wrapper creator-icon-wrap">
                <svg className="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2c.4 2.6 1 4.6 2.2 5.8S17.4 9.6 20 10c-2.6.4-4.6 1-5.8 2.2S12.4 15.4 12 18c-.4-2.6-1-4.6-2.2-5.8S6.6 10.4 4 10c2.6-.4 4.6-1 5.8-2.2S11.6 4.6 12 2Z" />
                </svg>
              </div>
              <h3 className="card-title">Creator & Lead Architect</h3>
              <p className="card-text">
                BrowseCortex was designed and built by fullstack engineer <strong>Abdul karim mia</strong>. You can find his developer portfolio, code blog, and other projects at:
              </p>
              <a href="https://abdulkarimmia.in" target="_blank" rel="noopener noreferrer" className="creator-portfolio-link">
                abdulkarimmia.in &rarr;
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Advanced Core Capabilities Section */}
      <section className="section-capabilities">
        <div className="container">
          <div className="section-header-center">
            <h2 className="section-title">Advanced Core Capabilities</h2>
            <p className="section-subtitle">
              A closer look at the advanced extension mechanics running under the hood. (Click to expand details)
            </p>
          </div>

          <div className="capabilities-grid">
            {/* Cap 1 */}
            <div className={`capability-card glass ${openCap === 'mcp' ? 'active' : ''}`} onClick={() => toggleCap('mcp')}>
              <div className="cap-header-row">
                <div className="cap-icon-wrapper">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2c.4 2.6 1 4.6 2.2 5.8S17.4 9.6 20 10c-2.6.4-4.6 1-5.8 2.2S12.4 15.4 12 18c-.4-2.6-1-4.6-2.2-5.8S6.6 10.4 4 10c2.6-.4 4.6-1 5.8-2.2S11.6 4.6 12 2Z" />
                  </svg>
                </div>
                <span className="cap-toggle-btn">{openCap === 'mcp' ? '−' : '+'}</span>
              </div>
              <h3 className="cap-title">Model Context Protocol (MCP)</h3>
              <p className="cap-text">
                Integrate local and remote MCP servers directly. BrowseCortex dynamically consumes external server schemas, injecting custom tool capabilities directly into the active agent loop.
              </p>
              <div className="cap-details">
                <ul className="cap-details-list">
                  <li>Connects local stdio/SSE servers via the Node.js WebSocket relay</li>
                  <li>Supports remote HTTPS/SSE MCP tool integrations</li>
                  <li>Autoloads schemas and injects tools dynamically into LLM prompts</li>
                </ul>
              </div>
            </div>

            {/* Cap 2 */}
            <div className={`capability-card glass ${openCap === 'failover' ? 'active' : ''}`} onClick={() => toggleCap('failover')}>
              <div className="cap-header-row">
                <div className="cap-icon-wrapper">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                  </svg>
                </div>
                <span className="cap-toggle-btn">{openCap === 'failover' ? '−' : '+'}</span>
              </div>
              <h3 className="cap-title">Smart Cooldowns & Failovers</h3>
              <p className="cap-text">
                Automatic rate-limiting failover routing. If a provider returns a 429 backoff error, the agent places that endpoint on cooldown and automatically routes execution to alternative APIs.
              </p>
              <div className="cap-details">
                <ul className="cap-details-list">
                  <li>Detects HTTP 429 and rate-limiting responses immediately</li>
                  <li>Applies exponential cooldown backoff times (up to 5 minutes)</li>
                  <li>Intelligently fails over to secondary user-configured models</li>
                </ul>
              </div>
            </div>

            {/* Cap 3 */}
            <div className={`capability-card glass ${openCap === 'vision' ? 'active' : ''}`} onClick={() => toggleCap('vision')}>
              <div className="cap-header-row">
                <div className="cap-icon-wrapper">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
                <span className="cap-toggle-btn">{openCap === 'vision' ? '−' : '+'}</span>
              </div>
              <h3 className="cap-title">Intelligent Vision Fallbacks</h3>
              <p className="cap-text">
                If your primary text model does not support vision, the agent automatically intercepts visual analysis requests and routes page frames to a secondary vision model.
              </p>
              <div className="cap-details">
                <ul className="cap-details-list">
                  <li>Leverages LiteLLM tags to verify model capabilities</li>
                  <li>Screens viewport regions locally via the extension APIs</li>
                  <li>Sends base64 screenshots to secondary vision nodes automatically</li>
                </ul>
              </div>
            </div>

            {/* Cap 4 */}
            <div className={`capability-card glass ${openCap === 'inpage' ? 'active' : ''}`} onClick={() => toggleCap('inpage')}>
              <div className="cap-header-row">
                <div className="cap-icon-wrapper">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                  </svg>
                </div>
                <span className="cap-toggle-btn">{openCap === 'inpage' ? '−' : '+'}</span>
              </div>
              <h3 className="cap-title">In-Page Assist Integrations</h3>
              <p className="cap-text">
                Works on any web page with lightweight visual interfaces including contextual toolbar highlights, inline text input editors, and floating summaries.
              </p>
              <div className="cap-details">
                <ul className="cap-details-list">
                  <li><strong>Highlight Toolbar</strong>: Selected text translates, rewrites, or reads aloud</li>
                  <li><strong>Inline Assist (Ctrl+Shift+K)</strong>: Text field replacement using prompt templates</li>
                  <li><strong>Floating Bubble</strong>: Bottom-right icon summarizes articles with one click</li>
                  <li><strong>AI Email Reply</strong>: Integrates with Gmail, Outlook, Proton Mail, Zoho, and more</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contributors Grid Section */}
      <section className="section-contributors">
        <div className="container">
          <div className="section-header-center">
            <h2 className="section-title">Project Contributors</h2>
            <p className="section-subtitle">
              Special thanks to the developers helping build and expand the BrowseCortex agent engine.
            </p>
          </div>

          <div className="contributors-grid">
            {contributors.length > 0 ? (
              contributors.map((c) => (
                <a
                  key={c.login}
                  className="contributor-item animate-fade-in"
                  href={c.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${c.login} (${c.contributions} contributions)`}
                >
                  <img
                    src={c.avatar_url}
                    alt={c.login}
                    className="contributor-avatar"
                    width="40"
                    height="40"
                    loading="lazy"
                  />
                  <span className="contributor-name">{c.login}</span>
                </a>
              ))
            ) : (
              <a
                className="contributor-item animate-fade-in"
                href="https://github.com/abdul-karim-mia"
                target="_blank"
                rel="noopener noreferrer"
                title="Abdul karim mia"
              >
                <img
                  src="https://github.com/abdul-karim-mia.png"
                  alt="Abdul karim mia"
                  className="contributor-avatar"
                  width="40"
                  height="40"
                />
                <span className="contributor-name">Abdul karim mia</span>
              </a>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
