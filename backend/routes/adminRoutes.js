const express = require("express");
const User = require("../models/User");
const Post = require("../models/Post");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

// All routes in this file require: protect + adminOnly
// Students hitting any route here get 403 Forbidden
router.use(protect, adminOnly);

// ==========================================
// GET /api/admin/stats
// Dashboard statistics
// ==========================================
router.get("/stats", async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({ role: "student" });
        const totalPosts = await Post.countDocuments();
        const flaggedPosts = await Post.countDocuments({ status: "flagged" });
        const flaggedUsers = await User.countDocuments({ isFlagged: true });

        res.status(200).json({
            totalUsers,
            totalPosts,
            pendingReports: flaggedPosts + flaggedUsers,
            activeDiscussions: await Post.countDocuments({ status: { $ne: "flagged" } })
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch stats.", error: error.message });
    }
});

// ==========================================
// GET /api/admin/posts
// Get all posts (with full details for moderation)
// ==========================================
router.get("/posts", async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 });
        res.status(200).json(posts);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch posts.", error: error.message });
    }
});

// ==========================================
// DELETE /api/admin/posts/:id
// Permanently delete a post
// ==========================================
router.delete("/posts/:id", async (req, res) => {
    try {
        const deletedPost = await Post.findByIdAndDelete(req.params.id);

        if (!deletedPost) {
            return res.status(404).json({ message: "Post not found." });
        }

        res.status(200).json({ message: "Post deleted successfully." });
    } catch (error) {
        res.status(500).json({ message: "Failed to delete post.", error: error.message });
    }
});

// ==========================================
// PATCH /api/admin/posts/:id/status
// Update post status: active | flagged | approved
// ==========================================
router.patch("/posts/:id/status", async (req, res) => {
    try {
        const { status } = req.body;

        if (!["active", "flagged", "approved"].includes(status)) {
            return res.status(400).json({ message: "Invalid status value." });
        }

        const post = await Post.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );

        if (!post) {
            return res.status(404).json({ message: "Post not found." });
        }

        res.status(200).json({ message: `Post status set to ${status}.`, post });
    } catch (error) {
        res.status(500).json({ message: "Failed to update post status.", error: error.message });
    }
});

// ==========================================
// GET /api/admin/users
// Get all users
// ==========================================
router.get("/users", async (req, res) => {
    try {
        const users = await User.find().select("-password").sort({ createdAt: -1 });
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch users.", error: error.message });
    }
});

// ==========================================
// PATCH /api/admin/users/:id/flag
// Toggle user flagged status
// ==========================================
router.patch("/users/:id/flag", async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        user.isFlagged = !user.isFlagged;
        await user.save();

        res.status(200).json({
            message: `User ${user.isFlagged ? "flagged" : "unflagged"} successfully.`,
            user: { id: user._id, name: user.name, email: user.email, isFlagged: user.isFlagged }
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to flag user.", error: error.message });
    }
});

module.exports = router;
