document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("form");        // finds your form, no id needed
    const pw = document.getElementById("password");
    const toggleBtn = document.getElementById("togglePw");

    toggleBtn.addEventListener("click", () => {
        const show = pw.type === "password";
        pw.type = show ? "text" : "password";
        toggleBtn.textContent = show ? "Hide" : "Show";
    });

    form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const usernameInput = document.getElementById("username");
    const username = usernameInput.value;
    const password = pw.value;

    // 1. Browser check - does it look like an email?
    if (!usernameInput.checkValidity()) {
        usernameInput.reportValidity(); // Shows "Please include an '@'"
        return; // Stop, don't send to Flask
    }

    // 2. Extra check - must have @ and .
    if (!username.includes("@") || !username.includes(".")) {
        document.getElementById("emailError").innerText = "Please enter a correct email like name@abc.com";
        return;
    }

    // Clear error if correct
    document.getElementById("emailError").innerText = "";

    try {
        const res = await fetch("/get-two", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first: username, second: password })
        });
        const data = await res.json();
        console.log("Server replied:", data);

        // Show Flask error if Flask says wrong email or password
        if (data.ok === false) {
        document.getElementById("emailError").innerText = data.message || "Could not sign in. Try again.";
        return;
        }

        // Signed in: open the online chat
        window.location.href = "/online/chat";
    } catch (err) {
        console.error("Request failed:", err);
        document.getElementById("emailError").innerText = "Could not reach the server. Try again.";
    }
    });
});