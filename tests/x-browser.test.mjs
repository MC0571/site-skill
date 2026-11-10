import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { getPostReplies } from '../skills/site-skill/assets/learnings/x-com/tools/get-post-replies.js';

const browserTools = new URL('../skills/site-skill/assets/learnings/x-com/browser-tools/', import.meta.url);

async function extract(tool, html, url = 'https://x.com/alice/status/100', args = {}) {
  const { document } = parseHTML(`<!doctype html><html><head><title>X</title></head><body>${html}</body></html>`);
  Object.getPrototypeOf(document.body).getClientRects = function () {
    for (let node = this; node; node = node.parentElement) {
      if (node.hasAttribute('hidden') || node.style?.display === 'none') return [];
    }
    return [{ width: 1, height: 1 }];
  };
  const getComputedStyle = (node) => ({ visibility: node.style.visibility || 'visible' });
  const source = await readFile(new URL(tool, browserTools), 'utf8');
  const run = new Function('document', 'location', 'getComputedStyle', `return (${source});`)(document, new URL(url), getComputedStyle);
  return run(args);
}

test('post detail selects the requested card and its own permalink, not a parent or quoted link', async () => {
  const result = await extract('extract-post-detail.js', `
    <article data-testid="tweet">
      <div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice">@alice</a></div>
      <a href="https://x.com/alice/status/100"><time datetime="2026-11-10T01:00:00Z">Nov 10</time></a>
      <div data-testid="tweetText">Parent quoting <a href="https://x.com/bob/status/200">Bob's reply</a></div>
    </article>
    <article data-testid="tweet">
      <a href="https://x.com/carol/status/400">Quoted post</a>
      <div data-testid="User-Name"><a href="/bob">Bob</a><a href="/bob">@bob</a></div>
      <a href="https://x.com/bob/status/200"><time datetime="2026-11-10T02:00:00Z">Nov 10</time></a>
      <div data-testid="tweetText">Requested reply</div>
    </article>
  `, 'https://x.com/bob/status/200/photo/1?view=detail');

  assert.equal(result.ok, true);
  assert.equal(result.layout, 'logged_in');
  assert.equal(result.id, '200');
  assert.equal(result.canonicalUrl, 'https://x.com/bob/status/200');
  assert.deepEqual(result.author, { name: 'Bob', handle: '@bob', profileUrl: 'https://x.com/bob' });
  assert.equal(result.publishedAt, '2026-11-10T02:00:00Z');
  assert.equal(result.text, 'Requested reply');
});

test('guest post detail selects the requested card after its parent', async () => {
  const result = await extract('extract-post-detail.js', `
    <article>
      <a href="/alice">Alice</a><a href="/alice">@alice</a>
      <a href="https://x.com/alice/status/100"><time>Nov 10</time></a>
      <div dir="auto">The parent post is not the requested reply.</div>
    </article>
    <article>
      <a href="/bob">Bob</a><a href="/bob">@bob</a>
      <a href="https://x.com/bob/status/200"><time>Nov 10</time></a>
      <div dir="auto">The requested guest reply belongs to Bob.</div>
    </article>
  `, 'https://x.com/bob/status/200');

  assert.equal(result.layout, 'guest');
  assert.equal(result.id, '200');
  assert.equal(result.author.handle, '@bob');
  assert.equal(result.text, 'The requested guest reply belongs to Bob.');
});

test('post detail still selects a single target card without a timestamp', async () => {
  const result = await extract('extract-post-detail.js', `
    <article data-testid="tweet">
      <a href="https://x.com/alice/status/100">Post permalink</a>
      <div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice">@alice</a></div>
      <div data-testid="tweetText">The requested root post.</div>
    </article>
  `);

  assert.equal(result.ok, true);
  assert.equal(result.id, '100');
  assert.equal(result.text, 'The requested root post.');
});

test('post detail reports a missing target instead of returning the available parent', async () => {
  const result = await extract('extract-post-detail.js', `
    <article data-testid="tweet">
      <a href="https://x.com/alice/status/100"><time>Nov 10</time></a>
      <div data-testid="tweetText">Parent only</div>
    </article>
  `, 'https://x.com/bob/status/200');

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'post_not_found');
});

test('reply extraction identifies the requested nested post and excludes its ancestors', async () => {
  const result = await extract('extract-replies.js', `
    <article data-testid="tweet">
      <a href="https://x.com/bob/status/200">Quoted target link</a>
      <a href="https://x.com/alice/status/100"><time>Nov 10</time></a>
      <div data-testid="tweetText">Ancestor</div>
    </article>
    <article data-testid="tweet">
      <a href="https://x.com/bob/status/200"><time>Nov 10</time></a>
      <div data-testid="User-Name"><a href="/bob">Bob</a><a href="/bob">@bob</a></div>
      <div data-testid="tweetText">Requested nested post</div>
    </article>
    <article data-testid="tweet">
      <a href="https://x.com/carol/status/300"><time>Nov 10</time></a>
      <div data-testid="tweetText">Reply to the target</div>
    </article>
  `, 'https://x.com/bob/status/200');
  assert.equal(result.rootPostId, '200');
  assert.deepEqual(result.rootAuthor, { name: 'Bob', handle: '@bob' });
  assert.deepEqual(result.replies.map(reply => reply.id), ['300']);
  assert.equal(result.replies[0].replyToPostId, '200');
  assert.equal(result.replies[0].replyToHandle, '@bob');
});

test('reply pagination retains every reply after the target leaves the virtualized DOM', async () => {
  const url = 'https://x.com/alice/status/100';
  const pages = [
    `<article data-testid="tweet"><a href="https://x.com/alice/status/100"><time>Nov 10</time></a><div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice">@alice</a></div><div data-testid="tweetText">Target</div></article>
     <article data-testid="tweet"><a href="https://x.com/bob/status/200"><time>Nov 10</time></a><div data-testid="tweetText">First reply</div></article>`,
    `<article data-testid="tweet"><a href="https://x.com/carol/status/300"><time>Nov 10</time></a><div data-testid="tweetText">Second reply</div></article>
     <article data-testid="tweet"><a href="https://x.com/dave/status/400"><time>Nov 10</time></a><div data-testid="tweetText">Third reply</div></article>`,
  ];
  let page = 0;
  const ctx = {
    async openOrReuseTab() {}, async waitForLoad() {}, async wait() {},
    async js() { return { url, tweetCount: 2, articleCount: 2, y: page * 1800, h: 5000 }; },
    async scroll() { page += 1; },
    async runSiteBrowserTool(site, tool, args) {
      assert.equal(site, 'x-com');
      assert.equal(tool, 'extract_replies');
      return extract('extract-replies.js', pages[page], url, args);
    },
  };
  const result = await getPostReplies(ctx, { url, maxItems: 3, maxScrolls: 1 });
  assert.deepEqual(result.replies.map(reply => reply.id), ['200', '300', '400']);
  assert.ok(result.replies.every(reply => reply.replyToPostId === '100' && reply.replyToHandle === '@alice'));
  assert.equal(result.rootPostId, '100');
  assert.deepEqual(result.rootAuthor, { name: 'Alice', handle: '@alice' });
  assert.equal(result.scrollRounds, 1);
});

for (const marker of ['Promoted', '广告', 'Ad']) {
  test(`replies retain advertising words in body text and exclude a standalone ${marker} marker`, async () => {
    const result = await extract('extract-replies.js', `
      <section aria-label="Timeline: Conversation">
        <article data-testid="tweet">
          <a href="https://x.com/alice/status/100"><time>Nov 10</time></a>
          <div data-testid="tweetText">Root</div>
        </article>
        <article data-testid="tweet">
          <a href="https://x.com/sponsor/status/150"><time>Nov 10</time></a>
          <div data-testid="socialContext"><span>${marker}</span></div>
          <div data-testid="tweetText">Buy this product</div>
        </article>
        <article data-testid="tweet">
          <a href="https://x.com/bob/status/200"><time>Nov 10</time></a>
          <div data-testid="tweetText">这不是广告</div>
        </article>
        <article data-testid="tweet">
          <a href="https://x.com/carol/status/300"><time>Nov 10</time></a>
          <div data-testid="tweetText">Promoted is a word in this reply.</div>
        </article>
        <article data-testid="tweet">
          <a href="https://x.com/dave/status/400"><time>Nov 10</time></a>
          <div data-testid="tweetText"><span>${marker}</span></div>
        </article>
      </section>
    `);

    assert.equal(result.ok, true);
    assert.equal(result.replyCount, 3);
    assert.deepEqual(result.replies.map((reply) => reply.id), ['200', '300', '400']);
    assert.deepEqual(result.replies.map((reply) => reply.text), ['这不是广告', 'Promoted is a word in this reply.', marker]);
    assert.ok(result.replies.every((reply) => reply.isPromoted === false));
  });
}

for (const word of ['Ad', '广告']) {
  test(`guest replies keep standalone ${word} in their body and filter independent ad labels`, async () => {
    const result = await extract('extract-replies.js', `
      <article><a href="https://x.com/alice/status/100"><time>Nov 10</time></a><div dir="auto">Root guest post</div></article>
      <article><a href="https://x.com/sponsor/status/150"><time>Nov 10</time></a><span>${word}</span><div dir="auto">Buy this product</div></article>
      <article><a href="https://x.com/bob/status/200"><time>Nov 10</time></a><div dir="auto"><span>${word}</span> is a word in my reply.</div></article>
      <article><a href="https://x.com/carol/status/300"><time>Nov 10</time></a><div dir="auto"><span>${word}</span></div></article>
    `);

    assert.deepEqual(result.replies.map(reply => reply.id), ['200', '300']);
    assert.deepEqual(result.replies.map(reply => reply.text), [`${word} is a word in my reply.`, word]);
  });
}

for (const [name, skippedCard] of [
  ['an advertisement', `<article data-testid="tweet">
    <a href="https://x.com/sponsor/status/150"><time>Nov 10</time></a>
    <span>Promoted</span><div data-testid="tweetText">Buy this product</div>
  </article>`],
  ['a card without a status ID', '<article data-testid="tweet"><div data-testid="tweetText">No permalink</div></article>'],
]) {
  test(`reply context keeps the previous valid reply after filtering ${name}`, async () => {
    const result = await extract('extract-replies.js', `
      <section aria-label="Timeline: Conversation">
        <article data-testid="tweet">
          <a href="https://x.com/alice/status/100"><time>Nov 10</time></a>
          <div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice">@alice</a></div>
          <div data-testid="tweetText">Root</div>
        </article>
        ${skippedCard}
        <article data-testid="tweet">
          <a href="https://x.com/bob/status/200"><time>Nov 10</time></a>
          <div data-testid="User-Name"><a href="/bob">Bob</a><a href="/bob">@bob</a></div>
          <div data-testid="tweetText">Reply one</div>
        </article>
        <article data-testid="tweet">
          <a href="https://x.com/carol/status/300"><time>Nov 10</time></a>
          <div data-testid="tweetText">Reply two</div>
        </article>
      </section>
    `, 'https://x.com/alice/status/100', { maxItems: 2 });

    assert.equal(result.rootPostId, '100');
    assert.deepEqual(result.replies.map((reply) => reply.id), ['200', '300']);
    assert.equal(result.replies[0].contextBefore, null);
    assert.deepEqual(result.replies[1].contextBefore, { id: '200', handle: '@bob', displayName: 'Bob', text: 'Reply one' });
    assert.ok(result.replies.every((reply) => reply.replyToPostId === '100' && reply.replyToHandle === '@alice'));
  });
}

for (const [name, codeBlock] of [
  ['pre', '<pre><code>    if x:\n\tfoo()\n\n\n    bar()\n</code></pre>'],
  ['guest code class', '<div class="x-article-code"><code>    if x:\n\tfoo()\n\n\n    bar()\n</code></div>'],
]) {
  test(`guest article ${name} preserves code whitespace in blocks and contentText`, async () => {
    const code = '    if x:\n\tfoo()\n\n\n    bar()\n';
    const result = await extract('extract-article.js', `
      <h1 data-article-part="title">Code example</h1>
      <div data-article-part="body"><div class="x-article-body">
        ${codeBlock}
        <p>  Ordinary   paragraph.  </p>
      </div></div>
    `, 'https://x.com/alice/article/500');

    assert.equal(result.layout, 'guest');
    assert.deepEqual(result.blocks, [{ type: 'code', text: code }, { type: 'paragraph', text: 'Ordinary paragraph.' }]);
    assert.equal(result.contentText, `${code}\n\nOrdinary paragraph.`);
    assert.equal(result.charCount, result.contentText.length);
  });
}

for (const nested of [false, true]) {
  test(`logged-in article preserves whitespace in a ${nested ? 'nested' : 'direct'} markdown code block`, async () => {
    const code = '  first()\n\n\n\tsecond()\n';
    const codeBlock = `<div data-testid="markdown-code-block"><pre><code>${code}</code></pre></div>`;
    const result = await extract('extract-article.js', `
      <article data-testid="twitterArticleReadView">
        <h1 data-testid="twitter-article-title">Code example</h1>
        <div data-testid="longformRichTextComponent"><div>
          ${nested ? `<div>${codeBlock}</div>` : codeBlock}
        </div></div>
      </article>
    `, 'https://x.com/alice/article/500');

    assert.equal(result.layout, 'logged_in');
    assert.deepEqual(result.blocks, [{ type: 'code', text: code }]);
    assert.equal(result.contentText, code);
  });
}

test('user bio keeps words containing follow while removing the follow button', async () => {
  const result = await extract('extract-user-cells.js', `
    <main data-testid="primaryColumn">
      <div data-testid="UserCell" role="button">
        <a href="/alice">Alice</a><a href="/alice">@alice</a>
        <button data-testid="123-follow">Follow</button>
        <div dir="auto">I study followers.</div>
      </div>
    </main>
  `, 'https://x.com/alice/followers');

  assert.equal(result.userCount, 1);
  assert.equal(result.users[0].bio, 'I study followers.');
  assert.equal(result.users[0].followButton, 'Follow');
  assert.equal(result.users[0].isFollowing, false);
});

test('user bio keeps follow words and link text while excluding identity, relationship and button nodes', async () => {
  const result = await extract('extract-user-cells.js', `
    <main data-testid="primaryColumn">
      <div data-testid="UserCell" role="button">
        <a href="/alice" aria-hidden="true"><img src="https://example.com/avatar.png" alt="Avatar"></a>
        <div><a href="/alice">Alice</a><a href="/alice">@alice</a></div>
        <span data-testid="userFollowIndicator">Follows you</span>
        <div role="button" data-testid="123-follow"><span>Following</span></div>
        <div dir="auto">I study followers. Following ideas. <a href="https://example.com/guide">Follow this guide</a>. <a href="/alice">Alice writes here</a>.</div>
      </div>
    </main>
    <aside><div data-testid="UserCell"><a href="/sidebar">Sidebar user</a></div></aside>
  `, 'https://x.com/alice/followers');

  assert.equal(result.userCount, 1);
  assert.equal(result.users[0].bio, 'I study followers. Following ideas. Follow this guide. Alice writes here.');
  assert.equal(result.users[0].displayName, 'Alice');
  assert.equal(result.users[0].handle, '@alice');
  assert.equal(result.users[0].profileUrl, '/alice');
  assert.equal(result.users[0].followsYou, true);
  assert.equal(result.users[0].followButton, 'Following');
  assert.equal(result.users[0].isFollowing, true);
});

for (const maxPosts of [1, 2, 10]) {
  test(`thread returns at most maxPosts=${maxPosts} with matching metadata`, async () => {
    const result = await extract('extract-thread.js', `
      <section aria-label="Timeline: Conversation">
        <article data-testid="tweet">
          <a href="https://x.com/alice/status/100"><time>Nov 10</time></a>
          <div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice">@alice</a></div>
          <div data-testid="tweetText">First (1/3)</div>
        </article>
        <article data-testid="tweet">
          <a href="https://x.com/alice/status/200"><time>Nov 10</time></a>
          <div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice">@alice</a></div>
          <div data-testid="tweetText">Second</div>
        </article>
        <article data-testid="tweet">
          <a href="https://x.com/alice/status/300"><time>Nov 10</time></a>
          <div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice">@alice</a></div>
          <div data-testid="tweetText">Third</div>
        </article>
      </section>
    `, 'https://x.com/alice/status/100', { maxPosts });

    const expectedIds = ['100', '200', '300'].slice(0, maxPosts);
    assert.equal(result.ok, true);
    assert.deepEqual(result.posts.map((post) => post.id), expectedIds);
    assert.equal(result.postCount, expectedIds.length);
    assert.equal(result.isThread, expectedIds.length > 1);
    assert.equal(result.rootPostId, '100');
    assert.deepEqual(result.declaredParts, { part: 1, total: 3 });
  });
}

test('timeline preserves body line breaks and links without absorbing quoted cards', async () => {
  const result = await extract('extract-timeline.js', `
    <main data-testid="primaryColumn">
      <article data-testid="tweet">
        <a href="https://x.com/bob/status/999">Quoted permalink appears first</a>
        <div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice">@alice</a></div>
        <a href="https://x.com/alice/status/100"><time datetime="2026-11-10T01:00:00Z">Nov 10</time></a>
        <div data-testid="tweetText">First paragraph <a href="https://x.com/bob">@bob</a><br><a href="https://example.com/read">Read more</a></div>
        <div data-testid="socialContext"><span>Promoted</span></div>
        <div data-testid="quoteTweet">
          <div data-testid="tweetText">Quoted body from Bob</div>
          <div data-testid="tweetPhoto"><img src="https://example.com/quoted.jpg" alt="Quoted media"></div>
        </div>
      </article>
      <article data-testid="tweet">
        <div data-testid="User-Name"><a href="/bob">Bob</a><a href="/bob">@bob</a></div>
        <a href="https://x.com/bob/status/200"><time datetime="2026-11-10T02:00:00Z">Nov 10</time></a>
        <div data-testid="tweetText">Ad is a word in this body.</div>
        <div data-testid="card.wrapper">
          <div data-testid="socialContext"><span>Ad</span></div>
          <div data-testid="tweetText">Quoted advertisement body</div>
        </div>
      </article>
    </main>
  `);

  assert.deepEqual(result.items.map((item) => item.id), ['100', '200']);
  const [alice, bob] = result.items;
  assert.equal(alice.text, 'First paragraph @bob\nRead more');
  assert.deepEqual(alice.links, [
    { text: '@bob', url: 'https://x.com/bob' },
    { text: 'Read more', url: 'https://example.com/read' },
  ]);
  assert.equal(alice.socialContext, 'Promoted');
  assert.equal(alice.isPromoted, true);
  assert.deepEqual(alice.images, []);
  assert.equal(bob.text, 'Ad is a word in this body.');
  assert.equal(bob.isPromoted, false);
});

test('timeline metrics use visible text and never fall back to ARIA labels or quoted cards', async () => {
  const result = await extract('extract-timeline.js', `
    <main data-testid="primaryColumn">
      <article data-testid="tweet">
        <div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice">@alice</a></div>
        <a href="https://x.com/alice/status/100"><time>Nov 10</time></a>
        <div data-testid="tweetText">Visible counts</div>
        <button data-testid="reply" aria-label="413000 replies">41万</button>
        <button data-testid="retweet" aria-label="2100000 reposts">210万</button>
        <button data-testid="like" aria-label="8100 likes">8.1千</button>
        <a href="https://x.com/alice/status/100/analytics" aria-label="990000 views">99万</a>
        <button data-testid="quote" aria-label="120 quotes">12</button>
      </article>
      <article data-testid="tweet">
        <div data-testid="User-Name"><a href="/bob">Bob</a><a href="/bob">@bob</a></div>
        <a href="https://x.com/bob/status/200"><time>Nov 10</time></a>
        <div data-testid="tweetText">Missing counts</div>
        <div data-testid="tweet">
          <button data-testid="reply" aria-label="999 replies">999</button>
          <button data-testid="retweet" aria-label="888 reposts">888</button>
          <button data-testid="like" aria-label="777 likes">777</button>
        </div>
      </article>
    </main>
  `);

  assert.deepEqual(result.items[0].metrics, {
    reply: '41万',
    repost: '210万',
    like: '8.1千',
    view: '99万',
    quote: '12',
    bookmark: '',
  });
  assert.deepEqual(result.items[1].metrics, {
    reply: '',
    repost: '',
    like: '',
    view: '',
    quote: '',
    bookmark: '',
  });
});

test('timeline ignores hidden metric controls and chooses a rendered duplicate', async () => {
  const result = await extract('extract-timeline.js', `
    <article data-testid="tweet">
      <a href="https://x.com/alice/status/100"><time>Nov 10</time></a>
      <div data-testid="tweetText">A public post</div>
      <button data-testid="reply" hidden>123</button>
      <div style="display: none"><button data-testid="like">999</button></div>
      <button data-testid="like">1,317</button>
      <button data-testid="quote" style="visibility: hidden">456</button>
      <button data-testid="retweet">0</button>
    </article>
  `);

  assert.equal(result.items[0].metrics.reply, '');
  assert.equal(result.items[0].metrics.like, '1,317');
  assert.equal(result.items[0].metrics.quote, '');
  assert.equal(result.items[0].metrics.repost, '0');
});

test('timeline separates own photos and video posters from avatars, video chrome and quoted media', async () => {
  const result = await extract('extract-timeline.js', `
    <main data-testid="primaryColumn">
      <article data-testid="tweet">
        <div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice">@alice</a></div>
        <div data-testid="Tweet-User-Avatar"><img src="https://x.com/alice/profile_images/avatar.jpg" alt="Avatar"></div>
        <a href="https://x.com/alice/status/100"><time>Nov 10</time></a>
        <div data-testid="tweetText">Media post</div>
        <div data-testid="tweetPhoto"><img src="https://example.com/own-photo.jpg" alt="Own photo"></div>
        <div data-testid="videoComponent">
          <img src="https://example.com/video-poster.jpg" alt="Video poster">
          <video src="blob:https://x.com/video-stream"></video>
        </div>
        <div data-testid="videoPlayer">
          <img src="https://example.com/player-poster.jpg" alt="Player poster">
          <video src="https://example.com/video.mp4"></video>
        </div>
        <div data-testid="quoteTweet">
          <div data-testid="tweetText">Quoted media body</div>
          <div data-testid="tweetPhoto"><img src="https://example.com/quoted-photo.jpg" alt="Quoted photo"></div>
          <video src="https://example.com/quoted-video.mp4" poster="https://example.com/quoted-poster.jpg"></video>
        </div>
      </article>
      <article data-testid="tweet">
        <div data-testid="User-Name"><a href="/bob">Bob</a><a href="/bob">@bob</a></div>
        <a href="https://x.com/bob/status/200"><time>Nov 10</time></a>
        <div data-testid="tweetText">Video only</div>
        <div data-testid="Tweet-User-Avatar"><img src="https://example.com/avatar-without-profile-path.jpg" alt="Avatar"></div>
        <div data-testid="videoComponent">
          <img src="https://example.com/fallback-video-poster.jpg" alt="Fallback poster">
          <video src="blob:https://x.com/fallback-stream"></video>
        </div>
        <div data-testid="card.wrapper">
          <div data-testid="tweetPhoto"><img src="https://example.com/fallback-quoted-photo.jpg" alt="Quoted fallback photo"></div>
        </div>
      </article>
    </main>
  `);

  assert.deepEqual(result.items[0].images, [
    { url: 'https://example.com/own-photo.jpg', alt: 'Own photo' },
  ]);
  assert.deepEqual(result.items[0].videos, [
    { url: '', poster: 'https://example.com/video-poster.jpg' },
    { url: 'https://example.com/video.mp4', poster: 'https://example.com/player-poster.jpg' },
  ]);
  assert.deepEqual(result.items[1].images, []);
  assert.deepEqual(result.items[1].videos, [
    { url: '', poster: 'https://example.com/fallback-video-poster.jpg' },
  ]);
});

test('timeline uses the own timestamp permalink, keeps DOM order and reports display toggles', async () => {
  const result = await extract('extract-timeline.js', `
    <main data-testid="primaryColumn">
      <article data-testid="tweet">
        <a href="https://x.com/bob/status/999">Quoted link without a timestamp</a>
        <div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice">@alice</a></div>
        <div data-testid="tweetText">Missing own permalink</div>
      </article>
      <article data-testid="tweet">
        <a href="https://x.com/bob/status/999">Another quote link</a>
        <div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice">@alice</a></div>
        <a href="https://x.com/alice/status/300"><time>Nov 10</time></a>
        <div data-testid="tweetText">First displayed</div>
        <div data-testid="tweet-text-show-more-link"></div>
        <div aria-label="显示原文"></div>
      </article>
      <article data-testid="tweet">
        <div data-testid="User-Name"><a href="/bob">Bob</a><a href="/bob">@bob</a></div>
        <a href="https://x.com/bob/status/100"><time>Nov 10</time></a>
        <div data-testid="tweetText">Second displayed</div>
        <button>Show more</button>
        <div aria-label="Show original">译</div>
      </article>
      <article data-testid="tweet">
        <div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice">@alice</a></div>
        <a href="https://x.com/alice/status/200"><time>Nov 10</time></a>
        <div data-testid="tweetText">Third displayed</div>
        <div data-testid="quoteTweet">
          <div data-testid="tweet-text-show-more-link"></div>
          <div aria-label="Show original"></div>
        </div>
      </article>
    </main>
  `);

  assert.deepEqual(result.items.map((item) => item.id), ['300', '100', '200']);
  assert.deepEqual(result.items.map((item) => item.url), [
    'https://x.com/alice/status/300',
    'https://x.com/bob/status/100',
    'https://x.com/alice/status/200',
  ]);
  assert.deepEqual(result.items.map((item) => [item.isTruncated, item.isTranslated]), [
    [true, true],
    [true, true],
    [false, false],
  ]);
});

test('guest timeline retains plain article extraction and its own timestamp permalink', async () => {
  const result = await extract('extract-timeline.js', `
    <main data-testid="primaryColumn">
      <article>
        <a href="https://x.com/bob/status/999">Quoted link appears first</a>
        <a href="/alice">Alice</a><a href="/alice">@alice</a>
        <a href="https://x.com/alice/status/100"><time datetime="2026-11-10T01:00:00Z">Nov 10</time></a>
        <div dir="auto">Guest body <a href="https://x.com/bob">@bob</a><br>Second line</div>
      </article>
      <article>
        <a href="https://x.com/alice/status/200">No timestamp</a>
        <div dir="auto">This card has no own ID.</div>
      </article>
    </main>
  `);

  assert.equal(result.itemCount, 1);
  assert.equal(result.items[0].id, '100');
  assert.equal(result.items[0].url, 'https://x.com/alice/status/100');
  assert.equal(result.items[0].displayName, 'Alice');
  assert.equal(result.items[0].handle, '@alice');
  assert.equal(result.items[0].text, 'Guest body @bob\nSecond line');
  assert.deepEqual(result.items[0].links, [{ text: '@bob', url: 'https://x.com/bob' }]);
});
