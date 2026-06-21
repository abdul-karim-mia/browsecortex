# Data Scraper
> Extract structured data from tables and lists on a page

## Description
Extract tabular or list data from the current page and save it as structured formats (JSON, CSV, Markdown).

## Variables
- `format` — json / csv / markdown (default: markdown)
- `table_index` — which table to scrape if multiple (default: 0)

## Instructions
1. Call `extract_table_data` to find all tables on the page.
2. If `table_index` is specified, use that table; otherwise use the first (largest) one.
3. Inspect the column headers and data rows.
4. Convert to the requested `format`:
   - JSON: array of objects with column-name keys
   - CSV: comma-separated with header row
   - Markdown: pipe-delimited table with header
5. Save the result as `scraped-data-{{date}}.{{format}}` using `fs_create_file`.
6. Inform the user of the row count and file name.

## Notes
- If no HTML tables are found, try `read_page_content` and extract structured lists manually.
- For paginated tables, note that only the visible page is scraped.
