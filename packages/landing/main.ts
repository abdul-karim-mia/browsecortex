// --- GITHUB API INTEGRATION ---
async function fetchGithubStats() {
  const repoUrl = 'https://api.github.com/repos/abdul-karim-mia/browsecortex';
  const releaseUrl = 'https://api.github.com/repos/abdul-karim-mia/browsecortex/releases/latest';

  const starsPill = document.getElementById('github-stars-pill');
  const releaseTag = document.getElementById('github-release-tag');

  // Fetch Stars Count
  try {
    const response = await fetch(repoUrl);
    if (!response.ok) throw new Error('API Rate Limit or Offline');
    const data = await response.json();
    if (starsPill && typeof data.stargazers_count === 'number') {
      starsPill.textContent = `${data.stargazers_count} Stars`;
    }
  } catch (e) {
    console.warn('[GitHub Stats] Falling back to static placeholders:', e);
    if (starsPill) starsPill.textContent = 'Stars';
  }

  // Fetch Latest Release
  try {
    const response = await fetch(releaseUrl);
    if (!response.ok) throw new Error('API Rate Limit or Offline');
    const data = await response.json();
    if (releaseTag && data.tag_name) {
      releaseTag.textContent = data.tag_name;
    }
  } catch (e) {
    if (releaseTag) releaseTag.textContent = 'v1.0.0';
  }
}

// --- MOCK SIMULATOR LOGIC ---
const extPanel = document.getElementById('sim-panel-extension');
const browserPanel = document.getElementById('sim-panel-browser');
const tabExt = document.getElementById('btn-tab-extension');
const tabBrowser = document.getElementById('btn-tab-browser');

const chatMessages = document.getElementById('chat-messages');
const browserUrl = document.getElementById('browser-url');
const browserViewport = document.getElementById('browser-viewport-content');
const statusText = document.getElementById('simulator-status-text');
const dots = document.getElementById('simulator-dots');

// Helper to switch tabs visually
function switchTab(activeTab: 'extension' | 'browser') {
  if (activeTab === 'extension') {
    tabExt?.classList.add('active');
    tabBrowser?.classList.remove('active');
    extPanel?.classList.add('active');
    browserPanel?.classList.remove('active');
  } else {
    tabExt?.classList.remove('active');
    tabBrowser?.classList.add('active');
    extPanel?.classList.remove('active');
    browserPanel?.classList.add('active');
  }
}

// Simulated Step Sequence
interface SimStep {
  tab: 'extension' | 'browser';
  url?: string;
  status: string;
  showDots: boolean;
  action?: () => void;
  delay: number;
}

const simulationSequence: SimStep[] = [
  // 1. Initial State
  {
    tab: 'extension',
    status: 'Analyzing user request...',
    showDots: true,
    action: () => {
      if (chatMessages) {
        chatMessages.innerHTML = `
          <div class="chat-message user animate-fade-in">
            <div class="avatar">U</div>
            <div class="msg-body">Find the best tech events in San Francisco happening this week and compile them into a text file.</div>
          </div>
        `;
      }
    },
    delay: 2000,
  },
  // 2. Call tool: navigate
  {
    tab: 'extension',
    status: 'Executing: navigate_to',
    showDots: false,
    action: () => {
      const row = document.createElement('div');
      row.className = 'tool-run-row animate-fade-in';
      row.innerHTML = `
        <span>Call: <span class="tool-name">navigate_to({ url: 'google.com' })</span></span>
        <span class="tool-status">Running...</span>
      `;
      chatMessages?.appendChild(row);
      chatMessages?.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
    },
    delay: 1500,
  },
  // 3. Switch to browser, load Google search
  {
    tab: 'browser',
    url: 'https://www.google.com',
    status: 'Loading page...',
    showDots: true,
    action: () => {
      // Mark navigate tool as success in extension tab
      const lastRowStatus = chatMessages?.querySelector('.tool-run-row:last-child .tool-status');
      if (lastRowStatus) lastRowStatus.textContent = 'Success';

      if (browserViewport) {
        browserViewport.innerHTML = `
          <div class="browser-page-google animate-fade-in">
            <div class="google-logo"><span style="color:#4285F4">G</span><span style="color:#EA4335">o</span><span style="color:#FBBC05">o</span><span style="color:#4285F4">g</span><span style="color:#34A853">l</span><span style="color:#EA4335">e</span></div>
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
  // 4. Switch to extension, issue click call
  {
    tab: 'extension',
    status: 'Executing: click_element',
    showDots: false,
    action: () => {
      const row = document.createElement('div');
      row.className = 'tool-run-row animate-fade-in';
      row.innerHTML = `
        <span>Call: <span class="tool-name">click_element({ annotation_id: 1 })</span></span>
        <span class="tool-status">Running...</span>
      `;
      chatMessages?.appendChild(row);
      chatMessages?.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
    },
    delay: 1500,
  },
  // 5. Switch to browser, load results page
  {
    tab: 'browser',
    url: 'https://www.google.com/search?q=sf+tech+events',
    status: 'Navigating...',
    showDots: true,
    action: () => {
      const lastRowStatus = chatMessages?.querySelector('.tool-run-row:last-child .tool-status');
      if (lastRowStatus) lastRowStatus.textContent = 'Success';

      if (browserViewport) {
        browserViewport.innerHTML = `
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
  // 6. Switch to extension, read page & compile file
  {
    tab: 'extension',
    status: 'Compiling results...',
    showDots: true,
    action: () => {
      // Log read_page_content
      const rowRead = document.createElement('div');
      rowRead.className = 'tool-run-row animate-fade-in';
      rowRead.innerHTML = `
        <span>Call: <span class="tool-name">read_page_content()</span></span>
        <span class="tool-status">Success</span>
      `;
      chatMessages?.appendChild(rowRead);

      // Log fs_create_file
      const rowWrite = document.createElement('div');
      rowWrite.className = 'tool-run-row animate-fade-in';
      rowWrite.style.marginTop = '4px';
      rowWrite.innerHTML = `
        <span>Call: <span class="tool-name">fs_create_file({ path: '/sf-events.txt' })</span></span>
        <span class="tool-status">Success</span>
      `;
      chatMessages?.appendChild(rowWrite);
      chatMessages?.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
    },
    delay: 2000,
  },
  // 7. Render final assistant text response
  {
    tab: 'extension',
    status: 'Task completed',
    showDots: false,
    action: () => {
      const response = document.createElement('div');
      response.className = 'chat-message agent animate-fade-in';
      response.innerHTML = `
        <div class="avatar">A</div>
        <div class="msg-body">
          I've compiled the SF tech events into a text file in your workspace:
          <br /><br />
          📄 <strong>/sf-events.txt</strong>
          <br /><br />
          It contains:
          <ul>
            <li>• SF Tech Events Listings (SOMA)</li>
            <li>• AI Innovators Forum (June 24)</li>
          </ul>
        </div>
      `;
      chatMessages?.appendChild(response);
      chatMessages?.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
    },
    delay: 6000, // Show completed state for 6s before restarting loop
  },
];

let currentStep = 0;
let simTimeout: number | null = null;

function runSimulationStep() {
  const step = simulationSequence[currentStep];

  // Update simulator global state indicators
  statusText!.textContent = step.status;
  if (step.showDots) {
    dots!.style.display = 'flex';
  } else {
    dots!.style.display = 'none';
  }

  // Handle URL change
  if (step.url && browserUrl) {
    browserUrl.textContent = step.url;
  }

  // Trigger step action (rendering changes)
  if (step.action) {
    step.action();
  }

  // Switch tabs based on task location
  switchTab(step.tab);

  // Queue next step
  currentStep = (currentStep + 1) % simulationSequence.length;
  simTimeout = window.setTimeout(runSimulationStep, step.delay);
}

// Tab click overrides (allows visitor to inspect panels manually, but resets active simulations)
tabExt?.addEventListener('click', () => {
  if (simTimeout) clearTimeout(simTimeout);
  switchTab('extension');
});

tabBrowser?.addEventListener('click', () => {
  if (simTimeout) clearTimeout(simTimeout);
  switchTab('browser');
});

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  fetchGithubStats();
  runSimulationStep();
});
