# Chat++

A hybrid AI chat app built with Flask. It has two modes:

| Mode | Where the AI runs | Where chats are saved | Needs an account? |
|------|-------------------|-----------------------|-------------------|
| **Offline** | On your own device (Gemini Nano built into Chrome) | A local file on your computer (`database/chat.db`) | No |
| **Online** | In the cloud (Gemini, through Firebase AI Logic) | In a Turso cloud database, one chat per user | Yes (email + OTP) |

## Features

- Offline and online chat, each with its own saved history
- Account creation with an **email OTP** (a 6-digit code is emailed to verify the address)
- Sign in, **forgot password** (OTP), and **sign out**
- The AI remembers the latest messages of the conversation (kept short on purpose to save tokens)
- Markdown answers (bold text, lists, code blocks)
- Incognito toggle, clear chat, and a greeting with your name in online mode

## What you need

- **Python** 3.9 or newer
- **Node.js** (a current LTS version) and npm
- **Offline mode:** desktop Chrome with Gemini Nano turned on (see [Chrome setup](#chrome-setup-for-offline-mode))
- **Online mode:** your own free accounts at **Turso**, **Brevo** and **Firebase** (see [step 4](#4-create-the-accounts-online-mode-only))

> Only want to try the offline mode? You can skip step 4, 5 and the Firebase part of step 6.
> The app starts and the offline chat works without any keys.

---

## Setup

### 1. Get the code

```bash
git clone <your-repository-url>
cd <the-project-folder>
```

### 2. Install the Python packages

Create a virtual environment first (recommended), then install:

```bash
# Windows
py -m venv .venv
.venv\Scripts\activate

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Install the Node packages

```bash
npm install
```

### 4. Create the accounts (online mode only)

You need three free accounts. Each one gives you values for the `.env` file or for `static/js/firebase-ai.js`.

#### 4.1 Turso (the database for accounts and online chats)

1. Sign up at <https://turso.tech>.
2. Create a database (any name, for example `chatpp`).
3. Get two values:
   - **Database URL**: it looks like `libsql://your-database-your-name.turso.io`.
   - **Auth token**: create one for that database.

   You can do both in the Turso dashboard (open your database and use the token option there), or with the Turso CLI:

   ```bash
   turso auth login
   turso db create chatpp
   turso db show chatpp --url        # the database URL
   turso db tokens create chatpp     # the auth token
   ```

   (The Turso CLI works on macOS and Linux. On Windows, use the dashboard or WSL.)

4. These go into `.env` as `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

The app creates its tables by itself the first time someone signs up or signs in.

Docs: <https://docs.turso.tech/quickstart>

#### 4.2 Brevo (sends the OTP emails)

1. Sign up at <https://www.brevo.com> and confirm your email address.
2. **Add and verify a sender.** Brevo only sends from an address you have verified. Go to *Senders, Domains & Dedicated IPs* > *Senders* > *Add a new sender*, enter your email address, and click the link Brevo sends you.
3. **Create an API key.** Go to *Settings* > *SMTP & API* > *API keys* tab > *Generate a new API key*. Copy it right away, because it is shown only once.
4. These go into `.env`:
   - `BREVO_API_KEY` = the API key
   - `BREVO_SENDER_EMAIL` = the sender address you verified in step 2

**New IP address blocked?** Brevo can block API calls from an IP address it does not know. Then emails are not sent until you approve the IP. You have two options:

- Approve the IP from the email Brevo sends you, or in *Settings* > *Security* > *Authorized IPs*.
- Or turn the blocking off on that same page (*Deactivate blocking*). This is easier if your home internet changes IP often, but it makes your key less protected, so never share the key.

Docs: <https://help.brevo.com/hc/en-us/articles/5740111683858>

#### 4.3 Firebase (the cloud AI)

1. Go to <https://console.firebase.google.com> and create a project.
2. Add a **web app**: *Project settings* > *Your apps* > the web icon `</>`. Register it and copy the `firebaseConfig` values (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, `measurementId`). They go into `static/js/firebase-ai.js` in step 6.
3. Turn on **Firebase AI Logic**: *Build* > *AI Logic* > *Get started*, and choose the **Gemini Developer API** (it has a free tier with limits).
4. Set up **App Check**, which protects your AI from other people's apps:
   1. Create a **reCAPTCHA v3** key (type *score based*) at <https://www.google.com/recaptcha/admin>. You get a **site key** and a **secret key**. When you put the app on a real website, add its domain to the key's domain list.
   2. In Firebase: *Security* > *App Check* > *Apps* > your web app > choose **reCAPTCHA v3** and paste the **secret key**.
   3. The **site key** goes into `static/js/firebase-ai.js` as `RECAPTCHA_SITE_KEY` (step 6).
   4. When everything works, go to *App Check* > *APIs* > *Firebase AI Logic* and click **Enforce**.
5. **Testing on your own computer needs a debug token.** On `localhost` or `127.0.0.1`, the app turns on App Check debug mode:
   1. Open the chat page and press **F12** > *Console*. Reload the page and copy the line `AppCheck debug token: ...`.
   2. In Firebase: *App Check* > *Apps* > your web app > the three dots (⋮) > **Manage debug tokens** > add the token.
   3. The token is different for each browser and for each address, so always open the app with the **same address** (for example always `127.0.0.1`), and add a new token if you change browser or address.
6. Optional but recommended: set a **spend cap** for Firebase AI Logic, and in Google Cloud console > *APIs & Services* > *Credentials* limit your browser key to your website addresses.

Docs: <https://firebase.google.com/docs/ai-logic> and <https://firebase.google.com/docs/ai-logic/app-check>

### 5. Fill in the `.env` file

Copy the example file, then open `.env` and fill in the values:

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

| Variable | What it is |
|----------|------------|
| `TURSO_DATABASE_URL` | Turso database URL (step 4.1) |
| `TURSO_AUTH_TOKEN` | Turso auth token (step 4.1) |
| `BREVO_API_KEY` | Brevo API key (step 4.2) |
| `BREVO_SENDER_EMAIL` | The sender address you verified in Brevo (step 4.2) |
| `SECRET_KEY` | Any long random text. It protects the sign-in cookie. |

You can make a good `SECRET_KEY` with:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

> **Never upload `.env` to GitHub.** It is already listed in `.gitignore`.
> Restart the app after you change `.env`.

### 6. Put your Firebase values into `static/js/firebase-ai.js`

Open `static/js/firebase-ai.js` and replace the `firebaseConfig` values and `RECAPTCHA_SITE_KEY` with your own (from step 4.3). The Firebase config values are not secrets, but they must be **yours**, or your online chat will not work.

### 7. Build the Firebase script

The browser loads the built file `static/build/firebase-ai.js`. Build it again every time you edit `static/js/firebase-ai.js`:

```bash
npm run build
```

### 8. Run the app

```bash
python app.py
```

Open <http://127.0.0.1:5000> in Chrome.

---

## Chrome setup for offline mode

The offline mode runs Google's **Gemini Nano** model inside Chrome, on your device. Nothing you type in offline mode is sent to the cloud.

**What you need**

- **Desktop Chrome** (Windows 10/11, macOS 13 or newer, or Linux), version **139 or newer**. Mobile browsers, Edge, Firefox and Safari are not supported for this mode.
- **At least 22 GB of free space** on the drive that holds your Chrome profile.
- **A graphics card with more than 4 GB of VRAM**, or a CPU with **16 GB of RAM and 4 or more cores**.
- An unmetered internet connection for the first model download (it is several GB).

**Turn it on**

1. Update Chrome, then open `chrome://flags/#optimization-guide-on-device-model` and set it to **Enabled**. If your computer does not pass Chrome's performance check, choose **Enabled BypassPerfRequirement** if that option is offered.
2. Open `chrome://flags/#prompt-api-for-gemini-nano` and set it to **Enabled**. If you also see `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, enable it too.
3. Click **Relaunch** at the bottom of the page.
4. Check the model: open `chrome://on-device-internals` and look at the *Model Status* tab for errors. Or open DevTools (F12), type `await LanguageModel.availability()` in the Console and press Enter. `available` means it is ready. `downloadable` or `downloading` means the model still has to be downloaded.
5. In the app, click **Get Started with offline**. The first time, Chrome downloads the model and the page shows the progress in percent. Keep the tab open until it finishes.

If a flag does not appear on `chrome://flags`, your Chrome is too old. Update it and try again. If the model does not work, restart Chrome and wait a while, because the download can take some time.

If your browser or computer cannot run the model, the app shows an **"Offline mode isn't supported"** popup, and you can use the online mode instead.

More details: <https://developer.chrome.com/docs/ai/get-started>

---

## Using the app

- **Offline:** click *Get Started with offline*. No account is needed. Your chat is saved in `database/chat.db` on your computer.
- **Online:** click *Get Started with online*, create an account (a 6-digit code is emailed to you), and sign in. Your chat is saved in your Turso database. Use *sign out* in the chat when you are done.
- **Forgot your password?** Use the link on the sign-in page. A code is emailed to you, and then you choose a new password.
- **clear chat** deletes the saved messages of the current mode. The AI forgets them too.

## Troubleshooting

| What you see | What to do |
|--------------|-----------|
| `AppCheck ... HTTP status: 403 (appCheck/fetch-status-error)` | The browser's App Check token was not accepted. On your own computer, register the debug token from the Console (step 4.3, point 5). Always use the same address (`localhost` or `127.0.0.1`). On a real website, check the reCAPTCHA domain list. |
| "Sending failed..." or "Could not send the verification email" | Check `BREVO_API_KEY`, check that `BREVO_SENDER_EMAIL` is a verified sender, and check *Authorized IPs* in Brevo (step 4.2). |
| "Could not reach the database. Try again." | `TURSO_DATABASE_URL` or `TURSO_AUTH_TOKEN` is missing or wrong. Restart the app after fixing `.env`. |
| Error about a missing secret key | Add `SECRET_KEY` to `.env` and restart the app. |
| "Offline mode isn't supported" popup | Follow the [Chrome setup](#chrome-setup-for-offline-mode). |
| Changes in `firebase-ai.js` have no effect | Run `npm run build`, then refresh the page with Ctrl+F5. |
| The online chat sends you to the sign-in page | You are signed out. Sign in again. |

## Project structure

```
app.py                  Flask app: pages, accounts, OTP, chat saving
core/database.py        Turso database functions
core/mail.py            OTP emails through Brevo
templates/              HTML pages (chat, sign in, create account, password reset)
static/js/              Browser scripts (chat-ui.js, ui.js, firebase-ai.js, ...)
static/css/             Styles
static/build/           Built firebase-ai.js (made by `npm run build`)
database/chat.db        Offline chat history (created automatically, not uploaded)
.env                    Your private keys (you create it, not uploaded)
```

## License

MIT (see `LICENSE`).
