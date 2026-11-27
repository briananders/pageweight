import type { Budgets } from '../../src/types.ts';
import {
  DEFAULT_SCAN_OPTIONS,
  type ExtensionScanOptions,
  type StoredReport,
} from './protocol.ts';

const LATEST_REPORT_KEY = 'pageweightLatestReport';
const SAVED_BUDGETS_KEY = 'pageweightBudgets';
const SCAN_OPTIONS_KEY = 'pageweightScanOptions';
const SCAN_LOCK_KEY = 'pageweightScanState';

export type ScanLockState = 'idle' | 'running';

/**
 * Store the most recent scan report in ephemeral browser session memory only (cleared on browser close).
 */
export async function saveLatestReport(report: StoredReport): Promise<void> {
  await chrome.storage.session.set({ [LATEST_REPORT_KEY]: report });
}

/**
 * Load the most recent in-session report from chrome.storage.session, if one exists.
 */
export async function loadLatestReport(): Promise<StoredReport | null> {
  const data = await chrome.storage.session.get(LATEST_REPORT_KEY);
  const stored = data[LATEST_REPORT_KEY] as StoredReport | undefined;
  if (!stored) {
    return null;
  }
  return stored;
}

/**
 * Remove the stored in-session report immediately when requested by the user.
 */
export async function clearLatestReport(): Promise<void> {
  await chrome.storage.session.remove(LATEST_REPORT_KEY);
}

/**
 * Persist user-defined page weight budgets locally on-device (never synced to remote servers).
 */
export async function saveBudgets(budgets: Budgets): Promise<void> {
  await chrome.storage.local.set({ [SAVED_BUDGETS_KEY]: budgets });
}

/**
 * Load saved page weight budgets from device-local chrome.storage.local.
 */
export async function loadBudgets(): Promise<Budgets> {
  const data = await chrome.storage.local.get(SAVED_BUDGETS_KEY);
  const stored = data[SAVED_BUDGETS_KEY] as Budgets | undefined;
  if (!stored || typeof stored !== 'object') {
    return {};
  }
  return stored;
}

/**
 * Persist scan configuration checkboxes locally on-device.
 */
export async function saveScanOptions(options: ExtensionScanOptions): Promise<void> {
  await chrome.storage.local.set({ [SCAN_OPTIONS_KEY]: options });
}

/**
 * Load saved scan options from device-local chrome.storage.local with safe defaults.
 */
export async function loadScanOptions(): Promise<ExtensionScanOptions> {
  const data = await chrome.storage.local.get(SCAN_OPTIONS_KEY);
  const stored = data[SCAN_OPTIONS_KEY] as Partial<ExtensionScanOptions> | undefined;
  if (!stored || typeof stored !== 'object') {
    return { ...DEFAULT_SCAN_OPTIONS };
  }

  return {
    scroll: stored.scroll ?? DEFAULT_SCAN_OPTIONS.scroll,
    bypassCache: stored.bypassCache ?? DEFAULT_SCAN_OPTIONS.bypassCache,
    waitAfterScrollMs: stored.waitAfterScrollMs ?? DEFAULT_SCAN_OPTIONS.waitAfterScrollMs,
  };
}

/**
 * Read the ephemeral scan lock state from chrome.storage.session.
 */
export async function getScanLock(): Promise<ScanLockState> {
  const data = await chrome.storage.session.get(SCAN_LOCK_KEY);
  const state = data[SCAN_LOCK_KEY] as ScanLockState | undefined;
  if (state === 'running') {
    return 'running';
  }
  return 'idle';
}

/**
 * Update the ephemeral scan lock state in chrome.storage.session.
 */
export async function setScanLock(state: ScanLockState): Promise<void> {
  await chrome.storage.session.set({ [SCAN_LOCK_KEY]: state });
}
