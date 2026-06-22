# Session Saver

> Snapshot current browsing session to a workspace file

## Description

Capture all open tabs, their URLs, tab groups, and window layout for later restoration.

## Variables

- `name` — session name (default: "session-{{date}}")
- `include_content` — true / false, include page summaries (default: false)

## Instructions

1. List all windows with `get_all_windows` to see how many windows exist.
2. For each window, collect all tabs with `get_all_tabs` or by iterating windows.
3. Get tab groups with `list_tab_groups` to capture group structure.
4. If `include_content` is true, read each tab's content with `read_page_content` and summarize briefly.
5. Build a JSON snapshot:
   - windows: array of tabs with title, URL, pinned state, group
   - groups: name and color per group
   - captured_at: timestamp
6. Save as `{{name}}.json` using `fs_create_file`.
7. Report the number of windows, tabs, and groups saved.

## Notes

- This is for reference — it does not restore tabs automatically.
- Include pinned and muted status if available.
- For sessions with many tabs (>20), skip page content to keep the file small.
