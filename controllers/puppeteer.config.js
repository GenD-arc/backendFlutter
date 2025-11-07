const puppeteer = require('puppeteer');
const fs = require('fs');
const { execSync } = require('child_process');

async function getBrowserConfig() {
  console.log('🔍 Searching for Chrome/Chromium...');
  
  // Method 1: Try Puppeteer's bundled Chrome first
  try {
    const executablePath = puppeteer.executablePath();
    console.log('📍 Puppeteer executable path:', executablePath);
    
    if (fs.existsSync(executablePath)) {
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
    } else {
      console.log('⚠️  Path does not exist:', executablePath);
    }
  } catch (error) {
    console.log('⚠️  Puppeteer executablePath error:', error.message);
  }

  // Method 2: Check system paths with actual file existence verification
  const systemPaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/snap/bin/chromium',
    process.env.PUPPETEER_EXECUTABLE_PATH,
  ].filter(Boolean);

  console.log('🔍 Checking system paths...');

  for (const chromePath of systemPaths) {
    console.log(`   Checking: ${chromePath}`);
    try {
      if (fs.existsSync(chromePath)) {
        const stats = fs.statSync(chromePath);
        console.log(`   ✓ File exists (size: ${stats.size} bytes)`);
        
        try {
          fs.accessSync(chromePath, fs.constants.X_OK);
          console.log(`   ✓ File is executable`);
          console.log('✅ Using Chrome at:', chromePath);
          
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
        } catch (accessError) {
          console.log(`   ✗ File not executable:`, accessError.message);
        }
      } else {
        console.log(`   ✗ File does not exist`);
      }
    } catch (error) {
      console.log(`   ✗ Error checking path:`, error.message);
    }
  }

  // Method 3: Try to find Chrome using 'which' command
  console.log('🔍 Trying to locate Chrome using system commands...');
  try {
    const whichResult = execSync('which chromium chromium-browser google-chrome 2>/dev/null || true')
      .toString()
      .trim();
    
    if (whichResult) {
      const foundPath = whichResult.split('\n')[0];
      console.log('✅ Found Chrome via which:', foundPath);
      return {
        executablePath: foundPath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
        headless: 'new'
      };
    }
  } catch (error) {
    console.log('⚠️  which command failed:', error.message);
  }

  throw new Error(`
Chrome/Chromium Not Found

Chrome/Chromium is not installed or not accessible.

Searched locations:
${systemPaths.map(p => `   - ${p}`).join('\n')}
  `);
}

module.exports = { getBrowserConfig };
