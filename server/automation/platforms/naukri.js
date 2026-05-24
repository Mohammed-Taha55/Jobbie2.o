const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const ApplicationLog = require('../../models/ApplicationLog');
const JobSearch = require('../../models/JobSearch');
const logger = require('../../utils/logger');
const { getBrowserOptions } = require('../../utils/browserOptions');
const eventBus = require('../../utils/eventBus');

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = (min = 1500, max = 3500) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

// Safe text extractor — returns '' on failure
const safeText = async (el, selector) => {
  try { return await el.$eval(selector, (e) => e.innerText.trim()); } catch { return ''; }
};
const safeAttr = async (el, selector, attr) => {
  try { return await el.$eval(selector, (e, a) => e.getAttribute(a), attr); } catch { return ''; }
};

const applyNaukri = async ({ searchDoc, credential, resumePath, io, userId }) => {
  const searchId = searchDoc._id;
  let browser;

  const emit = (event, data) => {
    io.emit(`automation:${event}`, { searchId, ...data });
    logger.info(`[Naukri] ${event}: ${JSON.stringify(data)}`);
  };

  try {
    emit('log', { message: 'Launching browser for Naukri...', type: 'info' });

    browser = await puppeteer.launch(getBrowserOptions());

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    // ─── LOGIN ─────────────────────────────────────────────────────────────────
    emit('log', { message: 'Navigating to Naukri login...', type: 'info' });
    await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(1500, 2500);

    // Try multiple possible selectors for email/username field
    const emailSelectors = ['#usernameField', 'input[placeholder*="email" i]', 'input[name="username"]', 'input[type="email"]'];
    let emailField = null;
    for (const sel of emailSelectors) {
      emailField = await page.$(sel).catch(() => null);
      if (emailField) break;
    }
    if (!emailField) throw new Error('Could not find Naukri email input field');
    await emailField.click({ clickCount: 3 });
    await emailField.type(credential.username, { delay: 80 });
    await randomDelay(400, 800);

    // Password field
    const passSelectors = ['#passwordField', 'input[placeholder*="password" i]', 'input[name="password"]', 'input[type="password"]'];
    let passField = null;
    for (const sel of passSelectors) {
      passField = await page.$(sel).catch(() => null);
      if (passField) break;
    }
    if (!passField) throw new Error('Could not find Naukri password input field');
    await passField.click({ clickCount: 3 });
    await passField.type(credential.password, { delay: 80 });
    await randomDelay(400, 800);

    // Click submit
    const submitBtn = await page.$('button[type="submit"]').catch(() => null);
    if (submitBtn) await submitBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
    await randomDelay(2000, 4000);

    // Check login failure
    const errEl = await page.$('.loginErrorMsg, .error-msg, [class*="error"]').catch(() => null);
    if (errEl) {
      const errText = await page.evaluate((el) => el.innerText, errEl).catch(() => '');
      if (errText && errText.length > 0) throw new Error(`Naukri login failed: ${errText}`);
    }

    // Check for OTP Request
    const otpSelectors = ['#otp', 'input[name="otp"]', 'input[placeholder*="OTP" i]', '.otp-input'];
    let otpField = null;
    for (const sel of otpSelectors) {
      otpField = await page.$(sel).catch(() => null);
      if (otpField) break;
    }

    if (otpField) {
      emit('log', { message: 'OTP Required. Waiting for user input...', type: 'warning' });
      emit('otp_required', { message: 'Naukri has sent an OTP to your email. Please enter it here to continue.' });

      // Pause automation and wait for the user to submit the OTP via the API -> EventBus
      const otpPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('OTP timeout — you did not enter the OTP within 2 minutes.')), 120000);
        eventBus.once(`otp:${searchId}`, (otpCode) => {
          clearTimeout(timeout);
          resolve(otpCode);
        });
      });

      const otpCode = await otpPromise;
      emit('log', { message: 'OTP received, submitting...', type: 'info' });
      
      await otpField.click();
      await otpField.type(otpCode, { delay: 100 });
      await randomDelay(500, 1000);

      const otpSubmit = await page.$('button[type="submit"], button#submitOtp, .submit-btn').catch(() => null);
      if (otpSubmit) await otpSubmit.click();
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
      await randomDelay(2000, 4000);
    }

    // Verify we're logged in by checking URL / page content
    const loggedInUrl = page.url();
    if (loggedInUrl.includes('/login') || loggedInUrl.includes('/nlogin')) {
      throw new Error('Naukri login failed — still on login page. Check credentials or OTP.');
    }

    emit('log', { message: 'Logged into Naukri successfully', type: 'success' });

    // ─── BUILD SEARCH URL ──────────────────────────────────────────────────────
    const keyword = searchDoc.keywords.trim().replace(/\s+/g, '-');
    let searchUrl = `https://www.naukri.com/${encodeURIComponent(keyword)}-jobs`;
    const queryParams = new URLSearchParams();
    if (searchDoc.location) queryParams.append('location', searchDoc.location);
    if (searchDoc.jobType === 'remote') queryParams.append('wfhType', '2');
    if (searchDoc.jobType === 'hybrid') queryParams.append('wfhType', '3');
    if (searchDoc.experience !== 'any') {
      const expMap = { fresher: '0', '1-3': '1', '3-5': '3', '5-10': '5', '10+': '10' };
      queryParams.append('experience', expMap[searchDoc.experience] || '0');
    }
    const qs = queryParams.toString();
    if (qs) searchUrl += `?${qs}`;

    emit('log', { message: `Searching: ${searchUrl}`, type: 'info' });
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000, 3000);

    // ─── SCRAPE JOB LISTINGS ──────────────────────────────────────────────────
    let appliedCount = 0;
    let pageNum = 1;

    while (appliedCount < searchDoc.maxApplications) {
      emit('log', { message: `Scanning Naukri page ${pageNum}...`, type: 'info' });

      // Modern Naukri selectors (2024/2025)
      const cardSelectors = [
        'article.jobTuple',
        '[data-job-id]',
        '.cust-job-tuple',
        '.jobTuple',
        'li.srp-jobtuple-wrapper',
      ];

      let jobCards = [];
      for (const sel of cardSelectors) {
        jobCards = await page.$$(sel);
        if (jobCards.length > 0) break;
      }

      if (!jobCards.length) {
        emit('log', { message: 'No job listings found on this page', type: 'warning' });
        break;
      }

      emit('log', { message: `Found ${jobCards.length} job cards`, type: 'info' });

      for (const card of jobCards) {
        if (appliedCount >= searchDoc.maxApplications) break;

        // Check for stop
        const freshSearch = await JobSearch.findById(searchId);
        if (freshSearch?.status === 'stopped') {
          emit('log', { message: 'Automation stopped by user', type: 'warning' });
          return;
        }

        // Extract job details with multiple fallback selectors
        let jobTitle = 'Unknown';
        let company = 'Unknown';
        let jobUrl = '';
        let location = '';

        try {
          // Title / URL — try multiple selectors
          const titleEl = await card.$('.title a, .row1 a, [class*="jobTitle"] a, a.job-title, a[title]').catch(() => null);
          if (titleEl) {
            jobTitle = await page.evaluate((el) => el.innerText?.trim() || el.getAttribute('title') || 'Unknown', titleEl);
            jobUrl = await page.evaluate((el) => el.href, titleEl);
          }

          // Company
          company = await safeText(card, '.companyInfo a, .company-name, [class*="companyName"], .comp-name')
            || await safeText(card, '.row2 .company-name')
            || 'Unknown';

          // Location
          location = await safeText(card, '.location span, [class*="location"] li span, .loc span, .locWdth')
            || '';
        } catch (_) { continue; }

        if (!jobUrl || !jobTitle || jobTitle === 'Unknown') continue;

        // Duplicate check
        const isDuplicate = await ApplicationLog.findOne({ userId, jobUrl });
        if (isDuplicate) {
          await ApplicationLog.create({ userId, searchId, platform: 'naukri', jobTitle, company, location, jobUrl, status: 'duplicate' });
          await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.duplicate': 1 } });
          emit('log', { message: `Skipped (duplicate): ${jobTitle}`, type: 'warning' });
          continue;
        }

        emit('log', { message: `Applying to: ${jobTitle} at ${company}`, type: 'info' });
        emit('applying', { jobTitle, company, location });

        // ─── APPLY WITH RETRY ────────────────────────────────────────────────
        let applied = false;

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const jobPage = await browser.newPage();
            await jobPage.goto(jobUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await randomDelay(2000, 3000);

            // Look for Apply button with multiple selectors
            const applySelectors = [
              'button#apply-button',
              'button.apply-button',
              'button[id*="apply" i]',
              'a[id*="apply" i]',
              'button[class*="apply" i]',
              '.apply-btn button',
              'div#apply-job button',
            ];
            let applyBtn = null;
            for (const sel of applySelectors) {
              applyBtn = await jobPage.$(sel).catch(() => null);
              if (applyBtn) break;
            }

            if (!applyBtn) {
              await jobPage.close();
              await ApplicationLog.create({ userId, searchId, platform: 'naukri', jobTitle, company, location, jobUrl, status: 'skipped', errorMessage: 'No Apply button found' });
              await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.skipped': 1 } });
              emit('log', { message: `Skipped (no apply button): ${jobTitle}`, type: 'warning' });
              applied = true;
              break;
            }

            await applyBtn.click();
            await randomDelay(2000, 3000);

            // Handle resume upload if prompted
            const resumeInput = await jobPage.$('input[type="file"]').catch(() => null);
            if (resumeInput && resumePath) {
              await resumeInput.uploadFile(resumePath);
              await randomDelay(1000, 2000);
            }

            // Submit
            const submitSelectors = ['button[type="submit"]', 'button.submit-btn', 'button#submit', 'button[class*="submit" i]', '.submit-application button'];
            let submitButton = null;
            for (const sel of submitSelectors) {
              submitButton = await jobPage.$(sel).catch(() => null);
              if (submitButton) break;
            }
            if (submitButton) {
              await submitButton.click();
              await randomDelay(2000, 3000);
            }

            await jobPage.close();
            await ApplicationLog.create({ userId, searchId, platform: 'naukri', jobTitle, company, location, jobUrl, status: 'applied' });
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
          await ApplicationLog.create({ userId, searchId, platform: 'naukri', jobTitle, company, location, jobUrl, status: 'failed', errorMessage: 'Max retries exceeded' });
          await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.failed': 1 } });
          emit('log', { message: `Failed after retries: ${jobTitle}`, type: 'error' });
        }

        await randomDelay(3000, 6000);
      }

      // ─── NEXT PAGE ───────────────────────────────────────────────────────────
      try {
        const nextBtn = await page.$('a.fright.fs14.btn-secondary, a[class*="pagination"] span[class*="next"], a.pagination-next, [data-ga-click*="next"]');
        if (!nextBtn) break;
        await nextBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
        pageNum++;
        await randomDelay(2000, 4000);
      } catch (_) { break; }
    }

    emit('log', { message: `Naukri session complete. Applied to ${appliedCount} jobs.`, type: 'success' });

  } catch (err) {
    logger.error(`[Naukri] Fatal error: ${err.message}`);
    emit('error', { message: err.message });
    throw err;
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = { applyNaukri };
