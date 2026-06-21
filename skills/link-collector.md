# Link Collector
> Collect and categorize all links from the current page

## Description
Extract all links from the current page, categorize them by type, and save to a file.

## Variables
- `filter` — all / internal / external / resources (default: all)
- `output` — markdown / json / csv (default: markdown)

## Instructions
1. Call `get_page_links` to retrieve up to 100 links from the page.
2. Categorize each link:
   - Internal: same domain as the current page
   - External: different domain
   - Resources: file downloads (.pdf, .zip, .png, etc.)
3. Apply the `filter` — discard links that don't match.
4. Group links by category with link text and URL.
5. Save to the workspace as `links-{{page-title}}-{{date}}.{{output}}` using `fs_create_file`.
6. Report total link count and breakdown by category.

## Notes
- If more than 100 links, note the cap.
- Remove duplicate URLs.
- Do not follow or open any of the links.
