/**
 * SYNAPSE - Database Seeder
 * Run with: npm run seed
 * Creates the default admin account, a demo student and sample content.
 */

const mongoose = require("mongoose");
const crypto = require("crypto");
const dotenv = require("dotenv");

dotenv.config();

const connectDB = require("./config/db");
const User = require("./models/User");
const Post = require("./models/Post");
const Announcement = require("./models/Announcement");

const MIN_PASSWORD_LENGTH = User.MIN_PASSWORD_LENGTH;

const ADMIN_PROFILE = {
    name: "SYNAPSE Admin",
    email: "admin@synapse.edu",
    role: "admin",
    passwordEnvKey: "SEED_ADMIN_PASSWORD"
};

const DEMO_STUDENT_PROFILE = {
    name: "Demo Student",
    email: "student@synapse.edu",
    role: "student",
    passwordEnvKey: "SEED_STUDENT_PASSWORD"
};

const generatePassword = () => crypto.randomBytes(12).toString("base64url");

/**
 * Resolve a seed password from the environment so no usable default ever sits
 * in version control. When the env var is unset a strong random password is
 * generated and printed exactly once, at creation time.
 */
const resolvePassword = (envKey) => {
    const fromEnv = (process.env[envKey] || "").trim();
    const value = fromEnv || generatePassword();

    if (value.length < MIN_PASSWORD_LENGTH) {
        throw new Error(
            `${envKey} must be at least ${MIN_PASSWORD_LENGTH} characters.`
        );
    }

    return { value, generated: fromEnv.length === 0 };
};

const SAMPLE_ANNOUNCEMENTS = [
    {
        title: "Internal Assessment Schedule",
        message: "The Internal Assessment Schedule has been published for CS and IT departments."
    },
    {
        title: "Placement Cell Registration",
        message: "Placement cell registration is now open for final-year students."
    }
];

const SAMPLE_POSTS = [
    {
        title: "Best reference book for Operating Systems?",
        category: "Academic",
        content:
            "Can someone recommend a good reference for Operating Systems? I have Silberschatz lined up but would love alternative suggestions before the semester starts."
    },
    {
        title: "Internship openings at a product-based startup",
        category: "Internships",
        content:
            "A product-based startup in our city is hiring final-year interns for a 3-month paid internship. Applications close at the end of the month. Happy to share the JD in the comments."
    },
    {
        title: "Tips for the placement coding round",
        category: "Placement",
        content:
            "The first round is DSA focused. Practise arrays, strings and trees rather than frameworks. Solving 2-3 problems a day for a month was enough for most of us in the previous batch."
    },
    {
        title: "Hackathon this weekend - team forming",
        category: "Events",
        content:
            "We are putting together a 4-person team for the 36-hour hackathon this weekend. Frontend, backend and design roles are open. Comment if you are interested."
    },
    {
        title: "Mini project ideas that do not need ML",
        category: "Projects",
        content:
            "Looking for project ideas for the final semester that avoid machine learning. A campus attendance portal or a lab equipment booking system would both work well."
    },
    {
        title: "Is the library open during exam week?",
        category: "General",
        content:
            "Does anyone know the extended library timings during exam week? The notice board only lists the regular hours."
    }
];

/**
 * Printed only when the account was just created, so the password is known.
 */
const printNewCredentials = (account) => {
    const suffix = account.generated
        ? "   <- generated, save it now (not recoverable)"
        : "";

    console.log(`   Email   : ${account.email}`);
    console.log(`   Password: ${account.password}${suffix}`);
    console.log(`   Role    : ${account.role}`);
};

/**
 * The account already existed, so its password is whatever it was set to
 * previously. Never echo a value that may not match the stored hash.
 */
const printExistingNotice = (profile) => {
    console.log(`   Email   : ${profile.email}`);
    console.log(`   Role    : ${profile.role}`);
    console.log(
        `   Password: unchanged (only ${profile.passwordEnvKey} applies at creation time)`
    );
};

const seed = async () => {
    try {
        // Reuse the server's connection helper so seeding gets the same
        // URI fallback and retry ladder instead of a second, weaker copy.
        await connectDB();

        console.log("MongoDB connected for seeding...\n");

        // The `unique: true` on User.email is only enforced once the index exists
        await Promise.all(
            [User, Post, Announcement].map((model) => model.syncIndexes())
        );
        console.log("Indexes synced.\n");

        // ---- Admin ----
        const existingAdmin = await User.findOne({ email: ADMIN_PROFILE.email });

        if (existingAdmin) {
            if (existingAdmin.role !== ADMIN_PROFILE.role) {
                // The most likely cause is someone registering this address
                // through /register, which always forces role "student".
                // Silently skipping would leave the platform with no admin.
                console.log(
                    `\n${ADMIN_PROFILE.email} already exists but has role "${existingAdmin.role}".\n` +
                    "  Promoting it to admin so the moderation panel is reachable.\n" +
                    "  Set its password directly in MongoDB if you do not know it."
                );

                existingAdmin.role = ADMIN_PROFILE.role;
                await existingAdmin.save();
            } else {
                console.log("Admin account already exists:");
                printExistingNotice({ ...ADMIN_PROFILE, role: existingAdmin.role });
            }
        } else {
            const { value, generated } = resolvePassword(
                ADMIN_PROFILE.passwordEnvKey
            );

            const admin = await User.create({
                name: ADMIN_PROFILE.name,
                email: ADMIN_PROFILE.email,
                password: value,
                role: ADMIN_PROFILE.role
            });

            console.log("Default admin account created:");
            printNewCredentials({
                email: ADMIN_PROFILE.email,
                password: value,
                role: ADMIN_PROFILE.role,
                generated
            });
            console.log(`   ID      : ${admin._id}`);
        }

        // ---- Demo student ----
        const existingStudent = await User.findOne({
            email: DEMO_STUDENT_PROFILE.email
        });

        if (!existingStudent) {
            const { value, generated } = resolvePassword(
                DEMO_STUDENT_PROFILE.passwordEnvKey
            );

            await User.create({
                name: DEMO_STUDENT_PROFILE.name,
                email: DEMO_STUDENT_PROFILE.email,
                password: value,
                role: DEMO_STUDENT_PROFILE.role
            });

            console.log("\nDemo student account created:");
            printNewCredentials({
                email: DEMO_STUDENT_PROFILE.email,
                password: value,
                role: DEMO_STUDENT_PROFILE.role,
                generated
            });
        } else {
            console.log("\nDemo student account already exists.");
            printExistingNotice(DEMO_STUDENT_PROFILE);
        }

        // ---- Announcements ----
        const announcementCount = await Announcement.countDocuments();

        if (announcementCount === 0) {
            await Announcement.insertMany(
                SAMPLE_ANNOUNCEMENTS.map((announcement) => ({
                    ...announcement,
                    createdBy: {
                        name: ADMIN_PROFILE.name,
                        email: ADMIN_PROFILE.email
                    }
                }))
            );
            console.log("\nSample announcements created.");
        } else {
            console.log("\nAnnouncements already exist - skipped.");
        }

        // ---- Sample posts ----
        const postCount = await Post.countDocuments();

        if (postCount === 0) {
            const author = {
                author: DEMO_STUDENT_PROFILE.name,
                authorEmail: DEMO_STUDENT_PROFILE.email
            };

            await Post.insertMany(SAMPLE_POSTS.map((post) => ({ ...post, ...author })));
            console.log(`Sample posts created (${SAMPLE_POSTS.length}).`);
        } else {
            console.log("\nPosts already exist - skipped.");
        }

        console.log("\nSeeding complete. Run 'npm start' to start the server.");

        await mongoose.connection.close();
        process.exit(0);

    } catch (error) {
        console.error("\nSeeding failed:", error.message);
        process.exit(1);
    }
};

seed();
