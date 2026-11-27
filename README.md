# pageweight

A Node.js CLI tool and TypeScript library that measures the total weight of a webpage on initial load. It catalogues every asset the browser fetches — scripts, stylesheets, images, fonts, and more — and presents a formatted breakdown grouped by type and sorted by size.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [How It Works](#how-it-works)
- [Output](#output)
- [Page Weight Budgets](#page-weight-budgets)
- [Programmatic API](#programmatic-api)
- [Chrome Extension](#chrome-extension)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

- Calculates the total transfer size of all assets loaded during a page visit
- Groups assets by type (Script, Stylesheet, Image, Font, Media, Document, and more)
- Sorts each group by size in descending order
- Simulates real user behaviour by scrolling to the bottom of the page, capturing lazy-loaded resources
- Supports configurable viewport width so you can compare asset loads across breakpoints
- Configurable viewport height for non-square viewports
- Multiple output formats: table (default), JSON, CSV
- File output via `--output`
- Page weight budgets — total, per-type group, and per-asset limits for CI/CD pipelines
- Typed TypeScript programmatic API for use as a library (ESM and Node 26 `require()` compatible)

## Prerequisites

- **Node.js** v26 LTS or later (see `.nvmrc`)
- **npm** (bundled with Node.js)

Puppeteer requires a compatible Chromium binary. If your npm version restricts install scripts, run `npx puppeteer browsers install chrome` after installing dependencies.

## Installation

### Global install (recommended)

Install the package globally to make the `pageweight` command available everywhere:

```bash
npm install -g @briananders/pageweight
```

### Local install

Clone the repository, install dependencies, and compile TypeScript:

```bash
git clone https://github.com/briananders/pageweight.git
cd pageweight
npm install
npm run build
```

Then run the compiled CLI with:

```bash
node dist/bin/pageweight.js <url> <viewport-width>
```

Or run directly from TypeScript source on Node 26:

```bash
node src/bin/pageweight.ts <url> <viewport-width>
```

### Run without installing

Use `npx` to run the tool directly:

```bash
npx @briananders/pageweight <url> <viewport-width>
```

## Usage

```
pageweight <url> <viewport-width> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `url` | The full URL of the page to analyze (include `https://`) |
| `viewport-width` | The viewport width in pixels — the viewport height defaults to the same value, creating a square viewport |

### Options

| Option | Description |
|--------|-------------|
| `-h, --help` | Show help message |
| `-v, --version` | Show version number |
| `-f, --format <type>` | Output format: `table` (default), `json`, `csv` |
| `-o, --output <file>` | Write output to a file instead of stdout |
| `-t, --timeout <ms>` | Navigation timeout in milliseconds (default: 60000) |
| `--height <px>` | Viewport height in pixels (defaults to viewport-width, making the viewport square) |
| `--no-scroll` | Skip scrolling to the bottom of the page |

### Budget Options

All budget sizes accept a number optionally followed by `B`, `KB`, `MB`, or `GB` (e.g. `1MB`, `500KB`, `2.5MB`). If no unit is specified, bytes are assumed. The tool exits with code 1 if any budget is exceeded.

| Option | Description |
|--------|-------------|
| `-b, --budget <size>` | Total page weight budget |
| `--budget-image <size>` | Max total weight for all images combined |
| `--budget-media <size>` | Max total weight for all media (video/audio) combined |
| `--budget-script <size>` | Max total weight for all scripts combined |
| `--budget-stylesheet <size>` | Max total weight for all stylesheets combined |
| `--budget-font <size>` | Max total weight for all fonts combined |
| `--budget-document <size>` | Max total weight for all documents combined |
| `--budget-per-asset <size>` | Max weight for any single asset |
| `--budget-per-image <size>` | Max weight for any single image |
| `--budget-per-media <size>` | Max weight for any single media file |

### Examples

Analyze a page at a desktop viewport width:

```bash
pageweight https://briananders.com 1440
```

Analyze a page at a tablet viewport width:

```bash
pageweight https://briananders.com 768
```

Analyze a page at a mobile viewport width:

```bash
pageweight https://briananders.com 375
```

Export results as JSON:

```bash
pageweight https://example.com 1440 --format json
```

Save CSV results to a file:

```bash
pageweight https://example.com 1440 --format csv --output results.csv
```

Set a page weight budget (CI-friendly — exits with code 1 if exceeded):

```bash
pageweight https://example.com 1440 --budget 1MB
```

Enforce image budgets (total and per-file):

```bash
pageweight https://example.com 1440 --budget-image 500KB --budget-per-image 200KB
```

Enforce media/video budgets:

```bash
pageweight https://example.com 1440 --budget-media 5MB --budget-per-media 2MB
```

Combine multiple budget constraints:

```bash
pageweight https://example.com 1440 \
  --budget 2MB \
  --budget-image 500KB \
  --budget-media 5MB \
  --budget-script 300KB \
  --budget-per-asset 1MB
```

Custom viewport height (non-square):

```bash
pageweight https://example.com 1440 --height 900
```

Skip scrolling and use a shorter timeout:

```bash
pageweight https://example.com 1440 --no-scroll --timeout 30000
```

## How It Works

1. Launches a headless Chromium instance via [Puppeteer](https://pptr.dev/)
2. Sets the viewport to the given width and height (defaults to a square)
3. Navigates to the target URL and waits until network activity settles
4. Scrolls from the top of the page to the bottom at a measured pace, triggering any lazy-loaded assets (unless `--no-scroll` is used)
5. Waits briefly for remaining network requests to complete
6. Collects the transfer size and MIME type of every request made by the browser via Chrome DevTools Protocol
7. Prints or exports results in the chosen format (table, JSON, or CSV)

Different viewport widths can cause different assets to load (responsive images, conditional scripts, etc.), so running the tool at multiple widths gives a more complete picture of your page's weight profile.

## Output

### Table (default)

The default output is a formatted table printed to stdout. Assets are grouped by type and each group is sorted largest-first. A grand total is displayed at the end.

```
----------------------------------------------------------------------------------------------------
  Image (3 files) — Total: 1.20 MB
----------------------------------------------------------------------------------------------------
       800.00 KB  https://example.com/hero.webp
       350.00 KB  https://example.com/photo.jpg
        50.00 KB  https://example.com/icon.svg

----------------------------------------------------------------------------------------------------
  Script (2 files) — Total: 320.00 KB
----------------------------------------------------------------------------------------------------
       250.00 KB  https://example.com/bundle.js
        70.00 KB  https://example.com/analytics.js

====================================================================================================
  TOTAL PAGE WEIGHT: 1.52 MB (5 requests)
====================================================================================================
```

### JSON

Structured JSON with full metadata including per-group totals and a summary:

```json
{
  "url": "https://example.com",
  "viewport": { "width": 1440, "height": 1440 },
  "timestamp": "2026-11-24T12:00:00.000Z",
  "summary": {
    "totalSize": 524288,
    "totalSizeFormatted": "512.00 KB",
    "totalRequests": 15
  },
  "groups": {
    "Script": {
      "count": 5,
      "totalSize": 262144,
      "totalSizeFormatted": "256.00 KB",
      "assets": []
    }
  }
}
```

### CSV

Comma-separated values with columns: `type`, `url`, `size_bytes`, `size_formatted`.

## Page Weight Budgets

The budget flags are designed for CI/CD pipelines. Set maximum weight constraints and the tool will exit with code 1 if any budget is exceeded, printing all violations.

### Overall budget

```bash
pageweight https://example.com 1440 --budget 2MB
```

### Per-type group budgets

Limit the total weight of all assets within a type:

```bash
pageweight https://example.com 1440 --budget-image 500KB --budget-script 300KB
```

### Per-asset budgets

Limit the weight of any single asset. Use `--budget-per-asset` for a universal limit, or `--budget-per-image` / `--budget-per-media` for type-specific limits:

```bash
pageweight https://example.com 1440 --budget-per-image 200KB --budget-per-media 2MB
```

### Combining budgets

All budget flags can be used together. Every constraint is checked independently:

```bash
pageweight https://example.com 1440 \
  --budget 2MB \
  --budget-image 500KB \
  --budget-per-image 200KB \
  --budget-media 5MB \
  --budget-per-media 2MB \
  --budget-script 300KB
```

Budget sizes accept: `B`, `KB`, `MB`, `GB`, or plain numbers (bytes).

## Programmatic API

You can import `pageweight` as a typed ESM module (or via `require()` on Node 26):

```typescript
import {
  analyze,
  formatTable,
  formatJSON,
  formatCSV,
  checkBudgets,
  parseSizeString,
} from '@briananders/pageweight';

const result = await analyze({
  url: 'https://example.com',
  width: 1440,
  height: 900,       // optional, defaults to width
  timeout: 60000,    // optional
  scroll: true,      // optional
});

console.log(result.totalSizeFormatted); // e.g. "1.23 MB"
console.log(result.requestCount);       // e.g. 42

// Format as table, JSON, or CSV
console.log(formatTable(result.assets));
console.log(formatJSON(result.assets, { url: result.url, viewport: result.viewport }));
console.log(formatCSV(result.assets));
```

### `analyze(options)` -> `Promise<AnalyzeResult>`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | *required* | URL to analyze |
| `width` | `number` | *required* | Viewport width in pixels |
| `height` | `number` | `width` | Viewport height in pixels |
| `timeout` | `number` | `60000` | Navigation timeout in ms |
| `scroll` | `boolean` | `true` | Whether to scroll to bottom |
| `waitAfterScroll` | `number` | `2000` | Time to wait after scrolling (ms) |

### Result Object

| Property | Type | Description |
|----------|------|-------------|
| `url` | `string` | The analyzed URL |
| `viewport` | `{ width: number; height: number }` | The viewport dimensions used |
| `assets` | `AnalyzedAsset[]` | All loaded assets with `url`, `type`, `mimeType`, `statusCode`, `size` |
| `totalSize` | `number` | Total page weight in bytes |
| `totalSizeFormatted` | `string` | Human-readable total size |
| `requestCount` | `number` | Total number of requests |

### Programmatic budget checking

```typescript
import { analyze, checkBudgets } from '@briananders/pageweight';

const result = await analyze({ url: 'https://example.com', width: 1440 });

const violations = checkBudgets(result.assets, {
  total: '2MB',
  image: '500KB',
  media: '5MB',
  perImage: '200KB',
  perMedia: '2MB',
  script: '300KB',
  perAsset: '1MB',
});

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation.message);
  }
}
```

## Chrome Extension

Pageweight also ships as a Manifest V3 Chrome Side Panel extension that shares the same classification, formatting, and budget engine as the CLI and library.

### Build and Load Unpacked in Chrome

1. Install dependencies and build the extension bundle:

```bash
npm install
npm run build:extension
```

2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select the generated `dist-extension/` directory.
4. Navigate to any `http://` or `https://` page and click the **Pageweight** toolbar icon to open the side panel.

### How the Extension Works

- Clicking **Analyze Page** attaches Chrome's DevTools Protocol debugger (`Network` and `Page` domains) to the active tab, reloads the page (optionally bypassing cache for a true cold-load measurement), optionally scrolls the page to trigger lazy-loaded assets, records exact transfer byte sizes across first-party and cross-origin requests, and detaches immediately when finished.
- All inspection runs strictly on-device with zero external servers, zero analytics, and a `connect-src 'none'` Content Security Policy. The latest scan report lives only in ephemeral browser session memory (`chrome.storage.session`, cleared on browser close or via **Clear Report**), while optional size budgets and scan checkboxes stay on-device in `chrome.storage.local`.
- Reports can be copied to the clipboard or downloaded as a formatted text table, JSON, or CSV directly from the side panel.

### Packaging for Chrome Web Store Submission

Build and package a clean Chrome Web Store submission ZIP (no source maps or dev files):

```bash
npm run package:extension
```

This creates `release/pageweight-v2.0.0.zip`. Store listing copy, permission justifications, privacy policy (`docs/privacy.html`), and store graphics (`store-assets/`) are tracked in `CHROMEWEBSTORE.md`.

## Development

The codebase is written in strict TypeScript under `src/` (CLI/library) and `extension/` (Chrome extension):

- `src/types.ts` — Shared interfaces and domain types
- `src/classify.ts` — MIME/extension classification, byte formatting, and size parsing
- `src/formatters.ts` — Asset grouping, sorting, and table/JSON/CSV exporters
- `src/budgets.ts` — Total, per-group, and per-asset budget evaluation
- `src/scraper.ts` — Puppeteer and Chrome DevTools Protocol network collector
- `src/cli.ts` — CLI argument parsing, validation, formatting, and file export
- `src/bin/pageweight.ts` — Executable CLI entrypoint
- `src/index.ts` — Public library barrel
- `extension/manifest.json` — Manifest V3 extension configuration
- `extension/src/service-worker.ts` — MV3 service worker running CDP scans over port messaging
- `extension/src/sidepanel.ts` — Side panel controller for budgets, breakdown visualization, and export
- `extension/src/collector.ts` — Shared CDP network event collector for the extension
- `extension/sidepanel/` — Responsive light/dark HTML and CSS for the Chrome side panel

Useful scripts:

```bash
npm run typecheck          # Strict TypeScript checks across src/, test/, scripts/, and extension/
npm run build              # Compile CLI/library from src/ to dist/ and set executable bin permissions
npm run build:extension    # Compile and stage the Chrome extension into dist-extension/
npm run package:extension  # Build and zip release/pageweight-v2.0.0.zip for Chrome Web Store
npm run build:all          # Build both CLI/library and Chrome extension
npm test                   # Build everything, package extension, and run the full automated test suite
```

### Publishing to npm

The package is configured for public scoped publishing (`publishConfig.access = "public"`), runs `npm run typecheck && npm test` automatically via `prepublishOnly`, and includes `.github/workflows/publish.yml` to publish with npm provenance when a GitHub Release is published (requires an `NPM_TOKEN` repository secret). To publish manually:

```bash
npm login
npm pack --dry-run
npm publish
```

## Contributing

Contributions are welcome. To get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b my-feature`)
3. Commit your changes (`git commit -m "Add my feature"`)
4. Push to the branch (`git push origin my-feature`)
5. Open a pull request

Please open an [issue](https://github.com/briananders/pageweight/issues) first if you plan a large change so it can be discussed.

## License

This project is licensed under the [ISC License](https://opensource.org/licenses/ISC).
