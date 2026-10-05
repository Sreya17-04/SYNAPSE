// =====================================================
// SYNAPSE - error page behaviour
// Only "Try again" on 500/503 uses this. Kept in an external
// file so the API's Content-Security-Policy (script-src 'self')
// allows it - the same rule the auth pages follow.
// =====================================================

document.querySelectorAll("[data-retry]").forEach((button) => {
    button.addEventListener("click", () => {
        window.location.reload();
    });
});
