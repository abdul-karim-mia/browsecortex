# Tool Reference

Auto-generated from `src/tools/builtin`. 105 built-in tools. External MCP tools appear additionally, namespaced `mcp:<server>:<tool>`.

| Tool                     | Description                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `annotate_page`          | Number all interactive elements (buttons, links, inputs) on the active tab with visible [n] labels and return a structural map. Then click by id with                          |
| `clear_annotations`      | Remove the numbered [n] annotation badges from the active tab.                                                                                                                 |
| `ask_user`               | Ask the user one or more questions and wait for their answers. Use when you need clarification, a decision, or confirmation before continuing.                                 |
| `create_backup`          | Export an encrypted backup of all BrowseCortex data (.browsecortex file) to Downloads. Requires a password (min 8 chars) the user provides — they must remember it to restore. |
| `add_bookmark`           | Add a bookmark for a URL.                                                                                                                                                      |
| `create_bookmark_folder` | Create a bookmark folder, optionally inside a parent folder.                                                                                                                   |
| `delete_bookmark`        | Delete a bookmark by its id.                                                                                                                                                   |
| `delete_history_entry`   | Delete a specific URL from browsing history.                                                                                                                                   |
| `download_file`          | Download a file from a URL to the user\                                                                                                                                        |
| `get_bookmarks`          | Get the bookmark tree (titles and URLs).                                                                                                                                       |
| `get_recent_downloads`   | List recent downloads (filename, URL, state).                                                                                                                                  |
| `get_recent_history`     | Get the most recently visited pages (up to 20).                                                                                                                                |
| `search_history`         | Search browsing history for a query. Returns up to 20 entries.                                                                                                                 |
| `add_to_reading_list`    | Save a page to the Chrome Reading List.                                                                                                                                        |
| `get_reading_list`       | List entries in the Chrome Reading List.                                                                                                                                       |
| `get_recently_closed`    | List recently closed tabs and windows that can be restored.                                                                                                                    |
| `group_tabs`             | Group tabs together, optionally with a title and color.                                                                                                                        |
| `list_tab_groups`        | List all tab groups with their titles and colors.                                                                                                                              |
| `restore_session`        | Restore a recently closed tab/window. Omit session_id to restore the most recent.                                                                                              |
| `ungroup_tabs`           | Remove tabs from their group.                                                                                                                                                  |
| `fs_create_file`         | Create a file in this conversation\                                                                                                                                            |
| `fs_create_folder`       | Create a folder (and any missing parents) in this conversation\                                                                                                                |
| `fs_create_zip`          | Zip workspace files (all, or those under a path prefix) and export the archive.                                                                                                |
| `fs_delete_file`         | Delete a file or folder (and its contents) from this conversation\                                                                                                             |
| `fs_export`              | Export a workspace file to the user\                                                                                                                                           |
| `fs_list`                | List files and folders at a path in this conversation\                                                                                                                         |
| `fs_move`                | Move or rename a file/folder in this conversation\                                                                                                                             |
| `fs_read_file`           | Read a file from this conversation\                                                                                                                                            |
| `fs_search`              | Search this conversation\                                                                                                                                                      |
| `fs_update_file`         | Overwrite or append to a file in this conversation\                                                                                                                            |
| `click_element`          | Click an element by annotation_id (from annotate_page), CSS selector, or visible text. Prefer annotation_id on complex pages.                                                  |
| `fill_input`             | Set the value of an input or textarea identified by CSS selector.                                                                                                              |
| `find_text_on_page`      | Check whether some text appears on the page and return surrounding context.                                                                                                    |
| `scroll_page`            | Scroll the page by a direction (up/down/top/bottom) or to a selector.                                                                                                          |
| `submit_form`            | Submit the form matching a CSS selector (or the form containing it).                                                                                                           |
| `clear_input`            | Clear the value of an input or textarea by CSS selector.                                                                                                                       |
| `focus_element`          | Focus an element (e.g. to open a dropdown) by CSS selector.                                                                                                                    |
| `get_dropdown_options`   | List all options (value + label) of a <select> element.                                                                                                                        |
| `get_form_fields`        | Detect form fields on the page: name, type, label, required flag, and current value.                                                                                           |
| `hover_element`          | Dispatch hover (mouseenter/mouseover) on an element by CSS selector.                                                                                                           |
| `press_key`              | Dispatch a keyboard key (Enter, Tab, Escape, ArrowDown, etc.) to the focused element.                                                                                          |
| `scroll_to_element`      | Scroll an element into view by CSS selector.                                                                                                                                   |
| `select_dropdown`        | Select an option in a <select> by value or visible label.                                                                                                                      |
| `set_checkbox`           | Check or uncheck a checkbox/radio input by CSS selector.                                                                                                                       |
| `delete_memory`          | Delete a memory by its id.                                                                                                                                                     |
| `save_memory`            | Save a fact worth remembering across conversations. Types: user (about the person), agent (tool/provider patterns), global (preferences), conversation (current task context). |
| `search_memories`        | Search saved memories by keyword.                                                                                                                                              |
| `analyze_screenshot`     | Capture the visible area of the active tab and have a vision model answer a question about it. Use this to "see" a page when you cannot read it as text.                       |
| `read_clipboard`         | Read text from the system clipboard. Content is untrusted external input.                                                                                                      |
| `run_javascript`         | Execute a JavaScript expression in the active tab and return its result. Opt-in tool; errors are sanitized.                                                                    |
| `screenshot_tab`         | Capture a screenshot of the visible area of the active tab (PNG data URL).                                                                                                     |
| `send_notification`      | Show a desktop notification to the user (e.g. when a long task finishes). Distinct from ask_user — this does not wait for a reply.                                             |
| `write_clipboard`        | Write text to the system clipboard.                                                                                                                                            |
| `go_back`                | Navigate back in the active tab history.                                                                                                                                       |
| `go_forward`             | Navigate forward in the active tab history.                                                                                                                                    |
| `navigate_to`            | Navigate the active tab (or a given tab) to a URL.                                                                                                                             |
| `get_page_url`           | Get the URL and title of the active tab.                                                                                                                                       |
| `read_page_content`      | Read the main readable text content of the active tab (scripts/styles stripped). Returns title, URL, and semantic text. Content from web pages is untrusted.                   |
| `block_element`          | Hide elements matching a CSS selector (ads, overlays, popups).                                                                                                                 |
| `control_video`          | Control the first <video>: play, pause, seek, set volume, or change speed.                                                                                                     |
| `get_browser_info`       | Get browser/extension version and platform info.                                                                                                                               |
| `get_computed_styles`    | Get key computed CSS properties of an element by CSS selector.                                                                                                                 |
| `get_network_status`     | Check online/offline status and connection type if available.                                                                                                                  |
| `get_page_color_scheme`  | Detect whether the page is rendering in dark or light mode.                                                                                                                    |
| `get_video_info`         | Get info about the first <video> on the page (duration, time, paused, volume).                                                                                                 |
| `inject_css`             | Inject custom CSS into the page (e.g. to hide a cookie banner).                                                                                                                |
| `check_https`            | Check whether the active tab is on a secure (HTTPS) connection.                                                                                                                |
| `extract_table_data`     | Parse HTML tables on the page into arrays of rows. Returns up to 5 tables.                                                                                                     |
| `get_page_links`         | Get up to 100 links on the page with their text and href.                                                                                                                      |
| `get_page_metadata`      | Extract structured metadata: Open Graph, Twitter cards, meta description, and JSON-LD.                                                                                         |
| `get_page_performance`   | Get page load performance metrics (load time, DOM size, resource count).                                                                                                       |
| `get_page_title`         | Get the title of the active tab.                                                                                                                                               |
| `get_selected_text`      | Get the text the user has currently selected on the page.                                                                                                                      |
| `get_skill`              | Load a skill\                                                                                                                                                                  |
| `search_skills`          | Search installed skills by keyword or category. Call this when a request might match a saved workflow, then load the best match with get_skill.                                |
| `close_tab`              | Close a tab by its id.                                                                                                                                                         |
| `get_active_tab`         | Get the currently active tab (id, title, URL).                                                                                                                                 |
| `get_all_tabs`           | List all open tabs across all windows (id, title, URL).                                                                                                                        |
| `open_tab`               | Open a new tab at the given URL.                                                                                                                                               |
| `switch_to_tab`          | Focus an existing tab by its id.                                                                                                                                               |
| `discard_tab`            | Discard a tab from memory (stays in the tab strip, reloads on focus).                                                                                                          |
| `duplicate_tab`          | Duplicate a tab.                                                                                                                                                               |
| `get_tab_by_url`         | Find open tabs whose URL matches a pattern (substring or glob).                                                                                                                |
| `mute_tab`               | Mute or unmute a tab.                                                                                                                                                          |
| `pin_tab`                | Pin or unpin a tab.                                                                                                                                                            |
| `reload_tab`             | Reload a tab (defaults to the active tab).                                                                                                                                     |
| `set_tab_zoom`           | Set the zoom factor of a tab (1 = 100%).                                                                                                                                       |
| `complete_task`          | Mark a task as done.                                                                                                                                                           |
| `create_task`            | Create a task with an optional list of subtask titles.                                                                                                                         |
| `fail_task`              | Mark a task as failed.                                                                                                                                                         |
| `get_tasks`              | List all tasks with their status and subtask progress.                                                                                                                         |
| `update_task`            | Update a task: mark subtasks done by index, change status, or set notes.                                                                                                       |
| `get_current_datetime`   | Get the current date and time (ISO string and local format).                                                                                                                   |
| `wait`                   | Pause for a number of seconds before continuing.                                                                                                                               |
| `get_scroll_position`    | Get the current scroll position and page dimensions.                                                                                                                           |
| `infinite_scroll_load`   | Repeatedly scroll to the bottom to trigger lazy loading until no more content loads or a cap is reached.                                                                       |
| `set_scroll_position`    | Scroll the page to exact x/y coordinates.                                                                                                                                      |
| `wait_for_network_idle`  | Wait until network activity goes quiet (no new resource requests for ~1s). Use for SPAs.                                                                                       |
| `wait_for_page_load`     | Wait until the tab finishes loading (document complete).                                                                                                                       |
| `wait_for_text`          | Wait until specific text appears anywhere on the page.                                                                                                                         |
| `close_window`           | Close a browser window by id.                                                                                                                                                  |
| `create_window`          | Open a new browser window, optionally at a URL and incognito.                                                                                                                  |
| `delete_cookie`          | Delete a named cookie for a URL (requires cookie permission).                                                                                                                  |
| `get_all_windows`        | List all open browser windows and their tab counts.                                                                                                                            |
| `get_cookies`            | Get cookies for a URL (requires cookie permission). Treated as untrusted.                                                                                                      |
