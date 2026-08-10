const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * protect – Verifies JWT from Authorization header.
 * Attaches decoded user info to req.user.
 */
const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer ")
    ) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return res.status(401).json({
            message: "Not authorized. No token provided."
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Fetch user from DB (exclude password)
        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
            return res.status(401).json({
                message: "User not found. Token invalid."
            });
        }

        req.user = user;
        next();

    } catch (error) {
        return res.status(401).json({
            message: "Token verification failed. Not authorized."
        });
    }
};

/**
 * adminOnly – Must be used AFTER protect middleware.
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

module.exports = { protect, adminOnly };
