# Competitor Analysis
> Research and compare competitors in a given market

## Description
Research competitors for a given product or market and produce a structured comparison table with strengths, weaknesses, and differentiators.

## Variables
- `product` — the product or market to analyze
- `competitors` — comma-separated list, or leave empty to auto-discover (default: empty)
- `depth` — quick / thorough (default: thorough)

## Instructions
1. If `competitors` is empty, search for "[product] alternatives" and "top [product] competitors" to discover 4–6 competitors.
2. Open each competitor's homepage, pricing page, and documentation in separate tabs.
3. Read each page with `read_page_content`, extracting:
   - Pricing model and price range
   - Key features
   - Target audience
   - Unique selling points
4. For thorough depth, also search for reviews of each competitor.
5. Build a comparison matrix covering: pricing, features, target users, pros/cons.
6. Save the analysis as `competitor-analysis-{{product}}-{{date}}.md` using `fs_create_file`.
7. End with a strategic recommendation.

## Notes
- Be objective — avoid bias toward any competitor.
- Flag features or pricing that couldn't be confirmed from available pages.
- Include source URLs for each competitor.
