// =====================================================
// SYNAPSE - DEPARTMENT COMMUNITY PLATFORM
// Core Frontend JavaScript Engine
// =====================================================

const API_URL = "http://localhost:5000/api/posts";

// Local Storage Keys
const STORAGE_KEYS = {
    THEME: "synapse_theme",
    LIKES: "synapse_liked_posts",
    LIKE_COUNTS: "synapse_like_counts",
    SAVED: "synapse_saved_posts",
    COMMENTS: "synapse_post_comments"
};

// Application State
let allPosts = [];
let selectedCategory = "All";
let activeView = "home"; // 'home', 'explore', 'saved', 'myposts'
let currentSearch = "";
let currentSort = "latest";

// DOM Elements
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

// Nav Buttons
const navHome = document.getElementById("nav-home");
const navExplore = document.getElementById("nav-explore");
const navSaved = document.getElementById("nav-saved");
const navMyposts = document.getElementById("nav-myposts");

// =====================================================
// UTILITY FUNCTIONS & SANITIZATION
// =====================================================

/**
 * Escapes HTML characters to prevent XSS injection
 */
function escapeHTML(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Get category icon mapping
 */
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

/**
 * Get user initials from name
 */
function getInitials(name) {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

/**
 * Reusable Toast Notification System
 */
function showToast(message, type = "info") {
    if (!toastContainer) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let icon = "ℹ️";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "⚠️";

    toast.innerHTML = `
        <span>${icon}</span>
        <div>${escapeHTML(message)}</div>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(50px)";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// =====================================================
// THEME MANAGEMENT (LIGHT / DARK MODE)
// =====================================================

function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
        setTheme("dark");
    } else {
        setTheme("light");
    }
}

function setTheme(theme) {
    if (theme === "dark") {
        document.body.classList.add("dark-mode");
        if (themeIcon) themeIcon.textContent = "☀️";
        if (themeToggleBtn) themeToggleBtn.setAttribute("title", "Switch to Light Mode");
        localStorage.setItem(STORAGE_KEYS.THEME, "dark");
    } else {
        document.body.classList.remove("dark-mode");
        if (themeIcon) themeIcon.textContent = "🌙";
        if (themeToggleBtn) themeToggleBtn.setAttribute("title", "Switch to Dark Mode");
        localStorage.setItem(STORAGE_KEYS.THEME, "light");
    }
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
        const isDark = document.body.classList.contains("dark-mode");
        setTheme(isDark ? "light" : "dark");
    });
}

initTheme();

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

    document.getElementById("menu-my-posts")?.addEventListener("click", () => {
        setActiveNav(navMyposts, "myposts");
        profileDropdown.classList.remove("show");
    });

    document.getElementById("menu-saved-posts")?.addEventListener("click", () => {
        setActiveNav(navSaved, "saved");
        profileDropdown.classList.remove("show");
    });

    document.getElementById("menu-settings")?.addEventListener("click", () => {
        showToast("Settings panel coming soon!", "info");
        profileDropdown.classList.remove("show");
    });

    document.getElementById("menu-logout")?.addEventListener("click", () => {
        showToast("Logged out successfully", "info");
        profileDropdown.classList.remove("show");
    });
}

// =====================================================
// SKELETON LOADING STATE
// =====================================================

function renderSkeletonLoaders() {
    postsContainer.innerHTML = `
        <div class="skeleton-card">
            <div class="skeleton-line title"></div>
            <div class="skeleton-line short"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
        </div>
        <div class="skeleton-card">
            <div class="skeleton-line title"></div>
            <div class="skeleton-line short"></div>
            <div class="skeleton-line"></div>
        </div>
    `;
}

// =====================================================
// FETCH POSTS FROM BACKEND
// =====================================================

async function loadPosts() {
    try {
        renderSkeletonLoaders();

        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        allPosts = await response.json();
        console.log("SYNAPSE API Posts Loaded:", allPosts);

        // Update hero discussions counter dynamically
        if (statDiscussions) {
            statDiscussions.textContent = allPosts.length > 0 ? (356 + allPosts.length) : "356";
        }

        displayPosts();

    } catch (error) {
        console.error("Error loading posts from API:", error);
        postsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <h3>Unable to Connect to Backend</h3>
                <p>Ensure your server is running at <code>http://localhost:5000/api/posts</code></p>
                <button class="btn-hero-primary" onclick="loadPosts()">Retry Connection</button>
            </div>
        `;
        showToast("Failed to fetch posts from backend", "error");
    }
}

// =====================================================
// DISPLAY POSTS (FILTER, SEARCH, SORT, RENDER)
// =====================================================

function displayPosts() {
    let posts = [...allPosts];

    // LocalStorage State for Likes & Saved
    const likedPosts = JSON.parse(localStorage.getItem(STORAGE_KEYS.LIKES) || "[]");
    const savedPosts = JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED) || "[]");
    const likeCounts = JSON.parse(localStorage.getItem(STORAGE_KEYS.LIKE_COUNTS) || "{}");

    // 1. Navigation View Filter
    if (activeView === "saved") {
        posts = posts.filter(post => savedPosts.includes(post._id));
    } else if (activeView === "myposts") {
        // Filter demo student posts
        posts = posts.filter(post => (post.author || "").toLowerCase().includes("student") || (post.author || "").toLowerCase().includes("sreya"));
    }

    // 2. Category Filter
    if (selectedCategory !== "All") {
        posts = posts.filter(post => post.category === selectedCategory);
    }

    // 3. Search Filter
    if (currentSearch.trim() !== "") {
        const query = currentSearch.toLowerCase().trim();
        posts = posts.filter(post => {
            const title = (post.title || "").toLowerCase();
            const content = (post.content || "").toLowerCase();
            const author = (post.author || "").toLowerCase();
            const category = (post.category || "").toLowerCase();
            return title.includes(query) || content.includes(query) || author.includes(query) || category.includes(query);
        });
    }

    // 4. Sorting
    posts.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);

        if (currentSort === "oldest") {
            return dateA - dateB;
        } else if (currentSort === "popular") {
            const likesA = likeCounts[a._id] || 0;
            const likesB = likeCounts[b._id] || 0;
            return likesB - likesA;
        }
        return dateB - dateA; // default: latest
    });

    // 5. Empty State Check
    if (posts.length === 0) {
        postsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>No discussions found</h3>
                <p>${activeView === 'saved' ? 'You have not saved any posts yet.' : 'Be the first student to start a discussion in this section.'}</p>
                <button class="btn-create-post-banner" id="empty-create-btn" type="button">+ Start Discussion</button>
            </div>
        `;
        document.getElementById("empty-create-btn")?.addEventListener("click", openModal);
        return;
    }

    // 6. Clear Container & Render Posts
    postsContainer.innerHTML = "";

    posts.forEach(post => {
        const postCard = document.createElement("article");
        postCard.className = "post-card";

        const isLiked = likedPosts.includes(post._id);
        const isSaved = savedPosts.includes(post._id);
        const currentLikes = (likeCounts[post._id] !== undefined) ? likeCounts[post._id] : Math.floor(Math.random() * 15) + 5;

        // Date formatting
        let dateText = "Recently";
        if (post.createdAt) {
            const d = new Date(post.createdAt);
            dateText = d.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric"
            });
        }

        postCard.innerHTML = `
            <div class="post-header">
                <div class="author-info">
                    <div class="author-avatar">${getInitials(post.author)}</div>
                    <div class="author-meta">
                        <span class="author-name">${escapeHTML(post.author)}</span>
                        <span class="post-timestamp">${dateText}</span>
                    </div>
                </div>
                <div class="post-header-right">
                    <span class="category-tag">
                        ${getCategoryIcon(post.category)} ${escapeHTML(post.category)}
                    </span>
                </div>
            </div>

            <div class="post-body">
                <h3>${escapeHTML(post.title)}</h3>
                <p class="post-content-text">${escapeHTML(post.content)}</p>
            </div>

            <div class="post-footer">
                <div class="post-actions-group">
                    <button class="action-btn like-btn ${isLiked ? 'liked' : ''}" type="button">
                        ${isLiked ? '❤️' : '👍'} <span class="like-count">${currentLikes}</span>
                    </button>
                    <button class="action-btn comment-btn" type="button">
                        💬 <span class="comment-label">Comment</span>
                    </button>
                </div>
                <div class="post-actions-group">
                    <button class="action-btn share-btn" type="button" title="Share Post">
                        🔗 Share
                    </button>
                    <button class="action-btn save-btn ${isSaved ? 'saved' : ''}" type="button" title="Save Post">
                        ${isSaved ? '🔖 Saved' : '🔖 Save'}
                    </button>
                </div>
            </div>

            <!-- INLINE COMMENTS DRAWER -->
            <div class="comment-drawer" style="display: none;">
                <div class="comments-list"></div>
                <div class="comment-input-box">
                    <input type="text" class="comment-input" placeholder="Write a comment...">
                    <button type="button" class="btn-submit-comment">Post</button>
                </div>
            </div>
        `;

        // Attach Card Event Listeners

        // LIKE BUTTON
        const likeBtn = postCard.querySelector(".like-btn");
        const likeCountSpan = postCard.querySelector(".like-count");
        likeBtn.addEventListener("click", () => {
            let likesArr = JSON.parse(localStorage.getItem(STORAGE_KEYS.LIKES) || "[]");
            let countsObj = JSON.parse(localStorage.getItem(STORAGE_KEYS.LIKE_COUNTS) || "{}");
            let val = parseInt(likeCountSpan.textContent, 10);

            if (likesArr.includes(post._id)) {
                likesArr = likesArr.filter(id => id !== post._id);
                val = Math.max(0, val - 1);
                likeBtn.classList.remove("liked");
                likeBtn.innerHTML = `👍 <span class="like-count">${val}</span>`;
            } else {
                likesArr.push(post._id);
                val = val + 1;
                likeBtn.classList.add("liked");
                likeBtn.innerHTML = `❤️ <span class="like-count">${val}</span>`;
            }

            countsObj[post._id] = val;
            localStorage.setItem(STORAGE_KEYS.LIKES, JSON.stringify(likesArr));
            localStorage.setItem(STORAGE_KEYS.LIKE_COUNTS, JSON.stringify(countsObj));
        });

        // SAVE BUTTON
        const saveBtn = postCard.querySelector(".save-btn");
        saveBtn.addEventListener("click", () => {
            let savedArr = JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED) || "[]");
            if (savedArr.includes(post._id)) {
                savedArr = savedArr.filter(id => id !== post._id);
                saveBtn.classList.remove("saved");
                saveBtn.textContent = "🔖 Save";
                showToast("Post removed from saved", "info");
            } else {
                savedArr.push(post._id);
                saveBtn.classList.add("saved");
                saveBtn.textContent = "🔖 Saved";
                showToast("Post saved to your bookmarks!", "success");
            }
            localStorage.setItem(STORAGE_KEYS.SAVED, JSON.stringify(savedArr));
        });

        // SHARE BUTTON
        const shareBtn = postCard.querySelector(".share-btn");
        shareBtn.addEventListener("click", async () => {
            const shareData = {
                title: post.title,
                text: `${post.title} - Shared from SYNAPSE Department Community`,
                url: window.location.href
            };

            if (navigator.share) {
                try {
                    await navigator.share(shareData);
                } catch (e) {
                    // Fallback to clipboard
                    copyToClipboard(post.title);
                }
            } else {
                copyToClipboard(post.title);
            }
        });

        // COMMENT BUTTON & DRAWER
        const commentBtn = postCard.querySelector(".comment-btn");
        const commentDrawer = postCard.querySelector(".comment-drawer");
        const commentsList = postCard.querySelector(".comments-list");
        const commentInput = postCard.querySelector(".comment-input");
        const commentSubmitBtn = postCard.querySelector(".btn-submit-comment");

        // Load existing stored comments for this post
        const storedComments = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMMENTS) || "{}");
        const postCommentsList = storedComments[post._id] || [];

        function renderComments() {
            if (postCommentsList.length === 0) {
                commentsList.innerHTML = `<p style="font-size: 0.82rem; color: var(--text-muted); padding: 0.25rem;">No comments yet. Start the conversation!</p>`;
                return;
            }
            commentsList.innerHTML = postCommentsList.map(c => `
                <div class="comment-item">
                    <div class="comment-avatar">${getInitials(c.author)}</div>
                    <div class="comment-content-wrap">
                        <strong>${escapeHTML(c.author)}</strong>
                        <p>${escapeHTML(c.text)}</p>
                    </div>
                </div>
            `).join("");
        }

        commentBtn.addEventListener("click", () => {
            const isVisible = commentDrawer.style.display !== "none";
            commentDrawer.style.display = isVisible ? "none" : "block";
            if (!isVisible) renderComments();
        });

        commentSubmitBtn.addEventListener("click", () => {
            const text = commentInput.value.trim();
            if (!text) return;

            postCommentsList.push({
                author: "Student User",
                text: text
            });

            storedComments[post._id] = postCommentsList;
            localStorage.setItem(STORAGE_KEYS.COMMENTS, JSON.stringify(storedComments));

            commentInput.value = "";
            renderComments();
            showToast("Comment added!", "success");
        });

        postsContainer.appendChild(postCard);
    });
}

function copyToClipboard(title) {
    navigator.clipboard.writeText(`${title} - SYNAPSE Community`);
    showToast("Post link copied to clipboard!", "success");
}

// =====================================================
// SEARCH, SORT & CATEGORY EVENT LISTENERS
// =====================================================

// Search Input Listener
if (searchInput) {
    searchInput.addEventListener("input", (e) => {
        currentSearch = e.target.value;
        displayPosts();
    });
}

// Sort Select Listener
if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
        currentSort = e.target.value;
        displayPosts();
    });
}

// Category Buttons Listener
const categoryButtons = document.querySelectorAll(".category-btn");
categoryButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        categoryButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        selectedCategory = btn.getAttribute("data-category");
        displayPosts();
    });
});

// Navigation Bar Items (Home, Explore, Saved, MyPosts)
function setActiveNav(element, viewName) {
    [navHome, navExplore, navSaved, navMyposts].forEach(el => el?.classList.remove("active"));
    element?.classList.add("active");
    activeView = viewName;
    displayPosts();
}

navHome?.addEventListener("click", () => setActiveNav(navHome, "home"));
navExplore?.addEventListener("click", () => setActiveNav(navExplore, "explore"));
navSaved?.addEventListener("click", () => setActiveNav(navSaved, "saved"));
navMyposts?.addEventListener("click", () => setActiveNav(navMyposts, "myposts"));

document.getElementById("hero-explore-btn")?.addEventListener("click", () => {
    setActiveNav(navExplore, "explore");
});

// =====================================================
// CREATE POST MODAL LOGIC & BACKEND POST REQUEST
// =====================================================

function openModal() {
    if (postModal) postModal.classList.add("show");
}

function closeModal() {
    if (postModal) postModal.classList.remove("show");
    if (postForm) postForm.reset();
}

if (createPostBtn) createPostBtn.addEventListener("click", openModal);
if (heroCreateBtn) heroCreateBtn.addEventListener("click", openModal);
if (quickPostTrigger) quickPostTrigger.addEventListener("click", openModal);
if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
if (cancelPostBtn) cancelPostBtn.addEventListener("click", closeModal);

// Close modal when clicking outside modal card
if (postModal) {
    postModal.addEventListener("click", (e) => {
        if (e.target === postModal) closeModal();
    });
}

// Form Submission -> POST to backend
if (postForm) {
    postForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const title = document.getElementById("title").value.trim();
        const author = document.getElementById("author").value.trim();
        const category = document.getElementById("category").value;
        const content = document.getElementById("content").value.trim();

        if (!title || !author || !category || !content) {
            showToast("Please fill in all required fields", "error");
            return;
        }

        try {
            showToast("Publishing discussion...", "info");

            const response = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    title,
                    author,
                    category,
                    content
                })
            });

            if (!response.ok) {
                throw new Error("Failed to create post");
            }

            const createdPost = await response.json();
            console.log("Post published successfully:", createdPost);

            showToast("Post published successfully!", "success");
            closeModal();
            loadPosts();

        } catch (error) {
            console.error("Error publishing post:", error);
            showToast("Failed to publish post. Check backend server.", "error");
        }
    });
}

// =====================================================
// INIT APPLICATION
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
    loadPosts();
});