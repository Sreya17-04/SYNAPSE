/**
 * Unified sign-in page (students and admins share this form).
 * Requires config.js (SYNAPSE_API_URL) and auth-common.js (window.Auth)
 * to be loaded first.
 *
 * The backend accepts two shapes on the same endpoint: an email identifies
 * an admin, anything else is a university registration number (password is
 * the roll number for students). There is no registration flow anymore.
 */
(function () {
    const API = window.SYNAPSE_API_URL;

    window.Auth.redirectIfLoggedIn();

    // Restored after a failed attempt; textContent wipes the inline icon.
    const SUBMIT_LABEL =
        'Sign In <svg class="icon" aria-hidden="true"><use href="#i-arrow"></use></svg>';

    document
        .getElementById("login-form")
        .addEventListener("submit", async (event) => {
            event.preventDefault();

            const username = document.getElementById("username").value.trim();
            const password = document.getElementById("password").value;
            const submitBtn = document.getElementById("submit-btn");
            const credentials = username.includes("@")
                ? { email: username.toLowerCase(), password }
                : { username, password };

            submitBtn.disabled = true;
            submitBtn.textContent = "Signing in...";

            try {
                const response = await fetch(`${API}/api/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(credentials)
                });

                if (!response.ok) {
                    throw new Error(
                        await window.Auth.readError(response, "Login failed")
                    );
                }

                const data = await response.json();

                window.Auth.persistSession(data);

                window.Auth.showAlert("success", "Login successful! Redirecting...");

                // Admins land on the dashboard; students honour ?return= so a
                // shared post link survives sign-in.
                const target = data.user.role === "admin"
                    ? "admin.html"
                    : window.Auth.returnTarget("index.html");

                setTimeout(() => window.location.replace(target), 800);
            } catch (error) {
                window.Auth.showAlert("error", error.message);
                submitBtn.disabled = false;
                submitBtn.innerHTML = SUBMIT_LABEL;
            }
        });
})();