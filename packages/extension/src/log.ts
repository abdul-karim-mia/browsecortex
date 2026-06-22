/**
 * Dev-gated logger. Verbose `debug`/`warn` output is silenced in production
 * builds so the extension console stays quiet for users; real `error`s always
 * log so failures remain diagnosable. Gate is Vite's compile-time `DEV` flag,
 * so production bundles dead-code-eliminate the debug/warn calls entirely.
 */
const DEV = import.meta.env.DEV;

export const log = {
  debug: (...args: unknown[]) => {
    if (DEV) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (DEV) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
