import { test } from "node:test";
import assert from "node:assert/strict";
import { getStarsApi } from "../skills/site-skill/assets/learnings/github-stars/tools/get-stars-api.js";

function star(id, name, starredAt, overrides = {}) {
  return {
    starred_at: starredAt,
    repo: {
      id,
      node_id: `R_kgDOFixture${id}`,
      full_name: name,
      html_url: `https://github.com/${name}`,
      description: `${name} description`,
      language: "JavaScript",
      stargazers_count: 1234,
      forks_count: 56,
      ...overrides,
    },
  };
}

function response(body, { status = 200, link = "" } = {}) {
  const headers = new Headers();
  if (link) headers.set("link", link);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    async json() { return typeof body === "string" ? JSON.parse(body) : body; },
  };
}

test("REST pagination follows the real Link route and maps star timestamps and display counts", async (t) => {
  const calls = [];
  const firstUrl = "https://api.github.com/users/fixture-user/starred?per_page=100&sort=created&direction=desc";
  const secondUrl = "https://api.github.com/user/4242/starred?per_page=100&sort=created&direction=desc&page=2";
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      return response([star(1001, "fixture-org/first", "2026-11-12T10:11:12Z")], {
        link: `<${secondUrl}>; rel="next", <${secondUrl}>; rel="last"`,
      });
    }
    return response([star(1002, "fixture-org/second", "2026-11-10T09:08:07Z", {
      description: null,
      language: null,
      stargazers_count: 0,
      forks_count: 7,
    })]);
  });

  const result = await getStarsApi(undefined, { username: "fixture-user" });

  assert.deepEqual(calls.map(call => call.url), [firstUrl, secondUrl]);
  assert.deepEqual(calls[0].options.headers, {
    Accept: "application/vnd.github.star+json",
    "X-GitHub-Api-Version": "2026-03-10",
  });
  assert.deepEqual(result, {
    ok: true,
    scope: "all_pages",
    access: "public",
    items: [
      {
        type: "repository", id: 1001, nodeId: "R_kgDOFixture1001", name: "fixture-org/first",
        url: "https://github.com/fixture-org/first", description: "fixture-org/first description",
        language: "JavaScript", stars: "1234", forks: "56", starredAt: "2026-11-12T10:11:12Z",
      },
      {
        type: "repository", id: 1002, nodeId: "R_kgDOFixture1002", name: "fixture-org/second",
        url: "https://github.com/fixture-org/second", description: "",
        language: "", stars: "0", forks: "7", starredAt: "2026-11-10T09:08:07Z",
      },
    ],
    itemCount: 2,
    totalLoaded: 2,
    pagesRead: 2,
    truncated: false,
    complete: true,
    stopReason: "end",
    nextUrl: "",
  });
});

test("maxItems truncation returns the current page when a page is only partly used", async (t) => {
  const firstUrl = "https://api.github.com/users/fixture-user/starred?per_page=100&sort=updated&direction=asc";
  const secondUrl = "https://api.github.com/users/fixture-user/starred?per_page=100&sort=updated&direction=asc&page=2";
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return response([
      star(1, "fixture-org/one", "2026-01-01T00:00:00Z"),
      star(2, "fixture-org/two", "2026-01-02T00:00:00Z"),
      star(3, "fixture-org/three", "2026-01-03T00:00:00Z"),
    ], { link: `<${secondUrl}>; rel="next"` });
  });

  const result = await getStarsApi(undefined, {
    username: "fixture-user", sort: "updated", direction: "asc", maxItems: 2,
  });

  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.itemCount, 2);
  assert.equal(result.totalLoaded, 3);
  assert.equal(result.pagesRead, 1);
  assert.equal(result.complete, false);
  assert.equal(result.truncated, true);
  assert.equal(result.stopReason, "max_items");
  assert.equal(result.nextUrl, firstUrl);
});

test("HTTP failure preserves read items and does not retry", async (t) => {
  const secondUrl = "https://api.github.com/users/fixture-user/starred?per_page=100&sort=created&direction=desc&page=2";
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    if (calls === 1) return response([star(1, "fixture-org/kept", "2026-02-03T04:05:06Z")], {
      link: `<${secondUrl}>; rel="next"`,
    });
    return response({ message: "rate limited" }, { status: 403 });
  });

  const result = await getStarsApi(undefined, { username: "fixture-user" });

  assert.equal(calls, 2);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "http_error");
  assert.equal(result.status, 403);
  assert.equal(result.itemCount, 1);
  assert.equal(result.totalLoaded, 1);
  assert.equal(result.pagesRead, 1);
  assert.equal(result.complete, false);
  assert.equal(result.truncated, true);
  assert.equal(result.stopReason, "blocked");
  assert.equal(result.nextUrl, secondUrl);
  assert.equal(result.items[0].name, "fixture-org/kept");
});

test("authenticated mode requires GITHUB_TOKEN, sends it only on Authorization and never returns it", async (t) => {
  const token = "fixture-token-never-return";
  t.after(() => delete process.env.GITHUB_TOKEN);
  let calls = 0;
  let headers;
  process.env.GITHUB_TOKEN = token;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls += 1;
    headers = options.headers;
    return response([]);
  });

  const publicResult = await getStarsApi(undefined, { username: "fixture-user" });
  assert.equal(publicResult.access, "public");
  assert.equal(headers.Authorization, undefined);
  assert.equal(calls, 1);

  delete process.env.GITHUB_TOKEN;
  await assert.rejects(
    getStarsApi(undefined, { username: "fixture-user", authenticated: true }),
    /authenticated: true requires process\.env\.GITHUB_TOKEN/,
  );
  assert.equal(calls, 1);

  process.env.GITHUB_TOKEN = token;
  const result = await getStarsApi(undefined, { username: "fixture-user", authenticated: true });

  assert.equal(result.access, "token_visible");
  assert.equal(headers.Authorization, `Bearer ${token}`);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("invalid arguments are rejected before any request", async (t) => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("invalid arguments must not fetch"));

  for (const username of [undefined, null, "", " fixture-user", 42]) {
    await assert.rejects(getStarsApi(undefined, { username }), /username/);
  }
  for (const sort of ["stars", null]) {
    await assert.rejects(getStarsApi(undefined, { username: "fixture-user", sort }), /sort/);
  }
  for (const direction of ["sideways", null]) {
    await assert.rejects(getStarsApi(undefined, { username: "fixture-user", direction }), /direction/);
  }
  for (const maxItems of [0, -1, 1.5, "2", null, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(getStarsApi(undefined, { username: "fixture-user", maxItems }), /maxItems/);
  }
  for (const authenticated of ["true", 1, null]) {
    await assert.rejects(getStarsApi(undefined, { username: "fixture-user", authenticated }), /authenticated/);
  }
});

test("invalid next links and malformed JSON fail explicitly without losing the current page", async (t) => {
  const firstUrl = "https://api.github.com/users/fixture-user/starred?per_page=100&sort=created&direction=desc";
  const responses = [
    response([star(1, "fixture-org/kept", "2026-03-04T05:06:07Z")], {
      link: '<https://api.github.com/users/another-user/starred?page=2>; rel="next"',
    }),
    response("{"),
  ];
  t.mock.method(globalThis, "fetch", async () => responses.shift());

  const invalidLink = await getStarsApi(undefined, { username: "fixture-user" });
  assert.equal(invalidLink.ok, false);
  assert.equal(invalidLink.reason, "invalid_link");
  assert.equal(invalidLink.status, 200);
  assert.equal(invalidLink.itemCount, 1);
  assert.equal(invalidLink.pagesRead, 1);
  assert.equal(invalidLink.stopReason, "blocked");
  assert.equal(invalidLink.nextUrl, firstUrl);

  const invalidJson = await getStarsApi(undefined, { username: "fixture-user" });
  assert.equal(invalidJson.ok, false);
  assert.equal(invalidJson.reason, "invalid_json");
  assert.equal(invalidJson.status, 200);
  assert.equal(invalidJson.itemCount, 0);
  assert.equal(invalidJson.pagesRead, 0);
  assert.equal(invalidJson.stopReason, "blocked");
  assert.equal(invalidJson.nextUrl, firstUrl);
});

test("default-media arrays are rejected and invalid Link results still respect maxItems", async (t) => {
  const responses = [response([{ id: 1, full_name: "fixture-org/bare-repository" }]),
    response([star(1, "fixture-org/one", "2026-01-01T00:00:00Z"), star(2, "fixture-org/two", "2026-01-02T00:00:00Z")], {
      link: '<https://example.com/starred?page=2>; rel="next"',
    })];
  t.mock.method(globalThis, "fetch", async () => responses.shift());
  assert.equal((await getStarsApi(undefined, { username: "fixture-user" })).reason, "invalid_response");
  const capped = await getStarsApi(undefined, { username: "fixture-user", maxItems: 1 });
  assert.equal(capped.reason, "invalid_link");
  assert.equal(capped.itemCount, 1);
  assert.equal(capped.totalLoaded, 2);
});
