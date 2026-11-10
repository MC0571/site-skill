---
name: site-learning
description: Use when an Agent needs to explore an unfamiliar website and turn what it learns into reusable site knowledge for ego-browser / ego lite. Trigger phrases include "给这个网站做站点学习", "沉淀站点知识", "site learning", "site skill", "下次不用重新探索", "build a site learning pack", or when siteSkillsForUrl(url) returns no matching pack. This skill produces manifest.json + notes + node tools + browser tools, tests them, and saves them under .ego-browser/learnings/<site-id>/. Not for one-off browsing tasks where nothing needs to be reused.
metadata:
  version: "1.0.0"
  date: "2026-11-10"
---

# Site Learning

Build a reusable **site learning pack** for any website, so future Agent runs do not have to rediscover the same page structure, selectors, URL patterns, or extraction logic.

This skill is a **meta-skill**: it teaches the Agent how to explore a target site with `ego-browser` and distill stable, reusable knowledge into the format ego-browser already understands.

## Core model

A site learning pack is a directory:

```text
<workspace>/learnings/<site-id>/
├── manifest.json        # id/name/domains/notes/tool declarations
├── notes/
│   └── overview.md      # human- and Agent-readable site map
├── tools/
│   └── <tool>.js        # Node-side tool: can navigate and orchestrate
└── browser-tools/
    └── <tool>.js        # Page-side tool: extracts data from current DOM only
```

ego-browser discovers packs through `EGO_BROWSER_AGENT_WORKSPACE`:

```bash
export EGO_BROWSER_AGENT_WORKSPACE="${SITE_LEARNING_ROOT:-$PWD/.ego-browser}"
```

Then:

- `siteSkillsForUrl(url)` — list packs matching the URL
- `learnContext(url)` — load matching notes and tool signatures
- `runSiteTool(siteId, toolName, args)` — run a Node-side tool
- `runSiteBrowserTool(siteId, toolName, args)` — run a page-side tool against the current page

## Hard rules

1. **Capture the shape of the site, not the diary of your task.** Notes describe stable structure and workflows; they do not narrate "I clicked X then Y for this request".
2. **No secrets or personal data.** Never write cookies, tokens, passwords, session IDs, account names, addresses, or private page content into a pack.
3. **No temporary snapshot refs.** Never write values like snapshot references with `@` plus digits, or `ref=` plus digits. Use stable CSS/ARIA/text locators.
4. **No pixel coordinates.** Do not encode click coordinates or scroll positions.
5. **Prefer stable semantics.** IDs, `data-*` attributes, `role`, accessible names, stable URLs. Avoid hashed CSS classes, `nth-child`, and layout-dependent XPaths.
6. **Read-only by default.** Tools should extract and observe. Do not build tools that submit forms, purchase, delete, or post unless the user explicitly asks; any write tool must require an explicit runtime confirmation argument and warn in its description.
7. **Respect access boundaries.** If a site requires login, CAPTCHA, verification, or paywall approval, record that state in notes and hand control to the user (`task.handOff()`) instead of bypassing it.
8. **Small and robust beats large and clever.** One pack should expose a few high-value tools, not dozens of brittle ones.
9. **Every pack must be tested on at least two representative URLs** (or two representative states) before being reported as working.
10. **Keep a verification date.** Notes must include `Last verified: YYYY-MM-DD`.

## Workflow

### Step 0 — Decide whether a pack is worth building

Build a pack when at least two of these are true:

- The site will be visited again by an Agent.
- The site has repeated page types (list/detail/search/form).
- Extraction requires more than one stable field.
- The site has login/verification/pagination rules worth remembering.
- A previous run spent significant time rediscovering selectors.

Do **not** build a pack for a one-off page, a throwaway search, or a site that changes every visit.

### Step 1 — Check existing coverage

```js
const url = "https://example.com/some/page";
const matches = await siteSkillsForUrl(url);
if (matches.length) {
  const context = await learnContext(url);
  console.log(JSON.stringify({ matches, context }, null, 2));
}
```

- If a matching pack exists, prefer using or updating it.
- If it exists but is stale or broken, repair it instead of creating a duplicate.
- If no pack matches, continue.

### Step 2 — Explore the target site

Create one task space for exploration and keep it open across steps:

```js
const task = await taskSpace("explore example.com");
const page = task.page("p1");
await page.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 45_000 });
console.log(await page.snapshot({ scope: "full_page" }));
```

Then collect a DOM inventory with `page.evaluate()`. Do not print the entire HTML; extract a compact map:

```js
const inventory = await page.evaluate(() => {
  const info = (el) => ({
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    role: el.getAttribute("role") || undefined,
    name: el.getAttribute("name") || undefined,
    testid: el.getAttribute("data-testid") || el.getAttribute("data-test") || undefined,
    href: el.getAttribute("href") || undefined,
    text: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 100),
  });
  return {
    title: document.title,
    url: location.href,
    headings: [...document.querySelectorAll("h1,h2,h3")].slice(0, 40).map(info),
    links: [...document.querySelectorAll("a[href]")].slice(0, 120).map(info),
    forms: [...document.querySelectorAll("form")].map((form) => ({
      action: form.action,
      method: form.method,
      fields: [...form.querySelectorAll("input,select,textarea,button")].map(info),
    })),
    tables: [...document.querySelectorAll("table")].slice(0, 10).map((table) => ({
      headers: [...table.querySelectorAll("th")].map((th) => (th.innerText || "").trim()),
      rowCount: table.querySelectorAll("tbody tr").length,
    })),
    dataAttributes: [...new Set(
      [...document.querySelectorAll("*")].flatMap((el) =>
        [...el.attributes].map((attr) => attr.name).filter((name) => name.startsWith("data-"))
      )
    )].slice(0, 80),
  };
});
console.log(JSON.stringify(inventory, null, 2));
```

Map at least these page types when they exist:

- Home / landing page
- Listing, search, or category page
- Detail page (article / product / profile / post)
- Form or interaction page
- Error, empty, logged-out, or verification state

Record URL patterns, not just one example URL. Expand relative links with `new URL(href, location.href).href`.

### Step 3 — Distill stable selectors

For every field or action, record:

| What | Selector strategy | Why stable |
| --- | --- | --- |
| Page title | `#activity-name`, `h1[itemprop="headline"]` | semantic id / property |
| Main content | `#js_content`, `article[role="main"]` | semantic container |
| Item list | `[data-testid="result-list"] > li` | test id + structural child |
| Next page | `loc=role:link[name="Next"]` | role + accessible name |

Prefer the most stable identifier in this order:

1. Semantic ID (`#main`, `#js_content`)
2. Stable `data-*` attribute (`[data-testid="..."]`, `[data-qa="..."]`)
3. ARIA role + accessible name (`loc=role:button[name="Submit"]`)
4. Stable attribute (`[itemprop="..."]`, `[name="..."]`)
5. Stable text content (`text="Save"`), only when localized and unlikely to change
6. Structural CSS (last resort, and only if the structure is core to the page)

Never use:

- Hashed/generated class names (`css-1x2y3z`, `sc-abc123`)
- `:nth-child()` or positional selectors in packs
- Snapshot refs or pixel coordinates
- Selectors tied to one user's data or one article's content

### Step 4 — Write the learning pack

Scaffold a new pack:

```bash
node skills/site-learning/scripts/new-site-learning.mjs \
  --site-id example \
  --name "Example Site" \
  --domain example.com \
  --root .ego-browser/learnings
```

Then fill in:

1. `manifest.json` — id must equal directory name; domains must be bare host patterns.
2. `notes/overview.md` — site map, URL patterns, selector table, states, edge cases, last verified date.
3. `browser-tools/<tool>.js` — pure DOM extraction from the current page.
4. `tools/<tool>.js` — navigation and orchestration, calling browser tools as needed.

#### Browser tool contract

A browser tool is an async function expression. It must not navigate and must not rely on outer variables:

```js
async function (args) {
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
  const root = document.querySelector("#main");
  if (!root) {
    return { ok: false, reason: "main_content_not_found", url: location.href };
  }
  return {
    ok: true,
    url: location.href,
    title: clean(document.title),
    items: [...root.querySelectorAll("[data-item]")].slice(0, args.maxItems || 50).map((el) => ({
      text: clean(el.innerText),
      href: el.querySelector("a[href]")?.href || "",
    })),
  };
}
```

#### Node tool contract

A Node tool is an ES module export receiving the helper context and args:

```js
export async function openAndExtract(ctx, args = {}) {
  const url = String(args.url || "").trim();
  if (!url) throw new Error("url is required");
  await ctx.openOrReuseTab(url, { wait: true });
  await ctx.waitForLoad();
  return ctx.runSiteBrowserTool("example", "extract_page", { maxItems: args.maxItems });
}
```

Rules for tools:

- Names: `snake_case` in the manifest; `camelCase` for Node exports.
- Every tool must declare `args` and `returns` with `type`, `required` (args only), and `description`.
- All return values must be JSON-serializable: no DOM nodes, functions, `undefined`, or circular objects.
- Recoverable page states should return `{ ok: false, reason: "..." }`; throw only for invalid arguments or programming errors.
- `maxItems` style arguments should be bounded to a sane maximum (for example 100).
- Do not include secrets or task-specific data in defaults.

### Step 5 — Validate and test

Run the static validator:

```bash
node skills/site-learning/scripts/validate-site-learning.mjs .ego-browser/learnings/example
```

Then run a live test. Use at least two representative URLs or states:

```bash
EGO_BROWSER_AGENT_WORKSPACE="$PWD/.ego-browser" ego-browser nodejs <<'EOF'
const task = await taskSpace("test example learning");
const result = await runSiteTool("example", "open_and_extract", {
  url: "https://example.com/first-page",
});
console.log(JSON.stringify(result, null, 2));
await task.finish({ keep: [] });
EOF
```

Check:

- `siteSkills()` lists the pack on a matching page.
- `learnContext()` returns the notes file.
- Required fields are non-empty on every test URL.
- Failure states return a clear `ok: false` and `reason`.
- No HTML blobs where text is expected.
- No secrets or user-specific data in the output or pack.

### Step 6 — Report and maintain

When reporting completion, include:

- Site ID and pack path
- URLs/pages tested
- Tool names and what each returns
- Known limitations and access states (login, CAPTCHA, paywall)
- `Last verified` date

When the site changes:

1. Re-run the live test.
2. Update selectors in the browser tool first.
3. Update notes and the verification date.
4. If the site changed fundamentally, bump `metadata.version` in the manifest if present or note the change in the note header.

## Pack quality checklist

- [ ] `manifest.json` is valid JSON and `id` equals the directory name
- [ ] `domains` are bare, valid host patterns
- [ ] `notes/*.md` exists and mentions `Last verified`
- [ ] Every declared tool file exists and imports/parses correctly
- [ ] Every tool has complete `args` and `returns` schemas
- [ ] No temporary refs, pixel coordinates, hashed classes, or secrets
- [ ] At least two representative URLs/states tested successfully
- [ ] `siteSkills()` and `learnContext()` both work with the pack
- [ ] The pack is small, focused, and documented

## References

- `references/exploration-playbook.md` — detailed exploration commands and page inventory recipes
- `references/selector-strategy.md` — good vs bad selectors, with examples
- `references/learning-format.md` — full manifest schema and pack layout
- `assets/` — copyable templates
- `scripts/new-site-learning.mjs` — scaffold a new pack
- `scripts/validate-site-learning.mjs` — static validation

## Common failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `siteSkills()` returns `[]` | `EGO_BROWSER_AGENT_WORKSPACE` not set, or wrong root | Point it at the directory containing `learnings/` |
| `runSiteTool` says `site skill not found` | site id mismatch or wrong root | Ensure directory name equals manifest `id` |
| Tool works on one page but not another | selector is too specific or page variant differs | Add a fallback selector chain and test both variants |
| Extraction returns empty on some pages | content rendered late or lazy-loaded | Wait for the container, scroll once, then extract |
| Browser tool throws `document is not defined` | tool was executed in Node instead of page | Use `runSiteBrowserTool`, not `runSiteTool` |
| Validation says `path must stay inside` | tool path points outside the pack | Move the file under `tools/` or `browser-tools/` |

## Reporting template

```text
Site: <site-id> (<name>)
Pack: <path>
Tested: <URL 1>, <URL 2>
Tools: <tool> — <returns>
Notes: <path>
Last verified: <YYYY-MM-DD>
Limitations: <login/verification/paywall/known gaps>
```
