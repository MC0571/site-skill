import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const scratch = mkdtempSync(path.join(tmpdir(), 'site-skill-wrapper-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const stub = path.join(scratch, 'fake-ego-browser');
writeFileSync(stub, '#!/bin/sh\n[ "$1" = nodejs ] || exit 2\nshift\nexec "$EGO_LEARN_TEST_NODE" "$@"\n');
chmodSync(stub, 0o755);

for (const directory of ['ordinary space', "agent's skill", 'back\\slash']) {
  const skill = path.join(scratch, directory);
  const wrapper = path.join(skill, 'bin/ego-learn');
  const workspace = path.join(skill, 'assets');
  mkdirSync(path.dirname(wrapper), { recursive: true });
  mkdirSync(workspace);
  copyFileSync(new URL('../skills/site-skill/bin/ego-learn', import.meta.url), wrapper);
  chmodSync(wrapper, 0o755);

  for (const mode of ['stdin', '-e']) {
    test(`wrapper preserves the workspace in ${directory} via ${mode}`, () => {
      const code = 'process.stdout.write(JSON.stringify(process.env.EGO_BROWSER_AGENT_WORKSPACE));';
      const result = spawnSync(wrapper, mode === 'stdin' ? ['nodejs'] : ['nodejs', '-e', code], {
        input: mode === 'stdin' ? code : undefined,
        env: { ...process.env, EGO_BROWSER_REAL: stub, EGO_LEARN_TEST_NODE: process.execPath },
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout), workspace);
    });
  }
}
