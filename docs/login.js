/**
 * Student sign-in page.
 * Requires config.js (SYNAPSE_API_URL) and auth-common.js (window.Auth)
 * to be loaded first.
 *
 * Students sign in with their university registration number as the username
 * and their roll number as the password; the server maps username to
 * universityRegNo. There is no registration flow anymore.
 */
(function () {
    const API = window.SYNAPSE_API_URL;

    window.Auth.redirectIfLoggedIn();

    document
        .getElementById("login-form")
        .addEventListener("submit", async (event) => {
            event.preventDefault();

            const username = document.getElementById("username").value.trim();
            const password = document.getElementById("password").value;
            const submitBtn = document.getElementById("submit-btn");

            submitBtn.disabled = true;
            submitBtn.textContent = "Signing in...";

            try {
                const response = await fetch(`${API}/api/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, password })
                });

                if (!response.ok) {
                    throw new Error(
                        await window.Auth.readError(response, "Login failed")
                    );
                }

                const data = await response.json();

                if (data.user.role === "admin") {
                    throw new Error(
                        "This is the student login. Please use the Admin Login."
                    );
                }

                window.Auth.persistSession(data);

                window.Auth.showAlert("success", "Login successful! Redirecting...");
                setTimeout(() => window.location.replace("index.html"), 800);
            } catch (error) {
                window.Auth.showAlert("error", error.message);
                submitBtn.disabled = false;
                submitBtn.textContent = "Sign In";
            }
        });
})();