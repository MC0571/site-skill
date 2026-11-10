import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

const source = readFileSync(new URL("../skills/site-skill/assets/learnings/wechat-mp/browser-tools/extract-article.js", import.meta.url), "utf8");
function extract(html) {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  return new Function("document", "location", `return (${source});`)(document, new URL("https://mp.weixin.qq.com/s/example"))({});
}

test("mixed inline and block text stays complete and ordered", async () => {
  const result = await extract('<div id="js_content">Intro <strong>bold</strong><p>Paragraph</p><span>Inline <em>tail</em></span> end<br>Last line<!-- comment --></div>');
  assert.equal(result.ok, true);
  assert.deepEqual(result.blocks.map(block => block.text), ["Intro bold", "Paragraph", "Inline tail end\nLast line"]);
  assert.equal(result.contentText, "Intro bold\n\nParagraph\n\nInline tail end\nLast line");
});

test("nested containers retain direct text without repeating paragraphs or images", async () => {
  const result = await extract('<div id="js_content"><section>Before<p>Body<img data-src="https://example.com/image.jpg"></p>After <span>tail</span></section><script>ignore me</script></div>');
  assert.deepEqual(result.blocks.map(block => block.text), ["Before", "Body", "After tail"]);
  assert.deepEqual(result.images, ["https://example.com/image.jpg"]);
  assert.equal(result.imageCount, 1);
});

test("image posts keep descriptions and deduplicated images", async () => {
  const result = await extract('<h1 id="activity-name">Title</h1><div id="js_image_content"><div id="js_image_desc">Description</div><div id="img_swiper"><img data-src="https://example.com/a.jpg"><img data-src="https://example.com/a.jpg"></div></div>');
  assert.equal(result.contentType, "image_post");
  assert.equal(result.contentText, "Title\n\nDescription");
  assert.deepEqual(result.images, ["https://example.com/a.jpg"]);
});

test("verification pages remain explicit failures", async () => {
  const result = await extract("环境异常，完成验证后即可继续访问");
  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.equal(result.reason, "verification_required");
});
