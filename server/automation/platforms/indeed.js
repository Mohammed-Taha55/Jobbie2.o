const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const ApplicationLog = require('../../models/ApplicationLog');
const JobSearch = require('../../models/JobSearch');
const logger = require('../../utils/logger');
const { getBrowserOptions } = require('../../utils/browserOptions');

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = (min = 1500, max = 3500) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

const safeEval = async (page, fn) => {
  try {
    if (page.isClosed()) return null;
    return await fn();
  } catch { return null; }
};

const applyIndeed = async ({ searchDoc, credential, resumePath, io, userId }) => {
  const searchId = searchDoc._id;
  let browser;

  const emit = (event, data) => {
    io.emit(`automation:${event}`, { searchId, ...data });
    logger.info(`[Indeed] ${event}: ${JSON.stringify(data)}`);
  };

  try {
    emit('log', { message: 'Launching browser...', type: 'info' });

    browser = await puppeteer.launch(getBrowserOptions());

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
    });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en-US', 'en'] });
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // ─── LOGIN ──────────────────────────────────────────────────────────────────
    emit('log', { message: 'Navigating to Indeed login...', type: 'info' });
    await page.goto('https://secure.indeed.com/auth', { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(1500, 2500);

    await page.waitForSelector('input[name="__email"]', { timeout: 15000 });
    await page.type('input[name="__email"]', credential.username, { delay: 80 });
    await randomDelay(500, 1000);

    const emailBtn = await page.$('button[type="submit"]');
    if (emailBtn) await emailBtn.click();
    await randomDelay(2000, 3000);

    await page.waitForSelector('input[name="__password"]', { timeout: 15000 });
    await page.type('input[name="__password"]', credential.password, { delay: 80 });
    await randomDelay(500, 1000);

    const passBtn = await page.$('button[type="submit"]');
    if (passBtn) await passBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await randomDelay(2000, 4000);

    const currentUrl = page.url();
    if (currentUrl.includes('/auth') || currentUrl.includes('captcha')) {
      const buf = await page.screenshot({ type: 'jpeg', quality: 50 });
      emit('log', { message: 'Screenshot of failed login:', type: 'screenshot', image: `data:image/jpeg;base64,${buf.toString('base64')}` });
      throw new Error('Indeed login failed — stuck on auth/captcha page.');
    }

    emit('log', { message: 'Logged in to Indeed successfully', type: 'success' });

    // ─── SEARCH ─────────────────────────────────────────────────────────────────
    const q = encodeURIComponent(searchDoc.keywords);
    const l = encodeURIComponent(searchDoc.location || '');
    const remoteFilter = searchDoc.jobType === 'remote' ? '&sc=0kf%3Aattr(DSQF7)%3B' : '';
    let searchUrl = `https://www.indeed.com/jobs?q=${q}&l=${l}${remoteFilter}&iafilter=1`; // iafilter=1 filters Easy Apply

    emit('log', { message: `Searching: ${searchUrl}`, type: 'info' });
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000, 3000);

    let appliedCount = 0;
    let pageNum = 1;

    while (appliedCount < searchDoc.maxApplications) {
      emit('log', { message: `Scanning page ${pageNum}...`, type: 'info' });

      // Collect job metadata from cards (we need the jk data attribute for URLs)
      const jobLinks = await safeEval(page, () =>
        page.evaluate(() => {
          const results = [];
          const cards = Array.from(document.querySelectorAll('.job_seen_beacon, .jobsearch-ResultsList > li'));
          const seen = new Set();
          cards.forEach(card => {
            try {
              const anchor = card.querySelector('h2.jobTitle a');
              if (!anchor) return;
              const jk = anchor.getAttribute('data-jk');
              if (!jk || seen.has(jk)) return;
              seen.add(jk);
              const titleEl = card.querySelector('h2.jobTitle a span');
              const companyEl = card.querySelector('[data-testid="company-name"]');
              const locEl = card.querySelector('[data-testid="text-location"]');
              results.push({
                jobUrl: `https://www.indeed.com/viewjob?jk=${jk}`,
                jobTitle: titleEl ? titleEl.innerText.trim() : 'Unknown',
                company: companyEl ? companyEl.innerText.trim() : 'Unknown',
                location: locEl ? locEl.innerText.trim() : '',
              });
            } catch (_) {}
          });
          return results;
        })
      );

      if (!Array.isArray(jobLinks) || jobLinks.length === 0) {
        emit('log', { message: 'No more job listings found', type: 'warning' });
        break;
      }

      const listingUrl = page.url();

      for (const job of jobLinks) {
        if (appliedCount >= searchDoc.maxApplications) break;
        const { jobUrl, jobTitle, company, location } = job;
        if (!jobUrl || jobTitle === 'Unknown') continue;

        const freshSearch = await JobSearch.findById(searchId);
        if (freshSearch?.status === 'stopped') {
          emit('log', { message: 'Automation stopped by user', type: 'warning' });
          return;
        }

        const isDuplicate = await ApplicationLog.findOne({ userId, jobUrl });
        if (isDuplicate) {
          await ApplicationLog.create({ userId, searchId, platform: 'indeed', jobTitle, company, location, jobUrl, status: 'duplicate' });
          await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.duplicate': 1 } });
          emit('log', { message: `Skipped (duplicate): ${jobTitle}`, type: 'warning' });
          continue;
        }

        emit('log', { message: `Applying to: ${jobTitle} at ${company}`, type: 'info' });
        emit('applying', { jobTitle, company, location });

        let applied = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            // Same-page navigation — no new tabs
            await page.goto(jobUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await randomDelay(2000, 3000);

            const easyApplyBtn = await page.$('button[id="indeedApplyButton"], .ia-IndeedApply-button, button[class*="IndeedApply"]').catch(() => null);

            if (!easyApplyBtn) {
              await ApplicationLog.create({ userId, searchId, platform: 'indeed', jobTitle, company, location, jobUrl, status: 'skipped', errorMessage: 'No Easy Apply button' });
              await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.skipped': 1 } });
              emit('log', { message: `Skipped (no Easy Apply): ${jobTitle}`, type: 'warning' });
              applied = true;
              break;
            }

            await easyApplyBtn.click();
            await randomDelay(2000, 3000);

            // Multi-step apply modal (up to 10 steps)
            for (let step = 0; step < 10; step++) {
              if (page.isClosed()) break;

              const resumeInput = await page.$('input[type="file"]').catch(() => null);
              if (resumeInput && resumePath) {
                await resumeInput.uploadFile(resumePath);
                await randomDelay(1500, 2500);
              }

              const continueBtn = await page.$('button[data-testid="IndeedApplyButton"], button[id="form-action-continue"], button[id="form-action-submit"]').catch(() => null);
              if (!continueBtn) break;

              const btnText = await page.evaluate((btn) => btn.innerText.toLowerCase(), continueBtn).catch(() => '');
              await continueBtn.click();
              await randomDelay(2000, 3000);

              if (btnText.includes('submit')) break;
            }

            await ApplicationLog.create({ userId, searchId, platform: 'indeed', jobTitle, company, location, jobUrl, status: 'applied' });
            await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.applied': 1 } });
            appliedCount++;
            applied = true;
            emit('applied', { jobTitle, company, appliedCount, maxApplications: searchDoc.maxApplications });
            emit('log', { message: `✓ Applied: ${jobTitle} at ${company}`, type: 'success' });
            break;
          } catch (err) {
            emit('log', { message: `Attempt ${attempt} failed for ${jobTitle}: ${err.message}`, type: 'error' });
            await delay(Math.pow(2, attempt) * 1000);
          }
        }

        if (!applied) {
          await ApplicationLog.create({ userId, searchId, platform: 'indeed', jobTitle, company, location, jobUrl, status: 'failed', errorMessage: 'Max retries exceeded' });
          await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.failed': 1 } });
          emit('log', { message: `Failed after retries: ${jobTitle}`, type: 'error' });
        }

        await page.goto(listingUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await randomDelay(2000, 4000);
      }

      // ─── NEXT PAGE ──────────────────────────────────────────────────────────
      try {
        if (page.url() !== listingUrl) {
          await page.goto(listingUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          await randomDelay(1000, 2000);
        }
        const nextBtn = await page.$('a[data-testid="pagination-page-next"]');
        if (!nextBtn) break;
        await nextBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
        pageNum++;
        await randomDelay(2000, 4000);
      } catch (_) { break; }
    }

    emit('log', { message: `Indeed session complete. Applied to ${appliedCount} jobs.`, type: 'success' });

  } catch (err) {
    logger.error(`[Indeed] Fatal error: ${err.message}`);
    emit('error', { message: err.message });
    throw err;
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = { applyIndeed };
