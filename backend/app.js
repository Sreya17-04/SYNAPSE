const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

dotenv.config();

const postRoutes = require("./routes/postRoutes");
const topDiscussionRoutes = require("./routes/topDiscussionRoutes");
const announcementRoutes = require("./routes/announcementRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const statsRoutes = require("./routes/statsRoutes");

// ==========================================
// ENVIRONMENT VALIDATION
// Fail fast on missing secrets instead of
// throwing deep inside a request handler.
// ==========================================
const REQUIRED_ENV = ["JWT_SECRET", "MONGO_URI"];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
    console.error(
        `Missing required environment variable(s): ${missingEnv.join(", ")}`
    );
    console.error("Copy .env.example to .env and fill in the missing values.");
    process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
    console.warn(
        "WARNING: JWT_SECRET is shorter than 32 characters. Generate a strong one with:\n" +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
}

const app = express();

app.disable("x-powered-by");

// ==========================================
// ORIGIN ALLOWLIST
// Shared by the CSP (connect-src) and the CORS check below.
// Same-origin requests (frontend served from this server) never hit the
// allowlist. Cross-origin callers must be listed in CORS_ORIGINS.
// ==========================================
const DEFAULT_ORIGINS = [
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    // GitHub Pages frontend (static hosting - the API is served from here).
    "https://sreya17-04.github.io",
    // Custom domain, if the CNAME is re-added to docs/.
    "https://www.synpase.com",
    "https://synpase.com"
];

const ALLOWED_ORIGINS = new Set(
    (process.env.CORS_ORIGINS || DEFAULT_ORIGINS.join(","))
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
);

// ==========================================
// SECURITY HEADERS
// 'unsafe-inline' is deliberately absent from script-src and style-src.
// All page logic lives in external .js files and all styling in .css files,
// so an injected <script> or style attribute cannot execute. Google Fonts is
// allowlisted for style-src only because it serves the font stylesheet.
// ==========================================
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
                imgSrc: ["'self'", "data:"],
                // Must mirror the CORS allowlist, otherwise a frontend hosted
                // on a custom domain passes CORS but is blocked by CSP.
                connectSrc: ["'self'", ...ALLOWED_ORIGINS],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                upgradeInsecureRequests: null
            }
        },
        // The API and the static frontend are same-origin locally, but the
        // GitHub Pages frontend consumes this API cross-origin, so responses
        // must be readable there too.
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" }
    })
);

// ==========================================
// CORS
// ==========================================
app.use(
    cors({
        origin(origin, callback) {
            // No Origin header: same-origin, curl, or a native client.
            if (!origin) {
                return callback(null, true);
            }

            if (ALLOWED_ORIGINS.has(origin)) {
                return callback(null, true);
            }

            // Denying only omits the CORS headers, so the browser blocks the
            // response. Auth uses a bearer header rather than cookies, so no
            // credentialed request can ride along from a blocked origin.
            console.warn(`Blocked cross-origin request from: ${origin}`);
            return callback(null, false);
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    })
);

app.use(express.json({ limit: "1mb" }));

// Broad backstop so a single client cannot flood any endpoint. The auth
// routes layer a stricter, login-identifier-keyed limiter on top of this.
app.use(
    "/api",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 600,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        message: { message: "Too many requests. Slow down and try again shortly." }
    })
);

// ==========================================
// DATABASE AVAILABILITY
// bufferCommands is disabled (see config/db.js), so a query issued while the
// connection is down throws immediately. Answer with 503 rather than letting
// it surface as a confusing 500.
// ==========================================
app.use("/api", (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
            message: "Database is unavailable. Please retry shortly."
        });
    }

    next();
});

// API Routes
app.use("/api/posts", postRoutes);
app.use("/api/top-discussions", topDiscussionRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

// Health check
app.get("/api/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        service: "SYNAPSE Department Community API",
        database: ["disconnected", "connected", "connecting"][
            mongoose.connection.readyState
        ]
    });
});

// Serve the frontend from the same origin so the app runs on one port.
// The HTML files are public; all data still requires a valid JWT.
// Prefer docs (for GitHub Pages publishable) if it exists, else frontend.
const DOCS_DIR = path.join(__dirname, "..", "docs");
const FRONTEND_DIR = fs.existsSync(DOCS_DIR) ? DOCS_DIR : path.join(__dirname, "..", "frontend");
app.use(express.static(FRONTEND_DIR, { extensions: ["html"] }));

// Unknown API route -> JSON 404 (never fall through to the static handler)
app.use("/api", (req, res) => {
    res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Global error handler
app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    // Malformed MongoDB ObjectId in a URL param, e.g. /api/posts/not-an-id
    if (error.name === "CastError") {
        return res.status(400).json({ message: "Invalid resource identifier." });
    }

    // Unique index violation (e.g. duplicate universityRegNo)
    if (error.code === 11000) {
        return res.status(400).json({ message: "That record already exists." });
    }

    // Body parser failure on malformed JSON
    if (error instanceof SyntaxError && "body" in error) {
        return res.status(400).json({ message: "Request body is not valid JSON." });
    }

    console.error("Unhandled error:", error);
    res.status(500).json({ message: "Internal server error." });
});

const PORT = process.env.PORT || 5000;

// Exported so the test suite can mount the app on an ephemeral port without
// the process-level side effects that starting a listener here would cause.
module.exports = app;
module.exports.PORT = PORT;
