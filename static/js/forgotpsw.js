// Shows a message in a box. If the server sent no text, show the fallback instead of "undefined"
function showMessage(id, text, fallback) {
    document.getElementById(id).innerText = text || fallback;
}

// Sends one request and always gives back an object like {ok, message}, even when the server is down
async function postText(url, text) {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({text: text})
        });
        return await res.json();
    } catch (err) {
        console.error(err);
        return {ok: false, message: "Could not reach the server. Try again."};
    }
}

document.getElementById("otp-send").addEventListener("click", async (e) => {
    e.preventDefault();
    document.getElementById("emailDone").innerText = "";
    document.getElementById("senterror").innerText = "";

    const email = document.getElementById("email").value.trim();
    const data = await postText("/sent_OTP", email);

    if (data.ok === true) {
        showMessage("emailDone", data.message, "OTP sent. Check your email.");
    } else {
        showMessage("senterror", data.message, "Could not send the OTP. Try again.");
    }
});

document.getElementById("otp-button").addEventListener("click", async (e) => {
    e.preventDefault();
    document.getElementById("otpDone").innerText = "";
    document.getElementById("otperror").innerText = "";

    const otp = document.getElementById("otp").value.trim();
    const data = await postText("/check_OTP", otp);

    if (data.ok === true) {
        showMessage("otpDone", data.message, "Successfully verified!");
        setTimeout(() => {
            window.location.href = "/change_password";
        }, 1000);
    } else {
        showMessage("otperror", data.message, "Could not check the OTP. Try again.");
    }
});