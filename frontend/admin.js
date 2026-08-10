// =====================================================
// SYNAPSE - ADMIN DASHBOARD JAVASCRIPT
// admin.js - All admin functionality with real API
// =====================================================

const API = "http://localhost:5000";

// =====================================================
// AUTH GUARD - Must be admin
// =====================================================

const token = localStorage.getItem("synapse_token");
const userRole = localStorage.getItem("synapse_role");
const adminUser = JSON.parse(localStorage.getItem("synapse_user") || "null");

// Redirect non-admins
if (!token || !adminUser) {
    window.location.href = "admin-login.html";
} else if (userRole !== "admin") {
    // Student tried to access admin panel
    window.location.href = "login.html";
}

// Helper: authorized fetch with admin token
async function adminFetch(url, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        ...(options.headers || {})
    };
    return fetch(url, { ...options, headers });
}

// =====================================================
// TOAST
// =====================================================

const toastContainer = document.getElementById("toast-container");

function showToast(message, type = "info") {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icons = { success: "✅", error: "⚠️", info: "ℹ️" };
    toast.innerHTML = `<span>${icons[type] || "ℹ️"}</span><div>${escapeHTML(message)}</div>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function escapeHTML(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getInitials(name) {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

// =====================================================
// THEME MANAGEMENT
// =====================================================

const themeToggleBtn = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");

function initTheme() {
    const saved = localStorage.getItem("synapse_theme");
    if (saved === "dark") {
        document.body.classList.add("dark-mode");
        if (themeIcon) themeIcon.textContent = "☀️";
    }
}

themeToggleBtn?.addEventListener("click", () => {
    const isDark = document.body.classList.contains("dark-mode");
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("synapse_theme", isDark ? "light" : "dark");
    if (themeIcon) themeIcon.textContent = isDark ? "🌙" : "☀️";
});

initTheme();

// =====================================================
// POPULATE ADMIN USER INFO
// =====================================================

if (adminUser) {
    const nameEl = document.getElementById("admin-name");
    const emailEl = document.getElementById("admin-email");
    const initialsEl = document.getElementById("admin-initials");
    if (nameEl) nameEl.textContent = adminUser.name || "Admin";
    if (emailEl) emailEl.textContent = adminUser.email || "";
    if (initialsEl) initialsEl.textContent = getInitials(adminUser.name);
}

// Profile dropdown
const adminProfileBtn = document.getElementById("admin-profile-btn");
const adminDropdown = document.getElementById("admin-dropdown");
adminProfileBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    adminDropdown?.classList.toggle("show");
});
document.addEventListener("click", (e) => {
    if (!adminDropdown?.contains(e.target) && e.target !== adminProfileBtn) {
        adminDropdown?.classList.remove("show");
    }
});

// Logout
document.getElementById("admin-logout-btn")?.addEventListener("click", () => {
    localStorage.removeItem("synapse_token");
    localStorage.removeItem("synapse_role");
    localStorage.removeItem("synapse_user");
    window.location.href = "admin-login.html";
});

// =====================================================
// APPLICATION STATE
// =====================================================

let allAdminPosts = [];
let allUsers = [];
let currentTab = "dashboard";

// =====================================================
// TAB NAVIGATION
// =====================================================

const tabBtns = document.querySelectorAll(".admin-nav-item[data-tab]");
const panels = document.querySelectorAll(".admin-panel");

tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        currentTab = tab;

        tabBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        panels.forEach(p => p.style.display = "none");
        const panel = document.getElementById(`panel-${tab}`);
        if (panel) panel.style.display = "block";

        if (tab === "posts") renderPostsTable();
        else if (tab === "users") renderUsersTable();
        else if (tab === "flagged") renderFlaggedTable();
    });
});

// =====================================================
// FETCH STATS
// =====================================================

async function fetchStats() {
    try {
        const res = await adminFetch(`${API}/api/admin/stats`);

        if (res.status === 403) {
            showToast("Access denied. Redirecting to login.", "error");
            setTimeout(() => { window.location.href = "admin-login.html"; }, 1500);
            return;
        }

        const data = await res.json();

        document.getElementById("stat-total-users").textContent = data.totalUsers ?? "—";
        document.getElementById("stat-total-posts").textContent = data.totalPosts ?? "—";
        document.getElementById("stat-pending-reports").textContent = data.pendingReports ?? "—";
        document.getElementById("stat-active").textContent = data.activeDiscussions ?? "—";
        document.getElementById("flagged-count").textContent = data.pendingReports ?? 0;

    } catch (err) {
        console.error("Stats fetch error:", err);
        showToast("Failed to load dashboard stats.", "error");
    }
}

// =====================================================
// FETCH ALL POSTS (Admin route)
// =====================================================

async function fetchAdminPosts() {
    try {
        const res = await adminFetch(`${API}/api/admin/posts`);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        allAdminPosts = await res.json();
        renderDashboardPreview();
        renderPostsTable();
        renderFlaggedTable();

    } catch (err) {
        console.error("Posts fetch error:", err);
        document.getElementById("posts-tbody").innerHTML = `
            <tr><td colspan="8" style="text-align:center;color:var(--danger);padding:2rem;">
                Failed to load posts from API.
            </td></tr>`;
    }
}

// =====================================================
// FETCH ALL USERS (Admin route)
// =====================================================

async function fetchUsers() {
    try {
        const res = await adminFetch(`${API}/api/admin/users`);
        if (!res.ok) throw new Error("Failed to fetch users");
        allUsers = await res.json();
        renderUsersTable();
    } catch (err) {
        console.error("Users fetch error:", err);
    }
}

// =====================================================
// DASHBOARD PREVIEW (5 latest posts)
// =====================================================

function renderDashboardPreview() {
    const container = document.getElementById("dashboard-posts-preview");
    if (!container) return;

    const recent = [...allAdminPosts].slice(0, 5);
    if (recent.length === 0) {
        container.innerHTML = `<p style="padding:1.5rem;color:var(--text-muted);">No posts yet.</p>`;
        return;
    }

    container.innerHTML = `
        <div style="overflow-x:auto;">
        <table class="admin-table">
            <thead><tr>
                <th>Title</th><th>Author</th><th>Category</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
                ${recent.map(p => `
                    <tr>
                        <td><strong>${escapeHTML(p.title)}</strong></td>
                        <td>${escapeHTML(p.author)}</td>
                        <td>${escapeHTML(p.category)}</td>
                        <td><span class="badge-status ${p.status || "active"}">${(p.status || "active").toUpperCase()}</span></td>
                        <td>
                            <button class="btn-table-action btn-view" data-id="${p._id}" type="button">View</button>
                            <button class="btn-table-action btn-delete" data-id="${p._id}" type="button">Delete</button>
                        </td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
        </div>
    `;

    attachTableActions(container);
}

// =====================================================
// POSTS TABLE
// =====================================================

function renderPostsTable(filterQuery = "") {
    const tbody = document.getElementById("posts-tbody");
    if (!tbody) return;

    let posts = [...allAdminPosts];
    if (filterQuery) {
        const q = filterQuery.toLowerCase();
        posts = posts.filter(p =>
            (p.title || "").toLowerCase().includes(q) ||
            (p.author || "").toLowerCase().includes(q) ||
            (p.category || "").toLowerCase().includes(q)
        );
    }

    if (posts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted);">No posts found.</td></tr>`;
        return;
    }

    tbody.innerHTML = posts.map(p => {
        const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";
        const status = p.status || "active";
        return `
            <tr>
                <td><strong>${escapeHTML(p.title)}</strong></td>
                <td>${escapeHTML(p.author)}</td>
                <td><span style="background:var(--accent-light);color:var(--accent-primary);padding:0.2rem 0.6rem;border-radius:999px;font-size:0.75rem;font-weight:700;">${escapeHTML(p.category)}</span></td>
                <td>${p.likes || 0}</td>
                <td>${(p.comments || []).length}</td>
                <td><span class="badge-status ${status}">${status.toUpperCase()}</span></td>
                <td>${date}</td>
                <td>
                    <button class="btn-table-action btn-view" data-id="${p._id}" type="button">View</button>
                    <button class="btn-table-action btn-approve" data-id="${p._id}" type="button">Approve</button>
                    <button class="btn-table-action btn-flag" data-id="${p._id}" type="button">Flag</button>
                    <button class="btn-table-action btn-delete" data-id="${p._id}" type="button">Delete</button>
                </td>
            </tr>
        `;
    }).join("");

    attachTableActions(tbody);
}

// =====================================================
// USERS TABLE
// =====================================================

function renderUsersTable(filterQuery = "") {
    const tbody = document.getElementById("users-tbody");
    if (!tbody) return;

    let users = [...allUsers].filter(u => u.role !== "admin");

    if (filterQuery) {
        const q = filterQuery.toLowerCase();
        users = users.filter(u =>
            (u.name || "").toLowerCase().includes(q) ||
            (u.email || "").toLowerCase().includes(q)
        );
    }

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">No students found.</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(u => {
        const date = u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
        return `
            <tr>
                <td><strong>${escapeHTML(u.name)}</strong></td>
                <td>${escapeHTML(u.email)}</td>
                <td><span class="badge-status approved">${u.role.toUpperCase()}</span></td>
                <td>${date}</td>
                <td><span class="badge-status ${u.isFlagged ? "flagged" : "approved"}">${u.isFlagged ? "FLAGGED" : "ACTIVE"}</span></td>
                <td>
                    <button class="btn-table-action ${u.isFlagged ? "btn-approve" : "btn-flag"}" data-user-id="${u._id}" data-flagged="${u.isFlagged}" type="button">
                        ${u.isFlagged ? "Unflag" : "Flag"}
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    // Flag/Unflag users
    tbody.querySelectorAll("[data-user-id]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const userId = btn.dataset.userId;
            try {
                const res = await adminFetch(`${API}/api/admin/users/${userId}/flag`, { method: "PATCH" });
                if (!res.ok) throw new Error("Failed");
                const data = await res.json();
                showToast(data.message, "success");
                await fetchUsers();
                renderUsersTable(document.getElementById("users-search")?.value || "");
            } catch {
                showToast("Failed to update user status.", "error");
            }
        });
    });
}

// =====================================================
// FLAGGED POSTS TABLE
// =====================================================

function renderFlaggedTable() {
    const tbody = document.getElementById("flagged-tbody");
    if (!tbody) return;

    const flagged = allAdminPosts.filter(p => p.status === "flagged");

    if (flagged.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted);">No flagged posts. Community looks clean! ✅</td></tr>`;
        return;
    }

    tbody.innerHTML = flagged.map(p => `
        <tr>
            <td><strong>${escapeHTML(p.title)}</strong></td>
            <td>${escapeHTML(p.author)}</td>
            <td>${escapeHTML(p.category)}</td>
            <td>
                <button class="btn-table-action btn-approve" data-id="${p._id}" type="button">Approve</button>
                <button class="btn-table-action btn-delete" data-id="${p._id}" type="button">Delete</button>
            </td>
        </tr>
    `).join("");

    attachTableActions(tbody);
}

// =====================================================
// SHARED TABLE ACTION HANDLERS
// =====================================================

function attachTableActions(container) {
    // VIEW
    container.querySelectorAll(".btn-view").forEach(btn => {
        btn.addEventListener("click", () => {
            const post = allAdminPosts.find(p => p._id === btn.dataset.id);
            if (!post) return;
            openPostModal(post);
        });
    });

    // APPROVE
    container.querySelectorAll(".btn-approve").forEach(btn => {
        btn.addEventListener("click", () => updatePostStatus(btn.dataset.id, "approved"));
    });

    // FLAG
    container.querySelectorAll(".btn-flag").forEach(btn => {
        btn.addEventListener("click", () => updatePostStatus(btn.dataset.id, "flagged"));
    });

    // DELETE
    container.querySelectorAll(".btn-delete").forEach(btn => {
        btn.addEventListener("click", () => deletePost(btn.dataset.id));
    });
}

// =====================================================
// POST STATUS UPDATE (Admin API)
// =====================================================

async function updatePostStatus(postId, status) {
    try {
        const res = await adminFetch(`${API}/api/admin/posts/${postId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status })
        });

        if (!res.ok) throw new Error("Failed to update status");

        // Update local data
        const idx = allAdminPosts.findIndex(p => p._id === postId);
        if (idx > -1) allAdminPosts[idx].status = status;

        showToast(`Post ${status === "flagged" ? "flagged" : "approved"} successfully.`, "success");

        // Re-render current view
        if (currentTab === "posts") renderPostsTable(document.getElementById("posts-search")?.value || "");
        else if (currentTab === "flagged") renderFlaggedTable();
        else renderDashboardPreview();

        await fetchStats();

    } catch (err) {
        console.error("Status update error:", err);
        showToast("Failed to update post status.", "error");
    }
}

// =====================================================
// DELETE POST (Admin API - permanent MongoDB delete)
// =====================================================

async function deletePost(postId) {
    const post = allAdminPosts.find(p => p._id === postId);
    if (!confirm(`Delete "${post?.title || "this post"}"? This is permanent.`)) return;

    try {
        const res = await adminFetch(`${API}/api/admin/posts/${postId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");

        allAdminPosts = allAdminPosts.filter(p => p._id !== postId);
        showToast("Post permanently deleted from MongoDB.", "success");

        if (currentTab === "posts") renderPostsTable(document.getElementById("posts-search")?.value || "");
        else if (currentTab === "flagged") renderFlaggedTable();
        else renderDashboardPreview();

        await fetchStats();

    } catch (err) {
        console.error("Delete error:", err);
        showToast("Failed to delete post.", "error");
    }
}

// =====================================================
// POST PREVIEW MODAL
// =====================================================

const adminModal = document.getElementById("admin-modal");
const adminModalClose = document.getElementById("admin-modal-close");

function openPostModal(post) {
    document.getElementById("admin-modal-title").textContent = post.title;
    document.getElementById("admin-modal-body").innerHTML = `
        <table style="width:100%;border-collapse:collapse;margin-bottom:1rem;">
            <tr><td style="padding:0.4rem 0;color:var(--text-muted);font-size:0.8rem;width:100px;">Author</td><td><strong>${escapeHTML(post.author)}</strong></td></tr>
            <tr><td style="padding:0.4rem 0;color:var(--text-muted);font-size:0.8rem;">Email</td><td>${escapeHTML(post.authorEmail || "—")}</td></tr>
            <tr><td style="padding:0.4rem 0;color:var(--text-muted);font-size:0.8rem;">Category</td><td>${escapeHTML(post.category)}</td></tr>
            <tr><td style="padding:0.4rem 0;color:var(--text-muted);font-size:0.8rem;">Likes</td><td>${post.likes || 0}</td></tr>
            <tr><td style="padding:0.4rem 0;color:var(--text-muted);font-size:0.8rem;">Comments</td><td>${(post.comments || []).length}</td></tr>
            <tr><td style="padding:0.4rem 0;color:var(--text-muted);font-size:0.8rem;">Status</td><td><span class="badge-status ${post.status || "active"}">${(post.status || "active").toUpperCase()}</span></td></tr>
            <tr><td style="padding:0.4rem 0;color:var(--text-muted);font-size:0.8rem;">Posted</td><td>${post.createdAt ? new Date(post.createdAt).toLocaleString() : "—"}</td></tr>
        </table>
        <hr style="margin:1rem 0;border:none;border-top:1px solid var(--border-color);">
        <p style="white-space:pre-line;font-size:0.9rem;color:var(--text-secondary);">${escapeHTML(post.content)}</p>
        <div style="margin-top:1.5rem;display:flex;gap:0.5rem;">
            <button class="btn-table-action btn-approve" onclick="updatePostStatus('${post._id}','approved')" type="button">Approve</button>
            <button class="btn-table-action btn-flag" onclick="updatePostStatus('${post._id}','flagged')" type="button">Flag</button>
            <button class="btn-table-action btn-delete" onclick="deletePost('${post._id}')" type="button">Delete</button>
        </div>
    `;
    adminModal?.classList.add("show");
}

adminModalClose?.addEventListener("click", () => adminModal?.classList.remove("show"));
adminModal?.addEventListener("click", (e) => { if (e.target === adminModal) adminModal.classList.remove("show"); });

// =====================================================
// SEARCH FILTERS
// =====================================================

document.getElementById("posts-search")?.addEventListener("input", (e) => {
    renderPostsTable(e.target.value);
});

document.getElementById("users-search")?.addEventListener("input", (e) => {
    renderUsersTable(e.target.value);
});

// Refresh button
document.getElementById("refresh-btn")?.addEventListener("click", () => {
    fetchStats();
    fetchAdminPosts();
    fetchUsers();
    showToast("Dashboard refreshed.", "info");
});

// =====================================================
// INIT
// =====================================================

document.addEventListener("DOMContentLoaded", async () => {
    await fetchStats();
    await fetchAdminPosts();
    await fetchUsers();
});
