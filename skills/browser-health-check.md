# Browser Health Check
> Audit browser tabs, memory, downloads, and performance

## Description
Run a diagnostic check on the browser: tab count, memory state, recent downloads, page performance, and security status.

## Variables
- `scope` — quick / full (default: quick)

## Instructions
1. Count all tabs across all windows with `get_all_windows`.
2. Check connection security on the active tab with `check_https`.
3. Get page performance metrics with `get_page_performance`.
4. Get browser info and network status.
5. List recent downloads with `get_recent_downloads`.
6. Note discarded tabs (memory-saver state) and tab zoom levels.
7. For `full` scope, also:
   - Check each tab's HTTPS status
   - Check color scheme (dark/light mode)
   - Get scroll position on current page
8. Compile a health report:
   - Total tabs / windows / groups
   - HTTPS status of active tab
   - Load time and DOM size
   - Recent downloads count
   - Network status
9. Save as `browser-health-{{date}}.md` using `fs_create_file` or display inline for quick scope.
10. Flag any concerns (e.g., many discarded tabs, slow page, insecure connection).

## Notes
- This is read-only — no tabs or data are modified.
- Performance data is for the active tab only.
- Report any anomalies but do not take corrective action.
