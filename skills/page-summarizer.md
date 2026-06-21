# Page Summarizer
> Condense any webpage into key takeaways

## Description
Read the current page and produce a concise, structured summary with key points, actionable items, and follow-up questions.

## Variables
- `detail` — brief / normal / detailed (default: normal)
- `format` — bullet / prose / structured (default: bullet)

## Instructions
1. Read the current page with `read_page_content`.
2. Identify: main topic, key claims, supporting evidence, and conclusion.
3. Extract any actionable items, deadlines, or decisions.
4. Format the summary according to the requested `format` and `detail`.
5. If `detail` is brief, keep it under 3 bullet points. If detailed, include nuance and edge cases.
6. Save the summary to the workspace as `summary-{{date}}.md` with `fs_create_file`.
7. End with 2–3 follow-up questions the reader should consider.

## Notes
- The page title and URL are included automatically — no need to copy them.
- Do not include boilerplate (cookies, nav, etc.) in the summary.
