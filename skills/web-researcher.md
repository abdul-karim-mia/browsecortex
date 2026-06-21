# Web Researcher
> Deep research on any topic with cited sources

## Description
Thoroughly research any topic across multiple sources and produce a well-structured, cited summary.

## Variables
- `topic` — subject to research
- `depth` — quick / thorough / exhaustive (default: thorough)

## Instructions
1. Search the topic broadly using `search_with_provider` — open 3–5 relevant results in tabs.
2. Read each page with `read_page_content`, extracting key facts, data points, and claims.
3. Cross-check claims across sources — note disagreements.
4. For exhaustive depth, repeat search with different phrasing and dig into linked sources.
5. Write a structured summary to the workspace with `fs_create_file` named `research-{{topic}}-{{date}}.md`.
6. Include a Sources section with URLs.

## Notes
- Prefer primary and authoritative sources.
- Flag speculation or opinion clearly.
- Always include source URLs in the output.
