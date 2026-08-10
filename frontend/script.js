// =====================================================
// DEPTCONNECT - SCRIPT.JS
// =====================================================


// =====================================================
// BACKEND API
// =====================================================

const API_URL = "http://localhost:5000/api/posts";


// =====================================================
// DOM ELEMENTS
// =====================================================

const postsContainer =
    document.getElementById("posts-container");

const postModal =
    document.getElementById("post-modal");

const createPostBtn =
    document.getElementById("create-post-btn");

const closeModalBtn =
    document.getElementById("close-modal");

const cancelPostBtn =
    document.getElementById("cancel-post");

const postForm =
    document.getElementById("post-form");

const searchInput =
    document.getElementById("search-input");

const sortSelect =
    document.getElementById("sort-select");

const categoryButtons =
    document.querySelectorAll(".category-btn");

const themeToggleBtn =
    document.getElementById("theme-toggle");

const themeIcon =
    document.getElementById("theme-icon");


// =====================================================
// THEME (LIGHT / DARK MODE)
// =====================================================

function initTheme() {
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
        setTheme("dark");
    } else {
        setTheme("light");
    }
}

function setTheme(theme) {
    if (theme === "dark") {
        document.body.classList.add("dark-mode");
        if (themeIcon) themeIcon.textContent = "☀️";
        if (themeToggleBtn) themeToggleBtn.setAttribute("title", "Switch to Light Mode");
        localStorage.setItem("theme", "dark");
    } else {
        document.body.classList.remove("dark-mode");
        if (themeIcon) themeIcon.textContent = "🌙";
        if (themeToggleBtn) themeToggleBtn.setAttribute("title", "Switch to Dark Mode");
        localStorage.setItem("theme", "light");
    }
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
        const isDark = document.body.classList.contains("dark-mode");
        setTheme(isDark ? "light" : "dark");
    });
}

initTheme();


// =====================================================
// APPLICATION DATA
// =====================================================

let allPosts = [];

let selectedCategory = "All";


// =====================================================
// LOAD POSTS
// =====================================================

async function loadPosts() {

    try {

        postsContainer.innerHTML = `
            <div class="loading">
                Loading posts...
            </div>
        `;


        const response =
            await fetch(API_URL);


        if (!response.ok) {

            throw new Error(
                "Failed to fetch posts"
            );

        }


        allPosts =
            await response.json();


        console.log(
            "Posts loaded:",
            allPosts
        );


        displayPosts();


    } catch (error) {

        console.error(
            "Error loading posts:",
            error
        );


        postsContainer.innerHTML = `
            <div class="error-message">

                <h3>
                    Unable to load posts
                </h3>

                <p>
                    Make sure the backend server is running.
                </p>

            </div>
        `;

    }

}


// =====================================================
// DISPLAY POSTS
// =====================================================

function displayPosts() {

    let posts = [...allPosts];


    // -------------------------------------------------
    // CATEGORY FILTER
    // -------------------------------------------------

    if (selectedCategory !== "All") {

        posts = posts.filter(function (post) {

            return post.category === selectedCategory;

        });

    }


    // -------------------------------------------------
    // SEARCH FILTER
    // -------------------------------------------------

    const searchText =
        searchInput.value
            .toLowerCase()
            .trim();


    if (searchText !== "") {

        posts = posts.filter(function (post) {

            const title =
                String(post.title || "")
                    .toLowerCase();

            const content =
                String(post.content || "")
                    .toLowerCase();

            const author =
                String(post.author || "")
                    .toLowerCase();

            const category =
                String(post.category || "")
                    .toLowerCase();


            return (
                title.includes(searchText) ||
                content.includes(searchText) ||
                author.includes(searchText) ||
                category.includes(searchText)
            );

        });

    }


    // -------------------------------------------------
    // SORT
    // -------------------------------------------------

    if (sortSelect.value === "latest") {

        posts.reverse();

    }


    // -------------------------------------------------
    // NO POSTS
    // -------------------------------------------------

    if (posts.length === 0) {

        postsContainer.innerHTML = `
            <div class="no-posts">

                <div style="font-size: 40px;">
                    📭
                </div>

                <h3>
                    No posts found
                </h3>

                <p>
                    Try changing your search or category.
                </p>

            </div>
        `;

        return;

    }


    // -------------------------------------------------
    // CLEAR CONTAINER
    // -------------------------------------------------

    postsContainer.innerHTML = "";


    // -------------------------------------------------
    // CREATE POST CARDS
    // -------------------------------------------------

    posts.forEach(function (post) {

        const postCard =
            document.createElement("article");


        postCard.className =
            "post-card";


        // -------------------------------------------------
        // DATE
        // -------------------------------------------------

        let dateText = "";


        if (post.createdAt) {

            const date =
                new Date(post.createdAt);


            dateText =
                date.toLocaleDateString(
                    "en-IN",
                    {
                        day: "numeric",
                        month: "short",
                        year: "numeric"
                    }
                );

        }


        // -------------------------------------------------
        // POST HTML
        // -------------------------------------------------

        postCard.innerHTML = `

            <div class="post-card-header">

                <span class="post-category">

                    ${getCategoryIcon(post.category)}

                    ${escapeHTML(post.category)}

                </span>


                <span class="post-date">

                    ${dateText}

                </span>

            </div>


            <h3>

                ${escapeHTML(post.title)}

            </h3>


            <p class="post-content">

                ${escapeHTML(post.content)}

            </p>


            <div class="post-footer">


                <div class="post-author">


                    <div class="author-avatar">

                        ${getInitials(post.author)}

                    </div>


                    <div>

                        <strong>

                            ${escapeHTML(post.author)}

                        </strong>


                        ${dateText
                ? `
                                    <small>
                                        ${dateText}
                                    </small>
                                  `
                : ""
            }

                    </div>


                </div>


                <div class="post-actions">


                    <button
                        class="post-action like-btn"
                        type="button"
                    >
                        👍 Like
                    </button>


                    <button
                        class="post-action comment-btn"
                        type="button"
                    >
                        💬 Comment
                    </button>


                </div>


            </div>

        `;


        // -------------------------------------------------
        // LIKE BUTTON
        // -------------------------------------------------

        const likeButton =
            postCard.querySelector(
                ".like-btn"
            );


        likeButton.addEventListener(
            "click",
            function () {

                likeButton.classList.toggle(
                    "liked"
                );


                if (
                    likeButton.classList.contains(
                        "liked"
                    )
                ) {

                    likeButton.textContent =
                        "❤️ Liked";

                } else {

                    likeButton.textContent =
                        "👍 Like";

                }

            }
        );


        // -------------------------------------------------
        // COMMENT BUTTON
        // -------------------------------------------------

        const commentButton =
            postCard.querySelector(
                ".comment-btn"
            );


        commentButton.addEventListener(
            "click",
            function () {

                alert(
                    "Comment feature will be added soon."
                );

            }
        );


        // -------------------------------------------------
        // ADD CARD
        // -------------------------------------------------

        postsContainer.appendChild(
            postCard
        );

    });

}


// =====================================================
// CREATE NEW POST
// =====================================================

postForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();


        // -------------------------------------------------
        // GET FORM VALUES
        // -------------------------------------------------

        const title =
            document
                .getElementById("title")
                .value
                .trim();


        const author =
            document
                .getElementById("author")
                .value
                .trim();


        const category =
            document
                .getElementById("category")
                .value;


        const content =
            document
                .getElementById("content")
                .value
                .trim();


        // -------------------------------------------------
        // VALIDATION
        // -------------------------------------------------

        if (
            !title ||
            !author ||
            !category ||
            !content
        ) {

            alert(
                "Please fill in all fields."
            );

            return;

        }


        // -------------------------------------------------
        // NEW POST OBJECT
        // -------------------------------------------------

        const newPost = {

            title: title,

            author: author,

            category: category,

            content: content

        };


        try {

            const submitButton =
                postForm.querySelector(
                    "button[type='submit']"
                );


            submitButton.disabled =
                true;


            submitButton.textContent =
                "Publishing...";


            // -------------------------------------------------
            // SEND TO BACKEND
            // -------------------------------------------------

            const response =
                await fetch(
                    API_URL,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify(
                                newPost
                            )
                    }
                );


            if (!response.ok) {

                throw new Error(
                    "Failed to create post"
                );

            }


            // -------------------------------------------------
            // GET CREATED POST
            // -------------------------------------------------

            const createdPost =
                await response.json();


            console.log(
                "Post created:",
                createdPost
            );


            // -------------------------------------------------
            // ADD TO POSTS
            // -------------------------------------------------

            allPosts.push(
                createdPost
            );


            // -------------------------------------------------
            // RESET FORM
            // -------------------------------------------------

            postForm.reset();


            // -------------------------------------------------
            // CLOSE MODAL
            // -------------------------------------------------

            closeModal();


            // -------------------------------------------------
            // DISPLAY UPDATED POSTS
            // -------------------------------------------------

            displayPosts();


            alert(
                "Post published successfully!"
            );


        } catch (error) {

            console.error(
                "Error creating post:",
                error
            );


            alert(
                "Unable to publish post. Check your backend server."
            );


        } finally {

            const submitButton =
                postForm.querySelector(
                    "button[type='submit']"
                );


            submitButton.disabled =
                false;


            submitButton.textContent =
                "Publish Post";

        }

    }
);


// =====================================================
// OPEN MODAL
// =====================================================

createPostBtn.addEventListener(
    "click",
    function () {

        postModal.classList.add(
            "show"
        );

    }
);


// =====================================================
// CLOSE MODAL FUNCTION
// =====================================================

function closeModal() {

    postModal.classList.remove(
        "show"
    );

}


// =====================================================
// CLOSE BUTTON
// =====================================================

closeModalBtn.addEventListener(
    "click",
    function () {

        closeModal();

    }
);


// =====================================================
// CANCEL BUTTON
// =====================================================

cancelPostBtn.addEventListener(
    "click",
    function () {

        closeModal();

    }
);


// =====================================================
// CLICK OUTSIDE MODAL
// =====================================================

postModal.addEventListener(
    "click",
    function (event) {

        if (
            event.target === postModal
        ) {

            closeModal();

        }

    }
);


// =====================================================
// ESCAPE KEY
// =====================================================

document.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key === "Escape"
        ) {

            closeModal();

        }

    }
);


// =====================================================
// CATEGORY FILTER
// =====================================================

categoryButtons.forEach(
    function (button) {

        button.addEventListener(
            "click",
            function () {


                // Remove active
                categoryButtons.forEach(
                    function (btn) {

                        btn.classList.remove(
                            "active"
                        );

                    }
                );


                // Add active
                button.classList.add(
                    "active"
                );


                // Get category
                selectedCategory =
                    button.dataset.category;


                // Display
                displayPosts();

            }
        );

    }
);


// =====================================================
// SEARCH
// =====================================================

searchInput.addEventListener(
    "input",
    function () {

        displayPosts();

    }
);


// =====================================================
// SORT
// =====================================================

sortSelect.addEventListener(
    "change",
    function () {

        displayPosts();

    }
);


// =====================================================
// CATEGORY ICON
// =====================================================

function getCategoryIcon(category) {

    if (category === "Academic") {
        return "📚";
    }


    if (category === "Placement") {
        return "💼";
    }


    if (category === "Events") {
        return "📢";
    }


    if (category === "General") {
        return "💬";
    }


    if (category === "Other") {
        return "📌";
    }


    return "📝";
}


// =====================================================
// AUTHOR INITIALS
// =====================================================

function getInitials(name) {

    if (!name) {

        return "?";

    }


    const words =
        name
            .trim()
            .split(/\s+/);


    if (words.length === 1) {

        return words[0]
            .substring(0, 2)
            .toUpperCase();

    }


    return (
        words[0].charAt(0) +
        words[words.length - 1].charAt(0)
    ).toUpperCase();

}


// =====================================================
// SECURITY
// =====================================================

function escapeHTML(text) {

    if (
        text === null ||
        text === undefined
    ) {

        return "";

    }


    const div =
        document.createElement("div");


    div.textContent = text;


    return div.innerHTML;

}


// =====================================================
// START APPLICATION
// =====================================================

loadPosts();