import fs from 'node:fs';
import path from 'node:path';
import {
  analyze,
  checkBudgets,
  formatCSV,
  formatJSON,
  formatTable,
  parseSizeString,
} from './index.ts';
import type {
  AnalyzeResult,
  BudgetRuleKey,
  Budgets,
  CliOptions,
  OutputFormat,
} from './types.ts';

interface PackageMetadata {
  name: string;
  version: string;
  description: string;
}

type BudgetOptionKey =
  | 'budget'
  | 'budgetImage'
  | 'budgetMedia'
  | 'budgetScript'
  | 'budgetStylesheet'
  | 'budgetFont'
  | 'budgetDocument'
  | 'budgetPerAsset'
  | 'budgetPerImage'
  | 'budgetPerMedia';

const VALID_FORMATS: readonly OutputFormat[] = ['table', 'json', 'csv'];

const BUDGET_FLAG_TO_OPTION: Record<string, BudgetOptionKey> = {
  '--budget': 'budget',
  '-b': 'budget',
  '--budget-image': 'budgetImage',
  '--budget-media': 'budgetMedia',
  '--budget-script': 'budgetScript',
  '--budget-stylesheet': 'budgetStylesheet',
  '--budget-font': 'budgetFont',
  '--budget-document': 'budgetDocument',
  '--budget-per-asset': 'budgetPerAsset',
  '--budget-per-image': 'budgetPerImage',
  '--budget-per-media': 'budgetPerMedia',
};

const BUDGET_OPTION_TO_RULE: Record<BudgetOptionKey, BudgetRuleKey> = {
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

/**
 * Error thrown when CLI arguments or options fail validation.
 */
export class CliValidationError extends Error {
  readonly hint: string | undefined;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'CliValidationError';
    this.hint = hint;
  }
}

/**
 * Read package name, version, and description from package.json.
 */
export function readPackageMetadata(): PackageMetadata {
  // Both src/cli.ts and compiled dist/cli.js sit one directory below the package root.
  const packageJsonPath = new URL('../package.json', import.meta.url);
  const rawContents = fs.readFileSync(packageJsonPath, 'utf-8');
  return JSON.parse(rawContents) as PackageMetadata;
}

/**
 * Read the value following a flag that expects an argument, throwing if none is supplied.
 */
function readNextArgValue(args: readonly string[], currentIndex: number, flag: string): string {
  const value = args[currentIndex + 1];
  if (value === undefined) {
    throw new CliValidationError(`Missing value for option: ${flag}`);
  }
  return value;
}

/**
 * Split a "--flag=value" argument into its flag name and inline value when present.
 */
function splitInlineFlag(arg: string): { flag: string; inlineValue: string | null } {
  const equalsIndex = arg.indexOf('=');
  if (equalsIndex === -1) {
    return { flag: arg, inlineValue: null };
  }
  return {
    flag: arg.slice(0, equalsIndex),
    inlineValue: arg.slice(equalsIndex + 1),
  };
}

/**
 * Parse raw process.argv tokens into a structured CliOptions object.
 */
export function parseArgs(argv: readonly string[]): CliOptions {
  const args = argv.slice(2);
  const options: CliOptions = {
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

  const positional: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--version' || arg === '-v') {
      options.version = true;
      continue;
    }
    if (arg === '--no-scroll') {
      options.scroll = false;
      continue;
    }
    if (!arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }

    const { flag, inlineValue } = splitInlineFlag(arg);

    const resolveValue = (): string => {
      if (inlineValue !== null) {
        return inlineValue;
      }
      const nextValue = readNextArgValue(args, index, flag);
      index++;
      return nextValue;
    };

    if (flag === '--format' || flag === '-f') {
      options.format = resolveValue();
      continue;
    }
    if (flag === '--output' || flag === '-o') {
      options.output = resolveValue();
      continue;
    }
    if (flag === '--timeout' || flag === '-t') {
      options.timeout = parseInt(resolveValue(), 10);
      continue;
    }
    if (flag === '--height') {
      options.height = parseInt(resolveValue(), 10);
      continue;
    }

    const budgetOptionKey = BUDGET_FLAG_TO_OPTION[flag];
    if (budgetOptionKey) {
      options[budgetOptionKey] = resolveValue();
      continue;
    }

    throw new CliValidationError(`Unknown option: ${arg}`);
  }

  if (positional[0] !== undefined) {
    options.url = positional[0];
  }
  if (positional[1] !== undefined) {
    options.width = parseInt(positional[1], 10);
  }

  return options;
}

/**
 * Format the CLI help text including usage, flags, budgets, and examples.
 */
export function buildHelpText(pkg: PackageMetadata): string {
  return `
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
`;
}

/**
 * Normalize and validate a URL string, prepending https:// when no scheme is provided.
 */
function normalizeUrl(rawUrl: string): string {
  try {
    new URL(rawUrl);
    return rawUrl;
  } catch {
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      const candidateUrl = `https://${rawUrl}`;
      try {
        new URL(candidateUrl);
        return candidateUrl;
      } catch {
        throw new CliValidationError(`Error: "${candidateUrl}" is not a valid URL.`);
      }
    }
    throw new CliValidationError(`Error: "${rawUrl}" is not a valid URL.`);
  }
}

/**
 * Check whether a string matches one of the supported output format identifiers.
 */
function isOutputFormat(value: string): value is OutputFormat {
  return (VALID_FORMATS as readonly string[]).includes(value);
}

/**
 * Validate parsed CLI options and normalize the target URL, returning typed validated parameters.
 */
export function validateOptions(options: CliOptions): {
  url: string;
  width: number;
  height: number;
  format: OutputFormat;
  output: string | null;
  timeout: number;
  scroll: boolean;
} {
  if (!options.url) {
    throw new CliValidationError(
      'Error: URL is required.',
      'Run "pageweight --help" for usage information.'
    );
  }

  const normalizedUrl = normalizeUrl(options.url);

  if (options.width === null || Number.isNaN(options.width) || options.width <= 0) {
    throw new CliValidationError(
      'Error: Viewport width must be a positive integer.',
      'Run "pageweight --help" for usage information.'
    );
  }

  if (options.height !== null && (Number.isNaN(options.height) || options.height <= 0)) {
    throw new CliValidationError('Error: Viewport height must be a positive integer.');
  }

  if (!isOutputFormat(options.format)) {
    throw new CliValidationError(
      `Error: Invalid format "${options.format}". Must be one of: ${VALID_FORMATS.join(', ')}`
    );
  }

  if (Number.isNaN(options.timeout) || options.timeout <= 0) {
    throw new CliValidationError('Error: Timeout must be a positive number.');
  }

  const viewportHeight = options.height ?? options.width;

  return {
    url: normalizedUrl,
    width: options.width,
    height: viewportHeight,
    format: options.format,
    output: options.output,
    timeout: options.timeout,
    scroll: options.scroll,
  };
}

/**
 * Extract and validate all budget flags from parsed CLI options.
 */
export function buildBudgetsFromOptions(options: CliOptions): Budgets {
  const budgets: Budgets = {};
  const entries = Object.entries(BUDGET_OPTION_TO_RULE) as [BudgetOptionKey, BudgetRuleKey][];

  for (const [optionKey, ruleKey] of entries) {
    const rawValue = options[optionKey];
    if (rawValue === null) {
      continue;
    }

    try {
      parseSizeString(rawValue);
    } catch (error) {
      const flagName = optionKey.replace(/([A-Z])/g, '-$1').toLowerCase();
      let errorMessage = 'Invalid size';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      throw new CliValidationError(`Error in --${flagName}: ${errorMessage}`);
    }

    budgets[ruleKey] = rawValue;
  }

  return budgets;
}

/**
 * Format an analysis result using the selected CLI export format.
 */
export function formatOutput(result: AnalyzeResult, format: OutputFormat): string {
  if (format === 'json') {
    return formatJSON(result.assets, {
      url: result.url,
      viewport: result.viewport,
    });
  }
  if (format === 'csv') {
    return formatCSV(result.assets);
  }
  return formatTable(result.assets);
}

/**
 * Write formatted report content to a resolved file path on disk.
 */
export function writeOutputFile(outputTarget: string, content: string): string {
  const resolvedPath = path.resolve(outputTarget);
  fs.writeFileSync(resolvedPath, `${content}\n`, 'utf-8');
  return resolvedPath;
}

/**
 * Run the full pageweight CLI workflow and return a process exit code.
 */
export async function runCli(argv: readonly string[]): Promise<number> {
  const pkg = readPackageMetadata();

  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof CliValidationError) {
      console.error(error.message);
      if (error.hint) {
        console.error(error.hint);
      }
      return 1;
    }
    throw error;
  }

  if (options.help) {
    console.log(buildHelpText(pkg));
    return 0;
  }

  if (options.version) {
    console.log(`${pkg.name} v${pkg.version}`);
    return 0;
  }

  let validated: ReturnType<typeof validateOptions>;
  let budgets: Budgets;
  try {
    validated = validateOptions(options);
    budgets = buildBudgetsFromOptions(options);
  } catch (error) {
    if (error instanceof CliValidationError) {
      console.error(error.message);
      if (error.hint) {
        console.error(error.hint);
      }
      return 1;
    }
    throw error;
  }

  const budgetEntries = Object.entries(budgets);
  const hasBudgets = budgetEntries.length > 0;

  console.log(`\nAnalyzing page weight for: ${validated.url}`);
  console.log(`Viewport: ${validated.width}x${validated.height}`);
  if (!validated.scroll) {
    console.log('Scrolling: disabled');
  }
  if (hasBudgets) {
    const budgetSummary = budgetEntries
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    console.log(`Budgets: ${budgetSummary}`);
  }
  console.log('');

  try {
    const result = await analyze({
      url: validated.url,
      width: validated.width,
      height: validated.height,
      timeout: validated.timeout,
      scroll: validated.scroll,
    });

    const formattedOutput = formatOutput(result, validated.format);

    if (validated.output) {
      const outputPath = writeOutputFile(validated.output, formattedOutput);
      console.log(`Results written to ${outputPath}`);
    } else {
      console.log(formattedOutput);
    }

    if (hasBudgets) {
      const violations = checkBudgets(result.assets, budgets);
      if (violations.length > 0) {
        let violationWord = 'violations';
        if (violations.length === 1) {
          violationWord = 'violation';
        }
        console.error(
          `\nBudget exceeded! ${violations.length} ${violationWord} found:\n`
        );
        for (const violation of violations) {
          console.error(`  ✗ ${violation.message}`);
        }
        console.error('');
        return 1;
      }
    }

    return 0;
  } catch (error) {
    let errorMessage = String(error);
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error(`\nError: ${errorMessage}`);
    if (errorMessage.includes('net::ERR_')) {
      console.error('Hint: Check that the URL is correct and the site is reachable.');
    } else if (errorMessage.includes('timeout')) {
      console.error(
        `Hint: The page did not load within ${validated.timeout}ms. Try increasing --timeout.`
      );
    }
    return 1;
  }
}
