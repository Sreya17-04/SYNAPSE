// =====================================================
// SYNAPSE - STUDENT COMMUNITY
// script.js
// =====================================================

const API_URL = "http://localhost:5000";

// =====================================================
// AUTH
// =====================================================

const token = localStorage.getItem("synapse_token");
const currentUser = JSON.parse(
    localStorage.getItem("synapse_user") || "null"
);
const userRole = localStorage.getItem("synapse_role");

if (!token || !currentUser) {
    window.location.href = "login.html";
}

if (userRole === "admin") {
    window.location.href = "admin.html";
}

// =====================================================
// AUTHORIZED FETCH
// =====================================================

async function authFetch(url, options = {}) {
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

document.getElementById("menu-logout")?.addEventListener("click", () => {
    localStorage.removeItem("synapse_token");
    localStorage.removeItem("synapse_role");
    localStorage.removeItem("synapse_user");

    window.location.href = "login.html";
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

        const response = await fetch(`${API_URL}/api/posts`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        allPosts = await response.json();

        if (statDiscussions) {
            statDiscussions.textContent = allPosts.length;
        }

        displayPosts();

    } catch (error) {
        console.error("Error loading posts:", error);

        postsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <h3>Unable to Load Posts</h3>
                <p>
                    Make sure the SYNAPSE backend is running
                    on port 5000.
                </p>
                <button
                    class="btn-hero-primary"
                    id="retry-posts-btn"
                    type="button"
                    style="margin-top:1rem;"
                >
                    Retry
                </button>
            </div>
        `;

        document
            .getElementById("retry-posts-btn")
            ?.addEventListener("click", loadPosts);

        showToast("Failed to connect to backend.", "error");
    }
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

    // View filter
    if (activeView === "saved") {
        posts = posts.filter(post =>
            savedIds.includes(post._id)
        );
    }

    if (activeView === "myposts") {
        posts = posts.filter(post =>
            post.authorEmail === currentUser?.email ||
            String(post.author || "").toLowerCase() ===
            String(currentUser?.name || "").toLowerCase()
        );
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
                    class="btn-create-post-banner"
                    id="empty-create-btn"
                    type="button"
                    style="margin-top:1rem;"
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

    const isMyPost =
        post.authorEmail === currentUser?.email ||
        String(post.author || "").toLowerCase() ===
        String(currentUser?.name || "").toLowerCase();

    const card = document.createElement("article");

    card.className = "post-card";
    card.dataset.postId = post._id;

    card.innerHTML = `
        <div class="post-header">

            <div class="author-info">
                <div class="author-avatar">
                    ${getInitials(post.author)}
                </div>

                <div class="author-meta">
                    <span class="author-name">
                        ${escapeHTML(post.author)}
                    </span>

                    <span class="post-timestamp">
                        ${timeAgo(post.createdAt)}
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
                >
                    🔗 Share
                </button>

                <button
                    class="action-btn save-btn ${isSaved ? "saved" : ""}"
                    data-id="${post._id}"
                    type="button"
                >
                    🔖 ${isSaved ? "Saved" : "Save"}
                </button>

            </div>

        </div>

        <div
            class="comment-drawer"
            id="drawer-${post._id}"
            style="display:none;"
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
                >

                <button
                    type="button"
                    class="btn-submit-comment"
                    data-id="${post._id}"
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

            drawer.style.display =
                drawer.style.display === "none"
                    ? "block"
                    : "none";
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
            <p style="font-size:0.82rem;color:var(--text-muted);padding:0.5rem 0;">
                No comments yet. Be the first!
            </p>
        `;
    }

    return comments
        .map(comment => `
            <div class="comment-item">

                <div class="comment-avatar">
                    ${getInitials(comment.author)}
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

        if (response.status === 401) {
            showToast("Please log in again.", "error");
            return;
        }

        if (!response.ok) {
            throw new Error("Failed to update like");
        }

        const data = await response.json();

        if (data.liked) {
            button.classList.add("liked");
            button.innerHTML = `
                ❤️
                <span class="like-count">
                    ${data.likes}
                </span>
            `;
        } else {
            button.classList.remove("liked");
            button.innerHTML = `
                👍
                <span class="like-count">
                    ${data.likes}
                </span>
            `;
        }

        const post = allPosts.find(
            item => item._id === postId
        );

        if (post) {
            post.likes = data.likes;
        }

    } catch (error) {
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
            throw new Error("Failed to post comment");
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
                    ${getInitials(data.comment.author)}
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
    const shareData = {
        title: post.title,
        text: `${post.title} — SYNAPSE`,
        url: window.location.href
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
            `${post.title} — SYNAPSE`
        );

        showToast(
            "Post copied to clipboard!",
            "success"
        );

    } catch (error) {
        showToast(
            "Could not copy post.",
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
            const data = await response.json();
            throw new Error(
                data.message || "Failed to delete post"
            );
        }

        allPosts = allPosts.filter(
            item => item._id !== postId
        );

        if (statDiscussions) {
            statDiscussions.textContent =
                allPosts.length;
        }

        displayPosts();

        showToast(
            "Post deleted successfully.",
            "success"
        );

    } catch (error) {
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
                .forEach(btn =>
                    btn.classList.remove("active")
                );

            button.classList.add("active");

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
        .forEach(button =>
            button.classList.remove("active")
        );

    element?.classList.add("active");

    activeView = view;

    selectedCategory = "All";

    document
        .querySelectorAll(".category-btn")
        .forEach(button =>
            button.classList.remove("active")
        );

    document
        .querySelector(
            '.category-btn[data-category="All"]'
        )
        ?.classList.add("active");

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

function openModal() {
    if (!postModal) return;

    postModal.classList.add("show");

    document
        .getElementById("title")
        ?.focus();
}

function closeModal() {
    if (!postModal) return;

    postModal.classList.remove("show");

    postForm?.reset();
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
        }
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
                showToast(
                    "Session expired. Please log in again.",
                    "error"
                );

                setTimeout(() => {
                    window.location.href =
                        "login.html";
                }, 1000);

                return;
            }

            if (!response.ok) {
                const data =
                    await response.json();

                throw new Error(
                    data.message ||
                    "Failed to publish post"
                );
            }

            showToast(
                "Post published successfully!",
                "success"
            );

            closeModal();

            await loadPosts();

        } catch (error) {

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

loadPosts();