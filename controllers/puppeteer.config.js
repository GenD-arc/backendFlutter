const puppeteer = require('puppeteer');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

async function getBrowserConfig() {
  console.log('🔍 Searching for Chrome/Chromium...');
  
  // Method 1: Check project src/chrome directory (where @puppeteer/browsers installs)
  const projectRoot = process.cwd();
  const chromePaths = [
    path.join(projectRoot, 'src', 'chrome'),
    path.join(projectRoot, 'chrome'),
    path.join(projectRoot, '.cache', 'puppeteer'),
  ];
  
  console.log('📂 Project root:', projectRoot);
  console.log('📂 Checking Chrome paths:', chromePaths);
  
  for (const chromeDir of chromePaths) {
    if (fs.existsSync(chromeDir)) {
      console.log('✅ Found Chrome directory:', chromeDir);
      
      try {
        // Find chrome executable recursively
        const findCmd = `find "${chromeDir}" -name chrome -type f -executable 2>/dev/null || true`;
        console.log('🔍 Running:', findCmd);
        
        const result = execSync(findCmd).toString().trim();
        const chromeExecutables = result.split('\n').filter(Boolean);
        
        console.log('📝 Found executables:', chromeExecutables);
        
        if (chromeExecutables.length > 0) {
          const chromePath = chromeExecutables[0];
          console.log('✅ Using Chrome at:', chromePath);
          
          // Verify it's executable
          try {
            fs.accessSync(chromePath, fs.constants.X_OK);
            console.log('✅ Chrome is executable!');
            
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
                '--disable-extensions',
              ],
              headless: 'new'
            };
          } catch (err) {
            console.log('⚠️  Chrome not executable:', err.message);
          }
        }
      } catch (error) {
        console.log('⚠️  Error searching directory:', error.message);
      }
    } else {
      console.log('⚠️  Directory does not exist:', chromeDir);
    }
  }
  
  // Method 2: Try puppeteer.executablePath()
  try {
    const executablePath = puppeteer.executablePath();
    console.log('📍 Puppeteer executablePath():', executablePath);
    
    if (fs.existsSync(executablePath)) {
      console.log('✅ Found Chrome via puppeteer.executablePath()');
      return {
        executablePath,
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
    console.log('⚠️  puppeteer.executablePath() error:', error.message);
  }

  // Method 3: System paths
  const systemPaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ];

  console.log('🔍 Checking system paths...');
  for (const chromePath of systemPaths) {
    if (fs.existsSync(chromePath)) {
      console.log('✅ Found system Chrome:', chromePath);
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

  throw new Error(`
Chrome/Chromium not found!

Project root: ${projectRoot}
Checked paths: ${chromePaths.join(', ')}

Chrome should be installed at: ${projectRoot}/src/chrome/
  `);
}

module.exports = { getBrowserConfig };
