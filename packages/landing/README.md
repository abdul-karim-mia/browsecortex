# 🌐 @browsecortex/landing

The official, premium landing page for the **BrowseCortex** open-source AI browser assistant. Built using Vite, TypeScript, Vanilla CSS, and custom interactive components.

---

## ✨ Features

- **Agent Loop Simulator**: An interactive preview showing the AI agent analyzing, navigating, and completing tasks in real-time.
- **Dynamic Repository Stats**: Integrates with the GitHub API to dynamically retrieve repository stars, forks, and open issues.
- **Contributor Avatar Grid**: Dynamically fetches and renders the avatars of the project's top contributors with profile tooltips.
- **Interactive Capabilities Accordion**: Provides detailed descriptions of under-the-hood features (like MCP, vision fallbacks, and encrypted backups) with smooth CSS height-expansion transitions.
- **SEO & JSON-LD Optimized**: Structured schemas, meta tags, and Open Graph/Twitter card tags utilizing local brand assets for rich visual previews.
- **Fully Responsive**: Crafted with modern flexbox and grid layouts, scaling beautifully from mobile screens up to wide desktop monitors.

---

## 📁 Package Layout

```text
packages/landing/
├── index.html        # Entry page with SEO tags, JSON-LD schema, and SVG icons
├── style.css         # Modern dark-mode theme, bento grids, and accordion styles
├── main.ts           # Agent loop script, GitHub API integrations, and UI state logic
├── vite.config.ts    # Build, output, and local server configurations
├── tsconfig.json     # Isolated TypeScript compilation settings
├── package.json      # Dependencies and dev/build script targets
└── public/           # Static logo, favicon, and social share assets
```

---

## 🛠️ Development & Build

Ensure you have installed packages from the root workspace directory before starting.

### Start Local Development Server

Starts a local hot-reloading development server on port 3000:

```bash
npm run dev --workspace=@browsecortex/landing
```

### Build for Production

Compiles and minifies the page assets into `packages/landing/dist`:

```bash
npm run build --workspace=@browsecortex/landing
```

### Preview the Build

Runs a preview server pointing to the built distribution assets:

```bash
npm run preview --workspace=@browsecortex/landing
```

### Run Typechecker

Verify TypeScript code correctness without emitting files:

```bash
npm run typecheck --workspace=@browsecortex/landing
```
