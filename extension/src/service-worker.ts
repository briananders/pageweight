import type { Viewport } from '../../src/types.ts';
import {
  buildAnalyzeResult,
  createNetworkCollector,
  handleCdpNetworkEvent,
  isAnalyzableUrl,
} from './collector.ts';
import {
  DEFAULT_SCAN_OPTIONS,
  SCAN_PORT_NAME,
  type ActiveTabRequest,
  type ActiveTabResponse,
  type ExtensionScanOptions,
  type ScanPortResponse,
  type StartScanMessage,
  type StoredReport,
} from './protocol.ts';
import { getScanLock, saveLatestReport, setScanLock } from './storage.ts';

const CDP_PROTOCOL_VERSION = '1.3';
const LOAD_TIMEOUT_MS = 30000;
const NETWORK_SETTLE_MS = 1000;
const MAX_WAIT_AFTER_SCROLL_MS = 10000;

/**
 * Clamp user-supplied post-scroll delay into a safe bounded range.
 */
function clampWaitAfterScroll(rawValue: unknown): number {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    return DEFAULT_SCAN_OPTIONS.waitAfterScrollMs;
  }
  if (rawValue < 0) {
    return 0;
  }
  if (rawValue > MAX_WAIT_AFTER_SCROLL_MS) {
    return MAX_WAIT_AFTER_SCROLL_MS;
  }
  return Math.floor(rawValue);
}

/**
 * Configure the Chrome side panel to open when the toolbar action icon is clicked.
 */
async function configureSidePanelBehavior(): Promise<void> {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error('Failed to configure side panel behavior:', error);
  }
}

/**
 * Pause execution for a short duration during an active port-backed scan.
 */
function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

/**
 * Query the currently active tab in the last focused browser window.
 */
async function queryActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const firstTab = tabs[0];
  if (!firstTab) {
    return null;
  }
  return firstTab;
}

/**
 * Read the live CSS viewport dimensions from the target tab via chrome.scripting.
 */
async function readTabViewport(tabId: number): Promise<Viewport> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    });
    const viewport = results[0]?.result;
    if (viewport && viewport.width > 0 && viewport.height > 0) {
      return viewport;
    }
  } catch (error) {
    console.warn('Unable to read tab viewport dimensions:', error);
  }

  return { width: 0, height: 0 };
}

/**
 * Scroll the target tab from top to bottom inside the page context to trigger lazy-loaded assets.
 */
async function scrollTabToBottom(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      await new Promise<void>((resolve) => {
        const scrollStep = Math.max(window.innerHeight / 2, 400);
        const scrollDelayMs = 200;
        let lastScrollTop = -1;

        const timer = setInterval(() => {
          window.scrollBy(0, scrollStep);
          const currentScroll =
            document.documentElement.scrollTop || document.body.scrollTop;
          if (currentScroll === lastScrollTop) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
          lastScrollTop = currentScroll;
        }, scrollDelayMs);
      });
    },
  });
}

/**
 * Safely post a message to an open port without throwing if the side panel closed mid-scan.
 */
function safePostPortMessage(port: chrome.runtime.Port, message: ScanPortResponse): void {
  try {
    port.postMessage(message);
  } catch {
    // Port disconnected before scan finished; result is still persisted in chrome.storage.local.
  }
}

/**
 * Attach Chrome DevTools Protocol to the active tab, reload to measure initial weight, and return the report.
 */
async function analyzeActiveTab(
  port: chrome.runtime.Port,
  options: ExtensionScanOptions
): Promise<StoredReport> {
  const tab = await queryActiveTab();
  if (!tab || tab.id === undefined) {
    throw new Error('No active browser tab found.');
  }

  const targetUrl = tab.url ?? '';
  if (!isAnalyzableUrl(targetUrl)) {
    throw new Error(
      'This page cannot be analyzed. Open an http:// or https:// webpage and try again.'
    );
  }

  const tabId = tab.id;
  const debuggee: chrome.debugger.Debuggee = { tabId };
  const collector = createNetworkCollector();
  let attached = false;
  let resolveLoadEvent: (() => void) | null = null;

  const loadCompleted = new Promise<void>((resolve) => {
    resolveLoadEvent = resolve;
  });

  const onDebuggerEvent = (
    source: chrome.debugger.Debuggee,
    method: string,
    params?: object
  ): void => {
    if (source.tabId !== tabId) {
      return;
    }

    if (method === 'Page.loadEventFired' && resolveLoadEvent) {
      resolveLoadEvent();
      return;
    }

    handleCdpNetworkEvent(collector, method, params);
  };

  chrome.debugger.onEvent.addListener(onDebuggerEvent);

  try {
    safePostPortMessage(port, { type: 'SCAN_PROGRESS', stage: 'Attaching network inspector...' });
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;

    await chrome.debugger.sendCommand(debuggee, 'Network.enable');
    await chrome.debugger.sendCommand(debuggee, 'Page.enable');

    safePostPortMessage(port, {
      type: 'SCAN_PROGRESS',
      stage: 'Reloading page to measure initial transfer weight...',
    });

    await chrome.debugger.sendCommand(debuggee, 'Page.reload', {
      ignoreCache: options.bypassCache,
    });

    // Wait for the load event or time out gracefully so slow third-party tags do not hang forever.
    await Promise.race([loadCompleted, delay(LOAD_TIMEOUT_MS)]);
    await delay(NETWORK_SETTLE_MS);

    if (options.scroll) {
      safePostPortMessage(port, {
        type: 'SCAN_PROGRESS',
        stage: 'Scrolling page to capture lazy-loaded assets...',
      });
      await scrollTabToBottom(tabId);
      if (options.waitAfterScrollMs > 0) {
        await delay(options.waitAfterScrollMs);
      }
    }

    safePostPortMessage(port, { type: 'SCAN_PROGRESS', stage: 'Finalizing page weight report...' });
    const viewport = await readTabViewport(tabId);
    const refreshedTab = await chrome.tabs.get(tabId);
    const finalUrl = refreshedTab.url ?? targetUrl;

    const result = buildAnalyzeResult(finalUrl, viewport, collector.assets);
    const report: StoredReport = {
      result,
      scannedAt: new Date().toISOString(),
    };

    await saveLatestReport(report);
    return report;
  } finally {
    chrome.debugger.onEvent.removeListener(onDebuggerEvent);
    if (attached) {
      try {
        await chrome.debugger.detach(debuggee);
      } catch {
        // Ignore detach errors if the user already closed the tab or debugger banner.
      }
    }
  }
}

/**
 * Handle incoming scan requests over a long-lived port with session-backed concurrency locking.
 */
async function handleStartScan(
  port: chrome.runtime.Port,
  message: StartScanMessage
): Promise<void> {
  const currentLock = await getScanLock();
  if (currentLock === 'running') {
    safePostPortMessage(port, {
      type: 'SCAN_ERROR',
      message: 'A page weight scan is already running. Wait for it to finish.',
    });
    return;
  }

  await setScanLock('running');
  try {
    const scanOptions: ExtensionScanOptions = {
      scroll: message.options?.scroll ?? DEFAULT_SCAN_OPTIONS.scroll,
      bypassCache: message.options?.bypassCache ?? DEFAULT_SCAN_OPTIONS.bypassCache,
      waitAfterScrollMs: clampWaitAfterScroll(message.options?.waitAfterScrollMs),
    };
    const report = await analyzeActiveTab(port, scanOptions);
    safePostPortMessage(port, { type: 'SCAN_COMPLETE', report });
  } catch (error) {
    let errorMessage = 'Failed to analyze the active tab.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    safePostPortMessage(port, { type: 'SCAN_ERROR', message: errorMessage });
  } finally {
    await setScanLock('idle');
  }
}

/**
 * Build a response describing the active tab for the side panel header.
 */
async function buildActiveTabResponse(): Promise<ActiveTabResponse> {
  const tab = await queryActiveTab();
  if (!tab || tab.id === undefined) {
    return {
      tabId: null,
      url: '',
      title: '',
      analyzable: false,
    };
  }

  const url = tab.url ?? '';
  return {
    tabId: tab.id,
    url,
    title: tab.title ?? '',
    analyzable: isAnalyzableUrl(url),
  };
}

// Register all extension listeners synchronously at top level per MV3 service worker requirements.
chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanelBehavior();
});

chrome.runtime.onStartup.addListener(() => {
  void configureSidePanelBehavior();
});

chrome.runtime.onConnect.addListener((port) => {
  // Reject connections that do not originate from this extension itself.
  if (port.sender?.id !== chrome.runtime.id) {
    port.disconnect();
    return;
  }
  if (port.name !== SCAN_PORT_NAME) {
    return;
  }

  port.onMessage.addListener((message: unknown) => {
    if (!message || typeof message !== 'object') {
      return;
    }

    const typed = message as Partial<StartScanMessage>;
    if (typed.type === 'START_SCAN') {
      void handleStartScan(port, typed as StartScanMessage);
    }
  });
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Reject messages that do not originate from this extension itself.
  if (sender.id !== chrome.runtime.id) {
    return undefined;
  }
  if (!message || typeof message !== 'object') {
    return undefined;
  }

  const typed = message as Partial<ActiveTabRequest>;
  if (typed.type === 'GET_ACTIVE_TAB') {
    void (async () => {
      try {
        const activeTab = await buildActiveTabResponse();
        sendResponse(activeTab);
      } catch (error) {
        console.error('Failed to query active tab:', error);
        sendResponse({
          tabId: null,
          url: '',
          title: '',
          analyzable: false,
        } satisfies ActiveTabResponse);
      }
    })();
    return true;
  }

  return undefined;
});

void configureSidePanelBehavior();
