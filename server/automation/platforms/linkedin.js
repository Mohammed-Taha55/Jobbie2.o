const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const ApplicationLog = require('../../models/ApplicationLog');
const JobSearch = require('../../models/JobSearch');
const logger = require('../../utils/logger');
const { getBrowserOptions } = require('../../utils/browserOptions');

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = (min = 1500, max = 3500) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

const applyLinkedIn = async ({ searchDoc, credential, resumePath, io, userId }) => {
  const searchId = searchDoc._id;
  let browser;

  const emit = (event, data) => {
    io.emit(`automation:${event}`, { searchId, ...data });
    logger.info(`[LinkedIn] ${event}: ${JSON.stringify(data)}`);
  };

  try {
    emit('log', { message: 'Launching browser for LinkedIn...', type: 'info' });

    browser = await puppeteer.launch(getBrowserOptions());

    const page = await browser.newPage();
    
    // Extreme Stealth
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

    // ─── COOKIE INJECTION (BYPASS LOGIN) ──────────────────────────────────────
    let loggedInWithCookies = false;
    if (credential.cookies && credential.cookies.trim() !== '') {
      try {
        const cookiesArr = JSON.parse(credential.cookies);
        if (Array.isArray(cookiesArr) && cookiesArr.length > 0) {
          emit('log', { message: 'Sanitizing and injecting session cookies...', type: 'info' });
          
          const sanitizedCookies = cookiesArr.map(c => {
            let sameSite = c.sameSite;
            if (sameSite === 'no_restriction' || sameSite === 'None') sameSite = 'None';
            else if (sameSite === 'unspecified' || sameSite === 'lax') sameSite = 'Lax';
            else if (sameSite === 'strict') sameSite = 'Strict';
            else sameSite = undefined;

            return {
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path || '/',
              expires: c.expirationDate || c.expires,
              httpOnly: c.httpOnly,
              secure: c.secure,
              sameSite
            };
          });

          await page.setCookie(...sanitizedCookies);
          await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle2', timeout: 30000 });
          await randomDelay(2000, 4000);
          
          if (!page.url().includes('/login') && !page.url().includes('/checkpoint')) {
            emit('log', { message: 'Cookie injection successful! Logged in.', type: 'success' });
            loggedInWithCookies = true;
          } else {
            emit('log', { message: 'Cookies expired or invalid. Falling back to password login...', type: 'warning' });
          }
        }
      } catch (err) {
        console.error('Cookie injection error:', err);
        emit('log', { message: `Cookie injection failed: ${err.message}`, type: 'error' });
      }
    }

    // ─── LOGIN ─────────────────────────────────────────────────────────────────
    if (!loggedInWithCookies) {
      emit('log', { message: 'Navigating to LinkedIn login...', type: 'info' });
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle2', timeout: 30000 });
      await randomDelay(1000, 2000);

      await page.waitForSelector('#username', { timeout: 15000 });
      await page.type('#username', credential.username, { delay: 70 });
      await randomDelay(400, 800);

      await page.waitForSelector('#password', { timeout: 10000 });
      await page.type('#password', credential.password, { delay: 70 });
      await randomDelay(400, 800);

      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
      await randomDelay(2000, 4000);

      // Check login errors
      const loginError = await page.$('.alert-content, .login__form_action_container .error').catch(() => null);
      if (loginError) {
        const errText = await page.evaluate((el) => el.innerText, loginError).catch(() => '');
        throw new Error(`LinkedIn login failed: ${errText || 'Invalid credentials'}`);
      }

      // Check if we're on the feed or home page (logged in)
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
        const screenshotBuf = await page.screenshot({ type: 'jpeg', quality: 50 });
        const base64Img = `data:image/jpeg;base64,${screenshotBuf.toString('base64')}`;
        emit('log', { message: 'Screenshot of the failed login page:', type: 'screenshot', image: base64Img });
        throw new Error('LinkedIn login blocked — may require CAPTCHA or 2FA. Please login manually once.');
      }
    }

    emit('log', { message: 'Logged into LinkedIn successfully', type: 'success' });

    // ─── BUILD SEARCH URL ──────────────────────────────────────────────────────
    const params = new URLSearchParams();
    params.set('keywords', searchDoc.keywords);
    params.set('f_LF', 'f_AL'); // Easy Apply filter
    if (searchDoc.location) params.set('location', searchDoc.location);
    if (searchDoc.jobType === 'remote') params.set('f_WT', '2');
    else if (searchDoc.jobType === 'hybrid') params.set('f_WT', '3');
    else if (searchDoc.jobType === 'onsite') params.set('f_WT', '1');

    // Experience level mapping
    const expMap = { fresher: '1', '1-3': '2', '3-5': '3', '5-10': '4', '10+': '5' };
    if (searchDoc.experience !== 'any' && expMap[searchDoc.experience]) {
      params.set('f_E', expMap[searchDoc.experience]);
    }

    const searchUrl = `https://www.linkedin.com/jobs/search/?${params.toString()}`;
    emit('log', { message: `Searching: ${searchUrl}`, type: 'info' });

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000, 3000);

    // ─── SCRAPE JOB LISTINGS ──────────────────────────────────────────────────
    let appliedCount = 0;
    let pageNum = 1;

    while (appliedCount < searchDoc.maxApplications) {
      emit('log', { message: `Scanning LinkedIn page ${pageNum}...`, type: 'info' });
      await randomDelay(1500, 2500);

      // Wait for job cards
      await page.waitForSelector('.jobs-search__results-list li, .scaffold-layout__list li', { timeout: 10000 }).catch(() => {});
      const jobCards = await page.$$('.jobs-search__results-list li, .scaffold-layout__list li');

      if (!jobCards.length) {
        emit('log', { message: 'No more LinkedIn job listings found', type: 'warning' });
        break;
      }

      for (const card of jobCards) {
        if (appliedCount >= searchDoc.maxApplications) break;

        // Check for stop signal
        const freshSearch = await JobSearch.findById(searchId);
        if (freshSearch?.status === 'stopped') {
          emit('log', { message: 'Automation stopped by user', type: 'warning' });
          return;
        }

        let jobTitle = 'Unknown';
        let company = 'Unknown';
        let jobUrl = '';
        let location = '';

        try {
          jobTitle = await card.$eval('.job-card-list__title, .base-search-card__title', (el) => el.innerText.trim()).catch(() => 'Unknown');
          company = await card.$eval('.job-card-container__primary-description, .base-search-card__subtitle', (el) => el.innerText.trim()).catch(() => 'Unknown');
          location = await card.$eval('.job-card-container__metadata-item, .job-search-card__location', (el) => el.innerText.trim()).catch(() => '');
          jobUrl = await card.$eval('a.job-card-list__title, a.base-card__full-link', (el) => el.href).catch(() => '');
        } catch (_) {
          continue;
        }

        if (!jobUrl) continue;

        // Normalize URL — remove tracking query params
        const cleanUrl = jobUrl.split('?')[0];

        // Duplicate check
        const isDuplicate = await ApplicationLog.findOne({ userId, jobUrl: cleanUrl });
        if (isDuplicate) {
          emit('log', { message: `Skipped (duplicate): ${jobTitle}`, type: 'warning' });
          await ApplicationLog.create({ userId, searchId, platform: 'linkedin', jobTitle, company, location, jobUrl: cleanUrl, status: 'duplicate' });
          await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.duplicate': 1 } });
          continue;
        }

        emit('log', { message: `Applying to: ${jobTitle} at ${company}`, type: 'info' });
        emit('applying', { jobTitle, company, location });

        // ─── APPLY WITH RETRY ────────────────────────────────────────────────
        let applied = false;

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            // Click the card to open job detail panel
            await card.click();
            await randomDelay(1500, 2500);

            // Look for Easy Apply button in the detail panel
            const easyApplyBtn = await page.$(
              'button.jobs-apply-button, .jobs-s-apply button, button[aria-label*="Easy Apply"]'
            ).catch(() => null);

            if (!easyApplyBtn) {
              await ApplicationLog.create({ userId, searchId, platform: 'linkedin', jobTitle, company, location, jobUrl: cleanUrl, status: 'skipped', errorMessage: 'No Easy Apply button' });
              await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.skipped': 1 } });
              emit('log', { message: `Skipped (no Easy Apply): ${jobTitle}`, type: 'warning' });
              applied = true;
              break;
            }

            await easyApplyBtn.click();
            await randomDelay(2000, 3000);

            // Handle multi-step Easy Apply modal (up to 10 steps)
            let submitted = false;
            for (let step = 0; step < 10; step++) {
              // Upload resume if file input appears
              const resumeInput = await page.$('input[type="file"]').catch(() => null);
              if (resumeInput && resumePath) {
                await resumeInput.uploadFile(resumePath);
                await randomDelay(1000, 2000);
              }

              // Find the main action button
              const submitBtn = await page.$('button[aria-label="Submit application"]').catch(() => null);
              const nextBtn = await page.$('button[aria-label="Continue to next step"]').catch(() => null);
              const reviewBtn = await page.$('button[aria-label="Review your application"]').catch(() => null);

              if (submitBtn) {
                await submitBtn.click();
                await randomDelay(2000, 3000);
                submitted = true;
                break;
              } else if (reviewBtn) {
                await reviewBtn.click();
                await randomDelay(1500, 2500);
              } else if (nextBtn) {
                await nextBtn.click();
                await randomDelay(1500, 2500);
              } else {
                // Try generic continue/submit button
                const genericBtn = await page.$(
                  'button[data-easy-apply-next-button], footer button[aria-label*="submit" i], footer button[aria-label*="next" i]'
                ).catch(() => null);
                if (!genericBtn) break;
                const btnLabel = await page.evaluate((b) => b.getAttribute('aria-label') || b.innerText, genericBtn).catch(() => '');
                await genericBtn.click();
                await randomDelay(1500, 2500);
                if (/submit/i.test(btnLabel)) { submitted = true; break; }
              }
            }

            // Dismiss any success/post-apply dialog
            const dismissBtn = await page.$('button[aria-label="Dismiss"]').catch(() => null);
            if (dismissBtn) await dismissBtn.click().catch(() => {});

            if (submitted) {
              await ApplicationLog.create({ userId, searchId, platform: 'linkedin', jobTitle, company, location, jobUrl: cleanUrl, status: 'applied' });
              await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.applied': 1 } });
              appliedCount++;
              applied = true;
              emit('applied', { jobTitle, company, appliedCount, maxApplications: searchDoc.maxApplications });
              emit('log', { message: `✓ Applied: ${jobTitle} at ${company}`, type: 'success' });
            } else {
              // Modal didn't reach submit — close it and skip
              const closeBtn = await page.$('button[aria-label="Dismiss"]').catch(() => null);
              if (closeBtn) await closeBtn.click().catch(() => {});
              await ApplicationLog.create({ userId, searchId, platform: 'linkedin', jobTitle, company, location, jobUrl: cleanUrl, status: 'skipped', errorMessage: 'Could not complete multi-step form' });
              await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.skipped': 1 } });
              emit('log', { message: `Skipped (multi-step form incomplete): ${jobTitle}`, type: 'warning' });
              applied = true;
            }
            break;

          } catch (err) {
            emit('log', { message: `Attempt ${attempt} failed for ${jobTitle}: ${err.message}`, type: 'error' });
            // Close any open modal before retrying
            await page.keyboard.press('Escape').catch(() => {});
            await delay(Math.pow(2, attempt) * 1000);
          }
        }

        if (!applied) {
          await ApplicationLog.create({ userId, searchId, platform: 'linkedin', jobTitle, company, location, jobUrl: cleanUrl, status: 'failed', errorMessage: 'Max retries exceeded' });
          await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.failed': 1 } });
          emit('log', { message: `Failed after retries: ${jobTitle}`, type: 'error' });
        }

        await randomDelay(3000, 6000);
      }

      // ─── NEXT PAGE ───────────────────────────────────────────────────────────
      try {
        const nextPageBtn = await page.$('button[aria-label="View next page"], li.artdeco-pagination__indicator--number:last-child button');
        if (!nextPageBtn) break;
        await nextPageBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
        pageNum++;
        await randomDelay(2000, 4000);
      } catch (_) {
        break;
      }
    }

    emit('log', { message: `LinkedIn session complete. Applied to ${appliedCount} jobs.`, type: 'success' });

  } catch (err) {
    logger.error(`[LinkedIn] Fatal error: ${err.message}`);
    emit('error', { message: err.message });
    throw err;
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = { applyLinkedIn };
