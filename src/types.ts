/**
 * Supported logical categories used to group scraped web assets.
 */
export type ResourceType =
  | 'Script'
  | 'Stylesheet'
  | 'Document'
  | 'JSON'
  | 'XML'
  | 'Image'
  | 'Font'
  | 'Media'
  | 'Text'
  | 'Other';

/**
 * Minimal asset representation accepted by formatters and budget checks.
 */
export interface Asset {
  url: string;
  type: ResourceType;
  size: number;
  mimeType?: string;
  statusCode?: number;
  error?: string;
}

/**
 * Full asset record captured from Chrome DevTools Protocol network events.
 */
export interface AnalyzedAsset extends Asset {
  mimeType: string;
  statusCode: number;
}

/**
 * Browser viewport dimensions in CSS pixels.
 */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * Configuration options for analyzing a webpage's transfer weight.
 */
export interface AnalyzeOptions {
  url: string;
  width: number;
  height?: number;
  timeout?: number;
  scroll?: boolean;
  waitAfterScroll?: number;
}

/**
 * Structured output returned by a completed page weight analysis.
 */
export interface AnalyzeResult {
  url: string;
  viewport: Viewport;
  assets: AnalyzedAsset[];
  totalSize: number;
  totalSizeFormatted: string;
  requestCount: number;
}

/**
 * Supported CLI export formats.
 */
export type OutputFormat = 'table' | 'json' | 'csv';

/**
 * Optional metadata included when serializing assets to JSON.
 */
export interface FormatJsonOptions {
  url?: string;
  viewport?: Partial<Viewport>;
}

/**
 * Assets bucketed by resource type and ordered heaviest-first.
 */
export interface GroupedAssets {
  grouped: Partial<Record<ResourceType, Asset[]>>;
  sortedTypes: ResourceType[];
}

/**
 * JSON report shape produced by formatJSON.
 */
export interface JsonReportAsset {
  url: string;
  size: number;
  sizeFormatted: string;
}

export interface JsonReportGroup {
  count: number;
  totalSize: number;
  totalSizeFormatted: string;
  assets: JsonReportAsset[];
}

export interface JsonReport {
  url: string;
  viewport: Partial<Viewport>;
  timestamp: string;
  summary: {
    totalSize: number;
    totalSizeFormatted: string;
    totalRequests: number;
  };
  groups: Partial<Record<ResourceType, JsonReportGroup>>;
}

/**
 * Size limit accepted by budget rules, either in bytes or as a size string like "500KB".
 */
export type BudgetValue = string | number;

/**
 * Resource-group budget rule keys mapped to ResourceType labels.
 */
export type GroupBudgetKey =
  | 'image'
  | 'media'
  | 'script'
  | 'stylesheet'
  | 'font'
  | 'document'
  | 'json'
  | 'xml'
  | 'text'
  | 'other';

/**
 * All supported budget constraint keys.
 */
export type BudgetRuleKey =
  | 'total'
  | GroupBudgetKey
  | 'perAsset'
  | 'perImage'
  | 'perMedia';

/**
 * Budget configuration checked against scraped assets.
 */
export type Budgets = Partial<Record<BudgetRuleKey, BudgetValue | null>>;

/**
 * Single budget failure reported by checkBudgets.
 */
export interface BudgetViolation {
  rule: BudgetRuleKey;
  message: string;
  actual: number;
  budget: number;
  asset?: Asset;
}

/**
 * Parsed command-line options for the pageweight CLI.
 */
export interface CliOptions {
  url: string | null;
  width: number | null;
  height: number | null;
  format: string;
  output: string | null;
  timeout: number;
  budget: string | null;
  budgetImage: string | null;
  budgetMedia: string | null;
  budgetScript: string | null;
  budgetStylesheet: string | null;
  budgetFont: string | null;
  budgetDocument: string | null;
  budgetPerAsset: string | null;
  budgetPerImage: string | null;
  budgetPerMedia: string | null;
  scroll: boolean;
  help: boolean;
  version: boolean;
}
