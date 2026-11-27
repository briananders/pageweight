import { checkBudgets } from '../../src/budgets.ts';
import { formatBytes, parseSizeString } from '../../src/classify.ts';
import { calculateTotalSize, groupAndSort } from '../../src/formatters.ts';
import type {
  BudgetRuleKey,
  Budgets,
  OutputFormat,
  ResourceType,
} from '../../src/types.ts';
import { buildExportPayload } from './export.ts';
import {
  DEFAULT_SCAN_OPTIONS,
  SCAN_PORT_NAME,
  type ActiveTabResponse,
  type ExtensionScanOptions,
  type ScanPortResponse,
  type StartScanMessage,
  type StoredReport,
} from './protocol.ts';
import {
  clearLatestReport,
  loadBudgets,
  loadLatestReport,
  loadScanOptions,
  saveBudgets,
  saveScanOptions,
} from './storage.ts';

const BUDGET_INPUT_KEYS: readonly BudgetRuleKey[] = [
  'total',
  'image',
  'script',
  'stylesheet',
  'media',
  'font',
  'document',
  'perAsset',
  'perImage',
  'perMedia',
];

const RESOURCE_COLOR_VARS: Record<ResourceType, string> = {
  Image: 'var(--type-image)',
  Script: 'var(--type-script)',
  Stylesheet: 'var(--type-stylesheet)',
  Media: 'var(--type-media)',
  Font: 'var(--type-font)',
  Document: 'var(--type-document)',
  JSON: 'var(--type-json)',
  XML: 'var(--type-xml)',
  Text: 'var(--type-text)',
  Other: 'var(--type-other)',
};

let currentReport: StoredReport | null = null;
let currentBudgets: Budgets = {};
let isScanning = false;

/**
 * Look up a required DOM element by ID, throwing clearly if the template is missing it.
 */
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required UI element: #${id}`);
  }
  return element as T;
}

/**
 * Display a status or error banner above the report area.
 */
function showStatus(message: string, isError: boolean): void {
  const banner = requireElement<HTMLDivElement>('status-banner');
  banner.textContent = message;
  banner.classList.toggle('is-error', isError);
  banner.hidden = false;
}

/**
 * Hide the status banner when no active scan or error needs attention.
 */
function hideStatus(): void {
  const banner = requireElement<HTMLDivElement>('status-banner');
  banner.hidden = true;
  banner.textContent = '';
  banner.classList.remove('is-error');
}

/**
 * Toggle interactive button state while a page scan is in progress.
 */
function setScanningState(scanning: boolean): void {
  isScanning = scanning;
  const analyzeButton = requireElement<HTMLButtonElement>('analyze-button');
  analyzeButton.disabled = scanning;
  if (scanning) {
    analyzeButton.textContent = 'Analyzing...';
  } else {
    analyzeButton.textContent = 'Analyze Page';
  }
}

/**
 * Query the service worker for the currently active browser tab and update the header URL display.
 */
async function refreshActiveTabDisplay(): Promise<void> {
  const urlLabel = requireElement<HTMLParagraphElement>('active-tab-url');
  const analyzeButton = requireElement<HTMLButtonElement>('analyze-button');

  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'GET_ACTIVE_TAB',
    })) as ActiveTabResponse | undefined;

    if (!response || !response.url) {
      urlLabel.textContent = 'No active webpage detected';
      urlLabel.title = '';
      if (!isScanning) {
        analyzeButton.disabled = true;
      }
      return;
    }

    urlLabel.textContent = response.url;
    urlLabel.title = response.url;

    if (!isScanning) {
      analyzeButton.disabled = !response.analyzable;
    }

    if (!response.analyzable) {
      showStatus(
        'Open an http:// or https:// tab to measure its page weight.',
        false
      );
    } else if (!isScanning) {
      hideStatus();
    }
  } catch (error) {
    console.error('Failed to refresh active tab info:', error);
    urlLabel.textContent = 'Unable to read active tab';
  }
}

/**
 * Populate the budget input fields from saved storage state.
 */
function populateBudgetInputs(budgets: Budgets): void {
  let activeCount = 0;

  for (const key of BUDGET_INPUT_KEYS) {
    const input = document.getElementById(`budget-${key}`) as HTMLInputElement | null;
    if (!input) {
      continue;
    }

    const value = budgets[key];
    if (value !== null && value !== undefined && String(value).trim().length > 0) {
      input.value = String(value);
      activeCount++;
    } else {
      input.value = '';
    }
  }

  const badge = requireElement<HTMLSpanElement>('budgets-badge');
  if (activeCount === 0) {
    badge.textContent = 'Optional';
  } else if (activeCount === 1) {
    badge.textContent = '1 rule active';
  } else {
    badge.textContent = `${activeCount} rules active`;
  }
}

/**
 * Read and validate all budget form inputs before persisting them.
 */
function readBudgetInputsFromForm(): Budgets {
  const nextBudgets: Budgets = {};

  for (const key of BUDGET_INPUT_KEYS) {
    const input = document.getElementById(`budget-${key}`) as HTMLInputElement | null;
    if (!input) {
      continue;
    }

    const trimmed = input.value.trim();
    if (trimmed.length === 0) {
      continue;
    }

    // Validate size syntax immediately so invalid budgets are caught before saving.
    parseSizeString(trimmed);
    nextBudgets[key] = trimmed;
  }

  return nextBudgets;
}

/**
 * Render the proportional stacked breakdown bar and legend across asset categories.
 */
function renderWeightBreakdown(
  grouped: ReturnType<typeof groupAndSort>['grouped'],
  sortedTypes: readonly ResourceType[],
  totalSize: number
): void {
  const bar = requireElement<HTMLDivElement>('weight-bar');
  const legend = requireElement<HTMLUListElement>('weight-legend');
  bar.replaceChildren();
  legend.replaceChildren();

  if (totalSize <= 0 || sortedTypes.length === 0) {
    return;
  }

  for (const type of sortedTypes) {
    const items = grouped[type] ?? [];
    const groupSize = calculateTotalSize(items);
    const percentage = (groupSize / totalSize) * 100;
    const colorValue = RESOURCE_COLOR_VARS[type];

    const segment = document.createElement('div');
    segment.className = 'weight-segment';
    segment.style.width = `${percentage.toFixed(2)}%`;
    segment.style.backgroundColor = colorValue;
    segment.title = `${type}: ${formatBytes(groupSize)} (${percentage.toFixed(1)}%)`;
    bar.appendChild(segment);

    const legendItem = document.createElement('li');
    legendItem.className = 'legend-item';

    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.backgroundColor = colorValue;

    const label = document.createElement('span');
    label.textContent = `${type} ${formatBytes(groupSize)}`;

    legendItem.appendChild(dot);
    legendItem.appendChild(label);
    legend.appendChild(legendItem);
  }
}

/**
 * Evaluate active budgets against the current report and update the summary tile and violations panel.
 */
function renderBudgetEvaluation(report: StoredReport, budgets: Budgets): void {
  const budgetMetric = requireElement<HTMLElement>('metric-budget-status');
  const violationsCard = requireElement<HTMLElement>('violations-card');
  const violationsList = requireElement<HTMLUListElement>('violations-list');

  budgetMetric.classList.remove('is-ok', 'is-over');
  violationsList.replaceChildren();

  const activeRules = Object.keys(budgets).length;
  if (activeRules === 0) {
    budgetMetric.textContent = 'Not set';
    violationsCard.hidden = true;
    return;
  }

  const violations = checkBudgets(report.result.assets, budgets);
  if (violations.length === 0) {
    budgetMetric.textContent = 'Pass';
    budgetMetric.classList.add('is-ok');
    violationsCard.hidden = true;
    return;
  }

  if (violations.length === 1) {
    budgetMetric.textContent = '1 over';
  } else {
    budgetMetric.textContent = `${violations.length} over`;
  }
  budgetMetric.classList.add('is-over');

  for (const violation of violations) {
    const item = document.createElement('li');
    item.className = 'violation-item';
    item.textContent = `• ${violation.message}`;
    violationsList.appendChild(item);
  }

  violationsCard.hidden = false;
}

/**
 * Render collapsible asset groups sorted by heaviest category and heaviest asset first.
 */
function renderAssetGroups(
  grouped: ReturnType<typeof groupAndSort>['grouped'],
  sortedTypes: readonly ResourceType[]
): void {
  const container = requireElement<HTMLDivElement>('asset-groups');
  container.replaceChildren();

  for (const type of sortedTypes) {
    const items = grouped[type] ?? [];
    const groupTotal = calculateTotalSize(items);
    const colorValue = RESOURCE_COLOR_VARS[type];

    const details = document.createElement('details');
    details.className = 'asset-group';
    details.open = true;

    const summary = document.createElement('summary');
    summary.className = 'asset-group-summary';

    const titleWrap = document.createElement('span');
    titleWrap.className = 'asset-group-title';

    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.backgroundColor = colorValue;

    let fileLabel = 'files';
    if (items.length === 1) {
      fileLabel = 'file';
    }
    const nameText = document.createElement('span');
    nameText.textContent = `${type} (${items.length} ${fileLabel})`;

    titleWrap.appendChild(dot);
    titleWrap.appendChild(nameText);

    const totalSpan = document.createElement('span');
    totalSpan.className = 'asset-group-total';
    totalSpan.textContent = formatBytes(groupTotal);

    summary.appendChild(titleWrap);
    summary.appendChild(totalSpan);
    details.appendChild(summary);

    const list = document.createElement('ul');
    list.className = 'asset-list';

    for (const item of items) {
      const row = document.createElement('li');
      row.className = 'asset-row';

      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'asset-size';
      sizeSpan.textContent = formatBytes(item.size);

      const urlSpan = document.createElement('span');
      urlSpan.className = 'asset-url';
      urlSpan.textContent = item.url;
      urlSpan.title = item.url;

      row.appendChild(sizeSpan);
      row.appendChild(urlSpan);
      list.appendChild(row);
    }

    details.appendChild(list);
    container.appendChild(details);
  }
}

/**
 * Render a stored page weight report across the summary, breakdown bar, budgets, and asset list.
 */
function renderReport(report: StoredReport): void {
  const emptyState = requireElement<HTMLElement>('empty-state');
  const reportSection = requireElement<HTMLElement>('report-section');
  const reportUrl = requireElement<HTMLParagraphElement>('report-url');
  const reportTimestamp = requireElement<HTMLSpanElement>('report-timestamp');
  const totalSizeEl = requireElement<HTMLElement>('metric-total-size');
  const requestCountEl = requireElement<HTMLElement>('metric-request-count');
  const viewportEl = requireElement<HTMLElement>('metric-viewport');
  const assetsCountLabel = requireElement<HTMLSpanElement>('assets-count-label');

  emptyState.hidden = true;
  reportSection.hidden = false;

  reportUrl.textContent = report.result.url;
  reportTimestamp.textContent = new Date(report.scannedAt).toLocaleTimeString();
  totalSizeEl.textContent = report.result.totalSizeFormatted;
  requestCountEl.textContent = String(report.result.requestCount);

  if (report.result.viewport.width > 0 && report.result.viewport.height > 0) {
    viewportEl.textContent = `${report.result.viewport.width}x${report.result.viewport.height}`;
  } else {
    viewportEl.textContent = 'Auto';
  }

  let requestWord = 'requests';
  if (report.result.requestCount === 1) {
    requestWord = 'request';
  }
  assetsCountLabel.textContent = `${report.result.requestCount} ${requestWord}`;

  const { grouped, sortedTypes } = groupAndSort(report.result.assets);
  renderWeightBreakdown(grouped, sortedTypes, report.result.totalSize);
  renderBudgetEvaluation(report, currentBudgets);
  renderAssetGroups(grouped, sortedTypes);
}

/**
 * Read the current scan option checkboxes from the UI.
 */
function readScanOptionsFromUi(): ExtensionScanOptions {
  const scrollInput = requireElement<HTMLInputElement>('opt-scroll');
  const bypassCacheInput = requireElement<HTMLInputElement>('opt-bypass-cache');

  return {
    scroll: scrollInput.checked,
    bypassCache: bypassCacheInput.checked,
    waitAfterScrollMs: DEFAULT_SCAN_OPTIONS.waitAfterScrollMs,
  };
}

/**
 * Trigger a full page weight scan via a long-lived port to the service worker.
 */
async function startScan(): Promise<void> {
  if (isScanning) {
    return;
  }

  const options = readScanOptionsFromUi();
  await saveScanOptions(options);

  setScanningState(true);
  showStatus('Starting page weight analysis...', false);

  const port = chrome.runtime.connect({ name: SCAN_PORT_NAME });

  port.onMessage.addListener((rawMessage: unknown) => {
    if (!rawMessage || typeof rawMessage !== 'object') {
      return;
    }

    const message = rawMessage as ScanPortResponse;
    if (message.type === 'SCAN_PROGRESS') {
      showStatus(message.stage, false);
      return;
    }

    if (message.type === 'SCAN_COMPLETE') {
      currentReport = message.report;
      renderReport(message.report);
      hideStatus();
      setScanningState(false);
      port.disconnect();
      return;
    }

    if (message.type === 'SCAN_ERROR') {
      showStatus(message.message, true);
      setScanningState(false);
      port.disconnect();
    }
  });

  port.onDisconnect.addListener(() => {
    if (isScanning) {
      setScanningState(false);
      showStatus('Scan interrupted before completion. Please try again.', true);
    }
  });

  const startMessage: StartScanMessage = {
    type: 'START_SCAN',
    options,
  };
  port.postMessage(startMessage);
}

/**
 * Read the currently selected export format from the dropdown.
 */
function readSelectedExportFormat(): OutputFormat {
  const select = requireElement<HTMLSelectElement>('export-format');
  const value = select.value;
  if (value === 'json' || value === 'csv') {
    return value;
  }
  return 'table';
}

/**
 * Copy the formatted report to the clipboard and display brief confirmation text.
 */
async function handleCopyExport(): Promise<void> {
  if (!currentReport) {
    return;
  }

  const feedback = requireElement<HTMLSpanElement>('export-feedback');
  const payload = buildExportPayload(currentReport.result, readSelectedExportFormat());

  try {
    await navigator.clipboard.writeText(payload.content);
    feedback.textContent = 'Copied to clipboard';
  } catch {
    feedback.textContent = 'Clipboard unavailable';
  }
}

/**
 * Trigger a client-side file download for the selected export format.
 */
function handleDownloadExport(): void {
  if (!currentReport) {
    return;
  }

  const feedback = requireElement<HTMLSpanElement>('export-feedback');
  const payload = buildExportPayload(currentReport.result, readSelectedExportFormat());
  const blob = new Blob([payload.content], { type: payload.mimeType });
  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = payload.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoke the temporary blob URL on the next tick after the download starts.
  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);

  feedback.textContent = `Downloaded ${payload.filename}`;
}

/**
 * Clear the current in-session report from browser memory and reset the side panel to empty state.
 */
async function handleClearReport(): Promise<void> {
  currentReport = null;
  await clearLatestReport();

  const emptyState = requireElement<HTMLElement>('empty-state');
  const reportSection = requireElement<HTMLElement>('report-section');
  const feedback = requireElement<HTMLSpanElement>('export-feedback');

  reportSection.hidden = true;
  emptyState.hidden = false;
  feedback.textContent = '';
}

/**
 * Persist updated budgets from the form and immediately re-evaluate the displayed report.
 */
async function handleSaveBudgets(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const errorBox = requireElement<HTMLParagraphElement>('budgets-error');
  errorBox.hidden = true;
  errorBox.textContent = '';

  try {
    const nextBudgets = readBudgetInputsFromForm();
    await saveBudgets(nextBudgets);
    currentBudgets = nextBudgets;
    populateBudgetInputs(currentBudgets);

    if (currentReport) {
      renderBudgetEvaluation(currentReport, currentBudgets);
    }
  } catch (error) {
    let errorMessage = 'Invalid budget value.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    errorBox.textContent = errorMessage;
    errorBox.hidden = false;
  }
}

/**
 * Clear all saved budgets and update the UI immediately.
 */
async function handleClearBudgets(): Promise<void> {
  const errorBox = requireElement<HTMLParagraphElement>('budgets-error');
  errorBox.hidden = true;
  errorBox.textContent = '';

  currentBudgets = {};
  await saveBudgets(currentBudgets);
  populateBudgetInputs(currentBudgets);

  if (currentReport) {
    renderBudgetEvaluation(currentReport, currentBudgets);
  }
}

/**
 * Wire up all event handlers and hydrate initial side panel state from chrome.storage.
 */
async function initializeSidePanel(): Promise<void> {
  const analyzeButton = requireElement<HTMLButtonElement>('analyze-button');
  const scrollInput = requireElement<HTMLInputElement>('opt-scroll');
  const bypassCacheInput = requireElement<HTMLInputElement>('opt-bypass-cache');
  const copyButton = requireElement<HTMLButtonElement>('copy-export-button');
  const downloadButton = requireElement<HTMLButtonElement>('download-export-button');
  const clearReportButton = requireElement<HTMLButtonElement>('clear-report-button');
  const budgetsForm = requireElement<HTMLFormElement>('budgets-form');
  const clearBudgetsButton = requireElement<HTMLButtonElement>('clear-budgets-button');

  analyzeButton.addEventListener('click', () => {
    void startScan();
  });

  const handleOptionChange = (): void => {
    void saveScanOptions(readScanOptionsFromUi());
  };
  scrollInput.addEventListener('change', handleOptionChange);
  bypassCacheInput.addEventListener('change', handleOptionChange);

  copyButton.addEventListener('click', () => {
    void handleCopyExport();
  });
  downloadButton.addEventListener('click', () => {
    handleDownloadExport();
  });
  clearReportButton.addEventListener('click', () => {
    void handleClearReport();
  });
  budgetsForm.addEventListener('submit', (event) => {
    void handleSaveBudgets(event);
  });
  clearBudgetsButton.addEventListener('click', () => {
    void handleClearBudgets();
  });

  const [savedOptions, savedBudgets, latestReport] = await Promise.all([
    loadScanOptions(),
    loadBudgets(),
    loadLatestReport(),
  ]);

  scrollInput.checked = savedOptions.scroll;
  bypassCacheInput.checked = savedOptions.bypassCache;

  currentBudgets = savedBudgets;
  populateBudgetInputs(currentBudgets);

  if (latestReport) {
    currentReport = latestReport;
    renderReport(latestReport);
  }

  await refreshActiveTabDisplay();

  if (chrome.tabs?.onActivated) {
    chrome.tabs.onActivated.addListener(() => {
      void refreshActiveTabDisplay();
    });
  }

  if (chrome.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
      if (changeInfo.url || changeInfo.status === 'complete') {
        void refreshActiveTabDisplay();
      }
    });
  }
}

void initializeSidePanel();
