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
    logger.error(`[Foundit] safeEval error: ${e.message}`);
    return null;
  }
};

const applyFoundit = async ({ searchDoc, credential, resumePath, io, userId }) => {
  const searchId = searchDoc._id;
  let browser;

  const emit = (event, data) => {
    io.emit(`automation:${event}`, { searchId, ...data });
    logger.info(`[Foundit] ${event}: ${JSON.stringify(data)}`);
  };

  try {
    emit('log', { message: 'Launching browser for Foundit (Monster India)...', type: 'info' });
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
    // Foundit has a standalone login page at /rio/login/seeker
    emit('log', { message: 'Navigating to Foundit login page...', type: 'info' });
    await page.goto('https://www.foundit.in/rio/login/seeker', { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000, 3000);

    // Look for email field using precise IDs from live inspection
    const emailSelectors = ['input#userName', 'input[name="userName"]', 'input.userName', 'input[placeholder*="Email" i]', 'input[type="text"]'];
    let emailField = null;
    for (const sel of emailSelectors) {
      await page.waitForSelector(sel, { timeout: 5000 }).catch(() => {});
      emailField = await page.$(sel).catch(() => null);
      if (emailField) break;
    }

    if (!emailField) throw new Error('Could not find Foundit email field on login page');
    await emailField.click({ clickCount: 3 });
    await emailField.type(credential.username, { delay: 80 });
    await randomDelay(400, 800);

    const passSelectors = ['input#password', 'input[name="password"]', 'input[type="password"]'];
    let passField = null;
    for (const sel of passSelectors) {
      await page.waitForSelector(sel, { timeout: 5000 }).catch(() => {});
      passField = await page.$(sel).catch(() => null);
      if (passField) break;
    }
    if (!passField) throw new Error('Could not find Foundit password field');
    await passField.click({ clickCount: 3 });
    await passField.type(credential.password, { delay: 80 });
    await randomDelay(400, 800);

    const submitBtn = await page.$('button#loginSubmit', 'button[type="submit"]', '#loginSubmit').catch(() => null);
    if (submitBtn) await submitBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
    await randomDelay(3000, 4000);

    const loginUrl = page.url();
    if (loginUrl.includes('/login') || loginUrl.includes('signInName')) {
      const buf = await page.screenshot({ type: 'jpeg', quality: 50 });
      emit('log', { message: 'Foundit login failed — screenshot:', type: 'screenshot', image: `data:image/jpeg;base64,${buf.toString('base64')}` });
      throw new Error('Foundit login failed. Check your credentials.');
    }
    emit('log', { message: 'Logged into Foundit successfully', type: 'success' });

    // ─── SEARCH ─────────────────────────────────────────────────────────────────
    const query = encodeURIComponent(searchDoc.keywords.trim());
    const loc = searchDoc.location ? encodeURIComponent(searchDoc.location) : '';
    let searchUrl = `https://www.foundit.in/srp/results?query=${query}`;
    if (loc) searchUrl += `&location=${loc}`;
    if (searchDoc.jobType === 'remote') searchUrl += '&searchId=remote';

    emit('log', { message: `Searching: ${searchUrl}`, type: 'info' });
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(3000, 4000);

    let appliedCount = 0;
    let pageNum = 1;

    while (appliedCount < searchDoc.maxApplications) {
      emit('log', { message: `Scanning Foundit page ${pageNum}...`, type: 'info' });

      // Foundit SRP uses div.srpResultCard as job cards
      await page.waitForSelector('.srpResultCard, [class*="cardContainer"]', { timeout: 10000 }).catch(() => {});

      // Real structure: div.srpResultCard contains job info. 
      // Important: Foundit is a SPA, so clicking a card opens details in a right panel. 
      // We will extract job data and IDs, then click them directly or open their URLs.
      const jobLinks = await safeEval(page, () =>
        page.evaluate(() => {
          const results = [];
          const seen = new Set();
          
          // Try to find direct links first
          const anchors = Array.from(document.querySelectorAll('.srpResultCard a[href*="/job/"], .srpResultCard a[href*="foundit"]'));
          anchors.forEach(a => {
            let href = a.getAttribute('href') || '';
            if (href.startsWith('/')) href = 'https://www.foundit.in' + href;
            const jobUrl = href.split('?')[0];
            if (!jobUrl || seen.has(jobUrl)) return;
            seen.add(jobUrl);

            const card = a.closest('.srpResultCard, [class*="cardContainer"]');
            const titleEl = card ? card.querySelector('.jobTitle, h3, h2, [class*="title"]') : null;
            const jobTitle = titleEl ? titleEl.innerText?.trim() : (a.innerText?.trim() || 'Unknown');
            const companyEl = card ? card.querySelector('.companyName, [class*="company"]') : null;
            const company = companyEl ? companyEl.innerText?.trim() : 'Unknown';
            const locEl = card ? card.querySelector('.details span.loc, [class*="location"]') : null;
            const location = locEl ? locEl.innerText?.trim() : '';

            results.push({ jobUrl, jobTitle, company, location });
          });
          return results;
        })
      );

      emit('log', { message: `Raw job links extracted: ${jobLinks ? jobLinks.length : 0}`, type: 'info' });

      if (!Array.isArray(jobLinks) || jobLinks.length === 0) {
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
          await ApplicationLog.create({ userId, searchId, platform: 'foundit', jobTitle, company, location, jobUrl, status: 'duplicate' });
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

            // Foundit Apply button
            const applySelectors = [
              'button.apply-button', 'a.apply-button',
              'button[class*="apply" i]', 'a[class*="apply" i]',
              'button#apply', 'a#apply',
              '.applyBtn', '.btn-apply',
            ];
            let applyBtn = null;
            for (const sel of applySelectors) {
              applyBtn = await page.$(sel).catch(() => null);
              if (applyBtn) break;
            }
            if (!applyBtn) {
              applyBtn = await page.evaluateHandle(() => {
                const btns = Array.from(document.querySelectorAll('a, button'));
                return btns.find(b => /^apply(\s+now)?$/i.test(b.innerText?.trim())) || null;
              }).catch(() => null);
              if (applyBtn && !(await applyBtn.asElement())) applyBtn = null;
            }

            if (!applyBtn) {
              await ApplicationLog.create({ userId, searchId, platform: 'foundit', jobTitle, company, location, jobUrl, status: 'skipped', errorMessage: 'No Apply button found' });
              await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.skipped': 1 } });
              emit('log', { message: `Skipped (no apply button): ${jobTitle}`, type: 'warning' });
              applied = true;
              break;
            }

            await applyBtn.click();
            await randomDelay(2000, 3000);

            // Handle possible easy-apply questionnaire or file upload
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

            await ApplicationLog.create({ userId, searchId, platform: 'foundit', jobTitle, company, location, jobUrl, status: 'applied' });
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
          await ApplicationLog.create({ userId, searchId, platform: 'foundit', jobTitle, company, location, jobUrl, status: 'failed', errorMessage: 'Max retries exceeded' });
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
        const nextBtn = await page.$('button.btn-next, a.next, a[rel="next"], [aria-label*="next" i], .pagination .next, button[class*="next" i]').catch(() => null);
        if (!nextBtn) break;
        await nextBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
        pageNum++;
        await randomDelay(2000, 4000);
      } catch (_) { break; }
    }

    emit('log', { message: `Foundit session complete. Applied to ${appliedCount} jobs.`, type: 'success' });

  } catch (err) {
    logger.error(`[Foundit] Fatal error: ${err.message}`);
    emit('error', { message: err.message });
    throw err;
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = { applyFoundit };
