/**
 * Student registration page.
 * Requires config.js (SYNAPSE_API_URL) and auth-common.js (window.Auth).
 */
(function () {
    const API = window.SYNAPSE_API_URL;

    // A student session has no business on the register page.
    if (window.Auth.getToken() && window.Auth.getRole() === "student") {
        window.location.replace("index.html");
    }

    const passwordInput = document.getElementById("password");
    const meter = document.getElementById("pw-strength-bar");

    /**
     * Cheap client-side strength hint. The server enforces the real rule
     * (minimum 8 characters), so this only exists to guide the user.
     */
    if (passwordInput && meter) {
        passwordInput.addEventListener("input", () => {
            const value = passwordInput.value;
            let score = 0;

            if (value.length >= 8) score += 1;
            if (value.length >= 12) score += 1;
            if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
            if (/\d/.test(value)) score += 1;
            if (/[^A-Za-z0-9]/.test(value)) score += 1;

            const levels = [
                { width: "0%", color: "var(--danger)" },
                { width: "25%", color: "var(--danger)" },
                { width: "50%", color: "#f59e0b" },
                { width: "75%", color: "#f59e0b" },
                { width: "90%", color: "var(--success)" },
                { width: "100%", color: "var(--success)" }
            ];

            const level = levels[Math.min(score, 5)];
            meter.style.width = level.width;
            meter.style.background = level.color;
        });
    }

    document
        .getElementById("register-form")
        .addEventListener("submit", async (event) => {
            event.preventDefault();

            const name = document.getElementById("name").value.trim();
            const email = document.getElementById("email").value.trim();
            const password = passwordInput ? passwordInput.value : "";
            const submitBtn = document.getElementById("submit-btn");

            submitBtn.disabled = true;
            submitBtn.textContent = "Creating account...";

            try {
                const response = await fetch(`${API}/api/auth/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, email, password })
                });

                if (!response.ok) {
                    throw new Error(
                        await window.Auth.readError(response, "Registration failed")
                    );
                }

                window.Auth.showAlert(
                    "success",
                    "Account created! Redirecting to login..."
                );
                setTimeout(() => window.location.replace("login.html"), 1200);
            } catch (error) {
                window.Auth.showAlert("error", error.message);
                submitBtn.disabled = false;
                submitBtn.textContent = "Create Account";
            }
        });
})();