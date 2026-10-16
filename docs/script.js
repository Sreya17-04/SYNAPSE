// =====================================================
// SYNAPSE - STUDENT COMMUNITY
// script.js
// =====================================================

// SYNAPSE_API_URL comes from config.js, loaded just before this file.
const API_URL = SYNAPSE_API_URL;

// =====================================================
// AUTH
// =====================================================

let token = localStorage.getItem("synapse_token");
let currentUser = JSON.parse(
    localStorage.getItem("synapse_user") || "null"
);
let userRole = localStorage.getItem("synapse_role");

// Build the sign-in URL that comes back to this exact page (view, search and
// any hash included), so opening a shared link while logged out lands on that
// link after signing in instead of a bare index.html.
function loginRedirectUrl() {
    const returnTo =
        window.location.pathname +
        window.location.search +
        window.location.hash;

    return `login.html?return=${encodeURIComponent(returnTo)}`;
}

// Clears local auth state and bounces to the login page. Wrapped in a function
// so every caller stops executing instead of falling through with a stale UI.
function requireStudentSession(options = {}) {
    if (!token || !currentUser) {
        localStorage.removeItem("synapse_token");
        localStorage.removeItem("synapse_role");
        localStorage.removeItem("synapse_user");

        window.location.replace(loginRedirectUrl());
        return false;
    }

    if (userRole === "admin" || currentUser.role === "admin") {
        if (!options.allowAdmin) {
            window.location.replace("admin.html");
            return false;
        }
    }

    return true;
}

function isStaffViewer() {
    const role = userRole || currentUser?.role;
    return role === "admin" || role === "moderator";
}

// Admins get a read-only copy of the student feed (composer hidden). Moderators
// keep the composer - they are students with extra powers. The "Admin
// Dashboard" shortcut appears for staff only after /api/auth/me has agreed
// the session really carries that role (localStorage alone is not trusted).
function applyViewerRoleUI(serverConfirmed = false) {
    const cachedAdmin =
        userRole === "admin" || currentUser?.role === "admin";

    const isStaffConfirmed =
        serverConfirmed &&
        (cachedAdmin ||
            userRole === "moderator" ||
            currentUser?.role === "moderator");

    if (createPostBtn) {
        createPostBtn.style.display = cachedAdmin ? "none" : "";
    }

    const dashboardItem =
        document.getElementById("menu-admin-dashboard");

    if (dashboardItem) {
        dashboardItem.style.display = isStaffConfirmed ? "" : "none";
    }

    if (navMyposts) {
        navMyposts.style.display = cachedAdmin ? "none" : "";
    }
}

// =====================================================
// AUTHORIZED FETCH
// =====================================================

// Every 401 means the token is expired, revoked by a logout elsewhere, or the
// account was suspended. Handle it in one place instead of per-caller.
// FormData bodies are sent as-is so the browser can set the multipart
// boundary; JSON bodies get the JSON content type.
async function authFetch(url, options = {}) {
    const isFormData =
        typeof FormData !== "undefined" &&
        options.body instanceof FormData;

    const headers = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
    };

    if (!isFormData && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        handleSessionExpired();

        throw new Error("Session expired. Please log in again.");
    }

    return response;
}

function handleSessionExpired() {
    localStorage.removeItem("synapse_token");
    localStorage.removeItem("synapse_role");
    localStorage.removeItem("synapse_user");

    window.location.replace(loginRedirectUrl());
}

// Reads a JSON error message without assuming the body is JSON. A proxy or a
// crash can return HTML, and response.json() on that throws and hides the
// real status.
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

// Turn any failed response into a kind, specific message. Server-provided
// messages win; common status codes get a friendly default.
async function friendlyError(response, fallback) {
    const serverMessage = await readError(response, "");

    if (serverMessage) {
        return serverMessage;
    }

    switch (response.status) {
        case 401:
            return "Your session has expired. Please log in again.";
        case 403:
            return "You do not have permission to do that.";
        case 404:
            return "That discussion no longer exists.";
        case 409:
            return "That action conflicts with the current state. Refresh and try again.";
        case 413:
            return "That file is too large. The limit is 5 MB.";
        case 429:
            return "You are doing that too often. Please wait a while and try again.";
        default:
            return fallback;
    }
}

// =====================================================
// DOM ELEMENTS
// =====================================================

const postsContainer = document.getElementById("posts-container");

const postModal = document.getElementById("post-modal");
const postForm = document.getElementById("post-form");
const postFileInput = document.getElementById("post-file");

const createPostBtn = document.getElementById("create-post-btn");

const closeModalBtn = document.getElementById("close-modal");
const cancelPostBtn = document.getElementById("cancel-post");

const reportModal = document.getElementById("report-modal");
const reportForm = document.getElementById("report-form");

const closeReportModalBtn = document.getElementById("close-report-modal");
const cancelReportBtn = document.getElementById("cancel-report");
const submitReportBtn = document.getElementById("submit-report-btn");
const reportPostTitle = document.getElementById("report-post-title");

const confirmModal = document.getElementById("confirm-modal");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmOkBtn = document.getElementById("confirm-ok");
const confirmCancelBtn = document.getElementById("confirm-cancel");
const closeConfirmModalBtn = document.getElementById("close-confirm-modal");

const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");

const themeToggleBtn = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");

const profileBtn = document.getElementById("profile-btn");
const profileDropdown = document.getElementById("profile-dropdown");

const notificationBtn = document.getElementById("notification-btn");
const notificationBadge = document.getElementById("notification-badge");
const notificationDropdown = document.getElementById("notification-dropdown");
const notificationList = document.getElementById("notification-list");
const markAllReadBtn = document.getElementById("mark-all-read");

const toastContainer = document.getElementById("toast-container");
const statDiscussions = document.getElementById("stat-discussions");
const statMembers = document.getElementById("stat-members");
const statAnnouncements = document.getElementById("stat-announcements");
const trendingList = document.getElementById("trending-list");
const announcementsList = document.getElementById("announcements-list");
const feedSubtitle = document.getElementById("feed-subtitle");

const navHome = document.getElementById("nav-home");
const navSaved = document.getElementById("nav-saved");
const navMyposts = document.getElementById("nav-myposts");

const heroExploreBtn = document.getElementById("hero-explore-btn");

// =====================================================
// STATE
// =====================================================

let allPosts = [];
let selectedCategory = "All";

// Saved Posts and My Posts live at their own page URLs
// (index.html?view=saved / index.html?view=myposts) so they can be
// bookmarked, reloaded and shared. Anything else falls back to home.
const DEDICATED_VIEWS = ["saved", "myposts"];
const initialView = new URLSearchParams(window.location.search).get("view");

let activeView = DEDICATED_VIEWS.includes(initialView)
    ? initialView
    : "home";
let currentSearch = "";
let currentSort = "latest";

const SAVED_KEY = "synapse_saved_posts";

// Post ids this student has already reported from the open page. Keeps the
// report button from firing a second request; the server enforces the same
// rule for reports filed from another tab (409).
const reportedPostIds = new Set();

// The post currently loaded in the report dialog, and a guard so a double
// click (or an impatient Enter) cannot submit the same report twice.
let reportTargetPostId = null;
let reportInFlight = false;
let reportLastFocusedElement = null;

// =====================================================
// UTILITY FUNCTIONS
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

function getInitials(name) {
    if (!name) return "U";

    const parts = String(name).trim().split(/\s+/);

    if (parts.length >= 2) {
        return (
            parts[0][0] +
            parts[parts.length - 1][0]
        ).toUpperCase();
    }

    return String(name).slice(0, 2).toUpperCase();
}

// Categories are rendered as a colour-coded chip; the slug picks the palette.
function getCategorySlug(category) {
    return String(category || "other")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "other";
}

// Line icons come from the sprite declared at the top of index.html.
const ICONS = {
    heart: '<svg class="icon" aria-hidden="true"><use href="#i-heart"></use></svg>',
    comment: '<svg class="icon" aria-hidden="true"><use href="#i-chat"></use></svg>',
    share: '<svg class="icon" aria-hidden="true"><use href="#i-share"></use></svg>',
    bookmark: '<svg class="icon" aria-hidden="true"><use href="#i-bookmark"></use></svg>',
    flag: '<svg class="icon" aria-hidden="true"><use href="#i-flag"></use></svg>',
    trash: '<svg class="icon" aria-hidden="true"><use href="#i-trash"></use></svg>'
};

function timeAgo(dateString) {
    if (!dateString) return "Recently";

    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
        return "Recently";
    }

    const diff = Date.now() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

// Permalink for one discussion. post.html carries the full description,
// comment thread and actions; sharing copies this URL, never the whole feed.
function postPermalink(postId) {
    const base = window.location.origin
        ? `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}`
        : "";

    return `${base}post.html?id=${encodeURIComponent(postId)}`;
}

// =====================================================
// TOAST
// =====================================================

function showToast(message, type = "info") {
    if (!toastContainer) return;

    const toast = document.createElement("div");

    toast.className = `toast ${type}`;

    const icons = {
        success: '<svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg>',
        error: '<svg class="icon" aria-hidden="true"><use href="#i-x"></use></svg>',
        info: '<svg class="icon" aria-hidden="true"><use href="#i-info"></use></svg>'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <div>${escapeHTML(message)}</div>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(50px)";

        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3500);
}

// =====================================================
// CONFIRM MODAL
// =====================================================

// In-app confirmation replacing native confirm(), so the wording and the
// styling stay consistent with the rest of the app.
let confirmResolve = null;
let confirmLastFocused = null;

function showConfirm(title, message, confirmLabel = "Confirm") {
    if (!confirmModal) {
        return Promise.resolve(
            window.confirm(message)
        );
    }

    confirmLastFocused = document.activeElement;

    if (confirmTitle) confirmTitle.textContent = title;
    if (confirmMessage) confirmMessage.textContent = message;
    if (confirmOkBtn) confirmLabel && (confirmOkBtn.textContent = confirmLabel);

    confirmModal.classList.add("show");
    confirmOkBtn?.focus();

    return new Promise((resolve) => {
        confirmResolve = resolve;
    });
}

function closeConfirm(result) {
    if (!confirmModal?.classList.contains("show")) return;

    confirmModal.classList.remove("show");

    confirmResolve?.(result);
    confirmResolve = null;

    confirmLastFocused?.focus();
}

confirmOkBtn?.addEventListener("click", () => closeConfirm(true));
confirmCancelBtn?.addEventListener("click", () => closeConfirm(false));
closeConfirmModalBtn?.addEventListener("click", () => closeConfirm(false));

confirmModal?.addEventListener("click", (event) => {
    if (event.target === confirmModal) {
        closeConfirm(false);
    }
});

// =====================================================
// THEME
// =====================================================

function setTheme(theme) {
    if (theme === "dark") {
        document.body.classList.add("dark-mode");
        localStorage.setItem("synapse_theme", "dark");
    } else {
        document.body.classList.remove("dark-mode");
        localStorage.setItem("synapse_theme", "light");
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem("synapse_theme") || "dark";

    setTheme(savedTheme);
}

themeToggleBtn?.addEventListener("click", () => {
    const isDark = document.body.classList.contains("dark-mode");

    setTheme(isDark ? "light" : "dark");
});

initTheme();

const navbarEl = document.querySelector(".navbar");

if (navbarEl) {
    const syncNavbarShadow = () => {
        navbarEl.classList.toggle("is-scrolled", window.scrollY > 8);
    };

    syncNavbarShadow();
    window.addEventListener("scroll", syncNavbarShadow, { passive: true });
}

// =====================================================
// USER PROFILE
// =====================================================

if (currentUser) {
    const nameElement = document.getElementById("profile-name");
    const emailElement = document.getElementById("profile-email");
    const initialsElement = document.getElementById("profile-initials");

    const name = currentUser.name || "Student";

    if (nameElement) {
        nameElement.textContent = name;
    }

    if (emailElement) {
        emailElement.textContent =
            currentUser.email || currentUser.universityRegNo || "";
    }

    if (initialsElement) {
        initialsElement.textContent = getInitials(name);
    }
}

// =====================================================
// PROFILE DROPDOWN
// =====================================================

profileBtn?.addEventListener("click", (event) => {
    event.stopPropagation();

    profileDropdown?.classList.toggle("show");

    // Keep the notification panel from stacking open on top of it.
    notificationDropdown?.classList.remove("show");
});

document.addEventListener("click", (event) => {
    if (
        profileDropdown &&
        !profileDropdown.contains(event.target) &&
        event.target !== profileBtn
    ) {
        profileDropdown.classList.remove("show");
    }

    if (
        notificationDropdown &&
        !notificationDropdown.contains(event.target) &&
        event.target !== notificationBtn &&
        !notificationBtn?.contains(event.target)
    ) {
        notificationDropdown.classList.remove("show");
    }
});

// =====================================================
// DEDICATED VIEW NAVIGATION
// =====================================================

function openDedicatedView(view) {
    const query = `?view=${view}`;

    if (window.location.search === query) {
        document
            .querySelector(".feed-container")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }

    window.location.href = `index.html${query}`;
}

// =====================================================
// LOGOUT
// =====================================================

document.getElementById("menu-logout")?.addEventListener("click", async () => {
    try {
        await fetch(`${API_URL}/api/auth/logout`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });
    } catch {
        // Network failure must not trap the user in a stale session.
    }

    localStorage.removeItem("synapse_token");
    localStorage.removeItem("synapse_role");
    localStorage.removeItem("synapse_user");

    window.location.replace("login.html");
});

// =====================================================
// SKELETON LOADER
// =====================================================

function renderSkeletons() {
    if (!postsContainer) return;

    postsContainer.innerHTML = `
        <div class="skeleton-card">
            <div class="skeleton-line short"></div>
            <div class="skeleton-line title"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
        </div>

        <div class="skeleton-card">
            <div class="skeleton-line short"></div>
            <div class="skeleton-line title"></div>
            <div class="skeleton-line"></div>
        </div>

        <div class="skeleton-card">
            <div class="skeleton-line short"></div>
            <div class="skeleton-line title"></div>
            <div class="skeleton-line"></div>
        </div>
    `;
}

// =====================================================
// LOAD POSTS
// =====================================================

async function loadPosts() {
    if (!postsContainer) return;

    try {
        renderSkeletons();

        const response = await authFetch(`${API_URL}/api/posts`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        allPosts = await response.json();

        displayPosts();

        await Promise.all([
            loadTopDiscussions(),
            loadAnnouncements(),
            loadCommunityStats()
        ]);

    } catch (error) {
        if (error.message.startsWith("Session expired")) {
            return;
        }

        console.error("Error loading posts:", error);

        postsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <svg class="icon" aria-hidden="true"><use href="#i-alert"></use></svg>
                </div>
                <h3>Unable to Load Posts</h3>
                <p>
                    Could not reach the SYNAPSE API. Check that the
                    backend is running and reload.
                </p>
                <button
                    class="btn-create-post-banner mt-1"
                    id="retry-posts-btn"
                    type="button"
                >
                    Retry
                </button>
            </div>
        `;

        document
            .getElementById("retry-posts-btn")
            ?.addEventListener("click", loadPosts);

        showToast("Failed to reach the server.", "error");
    }
}

async function loadCommunityStats() {
    try {
        const response = await fetch(`${API_URL}/api/stats`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const stats = await response.json();

        if (statMembers) {
            statMembers.textContent = formatCount(stats.students);
        }

        if (statDiscussions) {
            statDiscussions.textContent = formatCount(stats.discussions);
        }

        if (statAnnouncements) {
            statAnnouncements.textContent = formatCount(stats.announcements);
        }
    } catch (error) {
        console.error("Error loading community stats:", error);
    }
}

function formatCount(value) {
    const count = Number(value) || 0;

    return count >= 1000
        ? `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`
        : String(count);
}

// Trending shows the top five with likes AND comment counts, each row a link
// straight to the discussion's own page - no hover needed to see the numbers.
// Re-polled on an interval so the ranking moves without a full reload.
async function loadTopDiscussions() {
    if (!trendingList) return;

    try {
        const response = await fetch(`${API_URL}/api/top-discussions?limit=5`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const discussions = await response.json();

        if (!discussions.length) {
            trendingList.innerHTML = "<div class=\"trending-item\">No top discussions yet.</div>";
            return;
        }

        trendingList.innerHTML = discussions.map((discussion, index) => `
            <a class="trending-item" href="post.html?id=${encodeURIComponent(discussion._id)}">
                <span class="trending-rank">${String(index + 1).padStart(2, "0")}</span>
                <div class="trending-details">
                    <h4>${escapeHTML(discussion.title)}</h4>
                    <span>${formatCount(discussion.likes)} likes · ${formatCount(discussion.commentCount)} comments</span>
                </div>
            </a>
        `).join("");
    } catch (error) {
        console.error("Error loading top discussions:", error);
        trendingList.innerHTML = "<div class=\"trending-item\">Unable to load discussions.</div>";
    }
}

// The sidebar shows only the three most recent so one long announcement
// cannot push everything else below the fold.
async function loadAnnouncements() {
    if (!announcementsList) return;

    try {
        const response = await fetch(`${API_URL}/api/announcements`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const announcements = await response.json();

        if (!announcements.length) {
            announcementsList.innerHTML = "<div class=\"announcement-item\">No announcements yet.</div>";
            return;
        }

        const recent = announcements.slice(0, 3);
        const extra = announcements.length - recent.length;

        announcementsList.innerHTML = recent.map(announcement => `
            <div class="announcement-item">
                <p><strong>${escapeHTML(announcement.title)}</strong><br>${escapeHTML(announcement.message)}</p>
                <span>${new Date(announcement.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric"
                })}</span>
            </div>
        `).join("") + (extra > 0
            ? `<p class="announcement-more">+${extra} more announcement${extra === 1 ? "" : "s"}</p>`
            : "");
    } catch (error) {
        console.error("Error loading announcements:", error);
        announcementsList.innerHTML = "<div class=\"announcement-item\">Unable to load announcements.</div>";
    }
}

// Widget polling: keeps trending, announcements and hero stats fresh without
// a full feed reload. Started once the first load has finished.
let widgetPollTimer = null;

function startWidgetPolling() {
    if (widgetPollTimer) return;

    widgetPollTimer = window.setInterval(() => {
        loadTopDiscussions();
        loadCommunityStats();
    }, 60000);
}

// =====================================================
// NOTIFICATIONS
// =====================================================

async function loadUnreadCount() {
    if (!token || !notificationBadge) return;

    try {
        const response = await authFetch(
            `${API_URL}/api/notifications/unread-count`
        );

        if (!response.ok) return;

        const data = await response.json();
        const count = Number(data.unreadCount) || 0;

        if (count > 0) {
            notificationBadge.textContent = count > 99 ? "99+" : String(count);
            notificationBadge.classList.remove("is-hidden");
        } else {
            notificationBadge.classList.add("is-hidden");
        }
    } catch (error) {
        if (error.message.startsWith("Session expired")) return;
        // Silent: the badge is a nice-to-have, not a blocker.
    }
}

async function loadNotifications() {
    if (!token || !notificationList) return;

    try {
        const response = await authFetch(
            `${API_URL}/api/notifications?limit=15`
        );

        if (!response.ok) return;

        const data = await response.json();
        const items = data.notifications || [];

        if (!items.length) {
            notificationList.innerHTML =
                '<p class="notification-empty">No notifications yet.</p>';
            return;
        }

        notificationList.innerHTML = items.map((item) => `
            <button class="notification-item ${item.read ? "" : "unread"}"
                type="button" data-id="${escapeHTML(item._id)}"
                data-link="${escapeHTML(item.link || "")}">
                <strong>${escapeHTML(item.title)}</strong>
                <p>${escapeHTML(item.message)}</p>
                <span>${escapeHTML(timeAgo(item.createdAt))}</span>
            </button>
        `).join("");

        notificationList
            .querySelectorAll(".notification-item")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    openNotification(button.dataset.id, button.dataset.link);
                });
            });
    } catch (error) {
        if (error.message.startsWith("Session expired")) return;
        console.error("Error loading notifications:", error);
    }
}

async function openNotification(id, link) {
    try {
        if (id) {
            await authFetch(
                `${API_URL}/api/notifications/${encodeURIComponent(id)}/read`,
                { method: "PATCH" }
            );
        }
    } catch {
        // Navigation should still happen even if the read-mark fails.
    }

    notificationDropdown?.classList.remove("show");
    loadUnreadCount();

    if (link) {
        // Only same-origin relative links are followed.
        if (/^[a-z0-9./?=&_-]+$/i.test(link)) {
            window.location.href = link;
        }
    }
}

notificationBtn?.addEventListener("click", (event) => {
    event.stopPropagation();

    if (!token) return;

    notificationDropdown?.classList.toggle("show");
    profileDropdown?.classList.remove("show");

    if (notificationDropdown?.classList.contains("show")) {
        loadNotifications();
    }
});

markAllReadBtn?.addEventListener("click", async () => {
    if (!token) return;

    try {
        await authFetch(
            `${API_URL}/api/notifications/read-all`,
            { method: "PATCH" }
        );

        notificationBadge?.classList.add("is-hidden");
        await loadNotifications();
    } catch (error) {
        if (error.message.startsWith("Session expired")) return;
        showToast("Could not update notifications.", "error");
    }
});

// =====================================================
// FEED SUBTITLE
// =====================================================

const VIEW_LABELS = {
    home: "Latest discussions",
    saved: "Your saved discussions",
    myposts: "Your discussions"
};

function updateFeedSubtitle(count) {
    if (!feedSubtitle) return;

    const label = VIEW_LABELS[activeView] || VIEW_LABELS.home;
    const noun = count === 1 ? "post" : "posts";

    let text = `${label} · ${count} ${noun}`;

    if (selectedCategory !== "All") {
        text += ` in ${selectedCategory}`;
    }

    if (currentSearch.trim()) {
        text += ` matching "${currentSearch.trim()}"`;
    }

    feedSubtitle.textContent = text;
}

// =====================================================
// DISPLAY POSTS
// =====================================================

function displayPosts() {
    if (!postsContainer) return;

    let posts = [...allPosts];

    const savedIds = JSON.parse(
        localStorage.getItem(SAVED_KEY) || "[]"
    );

    // Home and Saved show only publicly visible posts. My Posts keeps the
    // author's own flagged / under-review posts, badged, so moderation never
    // makes content silently disappear for its owner.
    if (activeView !== "myposts") {
        posts = posts.filter(
            (post) =>
                !(
                    post.isOwner &&
                    (post.status === "flagged" || post.isUnderReview)
                )
        );
    }

    // View filter
    if (activeView === "saved") {
        posts = posts.filter(post =>
            savedIds.includes(post._id)
        );
    }

    if (activeView === "myposts") {
        posts = posts.filter(post => post.isOwner);
    }

    // Category filter
    if (selectedCategory !== "All") {
        posts = posts.filter(
            post => post.category === selectedCategory
        );
    }

    // Search
    if (currentSearch.trim()) {
        const query = currentSearch.toLowerCase().trim();

        posts = posts.filter(post =>
            String(post.title || "").toLowerCase().includes(query) ||
            String(post.content || "").toLowerCase().includes(query) ||
            String(post.author || "").toLowerCase().includes(query) ||
            String(post.category || "").toLowerCase().includes(query)
        );
    }

    // Sort
    posts.sort((a, b) => {
        if (currentSort === "oldest") {
            return new Date(a.createdAt) - new Date(b.createdAt);
        }

        if (currentSort === "popular") {
            return (b.likes || 0) - (a.likes || 0);
        }

        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    updateFeedSubtitle(posts.length);

    // Empty state
    if (posts.length === 0) {
        let title = "No Discussions Yet";
        let message = "Be the first to start a discussion!";

        if (activeView === "saved") {
            title = "No Saved Posts";
            message = "Save posts using the bookmark button.";
        }

        if (activeView === "myposts") {
            title = "No Posts Yet";
            message = "Posts you create will appear here.";
        }

        if (currentSearch.trim()) {
            title = "No Results Found";
            message = "Try a different search term.";
        }

        const showCreate =
            !isStaffViewer() &&
            !currentSearch.trim() &&
            activeView !== "saved";

        postsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <svg class="icon" aria-hidden="true"><use href="#i-inbox"></use></svg>
                </div>
                <h3>${title}</h3>
                <p>${message}</p>

                ${showCreate
                    ? `
                        <button
                            class="btn-create-post-banner mt-1"
                            id="empty-create-btn"
                            type="button"
                        >
                            <svg class="icon" aria-hidden="true"><use href="#i-plus"></use></svg>
                            Create Post
                        </button>
                    `
                    : ""}
            </div>
        `;

        document
            .getElementById("empty-create-btn")
            ?.addEventListener("click", openModal);

        return;
    }

    postsContainer.innerHTML = "";

    posts.forEach(post => {
        renderPostCard(post, savedIds);
    });
}

// =====================================================
// POST CARD
// =====================================================

function renderPostCard(post, savedIds) {
    const isSaved = savedIds.includes(post._id);

    const likeCount = post.likes || 0;
    const commentCount =
        typeof post.commentCount === "number"
            ? post.commentCount
            : (post.comments || []).length;

    const isMyPost = Boolean(post.isOwner);

    const isFlagged = post.status === "flagged";
    const isUnderReview = Boolean(post.isUnderReview) && !isFlagged;

    const card = document.createElement("article");

    card.className = "post-card";
    card.dataset.postId = post._id;

    const statusChips = isFlagged
        ? '<span class="status-chip flagged">Flagged</span>'
        : isUnderReview
            ? '<span class="status-chip under-review">Under review</span>'
            : "";

    card.innerHTML = `
        <div class="post-header">

            <div class="author-info">
                <div class="author-avatar">
                    ${escapeHTML(getInitials(post.author))}
                </div>

                <div class="author-meta">
                    <span class="author-name">
                        ${escapeHTML(post.author)}
                    </span>

                    <span class="post-timestamp">
                        ${escapeHTML(timeAgo(post.createdAt))}
                    </span>
                </div>
            </div>

            <div class="post-header-right">

                <span class="category-tag cat-${getCategorySlug(post.category)}">
                    <span class="cat-dot"></span>
                    ${escapeHTML(post.category)}
                </span>

                ${statusChips}

                ${isMyPost
                    ? `
                        <button
                            class="action-btn delete-post-btn"
                            data-id="${post._id}"
                            type="button"
                            title="Delete post"
                            aria-label="Delete your post ${escapeHTML(post.title)}"
                        >
                            ${ICONS.trash}
                        </button>
                    `
                    : ""}
            </div>
        </div>

        <div class="post-body">
            <h3><a class="post-title-link" href="post.html?id=${encodeURIComponent(post._id)}">${escapeHTML(post.title)}</a></h3>

            <p class="post-content-text">
                ${escapeHTML(post.content)}
            </p>

            ${renderAttachmentPreview(post.attachment)}
        </div>

        <div class="post-footer">

            <div class="post-actions-group">

                <button
                    class="action-btn like-btn"
                    data-id="${post._id}"
                    type="button"
                    aria-label="Like this post"
                    aria-pressed="false"
                >
                    ${ICONS.heart}
                    <span class="like-count">
                        ${likeCount}
                    </span>
                </button>

                <a class="action-btn comment-btn"
                    href="post.html?id=${encodeURIComponent(post._id)}#comments"
                    aria-label="View ${commentCount} comments">
                    ${ICONS.comment}
                    <span>
                        ${commentCount}
                    </span>
                </a>

            </div>

            <div class="post-actions-group">

                <button
                    class="action-btn share-btn"
                    type="button"
                    aria-label="Share this post"
                >
                    ${ICONS.share} Share
                </button>

                <button
                    class="action-btn save-btn ${isSaved ? "saved" : ""}"
                    data-id="${post._id}"
                    type="button"
                    aria-pressed="${isSaved ? "true" : "false"}"
                    aria-label="${isSaved ? "Remove from saved posts" : "Save this post"}"
                >
                    ${ICONS.bookmark} ${isSaved ? "Saved" : "Save"}
                </button>

                ${canReportPost(post) ? reportButtonHTML(post) : ""}

            </div>

        </div>
    `;

    // Like
    card
        .querySelector(".like-btn")
        ?.addEventListener("click", () => {
            toggleLike(post._id, card.querySelector(".like-btn"));
        });

    // Save
    card
        .querySelector(".save-btn")
        ?.addEventListener("click", () => {
            toggleSave(post._id);
        });

    // Share
    card
        .querySelector(".share-btn")
        ?.addEventListener("click", () => {
            sharePost(post);
        });

    // Report
    card
        .querySelector(".report-btn")
        ?.addEventListener("click", () => {
            openReportModal(post);
        });

    // Delete
    card
        .querySelector(".delete-post-btn")
        ?.addEventListener("click", () => {
            deletePost(post._id);
        });

    postsContainer.appendChild(card);
}

// Image attachments render as a thumbnail; every other type renders as a
// labelled file chip that opens in a new tab.
function renderAttachmentPreview(attachment) {
    if (!attachment || !attachment.filename) {
        return "";
    }

    const href = `uploads/${encodeURIComponent(attachment.filename)}`;
    const name = escapeHTML(attachment.originalName || "attachment");
    const isImage = String(attachment.mimetype || "").startsWith("image/");

    if (isImage) {
        return `
            <a class="post-attachment-image" href="${href}" target="_blank" rel="noopener noreferrer">
                <img src="${href}" alt="${name}" loading="lazy">
            </a>
        `;
    }

    return `
        <a class="post-attachment-file" href="${href}" target="_blank" rel="noopener noreferrer">
            <svg class="icon" aria-hidden="true"><use href="#i-doc"></use></svg>
            <span>${name}</span>
        </a>
    `;
}

// =====================================================
// LIKE
// =====================================================

async function toggleLike(postId, button) {
    try {
        const response = await authFetch(
            `${API_URL}/api/posts/${postId}/like`,
            {
                method: "PATCH"
            }
        );

        if (!response.ok) {
            showToast(
                await friendlyError(
                    response,
                    "Could not update like."
                ),
                "error"
            );

            return;
        }

        const data = await response.json();

        button.classList.toggle("liked", Boolean(data.liked));
        button.innerHTML = `
            ${ICONS.heart}
            <span class="like-count">
                ${escapeHTML(data.likes)}
            </span>
        `;

        button.setAttribute(
            "aria-pressed",
            data.liked ? "true" : "false"
        );

        const post = allPosts.find(
            item => item._id === postId
        );

        if (post) {
            post.likes = data.likes;
        }

        // A like can change the trending order; refresh it in the background.
        loadTopDiscussions();

    } catch (error) {
        if (error.message.startsWith("Session expired")) {
            return;
        }

        console.error("Like error:", error);
        showToast("Could not update like. Please try again.", "error");
    }
}

// =====================================================
// SAVE POSTS
// =====================================================

function toggleSave(postId) {
    let saved = JSON.parse(
        localStorage.getItem(SAVED_KEY) || "[]"
    );

    if (saved.includes(postId)) {
        saved = saved.filter(id => id !== postId);

        showToast(
            "Post removed from saved.",
            "info"
        );
    } else {
        saved.push(postId);

        showToast(
            "Post saved!",
            "success"
        );
    }

    localStorage.setItem(
        SAVED_KEY,
        JSON.stringify(saved)
    );

    displayPosts();
}

// =====================================================
// SHARE
// =====================================================

async function sharePost(post) {
    // The shared URL opens the discussion's own page - description, comments
    // and all - never the whole feed.
    const shareUrl = postPermalink(post._id);

    const shareData = {
        title: post.title,
        text: `${post.title} — SYNAPSE`,
        url: shareUrl
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
            return;
        } catch (error) {
            if (error && error.name === "AbortError") {
                return;
            }
        }
    }

    try {
        await navigator.clipboard.writeText(shareUrl);

        showToast(
            "Link copied to clipboard!",
            "success"
        );

    } catch (error) {
        showToast(
            "Could not copy link.",
            "error"
        );
    }
}

// =====================================================
// LEGACY SHARED-LINK REDIRECT
// =====================================================

// Older shares look like index.html#post-<objectId>. Send them to the
// discussion's own page instead of scrolling the feed.
const SHARED_POST_HASH = /^#post-([0-9a-f]{24})$/i;

(function redirectLegacySharedPost() {
    const match = SHARED_POST_HASH.exec(window.location.hash || "");

    if (match) {
        window.location.replace(`post.html?id=${match[1]}`);
    }
})();

window.addEventListener("hashchange", () => {
    const match = SHARED_POST_HASH.exec(window.location.hash || "");

    if (match) {
        window.location.replace(`post.html?id=${match[1]}`);
    }
});

// =====================================================
// DELETE POST
// =====================================================

async function deletePost(postId) {
    const post = allPosts.find(
        item => item._id === postId
    );

    const title = post?.title || "this discussion";

    const confirmed = await showConfirm(
        "Delete this discussion?",
        `“${title}” will be removed for everyone. This cannot be undone.`,
        "Delete"
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await authFetch(
            `${API_URL}/api/posts/${postId}`,
            {
                method: "DELETE"
            }
        );

        if (!response.ok) {
            throw new Error(
                await friendlyError(
                    response,
                    "Could not delete this discussion."
                )
            );
        }

        allPosts = allPosts.filter(
            item => item._id !== postId
        );

        displayPosts();
        loadTopDiscussions();
        loadCommunityStats();

        showToast(
            "Discussion deleted.",
            "success"
        );

    } catch (error) {
        if (error.message.startsWith("Session expired")) {
            return;
        }

        console.error("Delete error:", error);

        showToast(
            error.message || "Could not delete this discussion.",
            "error"
        );
    }
}

// =====================================================
// REPORT POST
// =====================================================

function canReportPost(post) {
    return Boolean(
        token &&
        currentUser &&
        !isStaffViewer() &&
        !post.isOwner
    );
}

function reportButtonHTML(post) {
    if (reportedPostIds.has(post._id)) {
        return `
            <button
                class="action-btn report-btn reported"
                type="button"
                disabled
                title="You have already reported this post"
                aria-label="You have already reported this post"
            >
                ${ICONS.flag} Reported
            </button>
        `;
    }

    return `
        <button
            class="action-btn report-btn"
            data-id="${post._id}"
            type="button"
            title="Report this post"
            aria-label="Report this post"
        >
            ${ICONS.flag} Report
        </button>
    `;
}

function resetReportForm() {
    reportForm?.reset();

    reportForm
        ?.querySelectorAll(".report-option")
        .forEach(label => label.classList.remove("selected"));
}

function openReportModal(post) {
    if (!reportModal || !post) return;

    if (!requireStudentSession()) return;

    if (reportedPostIds.has(post._id)) {
        showToast(
            "You have already reported this post.",
            "info"
        );
        return;
    }

    reportTargetPostId = post._id;
    reportLastFocusedElement = document.activeElement;

    resetReportForm();

    if (reportPostTitle) {
        reportPostTitle.textContent =
            post.title || "Untitled post";
    }

    reportModal.classList.add("show");

    reportModal
        .querySelector('input[name="report-reason"]')
        ?.focus();
}

function closeReportModal() {
    if (!reportModal?.classList.contains("show")) return;

    reportModal.classList.remove("show");

    resetReportForm();

    reportTargetPostId = null;

    reportLastFocusedElement?.focus();
}

async function submitReport(event) {
    event.preventDefault();

    const postId = reportTargetPostId;

    if (!postId || reportInFlight) return;

    const selectedReason = reportForm?.querySelector(
        'input[name="report-reason"]:checked'
    );

    if (!selectedReason) {
        showToast("Please select a reason.", "error");
        return;
    }

    if (reportedPostIds.has(postId)) {
        showToast(
            "You have already reported this post.",
            "info"
        );
        closeReportModal();
        return;
    }

    reportInFlight = true;

    if (submitReportBtn) {
        submitReportBtn.disabled = true;
        submitReportBtn.textContent = "Submitting...";
    }

    try {
        const response = await authFetch(
            `${API_URL}/api/posts/${postId}/report`,
            {
                method: "POST",
                body: JSON.stringify({
                    reason: selectedReason.value
                })
            }
        );

        if (response.status === 409) {
            reportedPostIds.add(postId);

            if (reportTargetPostId === postId) {
                closeReportModal();
            }

            loadPosts();

            showToast(
                await readError(
                    response,
                    "You have already reported this post."
                ),
                "info"
            );

            return;
        }

        if (!response.ok) {
            throw new Error(
                await friendlyError(
                    response,
                    "Failed to submit report."
                )
            );
        }

        const data = await response.json().catch(() => ({}));

        reportedPostIds.add(postId);

        if (reportTargetPostId === postId) {
            closeReportModal();
        }

        // The reported post is hidden from the public feed now, so reload.
        loadPosts();

        showToast(
            data.message ||
            "Report submitted. This discussion is hidden while a moderator reviews it.",
            "success"
        );

    } catch (error) {
        if (error.message.startsWith("Session expired")) {
            return;
        }

        console.error("Report error:", error);

        showToast(
            error.message || "Failed to submit report.",
            "error"
        );

    } finally {
        reportInFlight = false;

        if (submitReportBtn) {
            submitReportBtn.disabled = false;
            submitReportBtn.textContent = "Submit Report";
        }
    }
}

reportForm?.addEventListener("change", () => {
    reportForm
        .querySelectorAll(".report-option")
        .forEach(label => {
            label.classList.toggle(
                "selected",
                Boolean(label.querySelector("input")?.checked)
            );
        });
});

reportForm?.addEventListener("submit", submitReport);

cancelReportBtn?.addEventListener(
    "click",
    closeReportModal
);

closeReportModalBtn?.addEventListener(
    "click",
    closeReportModal
);

reportModal?.addEventListener("click", event => {
    if (event.target === reportModal) {
        closeReportModal();
    }
});

// =====================================================
// SEARCH
// =====================================================

searchInput?.addEventListener("input", event => {
    currentSearch = event.target.value;
    displayPosts();
});

// =====================================================
// SORT
// =====================================================

sortSelect?.addEventListener("change", event => {
    currentSort = event.target.value;
    displayPosts();
});

// =====================================================
// CATEGORY FILTER
// =====================================================

document
    .querySelectorAll(".category-btn")
    .forEach(button => {

        button.addEventListener("click", () => {

            document
                .querySelectorAll(".category-btn")
                .forEach(btn => {
                    btn.classList.remove("active");
                    btn.setAttribute(
                        "aria-pressed",
                        "false"
                    );
                });

            button.classList.add("active");

            button.setAttribute(
                "aria-pressed",
                "true"
            );

            selectedCategory =
                button.dataset.category || "All";

            displayPosts();
        });

    });

// =====================================================
// NAVIGATION
// =====================================================

function setActiveNav(element, view) {

    document
        .querySelectorAll(".sidebar-btn")
        .forEach(button => {
            button.classList.remove("active");
            button.setAttribute(
                "aria-current",
                "false"
            );
        });

    element?.classList.add("active");

    element?.setAttribute("aria-current", "page");

    activeView = view;

    selectedCategory = "All";

    document
        .querySelectorAll(".category-btn")
        .forEach(button => {
            button.classList.remove("active");
            button.setAttribute(
                "aria-pressed",
                "false"
            );
        });

    const allCategoryBtn = document
        .querySelector(
            '.category-btn[data-category="All"]'
        );

    allCategoryBtn?.classList.add("active");
    allCategoryBtn?.setAttribute("aria-pressed", "true");

    displayPosts();

    document
        .querySelector(".feed-container")
        ?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
}

navHome?.addEventListener("click", () => {
    if (activeView !== "home") {
        window.location.href = "index.html";
        return;
    }

    setActiveNav(navHome, "home");
});

navSaved?.addEventListener("click", () => {
    openDedicatedView("saved");
});

navMyposts?.addEventListener("click", () => {
    openDedicatedView("myposts");
});

if (activeView !== "home") {
    [navHome, navSaved, navMyposts].forEach((button) => {
        button?.classList.remove("active");
        button?.setAttribute("aria-current", "false");
    });

    const activeButton = activeView === "saved" ? navSaved : navMyposts;

    activeButton?.classList.add("active");
    activeButton?.setAttribute("aria-current", "page");

    document.title =
        activeView === "saved"
            ? "Saved Posts - SYNAPSE"
            : "My Posts - SYNAPSE";
}

// =====================================================
// HERO EXPLORE BUTTON
// =====================================================

heroExploreBtn?.addEventListener("click", () => {
    if (activeView !== "home") {
        window.location.href = "index.html";
        return;
    }

    setActiveNav(navHome, "home");

    document
        .querySelector(".feed-container")
        ?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
});

// =====================================================
// CREATE POST MODAL
// =====================================================

let lastFocusedElement = null;

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function openModal() {
    if (!postModal) return;

    lastFocusedElement = document.activeElement;

    postModal.classList.add("show");

    document.getElementById("title")?.focus();
}

function closeModal() {
    if (!postModal || !postModal.classList.contains("show")) {
        return;
    }

    postModal.classList.remove("show");

    postForm?.reset();

    if (postFileInput) {
        postFileInput.value = "";
    }

    updateFileHint();

    lastFocusedElement?.focus();
}

function trapModalFocus(event) {
    if (event.key !== "Tab") {
        return;
    }

    const openDialog = [postModal, reportModal, confirmModal].find(
        modal => modal?.classList.contains("show")
    );

    if (!openDialog) {
        return;
    }

    const focusable = [
        ...openDialog.querySelectorAll(
            FOCUSABLE_SELECTOR
        )
    ].filter(el => el.offsetParent !== null);

    if (focusable.length === 0) {
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

createPostBtn?.addEventListener(
    "click",
    openModal
);

closeModalBtn?.addEventListener(
    "click",
    closeModal
);

cancelPostBtn?.addEventListener(
    "click",
    closeModal
);

postModal?.addEventListener(
    "click",
    event => {
        if (event.target === postModal) {
            closeModal();
        }
    }
);

document.addEventListener(
    "keydown",
    event => {
        if (event.key === "Escape") {
            closeModal();
            closeReportModal();
            closeConfirm(false);
            return;
        }

        trapModalFocus(event);
    }
);

// =====================================================
// FILE ATTACHMENT
// =====================================================

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function updateFileHint() {
    const hint = document.querySelector(".form-hint");

    if (!hint) return;

    const file = postFileInput?.files?.[0];

    if (!file) {
        hint.textContent =
            "Any file up to 5 MB. Images show a preview on the post.";
        hint.classList.remove("error");
        return;
    }

    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);

    hint.textContent = `${file.name} · ${sizeMb} MB`;
    hint.classList.toggle("error", file.size > MAX_UPLOAD_BYTES);
}

postFileInput?.addEventListener("change", updateFileHint);

// =====================================================
// CREATE POST
// =====================================================

postForm?.addEventListener(
    "submit",
    async event => {

        event.preventDefault();

        const title =
            document.getElementById("title")
                ?.value.trim();

        const category =
            document.getElementById("category")
                ?.value;

        const content =
            document.getElementById("content")
                ?.value.trim();

        const publishButton =
            document.getElementById("publish-btn");

        if (!title || !category || !content) {
            showToast(
                "Please fill in all fields.",
                "error"
            );
            return;
        }

        const file = postFileInput?.files?.[0];

        if (file && file.size > MAX_UPLOAD_BYTES) {
            showToast(
                "That file is over 5 MB. Please choose a smaller file.",
                "error"
            );
            return;
        }

        publishButton.disabled = true;
        publishButton.textContent =
            "Publishing...";

        try {
            // FormData so an optional attachment rides along; without a file
            // the request is still multipart, which the API accepts.
            const formData = new FormData();

            formData.append("title", title);
            formData.append("category", category);
            formData.append("content", content);

            if (file) {
                formData.append("attachment", file);
            }

            const response = await authFetch(
                `${API_URL}/api/posts`,
                {
                    method: "POST",
                    body: formData
                }
            );

            if (!response.ok) {
                throw new Error(
                    await friendlyError(
                        response,
                        "Could not publish your post."
                    )
                );
            }

            showToast(
                "Post published successfully!",
                "success"
            );

            closeModal();

            await loadPosts();

        } catch (error) {

            if (error.message.startsWith("Session expired")) {
                return;
            }

            console.error(
                "Create post error:",
                error
            );

            showToast(
                error.message ||
                "Could not publish your post.",
                "error"
            );

        } finally {

            publishButton.disabled = false;
            publishButton.textContent =
                "Publish Post";
        }
    }
);

// =====================================================
// INITIALIZE
// =====================================================

(async function init() {
    if (!requireStudentSession({ allowAdmin: true })) {
        return;
    }

    applyViewerRoleUI();

    try {
        const response = await authFetch(`${API_URL}/api/auth/me`);

        const data = await response.json();

        currentUser = data.user;
        userRole = data.user.role;

        localStorage.setItem(
            "synapse_user",
            JSON.stringify(currentUser)
        );
        localStorage.setItem("synapse_role", userRole);

        applyViewerRoleUI(true);

    } catch (error) {
        if (error.message.startsWith("Session expired")) {
            return;
        }

        console.error("Session validation failed:", error);
    }

    await loadPosts();

    // Notifications: first paint now, then keep the badge warm.
    loadUnreadCount();
    window.setInterval(loadUnreadCount, 60000);

    // Trending / stats keep moving without a manual refresh.
    startWidgetPolling();
})();
