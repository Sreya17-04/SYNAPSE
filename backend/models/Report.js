const mongoose = require("mongoose");

/**
 * A student-submitted report against a post.
 *
 * Reports are reviewed by a moderator, who either resolves them (the post was
 * actioned) or dismisses them (the report was not warranted). The resolution
 * is stored inline so the decision travels with the report.
 */

const REASONS = [
    "spam",
    "harassment",
    "misinformation",
    "inappropriate",
    "academic-integrity",
    "other"
];

const REPORT_STATUSES = ["open", "resolved", "dismissed"];

const MAX_DETAILS_LENGTH = 500;

const reportSchema = new mongoose.Schema(
    {
        post: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Post",
            required: true
        },

        // Snapshot of the reported post, so the queue still reads sensibly if
        // the post is deleted before a moderator gets to it.
        postSnapshot: {
            title: { type: String, default: "", maxlength: 200 },
            author: { type: String, default: "", maxlength: 80 },
            excerpt: { type: String, default: "", maxlength: 300 }
        },

        reporter: {
            name: { type: String, required: true, trim: true, maxlength: 80 },
            email: { type: String, required: true, lowercase: true, trim: true }
        },

        reason: {
            type: String,
            required: [true, "A reason is required"],
            enum: {
                values: REASONS,
                message: "`{VALUE}` is not a valid report reason."
            }
        },

        details: {
            type: String,
            default: "",
            trim: true,
            maxlength: MAX_DETAILS_LENGTH
        },

        status: {
            type: String,
            enum: REPORT_STATUSES,
            default: "open"
        },

        resolution: {
            action: { type: String, default: "", maxlength: 120 },
            note: { type: String, default: "", maxlength: 500 },
            resolvedBy: {
                name: { type: String, default: "" },
                email: { type: String, default: "", lowercase: true }
            },
            resolvedAt: { type: Date, default: null }
        }
    },
    { timestamps: true }
);

// Moderators triage the open queue newest-first.
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ post: 1 });
// One open report per student per post, enforced in the route because a
// partial unique index cannot express "only while status is open".
reportSchema.index({ "reporter.email": 1, post: 1, status: 1 });

module.exports = mongoose.model("Report", reportSchema);
module.exports.REASONS = REASONS;
module.exports.REPORT_STATUSES = REPORT_STATUSES;
module.exports.MAX_DETAILS_LENGTH = MAX_DETAILS_LENGTH;