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
  } catch (e) {
    logger.error(`[Instahyre] safeEval error: ${e.message}`);
    return null;
  }
};

const applyInstahyre = async ({ searchDoc, credential, resumePath, io, userId }) => {
  const searchId = searchDoc._id;
  let browser;

  const emit = (event, data) => {
    io.emit(`automation:${event}`, { searchId, ...data });
    logger.info(`[Instahyre] ${event}: ${JSON.stringify(data)}`);
  };

  try {
    emit('log', { message: 'Launching browser for Instahyre...', type: 'info' });
    browser = await puppeteer.launch(getBrowserOptions());
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8' });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    });

    // ─── LOGIN ──────────────────────────────────────────────────────────────────
    // Confirmed URL from live inspection: https://www.instahyre.com/login/
    emit('log', { message: 'Navigating to Instahyre login...', type: 'info' });
    await page.goto('https://www.instahyre.com/login/', { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000, 3000);

    // Confirmed selectors from live screenshot: #email, #password, button.btn-success
    await page.waitForSelector('#email', { timeout: 15000 });
    await page.click('#email', { clickCount: 3 });
    await page.type('#email', credential.username, { delay: 80 });
    await randomDelay(500, 800);

    await page.waitForSelector('#password', { timeout: 10000 });
    await page.click('#password', { clickCount: 3 });
    await page.type('#password', credential.password, { delay: 80 });
    await randomDelay(500, 800);

    // Click green Login button (btn-success)
    const submitBtn = await page.$('button.btn-success, button[type="submit"]').catch(() => null);
    if (!submitBtn) throw new Error('Could not find Instahyre Login button');
    await submitBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
    await randomDelay(2000, 3000);

    const loginUrl = page.url();
    if (loginUrl.includes('/login')) {
      const buf = await page.screenshot({ type: 'jpeg', quality: 50 });
      emit('log', { message: 'Login failed screenshot:', type: 'info', image: `data:image/jpeg;base64,${buf.toString('base64')}` });
      throw new Error('Instahyre login failed. Check your credentials.');
    }
    emit('log', { message: 'Logged into Instahyre successfully', type: 'success' });

    // ─── SEARCH ─────────────────────────────────────────────────────────────────
    const q = encodeURIComponent(searchDoc.keywords.trim());
    const loc = searchDoc.location ? encodeURIComponent(searchDoc.location) : '';
    let searchUrl = `https://www.instahyre.com/search-jobs/?q=${q}`;
    if (loc) searchUrl += `&location=${loc}`;

    emit('log', { message: `Searching: ${searchUrl}`, type: 'info' });
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000, 3000);

    let appliedCount = 0;
    let pageNum = 1;

    while (appliedCount < searchDoc.maxApplications) {
      emit('log', { message: `Scanning Instahyre page ${pageNum}...`, type: 'info' });

      // Wait for Angular to render job cards
      await page.waitForSelector('a[href*="/job-"]', { timeout: 10000 }).catch(() => {});

      // Confirmed selectors from live inspection:
      // Anchors with href matching /job-<digits>-<slug>/
      const jobLinks = await safeEval(page, () =>
        page.evaluate(() => {
          const results = [];
          const seen = new Set();
          const anchors = Array.from(document.querySelectorAll('a[href*="/job-"]'));
          anchors.forEach(a => {
            let href = a.getAttribute('href') || '';
            if (!/\/job-\d+/.test(href)) return;
            if (href.startsWith('/')) href = 'https://www.instahyre.com' + href;
            const jobUrl = href.split('?')[0];
            if (!jobUrl || seen.has(jobUrl)) return;
            seen.add(jobUrl);

            // Walk up to the card wrapper to extract title and company
            const card = a.closest('[class*="opportunity"], [class*="card"], li') || a.parentElement?.parentElement;
            const titleEl = card ? card.querySelector('h2, h3, h4, [class*="title"], [class*="position"]') : null;
            let jobTitle = titleEl ? titleEl.innerText?.trim() : (a.innerText?.trim() || 'Unknown');
            const companyEl = card ? card.querySelector('[class*="company"], [class*="employer"]') : null;
            let company = companyEl ? companyEl.innerText?.trim() : 'Unknown';
            const locEl = card ? card.querySelector('[class*="location"], [class*="city"]') : null;
            const location = locEl ? locEl.innerText?.trim() : '';

            if (!jobTitle || jobTitle.length < 2) jobTitle = 'Unknown';
            results.push({ jobUrl, jobTitle, company, location });
          });
          return results;
        })
      );

      if (!Array.isArray(jobLinks) || jobLinks.length === 0) {
        emit('log', { message: 'No job listings found on this page', type: 'warning' });
        break;
      }

      emit('log', { message: `Found ${jobLinks.length} job listings`, type: 'info' });
      const listingUrl = page.url();

      for (const job of jobLinks) {
        if (appliedCount >= searchDoc.maxApplications) break;
        const { jobUrl, jobTitle, company, location } = job;
        if (!jobUrl) continue;

        const freshSearch = await JobSearch.findById(searchId);
        if (freshSearch?.status === 'stopped') {
          emit('log', { message: 'Automation stopped by user', type: 'warning' });
          return;
        }

        const isDuplicate = await ApplicationLog.findOne({ userId, jobUrl });
        if (isDuplicate) {
          await ApplicationLog.create({ userId, searchId, platform: 'instahyre', jobTitle, company, location, jobUrl, status: 'duplicate' });
          await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.duplicate': 1 } });
          emit('log', { message: `Skipped (duplicate): ${jobTitle}`, type: 'warning' });
          continue;
        }

        emit('log', { message: `Applying to: ${jobTitle} at ${company}`, type: 'info' });
        emit('applying', { jobTitle, company, location });

        let applied = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await page.goto(jobUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await randomDelay(2000, 3000);

            // Find apply button on job detail page
            const applySelectors = [
              'button.apply-btn', 'a.apply-btn',
              'button[class*="apply"]', 'a[class*="apply"]',
              '.apply-section button', '.apply-section a',
              'button.btn-primary', 'a.btn-primary',
            ];
            let applyBtn = null;
            for (const sel of applySelectors) {
              applyBtn = await page.$(sel).catch(() => null);
              if (applyBtn) break;
            }
            if (!applyBtn) {
              applyBtn = await page.evaluateHandle(() => {
                const all = [...document.querySelectorAll('button, a')];
                return all.find(el => /^apply(\s+now)?$/i.test(el.innerText?.trim())) || null;
              }).catch(() => null);
              if (applyBtn && !(await applyBtn.asElement())) applyBtn = null;
            }

            if (!applyBtn) {
              await ApplicationLog.create({ userId, searchId, platform: 'instahyre', jobTitle, company, location, jobUrl, status: 'skipped', errorMessage: 'No Apply button found' });
              await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.skipped': 1 } });
              emit('log', { message: `Skipped (no apply button): ${jobTitle}`, type: 'warning' });
              applied = true;
              break;
            }

            await applyBtn.click();
            await randomDelay(2000, 3000);

            const resumeInput = await page.$('input[type="file"]').catch(() => null);
            if (resumeInput && resumePath) {
              await resumeInput.uploadFile(resumePath);
              await randomDelay(1000, 2000);
            }

            const submitButton = await page.$('button[type="submit"]').catch(() => null);
            if (submitButton) {
              await submitButton.click();
              await randomDelay(2000, 3000);
            }

            await ApplicationLog.create({ userId, searchId, platform: 'instahyre', jobTitle, company, location, jobUrl, status: 'applied' });
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
          await ApplicationLog.create({ userId, searchId, platform: 'instahyre', jobTitle, company, location, jobUrl, status: 'failed', errorMessage: 'Max retries exceeded' });
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
        const nextBtn = await page.$('a.next, a[rel="next"], .pagination .next a, [aria-label*="next" i]').catch(() => null);
        if (!nextBtn) break;
        await nextBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
        pageNum++;
        await randomDelay(2000, 4000);
      } catch (_) { break; }
    }

    emit('log', { message: `Instahyre session complete. Applied to ${appliedCount} jobs.`, type: 'success' });

  } catch (err) {
    logger.error(`[Instahyre] Fatal error: ${err.message}`);
    emit('error', { message: err.message });
    throw err;
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = { applyInstahyre };
