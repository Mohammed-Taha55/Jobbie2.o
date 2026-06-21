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
    logger.error(`[IIMJobs] safeEval error: ${e.message}`);
    return null;
  }
};

const applyIIMJobs = async ({ searchDoc, credential, resumePath, io, userId }) => {
  const searchId = searchDoc._id;
  let browser;

  const emit = (event, data) => {
    io.emit(`automation:${event}`, { searchId, ...data });
    logger.info(`[IIMJobs] ${event}: ${JSON.stringify(data)}`);
  };

  try {
    emit('log', { message: 'Launching browser for IIMJobs...', type: 'info' });
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
    emit('log', { message: 'Navigating to IIMJobs login...', type: 'info' });
    await page.goto('https://www.iimjobs.com/login', { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(1500, 2500);

    const emailSelectors = ['input[name="email"]', 'input[type="email"]', 'input[placeholder*="email" i]', '#email'];
    let emailField = null;
    for (const sel of emailSelectors) {
      emailField = await page.$(sel).catch(() => null);
      if (emailField) break;
    }
    if (!emailField) throw new Error('Could not find IIMJobs email field');
    await emailField.click({ clickCount: 3 });
    await emailField.type(credential.username, { delay: 80 });
    await randomDelay(400, 800);

    const passSelectors = ['input[name="password"]', 'input[type="password"]', 'input[placeholder*="password" i]', '#password'];
    let passField = null;
    for (const sel of passSelectors) {
      passField = await page.$(sel).catch(() => null);
      if (passField) break;
    }
    if (!passField) throw new Error('Could not find IIMJobs password field');
    await passField.click({ clickCount: 3 });
    await passField.type(credential.password, { delay: 80 });
    await randomDelay(400, 800);

    const submitBtn = await page.$('button[type="submit"], input[type="submit"], .login-btn, button.btn').catch(() => null);
    if (submitBtn) await submitBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
    await randomDelay(2000, 3000);

    if (page.url().includes('/login')) {
      const buf = await page.screenshot({ type: 'jpeg', quality: 50 });
      emit('log', { message: 'IIMJobs login failed — screenshot:', type: 'screenshot', image: `data:image/jpeg;base64,${buf.toString('base64')}` });
      throw new Error('IIMJobs login failed — still on login page. Check your credentials.');
    }
    emit('log', { message: 'Logged into IIMJobs successfully', type: 'success' });

    // ─── SEARCH ─────────────────────────────────────────────────────────────────
    // IIMJobs search URL: /search/<keyword>-jobs
    const keyword = searchDoc.keywords.trim().toLowerCase().replace(/\s+/g, '-');
    const loc = searchDoc.location ? encodeURIComponent(searchDoc.location) : '';
    let searchUrl = `https://www.iimjobs.com/search/${keyword}-jobs`;
    if (loc) searchUrl += `?loc=${loc}`;
    if (searchDoc.jobType === 'remote') searchUrl += `${loc ? '&' : '?'}posting=remote`;

    emit('log', { message: `Searching: ${searchUrl}`, type: 'info' });
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000, 3000);

    // Take a debug screenshot of search results
    const searchScreenshotBuf = await page.screenshot({ type: 'jpeg', quality: 40 }).catch(() => null);
    if (searchScreenshotBuf) {
      emit('log', { message: `Search results page loaded: ${page.url()}`, type: 'info', image: `data:image/jpeg;base64,${searchScreenshotBuf.toString('base64')}` });
    }

    let appliedCount = 0;
    let pageNum = 1;

    while (appliedCount < searchDoc.maxApplications) {
      emit('log', { message: `Scanning IIMJobs page ${pageNum}...`, type: 'info' });

      // ── Collect job data using CORRECT selectors from actual IIMJobs DOM ──────
      // Real structure: div.jobs-container > div.job-listing[data-jobid] > a[href]
      //   Inside: div.job-title > p > span  (title)
      //           div.job-meta             (exp + location)
      const jobLinks = await safeEval(page, () =>
        page.evaluate(() => {
          const results = [];
          const seen = new Set();

          // Primary: Look for the new React-based cards (joblist-card-v2) or general anchor tags
          const cards = Array.from(document.querySelectorAll('.joblist-card-v2, div.job-listing[data-jobid], article.job-card'));
          
          if (cards.length > 0) {
            cards.forEach(card => {
              const anchor = card.tagName.toLowerCase() === 'a' ? card : card.querySelector('a[href*="/j/"]');
              if (!anchor) return;

              let href = anchor.getAttribute('href') || '';
              if (href.startsWith('/')) href = 'https://www.iimjobs.com' + href;
              const jobUrl = href.split('?')[0];

              if (!jobUrl || seen.has(jobUrl)) return;
              seen.add(jobUrl);

              const titleEl = card.querySelector('[data-testid="job_title"], .joblist__title, .job-title span, .job-title p span, h2, h3');
              const jobTitle = titleEl ? titleEl.innerText.trim() : 'Unknown';

              const companyEl = card.querySelector('.company-name, .companyName, [class*="company"]');
              let company = companyEl ? companyEl.innerText.trim() : 'Unknown';
              if (company === 'Unknown') {
                const logoImg = card.querySelector('img.joblist__logo, .company-logo img');
                if (logoImg) company = logoImg.alt || 'Unknown';
              }

              const locEl = card.querySelector('.job-meta p, .location, [class*="location"]');
              const location = locEl ? locEl.innerText.trim() : '';

              results.push({ jobUrl, jobTitle, company, location });
            });
          } else {
            // Fallback: Just grab any anchor pointing to a job
            const anchors = Array.from(document.querySelectorAll('a[href*="/j/"]'));
            anchors.forEach(a => {
              let href = a.getAttribute('href') || '';
              if (href.startsWith('/')) href = 'https://www.iimjobs.com' + href;
              const jobUrl = href.split('?')[0];
              if (!jobUrl || seen.has(jobUrl)) return;
              seen.add(jobUrl);

              let jobTitle = a.innerText.trim() || 'Unknown';
              // If text is short or empty, try parent container
              if (jobTitle === 'Unknown' || jobTitle.length < 5) {
                const parent = a.parentElement?.parentElement;
                const titleEl = parent?.querySelector('[data-testid="job_title"], .joblist__title');
                if (titleEl) jobTitle = titleEl.innerText.trim();
              }
              
              results.push({ jobUrl, jobTitle, company: 'Unknown', location: '' });
            });
          }

          return results;
        })
      );

      emit('log', { message: `Raw job links extracted: ${jobLinks ? jobLinks.length : 0}`, type: 'info' });

      if (!Array.isArray(jobLinks) || jobLinks.length === 0) {
        // Debug: dump part of the page HTML to understand what went wrong
        const debugHtml = await safeEval(page, () =>
          page.evaluate(() => {
            const container = document.querySelector('.jobs-container, #jobs, [class*="job"]');
            return container ? container.outerHTML.slice(0, 1500) : document.body.innerHTML.slice(0, 1500);
          })
        );
        emit('log', { message: `Debug HTML snippet: ${debugHtml || 'none'}`, type: 'warning' });
        emit('log', { message: 'No job listings found on this page', type: 'warning' });
        break;
      }

      emit('log', { message: `Found ${jobLinks.length} job listings`, type: 'info' });
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
          await ApplicationLog.create({ userId, searchId, platform: 'iimjobs', jobTitle, company, location, jobUrl, status: 'duplicate' });
          await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.duplicate': 1 } });
          emit('log', { message: `Skipped (duplicate): ${jobTitle}`, type: 'warning' });
          continue;
        }

        emit('log', { message: `Applying to: ${jobTitle} at ${company}`, type: 'info' });
        emit('applying', { jobTitle, company, location });

        let applied = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            // Navigate main page to job (no new tabs — avoids detached frame)
            await page.goto(jobUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await randomDelay(2000, 3000);

            // IIMJobs apply button selectors (from real page inspection)
            const applySelectors = [
              'a#apply-button', 'button#apply-button',
              'a.apply-btn', 'button.apply-btn',
              'a[class*="apply" i]', 'button[class*="apply" i]',
              '.apply-now a', '.apply-now button',
              'a[href*="apply"]', 'a[href*="/apply"]',
              '.job-apply a', '.job-apply button',
              'button.btn-apply', 'a.btn-apply',
            ];
            let applyBtn = null;
            for (const sel of applySelectors) {
              applyBtn = await page.$(sel).catch(() => null);
              if (applyBtn) break;
            }

            if (!applyBtn) {
              // Try text-content fallback
              applyBtn = await page.evaluateHandle(() => {
                const btns = Array.from(document.querySelectorAll('a, button'));
                return btns.find(b => /^apply(\s+now)?$/i.test(b.innerText?.trim())) || null;
              }).catch(() => null);
              if (applyBtn && !(await applyBtn.asElement())) applyBtn = null;
            }

            if (!applyBtn) {
              await ApplicationLog.create({ userId, searchId, platform: 'iimjobs', jobTitle, company, location, jobUrl, status: 'skipped', errorMessage: 'No Apply button found' });
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

            const submitButton = await page.$('button[type="submit"], button.submit-btn, input[type="submit"]').catch(() => null);
            if (submitButton) {
              await submitButton.click();
              await randomDelay(2000, 3000);
            }

            await ApplicationLog.create({ userId, searchId, platform: 'iimjobs', jobTitle, company, location, jobUrl, status: 'applied' });
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
          await ApplicationLog.create({ userId, searchId, platform: 'iimjobs', jobTitle, company, location, jobUrl, status: 'failed', errorMessage: 'Max retries exceeded' });
          await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.failed': 1 } });
          emit('log', { message: `Failed after retries: ${jobTitle}`, type: 'error' });
        }

        // Return to search results before next job
        await page.goto(listingUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await randomDelay(2000, 4000);
      }

      // ─── NEXT PAGE ──────────────────────────────────────────────────────────
      try {
        if (page.url() !== listingUrl) {
          await page.goto(listingUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          await randomDelay(1000, 2000);
        }
        // IIMJobs pagination: look for "next" link
        const nextBtn = await page.$('a[rel="next"], a.next, .pagination a.next, a[aria-label*="next" i], .page-next a, a[title="Next"]').catch(() => null);
        if (!nextBtn) break;
        await nextBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
        pageNum++;
        await randomDelay(2000, 4000);
      } catch (_) { break; }
    }

    emit('log', { message: `IIMJobs session complete. Applied to ${appliedCount} jobs.`, type: 'success' });

  } catch (err) {
    logger.error(`[IIMJobs] Fatal error: ${err.message}`);
    emit('error', { message: err.message });
    throw err;
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = { applyIIMJobs };
