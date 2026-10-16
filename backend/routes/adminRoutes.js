const express = require("express");
const User = require("../models/User");
const Post = require("../models/Post");
const Announcement = require("../models/Announcement");
const Report = require("../models/Report");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notification");
const { protect, adminOnly, moderatorOnly } = require("../middleware/authMiddleware");
const { validateObjectId } = require("../middleware/validateObjectId");
const { removeUpload } = require("../utils/uploads");

const router = express.Router();

// One identifier per account: the admin's email, a seeded student's
// universityRegNo. Used for audit labels, cascade deletion and log entries.
const identityOf = User.identityOf;

// Display value for a user: never the roll number (it is also the initial
// password), always the original casing.
const displayId = (user) => user.email || user.universityRegNo || "unknown";

// Every route in this file requires a session; individual groups below then
// require moderator staff (moderators + admins) or full admin rights.
router.use(protect);

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
// Moderator-visible routes: dashboard, posts, reports, audit log.
// Express treats a non-function argument after the path as another handler,
// so the paths travel as one array rather than as separate strings.
// ==========================================
router.use(
    ["/stats", "/posts", "/reports", "/audit-log"],
    moderatorOnly
);

// ==========================================
// Admin-only routes: user management, announcements, moderator roster.
// Declared before the generic :id patterns so the static paths always win.
// ==========================================
router.use(
    ["/users", "/announcements", "/moderators"],
    adminOnly
);

// ==========================================
// GET /api/admin/stats
// Dashboard statistics
// ==========================================
router.get("/stats", async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({ role: "student" });
        const totalPosts = await Post.countDocuments();
        const flaggedPosts = await Post.countDocuments({ status: "flagged" });
        const underReview = await Post.countDocuments({
            openReportCount: { $gt: 0 },
            status: { $ne: "flagged" }
        });
        const flaggedUsers = await User.countDocuments({ isFlagged: true });
        const openReports = await Report.countDocuments({ status: "open" });

        res.status(200).json({
            totalUsers,
            totalPosts,
            flaggedPosts,
            underReview,
            openReports,
            pendingReports: flaggedPosts + flaggedUsers + openReports,
            activeDiscussions: await Post.countDocuments({
                status: { $ne: "flagged" },
                $or: [{ openReportCount: 0 }, { openReportCount: { $exists: false } }]
            })
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
            Post.find()
                .select("-comments")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
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
// Announcements for management, paginated so a long history cannot
// overwhelm the tab.
// ==========================================
router.get("/announcements", async (req, res) => {
    try {
        const { limit, page, skip } = readPaging(req.query);

        const [announcements, total] = await Promise.all([
            Announcement.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Announcement.countDocuments()
        ]);

        res.status(200).json({ announcements, total, page, limit });
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
                email: identityOf(req.user)
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
// GET /api/admin/moderators
// The staff roster: every admin and moderator account.
// ==========================================
router.get("/moderators", async (req, res) => {
    try {
        const moderators = await User.find({ role: { $in: ["admin", "moderator"] } })
            .select("name email universityRegNo role isFlagged createdAt")
            .sort({ role: 1, createdAt: -1 });

        res.status(200).json({ moderators });
    } catch (error) {
        console.error("Admin moderators error:", error.message);
        res.status(500).json({ message: "Failed to fetch moderators." });
    }
});

// ==========================================
// PATCH /api/admin/users/:id/role
// Promote a student to moderator, or demote a moderator back to student.
// Admin accounts are immutable through this endpoint.
// ==========================================
router.patch("/users/:id/role", async (req, res) => {
    try {
        const { role } = req.body;

        if (!["student", "moderator"].includes(role)) {
            return res.status(400).json({
                message: "Role must be student or moderator."
            });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        if (user.role === "admin") {
            return res.status(400).json({
                message: "Admin accounts cannot change role from here."
            });
        }

        if (String(user._id) === String(req.user._id)) {
            return res.status(400).json({
                message: "You cannot change your own role."
            });
        }

        if (user.role === role) {
            return res.status(400).json({
                message: `That account is already ${role}.`
            });
        }

        const previousRole = user.role;
        user.role = role;
        await user.save();

        await AuditLog.record({
            action: "user.role_changed",
            actor: req.user,
            target: { type: "user", id: user._id, label: displayId(user) },
            details: { name: user.name, from: previousRole, to: role },
            req
        });

        await Notification.notify({
            recipientEmail: identityOf(user),
            type: "system",
            title:
                role === "moderator"
                    ? "You are now a moderator"
                    : "Your moderator access was removed",
            message:
                role === "moderator"
                    ? "You can now help moderate discussions from the admin panel."
                    : "Your account has been returned to student access.",
            link: role === "moderator" ? "admin.html" : "index.html"
        });

        res.status(200).json({
            message: `${user.name} is now ${role}.`,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                universityRegNo: user.universityRegNo,
                role: user.role
            }
        });
    } catch (error) {
        console.error("Admin change role error:", error.message);
        res.status(500).json({ message: "Failed to update role." });
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
            return res.status(404).json({ message: "This discussion no longer exists." });
        }

        await User.updateMany(
            { savedPosts: req.params.id },
            { $pull: { savedPosts: req.params.id } }
        );

        if (deletedPost.attachment && deletedPost.attachment.filename) {
            removeUpload(deletedPost.attachment.filename);
        }

        await AuditLog.record({
            action: "post.deleted",
            actor: req.user,
            target: { type: "post", id: deletedPost._id, label: deletedPost.title },
            details: { category: deletedPost.category, status: deletedPost.status },
            req
        });

        if (deletedPost.authorEmail) {
            await Notification.notify({
                recipientEmail: deletedPost.authorEmail,
                type: "post_deleted",
                title: "Your discussion was removed",
                message: `“${deletedPost.title.slice(0, 80)}” was removed by a moderator.`,
                link: "index.html?view=myposts"
            });
        }

        res.status(200).json({ message: "Discussion deleted successfully." });
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
            return res.status(404).json({ message: "This discussion no longer exists." });
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

        if (post.authorEmail && previousStatus !== status) {
            if (status === "flagged") {
                await Notification.notify({
                    recipientEmail: post.authorEmail,
                    type: "post_flagged",
                    title: "Your discussion was flagged",
                    message: `“${post.title.slice(0, 80)}” is hidden from the feed while a moderator reviews it.`,
                    link: "index.html?view=myposts"
                });
            } else if (previousStatus === "flagged") {
                await Notification.notify({
                    recipientEmail: post.authorEmail,
                    type: "post_restored",
                    title: "Your discussion is visible again",
                    message: `“${post.title.slice(0, 80)}” has been restored to the discussion feed.`,
                    link: `post.html?id=${post._id}`
                });
            }
        }

        res.status(200).json({ message: `Post status set to ${status}.`, post });
    } catch (error) {
        console.error("Admin post status error:", error.message);
        res.status(500).json({ message: "Failed to update post status." });
    }
});

// ==========================================
// GET /api/admin/users
// Get all users (paginated). Staff accounts are listed separately on the
// Moderators tab, so this feed stays student-only.
// ==========================================
router.get("/users", async (req, res) => {
    try {
        const { limit, page, skip } = readPaging(req.query);

        const query = { role: "student" };

        const [users, total] = await Promise.all([
            User.find(query)
                .select("-password")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            User.countDocuments(query)
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

        // Never let an admin lock staff accounts out of the panel
        if (user.role !== "student") {
            return res.status(400).json({
                message: "Staff accounts cannot be flagged."
            });
        }

        user.isFlagged = !user.isFlagged;
        await user.save();

        await AuditLog.record({
            action: user.isFlagged ? "user.flagged" : "user.unflagged",
            actor: req.user,
            target: { type: "user", id: user._id, label: displayId(user) },
            details: { name: user.name, isFlagged: user.isFlagged },
            req
        });

        await Notification.notify({
            recipientEmail: identityOf(user),
            type: "system",
            title: user.isFlagged
                ? "Your account has been suspended"
                : "Your account has been reinstated",
            message: user.isFlagged
                ? "You cannot post, comment or like while the suspension is active."
                : "You can post, comment and like again.",
            link: "index.html"
        });

        res.status(200).json({
            message: `User ${user.isFlagged ? "flagged" : "unflagged"} successfully.`,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                universityRegNo: user.universityRegNo,
                isFlagged: user.isFlagged
            }
        });
    } catch (error) {
        console.error("Admin flag user error:", error.message);
        res.status(500).json({ message: "Failed to flag user." });
    }
});

// ==========================================
// DELETE /api/admin/users/:id
// Permanently delete a student account and everything authored by it.
// ==========================================
router.delete("/users/:id", async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // Same guard as flagging: staff accounts are never removable here.
        if (user.role !== "student") {
            return res.status(400).json({
                message: "Staff accounts cannot be deleted."
            });
        }

        // Defence in depth: never let a request delete the session making it.
        if (String(user._id) === String(req.user._id)) {
            return res.status(400).json({
                message: "You cannot delete your own account."
            });
        }

        // Email for the admin, universityRegNo for a seeded student. Lowercased
        // because that is how identityOf() stores it on authored content.
        const identity = identityOf(user);

        // The account goes first so a later failure can never leave a live
        // account whose content was already destroyed.
        await User.deleteOne({ _id: user._id });

        let deletedPosts = 0;
        let removedComments = 0;
        let removedLikes = 0;

        // Everything below keys off the author identifier, so an account without
        // one would match the empty-string default on other people's content.
        if (identity) {
            // Authored posts, and the savedPosts entries pointing at them.
            const authored = await Post.find({ authorEmail: identity });
            const postIds = authored.map((post) => post._id);
            deletedPosts = postIds.length;

            for (const post of authored) {
                if (post.attachment && post.attachment.filename) {
                    removeUpload(post.attachment.filename);
                }
            }

            if (postIds.length > 0) {
                await Post.deleteMany({ _id: { $in: postIds } });

                await User.updateMany(
                    { savedPosts: { $in: postIds } },
                    { $pull: { savedPosts: { $in: postIds } } }
                );
            }

            // Comments the user left on other people's posts. Snapshot the
            // affected post ids first, because the $pull below erases the
            // queryable evidence, then recompute commentCount per post
            // (updateMany bypasses the pre-save hook).
            const postsWithComments = await Post.find({
                "comments.authorEmail": identity
            }).select("_id");

            const commentResult = await Post.updateMany(
                { "comments.authorEmail": identity },
                { $pull: { comments: { authorEmail: identity } } }
            );
            removedComments = commentResult.modifiedCount || 0;

            if (postsWithComments.length > 0) {
                const refreshed = await Post.find({
                    _id: { $in: postsWithComments.map((post) => post._id) }
                }).select("comments");

                await Promise.all(
                    refreshed.map((post) =>
                        Post.updateOne(
                            { _id: post._id },
                            { $set: { commentCount: post.comments.length } }
                        )
                    )
                );
            }

            // Likes given by the user. updateMany skips the pre-save hook, so
            // the denormalised `likes` counter is recomputed from `likedBy`.
            const liked = await Post.find({ likedBy: identity }).select("_id");
            removedLikes = liked.length;

            if (liked.length > 0) {
                const likedIds = liked.map((post) => post._id);

                await Post.updateMany(
                    { likedBy: identity },
                    { $pull: { likedBy: identity } }
                );

                const refreshed = await Post.find({ _id: { $in: likedIds } })
                    .select("likedBy");

                await Promise.all(
                    refreshed.map((post) =>
                        Post.updateOne(
                            { _id: post._id },
                            { $set: { likes: post.likedBy.length } }
                        )
                    )
                );
            }
        }

        await AuditLog.record({
            action: "user.deleted",
            actor: req.user,
            target: { type: "user", id: user._id, label: displayId(user) },
            details: {
                name: user.name,
                posts: deletedPosts,
                comments: removedComments,
                likes: removedLikes
            },
            req
        });

        res.status(200).json({
            message: `Account ${displayId(user)} deleted successfully.`,
            deletedPosts
        });
    } catch (error) {
        console.error("Admin delete user error:", error.message);
        res.status(500).json({ message: "Failed to delete user." });
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

        const query = { status: "open" };

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
// Resolve or dismiss a report. Both outcomes un-hide the post once its last
// open report is cleared, and notify the reporter.
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
            resolvedBy: { name: req.user.name, email: identityOf(req.user) },
            resolvedAt: new Date()
        };

        await report.save();

        // Un-hide the post if this was its last open report.
        const remainingOpen = await Report.countDocuments({
            post: report.post,
            status: "open"
        });

        if (remainingOpen === 0) {
            await Post.updateOne(
                { _id: report.post, openReportCount: { $gt: 0 } },
                { $set: { openReportCount: 0 } }
            );
        }

        await AuditLog.record({
            action: status === "resolved" ? "report.resolved" : "report.dismissed",
            actor: req.user,
            target: { type: "report", id: report._id, label: report.postSnapshot.title },
            details: {
                reason: report.reason,
                resolutionAction: cleanAction,
                note: cleanNote,
                remainingOpen
            },
            req
        });

        if (report.reporter && report.reporter.email) {
            await Notification.notify({
                recipientEmail: report.reporter.email,
                type: status === "resolved" ? "report_resolved" : "report_dismissed",
                title:
                    status === "resolved"
                        ? "Your report was resolved"
                        : "Your report was dismissed",
                message: `Your report on “${report.postSnapshot.title.slice(0, 80)}” has been ${status}.`,
                link: "index.html"
            });
        }

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
