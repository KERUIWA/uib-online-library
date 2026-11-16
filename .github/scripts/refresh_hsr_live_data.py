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


def html_escape(value):
    import html
    return html.escape(str(value or ""))


def item_label(item):
    if not isinstance(item, dict):
        return str(item)
    return str(item.get("title") or item.get("name") or item.get("name_en") or item.get("id") or item.get("url") or "Untitled item")


def item_key(item, index):
    if isinstance(item, dict):
        return str(item.get("id") or item.get("url") or item.get("key") or item.get("title") or item.get("name") or index)
    return str(index)


def summarize_item(item):
    if not isinstance(item, dict):
        return str(item)[:350]
    parts = []
    for key in ("title", "name", "name_en", "description", "desc", "start_time", "end_time", "startTime", "endTime", "url"):
        value = item.get(key)
        if value not in (None, ""):
            parts.append(f"{key.replace('_', ' ').title()}: {str(value)[:450]}")
    return " | ".join(parts)[:900] or json.dumps(item, ensure_ascii=False)[:900]


def collection_changes(old_items, new_items):
    old_map = {item_key(item, i): item for i, item in enumerate(old_items or [])}
    new_map = {item_key(item, i): item for i, item in enumerate(new_items or [])}
    added = [new_map[k] for k in new_map.keys() - old_map.keys()]
    removed = [old_map[k] for k in old_map.keys() - new_map.keys()]
    updated = [(old_map[k], new_map[k]) for k in old_map.keys() & new_map.keys() if old_map[k] != new_map[k]]
    return added, removed, updated


def feed_sections(name, data):
    if name == "calendar" and isinstance(data, dict):
        return [(key, data.get(key)) for key in ("banners", "events") if isinstance(data.get(key), list)]
    if name == "activity" and isinstance(data, dict):
        sections = []
        if isinstance(data.get("activities"), list):
            sections.append(("Activities", data["activities"]))
        return sections
    if name == "news" and isinstance(data, list):
        return [("News and announcements", data)]
    if isinstance(data, list):
        return [(name.title(), data)]
    if isinstance(data, dict):
        return [(key.replace("_", " ").title(), value) for key, value in data.items() if isinstance(value, list)]
    return []


def build_change_report(previous_feeds, current_feeds):
    report = []
    unavailable = []
    for feed_name in sorted(set(previous_feeds) | set(current_feeds)):
        old_feed = previous_feeds.get(feed_name, {})
        new_feed = current_feeds.get(feed_name, {})
        if new_feed.get("status") != "ok":
            unavailable.append((feed_name, new_feed.get("error") or "Feed could not be verified"))
            continue
        new_data = new_feed.get("data")
        old_data = old_feed.get("data") if old_feed.get("status") == "ok" else None
        if old_data is None:
            report.append({"feed": feed_name, "section": "Initial data", "added": [], "removed": [], "updated": [], "baseline": True})
            continue
        old_sections = dict(feed_sections(feed_name, old_data))
        new_sections = dict(feed_sections(feed_name, new_data))
        section_names = set(old_sections) | set(new_sections)
        for section in sorted(section_names):
            before = old_sections.get(section, [])
            after = new_sections.get(section, [])
            if isinstance(before, list) and isinstance(after, list):
                added, removed, updated = collection_changes(before, after)
                if added or removed or updated:
                    report.append({"feed": feed_name, "section": section, "added": added, "removed": removed, "updated": updated})
        if isinstance(old_data, dict) and isinstance(new_data, dict):
            ignored = {"banners", "events", "activities"}
            for key in sorted((set(old_data) | set(new_data)) - ignored):
                if old_data.get(key) != new_data.get(key):
                    report.append({"feed": feed_name, "section": key.replace("_", " ").title(), "added": [], "removed": [], "updated": [], "metadata": f"{old_data.get(key)} → {new_data.get(key)}"})
        elif old_data != new_data and not old_sections and not new_sections:
            report.append({"feed": feed_name, "section": "Feed data", "added": [], "removed": [], "updated": [], "metadata": "Feed content changed"})
    return report, unavailable


def send_status_email(report, unavailable, checked_at):
    password = os.environ.get("GMAIL_APP_PASSWORD", "").strip().replace(" ", "")
    recipient = os.environ.get("ANNOUNCEMENT_EMAIL_TO", "").strip()
    if not password:
        raise RuntimeError("GMAIL_APP_PASSWORD is not configured; cannot send the hourly status email")
    if not recipient:
        raise RuntimeError("ANNOUNCEMENT_EMAIL_TO is missing")

    changed = bool(report)
    status = "CHANGES DETECTED" if changed else "NO CHANGES"
    subject = f"HSR Monitor | {len(report)} update section(s)" if changed else "HSR Monitor | No changes"
    plain = [
        "UIB ONLINE LIBRARY · HONKAI: STAR RAIL MONITOR",
        status,
        f"Checked: {checked_at}",
        "",
    ]
    cards = []
    for entry in report:
        feed = entry["feed"].replace("_", " ").title()
        section = entry["section"]
        counts = []
        for key, label in (("added", "New"), ("updated", "Updated"), ("removed", "Removed")):
            if entry.get(key):
                counts.append(f"{label}: {len(entry[key])}")
        if entry.get("baseline"):
            counts.append("Initial snapshot")
        if entry.get("metadata"):
            counts.append(entry["metadata"])
        details = []
        for item in entry.get("added", []):
            details.append(("＋", "New", summarize_item(item)))
        for old_item, new_item in entry.get("updated", []):
            details.append(("↻", "Updated", summarize_item(new_item)))
        for item in entry.get("removed", []):
            details.append(("−", "Removed", summarize_item(item)))
        if not details and entry.get("baseline"):
            details.append(("•", "Baseline", "First successful snapshot recorded for this feed."))
        if not details and entry.get("metadata"):
            details.append(("↻", "Metadata", entry["metadata"]))
        detail_html = "".join(
            f'<li style="margin:7px 0;color:#334155;"><b>{html_escape(kind)}</b> · {html_escape(detail)}</li>'
            for _, kind, detail in details[:30]
        )
        detail_text = "\n".join(f"{kind}: {detail}" for _, kind, detail in details[:30])
        plain.extend([f"{feed} / {section}: {', '.join(counts)}", detail_text, ""])
        cards.append(
            '<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin:12px 0;">'
            f'<div style="font-size:11px;letter-spacing:1.2px;color:#64748b;text-transform:uppercase;">{html_escape(feed)}</div>'
            f'<div style="font-size:17px;font-weight:700;color:#0f172a;margin:4px 0 8px;">{html_escape(section)}</div>'
            f'<div style="font-size:12px;color:#64748b;margin-bottom:8px;">{html_escape(" · ".join(counts))}</div>'
            f'<ul style="padding-left:18px;margin:0;">{detail_html}</ul></div>'
        )
    if not report:
        plain.append("No changes were detected in the available feeds during this check.")
        cards.append(
            '<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:22px;margin:16px 0;text-align:center;">'
            '<div style="font-size:28px;">✓</div><div style="font-size:20px;font-weight:700;color:#065f46;margin:6px 0;">No changes this hour</div>'
            '<div style="color:#047857;">Banners, events, news and activity data match the previous successful check.</div></div>'
        )
    if unavailable:
        plain.extend(["", "FEEDS THAT COULD NOT BE VERIFIED:"])
        for name, error in unavailable:
            plain.append(f"- {name}: {error}")
        cards.append(
            '<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:15px;margin:12px 0;">'
            '<b style="color:#9a3412;">Some feeds could not be verified</b><ul style="margin-bottom:0;">'
            + "".join(f'<li>{html_escape(name)}: {html_escape(error)}</li>' for name, error in unavailable)
            + '</ul><div style="font-size:12px;color:#9a3412;margin-top:8px;">No-change status applies only to feeds checked successfully.</div></div>'
        )
    plain.extend(["", "This automated report is from the UIB Online Library HSR monitor."])
    html_body = (
        '<div style="margin:0;background:#f1f5f9;padding:24px 10px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">'
        '<div style="max-width:680px;margin:0 auto;">'
        '<div style="background:#111827;border-radius:18px 18px 0 0;padding:26px;color:#fff;">'
        '<div style="font-size:11px;letter-spacing:2px;color:#a5b4fc;font-weight:700;">UIB ONLINE LIBRARY</div>'
        '<div style="font-size:25px;font-weight:800;margin-top:8px;">Honkai: Star Rail Monitor</div>'
        f'<div style="display:inline-block;margin-top:14px;padding:7px 11px;border-radius:20px;background:{"#064e3b" if not changed else "#7c2d12"};color:#fff;font-size:12px;font-weight:700;letter-spacing:.6px;">{status}</div>'
        f'<div style="font-size:12px;color:#cbd5e1;margin-top:12px;">Checked {html_escape(checked_at)}</div></div>'
        '<div style="background:#f8fafc;padding:18px 20px;border-radius:0 0 18px 18px;">'
        + "".join(cards)
        + '<div style="font-size:11px;color:#64748b;text-align:center;padding:12px;">Automated hourly report · UIB Online Library</div>'
        '</div></div></div>'
    )
    message = EmailMessage()
    message["From"] = recipient
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content("\n".join(plain))
    message.add_alternative(html_body, subtype="html")
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context, timeout=30) as server:
        server.login(recipient, password)
        server.send_message(message)
    print(f"Hourly status email successfully sent to {recipient}: {status}; {len(report)} changed section(s), {len(unavailable)} unavailable feed(s).")

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

    report, unavailable = build_change_report(previous.get("feeds", {}), feeds)
    checked_at = now_iso()
    send_status_email(report, unavailable, checked_at)

    unchanged = feeds == previous.get("feeds", {})
    snapshot = {"schemaVersion": 1, "updatedAt": previous.get("updatedAt") if unchanged else checked_at, "feeds": feeds}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for name, feed in feeds.items():
        count = len(feed.get("data") or []) if isinstance(feed.get("data"), list) else "available" if feed.get("data") else 0
        print(f"{name}: {feed['status']} ({count})")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
