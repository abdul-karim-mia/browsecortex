/** Animated brain glyph shown while the agent is working (PLAN §7), matching
 * the extension icon's silhouette. A soft glow pulses behind it and the two
 * "synapse" dots flash out of phase to suggest activity. */
export function BrainPulse({ size = 18 }: { size?: number }) {
  return (
    <span
      class="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span class="brain-glow absolute inset-0 rounded-full bg-blue-400" />
      <svg viewBox="0 0 128 128" width={size} height={size} class="brain-pulse relative">
        <g fill="currentColor" class="text-blue-500 dark:text-blue-400">
          <path d="M64 36c-8 0-14 5-16 12-7 1-12 7-12 14 0 4 1.5 7.5 4 10-2 2.5-3 5.5-3 9 0 7.5 6 13 13 13 2.5 0 5-.8 7-2.2 2 2 5 3.2 7 3.2V36z" />
          <path d="M64 36c8 0 14 5 16 12 7 1 12 7 12 14 0 4-1.5 7.5-4 10 2 2.5 3 5.5 3 9 0 7.5-6 13-13 13-2.5 0-5-.8-7-2.2-2 2-5 3.2-7 3.2V36z" />
        </g>
        <g
          stroke="currentColor"
          stroke-width="5"
          stroke-linecap="round"
          fill="none"
          class="text-white dark:text-gray-900"
        >
          <path d="M64 40v52" />
        </g>
        <circle
          cx="46"
          cy="62"
          r="3"
          fill="currentColor"
          class="synapse-dot text-white dark:text-gray-900"
          style={{ animationDelay: '0s' }}
        />
        <circle
          cx="82"
          cy="62"
          r="3"
          fill="currentColor"
          class="synapse-dot text-white dark:text-gray-900"
          style={{ animationDelay: '0.4s' }}
        />
      </svg>
    </span>
  );
}
