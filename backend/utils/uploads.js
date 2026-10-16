const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

/**
 * Local-disk attachment storage for posts.
 *
 * Files land in backend/uploads/ and are served read-only from /uploads.
 * The filename is a random hex string plus the original extension, so a
 * client can never overwrite another upload or traverse out of the directory.
 *
 * Note for deployment: on ephemeral hosts (e.g. Render free tier) the disk is
 * wiped on every deploy/restart; attachments are best-effort there.
 */

const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

// Created lazily on first upload and at server start (see ensureUploadsDir).
const ensureUploadsDir = () => {
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    return UPLOADS_DIR;
};

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
    destination(req, file, cb) {
        try {
            cb(null, ensureUploadsDir());
        } catch (error) {
            cb(error);
        }
    },
    filename(req, file, cb) {
        const safeExt = path.extname(file.originalname || "").toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
        cb(null, `${crypto.randomBytes(16).toString("hex")}${safeExt}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 }
});

// Best-effort removal of a stored attachment; missing files are not an error.
const removeUpload = (filename) => {
    if (!filename || typeof filename !== "string") {
        return;
    }

    // Refuse anything that is not a bare filename inside the uploads dir.
    const base = path.basename(filename);
    if (base !== filename) {
        return;
    }

    try {
        fs.unlinkSync(path.join(UPLOADS_DIR, base));
    } catch {
        // Already gone, or never written - nothing to do.
    }
};

module.exports = {
    upload,
    removeUpload,
    ensureUploadsDir,
    UPLOADS_DIR,
    MAX_UPLOAD_BYTES
};
