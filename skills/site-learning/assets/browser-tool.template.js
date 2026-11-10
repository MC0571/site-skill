async function (args) {
  const clean = (value) =>
    (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

  const root =
    document.querySelector("#content") ||
    document.querySelector("main") ||
    document.querySelector("article");

  if (!root) {
    return {
      ok: false,
      reason: "content_not_found",
      url: location.href,
      title: clean(document.title),
    };
  }

  return {
    ok: true,
    url: location.href,
    title: clean(document.title),
    contentText: clean(root.innerText || root.textContent),
  };
}
