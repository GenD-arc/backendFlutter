#!/usr/bin/env node

/**
 * Verification script to check if Chrome is available
 * Run this after deployment to diagnose issues
 */

const fs = require('fs');

console.log('🔍 Chrome Installation Verification\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Check Node environment
console.log('📦 Environment:');
console.log(`   Node version: ${process.version}`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`   Platform: ${process.platform}`);
console.log(`   Architecture: ${process.arch}\n`);

// Check Puppeteer installation
console.log('🎭 Puppeteer Status:');
try {
  const puppeteer = require('puppeteer');
  console.log(`   ✅ Puppeteer installed: v${puppeteer._productVersion || 'unknown'}`);
  
  // Check executable path
  try {
    const execPath = puppeteer.executablePath();
    console.log(`   📍 Executable path: ${execPath}`);
    
    // Verify file exists
    if (fs.existsSync(execPath)) {
      console.log(`   ✅ Chrome binary exists`);
      
      // Check if executable
      try {
        fs.accessSync(execPath, fs.constants.X_OK);
        console.log(`   ✅ Chrome is executable\n`);
      } catch (err) {
        console.log(`   ❌ Chrome exists but is NOT executable`);
        console.log(`   Fix: Run 'chmod +x ${execPath}'\n`);
      }
    } else {
      console.log(`   ❌ Chrome binary NOT found at expected path\n`);
    }
  } catch (err) {
    console.log(`   ❌ Error getting executable path: ${err.message}\n`);
  }
} catch (err) {
  console.log(`   ❌ Puppeteer not installed: ${err.message}\n`);
}

// Check system Chrome paths
console.log('🌐 System Chrome Paths:');
const systemPaths = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/snap/bin/chromium',
];

let foundSystem = false;
systemPaths.forEach(path => {
  if (fs.existsSync(path)) {
    try {
      fs.accessSync(path, fs.constants.X_OK);
      console.log(`   ✅ ${path} (executable)`);
      foundSystem = true;
    } catch {
      console.log(`   ⚠️  ${path} (not executable)`);
    }
  }
});

if (!foundSystem) {
  console.log(`   ❌ No system Chrome installations found`);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Test launch
console.log('\n🚀 Attempting to launch browser...\n');

(async () => {
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    console.log('   ✅ Browser launched successfully!');
    
    const version = await browser.version();
    console.log(`   Chrome version: ${version}`);
    
    await browser.close();
    console.log('   ✅ Browser closed successfully\n');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ALL CHECKS PASSED - Chrome is working correctly!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (err) {
    console.log(`   ❌ Failed to launch browser`);
    console.log(`   Error: ${err.message}\n`);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('❌ VERIFICATION FAILED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n💡 Recommended Actions:');
    console.log('   1. Ensure Puppeteer is installed: npm install puppeteer');
    console.log('   2. Clear cache and reinstall: rm -rf node_modules package-lock.json && npm install');
    console.log('   3. Check build logs for installation errors');
    console.log('   4. Verify PUPPETEER_SKIP_CHROMIUM_DOWNLOAD is not set to true\n');
    
    process.exit(1);
  }
})();
