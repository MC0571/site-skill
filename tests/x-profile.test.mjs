import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

const source = await readFile(new URL('../skills/site-skill/assets/learnings/x-com/browser-tools/extract-profile.js', import.meta.url), 'utf8');

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
