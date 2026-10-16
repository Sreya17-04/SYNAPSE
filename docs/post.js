// =====================================================
// SYNAPSE - DISCUSSION DETAIL PAGE
// post.js
// =====================================================

const API_URL = SYNAPSE_API_URL;

// =====================================================
// AUTH
// =====================================================

let token = localStorage.getItem("synapse_token");
let currentUser = JSON.parse(
    localStorage.getItem("synapse_user") || "null"
);
let userRole = localStorage.getItem("synapse_role");

function loginRedirectUrl() {
    const returnTo =
        window.location.pathname +
        window.location.search;

    return `login.html?return=${encodeURIComponent(returnTo)}`;
}

function isStaffViewer() {
    const role = userRole || currentUser?.role;
    return role === "admin" || role === "moderator";
}

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

    window.location.replace(loginRedirectUrl());
}

async function readError(response, fallback) {
    try {
        const text = await response.text();

        if (!text) return fallback;

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

async function friendlyError(response, fallback) {
    const serverMessage = await readError(response, "");

    if (serverMessage) return serverMessage;

    switch (response.status) {
        case 401:
            return "Your session has expired. Please log in again.";
        case 403:
            return "You do not have permission to do that.";
        case 404:
            return "This discussion no longer exists.";
        case 409:
            return "That action conflicts with the current state. Refresh and try again.";
        case 429:
            return "You are doing that too often. Please wait a while and try again.";
        default:
            return fallback;
    }
}

// =====================================================
// DOM
// =====================================================

const detailStatus = document.getElementById("detail-status");
const detailCard = document.getElementById("detail-card");
const commentsHeading = document.getElementById("comments-heading");
const detailCommentsList = document.getElementById("detail-comments-list");
const topLevelInput = document.getElementById("top-level-comment-input");
const topLevelBtn = document.getElementById("top-level-comment-btn");

const reportModal = document.getElementById("report-modal");
const reportForm = document.getElementById("report-form");
const reportPostTitle = document.getElementById("report-post-title");
const closeReportModalBtn = document.getElementById("close-report-modal");
const cancelReportBtn = document.getElementById("cancel-report");
const submitReportBtn = document.getElementById("submit-report-btn");

const confirmModal = document.getElementById("confirm-modal");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmOkBtn = document.getElementById("confirm-ok");
const confirmCancelBtn = document.getElementById("confirm-cancel");
const closeConfirmModalBtn = document.getElementById("close-confirm-modal");

const toastContainer = document.getElementById("toast-container");
const notificationBtn = document.getElementById("notification-btn");
const notificationBadge = document.getElementById("notification-badge");
const notificationDropdown = document.getElementById("notification-dropdown");
const notificationList = document.getElementById("notification-list");
const markAllReadBtn = document.getElementById("mark-all-read");

// Deepest reply chain the backend accepts; the UI mirrors it visually.
const MAX_VISIBLE_DEPTH = 3;

// The discussion on screen, with its full comment array.
let post = null;
let comments = [];
let reportInFlight = false;
let reportLastFocused = null;

// =====================================================
// UTILITIES
// =====================================================

function escapeHTML(value) {
    if (value === null || value === undefined) return "";

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
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    return String(name).slice(0, 2).toUpperCase();
}

function getCategorySlug(category) {
    return String(category || "other")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "other";
}

function timeAgo(dateString) {
    if (!dateString) return "Recently";

    const date = new Date(dateString);

    if (isNaN(date.getTime())) return "Recently";

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

function formatCount(value) {
    const count = Number(value) || 0;

    return count >= 1000
        ? `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`
        : String(count);
}

function getPostIdFromUrl() {
    return new URLSearchParams(window.location.search).get("id");
}

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

        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// =====================================================
// CONFIRM MODAL
// =====================================================

let confirmResolve = null;
let confirmLastFocused = null;

function showConfirm(title, message, confirmLabel = "Confirm") {
    if (!confirmModal) {
        return Promise.resolve(window.confirm(message));
    }

    confirmLastFocused = document.activeElement;

    if (confirmTitle) confirmTitle.textContent = title;
    if (confirmMessage) confirmMessage.textContent = message;
    if (confirmOkBtn && confirmLabel) {
        confirmOkBtn.textContent = confirmLabel;
    }

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
    if (event.target === confirmModal) closeConfirm(false);
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

document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const isDark = document.body.classList.contains("dark-mode");
    setTheme(isDark ? "light" : "dark");
});

setTheme(localStorage.getItem("synapse_theme") || "dark");

// =====================================================
// PROFILE
// =====================================================

if (currentUser) {
    const name = currentUser.name || "Student";

    const nameEl = document.getElementById("profile-name");
    const emailEl = document.getElementById("profile-email");
    const initialsEl = document.getElementById("profile-initials");

    if (nameEl) nameEl.textContent = name;
    if (emailEl) {
        emailEl.textContent =
            currentUser.email || currentUser.universityRegNo || "";
    }
    if (initialsEl) initialsEl.textContent = getInitials(name);
}

const profileBtn = document.getElementById("profile-btn");
const profileDropdown = document.getElementById("profile-dropdown");

profileBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    profileDropdown?.classList.toggle("show");
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
    } catch {
        // Badge is best-effort.
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
                button.addEventListener("click", async () => {
                    try {
                        await authFetch(
                            `${API_URL}/api/notifications/${encodeURIComponent(button.dataset.id)}/read`,
                            { method: "PATCH" }
                        );
                    } catch {
                        // Still navigate.
                    }

                    notificationDropdown?.classList.remove("show");
                    loadUnreadCount();

                    const link = button.dataset.link;
                    if (link && /^[a-z0-9./?=&_-]+$/i.test(link)) {
                        window.location.href = link;
                    }
                });
            });
    } catch {
        // List is best-effort.
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
        await authFetch(`${API_URL}/api/notifications/read-all`, {
            method: "PATCH"
        });

        notificationBadge?.classList.add("is-hidden");
        await loadNotifications();
    } catch {
        showToast("Could not update notifications.", "error");
    }
});

// =====================================================
// LOAD POST
// =====================================================

async function loadPost() {
    const postId = getPostIdFromUrl();

    if (!postId) {
        showDetailError(
            "No discussion specified.",
            "Open a discussion from the community feed."
        );
        return;
    }

    if (detailStatus) {
        detailStatus.innerHTML = "";
        detailStatus.className = "detail-status";
    }

    try {
        const response = await fetch(
            `${API_URL}/api/posts/${encodeURIComponent(postId)}`
        );

        if (response.status === 404) {
            showDetailError(
                "This discussion is no longer available.",
                "It may have been deleted, or it is hidden while a moderator reviews it."
            );
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        post = await response.json();
        comments = Array.isArray(post.comments) ? post.comments : [];

        document.title = `${post.title} - SYNAPSE`;

        renderDetail();
        renderCommentsTree();

    } catch (error) {
        console.error("Load post error:", error);

        showDetailError(
            "Could not load this discussion.",
            "Check your connection and try again."
        );
    }
}

function showDetailError(title, message) {
    if (detailCard) {
        detailCard.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <svg class="icon" aria-hidden="true"><use href="#i-alert"></use></svg>
                </div>
                <h3>${escapeHTML(title)}</h3>
                <p>${escapeHTML(message)}</p>
                <a class="btn-create-post-banner mt-1" href="index.html">Back to Feed</a>
            </div>
        `;
    }

    if (detailCommentsList) {
        detailCommentsList.innerHTML = "";
    }

    if (topLevelInput) topLevelInput.disabled = true;
    if (topLevelBtn) topLevelBtn.disabled = true;
}

// =====================================================
// RENDER DETAIL
// =====================================================

function renderDetail() {
    if (!post || !detailCard) return;

    const likeCount = post.likes || 0;
    const commentCount = comments.length;
    const isOwner = Boolean(post.isOwner);
    const isStaff = isStaffViewer();
    const isSaved = isOwnerSaved();

    const isFlagged = post.status === "flagged";
    const isUnderReview = Boolean(post.isUnderReview) && !isFlagged;

    const statusBanner = isFlagged
        ? `<div class="detail-banner flagged">
                <svg class="icon" aria-hidden="true"><use href="#i-flag"></use></svg>
                This discussion has been flagged by a moderator and is hidden from the community feed.
            </div>`
        : isUnderReview
            ? `<div class="detail-banner under-review">
                    <svg class="icon" aria-hidden="true"><use href="#i-info"></use></svg>
                    This discussion is hidden from the community feed while a moderator reviews a report.
                </div>`
            : "";

    detailCard.innerHTML = `
        ${statusBanner}

        <div class="post-header">
            <div class="author-info">
                <div class="author-avatar">${escapeHTML(getInitials(post.author))}</div>
                <div class="author-meta">
                    <span class="author-name">${escapeHTML(post.author)}</span>
                    <span class="post-timestamp">${escapeHTML(timeAgo(post.createdAt))}</span>
                </div>
            </div>

            <div class="post-header-right">
                <span class="category-tag cat-${getCategorySlug(post.category)}">
                    <span class="cat-dot"></span>
                    ${escapeHTML(post.category)}
                </span>
            </div>
        </div>

        <div class="post-body">
            <h3>${escapeHTML(post.title)}</h3>
            <p class="post-content-text">${escapeHTML(post.content)}</p>
            ${renderAttachment(post.attachment)}
        </div>

        <div class="post-footer">
            <div class="post-actions-group">
                <button class="action-btn like-btn" type="button"
                    aria-label="Like this discussion"
                    aria-pressed="false">
                    ${ICONS.heart}
                    <span class="like-count">${likeCount}</span>
                </button>

                <span class="action-btn static-btn">
                    ${ICONS.comment}
                    <span>${formatCount(commentCount)}</span>
                </span>
            </div>

            <div class="post-actions-group">
                <button class="action-btn share-btn" type="button" aria-label="Share this discussion">
                    ${ICONS.share} Share
                </button>

                <button class="action-btn save-btn ${isSaved ? "saved" : ""}" type="button"
                    aria-pressed="${isSaved}"
                    aria-label="${isSaved ? "Remove from saved posts" : "Save this discussion"}">
                    ${ICONS.bookmark} ${isSaved ? "Saved" : "Save"}
                </button>

                ${canReport() ? `
                    <button class="action-btn report-btn" type="button"
                        aria-label="Report this discussion">
                        ${ICONS.flag} Report
                    </button>
                ` : ""}

                ${(isOwner || isStaff) ? `
                    <button class="action-btn delete-post-btn" type="button"
                        aria-label="Delete this discussion">
                        ${ICONS.trash}
                    </button>
                ` : ""}
            </div>
        </div>
    `;

    // Like
    detailCard
        .querySelector(".like-btn")
        ?.addEventListener("click", (event) => {
            toggleLike(event.currentTarget);
        });

    // Share
    detailCard
        .querySelector(".share-btn")
        ?.addEventListener("click", sharePost);

    // Save
    detailCard
        .querySelector(".save-btn")
        ?.addEventListener("click", (event) => {
            toggleSave(event.currentTarget);
        });

    // Report
    detailCard
        .querySelector(".report-btn")
        ?.addEventListener("click", openReportModal);

    // Delete
    detailCard
        .querySelector(".delete-post-btn")
        ?.addEventListener("click", deletePost);
}

const ICONS = {
    heart: '<svg class="icon" aria-hidden="true"><use href="#i-heart"></use></svg>',
    comment: '<svg class="icon" aria-hidden="true"><use href="#i-chat"></use></svg>',
    share: '<svg class="icon" aria-hidden="true"><use href="#i-share"></use></svg>',
    bookmark: '<svg class="icon" aria-hidden="true"><use href="#i-bookmark"></use></svg>',
    flag: '<svg class="icon" aria-hidden="true"><use href="#i-flag"></use></svg>',
    trash: '<svg class="icon" aria-hidden="true"><use href="#i-trash"></use></svg>'
};

function renderAttachment(attachment) {
    if (!attachment || !attachment.filename) return "";

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

function canReport() {
    return Boolean(
        token &&
        currentUser &&
        !isStaffViewer() &&
        post &&
        !post.isOwner
    );
}

// =====================================================
// COMMENTS - CHAIN / THREAD
// =====================================================

// Build the tree once: top-level comments first, each with its direct
// replies nested underneath (never deeper than MAX_VISIBLE_DEPTH).
function buildCommentTree() {
    const byParent = new Map();
    const byId = new Map();

    comments.forEach((comment) => {
        byId.set(String(comment._id), comment);

        const key = comment.parentId
            ? String(comment.parentId)
            : "__root__";

        if (!byParent.has(key)) {
            byParent.set(key, []);
        }

        byParent.get(key).push(comment);
    });

    // Depth-first assembly with a hard stop at the cap, so a chain that
    // somehow exceeds it still renders rather than disappearing.
    function collect(parentKey, depth) {
        const children = byParent.get(parentKey) || [];

        return children.map((comment) => ({
            comment,
            children:
                depth >= MAX_VISIBLE_DEPTH
                    ? []
                    : collect(String(comment._id), depth + 1)
        }));
    }

    return collect("__root__", 0);
}

function renderCommentsTree() {
    if (!detailCommentsList) return;

    if (commentsHeading) {
        commentsHeading.textContent =
            `Comments (${formatCount(comments.length)})`;
    }

    const tree = buildCommentTree();

    if (!tree.length) {
        detailCommentsList.innerHTML = `
            <p class="comment-empty">No comments yet. Be the first!</p>
        `;
        return;
    }

    detailCommentsList.innerHTML = tree
        .map((node) => renderCommentNode(node, 0))
        .join("");

    wireCommentActions();
}

function renderCommentNode(node, depth) {
    const { comment, children } = node;

    const isMine = Boolean(comment.isOwner);
    const canModerate = isStaffViewer();

    return `
        <div class="comment-node depth-${Math.min(depth, MAX_VISIBLE_DEPTH)}">
            <div class="comment-item" data-comment-id="${escapeHTML(comment._id)}">

                <div class="comment-avatar">
                    ${escapeHTML(getInitials(comment.author))}
                </div>

                <div class="comment-content-wrap">
                    <div class="comment-meta">
                        <strong>${escapeHTML(comment.author)}</strong>
                        <span class="comment-time">${escapeHTML(timeAgo(comment.createdAt))}</span>
                        ${comment.editedAt
                            ? '<span class="comment-edited">(edited)</span>'
                            : ""}
                    </div>

                    <p class="comment-text">${escapeHTML(comment.text)}</p>

                    <div class="comment-actions">
                        ${token ? `
                            <button class="comment-action-btn reply-btn"
                                type="button"
                                data-comment-id="${escapeHTML(comment._id)}">
                                Reply
                            </button>
                        ` : ""}

                        ${isMine ? `
                            <button class="comment-action-btn edit-comment-btn"
                                type="button"
                                data-comment-id="${escapeHTML(comment._id)}">
                                Edit
                            </button>
                        ` : ""}

                        ${(isMine || canModerate) ? `
                            <button class="comment-action-btn danger delete-comment-btn"
                                type="button"
                                data-comment-id="${escapeHTML(comment._id)}">
                                Delete
                            </button>
                        ` : ""}
                    </div>
                </div>
            </div>

            <div class="reply-editor is-hidden"
                data-reply-to="${escapeHTML(comment._id)}">
                <input type="text" class="comment-input reply-input"
                    placeholder="Write a reply..."
                    maxlength="2000"
                    aria-label="Write a reply">
                <button type="button" class="btn-submit-comment reply-submit"
                    data-parent-id="${escapeHTML(comment._id)}">
                    Reply
                </button>
            </div>

            <div class="comment-children">
                ${children
                    .map((child) => renderCommentNode(child, depth + 1))
                    .join("")}
            </div>
        </div>
    `;
}

function wireCommentActions() {
    detailCommentsList
        .querySelectorAll(".reply-btn")
        .forEach((button) => {
            button.addEventListener("click", () => {
                const id = button.dataset.commentId;
                const editor = detailCommentsList.querySelector(
                    `.reply-editor[data-reply-to="${id}"]`
                );

                if (!editor) return;

                const opening = editor.classList.contains("is-hidden");

                // Only one reply box open at a time.
                detailCommentsList
                    .querySelectorAll(".reply-editor")
                    .forEach((el) => el.classList.add("is-hidden"));

                if (opening) {
                    editor.classList.remove("is-hidden");
                    editor.querySelector(".reply-input")?.focus();
                }
            });
        });

    detailCommentsList
        .querySelectorAll(".reply-submit")
        .forEach((button) => {
            button.addEventListener("click", () => {
                submitReply(
                    button.dataset.parentId,
                    button
                );
            });
        });

    detailCommentsList
        .querySelectorAll(".reply-input")
        .forEach((input) => {
            input.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();

                    const button =
                        input.parentElement.querySelector(".reply-submit");

                    submitReply(button?.dataset.parentId, button);
                }
            });
        });

    detailCommentsList
        .querySelectorAll(".edit-comment-btn")
        .forEach((button) => {
            button.addEventListener("click", () => {
                startEditComment(button.dataset.commentId);
            });
        });

    detailCommentsList
        .querySelectorAll(".delete-comment-btn")
        .forEach((button) => {
            button.addEventListener("click", () => {
                deleteComment(button.dataset.commentId);
            });
        });
}

async function submitTopLevelComment() {
    if (!topLevelInput) return;

    const text = topLevelInput.value.trim();

    if (!text) return;

    await submitComment(text, null, topLevelBtn);

    topLevelInput.value = "";
}

async function submitReply(parentId, button) {
    if (!parentId) return;

    const editor = button?.closest(".reply-editor");
    const input = editor?.querySelector(".reply-input");

    const text = input?.value.trim();

    if (!text) return;

    const ok = await submitComment(text, parentId, button);

    if (ok && input) {
        input.value = "";
        editor.classList.add("is-hidden");
    }
}

async function submitComment(text, parentId, button) {
    if (!post) return false;

    const originalText = button?.textContent;

    if (button) {
        button.disabled = true;
        button.textContent = "Posting...";
    }

    try {
        const response = await authFetch(
            `${API_URL}/api/posts/${post._id}/comment`,
            {
                method: "POST",
                body: JSON.stringify({
                    text,
                    ...(parentId ? { parentId } : {})
                })
            }
        );

        if (!response.ok) {
            showToast(
                await friendlyError(response, "Failed to post comment."),
                "error"
            );
            return false;
        }

        const data = await response.json();

        comments.push({
            ...data.comment,
            isOwner: true
        });

        post.commentCount = comments.length;

        renderCommentsTree();
        refreshDetailCounts();

        showToast("Comment posted!", "success");

        return true;

    } catch (error) {
        if (error.message.startsWith("Session expired")) {
            return false;
        }

        console.error("Comment error:", error);
        showToast("Failed to post comment. Please try again.", "error");

        return false;

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText || "Post";
        }
    }
}

function startEditComment(commentId) {
    const comment = comments.find(
        (item) => String(item._id) === String(commentId)
    );

    if (!comment) return;

    const item = detailCommentsList.querySelector(
        `.comment-item[data-comment-id="${commentId}"]`
    );

    const textEl = item?.querySelector(".comment-text");

    if (!textEl || item.querySelector(".comment-edit-box")) return;

    const original = comment.text;

    textEl.classList.add("is-hidden");

    const box = document.createElement("div");
    box.className = "comment-edit-box";

    box.innerHTML = `
        <input type="text" class="comment-input edit-input"
            value="${escapeHTML(original)}"
            maxlength="2000"
            aria-label="Edit your comment">
        <div class="edit-actions">
            <button type="button" class="btn-submit-comment save-edit">Save</button>
            <button type="button" class="btn-cancel cancel-edit">Cancel</button>
        </div>
    `;

    textEl.insertAdjacentElement("afterend", box);

    const input = box.querySelector(".edit-input");
    input?.focus();

    box.querySelector(".cancel-edit")?.addEventListener("click", () => {
        box.remove();
        textEl.classList.remove("is-hidden");
    });

    box.querySelector(".save-edit")?.addEventListener("click", async () => {
        const newText = input.value.trim();

        if (!newText || newText === original) {
            box.remove();
            textEl.classList.remove("is-hidden");
            return;
        }

        try {
            const response = await authFetch(
                `${API_URL}/api/posts/${post._id}/comments/${commentId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({ text: newText })
                }
            );

            if (!response.ok) {
                showToast(
                    await friendlyError(response, "Could not edit comment."),
                    "error"
                );
                return;
            }

            const data = await response.json();

            comment.text = data.comment.text;
            comment.editedAt = data.comment.editedAt;

            renderCommentsTree();

            showToast("Comment updated.", "success");

        } catch (error) {
            if (error.message.startsWith("Session expired")) return;

            showToast("Could not edit comment.", "error");
        }
    });
}

async function deleteComment(commentId) {
    const confirmed = await showConfirm(
        "Delete this comment?",
        "Replies to this comment will be deleted with it. This cannot be undone.",
        "Delete"
    );

    if (!confirmed) return;

    try {
        const response = await authFetch(
            `${API_URL}/api/posts/${post._id}/comments/${commentId}`,
            { method: "DELETE" }
        );

        if (!response.ok) {
            showToast(
                await friendlyError(response, "Could not delete comment."),
                "error"
            );
            return;
        }

        const data = await response.json().catch(() => ({}));

        // Remove the comment and every descendant from the local tree.
        const removed = new Set([String(commentId)]);
        let grew = true;

        while (grew) {
            grew = false;

            comments.forEach((comment) => {
                const id = String(comment._id);

                if (
                    comment.parentId &&
                    removed.has(String(comment.parentId)) &&
                    !removed.has(id)
                ) {
                    removed.add(id);
                    grew = true;
                }
            });
        }

        comments = comments.filter(
            (comment) => !removed.has(String(comment._id))
        );

        post.commentCount =
            typeof data.commentCount === "number"
                ? data.commentCount
                : comments.length;

        renderCommentsTree();
        refreshDetailCounts();

        showToast("Comment deleted.", "success");

    } catch (error) {
        if (error.message.startsWith("Session expired")) return;

        showToast("Could not delete comment.", "error");
    }
}

function refreshDetailCounts() {
    const likeEl = detailCard?.querySelector(".like-count");
    const commentEl = detailCard?.querySelector(
        ".static-btn span"
    );

    if (likeEl && post) {
        likeEl.textContent = post.likes || 0;
    }

    if (commentEl) {
        commentEl.textContent = formatCount(comments.length);
    }

    if (commentsHeading) {
        commentsHeading.textContent =
            `Comments (${formatCount(comments.length)})`;
    }
}

// =====================================================
// LIKE / SAVE / SHARE
// =====================================================

async function toggleLike(button) {
    if (!post) return;

    try {
        const response = await authFetch(
            `${API_URL}/api/posts/${post._id}/like`,
            { method: "PATCH" }
        );

        if (!response.ok) {
            showToast(
                await friendlyError(response, "Could not update like."),
                "error"
            );
            return;
        }

        const data = await response.json();

        post.likes = data.likes;

        button.classList.toggle("liked", Boolean(data.liked));
        button.innerHTML = `
            ${ICONS.heart}
            <span class="like-count">${data.likes}</span>
        `;
        button.setAttribute("aria-pressed", data.liked ? "true" : "false");

    } catch (error) {
        if (error.message.startsWith("Session expired")) return;

        showToast("Could not update like. Please try again.", "error");
    }
}

const SAVED_KEY = "synapse_saved_posts";

function isOwnerSaved() {
    if (!post) return false;

    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");

    return saved.includes(post._id);
}

function toggleSave(button) {
    if (!post) return;

    let saved = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");

    if (saved.includes(post._id)) {
        saved = saved.filter((id) => id !== post._id);
        showToast("Post removed from saved.", "info");
    } else {
        saved.push(post._id);
        showToast("Post saved!", "success");
    }

    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));

    const nowSaved = saved.includes(post._id);

    button.classList.toggle("saved", nowSaved);
    button.innerHTML = `${ICONS.bookmark} ${nowSaved ? "Saved" : "Save"}`;
    button.setAttribute("aria-pressed", String(nowSaved));
}

async function sharePost() {
    if (!post) return;

    const shareUrl = window.location.href.split("#")[0];

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
            if (error && error.name === "AbortError") return;
        }
    }

    try {
        await navigator.clipboard.writeText(shareUrl);
        showToast("Link copied to clipboard!", "success");
    } catch {
        showToast("Could not copy link.", "error");
    }
}

// =====================================================
// DELETE POST
// =====================================================

async function deletePost() {
    if (!post) return;

    const confirmed = await showConfirm(
        "Delete this discussion?",
        `“${post.title}” will be removed for everyone. This cannot be undone.`,
        "Delete"
    );

    if (!confirmed) return;

    try {
        const response = await authFetch(
            `${API_URL}/api/posts/${post._id}`,
            { method: "DELETE" }
        );

        if (!response.ok) {
            throw new Error(
                await friendlyError(
                    response,
                    "Could not delete this discussion."
                )
            );
        }

        showToast("Discussion deleted.", "success");

        window.location.replace("index.html");

    } catch (error) {
        if (error.message.startsWith("Session expired")) return;

        showToast(
            error.message || "Could not delete this discussion.",
            "error"
        );
    }
}

// =====================================================
// REPORT
// =====================================================

function resetReportForm() {
    reportForm?.reset();

    reportForm
        ?.querySelectorAll(".report-option")
        .forEach((label) => label.classList.remove("selected"));
}

function openReportModal() {
    if (!reportModal || !post) return;

    if (!token) {
        window.location.href = loginRedirectUrl();
        return;
    }

    reportLastFocused = document.activeElement;

    resetReportForm();

    if (reportPostTitle) {
        reportPostTitle.textContent = post.title || "Untitled discussion";
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
    reportLastFocused?.focus();
}

async function submitReport(event) {
    event.preventDefault();

    if (!post || reportInFlight) return;

    const selectedReason = reportForm?.querySelector(
        'input[name="report-reason"]:checked'
    );

    if (!selectedReason) {
        showToast("Please select a reason.", "error");
        return;
    }

    reportInFlight = true;

    if (submitReportBtn) {
        submitReportBtn.disabled = true;
        submitReportBtn.textContent = "Submitting...";
    }

    try {
        const response = await authFetch(
            `${API_URL}/api/posts/${post._id}/report`,
            {
                method: "POST",
                body: JSON.stringify({ reason: selectedReason.value })
            }
        );

        if (response.status === 409) {
            closeReportModal();
            showToast(
                await readError(
                    response,
                    "You have already reported this discussion."
                ),
                "info"
            );
            return;
        }

        if (!response.ok) {
            throw new Error(
                await friendlyError(response, "Failed to submit report.")
            );
        }

        const data = await response.json().catch(() => ({}));

        closeReportModal();

        showToast(
            data.message ||
            "Report submitted. This discussion is hidden while a moderator reviews it.",
            "success"
        );

        // The post is now hidden; reload so the owner sees the banner.
        loadPost();

    } catch (error) {
        if (error.message.startsWith("Session expired")) return;

        showToast(error.message || "Failed to submit report.", "error");

    } finally {
        reportInFlight = false;

        if (submitReportBtn) {
            submitReportBtn.disabled = false;
            submitReportBtn.textContent = "Submit Report";
        }
    }
}

reportForm?.addEventListener("change", () => {
    reportForm.querySelectorAll(".report-option").forEach((label) => {
        label.classList.toggle(
            "selected",
            Boolean(label.querySelector("input")?.checked)
        );
    });
});

reportForm?.addEventListener("submit", submitReport);
cancelReportBtn?.addEventListener("click", closeReportModal);
closeReportModalBtn?.addEventListener("click", closeReportModal);

reportModal?.addEventListener("click", (event) => {
    if (event.target === reportModal) closeReportModal();
});

// =====================================================
// ESCAPE / FOCUS TRAP
// =====================================================

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeReportModal();
        closeConfirm(false);
        return;
    }

    if (event.key !== "Tab") return;

    const openDialog = [reportModal, confirmModal].find(
        (modal) => modal?.classList.contains("show")
    );

    if (!openDialog) return;

    const focusable = [...openDialog.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter((el) => el.offsetParent !== null);

    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

// =====================================================
// TOP-LEVEL COMMENT BOX
// =====================================================

topLevelBtn?.addEventListener("click", submitTopLevelComment);

topLevelInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        submitTopLevelComment();
    }
});

// A signed-out reader can browse the thread; the box routes them to login.
function gateCommentBox() {
    if (token) return;

    if (topLevelInput) {
        topLevelInput.placeholder = "Sign in to comment...";
        topLevelInput.addEventListener("focus", () => {
            window.location.href = loginRedirectUrl();
        });
    }
}

// =====================================================
// INIT
// =====================================================

(async function init() {
    // Populate the cached profile immediately; /api/auth/me corrects it below.
    gateCommentBox();

    if (token) {
        try {
            const response = await authFetch(`${API_URL}/api/auth/me`);

            const data = await response.json();

            currentUser = data.user;
            userRole = data.user.role;

            localStorage.setItem("synapse_user", JSON.stringify(currentUser));
            localStorage.setItem("synapse_role", userRole);

            const name = currentUser.name || "Student";
            const nameEl = document.getElementById("profile-name");
            const emailEl = document.getElementById("profile-email");
            const initialsEl = document.getElementById("profile-initials");

            if (nameEl) nameEl.textContent = name;
            if (emailEl) {
                emailEl.textContent =
                    currentUser.email || currentUser.universityRegNo || "";
            }
            if (initialsEl) initialsEl.textContent = getInitials(name);

            loadUnreadCount();
            window.setInterval(loadUnreadCount, 60000);

        } catch (error) {
            if (error.message.startsWith("Session expired")) {
                return;
            }

            console.error("Session validation failed:", error);
        }
    }

    await loadPost();

    // Landing on #comments (from the feed's comment button) scrolls there.
    if (window.location.hash === "#comments") {
        document
            .getElementById("comments")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
})();
