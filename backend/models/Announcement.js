const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120
        },
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500
        },
        createdBy: {
            name: {
                type: String,
                required: true
            },
            email: {
                type: String,
                required: true
            }
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

announcementSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model("Announcement", announcementSchema);