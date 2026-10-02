const express = require("express");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;
const User = require("../models/User");
const { protect, JWT_ALGORITHM } = require("../middleware/authMiddleware");

const router = express.Router();

const EMAIL_PATTERN = User.EMAIL_PATTERN;
const MIN_PASSWORD_LENGTH = User.MIN_PASSWORD_LENGTH;

// Shorter than the previous 7 days, and configurable. The client has no
// refresh flow, so it treats a 401 as "session over" and bounces to login.
const TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";

// Brute-force guards. Keyed by IP + submitted email so one attacker cannot
// lock every account out, and a shared-NAT student host is not penalised for
// other users' traffic.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) =>
        `${ipKeyGenerator(req.ip)}:${String(req.body?.email || "").toLowerCase().trim()}`,
    message: { message: "Too many login attempts. Try again in a few minutes." }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many accounts created from this network. Try again later." }
});

const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

// Helper: generate JWT token. tokenVersion is embedded so that bumping the
// user's tokenVersion (logout) retires this token immediately.
const generateToken = (user) =>
    jwt.sign({ id: user._id, tokenVersion: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, {
        expiresIn: TOKEN_EXPIRES_IN,
        algorithm: JWT_ALGORITHM
    });

// Shared shape for /register, /login and /me so they cannot drift apart
const toPublicUser = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role
});

// ==========================================
// POST /api/auth/register
// Register a new student account
// ==========================================
router.post("/register", registerLimiter, async (req, res) => {
    try {
        const name = cleanText(req.body.name);
        const email = cleanText(req.body.email).toLowerCase();
        const password =
            typeof req.body.password === "string" ? req.body.password : "";

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Please provide name, email and password."
            });
        }

        if (!EMAIL_PATTERN.test(email)) {
            return res.status(400).json({
                message: "Please provide a valid email address."
            });
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({
                message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                message: "An account with this email already exists."
            });
        }

        // Create student user (role defaults to "student")
        const user = await User.create({
            name,
            email,
            password,
            role: "student"
        });

        const token = generateToken(user);

        res.status(201).json({
            message: "Account created successfully!",
            token,
            user: toPublicUser(user)
        });

    } catch (error) {
        // Two registrations can race past the findOne() check above
        if (error.code === 11000) {
            return res.status(400).json({
                message: "An account with this email already exists."
            });
        }

        console.error("Register error:", error.message);
        res.status(500).json({ message: "Registration failed." });
    }
});

// ==========================================
// POST /api/auth/login
// Login for both students and admins
// ==========================================
router.post("/login", loginLimiter, async (req, res) => {
    try {
        const email = cleanText(req.body.email).toLowerCase();
        const password =
            typeof req.body.password === "string" ? req.body.password : "";

        if (!email || !password) {
            return res.status(400).json({
                message: "Please provide email and password."
            });
        }

        // Find user by email (password is select:false on the schema)
        const user = await User.findOne({ email }).select("+password");

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
