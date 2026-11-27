import { formatCSV, formatJSON, formatTable } from '../../src/formatters.ts';
import type { AnalyzeResult, OutputFormat } from '../../src/types.ts';

/**
 * Serialized report payload ready for clipboard copy or file download.
 */
export interface ExportPayload {
  content: string;
  mimeType: string;
  filename: string;
}

/**
 * Convert a target URL into a filesystem-safe slug for exported report filenames.
 */
function buildHostSlug(rawUrl: string): string {
  try {
    const hostname = new URL(rawUrl).hostname;
    const cleaned = hostname.replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '');
    if (cleaned.length > 0) {
      return cleaned;
    }
  } catch {
    // Fall back to a generic label when URL parsing fails.
  }

  return 'page';
}

/**
 * Serialize an AnalyzeResult into table, JSON, or CSV format along with download metadata.
 */
export function buildExportPayload(
  result: AnalyzeResult,
  format: OutputFormat,
  dateStamp?: string
): ExportPayload {
  const hostSlug = buildHostSlug(result.url);
  let dateLabel = dateStamp;
  if (!dateLabel) {
    dateLabel = new Date().toISOString().slice(0, 10);
  }

  if (format === 'json') {
    return {
      content: formatJSON(result.assets, {
        url: result.url,
        viewport: result.viewport,
      }),
      mimeType: 'application/json;charset=utf-8',
      filename: `pageweight-${hostSlug}-${dateLabel}.json`,
    };
  }

  if (format === 'csv') {
    return {
      content: formatCSV(result.assets),
      mimeType: 'text/csv;charset=utf-8',
      filename: `pageweight-${hostSlug}-${dateLabel}.csv`,
    };
  }

  return {
    content: formatTable(result.assets),
    mimeType: 'text/plain;charset=utf-8',
    filename: `pageweight-${hostSlug}-${dateLabel}.txt`,
  };
}
