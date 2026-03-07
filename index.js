const puppeteer = require('puppeteer');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(2)} ${units[i]}`;
}

function classifyResource(mimeType, resourceUrl) {
  if (!mimeType) {
    const ext = resourceUrl.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
    const extMap = {
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
    return extMap[ext] || 'Other';
  }

  if (mimeType.includes('javascript') || mimeType.includes('ecmascript')) return 'Script';
  if (mimeType.includes('css')) return 'Stylesheet';
  if (mimeType.includes('html')) return 'Document';
  if (mimeType.includes('json')) return 'JSON';
  if (mimeType.includes('xml') || mimeType.includes('svg')) return 'Image';
  if (mimeType.includes('image')) return 'Image';
  if (mimeType.includes('font') || mimeType.includes('woff') || mimeType.includes('ttf') || mimeType.includes('opentype')) return 'Font';
  if (mimeType.includes('video') || mimeType.includes('audio')) return 'Media';
  if (mimeType.includes('text/plain')) return 'Text';
  return 'Other';
}

function truncateUrl(resourceUrl, maxLength = 80) {
  if (resourceUrl.length <= maxLength) return resourceUrl;
  return resourceUrl.substring(0, maxLength - 3) + '...';
}

function groupAndSort(assets) {
  const grouped = {};

  for (const asset of assets) {
    const type = asset.type;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(asset);
  }

  for (const type of Object.keys(grouped)) {
    grouped[type].sort((a, b) => b.size - a.size);
  }

  const sortedTypes = Object.keys(grouped).sort((a, b) => {
    const totalA = grouped[a].reduce((sum, item) => sum + item.size, 0);
    const totalB = grouped[b].reduce((sum, item) => sum + item.size, 0);
    return totalB - totalA;
  });

  return { grouped, sortedTypes };
}

function formatTable(assets) {
  const { grouped, sortedTypes } = groupAndSort(assets);
  const lines = [];
  const separator = '-'.repeat(100);
  let grandTotal = 0;

  for (const type of sortedTypes) {
    const items = grouped[type];
    const typeTotal = items.reduce((sum, a) => sum + a.size, 0);
    grandTotal += typeTotal;

    lines.push('');
    lines.push(separator);
    lines.push(`  ${type} (${items.length} ${items.length === 1 ? 'file' : 'files'}) — Total: ${formatBytes(typeTotal)}`);
    lines.push(separator);

    for (const item of items) {
      const sizeStr = formatBytes(item.size).padStart(12);
      lines.push(`  ${sizeStr}  ${truncateUrl(item.url)}`);
    }
  }

  lines.push('');
  lines.push('='.repeat(100));
  lines.push(`  TOTAL PAGE WEIGHT: ${formatBytes(grandTotal)} (${assets.length} ${assets.length === 1 ? 'request' : 'requests'})`);
  lines.push('='.repeat(100));

  return lines.join('\n');
}

function formatJSON(assets, options = {}) {
  const { grouped, sortedTypes } = groupAndSort(assets);
  const grandTotal = assets.reduce((sum, a) => sum + a.size, 0);

  const result = {
    url: options.url || '',
    viewport: options.viewport || {},
    timestamp: new Date().toISOString(),
    summary: {
      totalSize: grandTotal,
      totalSizeFormatted: formatBytes(grandTotal),
      totalRequests: assets.length,
    },
    groups: {},
  };

  for (const type of sortedTypes) {
    const items = grouped[type];
    const typeTotal = items.reduce((sum, a) => sum + a.size, 0);
    result.groups[type] = {
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

  return JSON.stringify(result, null, 2);
}

function formatCSV(assets) {
  const lines = ['type,url,size_bytes,size_formatted'];
  const { grouped, sortedTypes } = groupAndSort(assets);

  for (const type of sortedTypes) {
    for (const item of grouped[type]) {
      const escapedUrl = `"${item.url.replace(/"/g, '""')}"`;
      lines.push(`${type},${escapedUrl},${item.size},${formatBytes(item.size)}`);
    }
  }

  return lines.join('\n');
}

async function scrollToBottom(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const scrollStep = Math.max(window.innerHeight / 2, 400);
      const scrollDelay = 200;
      let lastScrollTop = -1;

      const timer = setInterval(() => {
        window.scrollBy(0, scrollStep);
        const currentScroll = document.documentElement.scrollTop || document.body.scrollTop;
        if (currentScroll === lastScrollTop) {
          clearInterval(timer);
          resolve();
        }
        lastScrollTop = currentScroll;
      }, scrollDelay);
    });
  });
}

/**
 * Analyze page weight for a given URL.
 *
 * @param {Object} options
 * @param {string} options.url - URL to analyze
 * @param {number} options.width - Viewport width in pixels
 * @param {number} [options.height] - Viewport height in pixels (defaults to width)
 * @param {number} [options.timeout=60000] - Navigation timeout in ms
 * @param {boolean} [options.scroll=true] - Whether to scroll to bottom
 * @param {number} [options.waitAfterScroll=2000] - Time to wait after scrolling (ms)
 * @returns {Promise<{assets: Array, totalSize: number, totalSizeFormatted: string, requestCount: number}>}
 */
async function analyze(options) {
  const {
    url,
    width,
    height = width,
    timeout = 60000,
    scroll = true,
    waitAfterScroll = 2000,
  } = options;

  if (!url) throw new Error('URL is required');
  if (!width || width <= 0) throw new Error('Width must be a positive number');
  if (height <= 0) throw new Error('Height must be a positive number');

  const assets = [];

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({ width, height });

    const client = await page.createCDPSession();
    await client.send('Network.enable');

    const responseData = new Map();

    client.on('Network.responseReceived', (event) => {
      const { requestId, response } = event;
      responseData.set(requestId, {
        url: response.url,
        mimeType: response.mimeType,
        headers: response.headers,
        statusCode: response.status,
        encodedDataLength: response.encodedDataLength || 0,
      });
    });

    client.on('Network.loadingFinished', (event) => {
      const { requestId, encodedDataLength } = event;
      const data = responseData.get(requestId);
      if (data) {
        const size = encodedDataLength || data.encodedDataLength || 0;
        if (data.url && !data.url.startsWith('data:')) {
          assets.push({
            url: data.url,
            type: classifyResource(data.mimeType, data.url),
            mimeType: data.mimeType || '',
            statusCode: data.statusCode,
            size,
          });
        }
      }
    });

    client.on('Network.loadingFailed', (event) => {
      const { requestId, errorText } = event;
      const data = responseData.get(requestId);
      if (data && data.url && !data.url.startsWith('data:')) {
        assets.push({
          url: data.url,
          type: classifyResource(data.mimeType, data.url),
          mimeType: data.mimeType || '',
          statusCode: data.statusCode || 0,
          size: 0,
          error: errorText,
        });
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout });

    if (scroll) {
      await scrollToBottom(page);
      if (waitAfterScroll > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitAfterScroll));
      }
    }

    const totalSize = assets.reduce((sum, a) => sum + a.size, 0);

    return {
      url,
      viewport: { width, height },
      assets,
      totalSize,
      totalSizeFormatted: formatBytes(totalSize),
      requestCount: assets.length,
    };
  } finally {
    await browser.close();
  }
}

module.exports = {
  analyze,
  formatTable,
  formatJSON,
  formatCSV,
  formatBytes,
  classifyResource,
};
