/**
 * The BrowseCortex brain logo as an inline SVG string, shared by the Floating
 * Bubble and the email-reply button. The two hemispheres (`hemi-l` / `hemi-r`)
 * and the centre line + lobe brackets (`synapse`) carry classes so a host can
 * animate them (see the .bc-bubble.working rules in ./ui).
 */
export const BRAND_SVG = `
<svg class="bc-brain" viewBox="0 0 128 128" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="bc-logo-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4f7df3"/>
      <stop offset="100%" stop-color="#2e5ce0"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bc-logo-bg)"/>
  <g fill="#ffffff">
    <path class="hemi hemi-l" d="M64 36c-8 0-14 5-16 12-7 1-12 7-12 14 0 4 1.5 7.5 4 10-2 2.5-3 5.5-3 9 0 7.5 6 13 13 13 2.5 0 5-.8 7-2.2 2 2 5 3.2 7 3.2V36z"/>
    <path class="hemi hemi-r" d="M64 36c8 0 14 5 16 12 7 1 12 7 12 14 0 4-1.5 7.5-4 10 2 2.5 3 5.5 3 9 0 7.5-6 13-13 13-2.5 0-5-.8-7-2.2-2 2-5 3.2-7 3.2V36z"/>
  </g>
  <g class="synapse" stroke="#2e5ce0" stroke-width="5" stroke-linecap="round" fill="none">
    <path d="M64 40v52"/>
    <path d="M46 56q6 4 0 10"/>
    <path d="M82 56q-6 4 0 10"/>
  </g>
</svg>`;
