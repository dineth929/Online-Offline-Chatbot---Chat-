document.addEventListener("DOMContentLoaded", () => {
    const MIN_PASSWORD_LENGTH = 8;

    const form = document.getElementById("signupForm");
    const createBtn = document.getElementById("createBtn");
    const formError = document.getElementById("formError");

    const fields = {
        name:     { input: document.getElementById("name"),     box: document.getElementById("nameBox"),     error: document.getElementById("nameError") },
        email:    { input: document.getElementById("email"),    box: document.getElementById("emailBox"),    error: document.getElementById("emailError") },
        password: { input: document.getElementById("password"), box: document.getElementById("passwordBox"), error: document.getElementById("passwordError") },
        confirm:  { input: document.getElementById("confirm"),  box: document.getElementById("confirmBox"),  error: document.getElementById("confirmError") }
    };

    // ---------- Show / hide password buttons ----------
    document.querySelectorAll(".toggle-pw").forEach((btn) => {
        btn.addEventListener("click", () => {
            const input = document.getElementById(btn.dataset.target);
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            btn.textContent = show ? "Hide" : "Show";
        });
    });

    // ---------- Helpers ----------
    function setError(key, message) {
        const f = fields[key];
        f.error.textContent = message;
        f.box.classList.add("invalid");
        f.box.classList.remove("valid");
    }

    function setValid(key) {
        const f = fields[key];
        f.error.textContent = "";
        f.box.classList.remove("invalid");
        f.box.classList.add("valid");
    }

    // Each validator returns an error message, or "" when the value is fine
    const validators = {
        name() {
            const v = fields.name.input.value.trim();
            if (!v) return "Enter your name.";
            if (v.length < 2) return "Name must be at least 2 characters.";
            return "";
        },
        email() {
            const v = fields.email.input.value.trim();
            if (!v) return "Enter your email address.";
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return "Enter a valid email, like name@example.com.";
            return "";
        },
        password() {
            const v = fields.password.input.value;
            if (!v) return "Enter a password.";
            if (v.length < MIN_PASSWORD_LENGTH) {
                return `Password is too short: ${v.length} of ${MIN_PASSWORD_LENGTH} characters minimum.`;
            }
            return "";
        },
        confirm() {
            const v = fields.confirm.input.value;
            if (!v) return "Confirm your password.";
            if (v !== fields.password.input.value) return "Passwords do not match.";
            return "";
        }
    };

    function validateField(key) {
        const message = validators[key]();
        if (message) setError(key, message);
        else setValid(key);
        return !message;
    }

    // Check a field once the person leaves it, then keep checking while they type
    Object.keys(fields).forEach((key) => {
        const f = fields[key];
        let touched = false;

        f.input.addEventListener("blur", () => {
            touched = true;
            validateField(key);
        });

        f.input.addEventListener("input", () => {
            formError.textContent = "";
            if (touched) validateField(key);
            // If the password changes, the confirm field may no longer match
            if (key === "password" && fields.confirm.input.value) validateField("confirm");
        });
    });

    // ---------- Submit ----------
    let pendingPayload = null;   // the form data, kept so "Resend code" can send it again
    form.addEventListener("submit", async (e) => {
        e.preventDefault();   // keeps the URL unchanged
        formError.textContent = "";

        // Validate every field (don't stop at the first error, so all problems show)
        const results = Object.keys(fields).map(validateField);
        if (results.includes(false)) {
            const firstBad = Object.keys(fields).find((k) => fields[k].box.classList.contains("invalid"));
            if (firstBad) fields[firstBad].input.focus();
            return;
        }

        const payload = {
            name: fields.name.input.value.trim(),
            email: fields.email.input.value.trim(),
            password: fields.password.input.value,
            confirm: fields.confirm.input.value
        };

        createBtn.disabled = true;
        createBtn.value = "Sending code...";

        try {
            const res = await fetch("/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));

            if (res.ok && data.ok) {
                // Step 1 done: the code was emailed. Ask for it (the account is created after step 2).
                pendingPayload = payload;
                showOtpStep(payload.email);
                return;
            }

            // The server rejected it: show its reason under the right field
            if (data.field && fields[data.field]) {
                setError(data.field, data.error || "Check this field.");
                fields[data.field].input.focus();
            } else {
                formError.textContent = data.error || "Could not create the account. Try again.";
            }
        } catch (err) {
            formError.textContent = "Could not reach the server. Check your connection and try again.";
        } finally {
            createBtn.disabled = false;
            createBtn.value = "Create account";
        }
    });

    // ---------- Step 2: check the code from the email ----------
    const otpView = document.getElementById("otpView");
    const otpForm = document.getElementById("otpForm");
    const otpInput = document.getElementById("otp");
    const otpError = document.getElementById("otpError");
    const otpInfo = document.getElementById("otpInfo");
    const verifyBtn = document.getElementById("verifyBtn");
    const resendBtn = document.getElementById("resendBtn");
    let resendTimer = null;

    function showOtpStep(email) {
        document.getElementById("otpEmail").textContent = email;
        document.getElementById("formView").hidden = true;
        otpView.hidden = false;
        otpInput.value = "";
        otpError.textContent = "";
        otpInfo.textContent = "";
        startResendCountdown(30);
        otpInput.focus();
    }

    // "Resend code" waits a little, so nobody can flood an inbox
    function startResendCountdown(seconds) {
        clearInterval(resendTimer);
        let left = seconds;
        resendBtn.disabled = true;
        resendBtn.textContent = `Resend code (${left})`;
        resendTimer = setInterval(() => {
            left--;
            if (left <= 0) {
                clearInterval(resendTimer);
                resendBtn.disabled = false;
                resendBtn.textContent = "Resend code";
            } else {
                resendBtn.textContent = `Resend code (${left})`;
            }
        }, 1000);
    }

    // only digits in the code box
    otpInput.addEventListener("input", () => {
        otpInput.value = otpInput.value.replace(/\D/g, "");
        otpError.textContent = "";
    });

    otpForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        otpError.textContent = "";
        otpInfo.textContent = "";

        const code = otpInput.value.trim();
        if (!/^\d{6}$/.test(code)) {
            otpError.textContent = "Enter the 6-digit code from your email.";
            return;
        }

        verifyBtn.disabled = true;
        verifyBtn.value = "Checking...";
        try {
            const res = await fetch("/signup_verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ otp: code })
            });
            const data = await res.json().catch(() => ({}));

            if (res.ok && data.ok) {
                clearInterval(resendTimer);
                document.getElementById("successName").textContent = data.name || pendingPayload.name;
                otpView.hidden = true;
                document.getElementById("successView").hidden = false;
                return;
            }
            otpError.textContent = data.error || "Could not check the code. Try again.";
        } catch (err) {
            otpError.textContent = "Could not reach the server. Check your connection and try again.";
        } finally {
            verifyBtn.disabled = false;
            verifyBtn.value = "Verify and create account";
        }
    });

    resendBtn.addEventListener("click", async () => {
        if (!pendingPayload) return;
        otpError.textContent = "";
        otpInfo.textContent = "";
        resendBtn.disabled = true;
        try {
            const res = await fetch("/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(pendingPayload)
            });
            const data = await res.json().catch(() => ({}));

            if (res.ok && data.ok) {
                otpInfo.textContent = "A new code was sent. Check your email.";
                startResendCountdown(30);
                return;
            }
            otpError.textContent = data.error || "Could not send a new code. Try again.";
        } catch (err) {
            otpError.textContent = "Could not reach the server. Check your connection and try again.";
        }
        resendBtn.disabled = false;   // only reached when sending failed
    });

    // go back to the form to fix the email address
    document.getElementById("changeEmailBtn").addEventListener("click", () => {
        clearInterval(resendTimer);
        otpView.hidden = true;
        document.getElementById("formView").hidden = false;
        fields.email.input.focus();
    });
});