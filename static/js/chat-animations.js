/* Chat++ message entrance animations.
   Load this after chat-ui.js so #response is ready to observe. */

(() => {
    "use strict";

    const response = document.getElementById("response");

    // Respect users who prefer reduced motion.
    if (
        !response ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
        return;
    }

    const animatedMessages = new WeakSet();

    function animateMessages(root) {
        if (root.nodeType !== Node.ELEMENT_NODE) return;

        const messages = [];

        if (root.matches?.(".msg")) {
            messages.push(root);
        }

        root.querySelectorAll?.(".msg").forEach(message => {
            messages.push(message);
        });

        messages.forEach(message => {
            if (animatedMessages.has(message)) return;

            animatedMessages.add(message);

            // Add entrance animation.
            message.classList.add("message-enter");

            // Remove animation class after animation finishes.
            message.addEventListener(
                "animationend",
                () => {
                    message.classList.remove("message-enter");
                },
                { once: true }
            );
        });
    }

    // Animate existing messages (restored chat history).
    response.querySelectorAll(".msg").forEach(message => {
        animateMessages(message);
    });

    // Detect newly added chat messages.
    const observer = new MutationObserver(records => {
        records.forEach(record => {
            record.addedNodes.forEach(animateMessages);
        });
    });

    observer.observe(response, {
        childList: true,
        subtree: true
    });

})();