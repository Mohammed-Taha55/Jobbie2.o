/**
 * Returns puppeteer launch options that work in both:
 *  - Local development (Mac/Windows — uses Puppeteer's bundled Chromium)
 *  - Railway/Linux production (uses Nix-installed Chromium)
 */
const getBrowserOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
    '--single-process',  // Required on Railway (limited resources)
    '--window-size=1440,900',
  ];

  const options = {
    headless: true,
    args,
    defaultViewport: { width: 1440, height: 900 },
  };

  // In production, use the Nix-installed Chromium (set via PUPPETEER_EXECUTABLE_PATH env var)
  if (isProd && process.env.PUPPETEER_EXECUTABLE_PATH) {
    options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  return options;
};

module.exports = { getBrowserOptions };
