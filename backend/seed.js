/**
 * SYNAPSE - Database Seeder
 * Run once with: node seed.js
 * Creates the default admin account in MongoDB.
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const dns = require("dns");

dotenv.config();

try {
    dns.setServers(["8.8.8.8", "8.8.4.4"]);
} catch (err) {
    console.warn("Could not set DNS:", err.message);
}

const User = require("./models/User");

const seed = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected for seeding...");

        // Check if admin already exists
        const existingAdmin = await User.findOne({ email: "admin@synapse.edu" });

        if (existingAdmin) {
            console.log("✅ Admin account already exists:");
            console.log("   Email   : admin@synapse.edu");
            console.log("   Password: Admin@1234 (original - if not changed)");
            console.log("   Role    : admin");
        } else {
            const admin = await User.create({
                name: "SYNAPSE Admin",
                email: "admin@synapse.edu",
                password: "Admin@1234",
                role: "admin"
            });

            console.log("✅ Default admin account created successfully!");
            console.log("   Email   : admin@synapse.edu");
            console.log("   Password: Admin@1234");
            console.log("   Role    : admin");
            console.log("   ID      :", admin._id);
        }

        // Check if a demo student exists
        const existingStudent = await User.findOne({ email: "student@synapse.edu" });
        if (!existingStudent) {
            await User.create({
                name: "Demo Student",
                email: "student@synapse.edu",
                password: "Student@1234",
                role: "student"
            });
            console.log("\n✅ Demo student account created:");
            console.log("   Email   : student@synapse.edu");
            console.log("   Password: Student@1234");
        } else {
            console.log("\n✅ Demo student account already exists.");
        }

        console.log("\nSeeding complete. Run 'npm start' to start the server.");
        process.exit(0);

    } catch (error) {
        console.error("Seeding failed:", error.message);
        process.exit(1);
    }
};

seed();
