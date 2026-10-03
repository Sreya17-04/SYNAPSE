const express = require("express");
const User = require("../models/User");
const Post = require("../models/Post");
const Announcement = require("../models/Announcement");
const Report = require("../models/Report");
const AuditLog = require("../models/AuditLog");
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
        const openReports = await Report.countDocuments({ status: "open" });

        res.status(200).json({
            totalUsers,
            totalPosts,
            openReports,
            pendingReports: flaggedPosts + flaggedUsers + openReports,
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

        await AuditLog.record({
            action: "announcement.created",
            actor: req.user,
            target: { type: "announcement", id: announcement._id, label: title },
            req
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

        await AuditLog.record({
            action: "announcement.deleted",
            actor: req.user,
            target: { type: "announcement", id: announcement._id, label: announcement.title },
            req
        });

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

        await User.updateMany(
            { savedPosts: req.params.id },
            { $pull: { savedPosts: req.params.id } }
        );

        await AuditLog.record({
            action: "post.deleted",
            actor: req.user,
            target: { type: "post", id: deletedPost._id, label: deletedPost.title },
            details: { category: deletedPost.category, status: deletedPost.status },
            req
        });

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

        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found." });
        }

        if (!["active", "flagged", "approved"].includes(status)) {
            return res.status(400).json({ message: "Invalid status value." });
        }

        const previousStatus = post.status;
        post.status = status;
        await post.save();

        await AuditLog.record({
            action: "post.status_changed",
            actor: req.user,
            target: { type: "post", id: post._id, label: post.title },
            details: { from: previousStatus, to: status },
            req
        });

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

        await AuditLog.record({
            action: user.isFlagged ? "user.flagged" : "user.unflagged",
            actor: req.user,
            target: { type: "user", id: user._id, label: user.email },
            details: { name: user.name, isFlagged: user.isFlagged },
            req
        });

        res.status(200).json({
            message: `User ${user.isFlagged ? "flagged" : "unflagged"} successfully.`,
            user: { id: user._id, name: user.name, email: user.email, isFlagged: user.isFlagged }
        });
    } catch (error) {
        console.error("Admin flag user error:", error.message);
        res.status(500).json({ message: "Failed to flag user." });
    }
});

// ==========================================
// GET /api/admin/reports
// The moderation queue. Defaults to open reports only; pass ?status=all
// to see resolved history.
// ==========================================
router.get("/reports", async (req, res) => {
    try {
        const { limit, page, skip } = readPaging(req.query);

        const query = {};

        if (req.query.status && req.query.status !== "all") {
            if (!Report.REPORT_STATUSES.includes(req.query.status)) {
                return res.status(400).json({
                    message: `Status must be one of: ${Report.REPORT_STATUSES.join(", ")}, all.`
                });
            }

            query.status = req.query.status;
        }

        const [reports, total] = await Promise.all([
            Report.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Report.countDocuments(query)
        ]);

        res.status(200).json({ reports, total, page, limit });

    } catch (error) {
        console.error("Admin reports error:", error.message);
        res.status(500).json({ message: "Failed to fetch reports." });
    }
});

// ==========================================
// PATCH /api/admin/reports/:id
// Resolve or dismiss a report.
// ==========================================
router.patch("/reports/:id", async (req, res) => {
    try {
        const { status, action, note } = req.body;

        if (!["resolved", "dismissed"].includes(status)) {
            return res.status(400).json({
                message: "Status must be resolved or dismissed."
            });
        }

        const cleanAction = typeof action === "string" ? action.trim().slice(0, 120) : "";
        const cleanNote = typeof note === "string" ? note.trim().slice(0, 500) : "";

        const report = await Report.findById(req.params.id);

        if (!report) {
            return res.status(404).json({ message: "Report not found." });
        }

        if (report.status !== "open") {
            return res.status(409).json({
                message: `This report was already ${report.status}.`
            });
        }

        report.status = status;
        report.resolution = {
            action: cleanAction,
            note: cleanNote,
            resolvedBy: { name: req.user.name, email: req.user.email },
            resolvedAt: new Date()
        };

        await report.save();

        await AuditLog.record({
            action: status === "resolved" ? "report.resolved" : "report.dismissed",
            actor: req.user,
            target: { type: "report", id: report._id, label: report.postSnapshot.title },
            details: {
                reason: report.reason,
                resolutionAction: cleanAction,
                note: cleanNote
            },
            req
        });

        res.status(200).json({ message: `Report ${status}.`, report });

    } catch (error) {
        console.error("Admin update report error:", error.message);
        res.status(500).json({ message: "Failed to update report." });
    }
});

// ==========================================
// GET /api/admin/audit-log
// Append-only moderation history. Optional ?action= filter.
// ==========================================
router.get("/audit-log", async (req, res) => {
    try {
        const { limit, page, skip } = readPaging(req.query);

        const query = {};

        if (req.query.action) {
            if (!AuditLog.ACTIONS.includes(req.query.action)) {
                return res.status(400).json({
                    message: `Unknown action. Valid actions: ${AuditLog.ACTIONS.join(", ")}.`
                });
            }

            query.action = req.query.action;
        }

        const [entries, total] = await Promise.all([
            AuditLog.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            AuditLog.countDocuments(query)
        ]);

        res.status(200).json({ entries, total, page, limit });

    } catch (error) {
        console.error("Admin audit log error:", error.message);
        res.status(500).json({ message: "Failed to fetch audit log." });
    }
});

module.exports = router;
