const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
    {
        author: {
            type: String,
            required: true
        },
        authorEmail: {
            type: String,
            default: ""
        },
        text: {
            type: String,
            required: true
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
            required: true
        },

        author: {
            type: String,
            required: true
        },

        authorEmail: {
            type: String,
            default: ""
        },

        category: {
            type: String,
            required: true
        },

        content: {
            type: String,
            required: true
        },

        // Like system
        likes: {
            type: Number,
            default: 0
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

module.exports = mongoose.model("Post", postSchema);