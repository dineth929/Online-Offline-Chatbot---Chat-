import os
import sqlite3
from flask import Flask, render_template, request, jsonify, session, redirect, make_response
import re
import time
import secrets
from pathlib import Path
from werkzeug.security import generate_password_hash,check_password_hash
from core.database import *
from core.mail import send_otp_email

MIN_PASSWORD_LENGTH = 8
OTP_LIFETIME = 5 * 60      # seconds (the email says "expires in 5 minutes")
MAX_OTP_TRIES = 5          # wrong guesses allowed per OTP
INCOGNITO_MODE = False

# Pending OTPs live here on the server, never in the cookie (a cookie can be read by the user).
#   email -> {"otp": "123456", "expires": <time>, "tries": 0}
otp_store = {}

# Accounts waiting for their email to be verified. Nothing is saved to the database until the OTP is right.
#   email -> {"name": ..., "password_hash": ..., "otp": "123456", "expires": <time>, "sent": <time>, "tries": 0}
signup_store = {}

OTP_COOLDOWN = 30          # seconds before another OTP email can go to the same address


def purge_expired(store):
    # forget OTPs that ran out, so the dictionary doesn't grow forever
    now = time.time()
    for key in [k for k, v in store.items() if v["expires"] < now]:
        store.pop(key, None)


def sent_too_recently(store, email):
    entry = store.get(email)
    return bool(entry) and time.time() - entry["sent"] < OTP_COOLDOWN

def delete_last_masssage(mode,email=None):
    db = get_db()
    if INCOGNITO_MODE:
        if mode == "online":
            delete_row(email)
        else:
            db.execute("""
                DELETE FROM messages
                WHERE id = (SELECT MAX(id) FROM messages)
            """)
            db.commit()
            db.close()
    return jsonify({"ok": True})

app = Flask(__name__)

# The session cookie remembers who is signed in. Put SECRET_KEY=<long random text> in your .env
# so people stay signed in after a restart (without it, a new key is made on every start).
app.secret_key = os.environ.get("SECRET_KEY")

# the database is a single file that sits next to this python file
DB_FILE = Path(__file__).resolve().parent / "database" / "chat.db"
DB_FILE.parent.mkdir(exist_ok=True)

def get_db():
    db = sqlite3.connect(DB_FILE)
    db.row_factory = sqlite3.Row
    return db


def init_db():
    db = get_db()
    db.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prompt TEXT NOT NULL,
            ai_response TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.commit()
    db.close()


init_db()


# The browser (static/js/chat-ui.js) sends window.AI_MODE with every chat request:
#   "cloud" -> online mode, "local" -> offline mode
# This turns that value into "online" / "offline" (or None if it is missing or unknown)
def get_mode(value):
    if value == "cloud":
        return "online"
    if value == "local":
        return "offline"
    return None


@app.route("/")
def home():
    return render_template("index.html")

@app.route("/online/chat")
def online_chat():                      # this name must match url_for('online_chat')
    if "email" not in session:          # online chat needs a signed-in user
        return redirect("/signin")
    resp = make_response(render_template("index.html", auto_start="cloud"))
    resp.headers["Cache-Control"] = "no-store"      # so "Back" after signing out can't show the old chat
    return resp

# black page shown after "Get Started with online"
@app.route("/signin")
def online():
    return render_template("signin.html")

@app.route("/new_account")
def new_account():
    return render_template("new_account.html")

@app.route("/forgot_password")
def forgot_password():
    return render_template("forgot_password.html")

@app.route("/change_password")
def change_password():
    if "reset_verified" not in session:     # must pass the OTP check first
        return redirect("/forgot_password")
    return render_template("new_password.html")

@app.route("/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    confirm = data.get("confirm") or ""

    # The browser already checks these, but never trust only the browser
    if len(name) < 2:
        return jsonify({"ok": False, "field": "name", "error": "Name must be at least 2 characters."}), 400
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", email):
        return jsonify({"ok": False, "field": "email", "error": "Enter a valid email address."}), 400
    if len(password) < MIN_PASSWORD_LENGTH:
        return jsonify({"ok": False, "field": "password",
                        "error": f"Password must be at least {MIN_PASSWORD_LENGTH} characters."}), 400
    if password != confirm:
        return jsonify({"ok": False, "field": "confirm", "error": "Passwords do not match."}), 400

    # Make the hash (this is what you will store, never the real password)
    password_hash = generate_password_hash(password)
    try:
        init_table()
        if turso_execute("SELECT 1 FROM users WHERE email = ?", (email,)):
            return jsonify({"ok": False, "field": "email",
                            "error": "An account with this email already exists. Sign in"}), 409
    except Exception as e:
        print("Turso error:", e)
        return jsonify({"ok": False, "error": "Could not create the account. Try again."}), 500

    # Step 1 of 2: email a one-time code. The account is saved only after the code is entered (/signup_verify).
    purge_expired(signup_store)
    if sent_too_recently(signup_store, email):
        return jsonify({"ok": False, "error": "Please wait a few seconds before asking for another code."}), 429
    result = send_otp_email(email)
    if not result["success"]:
        return jsonify({"ok": False, "error": "Could not send the verification email. Check the address and try again."}), 502
    now = time.time()
    signup_store[email] = {"name": name, "password_hash": password_hash, "otp": result["otp"],
                           "expires": now + OTP_LIFETIME, "sent": now, "tries": 0}
    session["signup_email"] = email         # remember which email this browser is verifying
    return jsonify({"ok": True, "otp_sent": True})

@app.route("/signup_verify", methods=["POST"])
def signup_verify():
    # Step 2 of 2: the OTP is right, so now the account is really created
    data = request.get_json(silent=True) or {}
    enter_otp = str(data.get("otp", "")).strip()
    email = session.get("signup_email")
    entry = signup_store.get(email) if email else None
    if not entry:
        return jsonify({"ok": False, "error": "This code is no longer valid. Go back and create the account again."}), 400
    if time.time() > entry["expires"]:
        signup_store.pop(email, None)
        return jsonify({"ok": False, "error": "This code has expired. Click Resend code."}), 400
    if entry["tries"] >= MAX_OTP_TRIES:
        signup_store.pop(email, None)
        return jsonify({"ok": False, "error": "Too many wrong tries. Go back and create the account again."}), 400
    if not secrets.compare_digest(entry["otp"], enter_otp):
        entry["tries"] += 1
        return jsonify({"ok": False, "error": "Wrong code. Please check the code in your email."}), 400

    try:
        if turso_execute("SELECT 1 FROM users WHERE email = ?", (email,)):     # created meanwhile?
            signup_store.pop(email, None)
            return jsonify({"ok": False, "error": "An account with this email already exists. Sign in"}), 409
        write_data(entry["name"], email, entry["password_hash"])
    except Exception as e:
        print("Turso error:", e)
        return jsonify({"ok": False, "error": "Could not save the account. Try again."}), 500

    signup_store.pop(email, None)           # a code works only once
    session.pop("signup_email", None)
    return jsonify({"ok": True, "name": entry["name"]})

@app.route("/clear", methods=["POST"])
def clear():
    data = request.get_json(silent=True) or {}
    mode = get_mode(data.get("mode"))
    if mode is None:
        return jsonify({"ok": False, "error": "unknown mode"}), 400

    if mode == "online":
        email = session.get("email")
        if not email:
            return jsonify({"ok": False, "error": "not signed in"}), 401
        try:
            clear_chat(email)
        except Exception as e:
            print("Turso error:", e)
            return jsonify({"ok": False, "error": "Could not clear the chat."}), 500
    else:
        db = get_db()
        db.execute("DELETE FROM messages")
        db.commit()
        db.close()
    return jsonify({"ok": True})

@app.route("/chat", methods=["POST"])
def save_chat():
    data = request.get_json(silent=True) or {}
    mode = get_mode(data.get("mode"))
    prompt = (data.get("prompt") or "").strip()
    ai_response = data.get("ai_response") or ""

    if mode is None:
        return jsonify({"error": "unknown mode"}), 400
    if not prompt:
        return jsonify({"error": "empty prompt"}), 400

    if mode == "online":
        email = session.get("email")
        if not email:
            return jsonify({"error": "not signed in"}), 401
        try:
            write_user_chat(email, prompt, ai_response)
        except Exception as e:
            print("Turso error:", e)
            return jsonify({"error": "Could not save the chat."}), 500
    else:
        db = get_db()
        db.execute(
            "INSERT INTO messages (prompt, ai_response) VALUES (?, ?)",
            (prompt, ai_response),
        )
        db.commit()
        db.close()
    return jsonify({"ok": True})

# the chat screen asks for the signed-in user's name (read from Turso) for the "Hey <name>!" greeting
@app.route("/username")
def get_username():
    email = session.get("email")
    if not email:
        return jsonify({"ok": False, "error": "not signed in"}), 401
    try:
        user = get_user(email)
    except Exception as e:
        print("Turso error:", e)
        return jsonify({"ok": False, "error": "Could not load the name."}), 500
    return jsonify({"ok": True, "name": user["name"] if user else ""})

# the browser asks for the whole chat here and shows it
@app.route("/history")
def history():
    mode = get_mode(request.args.get("mode"))
    if mode is None:
        return jsonify({"error": "unknown mode"}), 400
    if mode == "online":
        email = session.get("email")
        if not email:
            return jsonify({"error": "not signed in"}), 401
        try:
            row = read_user_chat(email)
            delete_last_masssage(mode,email)
        except Exception as e:
            print("Turso error:", e)
            return jsonify({"error": "Could not load the chat."}), 500
    else:
        db = get_db()
        rows = db.execute(
            "SELECT id, prompt, ai_response, created_at FROM messages ORDER BY id"
        ).fetchall()
        delete_last_masssage(mode)
        db.close()
        row = [dict(r) for r in rows]
    return jsonify(row)

@app.route("/get-two", methods=["POST"])
def get_two():
    data = request.get_json(silent=True) or {}
    username = (data.get("first") or "").strip().lower()
    password = data.get("second") or ""
    if not username or "@" not in username or "." not in username:
        return jsonify({"ok": False, "message": "Wrong email! Please check"})
    try:
        user = get_user(username)
        if user is None:
            return jsonify({"ok": False, "message": "Account not found. Create an account or check the email"})
        if not check_password_hash(user["password_hash"], password):
            return jsonify({"ok": False, "message": "Password is incorrect. Check email and password"})
        user_init_table(username)
    except Exception as e:
        print("Turso error:", e)
        return jsonify({"ok": False, "message": "Could not reach the database. Try again."}), 500

    # Only now (email and password are correct) is this browser signed in
    session["email"] = username
    return jsonify({"ok": True})

@app.route("/sent_OTP", methods=["POST"])
def sent_OTP():
    data = request.get_json(silent=True) or {}
    email = (data.get("text") or "").strip().lower()
    if not email:
        return jsonify({"ok": False, "message": "Enter your email address."})
    try:
        registered_mails = get_all_emails()
    except Exception as e:
        print("Turso error:", e)
        return jsonify({"ok": False, "message": "Could not reach the database. Try again."}), 500
    if email not in registered_mails:
        return jsonify({"ok": False, "message": "No account. Create an account"})
    purge_expired(otp_store)
    if sent_too_recently(otp_store, email):
        return jsonify({"ok": False, "message": "Please wait a few seconds before asking for another OTP."})
    result = send_otp_email(email)
    if not result["success"]:
        return jsonify({"ok": False, "message": "Sending failed..."})
    now = time.time()
    otp_store[email] = {"otp": result["otp"], "expires": now + OTP_LIFETIME, "sent": now, "tries": 0}
    session["reset_email"] = email          # remember which email this browser is resetting
    session.pop("reset_verified", None)     # a new OTP means it must be verified again
    return jsonify({"ok": True, "message": "Sent. Check your email..."})

@app.route("/check_OTP", methods=["POST"])
def check_OTP():
    data = request.get_json(silent=True) or {}
    enter_otp = str(data.get("text", "")).strip()
    email = session.get("reset_email")
    entry = otp_store.get(email) if email else None
    if not entry:
        return jsonify({"ok": False, "message": "First, enter the email"})
    if time.time() > entry["expires"]:
        otp_store.pop(email, None)
        return jsonify({"ok": False, "message": "This OTP has expired. Send a new one."})
    if entry["tries"] >= MAX_OTP_TRIES:
        otp_store.pop(email, None)
        return jsonify({"ok": False, "message": "Too many wrong tries. Send a new OTP."})
    if not secrets.compare_digest(entry["otp"], enter_otp):
        entry["tries"] += 1
        return jsonify({"ok": False, "message": "Wrong OTP. Please check the OTP key."})
    otp_store.pop(email, None)              # an OTP works only once
    session["reset_verified"] = email       # this browser may now set a new password
    return jsonify({"ok": True, "message": "Successfully verified!"})

@app.route("/update_password", methods=["POST"])
def update_password():
    email = session.get("reset_verified")
    if not email:
        return jsonify({"ok": False, "message": "Verify your email with the OTP first."}), 403
    data = request.get_json(silent=True) or {}
    new_psw = data.get("text") or ""
    if len(new_psw) < MIN_PASSWORD_LENGTH:
        return jsonify({"ok": False, "message": f"Password must be at least {MIN_PASSWORD_LENGTH} characters."})
    try:
        update_user_password_db(email, generate_password_hash(new_psw))
    except Exception as e:
        print("Turso error:", e)
        return jsonify({"ok": False, "message": "Could not change the password. Try again."}), 500
    session.pop("reset_verified", None)
    session.pop("reset_email", None)
    return jsonify({"ok": True, "message": "Password changed. Sign in ....."})

@app.route("/logout", methods=["POST"])
def logout():
    session.clear()      # forgets who is signed in (and any half-finished sign-up or password reset)
    return jsonify({"ok": True})

@app.route("/incognito", methods=["POST"])
def incognito():
    global INCOGNITO_MODE
    data = request.get_json()
    checked = data.get("incognito")
    INCOGNITO_MODE = checked
    return jsonify({"ok": "True"})

if __name__ == "__main__":
    app.run(debug=True)