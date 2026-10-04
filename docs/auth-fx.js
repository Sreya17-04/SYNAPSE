/**
 * Decorative motion for the student auth pages (login + register).
 *
 * Three layers, none of which the form depends on:
 *   1. a soft glow that trails the pointer,
 *   2. glass tiles that shift with depth as the pointer moves,
 *   3. a specular highlight on the card that tracks the cursor.
 *
 * Loaded as a classic script so the pages keep working without a bundler.
 * Every effect is skipped for readers who prefer reduced motion.
 */
(function () {
    "use strict";

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const glow = document.querySelector(".cursor-glow");
    const card = document.querySelector(".form-box");
    const layers = Array.prototype.slice.call(
        document.querySelectorAll("[data-parallax]")
    );

    if (!glow || reduceMotion.matches) {
        return;
    }

    let pointerX = window.innerWidth / 2;
    let pointerY = window.innerHeight * 0.42;
    let queued = false;

    function paint() {
        queued = false;

        // Offset from the centre of the viewport: the glow is centred by CSS
        // (inset: 0 + margin: auto) and only ever translated from there.
        const dx = pointerX - window.innerWidth / 2;
        const dy = pointerY - window.innerHeight / 2;

        glow.style.transform =
            "translate3d(" + dx.toFixed(1) + "px, " + dy.toFixed(1) + "px, 0)";

        layers.forEach(function (layer) {
            const depth = Number(layer.getAttribute("data-parallax")) || 0;

            layer.style.setProperty("--px", (dx * depth).toFixed(1) + "px");
            layer.style.setProperty("--py", (dy * depth).toFixed(1) + "px");
        });

        if (card) {
            const rect = card.getBoundingClientRect();

            card.style.setProperty("--mx", (pointerX - rect.left).toFixed(1) + "px");
            card.style.setProperty("--my", (pointerY - rect.top).toFixed(1) + "px");
        }
    }

    function queue() {
        if (queued) {
            return;
        }

        queued = true;
        window.requestAnimationFrame(paint);
    }

    function onPointerMove(event) {
        pointerX = event.clientX;
        pointerY = event.clientY;
        queue();
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    // Scrolling moves the card under a fixed pointer, so refresh the
    // highlight and the glow offset as well.
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue, { passive: true });
})();
