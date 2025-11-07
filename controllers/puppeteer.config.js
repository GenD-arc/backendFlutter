const puppeteer = require('puppeteer');
const fs = require('fs');
const { execSync } = require('child_process');

async function getBrowserConfig() {
  console.log('🔍 Searching for Chrome/Chromium...');
  
  // Method 1: Try Puppeteer's bundled Chrome first (BEST for Render)
  try {
    const executablePath = puppeteer.executablePath();
    console.log('📍 Puppeteer executable path:', executablePath);
    
    if (fs.existsSync(executablePath)) {
      // Verify it's actually executable
      try {
        fs.accessSync(executablePath, fs.constants.X_OK);
        console.log('✅ Found and verified Puppeteer bundled Chrome!');
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
            '--disable-extensions',
          ],
          headless: 'new'
        };
      } catch (accessError) {
        console.log('⚠️  Chrome found but not executable:', accessError.message);
      }
    }
  } catch (error) {
    console.log('⚠️  Puppeteer executablePath error:', error.message);
  }

  // Method 2: Check ~/.cache/puppeteer (where Puppeteer installs Chrome)
  const home = process.env.HOME || '/opt/render/project';
  const puppeteerCachePaths = [
    `${home}/.cache/puppeteer/chrome`,
    `${home}/.cache/puppeteer`,
    '/opt/render/project/.cache/puppeteer/chrome',
  ];

  for (const cachePath of puppeteerCachePaths) {
    try {
      if (fs.existsSync(cachePath)) {
        console.log('📂 Found Puppeteer cache at:', cachePath);
        // Try to find chrome executable in the cache
        const output = execSync(`find ${cachePath} -name chrome -type f 2>/dev/null || true`).toString().trim();
        if (output) {
          const chromePath = output.split('\n')[0];
          console.log('✅ Found Chrome in cache:', chromePath);
          return {
            executablePath: chromePath,
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
      }
    } catch (error) {
      console.log('⚠️  Error searching cache:', error.message);
    }
  }

  // Method 3: System Chrome paths (fallback)
  const systemPaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium'
  ].filter(Boolean);

  console.log('🔍 Checking system paths:', systemPaths);

  for (const chromePath of systemPaths) {
    if (fs.existsSync(chromePath)) {
      try {
        fs.accessSync(chromePath, fs.constants.X_OK);
        console.log('✅ Found system Chrome at:', chromePath);
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
      } catch (accessError) {
        console.log('⚠️  Found but not executable:', chromePath);
      }
    }
  }

  // If all else fails, throw detailed error
  throw new Error(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ Chrome/Chromium Not Found
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Puppeteer Chrome installation may have failed.

🔧 Try these fixes:

1. Clear Render build cache and redeploy
2. Check build logs for "npx puppeteer browsers install chrome" output
3. Verify package.json has "puppeteer": "^24.29.1"

📝 Searched locations:
${systemPaths.map(p => `   - ${p}`).join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
}

module.exports = { getBrowserConfig };
