const mongoose = require("mongoose");

/**
 * Fail fast instead of letting every request sit in mongoose's 10s
 * command buffer and then surface as an opaque 500.
 * server.js turns the resulting throw into a 503.
 */
mongoose.set("bufferCommands", false);

const RETRY_DELAYS = [0, 1000, 3000, 5000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns the connection strings to try, in order.
 * MONGO_URI is the target database; MONGO_URI_LOCAL is an optional
 * local/offline fallback (e.g. "mongodb://127.0.0.1:27017/DeptCommunity").
 */
const candidateUris = () =>
    [process.env.MONGO_URI, process.env.MONGO_URI_LOCAL]
        .map((uri) => (uri || "").trim())
        .filter(Boolean);

const connectDB = async () => {
    const uris = candidateUris();

    if (uris.length === 0) {
        throw new Error(
            "MONGO_URI is not set. Copy .env.example to .env and fill in your connection string."
        );
    }

    const attempts = uris.flatMap((uri) => RETRY_DELAYS.map((delay) => ({ uri, delay })));
    let lastError;

    for (const { uri, delay } of attempts) {
        if (delay > 0) {
            await sleep(delay);
        }

        try {
            const conn = await mongoose.connect(uri, {
                serverSelectionTimeoutMS: 8000,
                socketTimeoutMS: 45000
            });

            console.log(
                `MongoDB connected (${conn.connection.host}/${conn.connection.name})`
            );

            conn.connection.on("error", (error) => {
                console.error("MongoDB connection error:", error.message);
            });

            conn.connection.on("disconnected", () => {
                console.warn("MongoDB disconnected.");
            });

            return conn;

        } catch (error) {
            lastError = error;
            console.error(
                `MongoDB connection attempt failed: ${error.message}`
            );
        }
    }

    const hint =
        /IP|whitelist|allowlist/i.test(lastError?.message || "")
            ? "\n  Tip: add your current public IP to the Atlas IP access list, or set MONGO_URI_LOCAL to a local MongoDB."
            : "";

    throw new Error(
        `Could not connect to MongoDB after ${attempts.length} attempts.${hint}`
    );
};

module.exports = connectDB;
