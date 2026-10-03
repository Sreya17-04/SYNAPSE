/**
 * SYNAPSE - Database Seeder
 * Run with: npm run seed
 * Creates the default admin account, the 76 official CSE 2K24B students from
 * studentSeedData.js and sample content.
 *
 * Safe to run repeatedly: nothing already in the database is touched, so no
 * account, post, comment, announcement, report or audit entry is ever
 * duplicated or deleted.
 */

const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");

dotenv.config();

const connectDB = require("./config/db");
const User = require("./models/User");
const Post = require("./models/Post");
const Announcement = require("./models/Announcement");
const students = require("./studentSeedData");

const MIN_PASSWORD_LENGTH = User.MIN_PASSWORD_LENGTH;

// Matches the rounds used by the bcrypt pre-save hook in models/User.js.
const SALT_ROUNDS = 10;

const EXPECTED_STUDENT_COUNT = 76;

const REQUIRED_STUDENT_FIELDS = [
    "universityRegNo",
    "rollNo",
    "name",
    "initialPassword",
    "role"
];

const ADMIN_PROFILE = {
    name: "SYNAPSE Admin",
    email: "admin@synapse.edu",
    role: "admin",
    passwordEnvKey: "SEED_ADMIN_PASSWORD"
};

// Sample posts keep the authorship they were written with. The account itself
// is no longer created: students come exclusively from studentSeedData.js.
const SAMPLE_POST_AUTHOR = {
    author: "Demo Student",
    authorEmail: "student@synapse.edu"
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

/**
 * Fail loudly rather than import a broken class list: the login flow depends
 * on every record carrying the five official fields, on registration numbers
 * being unique (they are the login username) and on roll numbers being unique.
 */
const validateStudentRecords = (records) => {
    if (records.length !== EXPECTED_STUDENT_COUNT) {
        throw new Error(
            `studentSeedData.js must contain exactly ${EXPECTED_STUDENT_COUNT} students, found ${records.length}.`
        );
    }

    const seenRegNos = new Set();
    const seenRollNos = new Set();
    let duplicateRegNos = 0;
    let passwordMismatches = 0;

    records.forEach((record, index) => {
        const missing = REQUIRED_STUDENT_FIELDS.filter(
            (field) =>
                typeof record[field] !== "string" || !record[field].trim()
        );

        if (missing.length > 0) {
            throw new Error(
                `studentSeedData.js record ${index + 1} is missing: ${missing.join(", ")}`
            );
        }

        const regNo = record.universityRegNo.trim().toUpperCase();
        const rollNo = record.rollNo.trim().toUpperCase();

        if (seenRegNos.has(regNo)) {
            duplicateRegNos += 1;
        }
        seenRegNos.add(regNo);

        if (seenRollNos.has(rollNo)) {
            throw new Error(
                `studentSeedData.js has a duplicate roll number: ${record.rollNo}`
            );
        }
        seenRollNos.add(rollNo);

        if (record.role !== "student") {
            throw new Error(
                `studentSeedData.js record ${index + 1} has role "${record.role}"; every seeded account must be a student.`
            );
        }

        // Students sign in with their roll number, so the file must ship the
        // roll number as the initial password.
        if (record.initialPassword.trim() !== record.rollNo.trim()) {
            passwordMismatches += 1;
        }
    });

    if (duplicateRegNos > 0) {
        throw new Error(
            `studentSeedData.js has ${duplicateRegNos} duplicate university registration number(s).`
        );
    }

    if (passwordMismatches > 0) {
        console.warn(
            `   WARNING: ${passwordMismatches} record(s) have initialPassword different from rollNo.`
        );
    }

    return { duplicateRegNos, uniqueRegNos: seenRegNos.size };
};

/**
 * Import the official student list. Idempotent: an existing registration
 * number is never re-created, so running the seeder twice (or ten times)
 * leaves exactly one account per student and never re-hashes a password.
 */
const seedStudents = async () => {
    const records = students;

    console.log(`${records.length} student records found`);

    const { duplicateRegNos } = validateStudentRecords(records);

    const regNos = records.map((record) =>
        record.universityRegNo.trim().toUpperCase()
    );

    const existing = await User.find({
        universityRegNo: { $in: regNos }
    }).select("universityRegNo");

    const existingRegNos = new Set(
        existing.map((user) => user.universityRegNo)
    );

    const missing = records.filter(
        (record) => !existingRegNos.has(record.universityRegNo.trim().toUpperCase())
    );

    if (missing.length > 0) {
        const documents = await Promise.all(
            missing.map(async (record) => ({
                name: record.name.trim(),
                universityRegNo: record.universityRegNo.trim().toUpperCase(),
                rollNo: record.rollNo.trim().toUpperCase(),
                // Hashed here rather than through the pre-save hook, because
                // insertMany (bulk import) does not run save middleware. Only
                // the hash reaches MongoDB - never the roll number itself.
                password: await bcrypt.hash(record.initialPassword, SALT_ROUNDS),
                role: "student"
            }))
        );

        // Bulk insert skips save hooks on purpose: it must not re-hash a hash.
        await User.insertMany(documents);

        const sampleHash = documents[0].password;

        if (!/^\$2[aby]\$/.test(sampleHash)) {
            throw new Error("Student passwords were not bcrypt-hashed.");
        }

        if (!(await bcrypt.compare(missing[0].initialPassword, sampleHash))) {
            throw new Error("Student password hash does not verify.");
        }
    }

    console.log(`${missing.length} students created`);
    console.log(`${records.length - missing.length} students already existed`);
    console.log(`${duplicateRegNos} duplicate university registration numbers`);
};

const seed = async () => {
    try {
        // Reuse the server's connection helper so seeding gets the same
        // URI fallback and retry ladder instead of a second, weaker copy.
        await connectDB();

        console.log("MongoDB connected for seeding...\n");

        // The unique indexes (User.email, User.universityRegNo) are only
        // enforced once they exist
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

        // ---- Official student list (76 accounts) ----
        await seedStudents();
        console.log("");

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
            await Post.insertMany(SAMPLE_POSTS.map((post) => ({ ...post, ...SAMPLE_POST_AUTHOR })));
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
