const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Pin the algorithm instead of trusting whatever the token header claims,
// so an "alg": "none" token can never be accepted.
const JWT_ALGORITHM = "HS256";

const extractToken = (req) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        return null;
    }

    return header.slice("Bearer ".length).trim() || null;
};

/**
 * Verify a bearer token and load its user.
 * Returns null instead of writing a response so callers can decide whether
 * an absent token is fatal (protect) or tolerable (optionalAuth).
 */
const resolveUser = async (token) => {
    let decoded;

    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: [JWT_ALGORITHM]
        });
    } catch {
        return null;
    }

    // Exclude the password hash from every request-scoped user object.
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
        return null;
    }

    // A logout bumps tokenVersion, which retires every token minted before it.
    if ((decoded.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
        return null;
    }

    return user;
};

/**
 * protect - Verifies JWT from Authorization header.
 * Attaches decoded user info to req.user.
 */
const protect = async (req, res, next) => {
    const token = extractToken(req);

    if (!token) {
        return res.status(401).json({
            message: "Not authorized. No token provided."
        });
    }

    let user;

    try {
        user = await resolveUser(token);
    } catch {
        return res.status(401).json({
            message: "Token verification failed. Not authorized."
        });
    }

    if (!user) {
        return res.status(401).json({
            message: "Not authorized. Your session is invalid or has expired."
        });
    }

    // Flagged accounts keep read access to public data but lose every
    // mutating permission, which is what makes the flag meaningful.
    if (user.isFlagged) {
        return res.status(403).json({
            message: "Your account has been suspended by a moderator."
        });
    }

    req.user = user;
    next();
};

/**
 * optionalAuth - Same verification as protect, but never rejects.
 *
 * Lets a public endpoint personalise its response (e.g. marking which posts
 * the caller owns) without forcing every visitor to be logged in.
 */
const optionalAuth = async (req, res, next) => {
    const token = extractToken(req);

    if (token) {
        try {
            req.user = await resolveUser(token);
        } catch {
            req.user = undefined;
        }
    }

    next();
};

/**
 * adminOnly - Must be used AFTER protect middleware.
 * Blocks non-admin users with 403 Forbidden.
 */
const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === "admin") {
        return next();
    }

    return res.status(403).json({
        message: "Access denied. Admin privileges required."
    });
};

module.exports = { protect, adminOnly, optionalAuth, JWT_ALGORITHM };
