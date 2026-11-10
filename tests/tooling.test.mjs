import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const skill = fileURLToPath(new URL("../skills/site-skill/", import.meta.url));
const scratch = mkdtempSync(path.join(tmpdir(), "site-skill-tooling-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

test("scaffolding serializes names and retains all domains", () => {
  const name = 'Example "Docs" \\ Reference';
  const root = path.join(scratch, "learnings");
  const result = spawnSync(process.execPath, [
    path.join(skill, "scripts/new-site-learning.mjs"),
    "--site-id", "example", "--name", name,
    "--domain", "example.com", "--domain", "*.example.com", "--root", root,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const siteDir = path.join(root, "example");
  const manifest = JSON.parse(readFileSync(path.join(siteDir, "manifest.json"), "utf8"));
  assert.equal(manifest.id, "example");
  assert.equal(manifest.name, name);
  assert.deepEqual(manifest.domains, ["example.com", "*.example.com"]);
  assert.ok(readFileSync(path.join(siteDir, "notes/overview.md"), "utf8").startsWith(`# ${name}\n`));
  const validation = spawnSync(process.execPath, [path.join(skill, "scripts/validate-site-learning.mjs"), siteDir], { encoding: "utf8" });
  assert.equal(validation.status, 0, validation.stderr);
});

function installation(name) {
  const home = path.join(scratch, name);
  const base = path.join(home, ".local/share/ego");
  const app = path.join(base, "active_version_dir/Resources/ego-skills/ego-browser");
  mkdirSync(app, { recursive: true });
  const guide = "---\nname: ego-browser\n---\n\n# ego-browser\n\nBefore any browser task, run:\n\n```bash\nego-browser skill\n```\n\nand follow its output.\n\n## References\n\nKeep these references unchanged.\n";
  writeFileSync(path.join(app, "SKILL.md"), guide);
  return { home, base, guide, local: path.join(base, "ego-skills-local") };
}

function patch(fixture) {
  const preload = `data:text/javascript,${encodeURIComponent('import os from "node:os"; os.homedir = () => process.env.SITE_SKILL_TEST_HOME;')}`;
  return spawnSync(process.execPath, ["--import", preload, path.join(skill, "scripts/apply-ego-browser-patch.mjs")], {
    env: { ...process.env, SITE_SKILL_TEST_HOME: fixture.home }, encoding: "utf8",
  });
}

test("fresh patch preserves the guide and is idempotent", () => {
  const fixture = installation("fresh");
  const first = patch(fixture);
  assert.equal(first.status, 0, first.stderr);
  const skillFile = path.join(fixture.local, "SKILL.md");
  const text = readFileSync(skillFile, "utf8");
  assert.ok(text.includes(path.join(skill, "assets")));
  assert.ok(text.endsWith(fixture.guide.split("# ego-browser\n")[1]));
  assert.equal(readlinkSync(path.join(fixture.base, "ego-skills")), fixture.local);
  const second = patch(fixture);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(readFileSync(skillFile, "utf8"), text);
});

test("patch refreshes only the owned section when the workspace moves", () => {
  const fixture = installation("upgrade");
  mkdirSync(fixture.local);
  const prefix = "# ego-browser\n\nCustom introduction.\n\n";
  const suffix = "## Usage guide\n\nKeep this guide unchanged.\n\n### Details\n\nKeep these too.\n";
  const skillFile = path.join(fixture.local, "SKILL.md");
  writeFileSync(skillFile, `${prefix}## Site learnings (check before exploring)\n\nUse /old/site-learning/.ego-browser and load the site-learning skill.\n\nSite learning tools are read-only by default.\n\n${suffix}`);
  const result = patch(fixture);
  assert.equal(result.status, 0, result.stderr);
  const text = readFileSync(skillFile, "utf8");
  assert.ok(text.startsWith(prefix));
  assert.ok(text.endsWith(suffix));
  assert.ok(text.includes(path.join(skill, "assets")));
  assert.ok(text.includes("load the `site-skill` skill"));
  assert.ok(!text.includes("/old/site-learning/.ego-browser"));
  assert.equal(text.match(/^## Site learnings/gm).length, 1);
});

test("patch leaves an existing section untouched when its boundary is unknown", () => {
  const fixture = installation("unknown-section");
  mkdirSync(fixture.local);
  const skillFile = path.join(fixture.local, "SKILL.md");
  const original = "# ego-browser\n\n## Site learnings\n\nCustom section without a known ending.\n\nOriginal usage guide.\n\n## References\nKeep these.\n";
  writeFileSync(skillFile, original);
  const result = patch(fixture);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot locate the end of the existing Site learnings section/);
  assert.equal(readFileSync(skillFile, "utf8"), original);
});

test("patch refuses to replace a real user directory with a symlink", () => {
  const fixture = installation("directory");
  const existing = path.join(fixture.base, "ego-skills");
  mkdirSync(existing);
  const userFile = path.join(existing, "user-notes.md");
  writeFileSync(userFile, "User content");
  const result = patch(fixture);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /refusing to replace non-symlink path/);
  assert.equal(readFileSync(userFile, "utf8"), "User content");
});
