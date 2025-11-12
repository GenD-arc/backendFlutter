const fs = require('fs');
const path = require('path');

const getBrowserConfig = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  
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
  let executablePath = null;
  const foundPaths = [];
  const nonExecutablePaths = [];

  for (const chromePath of chromiumPaths) {
    try {
      // Check if file exists
      if (fs.existsSync(chromePath)) {
        foundPaths.push(chromePath);
        
        // Check if it's actually executable
        try {
          fs.accessSync(chromePath, fs.constants.X_OK);
          executablePath = chromePath;
          console.log(`✅ Found executable Chrome at: ${chromePath}`);
          break;
        } catch (execError) {
          nonExecutablePaths.push(chromePath);
          console.log(`⚠️  Found Chrome at ${chromePath} but it's not executable`);
        }
      }
    } catch (err) {
      // Path doesn't exist, continue
      continue;
    }
  }

  // If no system Chrome found, try to use Puppeteer's bundled Chrome
  if (!executablePath) {
    console.log('ℹ️  No system Chrome found, checking for bundled Puppeteer Chrome...');
    
    try {
      // Try to load puppeteer (full package)
      const puppeteer = require('puppeteer');
      
      if (puppeteer && typeof puppeteer.executablePath === 'function') {
        const bundledPath = puppeteer.executablePath();
        
        if (bundledPath && fs.existsSync(bundledPath)) {
          executablePath = bundledPath;
          console.log(`✅ Using Puppeteer bundled Chrome at: ${bundledPath}`);
        }
      }
    } catch (err) {
      console.log('⚠️  Full Puppeteer package not available (using puppeteer-core?)');
      console.log('   Error:', err.message);
    }
  }

  // Final check: if still no Chrome found, throw helpful error
  if (!executablePath) {
    console.error('❌ No executable Chrome/Chromium found!');
    console.error('   Searched paths:', chromiumPaths);
    
    if (foundPaths.length > 0) {
      console.error('   Found but not executable:', foundPaths);
    }
    
    const errorMessage = [
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '❌ Chrome/Chromium Installation Required',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'Chrome/Chromium browser not found or not executable.',
      '',
      '💡 SOLUTION FOR RENDER:',
      '   Option 1 (RECOMMENDED - Easiest):',
      '   1. npm uninstall puppeteer-core',
      '   2. npm install puppeteer',
      '   3. Deploy to Render',
      '',
      '   Option 2 (Docker):',
      '   Use Docker with Chrome pre-installed',
      '   See: https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md#running-puppeteer-in-docker',
      '',
      '   Option 3 (Native with build script):',
      '   Add Chrome installation to build command in Render',
      '',
      '🔧 FOR LOCAL DEVELOPMENT:',
      '   - macOS: brew install chromium',
      '   - Ubuntu/Debian: sudo apt-get install chromium-browser',
      '   - Windows: Install Chrome from google.com/chrome',
      '',
      '📝 Checked paths:',
      ...chromiumPaths.map(p => `   - ${p}`),
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ].join('\n');
    
    throw new Error(errorMessage);
  }

  // Build configuration
  const config = {
    headless: 'new',
    executablePath: executablePath,
    args: [
      // Essential flags
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      
      // Performance optimizations
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
      '--no-zygote',
      '--safebrowsing-disable-auto-update',
      
      // Memory optimizations for production
      ...(isProduction ? [
        '--single-process',
        '--disable-features=AudioServiceOutOfProcess',
      ] : []),
    ],
    
    // Timeout configurations
    timeout: 30000,
    protocolTimeout: 30000,
  };

  console.log('✅ Puppeteer config initialized');
  console.log(`   Executable: ${config.executablePath}`);
  console.log(`   Headless: ${config.headless}`);
  console.log(`   Production mode: ${isProduction}`);
  
  return config;
};

module.exports = { getBrowserConfig };