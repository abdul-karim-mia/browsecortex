# Writing Skills

A skill is a Markdown file with instructions the AI reads and follows for a
specific task type. Install community skills from a repo, or write your own in
Settings → Skills.

## Format

```markdown
# Web Researcher
> Deep research on any topic with cited sources

## Description
Thoroughly research any topic and produce a sourced summary.

## Variables
- `topic` — subject to research
- `depth` — quick / thorough / exhaustive (default: thorough)

## Instructions
1. Search broadly — open 3–5 tabs with `open_tab`.
2. Read each page with `read_page_content`.
3. Cross-check claims across sources.
4. Write the summary to the workspace with `fs_create_file`.

## Notes
- Prefer primary sources.
- Always include source URLs.
```

## Variables

Use `{{variable}}` placeholders. When the agent loads a skill with `get_skill`,
it can pass values that are substituted into the instructions.

## Sharing

Export your skill as `.md` from the editor, or open a PR to a skills repo. A
repo needs an `index.json` listing entries:

```json
{ "skills": [
  { "id": "web-researcher", "name": "Web Researcher", "path": "research/web-researcher.md",
    "category": "research", "author": "you", "version": "1.0", "tags": ["research"] }
] }
```

Set a custom repo URL in Settings → Skills to host a private skill store.
