// =====================================================
// SYNAPSE - DEPARTMENT COMMUNITY PLATFORM
// Frontend Application - script.js
// =====================================================

const API_URL = "http://localhost:5000";

// =====================================================
// AUTH STATE - Check on load
// =====================================================

const token = localStorage.getItem("synapse_token");
const currentUser = JSON.parse(localStorage.getItem("synapse_user") || "null");
const userRole = localStorage.getItem("synapse_role");

// Auth guard: redirect to login if not authenticated
if (!token || !currentUser) {
    window.location.href = "login.html";
}

// Auth guard: redirect admin to admin dashboard
if (userRole === "admin") {
    window.location.href = "admin.html";
}

// Helper: authorized fetch (always attaches Bearer token)
async function authFetch(url, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        ...(options.headers || {})
    };
    return fetch(url, { ...options, headers });
}

// =====================================================
// DOM ELEMENTS
// =====================================================

const postsContainer = document.getElementById("posts-container");
const postModal = document.getElementById("post-modal");
const createPostBtn = document.getElementById("create-post-btn");
const heroCreateBtn = document.getElementById("hero-create-btn");
const quickPostTrigger = document.getElementById("quick-post-trigger");
const closeModalBtn = document.getElementById("close-modal");
const cancelPostBtn = document.getElementById("cancel-post");
const postForm = document.getElementById("post-form");
const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");
const themeToggleBtn = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const profileBtn = document.getElementById("profile-btn");
const profileDropdown = document.getElementById("profile-dropdown");
const toastContainer = document.getElementById("toast-container");
const statDiscussions = document.getElementById("stat-discussions");

// Nav buttons
const navHome = document.getElementById("nav-home");
const navExplore = document.getElementById("nav-explore");
const navSaved = document.getElementById("nav-saved");
const navMyposts = document.getElementById("nav-myposts");

// =====================================================
// APPLICATION STATE
// =====================================================

let allPosts = [];
let selectedCategory = "All";
let activeView = "home"; // home | explore | saved | myposts
let currentSearch = "";
let currentSort = "latest";

// localStorage keys for saved posts
const SAVED_KEY = "synapse_saved_posts";

// =====================================================
// UTILITIES
// =====================================================

function escapeHTML(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getCategoryIcon(cat) {
    const icons = {
        Academic: "📚", Placement: "💼", Events: "📢",
        General: "🌐", Internships: "🚀", Projects: "💻", Other: "📌"
    };
    return icons[cat] || "💬";
}

function getInitials(name) {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function timeAgo(dateStr) {
    if (!dateStr) return "Recently";
    const diff = Date.now() - new Date(dateStr);
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// =====================================================
// TOAST NOTIFICATIONS
// =====================================================

function showToast(message, type = "info") {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icons = { success: "✅", error: "⚠️", info: "ℹ️" };
    toast.innerHTML = `<span>${icons[type] || "ℹ️"}</span><div>${escapeHTML(message)}</div>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(50px)";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// =====================================================
// THEME MANAGEMENT
// =====================================================

function initTheme() {
    const saved = localStorage.getItem("synapse_theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(saved === "dark" || (!saved && prefersDark) ? "dark" : "light");
}

function setTheme(theme) {
    if (theme === "dark") {
        document.body.classList.add("dark-mode");
        if (themeIcon) themeIcon.textContent = "☀️";
        localStorage.setItem("synapse_theme", "dark");
    } else {
        document.body.classList.remove("dark-mode");
        if (themeIcon) themeIcon.textContent = "🌙";
        localStorage.setItem("synapse_theme", "light");
    }
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
        setTheme(document.body.classList.contains("dark-mode") ? "light" : "dark");
    });
}

initTheme();

// =====================================================
// POPULATE NAVBAR WITH USER INFO
// =====================================================

if (currentUser) {
    const nameEl = document.getElementById("profile-name");
    const emailEl = document.getElementById("profile-email");
    const initialsEl = document.getElementById("profile-initials");
    const quickAvatar = document.getElementById("quick-avatar");

    if (nameEl) nameEl.textContent = currentUser.name || "Student";
    if (emailEl) emailEl.textContent = currentUser.email || "";
    if (initialsEl) initialsEl.textContent = getInitials(currentUser.name);
    if (quickAvatar) quickAvatar.textContent = getInitials(currentUser.name);
}

// =====================================================
// PROFILE DROPDOWN
// =====================================================

if (profileBtn && profileDropdown) {
    profileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle("show");
    });

    document.addEventListener("click", (e) => {
        if (!profileDropdown.contains(e.target) && e.target !== profileBtn) {
            profileDropdown.classList.remove("show");
        }
    });
}

// My Posts nav
document.getElementById("menu-my-posts")?.addEventListener("click", () => {
    setActiveNav(navMyposts, "myposts");
    profileDropdown?.classList.remove("show");
});

// Saved Posts nav
document.getElementById("menu-saved-posts")?.addEventListener("click", () => {
    setActiveNav(navSaved, "saved");
    profileDropdown?.classList.remove("show");
});

// Logout
document.getElementById("menu-logout")?.addEventListener("click", () => {
    localStorage.removeItem("synapse_token");
    localStorage.removeItem("synapse_role");
    localStorage.removeItem("synapse_user");
    showToast("Logged out successfully.", "info");
    setTimeout(() => { window.location.href = "login.html"; }, 800);
});

// =====================================================
// SKELETON LOADER
// =====================================================

function renderSkeletons() {
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
            <div class="skeleton-line short"></div>
        </div>
    `;
}

// =====================================================
// FETCH POSTS FROM BACKEND
// =====================================================

async function loadPosts() {
    try {
        renderSkeletons();

        const response = await fetch(`${API_URL}/api/posts`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        allPosts = await response.json();
        console.log("Posts loaded:", allPosts.length);

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
                <p>Ensure the backend is running at <strong>http://localhost:5000</strong></p>
                <button class="btn-hero-primary" onclick="loadPosts()" style="margin-top:1rem;">Retry</button>
            </div>
        `;
        showToast("Failed to connect to backend server", "error");
    }
}

// =====================================================
// DISPLAY / FILTER / SORT POSTS
// =====================================================

function displayPosts() {
    let posts = [...allPosts];
    const savedIds = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");

    // 1. View filter
    if (activeView === "saved") {
        posts = posts.filter(p => savedIds.includes(p._id));
    } else if (activeView === "myposts") {
        posts = posts.filter(p =>
            p.authorEmail === currentUser?.email ||
            (p.author || "").toLowerCase() === (currentUser?.name || "").toLowerCase()
        );
    }

    // 2. Category filter
    if (selectedCategory !== "All") {
        posts = posts.filter(p => p.category === selectedCategory);
    }

    // 3. Search filter
    if (currentSearch.trim()) {
        const q = currentSearch.toLowerCase().trim();
        posts = posts.filter(p =>
            (p.title || "").toLowerCase().includes(q) ||
            (p.content || "").toLowerCase().includes(q) ||
            (p.author || "").toLowerCase().includes(q) ||
            (p.category || "").toLowerCase().includes(q)
        );
    }

    // 4. Sort
    posts.sort((a, b) => {
        if (currentSort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
        if (currentSort === "popular") return (b.likes || 0) - (a.likes || 0);
        return new Date(b.createdAt) - new Date(a.createdAt); // latest
    });

    // 5. Empty state
    if (posts.length === 0) {
        postsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>${activeView === "saved" ? "No Saved Posts" : "No Discussions Yet"}</h3>
                <p>${activeView === "saved" ? "Save posts by clicking the bookmark icon." : "Be the first to start a discussion!"}</p>
                <button class="btn-create-post-banner" id="empty-create-btn" style="margin-top:1rem;">+ Start Discussion</button>
            </div>
        `;
        document.getElementById("empty-create-btn")?.addEventListener("click", openModal);
        return;
    }

    // 6. Render posts
    postsContainer.innerHTML = "";
    posts.forEach(post => renderPostCard(post, savedIds));
}

// =====================================================
// RENDER SINGLE POST CARD
// =====================================================

function renderPostCard(post, savedIds) {
    const isSaved = savedIds.includes(post._id);
    const likeCount = post.likes || 0;
    const commentCount = (post.comments || []).length;
    const isMyPost = post.authorEmail === currentUser?.email ||
        (post.author || "").toLowerCase() === (currentUser?.name || "").toLowerCase();

    const card = document.createElement("article");
    card.className = "post-card";
    card.dataset.postId = post._id;

    card.innerHTML = `
        <div class="post-header">
            <div class="author-info">
                <div class="author-avatar">${getInitials(post.author)}</div>
                <div class="author-meta">
                    <span class="author-name">${escapeHTML(post.author)}</span>
                    <span class="post-timestamp">${timeAgo(post.createdAt)}</span>
                </div>
            </div>
            <div class="post-header-right">
                <span class="category-tag">${getCategoryIcon(post.category)} ${escapeHTML(post.category)}</span>
                ${isMyPost ? `<button class="action-btn delete-post-btn" data-id="${post._id}" style="color:var(--danger);background:transparent;padding:0.3rem;" title="Delete post" type="button">🗑️</button>` : ""}
            </div>
        </div>

        <div class="post-body">
            <h3>${escapeHTML(post.title)}</h3>
            <p class="post-content-text">${escapeHTML(post.content)}</p>
        </div>

        <div class="post-footer">
            <div class="post-actions-group">
                <button class="action-btn like-btn" data-id="${post._id}" type="button" aria-label="Like post">
                    👍 <span class="like-count">${likeCount}</span>
                </button>
                <button class="action-btn comment-btn" data-id="${post._id}" type="button" aria-label="Comment">
                    💬 <span>${commentCount}</span>
                </button>
            </div>
            <div class="post-actions-group">
                <button class="action-btn share-btn" type="button" aria-label="Share post">🔗 Share</button>
                <button class="action-btn save-btn ${isSaved ? "saved" : ""}" data-id="${post._id}" type="button" aria-label="${isSaved ? "Unsave" : "Save"} post">
                    ${isSaved ? "🔖 Saved" : "🔖 Save"}
                </button>
            </div>
        </div>

        <!-- COMMENT DRAWER -->
        <div class="comment-drawer" style="display:none;" id="drawer-${post._id}">
            <div class="comments-list" id="comments-${post._id}">
                ${renderComments(post.comments || [])}
            </div>
            <div class="comment-input-box">
                <input type="text" class="comment-input" id="comment-input-${post._id}" placeholder="Write a comment...">
                <button type="button" class="btn-submit-comment" data-id="${post._id}">Post</button>
            </div>
        </div>
    `;

    // LIKE BUTTON
    const likeBtn = card.querySelector(".like-btn");
    likeBtn.addEventListener("click", () => toggleLike(post._id, likeBtn));

    // COMMENT TOGGLE
    const commentBtn = card.querySelector(".comment-btn");
    commentBtn.addEventListener("click", () => {
        const drawer = document.getElementById(`drawer-${post._id}`);
        if (drawer) drawer.style.display = drawer.style.display === "none" ? "block" : "none";
    });

    // COMMENT SUBMIT
    const submitCommentBtn = card.querySelector(".btn-submit-comment");
    submitCommentBtn?.addEventListener("click", () => submitComment(post._id, card));

    // Comment input also submits on Enter
    const commentInput = card.querySelector(`#comment-input-${post._id}`);
    commentInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submitComment(post._id, card);
    });

    // SAVE BUTTON
    const saveBtn = card.querySelector(".save-btn");
    saveBtn.addEventListener("click", () => toggleSave(post._id, saveBtn));

    // SHARE BUTTON
    const shareBtn = card.querySelector(".share-btn");
    shareBtn.addEventListener("click", () => sharePost(post));

    // DELETE BUTTON (own posts only)
    const deleteBtn = card.querySelector(".delete-post-btn");
    deleteBtn?.addEventListener("click", () => deletePost(post._id));

    postsContainer.appendChild(card);
}

// =====================================================
// RENDER COMMENTS
// =====================================================

function renderComments(comments) {
    if (!comments || comments.length === 0) {
        return `<p style="font-size:0.82rem;color:var(--text-muted);padding:0.5rem 0;">No comments yet. Be the first!</p>`;
    }
    return comments.map(c => `
        <div class="comment-item">
            <div class="comment-avatar">${getInitials(c.author)}</div>
            <div class="comment-content-wrap">
                <strong>${escapeHTML(c.author)}</strong>
                <p>${escapeHTML(c.text)}</p>
            </div>
        </div>
    `).join("");
}

// =====================================================
// LIKE / UNLIKE (MongoDB-backed)
// =====================================================

async function toggleLike(postId, btn) {
    try {
        const response = await authFetch(`${API_URL}/api/posts/${postId}/like`, {
            method: "PATCH"
        });

        if (response.status === 401) {
            showToast("Please log in to like posts.", "error");
            return;
        }

        if (!response.ok) throw new Error("Failed to toggle like");

        const data = await response.json();
        const likeCountSpan = btn.querySelector(".like-count");

        if (data.liked) {
            btn.classList.add("liked");
            btn.innerHTML = `❤️ <span class="like-count">${data.likes}</span>`;
        } else {
            btn.classList.remove("liked");
            btn.innerHTML = `👍 <span class="like-count">${data.likes}</span>`;
        }

        // Update in allPosts array
        const postIndex = allPosts.findIndex(p => p._id === postId);
        if (postIndex > -1) allPosts[postIndex].likes = data.likes;

    } catch (error) {
        console.error("Like error:", error);
        showToast("Could not update like. Try again.", "error");
    }
}

// =====================================================
// SUBMIT COMMENT (MongoDB-backed)
// =====================================================

async function submitComment(postId, card) {
    const inputEl = document.getElementById(`comment-input-${postId}`);
    const text = inputEl?.value.trim();
    if (!text) return;

    const submitBtn = card.querySelector(".btn-submit-comment");
    submitBtn.disabled = true;
    submitBtn.textContent = "Posting...";

    try {
        const response = await authFetch(`${API_URL}/api/posts/${postId}/comment`, {
            method: "POST",
            body: JSON.stringify({ text })
        });

        if (response.status === 401) {
            showToast("Please log in to comment.", "error");
            return;
        }

        if (!response.ok) throw new Error("Failed to post comment");

        const data = await response.json();
        const commentsList = document.getElementById(`comments-${postId}`);
        const newComment = data.comment;

        // Remove "no comments" text if present
        if (commentsList.querySelector("p")) commentsList.innerHTML = "";

        // Append new comment to DOM
        const commentEl = document.createElement("div");
        commentEl.className = "comment-item";
        commentEl.innerHTML = `
            <div class="comment-avatar">${getInitials(newComment.author)}</div>
            <div class="comment-content-wrap">
                <strong>${escapeHTML(newComment.author)}</strong>
                <p>${escapeHTML(newComment.text)}</p>
            </div>
        `;
        commentsList.appendChild(commentEl);

        // Update comment count on button
        const commentBtn = card.querySelector(".comment-btn");
        const postData = allPosts.find(p => p._id === postId);
        if (postData) {
            postData.comments = postData.comments || [];
            postData.comments.push(newComment);
            commentBtn.innerHTML = `💬 <span>${postData.comments.length}</span>`;
        }

        inputEl.value = "";
        showToast("Comment posted!", "success");

    } catch (error) {
        console.error("Comment error:", error);
        showToast("Failed to post comment.", "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Post";
    }
}

// =====================================================
// SAVE POST (localStorage)
// =====================================================

function toggleSave(postId, btn) {
    let saved = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    if (saved.includes(postId)) {
        saved = saved.filter(id => id !== postId);
        btn.classList.remove("saved");
        btn.textContent = "🔖 Save";
        showToast("Post removed from saved.", "info");
    } else {
        saved.push(postId);
        btn.classList.add("saved");
        btn.textContent = "🔖 Saved";
        showToast("Post saved to bookmarks!", "success");
    }
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));

    // If we're in saved view, refresh
    if (activeView === "saved") displayPosts();
}

// =====================================================
// SHARE POST
// =====================================================

async function sharePost(post) {
    const shareData = {
        title: post.title,
        text: `${post.title} — shared from SYNAPSE Department Community`,
        url: window.location.href
    };
    if (navigator.share) {
        try { await navigator.share(shareData); return; } catch (_) {}
    }
    try {
        await navigator.clipboard.writeText(`${post.title} — SYNAPSE`);
        showToast("Link copied to clipboard!", "success");
    } catch (_) {
        showToast("Could not copy link.", "error");
    }
}

// =====================================================
// DELETE OWN POST (MongoDB)
// =====================================================

async function deletePost(postId) {
    if (!confirm("Are you sure you want to delete this post? This cannot be undone.")) return;

    try {
        const response = await authFetch(`${API_URL}/api/posts/${postId}`, {
            method: "DELETE"
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || "Failed to delete");
        }

        allPosts = allPosts.filter(p => p._id !== postId);
        displayPosts();
        showToast("Post deleted successfully.", "success");

    } catch (error) {
        console.error("Delete error:", error);
        showToast(error.message || "Failed to delete post.", "error");
    }
}

// =====================================================
// SEARCH, SORT & CATEGORY FILTERS
// =====================================================

searchInput?.addEventListener("input", (e) => {
    currentSearch = e.target.value;
    displayPosts();
});

sortSelect?.addEventListener("change", (e) => {
    currentSort = e.target.value;
    displayPosts();
});

document.querySelectorAll(".category-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".category-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        selectedCategory = btn.getAttribute("data-category");
        displayPosts();
    });
});

// =====================================================
// SIDEBAR NAVIGATION
// =====================================================

function setActiveNav(el, view) {
    [navHome, navExplore, navSaved, navMyposts].forEach(b => b?.classList.remove("active"));
    el?.classList.add("active");
    activeView = view;
    selectedCategory = "All";
    document.querySelectorAll(".category-btn").forEach(b => b.classList.remove("active"));
    document.querySelector('.category-btn[data-category="All"]')?.classList.add("active");
    displayPosts();
}

navHome?.addEventListener("click", () => setActiveNav(navHome, "home"));
navExplore?.addEventListener("click", () => setActiveNav(navExplore, "explore"));
navSaved?.addEventListener("click", () => setActiveNav(navSaved, "saved"));
navMyposts?.addEventListener("click", () => setActiveNav(navMyposts, "myposts"));
document.getElementById("hero-explore-btn")?.addEventListener("click", () => setActiveNav(navExplore, "explore"));

// =====================================================
// CREATE POST MODAL
// =====================================================

function openModal() {
    postModal?.classList.add("show");
    document.getElementById("title")?.focus();
}

function closeModal() {
    postModal?.classList.remove("show");
    postForm?.reset();
}

createPostBtn?.addEventListener("click", openModal);
heroCreateBtn?.addEventListener("click", openModal);
quickPostTrigger?.addEventListener("click", openModal);
quickPostTrigger?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") openModal(); });
closeModalBtn?.addEventListener("click", closeModal);
cancelPostBtn?.addEventListener("click", closeModal);
postModal?.addEventListener("click", (e) => { if (e.target === postModal) closeModal(); });

// Escape key closes modal
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

// =====================================================
// CREATE POST FORM SUBMISSION (MongoDB)
// =====================================================

postForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = document.getElementById("title").value.trim();
    const category = document.getElementById("category").value;
    const content = document.getElementById("content").value.trim();
    const publishBtn = document.getElementById("publish-btn");

    if (!title || !category || !content) {
        showToast("Please fill in all fields.", "error");
        return;
    }

    publishBtn.disabled = true;
    publishBtn.textContent = "Publishing...";

    try {
        const response = await authFetch(`${API_URL}/api/posts`, {
            method: "POST",
            body: JSON.stringify({ title, category, content })
        });

        if (response.status === 401) {
            showToast("Session expired. Please log in again.", "error");
            setTimeout(() => { window.location.href = "login.html"; }, 1500);
            return;
        }

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || "Failed to publish");
        }

        const newPost = await response.json();
        console.log("Post created:", newPost);

        showToast("Post published successfully!", "success");
        closeModal();
        await loadPosts();

    } catch (error) {
        console.error("Post creation error:", error);
        showToast(error.message || "Failed to publish post.", "error");
    } finally {
        publishBtn.disabled = false;
        publishBtn.textContent = "Publish Post";
    }
});

// =====================================================
// INIT
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
    loadPosts();
});