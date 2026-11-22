// Chat display: saves each exchange to the database (Flask) and shows the full chat from it
window.chatUI = (function () {
    const box = document.getElementById("response");
    const input = document.getElementById("question");
    let thinking = null;   // the "Thinking..." bubble while the AI is answering

    function addBubble(role, text, isMarkdown) {
        const div = document.createElement("div");
        div.className = "msg " + role;
        if (isMarkdown) {
            div.innerHTML = DOMPurify.sanitize(marked.parse(text));
        } else {
            div.textContent = text;
        }
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
        return div;
    }

    // ---------- Conversation memory (kept small on purpose, to save tokens) ----------
    let savedRows = [];              // the saved chat, as last loaded from the server
    const MAX_QUESTION_CHARS = 300;  // an old question is cut to this length
    const MAX_ANSWER_CHARS = 500;    // an old answer is cut to this length (answers are the long part)

    function shorten(text, max) {
        text = (text || "").trim();
        return text.length > max ? text.slice(0, max) + " [...]" : text;
    }

    // The newest question/answer pairs that fit in `budget` characters, oldest first.
    // It starts from the newest, so what gets dropped is always the oldest.
    // It uses the chat that is already loaded, so it costs no extra request.
    function getMemory(budget) {
        const pairs = [];
        let used = 0;
        for (let i = savedRows.length - 1; i >= 0; i--) {
            const q = shorten(savedRows[i].prompt, MAX_QUESTION_CHARS);
            const a = shorten(savedRows[i].ai_response, MAX_ANSWER_CHARS);
            if (used + q.length + a.length > budget) break;
            used += q.length + a.length;
            pairs.unshift({ q: q, a: a });
        }
        return pairs;
    }

    // Online and the server says "not signed in" (401): go to the sign-in page. Returns true if it did.
    function signedOut(res) {
        if (res.status === 401 && window.AI_MODE === "cloud") {
            window.location.href = "/signin";
            return true;
        }
        return false;
    }

    // Text shown in an empty chat. Online: "Hey <name>!" with the name from the Turso database.
    async function greeting() {
        if (window.AI_MODE === "cloud") {
            try {
                const res = await fetch("/username");
                if (res.ok) {
                    const data = await res.json();
                    if (data.name) return "Hey " + data.name + "! Whats Up Today";
                }
            } catch (err) {
                console.error(err);
            }
        }
        return "Hey There! Whats Up Today";   // offline, or the name could not be loaded
    }

    // read the whole chat from the database and draw it
    async function load() {
        try {
            // window.AI_MODE is "cloud" (online) or "local" (offline); the server picks the right storage from it
            const res = await fetch("/history?mode=" + encodeURIComponent(window.AI_MODE));
            if (signedOut(res)) return;
            if (!res.ok) throw new Error("Server error " + res.status);
            const rows = await res.json();
            savedRows = rows;
            const hello = rows.length === 0 ? await greeting() : "";
            box.innerHTML = "";
            if (rows.length === 0) {
                const p = document.createElement("p");
                p.className = "empty";
                p.textContent = hello;   // textContent, so a name can never inject HTML
                box.appendChild(p);
            }
            rows.forEach(function (row) {
                addBubble("user", row.prompt, false);
                addBubble("ai", row.ai_response, true);
            });
        } catch (err) {
            savedRows = [];
            box.textContent = "Could not load the chat: " + err.message;
        }
    }

    // called when the user presses "Ask AI"
    function start(prompt) {
        const empty = box.querySelector(".empty");
        if (empty) empty.remove();
        addBubble("user", prompt, false);
        thinking = addBubble("ai", "Thinking...", false);
        input.value = "";
        input.dispatchEvent(new Event("input"));   // shrink the question box again
    }

    // called when the AI has answered: save to the database, then redraw the chat from it
    async function finish(prompt, answer) {
        if (answer === "Something went wrong!") {   // the AI failed, don't save that
            thinking.textContent = answer;
            return;
        }
        const res = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: prompt, ai_response: answer, mode: window.AI_MODE })
        });
        if (signedOut(res)) return;
        if (!res.ok) throw new Error("Could not save (server error " + res.status + ")");
        await load();
    }

    function fail(message) {
        if (thinking) thinking.textContent = "Error: " + message;
    }

    return { load: load, start: start, finish: finish, fail: fail, getMemory: getMemory };
})();


// "clear chat" button: clear the database, then redraw the chat so the empty state shows right away
document.getElementById("clearbtn").addEventListener("click", async () => {
    try {
        const res = await fetch("/clear", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({button: "clearbtn", mode: window.AI_MODE})
        });
        if (!res.ok) throw new Error("Server error " + res.status);
        await window.chatUI.load();   // history is now empty -> shows "No messages yet"
    } catch (err) {
        alert("Could not clear the chat: " + err.message);
    }
});