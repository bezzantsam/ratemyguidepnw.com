import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = process.env.TEST_BASE_URL;
const executablePath = process.env.BROWSER_EXECUTABLE;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin ?? '') || !executablePath) {
  throw new Error('Set a loopback TEST_BASE_URL and an isolated BROWSER_EXECUTABLE.');
}

test('phone search waits for restoration and preserves blank, URL and Back query state', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  let releaseScripts;
  const scriptsReady = new Promise(resolve => { releaseScripts = resolve; });
  const errors = [];
  const external = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) {
        external.push(url.origin);
        return route.abort();
      }
      if (url.pathname === '/api/launch') {
        const responses = {
          review_write_availability: { available: true },
          claim_availability: { available: false },
          public_reviews: { summary: { count: 0, averageQuality: null }, reviews: [], limit: 100 },
          profile_details: { details: null, attribution: 'captain_declared' },
        };
        const result = responses[request.postDataJSON().operation];
        return result ? route.fulfill({ json: result }) : route.fulfill({ status: 503, json: {} });
      }
      if (url.pathname === '/api/guide-offerings') return route.fulfill({ json: { profile: null, items: [], nextCursor: null } });
      if (request.resourceType() === 'script') await scriptsReady;
      return route.continue();
    });

    const search = page.getByRole('searchbox', { name: 'Captain, business, operating name, or registration' });
    const rod = page.locator('.guide-result[href^="/guides/og-0002193?"]');
    const query = () => new URL(page.url()).searchParams.get('q');
    const ready = () => page.waitForFunction(() => !document.querySelector('.directory-panel input[type="search"]').disabled);
    await page.goto(origin + '/', { waitUntil: 'commit' });
    await search.waitFor();
    assert.equal(await search.isDisabled(), true, 'the server-rendered input must wait for client query restoration');
    await page.getByRole('status').filter({ hasText: 'Search is loading' }).waitFor();
    const describedBy = await search.getAttribute('aria-describedby');
    assert.ok(describedBy);
    assert.match(await page.locator('[id]').filter({ hasText: 'Search is loading' }).evaluateAll((els, id) =>
      els.find(el => el.id === id)?.textContent ?? '', describedBy), /Search is loading/);
    await search.focus();
    await page.keyboard.type('Rod Shulley');
    assert.equal(await search.inputValue(), '');
    assert.equal(query(), null);

    releaseScripts();
    await ready();
    assert.equal(await search.inputValue(), '');
    assert.equal(query(), null);
    await search.fill('Rod Shulley');
    await rod.waitFor();
    assert.equal(query(), 'Rod Shulley');
    await rod.click();
    await page.waitForURL(url => url.pathname === '/guides/og-0002193');
    const rate = page.getByRole('link', { name: 'Rate Rod Shulley', exact: true });
    await rate.waitFor();
    assert.equal(await rate.getAttribute('href'), '#write-review');
    await page.goBack({ waitUntil: 'commit' });
    await search.waitFor();
    await ready();
    assert.equal(await search.inputValue(), 'Rod Shulley');
    assert.equal(query(), 'Rod Shulley');
    await rod.waitFor();

    await page.goto(origin + '/?q=OG.0002193', { waitUntil: 'commit' });
    await search.waitFor();
    await ready();
    assert.equal(await search.inputValue(), 'OG.0002193');
    assert.equal(query(), 'OG.0002193');
    await rod.waitFor();
    await search.fill('');
    await page.waitForFunction(() => !new URLSearchParams(location.search).has('q'));
    assert.equal(await search.inputValue(), '');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally {
    releaseScripts();
    await browser.close();
  }
});
