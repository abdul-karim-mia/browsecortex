/** Animated BrowseCortex brain badge shown while the agent is working (PLAN §7).
 * It's the exact brand icon: the two hemispheres pulse out of phase and the
 * centre line + lobe brackets ("synapses") brighten, so the brain looks like
 * it's thinking. Shares its look with the in-page Floating Bubble. */
export function BrainPulse({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      class="relative shrink-0"
      role="img"
      aria-label="Working"
    >
      <defs>
        <linearGradient id="brainpulse-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#4f7df3" />
          <stop offset="100%" stop-color="#2e5ce0" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill="url(#brainpulse-bg)" />
      <g fill="#ffffff">
        <path
          class="bp-hemi bp-hemi-l"
          d="M64 36c-8 0-14 5-16 12-7 1-12 7-12 14 0 4 1.5 7.5 4 10-2 2.5-3 5.5-3 9 0 7.5 6 13 13 13 2.5 0 5-.8 7-2.2 2 2 5 3.2 7 3.2V36z"
        />
        <path
          class="bp-hemi bp-hemi-r"
          d="M64 36c8 0 14 5 16 12 7 1 12 7 12 14 0 4-1.5 7.5-4 10 2 2.5 3 5.5 3 9 0 7.5-6 13-13 13-2.5 0-5-.8-7-2.2-2 2-5 3.2-7 3.2V36z"
        />
      </g>
      <g class="bp-synapse" stroke="#2e5ce0" stroke-width="5" stroke-linecap="round" fill="none">
        <path d="M64 40v52" />
        <path d="M46 56q6 4 0 10" />
        <path d="M82 56q-6 4 0 10" />
      </g>
    </svg>
  );
}
