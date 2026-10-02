const express = require("express");
const Post = require("../models/Post");

const router = express.Router();

// GET /api/top-discussions
// Return active posts ordered by the number of likes.
router.get("/", async (req, res) => {
    try {
        const discussions = await Post.find({ status: { $ne: "flagged" } })
            .select("title likes")
            .sort({ likes: -1, createdAt: -1 })
            .limit(10);

        res.status(200).json(discussions);
    } catch (error) {
        console.error("Top discussions error:", error.message);
        res.status(500).json({
            message: "Failed to fetch top discussions."
        });
    }
});

module.exports = router;