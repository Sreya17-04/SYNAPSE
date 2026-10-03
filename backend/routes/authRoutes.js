const express = require("express");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;
const User = require("../models/User");
const { protect, JWT_ALGORITHM } = require("../middleware/authMiddleware");

const router = express.Router();

// Shorter than the previous 7 days, and configurable. The client has no
// refresh flow, so it treats a 401 as "session over" and bounces to login.
const TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";

// Brute-force guards. Keyed by IP + submitted identifier so one attacker
// cannot lock every account out, and a shared-NAT student host is not
// penalised for other users' traffic.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) =>
        `${ipKeyGenerator(req.ip)}:${String(req.body?.username || req.body?.email || "").toLowerCase().trim()}`,
    message: { message: "Too many login attempts. Try again in a few minutes." }
});

const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

// Helper: generate JWT token. tokenVersion is embedded so that bumping the
// user's tokenVersion (logout) retires this token immediately.
const generateToken = (user) =>
    jwt.sign({ id: user._id, tokenVersion: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, {
        expiresIn: TOKEN_EXPIRES_IN,
        algorithm: JWT_ALGORITHM
    });

// Shared shape for /login and /me so they cannot drift apart. `email` is
// absent for pre-provisioned students; universityRegNo is their identifier.
const toPublicUser = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    universityRegNo: user.universityRegNo || null
});

// ==========================================
// POST /api/auth/login
// Two shapes, one endpoint:
//   students  -> { username, password }   username = universityRegNo,
//                                         password = roll number
//   admins    -> { email, password }      unchanged, used by admin-login page
//
// There is no student registration route: student accounts are created only
// by seeding backend/studentSeedData.js.
// ==========================================
router.post("/login", loginLimiter, async (req, res) => {
    try {
        const username = cleanText(req.body.username);
        const email = cleanText(req.body.email).toLowerCase();
        const password =
            typeof req.body.password === "string" ? req.body.password : "";

        const wantsStudentLogin = Boolean(username);

        if (!wantsStudentLogin && !email) {
            return res.status(400).json({
                message: "Please provide your registration number and password."
            });
        }

        if (!password) {
            return res.status(400).json({
                message: wantsStudentLogin
                    ? "Please provide your registration number and password."
                    : "Please provide email and password."
            });
        }

        // ---- Student: university registration number + roll number ----
        if (wantsStudentLogin) {
            // One lookup, one message: an unknown registration number, a wrong
            // roll number and a non-student account are indistinguishable, so
            // the response never confirms which of them was wrong.
            const user = await User.findOne({
                universityRegNo: username.toUpperCase()
            }).select("+password");

            const isMatch = user ? await user.matchPassword(password) : false;

            if (!user || !isMatch || user.role !== "student") {
                return res.status(401).json({
                    message: "Invalid registration number or password."
                });
            }

            if (user.isFlagged) {
                return res.status(403).json({
                    message: "Your account has been suspended by a moderator."
                });
            }

            const token = generateToken(user);

            return res.status(200).json({
                message: "Login successful!",
                token,
                user: toPublicUser(user)
            });
        }

        // ---- Admin: email + password (unchanged admin login page) ----
        // Students deliberately cannot authenticate this way.
        const user = await User.findOne({ email, role: "admin" }).select("+password");

        // Compare before branching on flags so a suspended account cannot be
        // distinguished from a bad password by response timing or message.
        const isMatch = user ? await user.matchPassword(password) : false;

        if (!user || !isMatch) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        if (user.isFlagged) {
            return res.status(403).json({
                message: "Your account has been suspended by a moderator."
            });
        }

        const token = generateToken(user);

        res.status(200).json({
            message: "Login successful!",
            token,
            user: toPublicUser(user)
        });

    } catch (error) {
        console.error("Login error:", error.message);
        res.status(500).json({ message: "Login failed." });
    }
});

// ==========================================
// POST /api/auth/logout
// Retires every token issued to this user by bumping tokenVersion.
// ==========================================
router.post("/logout", protect, async (req, res) => {
    try {
        // protect already loaded the user, so a fresh fetch is unnecessary
        req.user.tokenVersion = (req.user.tokenVersion ?? 0) + 1;
        await req.user.save();

        res.status(200).json({
            message: "Logged out. This signs you out on every device."
        });
    } catch (error) {
        console.error("Logout error:", error.message);
        res.status(500).json({ message: "Logout failed." });
    }
});

// ==========================================
// GET /api/auth/me
// Get current logged-in user from token.
// Lets the client validate a cached token on page load instead of trusting
// localStorage.
// ==========================================
router.get("/me", protect, (req, res) => {
    res.status(200).json({
        user: toPublicUser(req.user)
    });
});

module.exports = router;
