# Chrome Web Store Listing — Pageweight

> Last Updated: 2026-11-27

## Store Listing

**Extension Name**
Pageweight

**Short Description**
Measure webpage transfer weight on initial load, inspect assets by type, enforce size budgets, and export reports.

**Detailed Description**
Measure the exact transfer weight of any webpage directly from a side panel beside the page you are auditing.

FEATURES
• Calculates total transfer size across all loaded scripts, stylesheets, images, fonts, media, and documents
• Groups assets by category and sorts each group from largest to smallest so oversized files stand out immediately
• Optionally reloads with browser cache bypassed and scrolls the page to capture lazy-loaded images and media
• Checks total page weight, per-category limits, and single-asset ceilings with instant pass or fail feedback
• Exports full reports as formatted text tables, JSON, or CSV via clipboard copy or file download
• Supports one-click clearing of the current report and saved size budgets

HOW TO USE
1. Open any webpage you want to inspect.
2. Click the Pageweight toolbar icon to open the side panel.
3. Choose whether to bypass browser cache and scroll for lazy-loaded assets, then click Analyze Page.
4. Review the weight breakdown by asset type, configure optional size budgets, or export your report.

PRIVACY
Pageweight runs 100% locally in your browser and never transmits visited URLs, asset lists, or reports to any server. Your latest report stays only in temporary browser session memory until you clear it or close Chrome, and your optional size budgets stay strictly on your device.

PERMISSIONS
• Site access on HTTP and HTTPS pages — allows Pageweight to measure the active page only when you click Analyze Page.
• Temporary page debugging during scans — records accurate wire transfer sizes across both first-party and cross-origin assets, then disconnects immediately once the scan finishes.
• Local storage — remembers your optional size budgets and scan preferences on your device.

SUPPORT
Publisher: Brian Anders — https://briananders.com
Report issues or request features: https://github.com/briananders/pageweight/issues

Version 2.0.0 — Initial Chrome Side Panel release with asset breakdown, size budgets, and table/JSON/CSV export.

**Category**
Developer Tools

**Single Purpose**
Measure the initial-load transfer weight of the active webpage, check asset size budgets, and export the breakdown.

**Primary Language**
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `extension/icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 PNG | ✅ Ready | `store-assets/screenshot-1-light-1280x800.png` |
| Screenshot 2 [RECOMMENDED] | 1280×800 PNG | ✅ Ready | `store-assets/screenshot-2-dark-1280x800.png` |
| Small Promo Tile [RECOMMENDED] | 440×280 PNG | ✅ Ready | `store-assets/promo-tile-440x280.png` |

### Screenshot Notes
- Screenshot 1 (1280×800, Light Theme): Shows the Pageweight side panel displaying total weight summary, proportional breakdown bar, budget violation alerts, export toolbar, and grouped assets sorted largest-first.
- Screenshot 2 (1280×800, Dark Theme): Shows the Pageweight side panel in dark mode with the configurable page weight budgets panel expanded.
- Small Promo Tile (440×280): Clean Pageweight brand graphic for Chrome Web Store search and category tiles.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `sidePanel` | permissions | Displays the Pageweight audit interface in Chrome's side panel so users can inspect asset weights, adjust size budgets, and export reports beside the webpage without losing state when interacting with the page. |
| `tabs` | permissions | Reads the active tab's URL and ID so Pageweight can display which page will be audited and verify that it is an analyzable HTTP or HTTPS page before starting a scan. |
| `debugger` | permissions | Attaches temporarily only when the user clicks Analyze Page to measure accurate wire transfer byte sizes across first-party and cross-origin network responses, then detaches immediately in a finally block once the scan completes. |
| `scripting` | permissions | Reads the active tab's live viewport dimensions and, when enabled by the user, scrolls the page from top to bottom during a scan so lazy-loaded images and media are included in the weight measurement. |
| `storage` | permissions | Stores the user's optional size budgets and scan preferences locally on-device (`storage.local`) and holds the latest report temporarily in browser session memory (`storage.session`, cleared on browser close or via Clear Report). Never uses `storage.sync` or remote servers. |
| `http://*/*` | host_permissions | Allows users to measure page weight on any HTTP webpage they explicitly choose to audit from the side panel. |
| `https://*/*` | host_permissions | Allows users to measure page weight on any HTTPS webpage they explicitly choose to audit from the side panel. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

- Zero outbound network requests from extension pages or background scripts (enforced via `connect-src 'none'` CSP).
- Zero server-side storage, zero analytics, zero telemetry, zero third-party SDKs.
- Zero use of `chrome.storage.sync`; no data leaves the user's device.
- Scan results live strictly in ephemeral `chrome.storage.session` and can be cleared immediately via the Clear Report button.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy Source File**
`docs/privacy.html` (ready to publish on GitHub Pages or `https://briananders.com`)

**Recommended Live Privacy Policy URL**
`https://briananders.com/pageweight/privacy.html` or `https://briananders.github.io/pageweight/privacy.html` (verify the URL returns HTTP 200 before clicking Submit in the Chrome Web Store Developer Dashboard).

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name**
Brian Anders

**Website / Homepage URL**
https://briananders.com

**Support URL**
https://github.com/briananders/pageweight/issues

*(Note: No email address is stored in this repository or extension package. The Chrome Web Store Developer Dashboard itself requires a monitored publisher account email entered directly in Google's portal during submission.)*

## Submission Package

Build and package the clean Chrome Web Store submission ZIP:

```bash
npm run package:extension
```

Upload the generated `release/pageweight-v2.0.0.zip` archive to the Chrome Web Store Developer Dashboard. The packager excludes source maps (`*.map`), tests, build configs, documentation, and store graphics.

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 2.0.0 | 2026-11-27 | Hardened MV3 Chrome Side Panel extension with strict `connect-src 'none'` CSP, ephemeral session-only report storage, Clear Report control, zero server transmission, privacy policy, store graphics, and clean ZIP packaging. | Ready to Submit |

## Review Notes

### Known Issues / Limitations
Chrome displays its standard debugging infobar while a scan is actively running because `debugger` is attached for exact cross-origin wire transfer sizes. The extension detaches immediately after each scan finishes.
