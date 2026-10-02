const express = require("express");
const Post = require("../models/Post");
const { protect, optionalAuth } = require("../middleware/authMiddleware");
const { validateObjectId } = require("../middleware/validateObjectId");

const router = express.Router();

// Malformed ids get a 400 instead of a CastError 500
router.param("id", validateObjectId("id"));

// Single source of truth for the category list (also used by the client UI).
const VALID_CATEGORIES = Post.CATEGORIES;

// The feed is public, so cap how much a single request can return.
const MAX_FEED_LIMIT = 100;
const MIN_FEED_LIMIT = 1;

const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

// Emails are stored lowercased by the schema, but compare defensively so a
// legacy mixed-case document still matches its author.
const sameUser = (a, b) =>
    typeof a === "string" &&
    typeof b === "string" &&
    a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The public feed must never leak member email addresses. Ownership is
 * exposed as a boolean instead, computed only when the caller supplied a
 * valid token, so logged-in students still see their own delete/edit actions.
 */
const toPublicPost = (post, viewerEmail) => {
    const doc = post.toObject ? post.toObject() : { ...post };

    delete doc.authorEmail;
    delete doc.__v;

    doc.isOwner = Boolean(
        viewerEmail && sameUser(post.authorEmail, viewerEmail)
    );

    if (Array.isArray(doc.comments)) {
        doc.comments = doc.comments.map((comment) => {
            const { authorEmail, __v, ...rest } = comment;
            return {
                ...rest,
                isOwner: Boolean(
                    viewerEmail && sameUser(authorEmail, viewerEmail)
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
            authorEmail: req.user.email,
            category,
            content
        });

        const savedPost = await newPost.save();
        res.status(201).json(toPublicPost(savedPost, req.user.email));

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

        const viewerEmail = req.user ? req.user.email : null;

        res.status(200).json(posts.map((post) => toPublicPost(post, viewerEmail)));
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

        const userEmail = req.user.email;
        const alreadyLiked = post.likedBy.some(
            (email) => email.toLowerCase() === userEmail.toLowerCase()
        );

        if (alreadyLiked) {
            // Unlike - case-insensitive, so legacy mixed-case entries are cleaned up too
            post.likedBy = post.likedBy.filter(
                (email) => email.toLowerCase() !== userEmail.toLowerCase()
            );
        } else {
            post.likedBy.push(userEmail);
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
            authorEmail: req.user.email,
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
            !sameUser(post.authorEmail, req.user.email) &&
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

        res.status(200).json(toPublicPost(updatedPost, req.user.email));

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
            !sameUser(post.authorEmail, req.user.email) &&
            req.user.role !== "admin"
        ) {
            return res.status(403).json({
                message: "Not authorized to delete this post."
            });
        }

        await Post.findByIdAndDelete(req.params.id);

        res.status(200).json({ message: "Post deleted successfully." });

    } catch (error) {
        console.error("Delete post error:", error);
        res.status(500).json({ message: "Failed to delete post" });
    }
});

module.exports = router;
