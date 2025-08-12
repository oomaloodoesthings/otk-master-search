# OTK Master Search

**OTK Master Search** is a web-based search tool for the game [OriginalTK](https://originaltk.com/), designed to make it easy to find and compare in-game items — including **armor, weapons, and miscellaneous items** — all in one place.

The site consolidates information scattered across the OriginalTK website into a single searchable, filterable, and sortable interface. It’s built with **vanilla JavaScript, HTML, and CSS**, and runs entirely client-side, making it fast and easy to host via GitHub Pages.

---

## Features

### 🔍 Search
- Search by **partial name** for any item across all loaded JSON data chunks.
- Results update instantly as you type.

### 📂 Filtering
- **Category chips** for quick filtering by type: Armor, Weapon, Item.
- **Path chips** to filter by class (Peasant, Mage, Poet, Warrior, Rogue).
- **Level chips** (1–99, Il San, Ee San, Sam San) for filtering gear level requirements.
- **Select All / Select None** buttons for each filter group.

### 📊 Sorting
- Click on any stat (e.g., AC, Hit) in a result to sort by that stat.
- AC sorts in **ascending order** (lowest is best), other stats sort in **descending order**.
- Shift-click a stat to reverse the sort direction.
- Reset sorting with the clear button.

### 📦 Infinite Scroll
- Loads the first 20 results initially, then automatically loads more as you scroll.
- Helps keep the page responsive even with thousands of items.

### 🖼 Different Layouts by Category
- **Armor/Weapons** use a tabular view with Stats, Enchants, Info, and How to Obtain.
- **Items** use a card-based view showing:
  - Name
  - Vita / Mana
  - Stack Size
  - Crafts / Other Uses
  - Effect
  - How to Obtain
  - Comments
  - NPC Buy Price

### ⏳ Loading Screen
- Displays a progress overlay while JSON data chunks are loading.
- Shows the number of items loaded so far.

### 📜 Changelog
- Read-only for visitors.
- Admin can add entries locally and export to `data/changelog.json` for commit.
- Toggleable panel to view development history.

---

## Roadmap
Here are some future improvements and ideas for the project:

📈 Enhanced Stats Comparison

Ability to “pin” items to compare their stats side-by-side.

🔄 Live Changelog Sync

Optional GitHub Actions workflow to append changelog entries via GitHub Issues.

📥 Data Caching

Cache JSON data in the browser to avoid re-fetching on every visit.

📱 Mobile Optimization

Tighter mobile view with collapsible filters.

💬 Tooltips

Show brief explanations for stats or special effects on hover/tap.

⚙ Advanced Search

Query syntax for combined searches (e.g., ac:-5 path:mage).

📊 Usage Analytics (Opt-in)

Track popular searches and filters to guide future improvements.
