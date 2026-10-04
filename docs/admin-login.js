/**
 * Admin sign-in page. Mirrors login.js but requires the admin role.
 */
(function () {
    const API = window.SYNAPSE_API_URL;

    // Only admins are redirected away; a student session stays on this page.
    if (window.Auth.getToken() && window.Auth.getRole() === "admin") {
        window.location.replace("admin.html");
    }

    // Restored after a failed attempt; textContent wipes the inline icon.
    const SUBMIT_LABEL =
        'Access Admin Panel <svg class="icon" aria-hidden="true"><use href="#i-arrow"></use></svg>';

    document
        .getElementById("admin-login-form")
        .addEventListener("submit", async (event) => {
            event.preventDefault();

            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value;
            const submitBtn = document.getElementById("submit-btn");

            submitBtn.disabled = true;
            submitBtn.textContent = "Verifying...";

            try {
                const response = await fetch(`${API}/api/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password })
                });

                if (!response.ok) {
                    throw new Error(
                        await window.Auth.readError(response, "Login failed")
                    );
                }

                const data = await response.json();

                if (data.user.role !== "admin") {
                    throw new Error(
                        "Access denied. This account does not have admin privileges."
                    );
                }

                window.Auth.persistSession(data);

                window.Auth.showAlert("success", "Admin verified! Entering dashboard...");
                setTimeout(() => window.location.replace("admin.html"), 800);
            } catch (error) {
                window.Auth.showAlert("error", error.message);
                submitBtn.disabled = false;
                submitBtn.innerHTML = SUBMIT_LABEL;
            }
        });
})();