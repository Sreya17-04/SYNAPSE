// =====================================================
// SYNAPSE - ADMIN DASHBOARD JAVASCRIPT
// =====================================================

const API_URL = "http://localhost:5000/api/posts";

let adminPosts = [];
let postStatusMap = {}; // local status tracking

const tbody = document.getElementById("admin-posts-tbody");
const statTotalPosts = document.getElementById("stat-total-posts");
const statActiveDiscussions = document.getElementById("stat-active-discussions");
const adminSearchInput = document.getElementById("admin-search-input");
const adminModal = document.getElementById("admin-modal");
const adminModalTitle = document.getElementById("admin-modal-title");
const adminModalBody = document.getElementById("admin-modal-body");
const adminModalClose = document.getElementById("admin-modal-close");
const toastContainer = document.getElementById("toast-container");

// Theme setup
const themeToggleBtn = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");

function initTheme() {
    const savedTheme = localStorage.getItem("synapse_theme");
    if (savedTheme === "dark") {
        document.body.classList.add("dark-mode");
        if (themeIcon) themeIcon.textContent = "☀️";
    }
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
        const isDark = document.body.classList.contains("dark-mode");
        if (isDark) {
            document.body.classList.remove("dark-mode");
            localStorage.setItem("synapse_theme", "light");
            if (themeIcon) themeIcon.textContent = "🌙";
        } else {
            document.body.classList.add("dark-mode");
            localStorage.setItem("synapse_theme", "dark");
            if (themeIcon) themeIcon.textContent = "☀️";
        }
    });
}

initTheme();

function showToast(message, type = "info") {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : '⚠️'}</span> <div>${escapeHTML(message)}</div>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function escapeHTML(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Fetch posts
async function fetchAdminPosts() {
    try {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem;">Loading admin records...</td></tr>`;
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error("Failed to fetch posts");
        adminPosts = await response.json();

        if (statTotalPosts) statTotalPosts.textContent = adminPosts.length;
        if (statActiveDiscussions) statActiveDiscussions.textContent = 356 + adminPosts.length;

        renderTable();
    } catch (error) {
        console.error("Admin fetch error:", error);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--danger); padding: 2rem;">Failed to load posts from API backend.</td></tr>`;
        showToast("Error connecting to backend API", "error");
    }
}

function renderTable() {
    const query = adminSearchInput ? adminSearchInput.value.toLowerCase().trim() : "";
    let filtered = adminPosts.filter(p => {
        return (p.title || "").toLowerCase().includes(query) ||
            (p.author || "").toLowerCase().includes(query) ||
            (p.category || "").toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem;">No matching posts found.</td></tr>`;
        return;
    }

    tbody.innerHTML = "";

    filtered.forEach(post => {
        const tr = document.createElement("tr");
        const status = postStatusMap[post._id] || "approved";

        let dateStr = "Recent";
        if (post.createdAt) {
            dateStr = new Date(post.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short"
            });
        }

        tr.innerHTML = `
            <td><strong>${escapeHTML(post.title)}</strong></td>
            <td>${escapeHTML(post.author)}</td>
            <td><span class="badge-status" style="background: var(--accent-light); color: var(--accent-primary);">${escapeHTML(post.category)}</span></td>
            <td>${dateStr}</td>
            <td>
                <span class="badge-status ${status}">${status.toUpperCase()}</span>
            </td>
            <td>
                <button class="btn-table-action btn-view" type="button">View</button>
                <button class="btn-table-action btn-approve" type="button">Approve</button>
                <button class="btn-table-action btn-flag" type="button">Flag</button>
                <button class="btn-table-action btn-delete" type="button">Delete</button>
            </td>
        `;

        // View Modal
        tr.querySelector(".btn-view").addEventListener("click", () => {
            adminModalTitle.textContent = post.title;
            adminModalBody.innerHTML = `
                <p><strong>Author:</strong> ${escapeHTML(post.author)}</p>
                <p><strong>Category:</strong> ${escapeHTML(post.category)}</p>
                <p><strong>Created:</strong> ${post.createdAt ? new Date(post.createdAt).toLocaleString() : 'N/A'}</p>
                <hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--border-color);">
                <p style="white-space: pre-line;">${escapeHTML(post.content)}</p>
            `;
            adminModal.classList.add("show");
        });

        // Approve Toggle
        tr.querySelector(".btn-approve").addEventListener("click", () => {
            postStatusMap[post._id] = "approved";
            renderTable();
            showToast("Post status updated to Approved", "success");
        });

        // Flag Toggle
        tr.querySelector(".btn-flag").addEventListener("click", () => {
            postStatusMap[post._id] = "flagged";
            renderTable();
            showToast("Post flagged for moderation", "error");
        });

        // Delete from Backend API
        tr.querySelector(".btn-delete").addEventListener("click", async () => {
            if (!confirm(`Are you sure you want to delete "${post.title}"?`)) return;

            try {
                const res = await fetch(`${API_URL}/${post._id}`, {
                    method: "DELETE"
                });

                if (!res.ok) throw new Error("Failed to delete");

                adminPosts = adminPosts.filter(p => p._id !== post._id);
                if (statTotalPosts) statTotalPosts.textContent = adminPosts.length;
                renderTable();
                showToast("Post permanently deleted from MongoDB", "success");
            } catch (err) {
                console.error("Delete error:", err);
                showToast("Failed to delete post from backend", "error");
            }
        });

        tbody.appendChild(tr);
    });
}

if (adminSearchInput) {
    adminSearchInput.addEventListener("input", renderTable);
}

if (adminModalClose) {
    adminModalClose.addEventListener("click", () => adminModal.classList.remove("show"));
}

if (adminModal) {
    adminModal.addEventListener("click", (e) => {
        if (e.target === adminModal) adminModal.classList.remove("show");
    });
}

// Admin Navigation tabs demo feedback
document.querySelectorAll(".admin-nav-item").forEach(item => {
    item.addEventListener("click", () => {
        document.querySelectorAll(".admin-nav-item").forEach(i => i.classList.remove("active"));
        item.classList.add("active");
    });
});

document.addEventListener("DOMContentLoaded", fetchAdminPosts);
