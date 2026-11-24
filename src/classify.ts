import type { ResourceType } from './types.ts';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

const SIZE_MULTIPLIERS: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
};

const EXTENSION_TYPE_MAP: Record<string, ResourceType> = {
  js: 'Script',
  mjs: 'Script',
  css: 'Stylesheet',
  html: 'Document',
  htm: 'Document',
  json: 'JSON',
  xml: 'XML',
  svg: 'Image',
  png: 'Image',
  jpg: 'Image',
  jpeg: 'Image',
  gif: 'Image',
  webp: 'Image',
  avif: 'Image',
  ico: 'Image',
  woff: 'Font',
  woff2: 'Font',
  ttf: 'Font',
  otf: 'Font',
  eot: 'Font',
  mp4: 'Media',
  webm: 'Media',
  ogg: 'Media',
  mp3: 'Media',
  wav: 'Media',
  flac: 'Media',
};

/**
 * Format a byte count into a human-readable string (B, KB, MB, or GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) {
    return '0 B';
  }

  const rawIndex = Math.floor(Math.log(bytes) / Math.log(1024));
  // Clamp to the largest supported unit so multi-terabyte values do not produce undefined units.
  const unitIndex = Math.min(rawIndex, BYTE_UNITS.length - 1);
  const value = bytes / Math.pow(1024, unitIndex);
  const unit = BYTE_UNITS[unitIndex];

  return `${value.toFixed(2)} ${unit}`;
}

/**
 * Extract the lowercase file extension from a URL, ignoring query parameters and fragments.
 */
function extractFileExtension(resourceUrl: string): string {
  const withoutQuery = resourceUrl.split('?')[0] ?? '';
  const withoutFragment = withoutQuery.split('#')[0] ?? '';
  const segments = withoutFragment.split('.');
  const lastSegment = segments[segments.length - 1] ?? '';

  return lastSegment.toLowerCase();
}

/**
 * Classify a network resource into a high-level asset category using its MIME type or URL extension.
 */
export function classifyResource(
  mimeType: string | null | undefined,
  resourceUrl: string
): ResourceType {
  if (!mimeType) {
    const extension = extractFileExtension(resourceUrl);
    const mappedType = EXTENSION_TYPE_MAP[extension];
    if (mappedType) {
      return mappedType;
    }
    return 'Other';
  }

  const normalizedMime = mimeType.toLowerCase();

  if (normalizedMime.includes('javascript') || normalizedMime.includes('ecmascript')) {
    return 'Script';
  }
  if (normalizedMime.includes('css')) {
    return 'Stylesheet';
  }
  if (normalizedMime.includes('html')) {
    return 'Document';
  }
  if (normalizedMime.includes('json')) {
    return 'JSON';
  }
  if (normalizedMime.includes('xml') || normalizedMime.includes('svg')) {
    return 'Image';
  }
  if (normalizedMime.includes('image')) {
    return 'Image';
  }
  if (
    normalizedMime.includes('font') ||
    normalizedMime.includes('woff') ||
    normalizedMime.includes('ttf') ||
    normalizedMime.includes('opentype')
  ) {
    return 'Font';
  }
  if (normalizedMime.includes('video') || normalizedMime.includes('audio')) {
    return 'Media';
  }
  if (normalizedMime.includes('text/plain')) {
    return 'Text';
  }

  return 'Other';
}

/**
 * Truncate a URL with an ellipsis when it exceeds the requested maximum display length.
 */
export function truncateUrl(resourceUrl: string, maxLength = 80): string {
  if (resourceUrl.length <= maxLength) {
    return resourceUrl;
  }

  return resourceUrl.substring(0, maxLength - 3) + '...';
}

/**
 * Parse a numeric byte value or human-readable size string (such as "1MB" or "500KB") into integer bytes.
 */
export function parseSizeString(sizeInput: string | number): number {
  if (typeof sizeInput === 'number') {
    if (!Number.isFinite(sizeInput) || sizeInput < 0) {
      throw new Error(
        `Invalid size format: "${sizeInput}". Use a non-negative number optionally followed by B, KB, MB, or GB (e.g. 1MB, 500KB, 2.5MB).`
      );
    }
    return Math.floor(sizeInput);
  }

  const trimmed = String(sizeInput).trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);
  if (!match || !match[1]) {
    throw new Error(
      `Invalid size format: "${sizeInput}". Use a number optionally followed by B, KB, MB, or GB (e.g. 1MB, 500KB, 2.5MB).`
    );
  }

  const numericValue = parseFloat(match[1]);
  const unitToken = match[2];
  let unit = 'B';
  if (unitToken) {
    unit = unitToken.toUpperCase();
  }

  const multiplier = SIZE_MULTIPLIERS[unit] ?? 1;
  return Math.floor(numericValue * multiplier);
}
