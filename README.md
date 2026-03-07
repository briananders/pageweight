# Page-weight

A Node.js CLI tool that measures the total weight of a webpage on initial load. It catalogues every asset the browser fetches — scripts, stylesheets, images, fonts, and more — and presents a formatted breakdown grouped by type and sorted by size.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [How It Works](#how-it-works)
- [Output](#output)
- [Contributing](#contributing)
- [License](#license)

## Features

- Calculates the total transfer size of all assets loaded during a page visit
- Groups assets by type (Script, Stylesheet, Image, Font, Media, Document, and more)
- Sorts each group by size in descending order
- Simulates real user behaviour by scrolling to the bottom of the page, capturing lazy-loaded resources
- Supports configurable viewport width so you can compare asset loads across breakpoints

## Prerequisites

- **Node.js** v18 or later
- **npm** (bundled with Node.js)

Puppeteer downloads a compatible version of Chromium automatically during installation, so no separate browser install is required.

## Installation

### Global install (recommended)

Install the package globally to make the `pageweight` command available everywhere:

```bash
npm install -g pageweight
```

### Local install

Clone the repository and install dependencies:

```bash
git clone https://github.com/briananders/Page-weight.git
cd Page-weight
npm install
```

Then run the tool with:

```bash
node bin/pageweight.js <url> <viewport-width>
```

### Run without installing

Use `npx` to run the tool directly:

```bash
npx pageweight <url> <viewport-width>
```

## Usage

```
pageweight <url> <viewport-width>
```

| Argument | Description |
|---|---|
| `url` | The full URL of the page to analyze (include `https://`) |
| `viewport-width` | The viewport width in pixels — the viewport height is set to the same value, creating a square viewport |

Both arguments are required.

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

## How It Works

1. Launches a headless Chromium instance via [Puppeteer](https://pptr.dev/)
2. Sets the viewport to a square of the given width (e.g. 1440 × 1440)
3. Navigates to the target URL and waits until network activity settles
4. Scrolls from the top of the page to the bottom at a measured pace, triggering any lazy-loaded assets
5. Waits briefly for remaining network requests to complete
6. Collects the transfer size and MIME type of every request made by the browser
7. Prints a summary table to the terminal

Different viewport widths can cause different assets to load (responsive images, conditional scripts, etc.), so running the tool at multiple widths gives a more complete picture of your page's weight profile.

## Output

The output is a formatted table printed to stdout. Assets are grouped by type and each group is sorted largest-first. A grand total is displayed at the end.

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

## Contributing

Contributions are welcome. To get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b my-feature`)
3. Commit your changes (`git commit -m "Add my feature"`)
4. Push to the branch (`git push origin my-feature`)
5. Open a pull request

Please open an [issue](https://github.com/briananders/Page-weight/issues) first if you plan a large change so it can be discussed.

## License

This project is licensed under the [ISC License](https://opensource.org/licenses/ISC).
