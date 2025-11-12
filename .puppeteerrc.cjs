const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Download Chrome during npm install
  skipDownload: false,
  
  // Cache Chrome in project directory for Render
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
