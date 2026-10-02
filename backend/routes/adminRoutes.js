const express = require("express");
const User = require("../models/User");
const Post = require("../models/Post");
const Announcement = require("../models/Announcement");
const { protect, adminOnly } = require("../middleware/authMiddleware");
const { validateObjectId } = require("../middleware/validateObjectId");

const router = express.Router();

// All routes in this file require: protect + adminOnly
// Students hitting any route here get 403 Forbidden
router.use(protect, adminOnly);

// Malformed ids get a 400 instead of a CastError 500
router.param("id", validateObjectId("id"));

// Moderation lists are bounded so a large collection cannot be dumped in one
// response. The client paginates with ?page / ?limit.
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const readPaging = (query) => {
    const requested = Number.parseInt(query.limit, 10);
    const limit = Number.isFinite(requested)
        ? Math.min(Math.max(requested, 1), MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    const requestedPage = Number.parseInt(query.page, 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

    return { limit, page, skip: (page - 1) * limit };
};

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
        console.error("Admin stats error:", error.message);
        res.status(500).json({ message: "Failed to fetch stats." });
    }
});

// ==========================================
// GET /api/admin/posts
// All posts with full details for moderation (includes authorEmail).
// ==========================================
router.get("/posts", async (req, res) => {
    try {
        const { limit, page, skip } = readPaging(req.query);

        const [posts, total] = await Promise.all([
            Post.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
            Post.countDocuments()
        ]);

        res.status(200).json({ posts, total, page, limit });
    } catch (error) {
        console.error("Admin posts error:", error.message);
        res.status(500).json({ message: "Failed to fetch posts." });
    }
});

// ==========================================
// GET /api/admin/announcements
// Get all announcements for management
// ==========================================
router.get("/announcements", async (req, res) => {
    try {
        const announcements = await Announcement.find()
            .sort({ createdAt: -1 });

        res.status(200).json(announcements);
    } catch (error) {
        console.error("Admin announcements error:", error.message);
        res.status(500).json({
            message: "Failed to fetch announcements."
        });
    }
});

// ==========================================
// POST /api/admin/announcements
// Create an announcement
// ==========================================
router.post("/announcements", async (req, res) => {
    try {
        const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
        const message = typeof req.body.message === "string" ? req.body.message.trim() : "";

        if (!title || !message) {
            return res.status(400).json({
                message: "Title and message are required."
            });
        }

        if (title.length > 120) {
            return res.status(400).json({ message: "Title must be 120 characters or fewer." });
        }

        if (message.length > 500) {
            return res.status(400).json({ message: "Message must be 500 characters or fewer." });
        }

        const announcement = await Announcement.create({
            title,
            message,
            createdBy: {
                name: req.user.name,
                email: req.user.email
            }
        });

        res.status(201).json(announcement);
    } catch (error) {
        console.error("Create announcement error:", error.message);
        res.status(500).json({
            message: "Failed to create announcement."
        });
    }
});

// DELETE /api/admin/announcements/:id
router.delete("/announcements/:id", async (req, res) => {
    try {
        const announcement = await Announcement.findByIdAndDelete(req.params.id);

        if (!announcement) {
            return res.status(404).json({ message: "Announcement not found." });
        }

        res.status(200).json({ message: "Announcement deleted successfully." });
    } catch (error) {
        console.error("Delete announcement error:", error.message);
        res.status(500).json({
            message: "Failed to delete announcement."
        });
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
        console.error("Admin delete post error:", error.message);
        res.status(500).json({ message: "Failed to delete post." });
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
            { new: true, runValidators: true }
        );

        if (!post) {
            return res.status(404).json({ message: "Post not found." });
        }

        res.status(200).json({ message: `Post status set to ${status}.`, post });
    } catch (error) {
        console.error("Admin post status error:", error.message);
        res.status(500).json({ message: "Failed to update post status." });
    }
});

// ==========================================
// GET /api/admin/users
// Get all users (paginated)
// ==========================================
router.get("/users", async (req, res) => {
    try {
        const { limit, page, skip } = readPaging(req.query);

        const [users, total] = await Promise.all([
            User.find()
                .select("-password")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            User.countDocuments()
        ]);

        res.status(200).json({ users, total, page, limit });
    } catch (error) {
        console.error("Admin users error:", error.message);
        res.status(500).json({ message: "Failed to fetch users." });
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

        // Never let an admin lock themselves (or another admin) out of the panel
        if (user.role === "admin") {
            return res.status(400).json({
                message: "Admin accounts cannot be flagged."
            });
        }

        user.isFlagged = !user.isFlagged;
        await user.save();

        res.status(200).json({
            message: `User ${user.isFlagged ? "flagged" : "unflagged"} successfully.`,
            user: { id: user._id, name: user.name, email: user.email, isFlagged: user.isFlagged }
        });
    } catch (error) {
        console.error("Admin flag user error:", error.message);
        res.status(500).json({ message: "Failed to flag user." });
    }
});

module.exports = router;
