// =====================================================
// SYNAPSE - ADMIN DASHBOARD
// admin.js
// Matched specifically to admin.html
// =====================================================

// SYNAPSE_API_URL comes from config.js, loaded just before this file.
const API = SYNAPSE_API_URL;

// =====================================================
// AUTH
// =====================================================

let token = localStorage.getItem("synapse_token");
const userRole = localStorage.getItem("synapse_role");

let adminUser = null;

try {
    adminUser = JSON.parse(
        localStorage.getItem("synapse_user") || "null"
    );
} catch (error) {
    adminUser = null;
}

// Redirect if not logged in
if (!token || !adminUser) {
    window.location.replace("admin-login.html");
    throw new Error("Admin authentication required.");
}

// Redirect non-admin users
if (userRole !== "admin" || adminUser.role !== "admin") {
    window.location.replace("login.html");
    throw new Error("Admin access required.");
}

// =====================================================
// DOM READY
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
    initAdminDashboard();
});

// =====================================================
// AUTHENTICATED FETCH
// =====================================================

// A 401 here means the token expired or was revoked by a logout elsewhere.
// Clear the local session and bounce to the admin login in one place.
async function adminFetch(url, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        localStorage.removeItem("synapse_token");
        localStorage.removeItem("synapse_role");
        localStorage.removeItem("synapse_user");

        window.location.replace("admin-login.html");

        throw new Error("Session expired. Please log in again.");
    }

    return response;
}

// Reads a JSON error message without assuming the body is JSON; a non-JSON
// 5xx body makes response.json() throw and hides the real status.
async function readError(response, fallback) {
    try {
        const text = await response.text();

        if (!text) {
            return fallback;
        }

        try {
            const data = JSON.parse(text);

            return data.message || fallback;
        } catch {
            return fallback;
        }
    } catch {
        return fallback;
    }
}

// 401 is already handled globally inside adminFetch. A 403 means the account
// is no longer an admin, which that path cannot infer, so handle it here and
// share the cleanup with it.
function handleAdminAuthFailure() {
    localStorage.removeItem("synapse_token");
    localStorage.removeItem("synapse_role");
    localStorage.removeItem("synapse_user");

    window.location.replace("admin-login.html");
}

// =====================================================
// STATUS BADGE
// =====================================================

// post.status comes straight from the database and was interpolated raw into
// both a class attribute and a text node. The Mongoose enum currently limits
// it, but a whitelist is the only thing that makes this safe by construction
// rather than by convention.
const VALID_STATUSES = ["active", "flagged", "approved"];

function statusBadge(status) {
    const safe =
        VALID_STATUSES.includes(status)
            ? status
            : "active";

    return `<span class="badge-status ${safe}">
                        ${escapeHTML(safe.toUpperCase())}
                    </span>`;
}

// =====================================================
// PAGINATED ADMIN LIST FETCHER
// =====================================================

const ADMIN_PAGE_SIZE = 200;

// The admin list endpoints are paginated server-side so one request cannot
// dump the whole collection. The moderation UI filters and renders the full
// set client-side, so walk every page here rather than silently moderating
// only the first page.
async function fetchAllPages(url, key) {
    const collected = [];
    let page = 1;
    let total = Infinity;

    while (collected.length < total && page <= 25) {
        const separator = url.includes("?") ? "&" : "?";

        const response = await adminFetch(
            `${url}${separator}page=${page}&limit=${ADMIN_PAGE_SIZE}`
        );

        if (!response.ok) {
            throw new Error(
                await readError(
                    response,
                    `Request failed: ${response.status}`
                )
            );
        }

        const data = await response.json();
        const items = Array.isArray(data)
            ? data
            : (data[key] || []);

        collected.push(...items);

        total = Number.isFinite(data.total)
            ? data.total
            : collected.length;

        if (items.length === 0) {
            break;
        }

        page += 1;
    }

    if (collected.length < total) {
        showToast(
            `Showing the first ${collected.length} of ${total} records.`,
            "info"
        );
    }

    return collected;
}

// =====================================================
// ELEMENT HELPERS
// =====================================================

// Shared by both modals so keyboard focus can be cycled inside a dialog.
const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The control that opened the post-preview dialog, so focus can be handed
// back to it on close.
let adminModalOpener = null;

function get(id) {
    return document.getElementById(id);
}

// =====================================================
// HTML SAFETY
// =====================================================

function escapeHTML(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// =====================================================
// INITIALS
// =====================================================

function getInitials(name) {
    if (!name) {
        return "A";
    }

    const parts = name.trim().split(/\s+/);

    if (parts.length >= 2) {
        return (
            parts[0].charAt(0) +
            parts[1].charAt(0)
        ).toUpperCase();
    }

    return name.substring(0, 2).toUpperCase();
}

// =====================================================
// TOAST
// =====================================================

function showToast(message, type = "info") {
    const container = get("toast-container");

    if (!container) {
        console.log(message);
        return;
    }

    const icons = {
        success: "✅",
        error: "⚠️",
        info: "ℹ️"
    };

    const toast = document.createElement("div");

    toast.className = `toast ${type}`;

    toast.innerHTML = `
        <span>${icons[type] || "ℹ️"}</span>
        <div>${escapeHTML(message)}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";

        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// =====================================================
// THEME
// =====================================================

function initTheme() {
    const savedTheme =
        localStorage.getItem("synapse_theme") || "light";

    const icon = get("theme-icon");

    if (savedTheme === "dark") {
        document.body.classList.add("dark-mode");

        if (icon) {
            icon.textContent = "☀️";
        }
    } else {
        document.body.classList.remove("dark-mode");

        if (icon) {
            icon.textContent = "🌙";
        }
    }
}

function setupThemeToggle() {
    const button = get("theme-toggle");

    if (!button) {
        return;
    }

    button.addEventListener("click", () => {
        const isDark =
            document.body.classList.contains("dark-mode");

        if (isDark) {
            document.body.classList.remove("dark-mode");
            localStorage.setItem(
                "synapse_theme",
                "light"
            );

            const icon = get("theme-icon");

            if (icon) {
                icon.textContent = "🌙";
            }
        } else {
            document.body.classList.add("dark-mode");
            localStorage.setItem(
                "synapse_theme",
                "dark"
            );

            const icon = get("theme-icon");

            if (icon) {
                icon.textContent = "☀️";
            }
        }
    });
}

// =====================================================
// ADMIN PROFILE
// =====================================================

function setupAdminProfile() {
    const nameElement = get("admin-name");
    const emailElement = get("admin-email");
    const initialsElement = get("admin-initials");

    if (nameElement) {
        nameElement.textContent =
            adminUser.name || "Admin";
    }

    if (emailElement) {
        emailElement.textContent =
            adminUser.email || "admin@synapse.edu";
    }

    if (initialsElement) {
        initialsElement.textContent =
            getInitials(adminUser.name);
    }
}

// =====================================================
// PROFILE DROPDOWN
// =====================================================

function setupProfileDropdown() {
    const profileButton =
        get("admin-profile-btn");

    const dropdown =
        get("admin-dropdown");

    if (!profileButton || !dropdown) {
        return;
    }

    profileButton.addEventListener(
        "click",
        (event) => {
            event.stopPropagation();

            dropdown.classList.toggle("show");
        }
    );

    document.addEventListener(
        "click",
        (event) => {

            if (
                !dropdown.contains(event.target) &&
                event.target !== profileButton
            ) {
                dropdown.classList.remove("show");
            }

        }
    );
}

// =====================================================
// LOGOUT
// =====================================================

function setupLogout() {
    const logoutButton =
        get("admin-logout-btn");

    if (!logoutButton) {
        return;
    }

    logoutButton.addEventListener(
        "click",
        async () => {

            try {
                // Retire the token server-side so a copy that escapes this
                // tab cannot be replayed until it expires.
                await fetch(`${API}/api/auth/logout`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
            } catch {
                // Never trap the admin in a stale session.
            }

            localStorage.removeItem(
                "synapse_token"
            );

            localStorage.removeItem(
                "synapse_role"
            );

            localStorage.removeItem(
                "synapse_user"
            );

            window.location.replace(
                "admin-login.html"
            );
        }
    );
}

// =====================================================
// BACK TO COMMUNITY
// =====================================================

// The "← Back to Community" link is a plain <a href="index.html">, so the
// browser handles navigation. The only thing worth doing in JS is closing
// the profile dropdown, which would otherwise stay open under the new page
// during the transition.
function setupBackToCommunity() {
    const links =
        document.querySelectorAll(
            'a[href="index.html"]'
        );

    links.forEach((link) => {
        link.addEventListener("click", () => {
            get("admin-dropdown")
                ?.classList.remove("show");
        });
    });
}

// =====================================================
// TAB NAVIGATION
// =====================================================

let currentTab = "dashboard";

function setupTabs() {

    const tabButtons =
        document.querySelectorAll(
            ".admin-nav-item[data-tab]"
        );

    const panels =
        document.querySelectorAll(
            ".admin-panel"
        );

    if (!tabButtons.length) {
        return;
    }

    tabButtons.forEach((button) => {

        const activateTab = () => {

            const tab =
                button.dataset.tab;

            currentTab = tab;

            // Remove active + selection state from all buttons
            tabButtons.forEach((btn) => {
                btn.classList.remove("active");
                btn.setAttribute(
                    "aria-selected",
                    "false"
                );
                btn.setAttribute("tabindex", "-1");
            });

            // Activate selected button
            button.classList.add("active");

            button.setAttribute(
                "aria-selected",
                "true"
            );

            button.setAttribute("tabindex", "0");

            // Hide all panels
            panels.forEach((panel) => {

                panel.style.display = "none";
                panel.classList.remove(
                    "active-panel"
                );

                panel.setAttribute("hidden", "");
            });

            // Show selected panel
            const selectedPanel =
                get(`panel-${tab}`);

            if (selectedPanel) {

                selectedPanel.style.display =
                    "block";

                selectedPanel.classList.add(
                    "active-panel"
                );

                selectedPanel.removeAttribute("hidden");
            }

                // Render current content
                if (tab === "dashboard") {
                    renderDashboardPreview();
                }

                if (tab === "posts") {
                    renderPostsTable(
                        get("posts-search")?.value || ""
                    );
                }

                if (tab === "announcements") {
                    renderAnnouncementsTable();
                }

                if (tab === "users") {
                    renderUsersTable(
                        get("users-search")?.value || ""
                    );
                }

                if (tab === "flagged") {
                    renderFlaggedTable();
                }
        };

        button.addEventListener("click", activateTab);

        // Roving tabindex: arrow keys move between tabs, per the WAI-ARIA
        // tabs pattern.
        button.addEventListener("keydown", (event) => {
            const index =
                [...tabButtons].indexOf(button);

            let nextIndex = null;

            if (event.key === "ArrowRight") {
                nextIndex = (index + 1) % tabButtons.length;
            } else if (event.key === "ArrowLeft") {
                nextIndex =
                    (index - 1 + tabButtons.length) %
                    tabButtons.length;
            } else if (event.key === "Home") {
                nextIndex = 0;
            } else if (event.key === "End") {
                nextIndex = tabButtons.length - 1;
            }

            if (nextIndex === null) {
                return;
            }

            event.preventDefault();

            const nextButton = tabButtons[nextIndex];

            nextButton.focus();
            nextButton.click();
        });
    });
}

// =====================================================
// GLOBAL DATA
// =====================================================

let allAdminPosts = [];
let allUsers = [];
let allAnnouncements = [];

// =====================================================
// FETCH DASHBOARD STATS
// =====================================================

async function fetchStats() {

    try {

        const response =
            await adminFetch(
                `${API}/api/admin/stats`
            );

        if (
            response.status === 401 ||
            response.status === 403
        ) {

            showToast(
                "Admin session expired.",
                "error"
            );

            setTimeout(() => {
                handleAdminAuthFailure();
            }, 800);

            return;
        }

        if (!response.ok) {
            throw new Error(
                `Stats request failed: ${response.status}`
            );
        }

        const data =
            await response.json();

        const totalUsers =
            get("stat-total-users");

        const totalPosts =
            get("stat-total-posts");

        const pendingReports =
            get("stat-pending-reports");

        const activeDiscussions =
            get("stat-active");

        const flaggedCount =
            get("flagged-count");

        if (totalUsers) {
            totalUsers.textContent =
                data.totalUsers ?? 0;
        }

        if (totalPosts) {
            totalPosts.textContent =
                data.totalPosts ?? 0;
        }

        if (pendingReports) {
            pendingReports.textContent =
                data.pendingReports ?? 0;
        }

        if (activeDiscussions) {
            activeDiscussions.textContent =
                data.activeDiscussions ?? 0;
        }

        if (flaggedCount) {
            flaggedCount.textContent =
                data.pendingReports ?? 0;
        }

    } catch (error) {

        console.error(
            "Stats error:",
            error
        );

        showToast(
            "Could not load dashboard statistics.",
            "error"
        );
    }
}

// =====================================================
// FETCH POSTS
// =====================================================

async function fetchAdminPosts() {

    try {

        const response =
            await adminFetch(
                `${API}/api/admin/posts`
            );

        if (response.status === 403) {
            handleAdminAuthFailure();
            return;
        }

        if (!response.ok) {
            throw new Error(
                `Posts request failed: ${response.status}`
            );
        }

        const data =
            await fetchAllPages(
                `${API}/api/admin/posts`,
                "posts"
            );

        allAdminPosts = data;

        renderDashboardPreview();
        renderPostsTable(
            get("posts-search")?.value || ""
        );
        renderFlaggedTable();

    } catch (error) {

        console.error(
            "Posts error:",
            error
        );

        const tbody =
            get("posts-tbody");

        if (tbody) {

            tbody.innerHTML = `
                <tr>
                    <td colspan="8"
                        class="table-empty-error">
                        Failed to load posts.
                    </td>
                </tr>
            `;
        }

        showToast(
            "Could not load posts.",
            "error"
        );
    }
}

// =====================================================
// FETCH USERS
// =====================================================

async function fetchUsers() {

    try {

        const response =
            await adminFetch(
                `${API}/api/admin/users`
            );

        if (response.status === 403) {
            handleAdminAuthFailure();
            return;
        }

        if (!response.ok) {
            throw new Error(
                `Users request failed: ${response.status}`
            );
        }

        const data =
            await fetchAllPages(
                `${API}/api/admin/users`,
                "users"
            );

        allUsers = data;

        renderUsersTable(
            get("users-search")?.value || ""
        );

    } catch (error) {

        console.error(
            "Users error:",
            error
        );

        showToast(
            "Could not load users.",
            "error"
        );
    }
}

// =====================================================
// FETCH ANNOUNCEMENTS
// =====================================================

async function fetchAnnouncements() {
    try {
        const response = await adminFetch(
            `${API}/api/admin/announcements`
        );

        if (response.status === 403) {
            handleAdminAuthFailure();
            return;
        }

        if (!response.ok) {
            throw new Error(
                `Announcements request failed: ${response.status}`
            );
        }

        const data = await response.json();
        allAnnouncements = Array.isArray(data) ? data : [];
        renderAnnouncementsTable();
    } catch (error) {
        console.error("Announcements error:", error);
        showToast("Could not load announcements.", "error");
    }
}

function renderAnnouncementsTable() {
    const tbody = get("announcements-tbody");

    if (!tbody) return;

    if (allAnnouncements.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="table-empty">
                    No announcements yet.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = allAnnouncements.map(announcement => {
        const date = announcement.createdAt
            ? new Date(announcement.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric"
            })
            : "—";

        return `
            <tr>
                <td><strong>${escapeHTML(announcement.title)}</strong></td>
                <td>${escapeHTML(announcement.message)}</td>
                <td>${date}</td>
                <td>
                    <button class="btn-table-action btn-delete" data-announcement-id="${announcement._id}" type="button">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    tbody.querySelectorAll("[data-announcement-id]").forEach(button => {
        button.addEventListener("click", async () => {
            if (!window.confirm("Delete this announcement?")) return;

            try {
                const response = await adminFetch(
                    `${API}/api/admin/announcements/${button.dataset.announcementId}`,
                    { method: "DELETE" }
                );

                // Read the body defensively: a 500 from a crash or proxy may
                // not be JSON, and response.json() would then throw and mask
                // the real failure.
                if (!response.ok) {
                    throw new Error(
                        await readError(
                            response,
                            "Failed to delete announcement."
                        )
                    );
                }

                const data = await response.json();

                showToast(
                    data.message ||
                    "Announcement deleted.",
                    "success"
                );

                await fetchAnnouncements();
            } catch (error) {
                console.error("Announcement delete error:", error);
                showToast(error.message, "error");
            }
        });
    });
}

function setupAnnouncementForm() {
    const form = get("announcement-form");

    if (!form) return;

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const titleInput = get("announcement-title");
        const messageInput = get("announcement-message");
        const submitButton = form.querySelector("button[type='submit']");

        submitButton.disabled = true;

        try {
            const response = await adminFetch(
                `${API}/api/admin/announcements`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        title: titleInput.value.trim(),
                        message: messageInput.value.trim()
                    })
                }
            );

            if (!response.ok) {
                throw new Error(
                    await readError(
                        response,
                        "Failed to create announcement."
                    )
                );
            }

            const data = await response.json();

            form.reset();
            showToast("Announcement published.", "success");
            await fetchAnnouncements();
        } catch (error) {
            console.error("Announcement create error:", error);
            showToast(error.message, "error");
        } finally {
            submitButton.disabled = false;
        }
    });
}

// =====================================================
// DASHBOARD PREVIEW
// =====================================================

function renderDashboardPreview() {

    const container =
        get("dashboard-posts-preview");

    if (!container) {
        return;
    }

    const recentPosts =
        [...allAdminPosts]
            .sort(
                (a, b) =>
                    new Date(b.createdAt) -
                    new Date(a.createdAt)
            )
            .slice(0, 5);

    if (recentPosts.length === 0) {

        container.innerHTML = `
            <p class="muted-note">
                No posts yet.
            </p>
        `;

        return;
    }

    container.innerHTML = `
        <div class="table-scroll">
            <table class="admin-table">

                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Author</th>
                        <th>Category</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>

                <tbody>

                    ${recentPosts.map((post) => {

        const status =
            post.status || "active";

        return `
                            <tr>

                                <td>
                                    <strong>
                                        ${escapeHTML(
            post.title
        )}
                                    </strong>
                                </td>

                                <td>
                                    ${escapeHTML(
            post.author
        )}
                                </td>

                                <td>
                                    ${escapeHTML(
            post.category
        )}
                                </td>

                                <td>
                                    ${statusBadge(status)}
                                </td>

                                <td>

                                    <button
                                        class="btn-table-action btn-view"
                                        data-id="${post._id}"
                                        type="button">
                                        View
                                    </button>

                                    <button
                                        class="btn-table-action btn-delete"
                                        data-id="${post._id}"
                                        type="button">
                                        Delete
                                    </button>

                                </td>

                            </tr>
                        `;

    }).join("")}

                </tbody>

            </table>
        </div>
    `;

    attachTableActions(container);
}

// =====================================================
// POSTS TABLE
// =====================================================

function renderPostsTable(searchTerm = "") {

    const tbody =
        get("posts-tbody");

    if (!tbody) {
        return;
    }

    const query =
        searchTerm
            .toLowerCase()
            .trim();

    let posts =
        [...allAdminPosts];

    if (query) {

        posts =
            posts.filter((post) => {

                return (
                    (post.title || "")
                        .toLowerCase()
                        .includes(query) ||

                    (post.author || "")
                        .toLowerCase()
                        .includes(query) ||

                    (post.category || "")
                        .toLowerCase()
                        .includes(query)
                );

            });
    }

    if (posts.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="8"
                    class="table-empty">
                    No posts found.
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML =
        posts.map((post) => {

            const status =
                post.status || "active";

            const date =
                post.createdAt
                    ? new Date(
                        post.createdAt
                    ).toLocaleDateString(
                        "en-IN",
                        {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                        }
                    )
                    : "—";

            return `
                <tr>

                    <td>
                        <strong>
                            ${escapeHTML(post.title)}
                        </strong>
                    </td>

                    <td>
                        ${escapeHTML(post.author)}
                    </td>

                    <td>
                        ${escapeHTML(post.category)}
                    </td>

                    <td>
                        ${post.likes || 0}
                    </td>

                    <td>
                        ${(post.comments || []).length}
                    </td>

                    <td>
                        ${statusBadge(status)}
                    </td>

                    <td>
                        ${date}
                    </td>

                    <td>

                        <button
                            class="btn-table-action btn-view"
                            data-id="${post._id}"
                            type="button">
                            View
                        </button>

                        <button
                            class="btn-table-action btn-approve"
                            data-id="${post._id}"
                            type="button">
                            Approve
                        </button>

                        <button
                            class="btn-table-action btn-flag"
                            data-id="${post._id}"
                            type="button">
                            Flag
                        </button>

                        <button
                            class="btn-table-action btn-delete"
                            data-id="${post._id}"
                            type="button">
                            Delete
                        </button>

                    </td>

                </tr>
            `;

        }).join("");

    attachTableActions(tbody);
}

// =====================================================
// USERS TABLE
// =====================================================

function renderUsersTable(searchTerm = "") {

    const tbody =
        get("users-tbody");

    if (!tbody) {
        return;
    }

    const query =
        searchTerm
            .toLowerCase()
            .trim();

    let users =
        allUsers.filter(
            user =>
                user.role !== "admin"
        );

    if (query) {

        users =
            users.filter((user) => {

                return (
                    (user.name || "")
                        .toLowerCase()
                        .includes(query) ||

                    (user.email || "")
                        .toLowerCase()
                        .includes(query)
                );

            });
    }

    if (users.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="6"
                    class="table-empty">
                    No students found.
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML =
        users.map((user) => {

            const date =
                user.createdAt
                    ? new Date(
                        user.createdAt
                    ).toLocaleDateString(
                        "en-IN",
                        {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                        }
                    )
                    : "—";

            const flagged =
                user.isFlagged === true;

            return `
                <tr>

                    <td>
                        <strong>
                            ${escapeHTML(user.name)}
                        </strong>
                    </td>

                    <td>
                        ${escapeHTML(user.email)}
                    </td>

                    <td>
                        Student
                    </td>

                    <td>
                        ${date}
                    </td>

                    <td>

                        <span class="badge-status ${flagged
                    ? "flagged"
                    : "approved"
                }">

                            ${flagged
                    ? "FLAGGED"
                    : "ACTIVE"
                }

                        </span>

                    </td>

                    <td>

                        <button
                            class="btn-table-action ${flagged
                    ? "btn-approve"
                    : "btn-flag"
                }"
                            data-user-id="${user._id}"
                            type="button">

                            ${flagged
                    ? "Unflag"
                    : "Flag"
                }

                        </button>

                    </td>

                </tr>
            `;

        }).join("");

    tbody
        .querySelectorAll("[data-user-id]")
        .forEach((button) => {

            button.addEventListener(
                "click",
                async () => {

                    await toggleUserFlag(
                        button.dataset.userId
                    );

                }
            );

        });
}

// =====================================================
// TOGGLE USER FLAG
// =====================================================

async function toggleUserFlag(userId) {

    try {

        const response =
            await adminFetch(
                `${API}/api/admin/users/${userId}/flag`,
                {
                    method: "PATCH"
                }
            );

        if (!response.ok) {
            throw new Error(
                "Failed to update user"
            );
        }

        const data =
            await response.json();

        showToast(
            data.message ||
            "User status updated.",
            "success"
        );

        await fetchUsers();

    } catch (error) {

        console.error(
            "User flag error:",
            error
        );

        showToast(
            "Failed to update user.",
            "error"
        );
    }
}

// =====================================================
// FLAGGED POSTS
// =====================================================

function renderFlaggedTable() {

    const tbody =
        get("flagged-tbody");

    if (!tbody) {
        return;
    }

    const flaggedPosts =
        allAdminPosts.filter(
            post =>
                post.status === "flagged"
        );

    if (flaggedPosts.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="4"
                    class="table-empty">
                    No flagged posts. Community looks clean! ✅
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML =
        flaggedPosts.map((post) => {

            return `
                <tr>

                    <td>
                        <strong>
                            ${escapeHTML(post.title)}
                        </strong>
                    </td>

                    <td>
                        ${escapeHTML(post.author)}
                    </td>

                    <td>
                        ${escapeHTML(post.category)}
                    </td>

                    <td>

                        <button
                            class="btn-table-action btn-approve"
                            data-id="${post._id}"
                            type="button">
                            Approve
                        </button>

                        <button
                            class="btn-table-action btn-delete"
                            data-id="${post._id}"
                            type="button">
                            Delete
                        </button>

                    </td>

                </tr>
            `;

        }).join("");

    attachTableActions(tbody);
}

// =====================================================
// TABLE ACTIONS
// =====================================================

function attachTableActions(container) {

    // VIEW
    container
        .querySelectorAll(".btn-view")
        .forEach((button) => {

            button.addEventListener(
                "click",
                () => {

                    const post =
                        allAdminPosts.find(
                            item =>
                                String(item._id) ===
                                String(button.dataset.id)
                        );

                    if (post) {
                        openPostModal(post);
                    }

                }
            );

        });

    // APPROVE
    container
        .querySelectorAll(".btn-approve")
        .forEach((button) => {

            button.addEventListener(
                "click",
                () => {

                    updatePostStatus(
                        button.dataset.id,
                        "approved"
                    );

                }
            );

        });

    // FLAG
    container
        .querySelectorAll(".btn-flag")
        .forEach((button) => {

            button.addEventListener(
                "click",
                () => {

                    updatePostStatus(
                        button.dataset.id,
                        "flagged"
                    );

                }
            );

        });

    // DELETE
    container
        .querySelectorAll(".btn-delete")
        .forEach((button) => {

            button.addEventListener(
                "click",
                () => {

                    deletePost(
                        button.dataset.id
                    );

                }
            );

        });
}

// =====================================================
// UPDATE POST STATUS
// =====================================================

async function updatePostStatus(
    postId,
    status
) {

    try {

        const response =
            await adminFetch(
                `${API}/api/admin/posts/${postId}/status`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        status
                    })
                }
            );

        if (!response.ok) {

            const errorText =
                await response.text();

            console.error(
                "Server response:",
                errorText
            );

            throw new Error(
                "Failed to update post"
            );
        }

        const index =
            allAdminPosts.findIndex(
                post =>
                    String(post._id) ===
                    String(postId)
            );

        if (index !== -1) {

            allAdminPosts[index].status =
                status;
        }

        showToast(
            status === "flagged"
                ? "Post flagged successfully."
                : "Post approved successfully.",
            "success"
        );

        renderDashboardPreview();

        renderPostsTable(
            get("posts-search")?.value || ""
        );

        renderFlaggedTable();

        await fetchStats();

    } catch (error) {

        console.error(
            "Status update error:",
            error
        );

        showToast(
            "Failed to update post.",
            "error"
        );
    }
}

// =====================================================
// DELETE POST
// =====================================================

async function deletePost(postId) {

    const post =
        allAdminPosts.find(
            item =>
                String(item._id) ===
                String(postId)
        );

    const title =
        post?.title || "this post";

    const confirmed =
        window.confirm(
            `Delete "${title}"?\n\nThis cannot be undone.`
        );

    if (!confirmed) {
        return;
    }

    try {

        const response =
            await adminFetch(
                `${API}/api/admin/posts/${postId}`,
                {
                    method: "DELETE"
                }
            );

        if (!response.ok) {

            const errorText =
                await response.text();

            console.error(
                "Delete response:",
                errorText
            );

            throw new Error(
                "Failed to delete post"
            );
        }

        allAdminPosts =
            allAdminPosts.filter(
                post =>
                    String(post._id) !==
                    String(postId)
            );

        showToast(
            "Post deleted successfully.",
            "success"
        );

        renderDashboardPreview();

        renderPostsTable(
            get("posts-search")?.value || ""
        );

        renderFlaggedTable();

        await fetchStats();

    } catch (error) {

        console.error(
            "Delete error:",
            error
        );

        showToast(
            "Failed to delete post.",
            "error"
        );
    }
}

// =====================================================
// POST PREVIEW MODAL
// =====================================================

function openPostModal(post) {

    const modal =
        get("admin-modal");

    // Remember the trigger so setupModal's close handler can restore focus.
    adminModalOpener = document.activeElement;

    const title =
        get("admin-modal-title");

    const body =
        get("admin-modal-body");

    if (!modal || !title || !body) {
        return;
    }

    title.textContent =
        post.title || "Post Preview";

    body.innerHTML = `

        <div class="prose">

            <p>
                <strong>Author:</strong>
                ${escapeHTML(post.author)}
            </p>

            <p>
                <strong>Email:</strong>
                ${escapeHTML(
        post.authorEmail || "—"
    )}
            </p>

            <p>
                <strong>Category:</strong>
                ${escapeHTML(post.category)}
            </p>

            <p>
                <strong>Likes:</strong>
                ${post.likes || 0}
            </p>

            <p>
                <strong>Comments:</strong>
                ${(post.comments || []).length}
            </p>

            <p>
                <strong>Status:</strong>
                ${escapeHTML(
        post.status || "active"
    )}
            </p>

            <hr>

            <p class="preserve-lines">
                ${escapeHTML(post.content)}
            </p>

            <div class="action-row">

                <button
                    class="btn-table-action btn-approve"
                    id="modal-approve-btn"
                    type="button">
                    Approve
                </button>

                <button
                    class="btn-table-action btn-flag"
                    id="modal-flag-btn"
                    type="button">
                    Flag
                </button>

                <button
                    class="btn-table-action btn-delete"
                    id="modal-delete-btn"
                    type="button">
                    Delete
                </button>

            </div>

        </div>
    `;

    get("modal-approve-btn")
        ?.addEventListener(
            "click",
            async () => {

                await updatePostStatus(
                    post._id,
                    "approved"
                );

                modal.classList.remove(
                    "show"
                );

            }
        );

    get("modal-flag-btn")
        ?.addEventListener(
            "click",
            async () => {

                await updatePostStatus(
                    post._id,
                    "flagged"
                );

                modal.classList.remove(
                    "show"
                );

            }
        );

    get("modal-delete-btn")
        ?.addEventListener(
            "click",
            async () => {

                await deletePost(
                    post._id
                );

                modal.classList.remove(
                    "show"
                );

            }
        );

    modal.classList.add("show");

    // Hand focus into the dialog so the next Tab stays inside it.
    modal
        .querySelector(
            FOCUSABLE_SELECTOR
        )
        ?.focus();
}

// =====================================================
// MODAL CONTROLS
// =====================================================

function setupModal() {

    const modal =
        get("admin-modal");

    const closeButton =
        get("admin-modal-close");

    if (!modal) {
        return;
    }

    // aria-modal="true" was declared but focus was never trapped, so Tab
    // walked out into the inert dashboard behind the dialog. Track the
    // trigger so focus can be restored on close.
    const closeModal = () => {
        if (!modal.classList.contains("show")) {
            return;
        }

        modal.classList.remove("show");

        adminModalOpener?.focus();
    };

    closeButton?.addEventListener(
        "click",
        closeModal
    );

    modal.addEventListener(
        "click",
        (event) => {

            if (event.target === modal) {
                closeModal();
            }

        }
    );

    document.addEventListener(
        "keydown",
        (event) => {

            if (event.key === "Escape") {
                closeModal();
                return;
            }

            if (event.key !== "Tab" ||
                !modal.classList.contains("show")) {
                return;
            }

            const focusable = [
                ...modal.querySelectorAll(
                    FOCUSABLE_SELECTOR
                )
            ].filter(
                el => el.offsetParent !== null
            );

            if (focusable.length === 0) {
                return;
            }

            const first = focusable[0];
            const last =
                focusable[focusable.length - 1];

            if (event.shiftKey &&
                document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey &&
                document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    );
}

// =====================================================
// SEARCH
// =====================================================

function setupSearch() {

    const postsSearch =
        get("posts-search");

    const usersSearch =
        get("users-search");

    postsSearch?.addEventListener(
        "input",
        (event) => {

            renderPostsTable(
                event.target.value
            );

        }
    );

    usersSearch?.addEventListener(
        "input",
        (event) => {

            renderUsersTable(
                event.target.value
            );

        }
    );
}

// =====================================================
// REFRESH
// =====================================================

function setupRefresh() {

    const refreshButton =
        get("refresh-btn");

    if (!refreshButton) {
        return;
    }

    refreshButton.addEventListener(
        "click",
        async () => {

            refreshButton.disabled = true;

            showToast(
                "Refreshing dashboard...",
                "info"
            );

            try {

                await Promise.all([
                    fetchStats(),
                    fetchAdminPosts(),
                    fetchUsers(),
                    fetchAnnouncements()
                ]);

                showToast(
                    "Dashboard refreshed.",
                    "success"
                );

            } finally {

                refreshButton.disabled = false;

            }

        }
    );
}

// =====================================================
// INITIALIZE DASHBOARD
// =====================================================

async function initAdminDashboard() {

    console.log(
        "SYNAPSE Admin Dashboard initialized."
    );

    initTheme();

    setupThemeToggle();

    setupAdminProfile();

    setupProfileDropdown();

    setupLogout();

    setupBackToCommunity();

    setupTabs();

    setupModal();

    setupSearch();

    setupRefresh();

    setupAnnouncementForm();

    // Load dashboard data
    await Promise.all([
        fetchStats(),
        fetchAdminPosts(),
        fetchUsers(),
        fetchAnnouncements()
    ]);

    console.log(
        "SYNAPSE Admin Dashboard data loaded."
    );
}