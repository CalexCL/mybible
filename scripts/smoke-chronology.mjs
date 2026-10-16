import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  const response = await page.goto('http://127.0.0.1:8765/chronology.html?person=Adam', { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  await page.locator('.person').first().waitFor();
  assert.ok(await page.locator('.person').count() >= 24, 'Expected 24 plotted people');
  assert.match(await page.locator('#detail').innerText(), /Adam|亚当/);
  await page.locator('#personSearch').fill('Noah');
  assert.equal(await page.locator('#compareChoices input[data-compare]').count(), 1);
  await page.locator('#personSearch').fill('');
  await page.locator('#zoom').fill('1500');
  await page.locator('#showConnectors').uncheck();
  await page.locator('#showConnectors').check();
  await page.locator('#undatedSearch').fill('Moses');
  assert.equal(await page.locator('#undatedProfiles [data-undated-person]').count(), 1);
  await page.locator('#undatedProfiles [data-undated-person]').click();
  assert.match(await page.locator('#detail').innerText(), /Moses|摩西/);
  await page.goto('http://127.0.0.1:8765/chronology.html?person=David', { waitUntil: 'networkidle' });
  assert.match(await page.locator('#detail').innerText(), /David|大卫/);
  assert.deepEqual(errors, [], 'Uncaught browser errors');
  console.log('PASS mobile Chromium chronology interactions, filters, deep links, connectors and runtime');
} finally {
  await browser.close();
}
