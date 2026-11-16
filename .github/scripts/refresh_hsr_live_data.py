#!/usr/bin/env python3
"""Build a same-origin HSR live-data snapshot for GitHub Pages.

Each feed is fetched and validated independently. A failed refresh keeps the
last known-good payload and marks it stale instead of replacing it with [].
"""
import json
import os
import smtplib
import ssl
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

OUT = Path("assets/hsr/live-data.json")
SOURCES = {
    "calendar": ("https://api.ennead.cc/mihoyo/starrail/calendar?lang=en-us", "calendar"),
    "activity": ("https://starrailassistant.top/api/v1/activity/sr-en-US.json", "activity"),
}
NEWS_TYPES = ("notices", "events", "info")
HEADERS = {"User-Agent": "UIB-ELibrary-HSR-LiveData/1.0 (+https://keruiwa.github.io/uib-online-library/)"}


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def get_json(url):
    req = urllib.request.Request(url, headers={**HEADERS, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=25) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status}")
        return json.loads(response.read().decode("utf-8"))


def valid_calendar(value):
    return isinstance(value, dict) and (isinstance(value.get("events"), list) or isinstance(value.get("banners"), list))


def valid_activity(value):
    return isinstance(value, dict) and bool(value.get("version")) and isinstance(value.get("activities"), list)


def valid_news(value):
    return isinstance(value, list)


def load_previous():
    if not OUT.exists():
        return {"schemaVersion": 1, "updatedAt": None, "feeds": {}}
    try:
        value = json.loads(OUT.read_text(encoding="utf-8"))
        if isinstance(value, dict) and isinstance(value.get("feeds"), dict):
            return value
    except Exception as exc:
        print(f"Previous snapshot could not be read: {exc}")
    return {"schemaVersion": 1, "updatedAt": None, "feeds": {}}


def refresh_feed(previous, name, url, validator):
    old = previous.get("feeds", {}).get(name, {})
    try:
        data = get_json(url)
        if not validator(data):
            raise RuntimeError("Response failed schema validation")
        if old.get("status") == "ok" and old.get("data") == data:
            return old
        return {
            "status": "ok",
            "source": url,
            "checkedAt": now_iso(),
            "lastSuccess": now_iso(),
            "error": None,
            "data": data,
        }
    except Exception as exc:
        print(f"{name}: refresh failed: {exc}")
        if old.get("status") in ("stale", "error") and old.get("error") == str(exc):
            return old
        return {
            "status": "stale" if old.get("data") is not None else "error",
            "source": old.get("source") or url,
            "checkedAt": now_iso(),
            "lastSuccess": old.get("lastSuccess"),
            "error": str(exc),
            "data": old.get("data"),
        }


def article_key(item):
    return str(item.get("id") or item.get("url") or item.get("title") or "")


def send_new_announcement_email(items):
    """Email only newly listed article IDs. Missing credentials safely disable email."""
    password = os.environ.get("GMAIL_APP_PASSWORD", "").strip().replace(" ", "")
    recipient = os.environ.get("ANNOUNCEMENT_EMAIL_TO", "").strip()
    if not password:
        print("GMAIL_APP_PASSWORD is not configured; email notifications are pending setup.")
        return
    if not recipient:
        raise RuntimeError("ANNOUNCEMENT_EMAIL_TO is missing while Gmail credentials are configured")

    message = EmailMessage()
    message["From"] = recipient
    message["To"] = recipient
    message["Subject"] = f"New Honkai: Star Rail announcement(s): {len(items)}"
    lines = [
        "A new Honkai: Star Rail announcement was detected by the UIB E-Library hourly monitor.",
        "",
    ]
    for item in items:
        title = item.get("title") or "Honkai: Star Rail announcement"
        description = item.get("description") or ""
        url = item.get("url") or ""
        created = item.get("created_at")
        try:
            stamp = datetime.fromtimestamp(float(created), timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        except (TypeError, ValueError, OverflowError):
            stamp = "Publication time unavailable"
        lines.extend([title, f"Published: {stamp}"])
        if description:
            lines.append(description)
        if url:
            lines.append(url)
        lines.append("")
    lines.append("The HSR hub's announcement list will update from the same feed.")
    message.set_content("\n".join(lines))

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context, timeout=30) as server:
        server.login(recipient, password)
        server.send_message(message)
    print(f"Sent email notification for {len(items)} new announcement(s) to {recipient}.")



def send_test_email():
    """Send an explicit one-off delivery test when requested by workflow_dispatch."""
    password = os.environ.get("GMAIL_APP_PASSWORD", "").strip().replace(" ", "")
    recipient = os.environ.get("ANNOUNCEMENT_EMAIL_TO", "").strip()
    if not password:
        raise RuntimeError("Cannot send test email: GMAIL_APP_PASSWORD is not configured")
    if not recipient:
        raise RuntimeError("Cannot send test email: ANNOUNCEMENT_EMAIL_TO is missing")
    message = EmailMessage()
    message["From"] = recipient
    message["To"] = recipient
    message["Subject"] = "UIB HSR monitor: email delivery test"
    message.set_content(
        "This is a test email from the UIB Online Library HSR announcement monitor.\\n\\n"
        "If you received this message, Gmail SMTP authentication and delivery are working."
    )
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context, timeout=30) as server:
        server.login(recipient, password)
        server.send_message(message)
    print(f"Test email successfully sent to {recipient}.")


def main():
    if os.environ.get("SEND_TEST_EMAIL", "").lower() == "true":
        send_test_email()
    previous = load_previous()
    feeds = {}
    for name, (url, _) in SOURCES.items():
        feeds[name] = refresh_feed(previous, name, url, valid_calendar if name == "calendar" else valid_activity)

    news_url = "https://api.ennead.cc/mihoyo/starrail/news/"
    old_news = previous.get("feeds", {}).get("news", {})
    previous_news_data = old_news.get("data") if isinstance(old_news.get("data"), list) else None
    try:
        articles = []
        for category in NEWS_TYPES:
            part = get_json(news_url + category + "?lang=en-us")
            if not isinstance(part, list):
                raise RuntimeError(f"News category {category} returned an unexpected format")
            articles.extend(part)
        unique = {}
        for item in articles:
            if isinstance(item, dict):
                unique[str(item.get("id") or item.get("url") or item.get("title") or len(unique))] = item
        if not unique:
            raise RuntimeError("News endpoints returned no articles")
        news_data = list(unique.values())
        if old_news.get("status") == "ok" and old_news.get("data") == news_data:
            feeds["news"] = old_news
        else:
            feeds["news"] = {
            "status": "ok", "source": news_url, "checkedAt": now_iso(),
            "lastSuccess": now_iso(), "error": None, "data": news_data,
            }
    except Exception as exc:
        print(f"news: refresh failed: {exc}")
        if old_news.get("status") in ("stale", "error") and old_news.get("error") == str(exc):
            feeds["news"] = old_news
        else:
            feeds["news"] = {
            "status": "stale" if old_news.get("data") is not None else "error",
            "source": old_news.get("source") or news_url, "checkedAt": now_iso(),
            "lastSuccess": old_news.get("lastSuccess"), "error": str(exc),
            "data": old_news.get("data"),
            }

    # The first populated snapshot is a silent baseline. Thereafter, email only
    # articles with IDs/URLs that were absent from the previous successful feed.
    current_news = feeds.get("news", {}).get("data")
    if previous_news_data is not None and isinstance(current_news, list):
        previous_ids = {article_key(item) for item in previous_news_data if isinstance(item, dict)}
        new_articles = [
            item for item in current_news
            if isinstance(item, dict) and article_key(item) and article_key(item) not in previous_ids
        ]
        if new_articles:
            send_new_announcement_email(new_articles)
        else:
            print("No newly published announcements; no email sent.")
    else:
        print("No previous successful news snapshot; establishing a silent email baseline.")

    unchanged = feeds == previous.get("feeds", {})
    snapshot = {"schemaVersion": 1, "updatedAt": previous.get("updatedAt") if unchanged else now_iso(), "feeds": feeds}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for name, feed in feeds.items():
        count = len(feed.get("data") or []) if isinstance(feed.get("data"), list) else "available" if feed.get("data") else 0
        print(f"{name}: {feed['status']} ({count})")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
