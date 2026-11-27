import { classifyResource, formatBytes } from '../../src/classify.ts';
import { calculateTotalSize } from '../../src/formatters.ts';
import type { AnalyzedAsset, AnalyzeResult, Viewport } from '../../src/types.ts';

interface PendingCdpResponse {
  url: string;
  mimeType: string;
  statusCode: number;
  encodedDataLength: number;
}

/**
 * Mutable per-scan collection state scoped to a single tab analysis run.
 */
export interface NetworkCollectorState {
  readonly responses: Map<string, PendingCdpResponse>;
  readonly assets: AnalyzedAsset[];
}

interface ResponseReceivedParams {
  requestId?: string;
  response?: {
    url?: string;
    mimeType?: string;
    status?: number;
    encodedDataLength?: number;
  };
}

interface LoadingFinishedParams {
  requestId?: string;
  encodedDataLength?: number;
}

interface LoadingFailedParams {
  requestId?: string;
  errorText?: string;
}

/**
 * Determine whether a tab URL can be inspected with Chrome DevTools Protocol and scripting APIs.
 */
export function isAnalyzableUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) {
    return false;
  }

  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Create a fresh, isolated collector state for a single page weight scan.
 */
export function createNetworkCollector(): NetworkCollectorState {
  return {
    responses: new Map<string, PendingCdpResponse>(),
    assets: [],
  };
}

/**
 * Process a Chrome DevTools Protocol network event and record completed or failed non-data assets.
 */
export function handleCdpNetworkEvent(
  state: NetworkCollectorState,
  method: string,
  params: unknown
): void {
  if (!params || typeof params !== 'object') {
    return;
  }

  if (method === 'Network.responseReceived') {
    const event = params as ResponseReceivedParams;
    if (!event.requestId || !event.response || !event.response.url) {
      return;
    }

    state.responses.set(event.requestId, {
      url: event.response.url,
      mimeType: event.response.mimeType ?? '',
      statusCode: event.response.status ?? 0,
      encodedDataLength: event.response.encodedDataLength ?? 0,
    });
    return;
  }

  if (method === 'Network.loadingFinished') {
    const event = params as LoadingFinishedParams;
    if (!event.requestId) {
      return;
    }

    const record = state.responses.get(event.requestId);
    if (!record) {
      return;
    }

    // Prefer final encoded wire bytes from loadingFinished over initial header byte estimates.
    const transferSize = event.encodedDataLength || record.encodedDataLength || 0;
    if (record.url && !record.url.startsWith('data:')) {
      state.assets.push({
        url: record.url,
        type: classifyResource(record.mimeType, record.url),
        mimeType: record.mimeType,
        statusCode: record.statusCode,
        size: transferSize,
      });
    }
    return;
  }

  if (method === 'Network.loadingFailed') {
    const event = params as LoadingFailedParams;
    if (!event.requestId) {
      return;
    }

    const record = state.responses.get(event.requestId);
    if (record && record.url && !record.url.startsWith('data:')) {
      state.assets.push({
        url: record.url,
        type: classifyResource(record.mimeType, record.url),
        mimeType: record.mimeType,
        statusCode: record.statusCode,
        size: 0,
        error: event.errorText ?? 'Failed to load',
      });
    }
  }
}

/**
 * Build a standard AnalyzeResult object from collected CDP assets and tab viewport metadata.
 */
export function buildAnalyzeResult(
  url: string,
  viewport: Viewport,
  assets: readonly AnalyzedAsset[]
): AnalyzeResult {
  const assetList = [...assets];
  const totalSize = calculateTotalSize(assetList);

  return {
    url,
    viewport,
    assets: assetList,
    totalSize,
    totalSizeFormatted: formatBytes(totalSize),
    requestCount: assetList.length,
  };
}
