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

// Clears local auth state and bounces to the login page. Wrapped in a function
// so every caller stops executing instead of falling through with a stale UI.
function requireStudentSession() {
    if (!token || !currentUser) {
        localStorage.removeItem("synapse_token");
        localStorage.removeItem("synapse_role");
        localStorage.removeItem("synapse_user");

        // replace() so Back does not return to a page that immediately
        // redirects again.
        window.location.replace("login.html");
        return false;
    }

    if (userRole === "admin" || currentUser.role === "admin") {
        window.location.replace("admin.html");
        return false;
    }

    return true;
}

// =====================================================
// AUTHORIZED FETCH
// =====================================================

// Every 401 means the token is expired, revoked by a logout elsewhere, or the
// account was suspended. Handle it in one place instead of per-caller.
async function authFetch(url, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
    };

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

    window.location.replace("login.html");
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

// =====================================================
// DOM ELEMENTS
// =====================================================

const postsContainer = document.getElementById("posts-container");

const postModal = document.getElementById("post-modal");
const postForm = document.getElementById("post-form");

const createPostBtn = document.getElementById("create-post-btn");
const heroCreateBtn = document.getElementById("hero-create-btn");
const quickPostTrigger = document.getElementById("quick-post-trigger");

const closeModalBtn = document.getElementById("close-modal");
const cancelPostBtn = document.getElementById("cancel-post");

const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");

const themeToggleBtn = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");

const profileBtn = document.getElementById("profile-btn");
const profileDropdown = document.getElementById("profile-dropdown");

const toastContainer = document.getElementById("toast-container");
const statDiscussions = document.getElementById("stat-discussions");
const statMembers = document.getElementById("stat-members");
const statAnnouncements = document.getElementById("stat-announcements");
const trendingList = document.getElementById("trending-list");
const announcementsList = document.getElementById("announcements-list");
const feedSubtitle = document.getElementById("feed-subtitle");

const navHome = document.getElementById("nav-home");
const navExplore = document.getElementById("nav-explore");
const navSaved = document.getElementById("nav-saved");
const navMyposts = document.getElementById("nav-myposts");

const heroExploreBtn = document.getElementById("hero-explore-btn");

const navLinkHome = document.getElementById("nav-link-home");
const navLinkExplore = document.getElementById("nav-link-explore");

// =====================================================
// STATE
// =====================================================

let allPosts = [];
let selectedCategory = "All";
let activeView = "home";
let currentSearch = "";
let currentSort = "latest";

const SAVED_KEY = "synapse_saved_posts";

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

function getCategoryIcon(category) {
    const icons = {
        Academic: "📚",
        Placement: "💼",
        Events: "📢",
        General: "🌐",
        Internships: "🚀",
        Projects: "💻",
        Other: "📌"
    };

    return icons[category] || "💬";
}

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

// =====================================================
// TOAST
// =====================================================

function showToast(message, type = "info") {
    if (!toastContainer) return;

    const toast = document.createElement("div");

    toast.className = `toast ${type}`;

    const icons = {
        success: "✅",
        error: "⚠️",
        info: "ℹ️"
    };

    toast.innerHTML = `
        <span>${icons[type] || "ℹ️"}</span>
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
// THEME
// =====================================================

function setTheme(theme) {
    if (theme === "dark") {
        document.body.classList.add("dark-mode");

        if (themeIcon) {
            themeIcon.textContent = "☀️";
        }

        localStorage.setItem("synapse_theme", "dark");
    } else {
        document.body.classList.remove("dark-mode");

        if (themeIcon) {
            themeIcon.textContent = "🌙";
        }

        localStorage.setItem("synapse_theme", "light");
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem("synapse_theme");

    if (savedTheme) {
        setTheme(savedTheme);
        return;
    }

    const prefersDark =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;

    setTheme(prefersDark ? "dark" : "light");
}

themeToggleBtn?.addEventListener("click", () => {
    const isDark = document.body.classList.contains("dark-mode");

    setTheme(isDark ? "light" : "dark");
});

initTheme();

// =====================================================
// USER PROFILE
// =====================================================

if (currentUser) {
    const nameElement = document.getElementById("profile-name");
    const emailElement = document.getElementById("profile-email");
    const initialsElement = document.getElementById("profile-initials");
    const quickAvatar = document.getElementById("quick-avatar");

    const name = currentUser.name || "Student";

    if (nameElement) {
        nameElement.textContent = name;
    }

    if (emailElement) {
        emailElement.textContent = currentUser.email || "";
    }

    if (initialsElement) {
        initialsElement.textContent = getInitials(name);
    }

    if (quickAvatar) {
        quickAvatar.textContent = getInitials(name);
    }
}

// =====================================================
// PROFILE DROPDOWN
// =====================================================

profileBtn?.addEventListener("click", (event) => {
    event.stopPropagation();

    profileDropdown?.classList.toggle("show");
});

document.addEventListener("click", (event) => {
    if (
        profileDropdown &&
        !profileDropdown.contains(event.target) &&
        event.target !== profileBtn
    ) {
        profileDropdown.classList.remove("show");
    }
});

// =====================================================
// PROFILE MENU
// =====================================================

document.getElementById("menu-my-posts")?.addEventListener("click", () => {
    setActiveNav(navMyposts, "myposts");
    profileDropdown?.classList.remove("show");
});

document.getElementById("menu-saved-posts")?.addEventListener("click", () => {
    setActiveNav(navSaved, "saved");
    profileDropdown?.classList.remove("show");
});

// =====================================================
// LOGOUT
// =====================================================

document.getElementById("menu-logout")?.addEventListener("click", async () => {
    try {
        // Ask the server to bump tokenVersion first, so a copy of the token
        // that survives this tab cannot be replayed until it expires.
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

        // Sent with the request so the server can mark which posts are the
        // caller's own (the public feed no longer exposes authorEmail).
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
                <div class="empty-icon">⚠️</div>
                <h3>Unable to Load Posts</h3>
                <p>
                    Could not reach the SYNAPSE API. Check that the
                    backend is running and reload.
                </p>
                <button
                    class="btn-hero-primary mt-1"
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

// The hero stats were hardcoded placeholders (1,240 / 356 / 48). This reads
// the real aggregate counts instead.
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

        // The feed endpoint is capped at 100 posts, so use the server's true
        // total rather than allPosts.length (which saturated at 100).
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

async function loadTopDiscussions() {
    if (!trendingList) return;

    try {
        const response = await fetch(`${API_URL}/api/top-discussions`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const discussions = await response.json();

        if (!discussions.length) {
            trendingList.innerHTML = "<div class=\"trending-item\">No top discussions yet.</div>";
            return;
        }

        trendingList.innerHTML = discussions.map((discussion, index) => `
            <div class="trending-item">
                <span class="trending-rank">${String(index + 1).padStart(2, "0")}</span>
                <div class="trending-details">
                    <h4>${escapeHTML(discussion.title)}</h4>
                    <span>${escapeHTML(discussion.likes ?? 0)} likes</span>
                </div>
            </div>
        `).join("");
    } catch (error) {
        console.error("Error loading top discussions:", error);
        trendingList.innerHTML = "<div class=\"trending-item\">Unable to load discussions.</div>";
    }
}

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

        announcementsList.innerHTML = announcements.map(announcement => `
            <div class="announcement-item">
                <p><strong>${escapeHTML(announcement.title)}</strong><br>${escapeHTML(announcement.message)}</p>
                <span>${new Date(announcement.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric"
                })}</span>
            </div>
        `).join("");
    } catch (error) {
        console.error("Error loading announcements:", error);
        announcementsList.innerHTML = "<div class=\"announcement-item\">Unable to load announcements.</div>";
    }
}

// =====================================================
// FEED SUBTITLE
// =====================================================

// #feed-subtitle existed in the markup but was never written to, so it always
// showed its static placeholder regardless of filters.
const VIEW_LABELS = {
    home: "Latest discussions",
    explore: "Most liked discussions",
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

function displayPosts() {    if (!postsContainer) return;

    let posts = [...allPosts];

    const savedIds = JSON.parse(
        localStorage.getItem(SAVED_KEY) || "[]"
    );

    // View filter
    if (activeView === "saved") {
        posts = posts.filter(post =>
            savedIds.includes(post._id)
        );
    }

    if (activeView === "myposts") {
        // isOwner is computed server-side now that authorEmail is not public.
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

    // Sort. "explore" is a real view, not an alias for home: it ranks by
    // engagement instead of recency so the button does something.
    const effectiveSort = activeView === "explore" ? "popular" : currentSort;

    posts.sort((a, b) => {
        if (effectiveSort === "oldest") {
            return new Date(a.createdAt) - new Date(b.createdAt);
        }

        if (effectiveSort === "popular") {
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

        postsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>${title}</h3>
                <p>${message}</p>

                <button
                    class="btn-create-post-banner mt-1"
                    id="empty-create-btn"
                    type="button"
                >
                    + Create Post
                </button>
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
    const commentCount = (post.comments || []).length;

    // Server-computed: the public feed no longer exposes authorEmail.
    const isMyPost = Boolean(post.isOwner);

    const card = document.createElement("article");

    card.className = "post-card";
    card.dataset.postId = post._id;

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

                <span class="category-tag">
                    ${getCategoryIcon(post.category)}
                    ${escapeHTML(post.category)}
                </span>

                ${isMyPost
            ? `
                            <button
                                class="action-btn delete-post-btn"
                                data-id="${post._id}"
                                type="button"
                                title="Delete post"
                                aria-label="Delete your post ${escapeHTML(post.title)}"
                            >
                                🗑️
                            </button>
                        `
            : ""
        }

            </div>
        </div>

        <div class="post-body">
            <h3>${escapeHTML(post.title)}</h3>

            <p class="post-content-text">
                ${escapeHTML(post.content)}
            </p>
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
                    👍
                    <span class="like-count">
                        ${likeCount}
                    </span>
                </button>

                <button
                    class="action-btn comment-btn"
                    data-id="${post._id}"
                    type="button"
                    aria-label="Show ${commentCount} comments"
                    aria-expanded="false"
                >
                    💬
                    <span>
                        ${commentCount}
                    </span>
                </button>

            </div>

            <div class="post-actions-group">

                <button
                    class="action-btn share-btn"
                    type="button"
                    aria-label="Share this post"
                >
                    🔗 Share
                </button>

                <button
                    class="action-btn save-btn ${isSaved ? "saved" : ""}"
                    data-id="${post._id}"
                    type="button"
                    aria-pressed="${isSaved ? "true" : "false"}"
                    aria-label="${isSaved ? "Remove from saved posts" : "Save this post"}"
                >
                    🔖 ${isSaved ? "Saved" : "Save"}
                </button>

            </div>

        </div>

        <div
            class="comment-drawer is-hidden"
            id="drawer-${post._id}"
        >

            <div
                class="comments-list"
                id="comments-${post._id}"
            >
                ${renderComments(post.comments || [])}
            </div>

            <div class="comment-input-box">

                <input
                    type="text"
                    class="comment-input"
                    id="comment-input-${post._id}"
                    placeholder="Write a comment..."
                    aria-label="Write a comment"
                >

                <button
                    type="button"
                    class="btn-submit-comment"
                    data-id="${post._id}"
                    aria-label="Post your comment"
                >
                    Post
                </button>

            </div>

        </div>
    `;

    // Like
    card
        .querySelector(".like-btn")
        ?.addEventListener("click", () => {
            toggleLike(post._id, card.querySelector(".like-btn"));
        });

    // Comments
    card
        .querySelector(".comment-btn")
        ?.addEventListener("click", () => {
            const drawer = document.getElementById(
                `drawer-${post._id}`
            );

            if (!drawer) return;

            const isHidden =
                drawer.style.display === "none";

            drawer.style.display = isHidden
                ? "block"
                : "none";

            card
                .querySelector(".comment-btn")
                ?.setAttribute(
                    "aria-expanded",
                    isHidden ? "true" : "false"
                );

            if (isHidden) {
                drawer
                    .querySelector(".comment-input")
                    ?.focus();
            }
        });

    // Submit comment
    card
        .querySelector(".btn-submit-comment")
        ?.addEventListener("click", () => {
            submitComment(post._id, card);
        });

    // Enter comment
    card
        .querySelector(".comment-input")
        ?.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                submitComment(post._id, card);
            }
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

    // Delete
    card
        .querySelector(".delete-post-btn")
        ?.addEventListener("click", () => {
            deletePost(post._id);
        });

    postsContainer.appendChild(card);
}

// =====================================================
// COMMENTS
// =====================================================

function renderComments(comments) {
    if (!comments || comments.length === 0) {
        return `
            <p class="comment-empty">
                No comments yet. Be the first!
            </p>
        `;
    }

    return comments
        .map(comment => `
            <div class="comment-item">

            <div class="comment-avatar">
                ${escapeHTML(getInitials(comment.author))}
            </div>

                <div class="comment-content-wrap">

                    <strong>
                        ${escapeHTML(comment.author)}
                    </strong>

                    <p>
                        ${escapeHTML(comment.text)}
                    </p>

                </div>

            </div>
        `)
        .join("");
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
                await readError(
                    response,
                    "Could not update like."
                ),
                "error"
            );

            return;
        }

        const data = await response.json();

        if (data.liked) {
            button.classList.add("liked");
            button.innerHTML = `
                ❤️
                <span class="like-count">
                    ${escapeHTML(data.likes)}
                </span>
            `;
        } else {
            button.classList.remove("liked");
            button.innerHTML = `
                👍
                <span class="like-count">
                    ${escapeHTML(data.likes)}
                </span>
            `;
        }

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

    } catch (error) {
        if (error.message.startsWith("Session expired")) {
            return;
        }

        console.error("Like error:", error);
        showToast("Could not update like.", "error");
    }
}

// =====================================================
// COMMENT
// =====================================================

async function submitComment(postId, card) {
    const input = card.querySelector(".comment-input");

    if (!input) return;

    const text = input.value.trim();

    if (!text) return;

    const button = card.querySelector(
        ".btn-submit-comment"
    );

    button.disabled = true;
    button.textContent = "Posting...";

    try {
        const response = await authFetch(
            `${API_URL}/api/posts/${postId}/comment`,
            {
                method: "POST",
                body: JSON.stringify({ text })
            }
        );

        if (!response.ok) {
            showToast(
                await readError(
                    response,
                    "Failed to post comment."
                ),
                "error"
            );

            return;
        }

        const data = await response.json();

        const commentsList = card.querySelector(
            ".comments-list"
        );

        if (commentsList) {
            const noComments = commentsList.querySelector("p");

            if (noComments) {
                commentsList.innerHTML = "";
            }

            const comment = document.createElement("div");

            comment.className = "comment-item";

            comment.innerHTML = `
                <div class="comment-avatar">
                    ${escapeHTML(getInitials(data.comment.author))}
                </div>

                <div class="comment-content-wrap">
                    <strong>
                        ${escapeHTML(data.comment.author)}
                    </strong>

                    <p>
                        ${escapeHTML(data.comment.text)}
                    </p>
                </div>
            `;

            commentsList.appendChild(comment);
        }

        const post = allPosts.find(
            item => item._id === postId
        );

        if (post) {
            post.comments = post.comments || [];
            post.comments.push(data.comment);

            const commentButton =
                card.querySelector(".comment-btn");

            if (commentButton) {
                commentButton.innerHTML = `
                    💬
                    <span>
                        ${post.comments.length}
                    </span>
                `;
            }
        }

        input.value = "";

        showToast("Comment posted!", "success");

    } catch (error) {
        if (error.message.startsWith("Session expired")) {
            return;
        }

        console.error("Comment error:", error);
        showToast("Failed to post comment.", "error");
    } finally {
        button.disabled = false;
        button.textContent = "Post";
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
    // Deep-link to the post instead of sharing the generic feed URL, so the
    // recipient lands on the right discussion.
    const shareUrl = new URL(
        window.location.href
    );

    shareUrl.hash = `post-${post._id}`;

    const shareData = {
        title: post.title,
        text: `${post.title} — SYNAPSE`,
        url: shareUrl.toString()
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
            return;
        } catch (error) {
            // User cancelled sharing
        }
    }

    try {
        await navigator.clipboard.writeText(
            shareUrl.toString()
        );

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
// DELETE POST
// =====================================================

async function deletePost(postId) {
    const post = allPosts.find(
        item => item._id === postId
    );

    const title = post?.title || "this post";

    if (
        !confirm(
            `Delete "${title}"?\n\nThis cannot be undone.`
        )
    ) {
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
                await readError(
                    response,
                    "Failed to delete post"
                )
            );
        }

        allPosts = allPosts.filter(
            item => item._id !== postId
        );

        displayPosts();

        showToast(
            "Post deleted successfully.",
            "success"
        );

    } catch (error) {
        if (error.message.startsWith("Session expired")) {
            return;
        }

        console.error("Delete error:", error);

        showToast(
            error.message || "Failed to delete post.",
            "error"
        );
    }
}

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

    // Scroll to feed
    document
        .querySelector(".feed-container")
        ?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
}

navHome?.addEventListener("click", () => {
    setActiveNav(navHome, "home");
});

navExplore?.addEventListener("click", () => {
    setActiveNav(navExplore, "explore");
});

navSaved?.addEventListener("click", () => {
    setActiveNav(navSaved, "saved");
});

navMyposts?.addEventListener("click", () => {
    setActiveNav(navMyposts, "myposts");
});

// =====================================================
// TOP NAVIGATION
// =====================================================

navLinkHome?.addEventListener("click", event => {
    event.preventDefault();

    setActiveNav(navHome, "home");
});

navLinkExplore?.addEventListener("click", event => {
    event.preventDefault();

    setActiveNav(navExplore, "explore");
});

// =====================================================
// HERO EXPLORE BUTTON
// =====================================================

heroExploreBtn?.addEventListener("click", () => {
    setActiveNav(navExplore, "explore");
});

// =====================================================
// CREATE POST MODAL
// =====================================================

// The modal declared aria-modal="true" but never trapped focus, so Tab
// walked out into the inert page behind it. Track the trigger so focus can
// be restored on close.
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

    lastFocusedElement?.focus();
}

function trapModalFocus(event) {
    if (event.key !== "Tab" || !postModal?.classList.contains("show")) {
        return;
    }

    const focusable = [
        ...postModal.querySelectorAll(
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

heroCreateBtn?.addEventListener(
    "click",
    openModal
);

quickPostTrigger?.addEventListener(
    "click",
    openModal
);

quickPostTrigger?.addEventListener(
    "keydown",
    event => {
        if (
            event.key === "Enter" ||
            event.key === " "
        ) {
            event.preventDefault();
            openModal();
        }
    }
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
            return;
        }

        trapModalFocus(event);
    }
);

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

        publishButton.disabled = true;
        publishButton.textContent =
            "Publishing...";

        try {

            const response = await authFetch(
                `${API_URL}/api/posts`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        title,
                        category,
                        content
                    })
                }
            );

            if (response.status === 401) {
                handleSessionExpired();

                return;
            }

            if (!response.ok) {
                throw new Error(
                    await readError(
                        response,
                        "Failed to publish post"
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
                "Failed to publish post.",
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

// Validate the cached token against the server before rendering. Previously
// the page only checked that the keys existed in localStorage, so an expired
// 7-day token left a fully populated UI on screen until the first write failed.
(async function init() {
    if (!requireStudentSession()) {
        return;
    }

    try {
        const response = await authFetch(`${API_URL}/api/auth/me`);

        const data = await response.json();

        // Trust the server's copy of the role over localStorage, which is
        // user-writable and could claim admin.
        currentUser = data.user;
        userRole = data.user.role;

        localStorage.setItem(
            "synapse_user",
            JSON.stringify(currentUser)
        );
        localStorage.setItem("synapse_role", userRole);

    } catch (error) {
        if (error.message.startsWith("Session expired")) {
            return;
        }

        console.error("Session validation failed:", error);
    }

    await loadPosts();
})();