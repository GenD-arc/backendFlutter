const getBrowserConfig = () => {
  // Check if we're in production (Render) or development
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Try to find Chromium in common locations
  const chromiumPaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
  ].filter(Boolean);

  console.log('🔍 Looking for Chrome/Chromium in:', chromiumPaths);

  return {
    headless: 'new',
    executablePath: chromiumPaths[0], // Use first available path
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // Overcome limited resource problems
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
      ...(isProduction ? ['--single-process'] : []), // Only in production
    ],
  };
};

module.exports = { getBrowserConfig };
