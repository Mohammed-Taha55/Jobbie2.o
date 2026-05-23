const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const ApplicationLog = require('../../models/ApplicationLog');
const JobSearch = require('../../models/JobSearch');
const logger = require('../../utils/logger');

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = (min = 1500, max = 3500) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

const applyIndeed = async ({ searchDoc, credential, resumePath, io, userId }) => {
  const searchId = searchDoc._id;
  let browser;

  const emit = (event, data) => {
    io.emit(`automation:${event}`, { searchId, ...data });
    logger.info(`[Indeed] ${event}: ${JSON.stringify(data)}`);
  };

  try {
    emit('log', { message: 'Launching browser...', type: 'info' });

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1366,768',
      ],
      defaultViewport: { width: 1366, height: 768 },
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    // --- LOGIN ---
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

    emit('log', { message: 'Logged in to Indeed successfully', type: 'success' });

    // --- BUILD SEARCH URL ---
    const q = encodeURIComponent(searchDoc.keywords);
    const l = encodeURIComponent(searchDoc.location || '');
    const remoteFilter = searchDoc.jobType === 'remote' ? '&sc=0kf%3Aattr(DSQF7)%3B' : '';
    let searchUrl = `https://www.indeed.com/jobs?q=${q}&l=${l}${remoteFilter}`;

    emit('log', { message: `Searching: ${searchUrl}`, type: 'info' });
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000, 3000);

    let appliedCount = 0;
    let pageNum = 1;

    while (appliedCount < searchDoc.maxApplications) {
      emit('log', { message: `Scanning page ${pageNum}...`, type: 'info' });

      const jobCards = await page.$$('.job_seen_beacon, .jobsearch-ResultsList > li');
      if (!jobCards.length) {
        emit('log', { message: 'No more job listings found', type: 'warning' });
        break;
      }

      for (const card of jobCards) {
        if (appliedCount >= searchDoc.maxApplications) break;

        const freshSearch = await JobSearch.findById(searchId);
        if (freshSearch.status === 'stopped') {
          emit('log', { message: 'Automation stopped by user', type: 'warning' });
          return;
        }

        let jobTitle = 'Unknown';
        let company = 'Unknown';
        let jobUrl = '';
        let location = '';
        let dataJk = '';

        try {
          jobTitle = await card.$eval('h2.jobTitle a span', (el) => el.innerText.trim()).catch(() => 'Unknown');
          company = await card.$eval('[data-testid="company-name"]', (el) => el.innerText.trim()).catch(() => 'Unknown');
          location = await card.$eval('[data-testid="text-location"]', (el) => el.innerText.trim()).catch(() => '');
          dataJk = await card.$eval('h2.jobTitle a', (el) => el.getAttribute('data-jk')).catch(() => '');
          jobUrl = `https://www.indeed.com/viewjob?jk=${dataJk}`;
        } catch (_) { continue; }

        if (!dataJk) continue;

        // Duplicate check
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
            const jobPage = await browser.newPage();
            await jobPage.goto(jobUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await randomDelay(2000, 3000);

            // Check for Indeed Easy Apply
            const easyApplyBtn = await jobPage.$('button[id="indeedApplyButton"], .ia-IndeedApply-button, button[class*="IndeedApply"]').catch(() => null);

            if (!easyApplyBtn) {
              await jobPage.close();
              await ApplicationLog.create({ userId, searchId, platform: 'indeed', jobTitle, company, location, jobUrl, status: 'skipped', errorMessage: 'No Easy Apply button' });
              await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.skipped': 1 } });
              emit('log', { message: `Skipped (no Easy Apply): ${jobTitle}`, type: 'warning' });
              applied = true;
              break;
            }

            await easyApplyBtn.click();
            await randomDelay(2000, 3000);

            // Handle multi-step apply modal
            for (let step = 0; step < 10; step++) {
              // Upload resume if prompted
              const resumeInput = await jobPage.$('input[type="file"]').catch(() => null);
              if (resumeInput && resumePath) {
                await resumeInput.uploadFile(resumePath);
                await randomDelay(1500, 2500);
              }

              const continueBtn = await jobPage.$('button[data-testid="IndeedApplyButton"], button[id="form-action-continue"], button[id="form-action-submit"]').catch(() => null);
              if (!continueBtn) break;

              const btnText = await jobPage.evaluate((btn) => btn.innerText.toLowerCase(), continueBtn);
              await continueBtn.click();
              await randomDelay(2000, 3000);

              if (btnText.includes('submit')) break;
            }

            await jobPage.close();
            await ApplicationLog.create({ userId, searchId, platform: 'indeed', jobTitle, company, location, jobUrl, status: 'applied' });
            await JobSearch.findByIdAndUpdate(searchId, { $inc: { 'stats.applied': 1 } });
            appliedCount++;
            applied = true;
            emit('applied', { jobTitle, company, appliedCount, maxApplications: searchDoc.maxApplications });
            emit('log', { message: `Applied: ${jobTitle} at ${company}`, type: 'success' });
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

        await randomDelay(3000, 6000);
      }

      // Next page
      try {
        const nextBtn = await page.$('a[data-testid="pagination-page-next"]');
        if (!nextBtn) break;
        await nextBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
        pageNum++;
        await randomDelay(2000, 4000);
      } catch (_) { break; }
    }

    emit('log', { message: `Session complete. Applied to ${appliedCount} jobs.`, type: 'success' });

  } catch (err) {
    logger.error(`[Indeed] Fatal error: ${err.message}`);
    emit('error', { message: err.message });
    throw err;
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = { applyIndeed };
