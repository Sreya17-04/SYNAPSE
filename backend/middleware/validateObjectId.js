const mongoose = require("mongoose");

// ObjectId.isValid() is deliberately permissive - it accepts any 12-character
// string, which would let junk through to a CastError. Match the real format.
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * Rejects malformed MongoDB ObjectIds before they reach a query.
 *
 * Without this, `Post.findById("nope")` throws a CastError that the route's
 * own try/catch turns into a 500. With it, the client gets a clean 400.
 *
 * Usage:  router.param("id", validateObjectId("id"));
 */
const validateObjectId = (name = "id") => (req, res, next) => {
    const value = req.params[name];

    if (!OBJECT_ID_PATTERN.test(value) || !mongoose.Types.ObjectId.isValid(value)) {
        return res.status(400).json({
            message: `Invalid ${name}: expected a valid identifier.`
        });
    }

    next();
};

module.exports = { validateObjectId };
