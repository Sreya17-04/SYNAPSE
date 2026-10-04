const express = require("express");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const Post = require("../models/Post");
const User = require("../models/User");
const Report = require("../models/Report");
const AuditLog = require("../models/AuditLog");
const { protect, optionalAuth } = require("../middleware/authMiddleware");
const { validateObjectId } = require("../middleware/validateObjectId");

const router = express.Router();

// Malformed ids get a 400 instead of a CastError 500
router.param("id", validateObjectId("id"));
router.param("commentId", validateObjectId("commentId"));

// Single source of truth for the category list (also used by the client UI).
const VALID_CATEGORIES = Post.CATEGORIES;

// The feed is public, so cap how much a single request can return.
const MAX_FEED_LIMIT = 100;
const MIN_FEED_LIMIT = 1;

const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

// One identifier per account: the admin keeps its email, a pre-provisioned
// student uses its universityRegNo. authorEmail, likedBy, comments.authorEmail
// and reporter.email all hold this value.
const identityOf = User.identityOf;

// Reporting is deliberately throttled harder than the global API limiter:
// a student should be able to file several reports, but not use the endpoint
// as a spam channel against a post they dislike.
const reportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "You have filed too many reports. Try again later." }
});

// Identifiers are stored lowercased by the schema/seeder, but compare
// defensively so a legacy mixed-case document still matches its author. An
// empty string is never a match: content with no author must not become
// editable by an account that also has no identifier.
const sameUser = (a, b) =>
    typeof a === "string" &&
    typeof b === "string" &&
    a.trim().length > 0 &&
    b.trim().length > 0 &&
    a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The public feed must never leak member identifiers (emails or registration
 * numbers). Ownership is exposed as a boolean instead, computed only when the
 * caller supplied a valid token, so logged-in students still see their own
 * delete/edit actions.
 */
const toPublicPost = (post, viewerIdentity) => {
    const doc = post.toObject ? post.toObject() : { ...post };

    delete doc.authorEmail;
    delete doc.__v;

    doc.isOwner = Boolean(
        viewerIdentity && sameUser(post.authorEmail, viewerIdentity)
    );

    if (Array.isArray(doc.comments)) {
        doc.comments = doc.comments.map((comment) => {
            const { authorEmail, __v, ...rest } = comment;
            return {
                ...rest,
                isOwner: Boolean(
                    viewerIdentity && sameUser(authorEmail, viewerIdentity)
                )
            };
        });
    }

    return doc;
};

// ==========================================
// POST /api/posts
// Create a new post (requires authentication)
// ==========================================
router.post("/", protect, async (req, res) => {
    try {
        const title = cleanText(req.body.title);
        const category = cleanText(req.body.category);
        const content = cleanText(req.body.content);

        if (!title || !category || !content) {
            return res.status(400).json({
                message: "Title, category and content are required."
            });
        }

        if (title.length > 200) {
            return res.status(400).json({ message: "Title must be 200 characters or fewer." });
        }

        if (content.length > 10000) {
            return res.status(400).json({ message: "Content must be 10000 characters or fewer." });
        }

        if (!VALID_CATEGORIES.includes(category)) {
            return res.status(400).json({
                message: `Category must be one of: ${VALID_CATEGORIES.join(", ")}.`
            });
        }

        const newPost = new Post({
            title,
            author: req.user.name,
            authorEmail: identityOf(req.user),
            category,
            content
        });

        const savedPost = await newPost.save();
        res.status(201).json(toPublicPost(savedPost, identityOf(req.user)));

    } catch (error) {
        console.error("Create post error:", error);
        res.status(500).json({ message: "Failed to create post" });
    }
});

// ==========================================
// GET /api/posts
// Get all posts (public - no auth needed).
// Flagged posts are hidden from the public feed until a moderator approves them.
// ==========================================
router.get("/", optionalAuth, async (req, res) => {
    try {
        const requested = Number.parseInt(req.query.limit, 10);
        const limit = Number.isFinite(requested)
            ? Math.min(Math.max(requested, MIN_FEED_LIMIT), MAX_FEED_LIMIT)
            : MAX_FEED_LIMIT;

        const query = { status: { $ne: "flagged" } };

        if (req.query.category !== undefined) {
            // Reject rather than silently ignore, so a typo cannot look like
            // a successful unfiltered query.
            if (!VALID_CATEGORIES.includes(req.query.category)) {
                return res.status(400).json({
                    message: `Category must be one of: ${VALID_CATEGORIES.join(", ")}.`
                });
            }

            query.category = req.query.category;
        }

        const posts = await Post.find(query)
            .sort({ createdAt: -1 })
            .limit(limit);

        const viewerIdentity = req.user ? identityOf(req.user) : null;

        res.status(200).json(posts.map((post) => toPublicPost(post, viewerIdentity)));
    } catch (error) {
        console.error("Fetch posts error:", error);
        res.status(500).json({ message: "Failed to fetch posts" });
    }
});

// ==========================================
// PATCH /api/posts/:id/like
// Toggle like on a post (requires authentication)
// ==========================================
router.patch("/:id/like", protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found." });
        }

        const userIdentity = identityOf(req.user);
        const alreadyLiked = post.likedBy.some(
            (email) => email.toLowerCase() === userIdentity.toLowerCase()
        );

        if (alreadyLiked) {
            // Unlike - case-insensitive, so legacy mixed-case entries are cleaned up too
            post.likedBy = post.likedBy.filter(
                (email) => email.toLowerCase() !== userIdentity.toLowerCase()
            );
        } else {
            post.likedBy.push(userIdentity);
        }

        // Derive the counter from the source of truth so it can never drift
        post.likes = post.likedBy.length;

        await post.save();

        res.status(200).json({
            likes: post.likes,
            liked: !alreadyLiked
        });

    } catch (error) {
        console.error("Like error:", error);
        res.status(500).json({ message: "Failed to toggle like." });
    }
});

// ==========================================
// POST /api/posts/:id/comment
// Add a comment to a post (requires authentication)
// ==========================================
router.post("/:id/comment", protect, async (req, res) => {
    try {
        const text = cleanText(req.body.text);

        if (!text) {
            return res.status(400).json({ message: "Comment text is required." });
        }

        if (text.length > 2000) {
            return res.status(400).json({ message: "Comment must be 2000 characters or fewer." });
        }

        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found." });
        }

        post.comments.push({
            author: req.user.name,
            authorEmail: identityOf(req.user),
            text
        });

        await post.save();

        // Return the newly added comment (last in array)
        const savedComment = post.comments[post.comments.length - 1];

        res.status(201).json({
            message: "Comment added successfully.",
            comment: {
                _id: savedComment._id,
                author: savedComment.author,
                text: savedComment.text,
                createdAt: savedComment.createdAt,
                isOwner: true
            }
        });

    } catch (error) {
        console.error("Add comment error:", error);
        res.status(500).json({ message: "Failed to add comment." });
    }
});

// ==========================================
// PUT /api/posts/:id
// Update a post (admin or post owner).
// Only the editable fields are accepted - anything else in the
// request body (likes, likedBy, comments, author, status...) is ignored.
// ==========================================
router.put("/:id", protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found." });
        }

        // Only owner or admin can update
        if (
            !sameUser(post.authorEmail, identityOf(req.user)) &&
            req.user.role !== "admin"
        ) {
            return res.status(403).json({
                message: "Not authorized to update this post."
            });
        }

        const updates = {};

        if (req.body.title !== undefined) {
            const title = cleanText(req.body.title);

            if (!title || title.length > 200) {
                return res.status(400).json({
                    message: "Title must be between 1 and 200 characters."
                });
            }

            updates.title = title;
        }

        if (req.body.content !== undefined) {
            const content = cleanText(req.body.content);

            if (!content || content.length > 10000) {
                return res.status(400).json({
                    message: "Content must be between 1 and 10000 characters."
                });
            }

            updates.content = content;
        }

        if (req.body.category !== undefined) {
            const category = cleanText(req.body.category);

            if (!VALID_CATEGORIES.includes(category)) {
                return res.status(400).json({
                    message: `Category must be one of: ${VALID_CATEGORIES.join(", ")}.`
                });
            }

            updates.category = category;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                message: "No editable fields provided (title, content, category)."
            });
        }

        const updatedPost = await Post.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        await AuditLog.record({
            action: "post.updated",
            actor: req.user,
            target: { type: "post", id: updatedPost._id, label: updatedPost.title },
            details: { fields: Object.keys(updates), byAdmin: req.user.role === "admin" },
            req
        });

        res.status(200).json(toPublicPost(updatedPost, identityOf(req.user)));

    } catch (error) {
        console.error("Update post error:", error);
        res.status(500).json({ message: "Failed to update post" });
    }
});

// ==========================================
// DELETE /api/posts/:id
// Delete a post (owner or admin)
// ==========================================
router.delete("/:id", protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found." });
        }

        // Only owner or admin can delete
        if (
            !sameUser(post.authorEmail, identityOf(req.user)) &&
            req.user.role !== "admin"
        ) {
            return res.status(403).json({
                message: "Not authorized to delete this post."
            });
        }

        await Post.findByIdAndDelete(req.params.id);

        // Drop the deleted id from everyone's saved list, otherwise it would
        // linger as a dead reference until that student next opened Saved.
        await User.updateMany(
            { savedPosts: req.params.id },
            { $pull: { savedPosts: req.params.id } }
        );

        res.status(200).json({ message: "Post deleted successfully." });

    } catch (error) {
        console.error("Delete post error:", error);
        res.status(500).json({ message: "Failed to delete post" });
    }
});

// ==========================================
// GET /api/posts/saved
// The caller's saved posts, newest first. Posts that were deleted or hidden
// by a moderator are pruned from the account as they are encountered, so a
// stale id cannot linger forever.
// ==========================================
router.get("/saved", protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("savedPosts");

        if (!user) {
            return res.status(404).json({ message: "Account not found." });
        }

        const posts = await Post.find({
            _id: { $in: user.savedPosts },
            status: { $ne: "flagged" }
        }).sort({ createdAt: -1 });

        const found = new Set(posts.map((post) => String(post._id)));
        const stale = user.savedPosts.filter((id) => !found.has(String(id)));

        if (stale.length > 0) {
            user.savedPosts = user.savedPosts.filter((id) => found.has(String(id)));
            await user.save();
        }

        res.status(200).json(posts.map((post) => toPublicPost(post, identityOf(req.user))));

    } catch (error) {
        console.error("Fetch saved posts error:", error);
        res.status(500).json({ message: "Failed to fetch saved posts." });
    }
});

// ==========================================
// GET /api/posts/:id
// A single post. Shared links deep-link straight to one discussion, so this
// has to work even when the post sits beyond the feed cap or is filtered out
// of the reader's current view. Flagged posts stay hidden from non-admins,
// exactly like the public feed. Registered after /saved so the static path
// still wins over the :id pattern.
// ==========================================
router.get("/:id", optionalAuth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        const isAdmin = Boolean(req.user && req.user.role === "admin");

        // A missing post and a hidden one are reported the same way, so the
        // endpoint cannot be used to probe for removed content.
        if (!post || (post.status === "flagged" && !isAdmin)) {
            return res.status(404).json({ message: "Post not found." });
        }

        res.status(200).json(toPublicPost(post, req.user ? identityOf(req.user) : null));

    } catch (error) {
        console.error("Fetch post error:", error);
        res.status(500).json({ message: "Failed to fetch post" });
    }
});

// ==========================================
// PATCH /api/posts/:id/save
// Toggle a post in the caller's saved list.
// ==========================================
router.patch("/:id/save", protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found." });
        }

        // Saving a post that is currently hidden from the feed would create an
        // entry the reader can never see, so refuse it.
        if (post.status === "flagged") {
            return res.status(400).json({
                message: "This post is awaiting moderator review and cannot be saved."
            });
        }

        const user = await User.findById(req.user.id).select("savedPosts");
        const postId = String(post._id);
        const already = user.savedPosts.some((id) => String(id) === postId);

        if (already) {
            user.savedPosts = user.savedPosts.filter((id) => String(id) !== postId);
        } else {
            user.savedPosts.push(post._id);
        }

        await user.save();

        res.status(200).json({
            saved: !already,
            savedCount: user.savedPosts.length
        });

    } catch (error) {
        console.error("Toggle saved post error:", error);
        res.status(500).json({ message: "Failed to update saved posts." });
    }
});

// ==========================================
// POST /api/posts/:id/report
// File a moderation report against a post.
// ==========================================
router.post("/:id/report", protect, reportLimiter, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found." });
        }

        const reason = cleanText(req.body.reason);
        const details = cleanText(req.body.details);

        if (!Report.REASONS.includes(reason)) {
            return res.status(400).json({
                message: `Reason must be one of: ${Report.REASONS.join(", ")}.`
            });
        }

        if (details.length > Report.MAX_DETAILS_LENGTH) {
            return res.status(400).json({
                message: `Details must be ${Report.MAX_DETAILS_LENGTH} characters or fewer.`
            });
        }

        // A student cannot flood the queue by re-reporting the same post.
        const alreadyOpen = await Report.exists({
            post: post._id,
            "reporter.email": identityOf(req.user),
            status: "open"
        });

        if (alreadyOpen) {
            return res.status(409).json({
                message: "You have already reported this post. A moderator will review it."
            });
        }

        const report = await Report.create({
            post: post._id,
            postSnapshot: {
                title: post.title,
                author: post.author,
                excerpt: post.content.slice(0, 300)
            },
            reporter: { name: req.user.name, email: identityOf(req.user) },
            reason,
            details
        });

        await AuditLog.record({
            action: "post.reported",
            actor: req.user,
            target: { type: "post", id: post._id, label: post.title },
            details: { reason, reportId: String(report._id) },
            req
        });

        res.status(201).json({
            message: "Report submitted. A moderator will review it.",
            report: { _id: report._id, reason: report.reason, status: report.status }
        });

    } catch (error) {
        console.error("Create report error:", error);
        res.status(500).json({ message: "Failed to submit report." });
    }
});

// ==========================================
// PATCH /api/posts/:id/comments/:commentId
// Edit a comment (author or admin). Only `text` is editable.
// ==========================================
router.patch("/:id/comments/:commentId", protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found." });
        }

        const comment = post.comments.id(req.params.commentId);

        if (!comment) {
            return res.status(404).json({ message: "Comment not found." });
        }

        const isAuthor = sameUser(comment.authorEmail, identityOf(req.user));

        if (!isAuthor && req.user.role !== "admin") {
            return res.status(403).json({
                message: "Not authorized to edit this comment."
            });
        }

        const text = cleanText(req.body.text);

        if (!text) {
            return res.status(400).json({ message: "Comment text is required." });
        }

        if (text.length > 2000) {
            return res.status(400).json({
                message: "Comment must be 2000 characters or fewer."
            });
        }

        comment.text = text;
        comment.editedAt = new Date();

        await post.save();

        res.status(200).json({
            message: "Comment updated.",
            comment: {
                _id: comment._id,
                author: comment.author,
                text: comment.text,
                createdAt: comment.createdAt,
                editedAt: comment.editedAt,
                isOwner: isAuthor
            }
        });

    } catch (error) {
        if (error instanceof mongoose.Error.CastError) {
            return res.status(400).json({ message: "Invalid comment identifier." });
        }

        console.error("Edit comment error:", error);
        res.status(500).json({ message: "Failed to edit comment." });
    }
});

// ==========================================
// DELETE /api/posts/:id/comments/:commentId
// Delete a comment (author or admin).
// ==========================================
router.delete("/:id/comments/:commentId", protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found." });
        }

        const comment = post.comments.id(req.params.commentId);

        if (!comment) {
            return res.status(404).json({ message: "Comment not found." });
        }

        const isAuthor = sameUser(comment.authorEmail, identityOf(req.user));

        if (!isAuthor && req.user.role !== "admin") {
            return res.status(403).json({
                message: "Not authorized to delete this comment."
            });
        }

        // Snapshot before removal so the audit entry can still say what was
        // removed without retaining the whole comment body.
        const excerpt = comment.text.slice(0, 120);
        const removedByAdmin = !isAuthor && req.user.role === "admin";

        comment.deleteOne();
        await post.save();

        await AuditLog.record({
            action: "comment.deleted",
            actor: req.user,
            target: { type: "comment", id: req.params.commentId, label: excerpt },
            details: { postId: String(post._id), postTitle: post.title, byAdmin: removedByAdmin },
            req
        });

        res.status(200).json({ message: "Comment deleted." });

    } catch (error) {
        if (error instanceof mongoose.Error.CastError) {
            return res.status(400).json({ message: "Invalid comment identifier." });
        }

        console.error("Delete comment error:", error);
        res.status(500).json({ message: "Failed to delete comment." });
    }
});

module.exports = router;
