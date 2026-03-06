#!/usr/bin/env node

const puppeteer = require('puppeteer');

const url = process.argv[2];
const viewportWidth = parseInt(process.argv[3], 10);

if (!url || !viewportWidth) {
  console.error('Usage: pageweight <url> <viewport-width>');
  console.error('Example: pageweight https://briananders.com 1440');
  process.exit(1);
}

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

function printTable(assets) {
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
    const totalA = grouped[a].reduce((sum, a) => sum + a.size, 0);
    const totalB = grouped[b].reduce((sum, a) => sum + a.size, 0);
    return totalB - totalA;
  });

  const separator = '-'.repeat(100);
  let grandTotal = 0;

  for (const type of sortedTypes) {
    const items = grouped[type];
    const typeTotal = items.reduce((sum, a) => sum + a.size, 0);
    grandTotal += typeTotal;

    console.log('');
    console.log(separator);
    console.log(`  ${type} (${items.length} ${items.length === 1 ? 'file' : 'files'}) — Total: ${formatBytes(typeTotal)}`);
    console.log(separator);

    for (const item of items) {
      const sizeStr = formatBytes(item.size).padStart(12);
      console.log(`  ${sizeStr}  ${truncateUrl(item.url)}`);
    }
  }

  console.log('');
  console.log('='.repeat(100));
  console.log(`  TOTAL PAGE WEIGHT: ${formatBytes(grandTotal)} (${assets.length} ${assets.length === 1 ? 'request' : 'requests'})`);
  console.log('='.repeat(100));
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

async function run() {
  console.log(`\nAnalyzing page weight for: ${url}`);
  console.log(`Viewport: ${viewportWidth}x${viewportWidth}\n`);

  const assets = [];

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({
      width: viewportWidth,
      height: viewportWidth,
    });

    const client = await page.createCDPSession();
    await client.send('Network.enable');

    const responseData = new Map();

    client.on('Network.responseReceived', (event) => {
      const { requestId, response } = event;
      responseData.set(requestId, {
        url: response.url,
        mimeType: response.mimeType,
        headers: response.headers,
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
            size,
          });
        }
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await scrollToBottom(page);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    printTable(assets);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
