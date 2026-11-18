#!/usr/bin/env python3
"""Turn replies to tracked Cyrene letters into Gmail drafts. Never sends mail."""
import email
import imaplib
import os
import re
import ssl
import time
import urllib.error
import urllib.request
from email.message import EmailMessage
from email.policy import default
from email.utils import make_msgid, parseaddr
from datetime import datetime, timedelta


def worker_request(base, token, endpoint, payload):
    import json
    request = urllib.request.Request(
        base + endpoint,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "CyreneEmailReplies/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"Cyrene Worker returned HTTP {error.code}: {detail}") from None


def message_body(message):
    chunks = []
    parts = list(message.walk()) if message.is_multipart() else [message]
    for part in parts:
        if part.get_content_maintype() == "multipart":
            continue
        if part.get_content_disposition() == "attachment":
            continue
        if part.get_content_type() == "text/plain":
            try:
                chunks.append(part.get_content())
            except Exception:
                pass
    text = "\n".join(chunks).strip()
    if not text:
        for part in parts:
            if part.get_content_type() == "text/html":
                try:
                    html = part.get_content()
                    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", html)
                    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>", "\n", text)
                    text = re.sub(r"<[^>]+>", " ", text)
                    text = re.sub(r"&nbsp;", " ", text)
                    text = re.sub(r"&amp;", "&", text)
                    text = re.sub(r"\s+", " ", text).strip()
                    break
                except Exception:
                    pass
    # Keep the user's own words and remove the most common quoted-reply tail.
    cleaned = []
    for line in text.splitlines():
        if re.match(r"^\s*>", line):
            break
        if re.match(r"^On .{5,160}wrote:\s*$", line.strip(), re.I):
            break
        cleaned.append(line)
    return "\n".join(cleaned).strip()[:12000]


def process():
    base = os.environ["CYRENE_WORKER_URL"].strip().rstrip("/")
    token = os.environ["CYRENE_API_TOKEN"].strip()
    password = os.environ["GMAIL_APP_PASSWORD"].strip().replace(" ", "")
    account = os.environ.get("ANNOUNCEMENT_EMAIL_TO", "theomgvirus@gmail.com").strip()
    if not all((base, token, password, account)):
        raise RuntimeError("Cyrene reply service configuration is incomplete.")

    mail = imaplib.IMAP4_SSL("imap.gmail.com", 993, ssl_context=context, timeout=30)
    try:
        mail.login(account, password)
        status, _ = mail.select("INBOX", readonly=True)
        if status != "OK":
            raise RuntimeError("Could not open the Gmail inbox.")
        # A short lookback is enough; D1 deduplicates messages across workflow runs.
        status, data = mail.search(None, "SINCE", (datetime.now() - timedelta(days=14)).strftime("%d-%b-%Y"))
        if status != "OK":
            raise RuntimeError("Could not search the Gmail inbox.")
        ids = data[0].split()[-100:]
        for sequence in ids:
            status, fetched = mail.fetch(sequence, "(RFC822)")
            if status != "OK" or not fetched or not isinstance(fetched[0], tuple):
                continue
            incoming = email.message_from_bytes(fetched[0][1], policy=default)
            sender = parseaddr(incoming.get("From", ""))[1].lower()
            if sender != account.lower():
                continue
            inbound_id = (incoming.get("Message-ID") or "").strip()
            parent_id = (incoming.get("In-Reply-To") or "").strip()
            if not parent_id:
                refs = re.findall(r"<[^>]+>", incoming.get("References", ""))
                parent_id = refs[-1] if refs else ""
            body = message_body(incoming)
            if not inbound_id or not parent_id or not body:
                continue

            result = worker_request(base, token, "/api/cyrene/reply", {
                "inboundMessageId": inbound_id,
                "parentMessageId": parent_id,
                "subject": str(incoming.get("Subject", "A reply to Cyrene")),
                "body": body,
            })
            if not result.get("ok") or result.get("status") == "drafted":
                continue
            reply_text = result.get("text") or ""
            reply_subject = result.get("subject") or ("Re: " + str(incoming.get("Subject", "")))
            if not reply_text.strip():
                continue

            draft = EmailMessage()
            draft["From"] = account
            draft["To"] = account
            draft["Subject"] = reply_subject
            draft["Message-ID"] = make_msgid(domain="cyrene-drafts")
            draft["In-Reply-To"] = parent_id
            prior_refs = re.findall(r"<[^>]+>", incoming.get("References", ""))
            refs = prior_refs + ([parent_id] if parent_id not in prior_refs else [])
            draft["References"] = " ".join(refs)
            draft["X-Cyrene-Inbound-ID"] = inbound_id
            draft.set_content(reply_text)
            raw = draft.as_bytes()
            status = mail.append('"[Gmail]/Drafts"', "\Draft", imaplib.Time2Internaldate(time.time()), raw)[0]
            if status != "OK":
                raise RuntimeError("Gmail did not accept the Cyrene draft.")
            worker_request(base, token, "/api/cyrene/reply-drafted", {"inboundMessageId": inbound_id})
            print("Saved a Cyrene reply draft for:", inbound_id)
    finally:
        try:
            mail.logout()
        except Exception:
            pass


if __name__ == "__main__":
    process()
