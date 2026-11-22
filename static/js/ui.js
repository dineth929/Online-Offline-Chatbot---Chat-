// Question box: grows up to 2 lines, then scrolls. Enter = send, Shift+Enter = new line
(function () {
    const box = document.getElementById("question");
    const askBtn = document.getElementById("askButton");

    function resizeBox() {
        if (!box.offsetHeight) return;   // box is hidden (before "Get Started"), nothing to measure
        box.style.height = "auto";
        box.style.height = (box.scrollHeight + box.offsetHeight - box.clientHeight) + "px";
    }

    box.addEventListener("input", resizeBox);
    box.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            askBtn.click();
        }
    });
})();

// ---------- "Not supported" popup ----------
const overlay = document.getElementById("modalOverlay");

function showUnsupportedPopup() {
    overlay.hidden = false;
    document.getElementById("modalOnline").focus();
}

function closePopup() {
    overlay.hidden = true;
}

window.showUnsupportedPopup = showUnsupportedPopup;   // firebase-ai.js uses this too

document.getElementById("modalClose").addEventListener("click", closePopup);
overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closePopup();           // click outside the box closes it
});
document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hidden) closePopup();
});

// "Use online version" button inside the popup
document.getElementById("modalOnline").addEventListener("click", function () {
    closePopup();
    if (document.getElementById("start").style.display === "block") {
        window.AI_MODE = "cloud";                      // already in the chat: just switch
    } else {
        getStart();                                    // still on the home screen: open the chat
    }
});

// ---------- Start screen ----------
const statusLine = document.getElementById("startStatus");
const startButtons = document.querySelectorAll(".startbtn");

function setStatus(text) {
    statusLine.textContent = text;
}

function setStartButtonsDisabled(disabled) {
    startButtons.forEach(function (b) { b.disabled = disabled; });
}

function openChat(mode) {
    window.AI_MODE = mode;
    setStatus("");
    document.getElementById("start").style.display = "block";
    document.getElementById("startScreen").style.display = "none";
    document.getElementById("question").dispatchEvent(new Event("input"));
    document.getElementById("signoutbtn").hidden = (mode !== "cloud");   // sign out exists only in the online chat
    window.chatUI.load();
}

// true if the internet really works, false if not
async function isOnline() {
    if (!navigator.onLine) return false;              // quick check first

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);   // give up after 4 seconds
    try {
        // tiny Google endpoint; no-cors means we don't need to read the answer, only that it arrived
        await fetch("https://www.gstatic.com/generate_204", {
            mode: "no-cors",
            cache: "no-store",
            signal: controller.signal
        });
        return true;
    } catch (err) {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

// Online version: check the internet first, then go to the sign-in page
async function getStart() {
    setStartButtonsDisabled(true);
    setStatus("Checking your internet connection...");

    if (await isOnline()) {
        window.location.href = "/signin";
    } else {
        setStatus("You are offline. Connect to the internet, or use offline mode.");
        setStartButtonsDisabled(false);
    }
}

// Offline version: use the on-device model, but only if this browser supports it
async function getStartOffline() {
    if (!window.hybridAI) {
        setStatus("The AI is still loading, please try again in a moment.");
        return;
    }

    setStartButtonsDisabled(true);
    setStatus("Checking if your browser supports on-device AI...");

    try {
        await window.hybridAI.prepareLocal(function (progress) {
            setStatus("Downloading the on-device model... " + Math.round(progress * 100) + "%");
        });
        openChat("local");
    } catch (err) {
        setStatus("");
        showUnsupportedPopup();
    } finally {
        setStartButtonsDisabled(false);
    }
}

const clearBtn = document.getElementById("clearbtn");

clearBtn.addEventListener("click", function () {

    if (
        clearBtn.classList.contains("onclic") ||
        clearBtn.classList.contains("validate")
    ) {
        return;
    }

    // Loading animation
    clearBtn.classList.add("onclic");

    setTimeout(() => {

        clearBtn.classList.remove("onclic");

        // Success animation
        clearBtn.classList.add("validate");


        setTimeout(() => {
            clearBtn.classList.remove("validate");
        }, 1250);

    }, 2250);

});


const themeToggle = document.getElementById("themeToggle");
const incognitoMessage = document.getElementById("incognitoMessage");

async function updateIncognitoStatus() {
    let isOn = themeToggle.checked;
    if (isOn) {
        document.body.classList.add("incognito-mode");
        incognitoMessage.innerText = "Incognito mode enabled";
        incognitoMessage.style.color = "#8b7cff";
    } else {
        document.body.classList.remove("incognito-mode");

        incognitoMessage.innerText = "Incognito mode disabled";
        incognitoMessage.style.color = "#aaa";
    }
    let res = await fetch("/incognito", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ incognito: isOn})
    });
    let data = await res.json();
}

// Always start unchecked when the page loads
window.addEventListener("DOMContentLoaded", function () {
    themeToggle.checked = false;
    updateIncognitoStatus();
});

// Update when the user clicks the toggle
themeToggle.addEventListener("change", updateIncognitoStatus);

// ---------- Sign out (online chat only) ----------
const signoutBtn = document.getElementById("signoutbtn");

signoutBtn.addEventListener("click", async function () {
    signoutBtn.disabled = true;
    try {
        const res = await fetch("/logout", { method: "POST" });
        if (!res.ok) throw new Error("Server error " + res.status);
        window.location.href = "/";          // back to the home screen
    } catch (err) {
        signoutBtn.disabled = false;
        alert("Could not sign out: " + err.message);
    }
});