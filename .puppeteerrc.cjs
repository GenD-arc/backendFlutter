const { join } = require('path');

module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
```

**File 2: Create `verify-chrome.js` in project root:**

Copy the code from the `verify_chrome_script` artifact I provided earlier.

**File 3: Update `src/controllers/puppeteer.config.js`:**

Copy the code from the `puppeteer_config_fix` artifact I provided earlier.

**File 4: Add to `.gitignore`:**
```
# Puppeteer cache
.cache/
node_modules/
package-lock.json
