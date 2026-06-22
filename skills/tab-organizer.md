# Tab Organizer

> Group and organize open tabs by topic

## Description

Analyze all open tabs, suggest logical groups, and create named, color-coded tab groups.

## Variables

- `grouping` — domain / topic / smart (default: smart)
- `color_scheme` — auto / rainbow / muted (default: auto)

## Instructions

1. List all open tabs with `get_all_tabs`.
2. Analyze titles and URLs to identify logical categories (e.g. "Work", "Research", "Shopping").
3. For `domain` grouping, group by domain name. For `topic`, analyze title keywords. For `smart`, use a mix.
4. With `annotate_page` disabled, use `group_tabs` to create one group per category — include a descriptive title and assign a color.
5. List newly created groups with `list_tab_groups` to confirm.
6. Report back with a summary of what was grouped.

## Notes

- Available colors: grey, blue, red, yellow, green, pink, purple, cyan, orange.
- Do not close or discard any tabs.
- If only 1–2 tabs are open, suggest the user open more before organizing.
