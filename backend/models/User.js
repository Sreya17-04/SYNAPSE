const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Kept in one place so the schema and the seeder can never disagree about
// how long a password must be.
const MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
            maxlength: [80, "Name must be 80 characters or fewer"],
        },

        // Optional. Student accounts are pre-provisioned from the official
        // list and never carry an email; the field stays for the admin
        // account and for any account created before that change. Student
        // login never reads it.
        //
        // sparse is required: without it the unique index would treat every
        // email-less student as the same null key and reject the second one.
        email: {
            type: String,
            unique: true,
            sparse: true,
            lowercase: true,
            trim: true,
            match: [EMAIL_PATTERN, "Email must be a valid address"],
        },

        // Official class list identifier. This - not email - is what a
        // student types as their username, and it is unique across accounts.
        universityRegNo: {
            type: String,
            unique: true,
            sparse: true,
            uppercase: true,
            trim: true,
        },

        // Also the student's initial password, so it is excluded from every
        // query by default for the same reason `password` is.
        rollNo: {
            type: String,
            uppercase: true,
            trim: true,
            select: false,
        },

        // Never returned unless explicitly requested with .select("+password")
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [
                MIN_PASSWORD_LENGTH,
                `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
            ],
            select: false,
        },

        role: {
            type: String,
            enum: ["student", "admin"],
            default: "student",
        },

        // Set by a moderator. authMiddleware refuses flagged accounts, so this
        // is an enforced suspension rather than a cosmetic label.
        isFlagged: {
            type: Boolean,
            default: false,
        },

        // Incremented on logout. Tokens carry the value they were signed with,
        // so bumping it invalidates every previously issued token for this
        // user (and survives a server restart, unlike an in-memory denylist).
        tokenVersion: {
            type: Number,
            default: 0,
        },

        // Saved posts live on the account rather than in the browser, so the
        // list follows the student to another device. Stale ids (a post that
        // was deleted or hidden by a moderator) are filtered out on read
        // rather than here, so the record self-heals over time.
        savedPosts: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
            default: []
        },
    },
    {
        timestamps: true,
    }
);

userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ isFlagged: 1 });

// Every account must be reachable by exactly one identifier: the admin signs
// in with its email, a seeded student with universityRegNo. Enforced at
// creation only, because a later save may load a projection (`select
// ("savedPosts")`) where neither field is present - the value itself is
// immutable once the account exists.
userSchema.pre("validate", function () {
    if (!this.isNew) {
        return;
    }

    if (!this.email && !this.universityRegNo) {
        this.invalidate(
            "universityRegNo",
            "An account needs either an email or a university registration number."
        );
    }
});

/**
 * The one string an account is keyed on across the app: authorEmail on posts
 * and comments, likedBy entries, reporter.email on reports, the admin
 * cascade-delete queries and the audit log.
 *
 * Students resolve to their registration number, accounts that still carry an
 * email resolve to it. Normalised to lowercase because Post.likedBy and the
 * deletion queries store lowercased values, and every comparison in the code
 * base is case-insensitive on top of that.
 */
const identityOf = (user) => {
    const raw = (user && (user.email || user.universityRegNo)) || "";

    return typeof raw === "string" ? raw.trim().toLowerCase() : "";
};

// Hash password before saving
userSchema.pre("save", async function () {
    if (!this.isModified("password")) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
    return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
module.exports.MIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH;
module.exports.EMAIL_PATTERN = EMAIL_PATTERN;
module.exports.identityOf = identityOf;
