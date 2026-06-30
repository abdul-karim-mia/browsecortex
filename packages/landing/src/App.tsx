import { useState, useEffect } from 'react';
import { Home } from './components/Home';
import { Docs } from './components/Docs';
import { Features } from './components/Features';
import { Tutorials } from './components/Tutorials';

export type Page = 'home' | 'docs' | 'features' | 'tutorials';

export function App() {
  const [activePage, setActivePage] = useState<Page>('home');
  const [githubStars, setGithubStars] = useState<string>('Loading...');
  const [downloadUrl, setDownloadUrl] = useState<string>(
    'https://github.com/abdul-karim-mia/browsecortex/releases/latest'
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sync stars and latest release zip from GitHub API
  useEffect(() => {
    const fetchGitHubStats = async () => {
      try {
        const repoRes = await fetch('https://api.github.com/repos/abdul-karim-mia/browsecortex');
        if (repoRes.ok) {
          const repoData = await repoRes.json();
          if (repoData.stargazers_count !== undefined) {
            setGithubStars(`${repoData.stargazers_count} Stars`);
          }
        }
        
        const releaseRes = await fetch(
          'https://api.github.com/repos/abdul-karim-mia/browsecortex/releases/latest'
        );
        if (releaseRes.ok) {
          const releaseData = await releaseRes.json();
          const assets = releaseData.assets || [];
          const zipAsset = assets.find((a: any) => /extension.*\.zip$/i.test(a.name || ''));
          if (zipAsset && zipAsset.browser_download_url) {
            setDownloadUrl(zipAsset.browser_download_url);
          }
        }
      } catch (err) {
        console.warn('Failed to load GitHub stats:', err);
        setGithubStars('Stars');
      }
    };
    fetchGitHubStats();
  }, []);

  const navigateTo = (page: Page) => {
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  return (
    <div className="app-container">
      {/* Header / Navigation */}
      <header className="navbar">
        <div className="container navbar-container">
          <div className="brand" onClick={() => navigateTo('home')} style={{ cursor: 'pointer' }}>
            <svg viewBox="0 0 128 128" width="32" height="32" className="brand-logo rounded-logo" role="img" aria-label="BrowseCortex logo">
              <defs>
                <linearGradient id="logo-bg-nav" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#4f7df3" />
                  <stop offset="100%" stopColor="#2e5ce0" />
                </linearGradient>
              </defs>
              <rect width="128" height="128" rx="28" fill="url(#logo-bg-nav)" />
              <g fill="#ffffff">
                <path d="M64 36c-8 0-14 5-16 12-7 1-12 7-12 14 0 4 1.5 7.5 4 10-2 2.5-3 5.5-3 9 0 7.5 6 13 13 13 2.5 0 5-.8 7-2.2 2 2 5 3.2 7 3.2V36z" />
                <path d="M64 36c8 0 14 5 16 12 7 1 12 7 12 14 0 4-1.5 7.5-4 10 2 2.5 3 5.5 3 9 0 7.5-6 13-13 13-2.5 0-5-.8-7-2.2-2 2-5 3.2-7 3.2V36z" />
              </g>
              <g stroke="#2e5ce0" strokeWidth="5" strokeLinecap="round" fill="none">
                <path d="M64 40v52" />
                <path d="M46 56q6 4 0 10" />
                <path d="M82 56q-6 4 0 10" />
              </g>
            </svg>
            <span className="brand-name">BrowseCortex</span>
          </div>

          <button
            className="mobile-menu-btn"
            aria-label="Toggle navigation"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="12" x2="20" y2="12"></line>
                <line x1="4" y1="6" x2="20" y2="6"></line>
                <line x1="4" y1="18" x2="20" y2="18"></line>
              </svg>
            )}
          </button>

          <nav className={`nav-links ${mobileMenuOpen ? 'active' : ''}`} role="navigation">
            <span className={`nav-link ${activePage === 'home' ? 'active' : ''}`} onClick={() => navigateTo('home')}>
              Home
            </span>
            <span className={`nav-link ${activePage === 'features' ? 'active' : ''}`} onClick={() => navigateTo('features')}>
              Tools Explorer
            </span>
            <span className={`nav-link ${activePage === 'docs' ? 'active' : ''}`} onClick={() => navigateTo('docs')}>
              Documentation
            </span>
            <span className={`nav-link ${activePage === 'tutorials' ? 'active' : ''}`} onClick={() => navigateTo('tutorials')}>
              Tutorials
            </span>
            {mobileMenuOpen && (
              <div className="nav-actions-mobile" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                <a href="https://github.com/abdul-karim-mia/browsecortex" className="btn btn-secondary nav-btn" target="_blank" rel="noopener noreferrer">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
                  </svg>
                  GitHub <span className="stars-pill">{githubStars}</span>
                </a>
                <a href={downloadUrl} className="btn btn-primary nav-btn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="M7 10l5 5 5-5" />
                    <path d="M12 15V3" />
                  </svg>
                  Install Extension
                </a>
              </div>
            )}
          </nav>

          <div className="nav-actions">
            <a href="https://github.com/abdul-karim-mia/browsecortex" className="btn btn-secondary nav-btn" target="_blank" rel="noopener noreferrer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
              </svg>
              GitHub <span className="stars-pill">{githubStars}</span>
            </a>
            <a href={downloadUrl} className="btn btn-primary nav-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M7 10l5 5 5-5" />
                <path d="M12 15V3" />
              </svg>
              Install Extension
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {activePage === 'home' && <Home onNavigate={navigateTo} downloadUrl={downloadUrl} />}
        {activePage === 'features' && <Features />}
        {activePage === 'docs' && <Docs />}
        {activePage === 'tutorials' && <Tutorials />}
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="container footer-grid">
          <div className="footer-column">
            <div className="footer-brand" onClick={() => navigateTo('home')} style={{ cursor: 'pointer' }}>
              <svg viewBox="0 0 128 128" width="24" height="24" className="brand-logo rounded-logo">
                <rect width="128" height="128" rx="28" fill="#4f7df3" />
                <g fill="#ffffff">
                  <path d="M64 36c-8 0-14 5-16 12-7 1-12 7-12 14 0 4 1.5 7.5 4 10-2 2.5-3 5.5-3 9 0 7.5 6 13 13 13 2.5 0 5-.8 7-2.2 2 2 5 3.2 7 3.2V36z" />
                  <path d="M64 36c8 0 14 5 16 12 7 1 12 7 12 14 0 4-1.5 7.5-4 10 2 2.5 3 5.5 3 9 0 7.5-6 13-13 13-2.5 0-5-.8-7-2.2-2 2-5 3.2-7 3.2V36z" />
                </g>
              </svg>
              <span className="brand-name" style={{ fontSize: '1.2rem' }}>BrowseCortex</span>
            </div>
            <p className="footer-desc">
              A private, open-source AI browser companion giving you full agentic control over your browser tabs, history, and files.
            </p>
          </div>

          <div className="footer-column">
            <h4 className="footer-title">Platform</h4>
            <div className="footer-links">
              <span className="footer-link" onClick={() => navigateTo('home')}>Home</span>
              <span className="footer-link" onClick={() => navigateTo('features')}>Tools Explorer</span>
              <span className="footer-link" onClick={() => navigateTo('docs')}>Documentation</span>
              <span className="footer-link" onClick={() => navigateTo('tutorials')}>Tutorials</span>
            </div>
          </div>

          <div className="footer-column">
            <h4 className="footer-title">Resources</h4>
            <div className="footer-links">
              <a href="https://github.com/abdul-karim-mia/browsecortex" target="_blank" rel="noopener noreferrer" className="footer-link">
                GitHub Repository
              </a>
              <a href="https://github.com/abdul-karim-mia/browsecortex/issues" target="_blank" rel="noopener noreferrer" className="footer-link">
                Issue Tracker
              </a>
              <a href="https://github.com/abdul-karim-mia/browsecortex/releases" target="_blank" rel="noopener noreferrer" className="footer-link">
                Releases & Changelog
              </a>
            </div>
          </div>

          <div className="footer-column">
            <h4 className="footer-title">Get Started</h4>
            <div className="footer-links">
              <a href={downloadUrl} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                Download Extension
              </a>
            </div>
          </div>
        </div>

        <div className="container footer-bottom">
          <span>&copy; {new Date().getFullYear()} BrowseCortex. Created by Abdul karim mia. Released under the MIT License.</span>
          <div className="footer-bottom-links">
            <a href="https://github.com/abdul-karim-mia/browsecortex/blob/main/PRIVACY.md" target="_blank" rel="noopener noreferrer" className="footer-link" style={{ fontSize: '0.8rem' }}>
              Privacy Policy
            </a>
            <a href="https://github.com/abdul-karim-mia/browsecortex/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="footer-link" style={{ fontSize: '0.8rem' }}>
              MIT License
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
