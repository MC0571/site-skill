#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const target = path.resolve(args[0] || path.join(here, "..", "assets", "learnings"));

const TOOL_TYPES = new Set(["string", "number", "integer", "boolean", "array", "object"]);
const TEMP_REF_RE = /(?:@\d+\b|\bref=\d+\b)/;
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bBearer\s+[A-Za-z0-9._-]{20,}\b/,
  /\b(?:api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{8,}["']/i,
];

const errors = [];
const warnings = [];

function error(message) {
  errors.push(message);
}

function warning(message) {
  warnings.push(message);
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function isSafeRelativePath(value, prefix, suffix) {
  if (typeof value !== "string" || !value || value.includes("\\") || path.isAbsolute(value)) {
    return false;
  }
  const parts = value.split("/");
  return parts.length === 2 && parts[0] === prefix && parts[1].endsWith(suffix);
}

function validateArgSchema(prefix, schema, requireRequired) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    error(`${prefix}: schema must be an object`);
    return;
  }
  if (!TOOL_TYPES.has(schema.type)) {
    error(`${prefix}: invalid type ${JSON.stringify(schema.type)}`);
  }
  if (requireRequired && typeof schema.required !== "boolean") {
    error(`${prefix}: required must be a boolean`);
  }
  if (typeof schema.description !== "string" || !schema.description.trim()) {
    error(`${prefix}: description must be a non-empty string`);
  }
}

async function validateToolMap(siteDir, manifest, key) {
  const value = manifest[key] || {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    error(`${key}: must be an object`);
    return;
  }
  for (const [toolName, schema] of Object.entries(value)) {
    const prefix = `${key}.${toolName}`;
    if (!/^[a-z0-9][a-z0-9_]*$/.test(toolName)) {
      error(`${prefix}: invalid tool name`);
      continue;
    }
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
      error(`${prefix}: schema must be an object`);
      continue;
    }
    if (typeof schema.description !== "string" || !schema.description.trim()) {
      error(`${prefix}: description must be a non-empty string`);
    }
    if (key === "nodeTools") {
      if (!isSafeRelativePath(schema.path, "tools", ".js")) {
        error(`${prefix}: path must be tools/*.js`);
        continue;
      }
      if (typeof schema.callable !== "string" || !schema.callable.trim()) {
        error(`${prefix}: callable must be a non-empty string`);
      }
      const toolPath = path.join(siteDir, schema.path);
      if (!(await exists(toolPath))) {
        error(`${prefix}: missing file ${schema.path}`);
        continue;
      }
      try {
        const module = await import(`${pathToFileURL(toolPath).href}?validate=${Date.now()}`);
        if (typeof module[schema.callable] !== "function") {
          error(`${prefix}: missing callable ${JSON.stringify(schema.callable)}`);
        }
      } catch (importError) {
        error(`${prefix}: cannot import ${schema.path}: ${importError.message}`);
      }
    } else {
      if (!isSafeRelativePath(schema.path, "browser-tools", ".js")) {
        error(`${prefix}: path must be browser-tools/*.js`);
        continue;
      }
      const toolPath = path.join(siteDir, schema.path);
      if (!(await exists(toolPath))) {
        error(`${prefix}: missing file ${schema.path}`);
        continue;
      }
      const source = await readFile(toolPath, "utf8");
      try {
        const fn = new Function(`return (${source});`)();
        if (typeof fn !== "function") {
          error(`${prefix}: browser tool must evaluate to a function`);
        }
      } catch (parseError) {
        error(`${prefix}: invalid function expression: ${parseError.message}`);
      }
    }

    if (!schema.args || typeof schema.args !== "object" || Array.isArray(schema.args)) {
      error(`${prefix}: args must be an object`);
    } else {
      for (const [argName, argSchema] of Object.entries(schema.args)) {
        validateArgSchema(`${prefix}.args.${argName}`, argSchema, true);
      }
    }
    validateArgSchema(`${prefix}.returns`, schema.returns, false);
    if (schema.returns && Object.prototype.hasOwnProperty.call(schema.returns, "required")) {
      error(`${prefix}.returns: required is not allowed`);
    }
  }
}

async function validatePack(siteDir) {
  const base = path.basename(siteDir);
  const manifestPath = path.join(siteDir, "manifest.json");
  if (!(await exists(manifestPath))) {
    error(`${base}: missing manifest.json`);
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (parseError) {
    error(`${base}: invalid manifest.json: ${parseError.message}`);
    return;
  }

  if (manifest.id !== base) {
    error(`${base}: manifest id must match directory name (got ${JSON.stringify(manifest.id)})`);
  }
  if (typeof manifest.name !== "string" || !manifest.name.trim()) {
    error(`${base}: name must be a non-empty string`);
  }
  if (!Array.isArray(manifest.domains) || manifest.domains.length === 0) {
    error(`${base}: domains must be a non-empty array`);
  } else {
    for (const domain of manifest.domains) {
      if (
        typeof domain !== "string" ||
        !domain ||
        domain.includes("://") ||
        domain.includes("/") ||
        domain.startsWith(".") ||
        domain.endsWith(".")
      ) {
        error(`${base}: invalid domain ${JSON.stringify(domain)}`);
        continue;
      }
      if (domain.includes("*") && !(domain.startsWith("*.") && domain.indexOf("*") === domain.lastIndexOf("*"))) {
        error(`${base}: invalid wildcard domain ${JSON.stringify(domain)}`);
      }
    }
  }

  if (manifest.notes !== undefined) {
    if (!Array.isArray(manifest.notes)) {
      error(`${base}: notes must be an array`);
    } else {
      for (const note of manifest.notes) {
        if (!isSafeRelativePath(note, "notes", ".md")) {
          error(`${base}: note must be notes/*.md: ${JSON.stringify(note)}`);
          continue;
        }
        const notePath = path.join(siteDir, note);
        if (!(await exists(notePath))) {
          error(`${base}: missing note ${note}`);
          continue;
        }
        const content = await readFile(notePath, "utf8");
        if (!/Last verified:\s*\d{4}-\d{2}-\d{2}/.test(content)) {
          warning(`${base}: ${note} is missing "Last verified: YYYY-MM-DD"`);
        }
        if (TEMP_REF_RE.test(content)) {
          error(`${base}: ${note} contains temporary snapshot refs`);
        }
      }
    }
  }

  await validateToolMap(siteDir, manifest, "nodeTools");
  await validateToolMap(siteDir, manifest, "browserTools");

  for (const file of ["manifest.json", ...(manifest.notes || []), ...Object.values(manifest.nodeTools || {}).map((tool) => tool.path), ...Object.values(manifest.browserTools || {}).map((tool) => tool.path)]) {
    if (typeof file !== "string") continue;
    const filePath = path.join(siteDir, file);
    if (!(await exists(filePath))) continue;
    const content = await readFile(filePath, "utf8");
    if (TEMP_REF_RE.test(content)) {
      error(`${base}: ${file} contains temporary snapshot refs`);
    }
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        warning(`${base}: ${file} may contain a secret; review before committing`);
      }
    }
  }
}

let packs = [];
if (await exists(path.join(target, "manifest.json"))) {
  packs = [target];
} else {
  const entries = await readdir(target, { withFileTypes: true }).catch(() => []);
  packs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => path.join(target, entry.name))
    .filter((entry) => !["notes", "tools", "browser-tools"].includes(path.basename(entry)))
    .sort();
}

if (packs.length === 0) {
  console.error(`no site learning packs found under ${target}`);
  process.exit(1);
}

for (const pack of packs) {
  await validatePack(pack);
}

for (const message of warnings) {
  console.warn(`warn: ${message}`);
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(`error: ${message}`);
  }
  console.error(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}

console.log(`ok: ${packs.length} site learning pack(s) validated`);
for (const pack of packs) {
  console.log(`  - ${pack}`);
}
