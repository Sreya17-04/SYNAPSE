/**
 * Helpers shared by the student and admin login pages.
 *
 * Loaded as a classic script so the pages keep working without a bundler;
 * exposes a single global rather than repeating this logic per page.
 */
window.Auth = (function () {
    const TOKEN_KEY = "synapse_token";
    const ROLE_KEY = "synapse_role";
    const USER_KEY = "synapse_user";

    const apiUrl = () => window.SYNAPSE_API_URL;

    const getToken = () => localStorage.getItem(TOKEN_KEY);
    const getRole = () => localStorage.getItem(ROLE_KEY);

    function persistSession(data) {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(ROLE_KEY, data.user.role);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }

    /**
     * Only same-origin targets are safe to bounce back to after a sign-in.
     * Rejects URLs that leave the site (other origins, protocol-relative
     * "//host", "javascript:" values) - everything else is reduced to a
     * path the current origin can serve.
     */
    function safeReturnUrl(value) {
        if (typeof value !== "string" || !value.trim()) {
            return null;
        }

        try {
            const url = new URL(value.trim(), window.location.origin);

            if (url.origin !== window.location.origin) {
                return null;
            }

            return `${url.pathname}${url.search}${url.hash}`;
        } catch {
            return null;
        }
    }

    /** The validated ?return= target of the current page, or the default. */
    function returnTarget(defaultTarget) {
        const params = new URLSearchParams(window.location.search);

        return safeReturnUrl(params.get("return")) || defaultTarget;
    }

    /** Send an existing session to the page matching its role. */
    function redirectIfLoggedIn() {
        const token = getToken();
        const role = getRole();

        if (!token) {
            return;
        }

        // Students come back to the page they were sent from (a shared post
        // hash survives the trip through the login form). An admin always
        // lands on the dashboard.
        const target = role === "admin"
            ? "admin.html"
            : returnTarget("index.html");

        window.location.replace(target);
    }

    function clearSession() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ROLE_KEY);
        localStorage.removeItem(USER_KEY);
    }

    /**
     * Show a message in one of the two alert boxes on the page.
     * Uses .style.display, which CSP does not restrict (only inline style
     * attributes and <style> blocks are governed by style-src).
     */
    function showAlert(type, message) {
        const errorEl = document.getElementById("alert-error");
        const successEl = document.getElementById("alert-success");

        if (errorEl) {
            errorEl.style.display = "none";
        }

        if (successEl) {
            successEl.style.display = "none";
        }

        const target = type === "error" ? errorEl : successEl;

        if (!target) {
            return;
        }

        target.textContent = message;
        target.style.display = "block";
    }

    /**
     * Read a failed response without assuming the body is JSON - a proxy or
     * the rate limiter can return HTML or plain text.
     */
    async function readError(response, fallback) {
        try {
            const text = await response.text();
            const data = JSON.parse(text);
            return data.message || fallback;
        } catch {
            return fallback;
        }
    }

    return {
        apiUrl,
        getToken,
        getRole,
        persistSession,
        redirectIfLoggedIn,
        safeReturnUrl,
        returnTarget,
        clearSession,
        showAlert,
        readError
    };
})();