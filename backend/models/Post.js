const mongoose = require("mongoose");

const CATEGORIES = [
    "Academic",
    "Placement",
    "Events",
    "General",
    "Internships",
    "Projects",
    "Other"
];

const commentSchema = new mongoose.Schema(
    {
        author: {
            type: String,
            required: true,
            trim: true
        },
        authorEmail: {
            type: String,
            default: ""
        },
        text: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000
        },
        // Chain comments: null means a top-level comment; otherwise the id of
        // the comment this one replies to (always within the same post).
        parentId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
        // Set when a comment is edited. Absent until the first edit, so the UI
        // can distinguish "never edited" from "edited at the original time".
        editedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

const postSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Title is required"],
            trim: true,
            maxlength: [200, "Title must be 200 characters or fewer"]
        },

        author: {
            type: String,
            required: [true, "Author is required"],
            trim: true
        },

        authorEmail: {
            type: String,
            default: ""
        },

        category: {
            type: String,
            required: [true, "Category is required"],
            enum: {
                values: CATEGORIES,
                message: "`{VALUE}` is not a valid category."
            }
        },

        content: {
            type: String,
            required: [true, "Content is required"],
            maxlength: [10000, "Content must be 10000 characters or fewer"]
        },

        // Like system.
        // likes is a denormalised counter - likedBy is the source of truth
        // and the pre-save hook below keeps the two in sync.
        likes: {
            type: Number,
            default: 0,
            min: 0
        },

        likedBy: {
            type: [String], // array of user emails
            default: []
        },

        // Comment system
        comments: {
            type: [commentSchema],
            default: []
        },

        // Denormalised length of `comments`, kept in sync by the pre-save
        // hook below so the feed can project the comments array out entirely.
        commentCount: {
            type: Number,
            default: 0,
            min: 0
        },

        // Number of open (unresolved, undismissed) reports against this post.
        // The public feed, saved list and detail endpoint hide any post with a
        // positive count; the owner and moderators still see it. Resolving or
        // dismissing a report decrements the counter, which makes the post
        // visible again automatically.
        openReportCount: {
            type: Number,
            default: 0,
            min: 0
        },

        // One optional attachment per post (any file type, capped at upload
        // time by multer). Only metadata is stored here; the bytes live under
        // backend/uploads/ and are served from /uploads/<filename>.
        attachment: {
            type: {
                filename: { type: String, default: "" },
                originalName: { type: String, default: "" },
                mimetype: { type: String, default: "" },
                size: { type: Number, default: 0 }
            },
            default: null
        },

        // Moderation
        status: {
            type: String,
            enum: ["active", "flagged", "approved"],
            default: "active"
        }
    },
    {
        timestamps: true
    }
);

// Keep the like counter authoritative and free of duplicates, and keep the
// comment counter in step with the embedded array.
// Mongoose 9 does not pass a `next` callback to middleware, so this
// must be a plain (optionally async) function.
postSchema.pre("save", function () {
    if (!this.likedBy) {
        return;
    }

    const seen = new Set();

    this.likedBy = this.likedBy
        .filter((email) => typeof email === "string" && email.trim())
        .map((email) => email.trim().toLowerCase())
        .filter((email) => {
            if (seen.has(email)) {
                return false;
            }
            seen.add(email);
            return true;
        });

    this.likes = this.likedBy.length;
    this.commentCount = Array.isArray(this.comments) ? this.comments.length : 0;
});

// Supports the public feed, trending and the admin moderation lists
postSchema.index({ status: 1, createdAt: -1 });
postSchema.index({ likes: -1, createdAt: -1 });
postSchema.index({ authorEmail: 1, createdAt: -1 });

module.exports = mongoose.model("Post", postSchema);
module.exports.CATEGORIES = CATEGORIES;
