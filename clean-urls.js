// Keeps GitHub Pages URLs tidy while still serving the existing .html files.
(function () {
  const HTML_ROUTES = new Set(["index", "login", "signup", "dashboard", "user", "delete"]);

  function cleanPath(pathname) {
    if (pathname.endsWith("/index.html")) {
      return pathname.slice(0, -"index.html".length);
    }

    if (pathname.endsWith(".html")) {
      return pathname.slice(0, -".html".length);
    }

    return pathname;
  }

  function cleanCurrentUrl() {
    if (!window.history?.replaceState) return;

    const clean = cleanPath(window.location.pathname);
    if (clean !== window.location.pathname) {
      try {
        window.history.replaceState(null, "", clean + window.location.search + window.location.hash);
      } catch (err) {
        // Some local file previews do not allow rewriting the address bar.
      }
    }
  }

  function appBasePath() {
    const clean = cleanPath(window.location.pathname);
    const parts = clean.split("/").filter(Boolean);
    const last = parts[parts.length - 1];

    if (HTML_ROUTES.has(last)) {
      parts.pop();
    }

    return `/${parts.join("/")}${parts.length ? "/" : ""}`;
  }

  function pageUrl(pageName, query = "") {
    const page = pageName === "index" ? "" : pageName;
    return `${window.location.origin}${appBasePath()}${page}${query}`;
  }

  window.ChithiUrl = {
    page: pageUrl,
    path: (pageName) => pageUrl(pageName).replace(window.location.origin, "")
  };

  cleanCurrentUrl();
})();
