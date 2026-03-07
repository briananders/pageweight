# Page-weight

Simple node package that calculates the overall weight of a webpage on initial load without click interactions.

Supply your URL in the command line, and a viewport width. The script will do the rest.

```bash
pageweight https://briananders.com 1440
```

The script works by spinning up a headless Chrome instance, setting the viewport, and then loading the page. Then, the webpage scrolls down to the bottom of the page at a reasonable rate. While all of this is happening, the script will catalog each asset that is loaded in the browser, along with its overall weight. The output of the script will be a formatted table that lists each artifact, grouped by type, and sorted by overall weight. Different assets will load at different viewport widths, and this script will calculate those values and provide them to you.

## Installation

```bash
npm install -g pageweight
```

## Usage

```
pageweight <url> <viewport-width> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `url` | URL of the page to analyze |
| `viewport-width` | Width of the viewport in pixels |

### Options

| Option | Description |
|--------|-------------|
| `-h, --help` | Show help message |
| `-v, --version` | Show version number |
| `-f, --format <type>` | Output format: `table` (default), `json`, `csv` |
| `-o, --output <file>` | Write output to a file instead of stdout |
| `-t, --timeout <ms>` | Navigation timeout in milliseconds (default: 60000) |
| `-b, --budget <size>` | Page weight budget (e.g. `1MB`, `500KB`). Exits with code 1 if total weight exceeds the budget |
| `--height <px>` | Viewport height in pixels (defaults to viewport-width, making the viewport square) |
| `--no-scroll` | Skip scrolling to the bottom of the page |

## Examples

Basic usage with table output:

```bash
pageweight https://example.com 1440
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

Custom viewport height (non-square):

```bash
pageweight https://example.com 1440 --height 900
```

Skip scrolling and use a shorter timeout:

```bash
pageweight https://example.com 1440 --no-scroll --timeout 30000
```

## Output Formats

### Table (default)

A human-readable table grouped by asset type and sorted by size.

### JSON

Structured JSON with full metadata including per-group totals and a summary:

```json
{
  "url": "https://example.com",
  "viewport": { "width": 1440, "height": 1440 },
  "timestamp": "2026-03-07T12:00:00.000Z",
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
      "assets": [...]
    }
  }
}
```

### CSV

Comma-separated values with columns: `type`, `url`, `size_bytes`, `size_formatted`.

## Programmatic API

You can also use page-weight as a library:

```javascript
const { analyze, formatTable, formatJSON, formatCSV } = require('pageweight');

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

### `analyze(options)` → `Promise<Result>`

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
| `viewport` | `{width, height}` | The viewport dimensions used |
| `assets` | `Array` | All loaded assets with url, type, mimeType, statusCode, size |
| `totalSize` | `number` | Total page weight in bytes |
| `totalSizeFormatted` | `string` | Human-readable total size |
| `requestCount` | `number` | Total number of requests |

## Page Weight Budget

The `--budget` flag is designed for CI/CD pipelines. Set a maximum page weight and the tool will exit with code 1 if the total exceeds the budget:

```bash
pageweight https://example.com 1440 --budget 2MB
```

Budget supports these units: `B`, `KB`, `MB`, `GB`. If no unit is specified, bytes are assumed.

## License

ISC
