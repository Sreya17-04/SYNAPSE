const mongoose = require("mongoose");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const app = require("./app");

dotenv.config();

const PORT = process.env.PORT || 5000;

const start = async () => {
    try {
        await connectDB();
    } catch (error) {
        console.error(`\n${error.message}\n`);
        process.exit(1);
    }

    const server = app.listen(PORT, () => {
        console.log(`SYNAPSE server running on http://localhost:${PORT}`);
        console.log(`Frontend served from http://localhost:${PORT}/login.html`);
    });

    // server.close() stops new connections but leaves the Mongo socket and
    // any in-flight request hanging, so the process can take a minute to
    // exit. Drain first, then close the database, then leave.
    const shutdown = (signal) => {
        console.log(`\n${signal} received, shutting down...`);

        server.close(async () => {
            try {
                await mongoose.connection.close();
            } catch (error) {
                console.error("Error closing MongoDB connection:", error.message);
            }

            process.exit(0);
        });

        // Do not hang forever on a stuck keep-alive connection.
        setTimeout(() => {
            console.error("Forced shutdown after timeout.");
            process.exit(1);
        }, 10000).unref();
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
};

start();