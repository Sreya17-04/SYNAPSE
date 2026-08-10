// =====================================================
// SYNAPSE - ADMIN DASHBOARD
// admin.js
// Matched specifically to admin.html
// =====================================================

const API = "http://localhost:5000";

// =====================================================
// AUTH
// =====================================================

const token = localStorage.getItem("synapse_token");
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

async function adminFetch(url, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        ...(options.headers || {})
    };

    return fetch(url, {
        ...options,
        headers
    });
}

// =====================================================
// ELEMENT HELPERS
// =====================================================

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
        () => {

            localStorage.removeItem(
                "synapse_token"
            );

            localStorage.removeItem(
                "synapse_role"
            );

            localStorage.removeItem(
                "synapse_user"
            );

            window.location.href =
                "admin-login.html";
        }
    );
}

// =====================================================
// BACK TO COMMUNITY
// =====================================================

function setupBackToCommunity() {

    // Your HTML already has:
    // <a href="index.html" class="nav-link">
    //     ← Back to Community
    // </a>

    // We intentionally DO NOT prevent the default
    // navigation.

    const links =
        document.querySelectorAll(
            'a[href="index.html"]'
        );

    links.forEach((link) => {

        link.addEventListener(
            "click",
            () => {

                // Close dropdown if open
                const dropdown =
                    get("admin-dropdown");

                if (dropdown) {
                    dropdown.classList.remove("show");
                }

                // Let browser navigate normally
            }
        );

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

        button.addEventListener(
            "click",
            () => {

                const tab =
                    button.dataset.tab;

                currentTab = tab;

                // Remove active from all buttons
                tabButtons.forEach((btn) => {
                    btn.classList.remove("active");
                });

                // Activate selected button
                button.classList.add("active");

                // Hide all panels
                panels.forEach((panel) => {

                    panel.style.display = "none";
                    panel.classList.remove(
                        "active-panel"
                    );

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

                if (tab === "users") {
                    renderUsersTable(
                        get("users-search")?.value || ""
                    );
                }

                if (tab === "flagged") {
                    renderFlaggedTable();
                }

            }
        );

    });
}

// =====================================================
// GLOBAL DATA
// =====================================================

let allAdminPosts = [];
let allUsers = [];

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
                window.location.href =
                    "admin-login.html";
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

        if (
            response.status === 401 ||
            response.status === 403
        ) {

            window.location.href =
                "admin-login.html";

            return;
        }

        if (!response.ok) {
            throw new Error(
                `Posts request failed: ${response.status}`
            );
        }

        const data =
            await response.json();

        // Handle either:
        // [posts]
        // OR { posts: [...] }

        if (Array.isArray(data)) {
            allAdminPosts = data;
        } else if (Array.isArray(data.posts)) {
            allAdminPosts = data.posts;
        } else {
            allAdminPosts = [];
        }

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
                        style="text-align:center;padding:2rem;color:var(--danger);">
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

        if (
            response.status === 401 ||
            response.status === 403
        ) {

            window.location.href =
                "admin-login.html";

            return;
        }

        if (!response.ok) {
            throw new Error(
                `Users request failed: ${response.status}`
            );
        }

        const data =
            await response.json();

        // Handle:
        // [users]
        // OR { users: [...] }

        if (Array.isArray(data)) {
            allUsers = data;
        } else if (Array.isArray(data.users)) {
            allUsers = data.users;
        } else {
            allUsers = [];
        }

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
            <p style="padding:1.5rem;color:var(--text-muted);">
                No posts yet.
            </p>
        `;

        return;
    }

    container.innerHTML = `
        <div style="overflow-x:auto;">
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
                                    <span class="badge-status ${status}">
                                        ${status.toUpperCase()}
                                    </span>
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
                    style="text-align:center;padding:2rem;color:var(--text-muted);">
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
                        <span class="badge-status ${status}">
                            ${status.toUpperCase()}
                        </span>
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
                    style="text-align:center;padding:2rem;color:var(--text-muted);">
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
                    style="text-align:center;padding:2rem;color:var(--text-muted);">
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

        <div style="line-height:1.7;">

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

            <p style="white-space:pre-line;">
                ${escapeHTML(post.content)}
            </p>

            <div
                style="
                    margin-top:1rem;
                    display:flex;
                    gap:0.5rem;
                    flex-wrap:wrap;
                "
            >

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

    closeButton?.addEventListener(
        "click",
        () => {
            modal.classList.remove("show");
        }
    );

    modal.addEventListener(
        "click",
        (event) => {

            if (event.target === modal) {
                modal.classList.remove("show");
            }

        }
    );

    document.addEventListener(
        "keydown",
        (event) => {

            if (event.key === "Escape") {
                modal.classList.remove(
                    "show"
                );
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
                    fetchUsers()
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

    // Load dashboard data
    await Promise.all([
        fetchStats(),
        fetchAdminPosts(),
        fetchUsers()
    ]);

    console.log(
        "SYNAPSE Admin Dashboard data loaded."
    );
}