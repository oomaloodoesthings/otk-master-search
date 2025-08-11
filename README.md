# OriginalTK — Master Search (static frontend)

A lightweight, front-end only search tool for OriginalTK items. It loads chunked JSON data from `/data/manifest.json`, supports partial-name search, filters by path and tier, click-to-sort columns, and exports filtered results to JSON/CSV.

## Quick start (GitHub Pages)
1. Create a repo (e.g. `master-search`) on GitHub.
2. Upload all files from this folder (including the `data/` directory).
3. Add a file named `.nojekyll` in the repo root (present in this bundle).
4. Enable GitHub Pages: **Settings → Pages → Build and deployment → Source: Deploy from a branch**; select branch `main` and folder `/ (root)`.
5. Visit `https://YOURUSER.github.io/master-search/` (replace `YOURUSER`).

## Data format
- `data/manifest.json` lists your chunk files:
  ```json
  { "files": ["sample-armor.json", "sample-weapons.json", "sample-items.json"] }
  ```
- Each chunk file contains: 
  ```json
  {
    "items": [
      {
        "name": "Iron Sword",
        "type": "Weapon",
        "path": ["warrior"],
        "level_tier": "0-99",
        "stats": {"ATK": 5},
        "enchants": ["+1 ATK"],
        "info": "Reliable blade for beginners.",
        "obtain": ["Craft: Blacksmith", "Drop: Cave Slime"]
      }
    ]
  }
  ```

## Development
- No build step needed. Open `index.html` directly.
- To test locally with a simple server (prevents CORS issues in some browsers):
  ```bash
  # Python 3
  python -m http.server 8080
  # then visit http://localhost:8080
  ```

## Roadmap ideas
- Web Worker for heavy filtering on large datasets.
- Fuzzy search (e.g., Fuse.js) with opt-in.
- Deep-linking filters via URL query params.
- “How to obtain” facets and drop sources.
- Pagination / virtualized table for very large lists.
- Optional dark/light theme toggle.
