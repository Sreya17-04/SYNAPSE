// =====================================================
// SYNAPSE - shared runtime config
// Loaded before every other script on every page.
//
// GitHub Pages is static-only: it cannot run the Express/MongoDB backend.
// Set SYNAPSE_DEPLOYED_API_URL below to the URL of your hosted API (Render,
// Railway, Render-free, a VPS, ...) and every page served from GitHub Pages
// will talk to it. When the value is empty, or when the page is served by the
// backend itself (localhost / your own domain), the API base is derived from
// window.location.origin so it always matches the current origin.
//
// Per-device override (handy while the backend is still on your machine):
//   localStorage.setItem("synapse_api_url", "http://localhost:5000")
// =====================================================

// >>> SET THIS once your backend is deployed, e.g. "https://synapse-api.onrender.com"
const SYNAPSE_DEPLOYED_API_URL = "https://synapse-api-tc6p.onrender.com";

const SYNAPSE_API_URL = (() => {
    const trim = (url) => (url || "").trim().replace(/\/+$/, "");

    // 1. Explicit programmatic override (tests, tooling).
    if (window.SYNAPSE_API_OVERRIDE) {
        return trim(window.SYNAPSE_API_OVERRIDE);
    }

    // 2. Per-device override stored in localStorage.
    try {
        const stored = localStorage.getItem("synapse_api_url");
        if (stored) {
            return trim(stored);
        }
    } catch (error) {
        // localStorage unavailable (private mode, file://) - ignore.
    }

    const isHttp =
        window.location.protocol === "http:" ||
        window.location.protocol === "https:";

    // Opened straight off disk: window.location.origin is "null", so fall back
    // to the local dev server.
    if (!isHttp) {
        return "http://localhost:5000";
    }

    // 3. Hosted on GitHub Pages: the API lives on a different origin.
    const deployed = trim(SYNAPSE_DEPLOYED_API_URL);
    const onGitHubPages = /\.github\.io$/.test(window.location.hostname);

    if (deployed && onGitHubPages && deployed !== window.location.origin) {
        return deployed;
    }

    if (onGitHubPages && !deployed) {
        console.error(
            "[SYNAPSE] SYNAPSE_DEPLOYED_API_URL is empty, so this GitHub Pages " +
                "site is calling its own origin for the API (which cannot run " +
                "Express/MongoDB). Set it in docs/config.js to your hosted " +
                "backend URL, e.g. https://synapse-api.onrender.com"
        );
    }

    // 4. Served by the backend itself (or a same-origin proxy).
    return window.location.origin;
})();

// `const` at the top level creates a lexical global binding, NOT a property of
// window - so auth-common.js / login.js / admin-login.js, which
// read window.SYNAPSE_API_URL, would get undefined. Publish it explicitly.
window.SYNAPSE_API_URL = SYNAPSE_API_URL;
