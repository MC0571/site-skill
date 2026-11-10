#!/usr/bin/env node
import { cp, lstat, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, "..");
const workspace = path.join(skillDir, "assets");
const home = os.homedir();
const appSkillDir = path.join(
  home,
  ".local/share/ego/active_version_dir/Resources/ego-skills/ego-browser"
);
const userSkillDir = path.join(home, ".local/share/ego/ego-skills-local");
const userSkillLink = path.join(home, ".local/share/ego/ego-skills");

function siteLearningsSection() {
  return `## Site learnings (check before exploring)

ego-browser can load reusable **site learning packs** before touching a page. A pack contains site-specific notes plus read-only tools, stored under \`learnings/<site-id>/\` in the workspace directory.

Before exploring a site for a browser task:

1. Set the workspace inside the Node script because the bundled runtime may not inherit shell env vars:

   \`\`\`js
   process.env.EGO_BROWSER_AGENT_WORKSPACE =
     process.env.EGO_BROWSER_AGENT_WORKSPACE || ${JSON.stringify(workspace)};
   \`\`\`

2. Check whether a matching pack exists for the target URL:

   \`\`\`js
   const matches = await siteSkillsForUrl(url);
   const learned = await learnContext(url);
   \`\`\`

3. If \`matches.length > 0\`, use the learned tools instead of rediscovering selectors:

   \`\`\`js
   const result = await runSiteTool("<site-id>", "<tool-name>", { /* args */ });
   \`\`\`

4. If no pack matches and the site will be reused, load the \`site-skill\` skill and follow its workflow to create one.

5. If \`siteSkillsForUrl()\` returns an empty list for a site you know has a pack, verify that \`EGO_BROWSER_AGENT_WORKSPACE\` points to the directory containing \`learnings/\`.

Site learning tools are read-only by default. Prefer them over ad-hoc DOM exploration when a pack exists.
`;
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(appSkillDir))) {
    console.error(`ego-browser skill not found: ${appSkillDir}`);
    console.error("This helper currently supports the macOS ego lite layout.");
    console.error("On other platforms, follow patches/ego-browser-site-learnings.md manually.");
    process.exit(1);
  }

  await mkdir(path.dirname(userSkillDir), { recursive: true });
  if (!(await exists(userSkillDir))) {
    await cp(appSkillDir, userSkillDir, { recursive: true });
    console.log(`copied ego-browser skill -> ${userSkillDir}`);
  }

  const skillFile = path.join(userSkillDir, "SKILL.md");
  let text = await readFile(skillFile, "utf8");
  const existingSection = /^## Site learnings[^\n]*\n[\s\S]*?^Site learning tools are read-only by default\.[^\n]*(?:\n|$)/m;
  if (/^## Site learnings\b/m.test(text)) {
    if (!existingSection.test(text)) {
      throw new Error(`cannot locate the end of the existing Site learnings section in ${skillFile}`);
    }
    text = text.replace(existingSection, () => siteLearningsSection());
  } else {
    const marker = "# ego-browser\n";
    if (!text.includes(marker)) {
      console.error(`cannot find '# ego-browser' heading in ${skillFile}`);
      process.exit(1);
    }
    text = text.replace(marker, () => `${marker}\n${siteLearningsSection().trimEnd()}\n`);
  }
  await writeFile(skillFile, text, "utf8");
  console.log(`patched ${skillFile}`);

  try {
    const info = await lstat(userSkillLink);
    if (!info.isSymbolicLink()) {
      console.error(`refusing to replace non-symlink path: ${userSkillLink}`);
      process.exit(1);
    }
    await rm(userSkillLink);
  } catch {
    // link does not exist
  }
  await symlink(userSkillDir, userSkillLink, "dir");
  console.log(`linked ${userSkillLink} -> ${userSkillDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
