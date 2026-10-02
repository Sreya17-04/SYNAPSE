const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Kept in one place so the schema, the register route and the seeder
// can never disagree about how long a password must be.
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

        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [EMAIL_PATTERN, "Email must be a valid address"],
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
    },
    {
        timestamps: true,
    }
);

userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ isFlagged: 1 });

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
