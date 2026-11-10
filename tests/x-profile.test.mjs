import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { getUserPosts } from '../skills/site-skill/assets/learnings/x-com/tools/get-user-posts.js';

const source = await readFile(new URL('../skills/site-skill/assets/learnings/x-com/browser-tools/extract-profile.js', import.meta.url), 'utf8');
const timelineSource = await readFile(new URL('../skills/site-skill/assets/learnings/x-com/browser-tools/extract-timeline.js', import.meta.url), 'utf8');

function page(content, extra = '') {
  return `<!doctype html><html><head><title>Alice / X</title></head><body>
    <main data-testid="primaryColumn">${content}</main>${extra}
  </body></html>`;
}

function postMarkup({ id = 100, handle = 'alice', text = 'A post from Alice.', controls = '' } = {}) {
  const name = handle === 'alice' ? 'Alice' : 'Bob';
  return `<article data-testid="tweet">
    <div data-testid="User-Name"><a href="/${handle}">${name}</a><a href="/${handle}">@${handle}</a></div>
    <a href="https://x.com/${handle}/status/${id}"><time datetime="2026-11-10T01:00:00Z">Nov 10</time></a>
    <div data-testid="tweetText">${text}</div>${controls}
  </article>`;
}

function profileContext(html, { url = 'https://x.com/alice', reloadHtml = html } = {}) {
  let document;
  let currentUrl = url;
  const state = {
    extractionCount: 0,
    reloadCount: 0,
    scrollCount: 0,
    waitForLoadCount: 0,
    waits: [],
    onWait: null,
  };

  const render = (nextHtml) => {
    ({ document } = parseHTML(nextHtml));
    const prototype = Object.getPrototypeOf(document.body);
    prototype.getClientRects = function getClientRects() {
      return this.closest('[hidden]') ? [] : [{ width: 1, height: 1 }];
    };
  };
  render(html);

  const location = {
    get href() { return currentUrl; },
    reload() {
      state.reloadCount += 1;
      render(reloadHtml);
    },
  };
  const getComputedStyle = (element) => ({ visibility: element.style?.visibility || 'visible' });

  return {
    state,
    get document() { return document; },
    setHtml(nextHtml) { render(nextHtml); },
    async openOrReuseTab() {},
    async waitForLoad() { state.waitForLoadCount += 1; },
    async wait(seconds) {
      state.waits.push(seconds);
      await state.onWait?.(seconds);
    },
    async scroll() { state.scrollCount += 1; },
    async js(script) {
      const run = new Function('document', 'location', 'getComputedStyle', 'window', `return (${script});`);
      return await run(document, location, getComputedStyle, { scrollY: 0 });
    },
    async runSiteBrowserTool(site, tool, args) {
      assert.equal(site, 'x-com');
      assert.equal(tool, 'extract_timeline');
      state.extractionCount += 1;
      const run = new Function('document', 'location', `return (${timelineSource});`)(document, location);
      return await run(args);
    },
  };
}

for (const verified of [false, true]) {
  test(`profile verification is ${verified} despite verified recommendations and posts`, async () => {
    const { document } = parseHTML(`<!doctype html><html><head><title>Alice / X</title></head><body>
      <aside>
        <div data-testid="UserCell" role="button">
          <a href="/recommended">Recommended <svg data-testid="icon-verified"></svg></a>
          <a href="/recommended">@recommended</a>
        </div>
      </aside>
      <main data-testid="primaryColumn">
        <div data-testid="UserName">
          <div><span>Alice</span>${verified ? '<span><svg data-testid="icon-verified"></svg></span>' : ''}</div>
          <div><span>@alice</span></div>
        </div>
        <article data-testid="tweet">
          <div data-testid="User-Name">
            <a href="/bob">Bob <svg data-testid="icon-verified"></svg></a>
            <a href="/bob">@bob</a>
          </div>
          <div data-testid="tweetText">A post from another verified account.</div>
        </article>
      </main>
    </body></html>`);
    const extract = new Function('document', 'location', `return (${source});`)(document, new URL('https://x.com/alice'));
    const result = await extract({});

    assert.equal(result.ok, true);
    assert.equal(result.profile.name, 'Alice');
    assert.equal(result.profile.handle, '@alice');
    assert.equal(result.profile.verified, verified);
  });
}

test('profile timeline waits for delayed hydration before extraction', async () => {
  const ready = page(postMarkup({ text: 'Alice appears after the profile timeline hydrates.' }));
  const ctx = profileContext(page('<div>Loading profile timeline</div>'), { reloadHtml: ready });
  ctx.state.onWait = async (seconds) => {
    assert.equal(seconds, 1);
    ctx.setHtml(ready);
  };

  const result = await getUserPosts(ctx, { username: 'alice', maxItems: 1, maxScrolls: 0 });

  assert.equal(result.ok, true);
  assert.equal(result.itemCount, 1);
  assert.equal(result.items[0].text, 'Alice appears after the profile timeline hydrates.');
  assert.equal(ctx.state.extractionCount, 1);
  assert.equal(ctx.state.reloadCount, 0);
  assert.deepEqual(ctx.state.waits, [1]);
});

test('profile timeline reloads once after 20 seconds and reports a second content timeout', async () => {
  const ctx = profileContext(page('<div>Timeline unavailable</div>'));

  const result = await getUserPosts(ctx, { username: 'alice', maxItems: 1, maxScrolls: 0 });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'blocked:content_not_loaded');
  assert.equal(result.itemCount, 0);
  assert.equal(ctx.state.reloadCount, 1);
  assert.equal(ctx.state.waitForLoadCount, 2);
  assert.equal(ctx.state.extractionCount, 0);
  assert.equal(ctx.state.scrollCount, 0);
  assert.equal(ctx.state.waits.length, 40);
  assert.ok(ctx.state.waits.every((seconds) => seconds === 1));
});

for (const blocker of [
  { name: 'login redirect', reason: 'login_required', url: 'https://x.com/i/flow/login', extra: '' },
  { name: 'visible CAPTCHA', reason: 'blocked:captcha', extra: '<div role="alert">Verify you are human</div>' },
  { name: 'visible consent dialog', reason: 'blocked:consent', extra: '<div role="dialog">Cookie consent <button data-testid="consent">Agree</button></div>' },
  { name: 'visible rate limit', reason: 'rate_limited', extra: '<div role="alert">Too many requests: rate limit reached</div>' },
]) {
  test(`${blocker.name} blocks an already-populated profile without reload or consent`, async () => {
    const ctx = profileContext(page(postMarkup(), blocker.extra), { url: blocker.url });
    let consentClicks = 0;
    ctx.document.querySelector('[data-testid="consent"]')?.addEventListener('click', () => { consentClicks += 1; });

    const result = await getUserPosts(ctx, { username: 'alice', maxItems: 1, maxScrolls: 0 });

    assert.equal(result.ok, false);
    assert.equal(result.reason, blocker.reason);
    assert.deepEqual(result.items, []);
    assert.deepEqual(ctx.state.waits, []);
    assert.equal(ctx.state.reloadCount, 0);
    assert.equal(ctx.state.extractionCount, 0);
    assert.equal(consentClicks, 0);
  });
}

test('profile post text and a hidden dialog do not trigger false blockers', async () => {
  const text = 'Alice discusses sign in to X, CAPTCHA, verify you are human, consent, agree, rate limit, and too many requests in this post.';
  const ctx = profileContext(page(postMarkup({ text }), '<div role="dialog" hidden>CAPTCHA consent agree HTTP 429</div>'));

  const result = await getUserPosts(ctx, { username: 'alice', maxItems: 1, maxScrolls: 0 });

  assert.equal(result.ok, true);
  assert.equal(result.items[0].text, text);
  assert.equal(ctx.state.extractionCount, 1);
  assert.equal(ctx.state.reloadCount, 0);
});

test('an explicit empty profile feed is a successful collection', async () => {
  const ctx = profileContext(page('<div data-testid="emptyState">This profile has no posts yet.</div>'));

  const result = await getUserPosts(ctx, { username: 'alice', maxItems: 1, maxScrolls: 0 });

  assert.equal(result.ok, true);
  assert.equal(result.emptyState, true);
  assert.equal(result.itemCount, 0);
  assert.equal(result.stopReason, 'empty');
  assert.equal(ctx.state.extractionCount, 1);
  assert.equal(ctx.state.reloadCount, 0);
});

test('translation re-render then Show more exposes complete original profile text', async () => {
  const ctx = profileContext(page(postMarkup({
    id: 200,
    handle: 'bob',
    text: 'Translated teaser only.',
    controls: '<button aria-label="Show original">Show original</button>',
  })));
  const article = ctx.document.querySelector('article');
  const body = article.querySelector('[data-testid="tweetText"]');
  const originalText = [
    'Original paragraph: Bob keeps every sentence from the source text.',
    'Final paragraph: the complete ending appears only after Show more.',
  ].join('\n');
  let pendingRender = null;

  article.querySelector('[aria-label="Show original"]').addEventListener('click', () => {
    pendingRender = () => {
      article.querySelector('[aria-label="Show original"]').remove();
      body.innerHTML = '<p>Original paragraph: Bob keeps every sentence from the source text.</p><button data-testid="tweet-text-show-more-link">Show more</button>';
      body.querySelector('[data-testid="tweet-text-show-more-link"]').addEventListener('click', () => {
        pendingRender = () => {
          body.innerHTML = '<p>Original paragraph: Bob keeps every sentence from the source text.</p><p>Final paragraph: the complete ending appears only after Show more.</p>';
        };
      });
    };
  });
  ctx.state.onWait = async (seconds) => {
    if (seconds !== 0.7 || !pendingRender) return;
    const render = pendingRender;
    pendingRender = null;
    render();
  };

  const result = await getUserPosts(ctx, { username: 'bob', maxItems: 1, maxScrolls: 0 });

  assert.equal(result.ok, true);
  assert.equal(result.items[0].text, originalText);
  assert.equal(result.items[0].isTranslated, false);
  assert.equal(result.items[0].isTruncated, false);
  assert.equal(ctx.state.extractionCount, 1);
  assert.deepEqual(ctx.state.waits, [0.7, 0.7]);
});
