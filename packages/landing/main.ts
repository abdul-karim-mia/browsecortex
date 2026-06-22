// --- TYPES & INTERFACES ---
interface Contributor {
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
}

// --- GITHUB API INTEGRATION ---
async function fetchGithubStats() {
  const repoUrl = 'https://api.github.com/repos/abdul-karim-mia/browsecortex';
  const releaseUrl = 'https://api.github.com/repos/abdul-karim-mia/browsecortex/releases/latest';
  const contributorsUrl = 'https://api.github.com/repos/abdul-karim-mia/browsecortex/contributors';

  const starsPill = document.getElementById('github-stars-pill');
  const releaseTag = document.getElementById('github-release-tag');
  
  // Bento card fields
  const bentoStars = document.getElementById('bento-stats-stars');
  const bentoForks = document.getElementById('bento-stats-forks');
  const bentoIssues = document.getElementById('bento-stats-issues');

  // 1. Fetch Repository Details (Stars, Forks, Issues)
  try {
    const response = await fetch(repoUrl);
    if (!response.ok) throw new Error('GitHub API Limit or Offline');
    const data = await response.json();
    
    // Stars
    if (starsPill && typeof data.stargazers_count === 'number') {
      starsPill.textContent = `${data.stargazers_count} Stars`;
    }
    if (bentoStars && typeof data.stargazers_count === 'number') {
      bentoStars.textContent = String(data.stargazers_count);
    }
    
    // Forks
    if (bentoForks && typeof data.forks_count === 'number') {
      bentoForks.textContent = String(data.forks_count);
    }
    
    // Open Issues
    if (bentoIssues && typeof data.open_issues_count === 'number') {
      bentoIssues.textContent = String(data.open_issues_count);
    }
  } catch (e) {
    console.warn('[GitHub Stats] Falling back for repo details:', e);
    if (starsPill) starsPill.textContent = 'Stars';
    if (bentoStars) bentoStars.textContent = '12';
    if (bentoForks) bentoForks.textContent = '3';
    if (bentoIssues) bentoIssues.textContent = '0';
  }

  // 2. Fetch Latest Release Tag
  try {
    const response = await fetch(releaseUrl);
    if (!response.ok) throw new Error('Release fetch rate limited');
    const data = await response.json();
    if (releaseTag && data.tag_name) {
      releaseTag.textContent = data.tag_name;
    }
  } catch (e) {
    if (releaseTag) releaseTag.textContent = 'v1.0.0';
  }

  // 3. Fetch & Render Contributors List
  const contributorsGrid = document.getElementById('contributors-avatars-grid');
  try {
    const response = await fetch(contributorsUrl);
    if (!response.ok) throw new Error('Contributors fetch rate limited');
    const list: Contributor[] = await response.json();
    
    if (contributorsGrid && Array.isArray(list)) {
      contributorsGrid.innerHTML = ''; // clear loading state
      
      // Take top 12 contributors
      list.slice(0, 12).forEach((c) => {
        const item = document.createElement('a');
        item.className = 'contributor-item animate-fade-in';
        item.href = c.html_url;
        item.target = '_blank';
        item.rel = 'noopener noreferrer';
        item.title = `${c.login} (${c.contributions} contributions)`;
        
        item.innerHTML = `
          <img src="${c.avatar_url}" alt="${c.login}" class="contributor-avatar" loading="lazy" />
          <span class="contributor-name">${c.login}</span>
        `;
        contributorsGrid.appendChild(item);
      });
    }
  } catch (e) {
    console.warn('[GitHub Contributors] Using fallback creator attribution:', e);
    if (contributorsGrid) {
      // Fallback: Show the creator primarily
      contributorsGrid.innerHTML = `
        <a href="https://github.com/abdul-karim-mia" target="_blank" rel="noopener noreferrer" class="contributor-item animate-fade-in" title="Abdul karim mia">
          <img src="https://github.com/abdul-karim-mia.png" alt="Abdul karim mia" class="contributor-avatar" onerror="this.src='https://api.dicebear.com/7.x/bottts/svg?seed=abdul'" />
          <span class="contributor-name">Abdul karim mia</span>
        </a>
      `;
    }
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
      const rowRead = document.createElement('div');
      rowRead.className = 'tool-run-row animate-fade-in';
      rowRead.innerHTML = `
        <span>Call: <span class="tool-name">read_page_content()</span></span>
        <span class="tool-status">Success</span>
      `;
      chatMessages?.appendChild(rowRead);

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
    delay: 6000,
  },
];

let currentStep = 0;
let simTimeout: number | null = null;

function runSimulationStep() {
  const step = simulationSequence[currentStep];

  statusText!.textContent = step.status;
  if (step.showDots) {
    dots!.style.display = 'flex';
  } else {
    dots!.style.display = 'none';
  }

  if (step.url && browserUrl) {
    browserUrl.textContent = step.url;
  }

  if (step.action) {
    step.action();
  }

  switchTab(step.tab);

  currentStep = (currentStep + 1) % simulationSequence.length;
  simTimeout = window.setTimeout(runSimulationStep, step.delay);
}

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
