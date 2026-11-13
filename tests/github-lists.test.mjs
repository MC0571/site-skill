import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { addRepositoryToLists, createList, editList, getStarLists, getRepositoryLists } from "../skills/site-skill/assets/learnings/github-stars/tools/lists.js";

function browserContext(html, fetch, onSubmit) {
  const { document, DOMParser: Parser } = parseHTML(html);
  const prepare = root => {
    for (const form of root.querySelectorAll("form")) {
      Object.defineProperty(form, "method", { get: () => form.getAttribute("method") || "get" });
      form.requestSubmit = () => onSubmit(form, new FormData(form), url => { location = new URL(url); });
    }
    for (const input of root.querySelectorAll('input[type="checkbox"]')) Object.defineProperty(input, "checked", {
      get: () => input.hasAttribute("checked"), set: value => input.toggleAttribute("checked", value),
    });
    for (const button of root.querySelectorAll("button")) button.getClientRects = () => [{}];
    return root;
  };
  prepare(document);
  class DOMParser {
    parseFromString(source, type) { return prepare(new Parser().parseFromString(source, type)); }
  }
  class FormData extends globalThis.FormData {
    constructor(form) {
      super();
      for (const field of form.querySelectorAll("input,textarea")) {
        if (field.name && (!['checkbox', 'radio'].includes(field.type) || field.checked)) this.append(field.name, field.value);
      }
    }
  }
  let location;
  const visits = [];
  return {
    document,
    visits,
    async openOrReuseTab(url) { visits.push(url); location = new URL(url); },
    async gotoAndWait(url) { visits.push(url); location = new URL(url); },
    async waitForLoad() {},
    async waitForElement() { document.documentElement.removeAttribute("data-site-skill-list-submit"); },
    async js(script) {
      return new Function("document", "location", "fetch", "DOMParser", "FormData", `return (${script});`)(document, location, fetch, DOMParser, FormData);
    },
  };
}

const repoUrl = "https://github.com/owner/repo";
const repoPage = '<html><body><button aria-label="Unstar owner/repo">Starred</button></body></html>';
const available = [{ id: "1", name: "Existing" }, { id: "2", name: "Target A" }, { id: "3", name: "Target B" }];
function fragment(selected, action = "/owner/repo/lists", lists = available) {
  return `<html><body><form action="${action}" method="post"><input name="_method" value="put">
    <input name="authenticity_token" value="fixture-csrf"><input name="list_ids[]" value="">
    <input name="user_list_menu_dirty" value="0">
    ${lists.map(list => `<button role="option" data-value="${list.id}" aria-selected="${selected.has(list.id)}">${list.name}</button>`).join("")}
    </form></body></html>`;
}
const response = (html, url = repoUrl, status = 200) => ({ ok: status >= 200 && status < 300, status, url, async text() { return html; } });

test("repository list lookup returns all options and selected membership without submitting", async () => {
  const ctx = browserContext(repoPage, async (url, options) => {
    assert.equal(url, `${repoUrl}/lists?experimental=1`);
    assert.equal(options.headers.Accept, "text/fragment+html");
    return response(fragment(new Set(["1", "3"])));
  }, () => assert.fail("read must not submit"));
  const result = await getRepositoryLists(ctx, { url: `${repoUrl}?ignored=1` });
  assert.equal(result.ok, true);
  assert.equal(result.lists.length, 3);
  assert.deepEqual(result.selectedLists.map(list => list.id), ["1", "3"]);
  assert.equal(JSON.stringify(result).includes("fixture-csrf"), false);
});

test("list overview includes collapsed cards and keeps its independent sort", async () => {
  const cards = Array.from({ length: 10 }, (_, i) => `<a href="/stars/example/lists/list-${i}" ${i >= 8 ? "hidden" : ""}>
    <div><h3>List ${i}</h3><span>Description ${i}</span><div>${i} ${i === 1 ? "repository" : "repositories"}</div></div></a>`).join("");
  const ctx = browserContext(`<div id="profile-lists-container">${cards}</div>`, () => assert.fail("no fetch needed"));
  const result = await getStarLists(ctx, { url: "https://github.com/example?tab=stars&user_lists_sort=name&user_lists_direction=asc" });
  assert.equal(result.listCount, 10);
  assert.equal(result.scope, "all_dom_lists");
  assert.equal(result.sort, "name");
  assert.equal(result.direction, "asc");
  assert.deepEqual(result.lists[9], { name: "List 9", url: "https://github.com/stars/example/lists/list-9", description: "Description 9", repositoryCount: 9 });
});

test("adding multiple lists preserves existing membership, verifies saving and is idempotent", async () => {
  let selected = new Set(["1"]);
  let writes = 0;
  let documentReplaced = false;
  let reopened = false;
  let finishNavigation;
  const ctx = browserContext(repoPage, async (url, options) => {
    assert.notEqual(options.method, "POST");
    if (writes) {
      assert.equal(documentReplaced, true, "verification must wait for the submitted document to be replaced");
      assert.equal(reopened, true, "verification must run from the reopened repository page");
    }
    return response(fragment(selected));
  }, (form, body, navigate) => {
    writes += 1;
    assert.equal(ctx.document.documentElement.hasAttribute("data-site-skill-list-submit"), true);
    assert.equal(form.getAttribute("action"), "/owner/repo/lists");
    assert.equal(body.get("authenticity_token"), "fixture-csrf");
    assert.equal(body.get("_method"), "put");
    assert.equal(body.get("user_list_menu_dirty"), "1");
    assert.deepEqual(body.getAll("list_ids[]"), ["", "1", "2", "3"]);
    finishNavigation = () => {
      selected = new Set(body.getAll("list_ids[]").filter(Boolean));
      documentReplaced = true;
      navigate(`${repoUrl}/lists`);
    };
  });
  ctx.waitForElement = async selector => {
    assert.equal(selector, 'html:not([data-site-skill-list-submit])');
    assert.equal(ctx.document.documentElement.hasAttribute("data-site-skill-list-submit"), true);
    ctx.document.documentElement.removeAttribute("data-site-skill-list-submit");
    finishNavigation();
  };
  const goto = ctx.gotoAndWait;
  ctx.gotoAndWait = async url => {
    assert.equal(documentReplaced, true);
    assert.equal(url, repoUrl);
    reopened = true;
    await goto(url);
  };
  const args = { url: repoUrl, listNames: ["Target A", "Target B", "Target A"], confirm: true };
  const result = await addRepositoryToLists(ctx, args);
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.deepEqual(result.addedLists.map(list => list.id), ["2", "3"]);
  assert.deepEqual(result.selectedLists.map(list => list.id), ["1", "2", "3"]);
  const again = await addRepositoryToLists(ctx, args);
  assert.equal(again.changed, false);
  assert.equal(again.addedLists.length, 0);
  assert.equal(again.alreadyPresentLists.length, 2);
  assert.equal(writes, 1);
});

test("unknown and ambiguous list names fail before any write", async () => {
  for (const lists of [available, [...available, { id: "4", name: "Target A" }]]) {
    const ctx = browserContext(repoPage, async (url, options) => {
      assert.notEqual(options.method, "POST");
      return response(fragment(new Set(["1"]), "/owner/repo/lists", lists));
    });
    const listNames = lists === available ? ["Target A", "Missing"] : ["Target A"];
    await assert.rejects(addRepositoryToLists(ctx, { url: repoUrl, listNames, confirm: true }), /exactly one existing list/);
  }
});

test("a server rejection or missing saved membership never reports success", async () => {
  for (const status of [403, 200]) {
    let submitted = false;
    const ctx = browserContext(repoPage, async () => response(fragment(new Set(["1"])), repoUrl, submitted ? status : 200),
      (form, body, navigate) => { submitted = true; navigate(repoUrl); });
    const result = await addRepositoryToLists(ctx, { url: repoUrl, listNames: ["Target A"], confirm: true });
    assert.equal(result.ok, false);
    assert.equal(result.reason, status === 403 ? "list_read_failed" : "list_membership_not_saved");
  }
});

test("unstarred repositories and mismatched form actions cannot be modified", async () => {
  const unstarred = browserContext('<button aria-label="Star owner/repo">Star</button>', async () => assert.fail("must not request lists"));
  assert.equal((await addRepositoryToLists(unstarred, { url: repoUrl, listNames: ["Target A"], confirm: true })).reason, "repository_not_starred");
  for (const selected of [new Set(), new Set(["2"])]) {
    const ctx = browserContext(repoPage, async (url, options) => {
      assert.notEqual(options.method, "POST");
      return response(fragment(selected, "https://example.com/lists"));
    });
    await assert.rejects(addRepositoryToLists(ctx, { url: repoUrl, listNames: ["Target A"], confirm: true }), /unexpected action or method/);
  }
});

const createPage = `<html><body><a href="https://github.com/example?tab=stars">Stars</a>
  <div id="profile-lists-container"><a href="/stars/example/lists/existing"><h3>Existing</h3></a></div>
  <form action="/stars/example/lists" method="post"><input name="authenticity_token" value="fixture-csrf">
  <input name="user_list[name]"><textarea name="user_list[description]"></textarea>
  <input type="hidden" name="user_list[private]" value="0"><input type="checkbox" name="user_list[private]" value="1"></form></body></html>`;

test("creating default-private and explicit private or public lists verifies a fresh read", async () => {
  for (const requestedPrivate of [undefined, true, false]) {
    const isPrivate = requestedPrivate ?? true;
    let reads = 0;
    let finishNavigation;
    const url = "https://github.com/stars/example/lists/new";
    const ctx = browserContext(createPage, async (target, options) => {
      assert.notEqual(options.method, "POST");
      reads += 1;
      assert.equal(target, url);
      assert.equal(options.cache, "no-store");
      return response(`<input name="user_list[name]" value="New"><textarea name="user_list[description]">Description</textarea>
        <input name="user_list[private]" type="checkbox" ${isPrivate ? "checked" : ""}>`, url);
    }, (form, body, navigate) => {
      assert.equal(form.getAttribute("action"), "/stars/example/lists");
      assert.equal(body.get("user_list[name]"), "New");
      assert.equal(body.get("user_list[description]"), "Description");
      assert.deepEqual(body.getAll("user_list[private]"), isPrivate ? ["0", "1"] : ["0"]);
      assert.equal(body.get("authenticity_token"), "fixture-csrf");
      finishNavigation = () => navigate(url);
    });
    ctx.waitForElement = async selector => {
      assert.equal(selector, 'button[data-show-dialog-id^="edit-list-dialog-"]');
      finishNavigation();
    };
    const args = { name: " New ", description: "Description", confirm: true };
    if (requestedPrivate !== undefined) args.isPrivate = requestedPrivate;
    const result = await createList(ctx, args);
    assert.deepEqual(result, { ok: true, name: "New", description: "Description", isPrivate, url });
    assert.equal(reads, 1);
  }
});

test("duplicate list names, failed creation and unverified saves do not report a new list", async () => {
  const duplicate = browserContext(createPage, async () => assert.fail("must not submit a duplicate"));
  await assert.rejects(createList(duplicate, { name: "Existing", confirm: true }), /already exists/);
  for (const saved of [false, true]) {
    const ctx = browserContext(createPage, async () => response("", "https://github.com/stars/example/lists/new"),
      (form, body, navigate) => navigate(saved ? "https://github.com/stars/example/lists/new" : "https://github.com/stars/example/lists"));
    const result = await createList(ctx, { name: "New", confirm: true });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "list_creation_not_saved");
  }
});

const editUrl = "https://github.com/stars/example/lists/old";
const editPage = `<html><body><div id="profile-lists-container"><a href="/stars/example/lists/old"><h3>Old</h3></a></div>
  <form action="/stars/example/lists/old" method="post"><input name="_method" value="put">
  <input name="authenticity_token" value="fixture-csrf"><input name="user_list[name]" value="Old">
  <textarea name="user_list[description]">Before</textarea><input name="user_list[private]" type="hidden" value="0">
  <input name="user_list[private]" type="checkbox" value="1" checked></form></body></html>`;

test("editing preserves omitted fields, handles renamed URLs and verifies a fresh saved state", async () => {
  for (const patch of [{ description: "After" }, { name: "New", isPrivate: false }]) {
    let writes = 0;
    let saved;
    let finishNavigation;
    let documentReplaced = false;
    const ctx = browserContext(editPage, async (url, options) => {
      assert.notEqual(options.method, "POST");
      if (!writes) return response(editPage);
      assert.equal(documentReplaced, true, "verification must wait for submission to finish");
      assert.equal(options.cache, "no-store");
      assert.equal(url, `https://github.com/stars/example/lists/${saved.name.toLowerCase()}`);
      return response(`<input name="user_list[name]" value="${saved.name}"><textarea name="user_list[description]">${saved.description}</textarea>
        <input name="user_list[private]" type="checkbox" ${saved.isPrivate ? "checked" : ""}>`, url);
    }, (form, body) => {
      writes++;
      assert.equal(ctx.document.documentElement.hasAttribute("data-site-skill-list-submit"), true);
      assert.equal(body.get("_method"), "put");
      assert.equal(body.get("authenticity_token"), "fixture-csrf");
      finishNavigation = () => {
        saved = { name: body.get("user_list[name]"), description: body.get("user_list[description]"), isPrivate: body.getAll("user_list[private]").includes("1") };
        const card = ctx.document.querySelector("#profile-lists-container a");
        card.setAttribute("href", `/stars/example/lists/${saved.name.toLowerCase()}`);
        card.querySelector("h3").textContent = saved.name;
        documentReplaced = true;
      };
    });
    ctx.waitForElement = async selector => {
      assert.equal(selector, 'html:not([data-site-skill-list-submit])');
      ctx.document.documentElement.removeAttribute("data-site-skill-list-submit");
      finishNavigation();
    };
    const goto = ctx.gotoAndWait;
    ctx.gotoAndWait = async url => {
      assert.equal(documentReplaced, true, "navigation must not interrupt an in-flight submission");
      await goto(url);
    };
    const result = await editList(ctx, { url: editUrl, ...patch, confirm: true });
    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.deepEqual(saved, { name: "Old", description: "Before", isPrivate: true, ...patch });
    assert.equal(writes, 1);
    assert.deepEqual(ctx.visits, [editUrl, "https://github.com/example?tab=stars", result.url]);
  }
});

test("edit is idempotent, rejects duplicate names and never reports an unsaved change", async () => {
  const unchanged = browserContext(editPage, () => assert.fail("no fetch for unchanged metadata"), () => assert.fail("no unchanged write"));
  assert.equal((await editList(unchanged, { url: editUrl, name: "Old", confirm: true })).changed, false);
  const duplicate = browserContext(editPage, async () => response('<div id="profile-lists-container"><h3>Duplicate</h3></div>'), () => assert.fail("no duplicate write"));
  await assert.rejects(editList(duplicate, { url: editUrl, name: "Duplicate", confirm: true }), /already exists/);
  const unsaved = browserContext(editPage, async () => response(editPage), () => {});
  assert.equal((await editList(unsaved, { url: editUrl, description: "After", confirm: true })).reason, "list_edit_not_saved");
  const wrong = browserContext(editPage.replace('action="/stars/example/lists/old"', 'action="https://example.com/list"'));
  await assert.rejects(editList(wrong, { url: editUrl, name: "Old", confirm: true }), /unexpected action or method/);
});

test("confirmation and argument validation happen before navigation", async () => {
  const ctx = { async openOrReuseTab() { assert.fail("invalid write must not navigate"); } };
  for (const confirm of [undefined, false, "true"]) {
    await assert.rejects(addRepositoryToLists(ctx, { url: repoUrl, listNames: ["Target A"], confirm }), /confirm: true/);
    await assert.rejects(createList(ctx, { name: "New", confirm }), /confirm: true/);
    await assert.rejects(editList(ctx, { url: editUrl, name: "New", confirm }), /confirm: true/);
  }
  for (const listNames of [[], [""], [1], "Target A"]) await assert.rejects(addRepositoryToLists(ctx, { url: repoUrl, listNames, confirm: true }), /listNames/);
  for (const url of ["https://example.com/owner/repo", "https://github.com/owner/repo/issues", "https://user@github.com/owner/repo"]) {
    await assert.rejects(addRepositoryToLists(ctx, { url, listNames: ["Target A"], confirm: true }), /GitHub repository URL/);
  }
  for (const args of [{ name: "" }, { name: "x".repeat(33) }, { name: "New", description: "x".repeat(161) },
    { name: "New", description: null }, { name: "New", isPrivate: "yes" }, { name: "New", isPrivate: null }]) {
    await assert.rejects(createList(ctx, { ...args, confirm: true }));
    await assert.rejects(editList(ctx, { url: editUrl, ...args, confirm: true }));
  }
  await assert.rejects(editList(ctx, { url: editUrl, confirm: true }), /at least one/);
  await assert.rejects(editList(ctx, { url: repoUrl, name: "New", confirm: true }), /GitHub list URL/);
  await assert.rejects(getStarLists(ctx, { url: repoUrl }), /Profile Stars/);
});
