const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function getBrowserConfig() {
  // Try to get Puppeteer's bundled Chrome path first
  try {
    const executablePath = puppeteer.executablePath();
    if (fs.existsSync(executablePath)) {
      console.log('✅ Found Puppeteer bundled Chrome at:', executablePath);
      return {
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
        ],
        headless: 'new'
      };
    }
  } catch (error) {
    console.log('ℹ️  Could not get Puppeteer bundled Chrome:', error.message);
  }

  // Fallback to system Chrome paths
  const systemPaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium'
  ].filter(Boolean);

  console.log('🔍 Looking for Chrome/Chromium in:', systemPaths);

  for (const chromePath of systemPaths) {
    if (fs.existsSync(chromePath)) {
      console.log('✅ Found Chrome at:', chromePath);
      return {
        executablePath: chromePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
        headless: 'new'
      };
    }
  }

  throw new Error('Chrome/Chromium not found!');
}

module.exports = { getBrowserConfig };
