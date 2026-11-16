#!/usr/bin/env python3
"""Poll the Cyrene letter service and deliver one due daily letter via Gmail SMTP."""
import json
import os
import smtplib
import ssl
import urllib.error
import urllib.request
from email.message import EmailMessage


def request_json(url, token, method="GET", payload=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    base = os.environ.get("CYRENE_WORKER_URL", "").strip().rstrip("/")
    token = os.environ.get("CYRENE_API_TOKEN", "").strip()
    password = os.environ.get("GMAIL_APP_PASSWORD", "").strip().replace(" ", "")
    recipient = os.environ.get("ANNOUNCEMENT_EMAIL_TO", "theomgvirus@gmail.com").strip()
    if not base or not token:
        raise RuntimeError("CYRENE_WORKER_URL and CYRENE_API_TOKEN must be configured.")
    if not password:
        raise RuntimeError("GMAIL_APP_PASSWORD is not configured.")
    result = request_json(base + "/api/cyrene/due", token)
    if not result.get("due"):
        print("No Cyrene letter is due right now:", result.get("reason") or result.get("scheduledFor") or "not yet")
        return
    message = EmailMessage()
    message["From"] = recipient
    message["To"] = recipient
    message["Subject"] = result["subject"]
    message.set_content(result["text"])
    message.add_alternative(result["html"], subtype="html")
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context, timeout=30) as server:
        server.login(recipient, password)
        server.send_message(message)
    request_json(base + "/api/cyrene/ack", token, "POST", {"date": result["date"]})
    print(f"Cyrene's daily letter sent successfully for {result['date']} to {recipient}.")


if __name__ == "__main__":
    main()
