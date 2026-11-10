#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const templates = path.resolve(here, "..", "assets", "templates");

const { values } = parseArgs({
  options: {
    "site-id": { type: "string" },
    name: { type: "string" },
    domain: { type: "string", multiple: true },
    root: { type: "string" },
  },
});

const siteId = (values["site-id"] || "").trim();
const siteName = (values.name || "").trim();
const domains = (values.domain || []).map((value) => value.trim()).filter(Boolean);

if (!siteId || !siteName || domains.length === 0) {
  console.error(
    "usage: node scripts/new-site-learning.mjs " +
      "--site-id <id> --name <name> --domain <domain> [--domain <domain>...] [--root <learnings-root>]"
  );
  process.exit(2);
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(siteId)) {
  console.error(`invalid site id ${JSON.stringify(siteId)}: use lowercase letters, digits, and hyphens`);
  process.exit(2);
}

const root = path.resolve(values.root || path.join(here, "..", "assets", "learnings"));
const siteDir = path.join(root, siteId);

try {
  await access(siteDir, constants.F_OK);
  console.error(`directory already exists: ${siteDir}`);
  process.exit(1);
} catch {
  // expected: directory does not exist
}

function today() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function render(templateName, replacements) {
  let content = await readFile(path.join(templates, templateName), "utf8");
  for (const [key, value] of Object.entries(replacements)) {
    content = content.split(key).join(value);
  }
  return content;
}

await mkdir(path.join(siteDir, "notes"), { recursive: true });
await mkdir(path.join(siteDir, "tools"), { recursive: true });
await mkdir(path.join(siteDir, "browser-tools"), { recursive: true });

const replacements = {
  "__SITE_ID__": siteId,
  "__SITE_NAME__": siteName,
  "__DOMAIN__": domains[0],
  "__DATE__": today(),
};

await writeFile(
  path.join(siteDir, "manifest.json"),
  await render("manifest.template.json", replacements),
  "utf8"
);
await writeFile(
  path.join(siteDir, "notes", "overview.md"),
  await render("note.template.md", replacements),
  "utf8"
);
await writeFile(
  path.join(siteDir, "browser-tools", "extract-page.js"),
  await render("browser-tool.template.js", replacements),
  "utf8"
);
await writeFile(
  path.join(siteDir, "tools", "open-and-extract.js"),
  await render("node-tool.template.js", replacements),
  "utf8"
);

console.log(`created site learning scaffold: ${siteDir}`);
console.log("next steps:");
console.log("1. Fill in notes/overview.md with the site map and selectors.");
console.log("2. Implement browser-tools/extract-page.js and tools/open-and-extract.js.");
console.log(`3. Validate: node scripts/validate-site-learning.mjs ${siteDir}`);
