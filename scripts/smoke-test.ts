import { chromium } from 'playwright';
import path from 'path';

(async () => {
  console.log('Starting Playwright E2E smoke test...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const targetUrl = 'https://cue-track-pvib3t5nw-overlook-strategy.vercel.app';
    console.log(`Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'networkidle' });

    console.log('Setting file input...');
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      throw new Error('File input not found');
    }

    const testFilePath = path.resolve(__dirname, '../test-output/test-track.wav');
    await fileInput.setInputFiles(testFilePath);

    console.log('Waiting for "Analyze track" button to become visible...');
    const analyzeButton = await page.waitForSelector('text="Analyze track"', { state: 'visible' });
    
    console.log('Clicking "Analyze track"...');
    await analyzeButton.click();

    console.log('Waiting for analysis to finish and redirect to /tracks/[id]/review...');
    // The analysis might take up to 60 seconds.
    await page.waitForURL(/\/tracks\/.*\/review/, { timeout: 90000 });
    console.log('Successfully navigated to review page!');
    console.log('Current URL:', page.url());

    // Check if the sections are rendered.
    console.log('Waiting for the review page to render sections...');
    await page.waitForSelector('text="Continue to Download"', { state: 'visible', timeout: 30000 });
    
    console.log('Sections likely rendered successfully. Clicking "Continue to Download"...');
    const continueBtn = await page.$('text="Continue to Download"');
    if (continueBtn) {
       await continueBtn.click();
    }
    
    // Wait for the download generation.
    console.log('Waiting for generation process...');
    // We should see a generation progress or finally a download button.
    const downloadLink = await page.waitForSelector('text="Download"', { state: 'visible', timeout: 120000 });
    console.log('Download link generated successfully!');

    console.log('Smoke test passed successfully! End-to-end workflow is functional.');
  } catch (error) {
    console.error('Smoke test failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
