// Keeps GitHub Pages URLs tidy while still serving the existing .html files.
(function () {
  const HTML_ROUTES = new Set(["index", "login", "signup", "dashboard", "user", "delete"]);
  const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
  const DELETE_TOKEN_RE = /^[a-f0-9]{32}$/i;

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
    const parts = clean.split("/").filter(Boolean);
    const page = parts[parts.length - 1];
    const params = new URLSearchParams(window.location.search);
    const username = params.get("u");
    const deleteToken = params.get("token");

    if (page === "user" && USERNAME_RE.test(username || "")) {
      parts[parts.length - 1] = encodeURIComponent(username.toLowerCase());
      try {
        window.history.replaceState(null, "", `/${parts.join("/")}${window.location.hash}`);
      } catch (err) {
        // Some local file previews do not allow rewriting the address bar.
      }
      return;
    }

    if (page === "delete" && DELETE_TOKEN_RE.test(deleteToken || "")) {
      parts[parts.length - 1] = "d";
      parts.push(deleteToken.toLowerCase());
      try {
        window.history.replaceState(null, "", `/${parts.join("/")}${window.location.hash}`);
      } catch (err) {
        // Some local file previews do not allow rewriting the address bar.
      }
      return;
    }

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
    const previous = parts[parts.length - 2];

    if (previous === "d" && DELETE_TOKEN_RE.test(last || "")) {
      parts.pop();
      parts.pop();
    } else if (HTML_ROUTES.has(last) || (!clean.endsWith("/") && USERNAME_RE.test(last || ""))) {
      parts.pop();
    }

    return `/${parts.join("/")}${parts.length ? "/" : ""}`;
  }

  function pageUrl(pageName, query = "") {
    const page = pageName === "index" ? "" : pageName;
    return `${window.location.origin}${appBasePath()}${page}${query}`;
  }

  function publicUserUrl(username) {
    return `${window.location.origin}${appBasePath()}${encodeURIComponent(username)}`;
  }

  function deleteUrl(token) {
    return `${window.location.origin}${appBasePath()}d/${encodeURIComponent(token)}`;
  }

  window.ChithiUrl = {
    page: pageUrl,
    publicUser: publicUserUrl,
    delete: deleteUrl,
    path: (pageName) => pageUrl(pageName).replace(window.location.origin, "")
  };

  cleanCurrentUrl();
})();
