/** App logo badge — the filled brain glyph on the blue gradient, matching the
 * extension icon (src/assets/icons/icon-*.png), used in the chat header. */
export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 128 128" width={size} height={size} class="shrink-0 rounded-[22%]">
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#4f7df3" />
          <stop offset="100%" stop-color="#2e5ce0" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="22" fill="url(#logo-bg)" />
      <g fill="#ffffff">
        <path d="M64 36c-8 0-14 5-16 12-7 1-12 7-12 14 0 4 1.5 7.5 4 10-2 2.5-3 5.5-3 9 0 7.5 6 13 13 13 2.5 0 5-.8 7-2.2 2 2 5 3.2 7 3.2V36z" />
        <path d="M64 36c8 0 14 5 16 12 7 1 12 7 12 14 0 4-1.5 7.5-4 10 2 2.5 3 5.5 3 9 0 7.5-6 13-13 13-2.5 0-5-.8-7-2.2-2 2-5 3.2-7 3.2V36z" />
      </g>
      <g stroke="#2e5ce0" stroke-width="5" stroke-linecap="round" fill="none">
        <path d="M64 40v52" />
        <path d="M46 56q6 4 0 10" />
        <path d="M82 56q-6 4 0 10" />
      </g>
    </svg>
  );
}
