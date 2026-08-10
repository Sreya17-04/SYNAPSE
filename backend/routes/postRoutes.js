const express = require("express");
const Post = require("../models/Post");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// ==========================================
// POST /api/posts
// Create a new post (requires authentication)
// ==========================================
router.post("/", protect, async (req, res) => {
    try {
        const { title, category, content } = req.body;

        if (!title || !category || !content) {
            return res.status(400).json({
                message: "Title, category and content are required."
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
        res.status(201).json(savedPost);

    } catch (error) {
        res.status(500).json({
            message: "Failed to create post",
            error: error.message
        });
    }
});

// ==========================================
// GET /api/posts
// Get all posts (public - no auth needed)
// ==========================================
router.get("/", async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 });
        res.status(200).json(posts);
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch posts",
            error: error.message
        });
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
        const alreadyLiked = post.likedBy.includes(userEmail);

        if (alreadyLiked) {
            // Unlike
            post.likedBy = post.likedBy.filter(email => email !== userEmail);
            post.likes = Math.max(0, post.likes - 1);
        } else {
            // Like
            post.likedBy.push(userEmail);
            post.likes += 1;
        }

        await post.save();

        res.status(200).json({
            likes: post.likes,
            liked: !alreadyLiked
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to toggle like.",
            error: error.message
        });
    }
});

// ==========================================
// POST /api/posts/:id/comment
// Add a comment to a post (requires authentication)
// ==========================================
router.post("/:id/comment", protect, async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ message: "Comment text is required." });
        }

        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found." });
        }

        const comment = {
            author: req.user.name,
            authorEmail: req.user.email,
            text: text.trim()
        };

        post.comments.push(comment);
        await post.save();

        // Return the newly added comment (last in array)
        const savedComment = post.comments[post.comments.length - 1];

        res.status(201).json({
            message: "Comment added successfully.",
            comment: savedComment
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to add comment.",
            error: error.message
        });
    }
});

// ==========================================
// PUT /api/posts/:id
// Update a post (admin or post owner)
// ==========================================
router.put("/:id", protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found." });
        }

        // Only owner or admin can update
        if (post.authorEmail !== req.user.email && req.user.role !== "admin") {
            return res.status(403).json({ message: "Not authorized to update this post." });
        }

        const updatedPost = await Post.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        res.status(200).json(updatedPost);

    } catch (error) {
        res.status(500).json({
            message: "Failed to update post",
            error: error.message
        });
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
        if (post.authorEmail !== req.user.email && req.user.role !== "admin") {
            return res.status(403).json({ message: "Not authorized to delete this post." });
        }

        await Post.findByIdAndDelete(req.params.id);

        res.status(200).json({ message: "Post deleted successfully." });

    } catch (error) {
        res.status(500).json({
            message: "Failed to delete post",
            error: error.message
        });
    }
});

module.exports = router;