#!/usr/bin/env python3
"""Build a same-origin HSR live-data snapshot for GitHub Pages.

Each feed is fetched and validated independently. A failed refresh keeps the
last known-good payload and marks it stale instead of replacing it with [].
"""
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
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
        return {
            "status": "stale" if old.get("data") is not None else "error",
            "source": old.get("source") or url,
            "checkedAt": now_iso(),
            "lastSuccess": old.get("lastSuccess"),
            "error": str(exc),
            "data": old.get("data"),
        }


def main():
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
        feeds["news"] = {
            "status": "ok", "source": news_url, "checkedAt": now_iso(),
            "lastSuccess": now_iso(), "error": None, "data": list(unique.values()),
        }
    except Exception as exc:
        print(f"news: refresh failed: {exc}")
        feeds["news"] = {
            "status": "stale" if old_news.get("data") is not None else "error",
            "source": old_news.get("source") or news_url, "checkedAt": now_iso(),
            "lastSuccess": old_news.get("lastSuccess"), "error": str(exc),
            "data": old_news.get("data"),
        }

    snapshot = {"schemaVersion": 1, "updatedAt": now_iso(), "feeds": feeds}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for name, feed in feeds.items():
        count = len(feed.get("data") or []) if isinstance(feed.get("data"), list) else "available" if feed.get("data") else 0
        print(f"{name}: {feed['status']} ({count})")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
