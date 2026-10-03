/**
 * Helpers shared by the student and admin login/register pages.
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

    /** Send an existing session to the page matching its role. */
    function redirectIfLoggedIn() {
        const token = getToken();
        const role = getRole();

        if (!token) {
            return;
        }

        window.location.replace(role === "admin" ? "admin.html" : "index.html");
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
        clearSession,
        showAlert,
        readError
    };
})();