import type { AnalyzeResult } from '../../src/types.ts';

export const SCAN_PORT_NAME = 'pageweight-scan';

/**
 * User-configurable scrape options persisted for the extension side panel.
 */
export interface ExtensionScanOptions {
  scroll: boolean;
  bypassCache: boolean;
  waitAfterScrollMs: number;
}

/**
 * Default scan options matching the CLI's initial-load measurement behavior.
 */
export const DEFAULT_SCAN_OPTIONS: ExtensionScanOptions = {
  scroll: true,
  bypassCache: true,
  waitAfterScrollMs: 1500,
};

/**
 * Persisted report payload stored in chrome.storage.local for instant panel restoration.
 */
export interface StoredReport {
  result: AnalyzeResult;
  scannedAt: string;
}

/**
 * Message sent from the side panel to start a scan over a long-lived port.
 */
export interface StartScanMessage {
  type: 'START_SCAN';
  options: ExtensionScanOptions;
}

/**
 * Status progress update streamed from the service worker during an active scan.
 */
export interface ScanProgressMessage {
  type: 'SCAN_PROGRESS';
  stage: string;
}

/**
 * Final scan result sent from the service worker upon completion.
 */
export interface ScanCompleteMessage {
  type: 'SCAN_COMPLETE';
  report: StoredReport;
}

/**
 * Failure payload sent from the service worker when a scan cannot finish.
 */
export interface ScanErrorMessage {
  type: 'SCAN_ERROR';
  message: string;
}

/**
 * Union of all messages emitted by the service worker on the scan port.
 */
export type ScanPortResponse =
  | ScanProgressMessage
  | ScanCompleteMessage
  | ScanErrorMessage;

/**
 * One-shot runtime request asking the service worker for the active tab summary.
 */
export interface ActiveTabRequest {
  type: 'GET_ACTIVE_TAB';
}

/**
 * Active tab metadata returned to the side panel.
 */
export interface ActiveTabResponse {
  tabId: number | null;
  url: string;
  title: string;
  analyzable: boolean;
}
