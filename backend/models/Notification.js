const mongoose = require("mongoose");

/**
 * In-app notifications for students (and staff).
 *
 * Delivery is pull-based: the client polls /api/notifications, so there is no
 * websocket layer. Writes go through the static notify() helper, which never
 * throws - the same pattern as AuditLog.record - so a notification failure can
 * never roll back the action that triggered it.
 */

const TYPES = [
    "post_deleted",
    "post_flagged",
    "post_restored",
    "report_resolved",
    "report_dismissed",
    "comment_reply",
    "system"
];

const MAX_TITLE = 150;
const MAX_MESSAGE = 300;

const notificationSchema = new mongoose.Schema(
    {
        // Recipient identity string (email for admins, regNo for students) -
        // the same key used by Post.authorEmail and Report.reporter.email.
        recipientEmail: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },

        type: {
            type: String,
            required: true,
            enum: TYPES,
            default: "system"
        },

        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: MAX_TITLE
        },

        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: MAX_MESSAGE
        },

        // Relative link the client navigates to on click, e.g.
        // "post.html?id=6532...". Kept as a path so it works on any host.
        link: {
            type: String,
            default: "",
            trim: true
        },

        read: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

// The inbox is read newest-first per recipient, usually filtered to unread.
notificationSchema.index({ recipientEmail: 1, createdAt: -1 });
notificationSchema.index({ recipientEmail: 1, read: 1, createdAt: -1 });

/**
 * Fire-and-forget notification write. Never throws; returns null on failure.
 */
notificationSchema.statics.notify = async function ({
    recipientEmail,
    type = "system",
    title,
    message,
    link = ""
}) {
    try {
        const recipient = typeof recipientEmail === "string"
            ? recipientEmail.trim().toLowerCase()
            : "";

        if (!recipient || !title || !message) {
            return null;
        }

        return await this.create({
            recipientEmail: recipient,
            type,
            title: String(title).slice(0, MAX_TITLE),
            message: String(message).slice(0, MAX_MESSAGE),
            link: typeof link === "string" ? link : ""
        });
    } catch (error) {
        console.error("Notification write failed:", error.message);
        return null;
    }
};

module.exports = mongoose.model("Notification", notificationSchema);
module.exports.TYPES = TYPES;
