async function (args) {
  const pick = (selectors) => {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const value = el && (el.innerText || el.textContent || "").trim();
      if (value) return value;
    }
    return "";
  };

  const content =
    document.querySelector("#js_content") ||
    document.querySelector(".rich_media_content");
  const bodyText = (document.body && (document.body.innerText || document.body.textContent)) || "";
  const title = pick(["#activity-name", "h1.rich_media_title", ".rich_media_title"]);
  const account = pick([
    "#js_name",
    ".profile_nickname",
    "#js_wx_follow_nickname",
    ".rich_media_meta_nickname",
  ]);
  const author = pick(["#js_author_name"]);
  const publishTime = pick(["#publish_time", "em#publish_time"]);
  const metaTexts = Array.from(document.querySelectorAll(".rich_media_meta"))
    .map((el) => (el.innerText || el.textContent || "").trim())
    .filter(Boolean);

  const imageContent = document.querySelector("#js_image_content");
  const imageDesc = document.querySelector("#js_image_desc");
  if (imageContent || imageDesc) {
    const description = imageDesc
      ? (imageDesc.innerText || imageDesc.textContent || "").replace(/\u00a0/g, " ").trim()
      : "";
    const imageEls = [
      ...document.querySelectorAll("#img_swiper img, #img_list img, .swiper_item img"),
    ];
    const uniqueImages = [];
    const seenUrls = new Set();
    for (const img of imageEls) {
      const src =
        img.getAttribute("data-src") ||
        img.getAttribute("data-original") ||
        img.currentSrc ||
        img.src ||
        "";
      if (!src || src.startsWith("data:") || seenUrls.has(src)) continue;
      seenUrls.add(src);
      uniqueImages.push(src);
    }
    const blocks = [];
    if (description) blocks.push({ type: "paragraph", text: description });
    const contentText = [title, description].filter(Boolean).join("\n\n").trim();
    return {
      ok: true,
      blocked: false,
      contentType: "image_post",
      title,
      account,
      author,
      publishTime,
      metaTexts,
      url: location.href,
      blockCount: blocks.length,
      imageCount: uniqueImages.length,
      contentText,
      blocks,
      images: uniqueImages,
    };
  }

  if (!content) {
    const blocked = /环境异常|完成验证后即可继续访问|去验证|访问过于频繁/.test(bodyText);
    return {
      ok: false,
      blocked,
      reason: blocked ? "verification_required" : "article_content_not_found",
      title,
      account,
      author,
      publishTime,
      url: location.href,
      pageTextSample: bodyText.replace(/\s+/g, " ").trim().slice(0, 600),
    };
  }

  const images = [];
  const seenImages = new WeakSet();
  const collectImage = (img) => {
    if (!img || seenImages.has(img)) return;
    seenImages.add(img);
    const src =
      img.getAttribute("data-src") ||
      img.getAttribute("data-original") ||
      img.getAttribute("data-backsrc") ||
      img.currentSrc ||
      img.src ||
      "";
    if (!src || src.startsWith("data:")) return;
    images.push(src);
  };

  const blocks = [];
  const blockTags = new Set([
    "P",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "LI",
    "BLOCKQUOTE",
    "PRE",
    "TABLE",
    "SECTION",
    "FIGURE",
    "DIV",
  ]);
  const nestedBlockSelector = "p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,table,section,figure,div";

  const walk = (parent) => {
    let inlineText = "";
    const flushInline = () => {
      const text = inlineText.replace(/\u00a0/g, " ").trim();
      if (text) blocks.push({ type: "text", text });
      inlineText = "";
    };
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === 3) {
        inlineText += child.textContent;
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName.toUpperCase();
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") continue;
      if (tag === "IMG") {
        collectImage(child);
        continue;
      }
      if (tag === "BR") {
        inlineText += "\n";
        continue;
      }
      const hasNestedBlocks = child.querySelector(nestedBlockSelector);
      if (!blockTags.has(tag) && !hasNestedBlocks) {
        child.querySelectorAll("img").forEach(collectImage);
        inlineText += child.innerText || child.textContent || "";
        continue;
      }
      flushInline();
      if (hasNestedBlocks) {
        walk(child);
        continue;
      }
      child.querySelectorAll("img").forEach(collectImage);
      const text = (child.innerText || child.textContent || "").replace(/\u00a0/g, " ").trim();
      if (text) {
        blocks.push({ type: tag.toLowerCase(), text });
      }
    }
    flushInline();
  };

  walk(content);
  if (blocks.length === 0) {
    const fallbackText = (content.innerText || content.textContent || "").trim();
    if (fallbackText) blocks.push({ type: "text", text: fallbackText });
  }
  content.querySelectorAll("img").forEach(collectImage);

  const contentText = blocks
    .map((block) => block.text)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    ok: true,
    blocked: false,
    contentType: "standard",
    title,
    account,
    author,
    publishTime,
    metaTexts,
    url: location.href,
    blockCount: blocks.length,
    imageCount: images.length,
    contentText,
    blocks,
    images,
  };
}
