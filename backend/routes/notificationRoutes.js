const express = require("express");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const { validateObjectId } = require("../middleware/validateObjectId");

const router = express.Router();

// All routes here are per-account and require a session.
router.use(protect);

router.param("id", validateObjectId("id"));

const identityOf = User.identityOf;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

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
// GET /api/notifications
// The caller's notifications, newest first. ?unreadOnly=true narrows to
// unread; ?page / ?limit paginate.
// ==========================================
router.get("/", async (req, res) => {
    try {
        const { limit, page, skip } = readPaging(req.query);

        // recipientEmail keys off the identity string, not the account id.
        const identity = identityOf(req.user);

        const filter = { recipientEmail: identity };

        if (req.query.unreadOnly === "true" || req.query.unreadOnly === "1") {
            filter.read = false;
        }

        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Notification.countDocuments(filter),
            Notification.countDocuments({ recipientEmail: identity, read: false })
        ]);

        res.status(200).json({ notifications, total, page, limit, unreadCount });
    } catch (error) {
        console.error("Fetch notifications error:", error.message);
        res.status(500).json({ message: "Failed to fetch notifications." });
    }
});

// ==========================================
// GET /api/notifications/unread-count
// Lightweight poll for the navbar badge.
// ==========================================
router.get("/unread-count", async (req, res) => {
    try {
        const identity = identityOf(req.user);

        const unreadCount = await Notification.countDocuments({
            recipientEmail: identity,
            read: false
        });

        res.status(200).json({ unreadCount });
    } catch (error) {
        console.error("Unread count error:", error.message);
        res.status(500).json({ message: "Failed to fetch unread count." });
    }
});

// ==========================================
// PATCH /api/notifications/:id/read
// Mark one notification as read (only the recipient may do so).
// ==========================================
router.patch("/:id/read", async (req, res) => {
    try {
        const identity = identityOf(req.user);

        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipientEmail: identity },
            { $set: { read: true } },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ message: "Notification not found." });
        }

        res.status(200).json({ message: "Notification marked as read.", notification });
    } catch (error) {
        console.error("Mark notification read error:", error.message);
        res.status(500).json({ message: "Failed to update notification." });
    }
});

// ==========================================
// PATCH /api/notifications/read-all
// Clear the whole unread badge in one call.
// ==========================================
router.patch("/read-all", async (req, res) => {
    try {
        const identity = identityOf(req.user);

        const result = await Notification.updateMany(
            { recipientEmail: identity, read: false },
            { $set: { read: true } }
        );

        res.status(200).json({
            message: "All notifications marked as read.",
            modified: result.modifiedCount || 0
        });
    } catch (error) {
        console.error("Mark all notifications read error:", error.message);
        res.status(500).json({ message: "Failed to update notifications." });
    }
});

module.exports = router;
