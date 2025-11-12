const fs = require('fs');
const path = require('path');

const getBrowserConfig = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  
<<<<<<< HEAD
  // Possible Chrome/Chromium paths (in priority order)
  const chromiumPaths = [

    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ].filter(Boolean);

  console.log('🔍 Looking for Chrome/Chromium in:', chromiumPaths);

  // Find first EXECUTABLE path (not just existing file)
=======
>>>>>>> 65017680a4af1073698b4b211b4f8f076be2804f
  let executablePath = null;
  
  // PRIORITY 1: Check for Puppeteer's bundled Chrome
  try {
    const puppeteer = require('puppeteer');
    
    if (puppeteer && typeof puppeteer.executablePath === 'function') {
      const bundledPath = puppeteer.executablePath();
      
      // Verify the bundled Chrome actually exists
      if (bundledPath && fs.existsSync(bundledPath)) {
        executablePath = bundledPath;
        console.log(`✅ Using Puppeteer bundled Chrome at: ${executablePath}`);
      } else {
        console.log(`⚠️  Puppeteer path found but file doesn't exist: ${bundledPath}`);
      }
    }
  } catch (err) {
    console.log('⚠️  Error loading Puppeteer:', err.message);
    
    // Fallback to system Chrome paths
    const chromiumPaths = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      process.env.CHROME_BIN,
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
    ].filter(Boolean);

    console.log('🔍 Looking for system Chrome in:', chromiumPaths);

    for (const chromePath of chromiumPaths) {
      try {
        if (fs.existsSync(chromePath)) {
          fs.accessSync(chromePath, fs.constants.X_OK);
          executablePath = chromePath;
          console.log(`✅ Found executable Chrome at: ${chromePath}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }
  }

  // Final check
  if (!executablePath) {
    const errorMessage = [
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '❌ Chrome/Chromium Installation Required',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '💡 SOLUTION:',
      '   1. npm uninstall puppeteer-core',
      '   2. npm install puppeteer',
      '   3. Redeploy to Render',
      '',
      '   Or set environment variable:',
      '   PUPPETEER_SKIP_DOWNLOAD=false',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ].join('\n');
    
    throw new Error(errorMessage);
  }

  // Build configuration
  const config = {
    headless: 'new',
    executablePath: executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--safebrowsing-disable-auto-update',
      
      ...(isProduction ? [
        '--single-process',
        '--disable-features=AudioServiceOutOfProcess',
      ] : []),
    ],
    
    timeout: 30000,
    protocolTimeout: 30000,
  };

  console.log('✅ Puppeteer config initialized');
  console.log(`   Executable: ${config.executablePath}`);
  console.log(`   Environment: ${isProduction ? 'Production' : 'Development'}`);
  
  return config;
};

module.exports = { getBrowserConfig };