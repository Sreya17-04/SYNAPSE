const express = require("express");
const Post = require("../models/Post");

const router = express.Router();

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

// GET /api/top-discussions
// Return active posts ordered by the number of likes. ?limit caps the
// list (default 5, max 10) so the sidebar widget never floods.
router.get("/", async (req, res) => {
    try {
        const requested = Number.parseInt(req.query.limit, 10);
        const limit = Number.isFinite(requested)
            ? Math.min(Math.max(requested, 1), MAX_LIMIT)
            : DEFAULT_LIMIT;

        const discussions = await Post.find({
            status: { $ne: "flagged" },
            $or: [{ openReportCount: 0 }, { openReportCount: { $exists: false } }]
        })
            .select("title likes commentCount author createdAt")
            .sort({ likes: -1, createdAt: -1 })
            .limit(limit);

        res.status(200).json(discussions);
    } catch (error) {
        console.error("Top discussions error:", error.message);
        res.status(500).json({
            message: "Failed to fetch top discussions."
        });
    }
});

module.exports = router;
