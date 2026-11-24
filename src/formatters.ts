import { formatBytes, truncateUrl } from './classify.ts';
import type {
  Asset,
  FormatJsonOptions,
  GroupedAssets,
  JsonReport,
  ResourceType,
} from './types.ts';

const TABLE_WIDTH = 100;
const SIZE_COLUMN_WIDTH = 12;

/**
 * Return the singular or plural label based on an item count.
 */
function pluralize(count: number, singular: string, plural: string): string {
  if (count === 1) {
    return singular;
  }
  return plural;
}

/**
 * Sum the transfer size in bytes across an array of assets.
 */
export function calculateTotalSize(assets: readonly Asset[]): number {
  return assets.reduce((sum, asset) => sum + asset.size, 0);
}

/**
 * Group assets by resource type, sort each group largest-first, and order groups by descending total size.
 */
export function groupAndSort(assets: readonly Asset[]): GroupedAssets {
  const grouped: Partial<Record<ResourceType, Asset[]>> = {};

  for (const asset of assets) {
    const existingGroup = grouped[asset.type];
    if (existingGroup) {
      existingGroup.push(asset);
    } else {
      grouped[asset.type] = [asset];
    }
  }

  const types = Object.keys(grouped) as ResourceType[];

  for (const type of types) {
    const items = grouped[type];
    if (items) {
      items.sort((first, second) => second.size - first.size);
    }
  }

  const sortedTypes = [...types].sort((typeA, typeB) => {
    const totalA = calculateTotalSize(grouped[typeA] ?? []);
    const totalB = calculateTotalSize(grouped[typeB] ?? []);
    return totalB - totalA;
  });

  return { grouped, sortedTypes };
}

/**
 * Render scraped assets as a human-readable ASCII table grouped by type.
 */
export function formatTable(assets: readonly Asset[]): string {
  const { grouped, sortedTypes } = groupAndSort(assets);
  const lines: string[] = [];
  const separator = '-'.repeat(TABLE_WIDTH);
  let grandTotal = 0;

  for (const type of sortedTypes) {
    const items = grouped[type] ?? [];
    const typeTotal = calculateTotalSize(items);
    grandTotal += typeTotal;

    const fileWord = pluralize(items.length, 'file', 'files');
    lines.push('');
    lines.push(separator);
    lines.push(`  ${type} (${items.length} ${fileWord}) — Total: ${formatBytes(typeTotal)}`);
    lines.push(separator);

    for (const item of items) {
      const sizeColumn = formatBytes(item.size).padStart(SIZE_COLUMN_WIDTH);
      lines.push(`  ${sizeColumn}  ${truncateUrl(item.url)}`);
    }
  }

  const requestWord = pluralize(assets.length, 'request', 'requests');
  lines.push('');
  lines.push('='.repeat(TABLE_WIDTH));
  lines.push(`  TOTAL PAGE WEIGHT: ${formatBytes(grandTotal)} (${assets.length} ${requestWord})`);
  lines.push('='.repeat(TABLE_WIDTH));

  return lines.join('\n');
}

/**
 * Serialize scraped assets and summary metadata into a pretty-printed JSON report.
 */
export function formatJSON(
  assets: readonly Asset[],
  options: FormatJsonOptions = {}
): string {
  const { grouped, sortedTypes } = groupAndSort(assets);
  const grandTotal = calculateTotalSize(assets);

  const report: JsonReport = {
    url: options.url ?? '',
    viewport: options.viewport ?? {},
    timestamp: new Date().toISOString(),
    summary: {
      totalSize: grandTotal,
      totalSizeFormatted: formatBytes(grandTotal),
      totalRequests: assets.length,
    },
    groups: {},
  };

  for (const type of sortedTypes) {
    const items = grouped[type] ?? [];
    const typeTotal = calculateTotalSize(items);

    report.groups[type] = {
      count: items.length,
      totalSize: typeTotal,
      totalSizeFormatted: formatBytes(typeTotal),
      assets: items.map((item) => ({
        url: item.url,
        size: item.size,
        sizeFormatted: formatBytes(item.size),
      })),
    };
  }

  return JSON.stringify(report, null, 2);
}

/**
 * Serialize scraped assets into RFC 4180-compatible CSV rows sorted by group weight.
 */
export function formatCSV(assets: readonly Asset[]): string {
  const lines: string[] = ['type,url,size_bytes,size_formatted'];
  const { grouped, sortedTypes } = groupAndSort(assets);

  for (const type of sortedTypes) {
    const items = grouped[type] ?? [];
    for (const item of items) {
      const escapedUrl = `"${item.url.replace(/"/g, '""')}"`;
      lines.push(`${type},${escapedUrl},${item.size},${formatBytes(item.size)}`);
    }
  }

  return lines.join('\n');
}
