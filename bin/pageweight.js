#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { analyze, formatTable, formatJSON, formatCSV, formatBytes, parseSizeString, checkBudgets } = require('../index');
const pkg = require('../package.json');

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    url: null,
    width: null,
    height: null,
    format: 'table',
    output: null,
    timeout: 60000,
    budget: null,
    budgetImage: null,
    budgetMedia: null,
    budgetScript: null,
    budgetStylesheet: null,
    budgetFont: null,
    budgetDocument: null,
    budgetPerAsset: null,
    budgetPerImage: null,
    budgetPerMedia: null,
    scroll: true,
    help: false,
    version: false,
  };

  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version' || arg === '-v') {
      options.version = true;
    } else if (arg === '--no-scroll') {
      options.scroll = false;
    } else if (arg === '--format' || arg === '-f') {
      options.format = args[++i];
    } else if (arg.startsWith('--format=')) {
      options.format = arg.split('=')[1];
    } else if (arg === '--output' || arg === '-o') {
      options.output = args[++i];
    } else if (arg.startsWith('--output=')) {
      options.output = arg.split('=')[1];
    } else if (arg === '--timeout' || arg === '-t') {
      options.timeout = parseInt(args[++i], 10);
    } else if (arg.startsWith('--timeout=')) {
      options.timeout = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--budget' || arg === '-b') {
      options.budget = args[++i];
    } else if (arg.startsWith('--budget=')) {
      options.budget = arg.split('=')[1];
    } else if (arg === '--budget-image') {
      options.budgetImage = args[++i];
    } else if (arg.startsWith('--budget-image=')) {
      options.budgetImage = arg.split('=')[1];
    } else if (arg === '--budget-media') {
      options.budgetMedia = args[++i];
    } else if (arg.startsWith('--budget-media=')) {
      options.budgetMedia = arg.split('=')[1];
    } else if (arg === '--budget-script') {
      options.budgetScript = args[++i];
    } else if (arg.startsWith('--budget-script=')) {
      options.budgetScript = arg.split('=')[1];
    } else if (arg === '--budget-stylesheet') {
      options.budgetStylesheet = args[++i];
    } else if (arg.startsWith('--budget-stylesheet=')) {
      options.budgetStylesheet = arg.split('=')[1];
    } else if (arg === '--budget-font') {
      options.budgetFont = args[++i];
    } else if (arg.startsWith('--budget-font=')) {
      options.budgetFont = arg.split('=')[1];
    } else if (arg === '--budget-document') {
      options.budgetDocument = args[++i];
    } else if (arg.startsWith('--budget-document=')) {
      options.budgetDocument = arg.split('=')[1];
    } else if (arg === '--budget-per-asset') {
      options.budgetPerAsset = args[++i];
    } else if (arg.startsWith('--budget-per-asset=')) {
      options.budgetPerAsset = arg.split('=')[1];
    } else if (arg === '--budget-per-image') {
      options.budgetPerImage = args[++i];
    } else if (arg.startsWith('--budget-per-image=')) {
      options.budgetPerImage = arg.split('=')[1];
    } else if (arg === '--budget-per-media') {
      options.budgetPerMedia = args[++i];
    } else if (arg.startsWith('--budget-per-media=')) {
      options.budgetPerMedia = arg.split('=')[1];
    } else if (arg === '--height') {
      options.height = parseInt(args[++i], 10);
    } else if (arg.startsWith('--height=')) {
      options.height = parseInt(arg.split('=')[1], 10);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  if (positional.length >= 1) options.url = positional[0];
  if (positional.length >= 2) options.width = parseInt(positional[1], 10);

  return options;
}

function printHelp() {
  console.log(`
${pkg.name} v${pkg.version}
${pkg.description}

USAGE
  pageweight <url> <viewport-width> [options]

ARGUMENTS
  url              URL of the page to analyze
  viewport-width   Width of the viewport in pixels

OPTIONS
  -h, --help                Show this help message
  -v, --version             Show version number
  -f, --format <type>       Output format: table (default), json, csv
  -o, --output <file>       Write output to a file instead of stdout
  -t, --timeout <ms>        Navigation timeout in milliseconds (default: 60000)
      --height <px>         Viewport height in pixels (defaults to viewport-width,
                            making the viewport square)
      --no-scroll           Skip scrolling to the bottom of the page

BUDGET OPTIONS (all sizes accept B, KB, MB, GB — e.g. 1MB, 500KB)
  -b, --budget <size>       Total page weight budget
      --budget-image <size>       Max total weight for all images combined
      --budget-media <size>       Max total weight for all media (video/audio) combined
      --budget-script <size>      Max total weight for all scripts combined
      --budget-stylesheet <size>  Max total weight for all stylesheets combined
      --budget-font <size>        Max total weight for all fonts combined
      --budget-document <size>    Max total weight for all documents combined
      --budget-per-asset <size>   Max weight for any single asset
      --budget-per-image <size>   Max weight for any single image
      --budget-per-media <size>   Max weight for any single media file

  Exits with code 1 if any budget is exceeded.

EXAMPLES
  pageweight https://example.com 1440
  pageweight https://example.com 1440 --format json
  pageweight https://example.com 1440 --format csv --output results.csv
  pageweight https://example.com 1440 --budget 1MB
  pageweight https://example.com 1440 --budget 2MB --budget-image 500KB --budget-per-image 200KB
  pageweight https://example.com 1440 --budget-media 5MB --budget-per-media 2MB
  pageweight https://example.com 1440 --height 900
  pageweight https://example.com 1440 --no-scroll --timeout 30000
`);
}

function validateOptions(options) {
  if (!options.url) {
    console.error('Error: URL is required.');
    console.error('Run "pageweight --help" for usage information.');
    process.exit(1);
  }

  try {
    new URL(options.url);
  } catch {
    if (!options.url.startsWith('http://') && !options.url.startsWith('https://')) {
      options.url = 'https://' + options.url;
      try {
        new URL(options.url);
      } catch {
        console.error(`Error: "${options.url}" is not a valid URL.`);
        process.exit(1);
      }
    } else {
      console.error(`Error: "${options.url}" is not a valid URL.`);
      process.exit(1);
    }
  }

  if (!options.width || isNaN(options.width) || options.width <= 0) {
    console.error('Error: Viewport width must be a positive integer.');
    console.error('Run "pageweight --help" for usage information.');
    process.exit(1);
  }

  if (options.height !== null && (isNaN(options.height) || options.height <= 0)) {
    console.error('Error: Viewport height must be a positive integer.');
    process.exit(1);
  }

  const validFormats = ['table', 'json', 'csv'];
  if (!validFormats.includes(options.format)) {
    console.error(`Error: Invalid format "${options.format}". Must be one of: ${validFormats.join(', ')}`);
    process.exit(1);
  }

  if (isNaN(options.timeout) || options.timeout <= 0) {
    console.error('Error: Timeout must be a positive number.');
    process.exit(1);
  }
}

async function main() {
  const options = parseArgs(process.argv);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.version) {
    console.log(`${pkg.name} v${pkg.version}`);
    process.exit(0);
  }

  validateOptions(options);

  const budgets = {};
  const budgetFlags = {
    budget: 'total',
    budgetImage: 'image',
    budgetMedia: 'media',
    budgetScript: 'script',
    budgetStylesheet: 'stylesheet',
    budgetFont: 'font',
    budgetDocument: 'document',
    budgetPerAsset: 'perAsset',
    budgetPerImage: 'perImage',
    budgetPerMedia: 'perMedia',
  };

  for (const [optKey, budgetKey] of Object.entries(budgetFlags)) {
    if (options[optKey] != null) {
      try {
        parseSizeString(options[optKey]);
      } catch (err) {
        console.error(`Error in --${optKey.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${err.message}`);
        process.exit(1);
      }
      budgets[budgetKey] = options[optKey];
    }
  }

  const hasBudgets = Object.keys(budgets).length > 0;
  const viewportHeight = options.height || options.width;

  console.log(`\nAnalyzing page weight for: ${options.url}`);
  console.log(`Viewport: ${options.width}x${viewportHeight}`);
  if (!options.scroll) console.log('Scrolling: disabled');
  if (hasBudgets) {
    const budgetSummary = Object.entries(budgets)
      .map(([key, val]) => `${key}: ${val}`)
      .join(', ');
    console.log(`Budgets: ${budgetSummary}`);
  }
  console.log('');

  try {
    const result = await analyze({
      url: options.url,
      width: options.width,
      height: viewportHeight,
      timeout: options.timeout,
      scroll: options.scroll,
    });

    let output;
    switch (options.format) {
      case 'json':
        output = formatJSON(result.assets, {
          url: result.url,
          viewport: result.viewport,
        });
        break;
      case 'csv':
        output = formatCSV(result.assets);
        break;
      default:
        output = formatTable(result.assets);
        break;
    }

    if (options.output) {
      const outputPath = path.resolve(options.output);
      fs.writeFileSync(outputPath, output + '\n', 'utf-8');
      console.log(`Results written to ${outputPath}`);
    } else {
      console.log(output);
    }

    if (hasBudgets) {
      const violations = checkBudgets(result.assets, budgets);
      if (violations.length > 0) {
        console.error(`\nBudget exceeded! ${violations.length} ${violations.length === 1 ? 'violation' : 'violations'} found:\n`);
        for (const v of violations) {
          console.error(`  ✗ ${v.message}`);
        }
        console.error('');
        process.exit(1);
      }
    }
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    if (err.message.includes('net::ERR_')) {
      console.error('Hint: Check that the URL is correct and the site is reachable.');
    } else if (err.message.includes('timeout')) {
      console.error(`Hint: The page did not load within ${options.timeout}ms. Try increasing --timeout.`);
    }
    process.exit(1);
  }
}

main();
