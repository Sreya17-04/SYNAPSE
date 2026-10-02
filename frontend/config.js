// =====================================================
// SYNAPSE - shared runtime config
// Loaded before every other script on every page.
//
// The API base URL was previously hardcoded as "http://localhost:5000" in five
// separate files. That breaks as soon as the app is served from any other
// origin (a different PORT, a LAN IP, or GitHub Pages), because both the CORS
// allowlist and the CSP connect-src are origin-dependent.
//
// Deriving it from window.location keeps it correct in every case; the
// localhost fallback only applies when the page is opened straight off disk
// (file://), where window.location.origin is the string "null".
// =====================================================

const SYNAPSE_API_URL = (() => {
    const isHttp =
        window.location.protocol === "http:" ||
        window.location.protocol === "https:";

    return isHttp
        ? window.location.origin
        : "http://localhost:5000";
})();
