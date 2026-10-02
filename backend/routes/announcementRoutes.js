const express = require("express");
const Announcement = require("../models/Announcement");

const router = express.Router();

// GET /api/announcements
router.get("/", async (req, res) => {
    try {
        const announcements = await Announcement.find({ isActive: true })
            .select("title message createdAt")
            .sort({ createdAt: -1 })
            .limit(10);

        res.status(200).json(announcements);
    } catch (error) {
        console.error("Announcements error:", error.message);
        res.status(500).json({
            message: "Failed to fetch announcements."
        });
    }
});

module.exports = router;