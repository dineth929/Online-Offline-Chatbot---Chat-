import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import {
    getAI,
    getGenerativeModel,
    GoogleAIBackend,
    InferenceMode
} from "firebase/ai";

// ---------- Firebase setup ----------
const firebaseConfig = {
    apiKey: "AIzaSyDU9r-Bgopw9MCV5VbarDcToMMqQJFknvw",
    authDomain: "fir-chatbot-ba25e.firebaseapp.com",
    projectId: "fir-chatbot-ba25e",
    storageBucket: "fir-chatbot-ba25e.firebasestorage.app",
    messagingSenderId: "618561173267",
    appId: "1:618561173267:web:ed3f23d6941719215b4ce6",
    measurementId: "G-1QR1YV1TL8"
};

const firebaseApp = initializeApp(firebaseConfig);

// ---------- App Check (protects your API when published) ----------
// 1. Firebase console > App Check > Apps > your web app > register reCAPTCHA v3
// 2. Paste the SITE key (not the secret key) below, then run: npm run build
// 3. Firebase console > App Check > APIs > Firebase AI Logic > Enforce
const RECAPTCHA_SITE_KEY = "6LfWkSYuAAAAABt8FVrpsedyBGGHMAobo7AI9XYI";

const appCheckEnabled = !RECAPTCHA_SITE_KEY.startsWith("PASTE_");

if (appCheckEnabled) {
    // On localhost, App Check prints a debug token in the browser console.
    // Add it in: App Check > Apps > your app > Manage debug tokens.
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true
    });
} else {
    console.warn("App Check is OFF: set RECAPTCHA_SITE_KEY in firebase-ai.js before publishing.");
}

const ai = getAI(firebaseApp, {
    backend: new GoogleAIBackend(),
    // each App Check token works for one request only, so a stolen token can't be reused
    useLimitedUseAppCheckTokens: appCheckEnabled
});

// ---------- Two separate models ----------
// ONLY_IN_CLOUD     -> always uses the Gemini cloud model (online version)
// ONLY_ON_DEVICE    -> always uses the browser's built-in model (offline version),
//                      and never silently falls back to the cloud
const cloudModel = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD });
const localModel = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE });

// ---------- Local (on-device) support ----------
const LOCAL_UNSUPPORTED = "LOCAL_UNSUPPORTED";

function makeError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

// Chrome exposes the on-device model through the global LanguageModel object.
// If it is missing, this browser can't run the offline version at all.
function hasLocalApi() {
    return typeof window !== "undefined" && "LanguageModel" in window;
}

let localReady = false;

// Checks support and downloads the on-device model if needed.
// Must be called from a click (Chrome requires a user gesture for the download).
// Throws an error with code LOCAL_UNSUPPORTED when the browser/device can't run it.
async function prepareLocal(onProgress) {
    if (!hasLocalApi()) {
        throw makeError(LOCAL_UNSUPPORTED, "This browser does not support on-device AI.");
    }
    try {
        // Throws if the model is unavailable on this device;
        // otherwise waits for any download to finish.
        await localModel.initializeDeviceModel(onProgress);
        localReady = true;
    } catch (error) {
        console.error(error);
        throw makeError(
            LOCAL_UNSUPPORTED,
            "The on-device model is not available on this device or browser."
        );
    }
}

// ---------- Conversation memory ----------
// Earlier messages are sent again with every question and cost tokens,
// so only a small, recent slice goes along. Raise these numbers for a longer memory.
const MEMORY_CHARS_ONLINE = 2000;   // about 500 tokens
const MEMORY_CHARS_LOCAL = 1000;    // the on-device model has a small context window

// ---------- Ask the AI ----------
async function askAI(question) {
    const useLocal = window.AI_MODE === "local";

    if (useLocal && !localReady) {
        // user got here without a successful prepareLocal()
        throw makeError(LOCAL_UNSUPPORTED, "The on-device model is not ready.");
    }

    const memory = window.chatUI.getMemory(useLocal ? MEMORY_CHARS_LOCAL : MEMORY_CHARS_ONLINE);

    if (useLocal) {
        // The on-device model has no chat mode, so the earlier messages go into the prompt text
        let prompt = question;
        if (memory.length > 0) {
            const earlier = memory.map(function (m) { return "User: " + m.q + "\nAI: " + m.a; }).join("\n");
            prompt = "Earlier messages:\n" + earlier + "\n\nUser: " + question + "\nAI:";
        }
        const result = await localModel.generateContent(prompt);
        return result.response.text();
    }

    // Online: a chat session that starts with the earlier messages
    const history = memory.flatMap(function (m) {
        return [
            { role: "user", parts: [{ text: m.q }] },
            { role: "model", parts: [{ text: m.a }] }
        ];
    });
    const chat = cloudModel.startChat({ history: history });
    const result = await chat.sendMessage(question);
    return result.response.text();
}

window.hybridAI = { prepareLocal: prepareLocal, askAI: askAI, hasLocalApi: hasLocalApi };

// ---------- "Ask AI" button ----------
const askButton = document.getElementById("askButton");
const questionBox = document.getElementById("question");
let busy = false;

askButton.addEventListener("click", async () => {
    const question = questionBox.value.trim();
    if (!question || busy) return;

    busy = true;
    askButton.disabled = true;
    window.chatUI.start(question);

    try {
        const answer = await askAI(question);
        await window.chatUI.finish(question, answer);
    } catch (error) {
        console.error(error);
        window.chatUI.fail(error.message || "Something went wrong!");
        if (error.code === LOCAL_UNSUPPORTED) {
            window.showUnsupportedPopup();
        }
    } finally {
        busy = false;
        askButton.disabled = false;
    }
});