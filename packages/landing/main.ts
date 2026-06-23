// --- TYPES & INTERFACES ---
interface Contributor {
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
}

// --- INSTALL BUTTON WIRING ---
// All "Install" CTAs default to the releases/latest page (set in index.html).
// When the latest release exposes a packaged extension zip, we upgrade these
// to a direct download link.
function setInstallButtonsHref(url: string) {
  ['nav-btn-download', 'nav-btn-download-mobile', 'hero-btn-download', 'footer-btn-download'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn instanceof HTMLAnchorElement) {
      btn.href = url;
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
    }
  });
}

// --- GITHUB API INTEGRATION ---
const CACHE_TTL = 5 * 60 * 1000; // 5-minute localStorage TTL

function getCached(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCache(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* quota exceeded — ignore */ }
}

async function fetchWithCache(url: string, cacheKey: string): Promise<unknown> {
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  setCache(cacheKey, data);
  return data;
}

async function fetchGithubStats() {
  const repoUrl = 'https://api.github.com/repos/abdul-karim-mia/browsecortex';
  const releaseUrl = 'https://api.github.com/repos/abdul-karim-mia/browsecortex/releases/latest';
  const contributorsUrl = 'https://api.github.com/repos/abdul-karim-mia/browsecortex/contributors';

  const starsPills = document.querySelectorAll('.github-stars-pill');
  const releaseTag = document.getElementById('github-release-tag');

  // Bento card fields
  const bentoStars = document.getElementById('bento-stats-stars');
  const bentoForks = document.getElementById('bento-stats-forks');
  const bentoIssues = document.getElementById('bento-stats-issues');
  const contributorsGrid = document.getElementById('contributors-avatars-grid');

  // Parallelize all three API calls
  const [repoResult, releaseResult, contributorsResult] = await Promise.allSettled([
    fetchWithCache(repoUrl, 'gh_repo'),
    fetchWithCache(releaseUrl, 'gh_release'),
    fetchWithCache(contributorsUrl, 'gh_contributors'),
  ]);

  // 1. Process Repository Details (Stars, Forks, Issues)
  if (repoResult.status === 'fulfilled') {
    const data = repoResult.value as Record<string, unknown>;
    if (typeof data.stargazers_count === 'number') {
      starsPills.forEach((p) => {
        p.textContent = `${data.stargazers_count} Stars`;
      });
    }
    if (bentoStars && typeof data.stargazers_count === 'number') {
      bentoStars.textContent = String(data.stargazers_count);
    }
    if (bentoForks && typeof data.forks_count === 'number') {
      bentoForks.textContent = String(data.forks_count);
    }
    if (bentoIssues && typeof data.open_issues_count === 'number') {
      bentoIssues.textContent = String(data.open_issues_count);
    }
  } else {
    console.warn('[GitHub Stats] Falling back for repo details:', repoResult.reason);
    starsPills.forEach((p) => {
      p.textContent = 'Stars';
    });
    if (bentoStars) bentoStars.textContent = '12';
    if (bentoForks) bentoForks.textContent = '3';
    if (bentoIssues) bentoIssues.textContent = '0';
  }

  // 2. Process Latest Release Tag + wire install buttons
  if (releaseResult.status === 'fulfilled') {
    const data = releaseResult.value as Record<string, unknown>;
    if (releaseTag && data.tag_name) {
      releaseTag.textContent = String(data.tag_name);
    }
    const assets: { name?: string; browser_download_url?: string }[] = Array.isArray(data.assets)
      ? data.assets
      : [];
    const extensionZip = assets.find((a) => /extension.*\.zip$/i.test(a.name ?? ''));
    if (extensionZip?.browser_download_url) {
      setInstallButtonsHref(extensionZip.browser_download_url);
    }
  } else {
    console.warn('[GitHub Release] Keeping fallback install link:', releaseResult.reason);
    if (releaseTag) releaseTag.textContent = 'v1.0.0';
  }

  // 3. Process & Render Contributors List (XSS-safe DOM construction)
  if (contributorsResult.status === 'fulfilled') {
    const list = contributorsResult.value as Contributor[];
    if (contributorsGrid && Array.isArray(list)) {
      contributorsGrid.innerHTML = ''; // clear loading state

      list.slice(0, 12).forEach((c) => {
        const item = document.createElement('a');
        item.className = 'contributor-item animate-fade-in';
        item.href = c.html_url;
        item.target = '_blank';
        item.rel = 'noopener noreferrer';
        item.title = `${c.login} (${c.contributions} contributions)`;

        const img = document.createElement('img');
        img.setAttribute('src', c.avatar_url);
        img.setAttribute('alt', c.login);
        img.className = 'contributor-avatar';
        img.width = 40;
        img.height = 40;
        img.loading = 'lazy';
        img.addEventListener('error', () => {
          img.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(c.login)}`;
        });
        const name = document.createElement('span');
        name.className = 'contributor-name';
        name.textContent = c.login;
        item.append(img, name);
        contributorsGrid.appendChild(item);
      });
    }
  } else {
    console.warn('[GitHub Contributors] Using fallback creator attribution:', contributorsResult.reason);
    if (contributorsGrid) {
      contributorsGrid.innerHTML = ''; // clear loading state
      const item = document.createElement('a');
      item.href = 'https://github.com/abdul-karim-mia';
      item.target = '_blank';
      item.rel = 'noopener noreferrer';
      item.className = 'contributor-item animate-fade-in';
      item.title = 'Abdul karim mia';
      const img = document.createElement('img');
      img.setAttribute('src', 'https://github.com/abdul-karim-mia.png');
      img.setAttribute('alt', 'Abdul karim mia');
      img.className = 'contributor-avatar';
      img.addEventListener('error', () => {
        img.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=abdul';
      });
      const name = document.createElement('span');
      name.className = 'contributor-name';
      name.textContent = 'Abdul karim mia';
      item.append(img, name);
      contributorsGrid.appendChild(item);
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

  if (statusText) statusText.textContent = step.status;
  if (dots) dots.style.display = step.showDots ? 'flex' : 'none';

  if (step.url && browserUrl) {
    browserUrl.textContent = step.url;
  }

  if (step.action) {
    step.action();
  }

  switchTab(step.tab);

  currentStep = (currentStep + 1) % simulationSequence.length;
  // Clear chat DOM when simulation loops back to the beginning
  if (currentStep === 0 && chatMessages) {
    chatMessages.innerHTML = '';
  }
  simTimeout = window.setTimeout(runSimulationStep, step.delay);
}

tabExt?.addEventListener('click', () => {
  if (simTimeout) clearTimeout(simTimeout);
  switchTab('extension');
  simTimeout = window.setTimeout(runSimulationStep, 3000);
});

tabBrowser?.addEventListener('click', () => {
  if (simTimeout) clearTimeout(simTimeout);
  switchTab('browser');
  simTimeout = window.setTimeout(runSimulationStep, 3000);
});

// --- CAPABILITY ACCORDIONS LOGIC ---
function initCapabilities() {
  const cards = document.querySelectorAll('.capability-card');
  cards.forEach((card) => {
    card.addEventListener('click', () => {
      const expanded = card.classList.toggle('expanded');
      card.setAttribute('aria-expanded', String(expanded));
    });
    card.addEventListener('keydown', (e) => {
      const evt = e as KeyboardEvent;
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        const expanded = card.classList.toggle('expanded');
        card.setAttribute('aria-expanded', String(expanded));
      }
    });
  });
}

// --- MOBILE HAMBURGER MENU TOGGLE ---
function initMobileMenu() {
  const menuBtn = document.querySelector('.mobile-menu-btn');
  const navLinks = document.querySelector('.nav-links');
  
  const toggleMenu = (show: boolean) => {
    menuBtn?.setAttribute('aria-expanded', String(show));
    if (show) {
      navLinks?.classList.add('open');
    } else {
      navLinks?.classList.remove('open');
    }
  };

  menuBtn?.addEventListener('click', () => {
    const expanded = menuBtn.getAttribute('aria-expanded') === 'true';
    toggleMenu(!expanded);
  });

  // Close mobile menu when clicking on a link
  navLinks?.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      toggleMenu(false);
    });
  });
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  fetchGithubStats();
  initCapabilities();
  initMobileMenu();
  runSimulationStep();
});
