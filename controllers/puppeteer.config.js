const fs = require('fs');
const path = require('path');

const getBrowserConfig = () => {
  console.log('🚀 Initializing Puppeteer with bundled Chrome...');
  
  return {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
    ],
    timeout: 30000,
  };
};

module.exports = { getBrowserConfig };
