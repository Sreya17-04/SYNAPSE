const express = require("express");
const Post = require("../models/Post");
const User = require("../models/User");
const Announcement = require("../models/Announcement");

const router = express.Router();

// ==========================================
// GET /api/stats
// Public, aggregate-only counts used by the landing hero.
// Exposes nothing beyond three numbers - no user data, no post content.
// ==========================================
router.get("/", async (req, res) => {
    try {
        const [students, discussions, announcements] = await Promise.all([
            User.countDocuments({ role: "student" }),
            Post.countDocuments({ status: { $ne: "flagged" } }),
            Announcement.countDocuments({ isActive: true })
        ]);

        res.status(200).json({ students, discussions, announcements });
    } catch (error) {
        console.error("Stats error:", error.message);
        res.status(500).json({
            message: "Failed to fetch community stats."
        });
    }
});

module.exports = router;
