import os
import requests
from dotenv import load_dotenv

load_dotenv()

def turso_execute(sql, args=()):
    base = os.environ["TURSO_DATABASE_URL"].replace("libsql://", "https://").rstrip("/")

    def to_arg(v):
        if v is None:
            return {"type": "null"}
        if isinstance(v, int):
            return {"type": "integer", "value": str(v)}
        return {"type": "text", "value": str(v)}

    body = {"requests": [
        {"type": "execute", "stmt": {"sql": sql, "args": [to_arg(a) for a in args]}},
        {"type": "close"},
    ]}
    res = requests.post(
        base + "/v2/pipeline",
        json=body,
        timeout=15,
        headers={"Authorization": f"Bearer {os.environ['TURSO_AUTH_TOKEN']}"},
    )
    res.raise_for_status()

    first = res.json()["results"][0]
    if first["type"] == "error":
        raise RuntimeError(first["error"]["message"])

    rows = first["response"]["result"]["rows"]
    # each cell comes back like {"type": "text", "value": "abc"}, so unwrap it
    return [tuple(c.get("value") if isinstance(c, dict) else c for c in r) for r in rows]

# A user's chat lives in a table named after their email. Double any " so the email
# can never break out of the quotes (SQL injection).
def chat_table(email):
    return '"' + email.strip().lower().replace('"', '""') + '"'

def init_table():
    turso_execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL
        )
    """)

def user_init_table(email):
    turso_execute(f"""
        CREATE TABLE IF NOT EXISTS {chat_table(email)} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prompt TEXT NOT NULL,
            ai_response TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

def write_data(name, email, password_hash):
    turso_execute(
        "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
        (name, email, password_hash),
    )

def get_user(email):
    rows = turso_execute(
        "SELECT name, email, password_hash FROM users WHERE email = ?",
        (email.strip().lower(),),
    )
    if not rows:
        return None                      # no such email
    name, email, password_hash = rows[0]
    return {"name": name, "email": email, "password_hash": password_hash}

def read_user_chat(email):
    rows = turso_execute(
        f"SELECT id, prompt, ai_response, created_at FROM {chat_table(email)} ORDER BY id"
    )
    # turso_execute gives plain tuples, so build the dictionaries by hand
    return [
        {"id": int(r[0]), "prompt": r[1], "ai_response": r[2], "created_at": r[3]}
        for r in rows
    ]

def write_user_chat(email, prompt, ai_response):
    turso_execute(
        f"INSERT INTO {chat_table(email)} (prompt, ai_response) VALUES (?, ?)",
        (prompt, ai_response),
    )

def clear_chat(email):
    turso_execute(f"DELETE FROM {chat_table(email)}")

def update_user_password_db(email, password_hash):
    sql = """
        UPDATE users
        SET password_hash = ?
        WHERE email = ?
    """
    turso_execute(sql, (password_hash, email.strip().lower()))

def get_all_emails():
    sql = "SELECT email FROM users"
    rows = turso_execute(sql)
    emails = [row[0] for row in rows]
    return emails

def delete_row(email):
    turso_execute(f"""
        DELETE FROM {chat_table(email)}
        WHERE id = (SELECT MAX(id) FROM {chat_table(email)})
    """)