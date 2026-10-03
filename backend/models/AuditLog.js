const mongoose = require("mongoose");
const { identityOf } = require("./User");

/**
 * Append-only record of every moderation action.
 *
 * There is deliberately no update or delete path for these documents: the
 * value of an audit trail depends on entries being immutable, so corrections
 * are made by recording a new entry rather than editing history.
 */

const ACTIONS = [
    "post.status_changed",
    "post.updated",
    "post.deleted",
    "post.reported",
    "comment.deleted",
    "user.flagged",
    "user.unflagged",
    "user.deleted",
    "announcement.created",
    "announcement.deleted",
    "report.resolved",
    "report.dismissed"
];

const TARGET_TYPES = ["post", "user", "announcement", "report", "comment", "system"];

const auditLogSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            required: true,
            enum: ACTIONS
        },

        // Who performed the action. Kept as a snapshot rather than a reference
        // so the entry stays readable even if the account is later removed.
        actor: {
            name: { type: String, default: "system", trim: true },
            email: { type: String, default: "", lowercase: true, trim: true }
        },

        target: {
            type: {
                type: String,
                enum: TARGET_TYPES,
                default: "system"
            },
            id: { type: String, default: "" },
            // Human-readable summary, e.g. a post title. Truncated on write.
            label: { type: String, default: "", maxlength: 200 }
        },

        // Free-form before/after values, e.g. { from: "active", to: "flagged" }.
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },

        ip: { type: String, default: "" },
        userAgent: { type: String, default: "", maxlength: 300 }
    },
    { timestamps: true }
);

// The admin log is read newest-first and filtered by action/target.
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ "target.type": 1, createdAt: -1 });

/**
 * Build a ready-to-save entry. Callers use .catch() so a logging failure can
 * never roll back or 500 the moderation action the admin actually requested.
 */
auditLogSchema.statics.record = async function ({
    action,
    actor,
    target = {},
    details = {},
    req
}) {
    try {
        return await this.create({
            action,
            actor: {
                name: actor?.name || "system",
                // Email for admins, universityRegNo for seeded students.
                email: identityOf(actor)
            },
            target: {
                type: target.type || "system",
                id: target.id ? String(target.id) : "",
                label: target.label ? String(target.label).slice(0, 200) : ""
            },
            details,
            ip: req?.ip || "",
            userAgent: req?.get?.("user-agent") || ""
        });
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Audit log write failed:", error.message);
        return null;
    }
};

module.exports = mongoose.model("AuditLog", auditLogSchema);
module.exports.ACTIONS = ACTIONS;
module.exports.TARGET_TYPES = TARGET_TYPES;