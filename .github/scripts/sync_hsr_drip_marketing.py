#!/usr/bin/env python3
"""Sync official HSR character drip-marketing artwork from the Fandom wiki category."""
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://honkai-star-rail.fandom.com/api.php"
CATEGORY = "Category:Drip_Marketing"
OUT = Path("assets/hsr/drip-marketing")
INDEX = OUT / "index.json"
USER_AGENT = "UIB-ELibrary-HSR-DripArchive/1.0 (GitHub Actions; artwork archive sync)"
FILE_PATTERN = re.compile(r"^Character (.+?) Introduction\.(png|jpe?g|webp)$", re.I)


def request_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


def slugify(value):
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "character-art"


def category_files():
    continuation = {}
    found = []
    while True:
        params = {
            "action": "query",
            "generator": "categorymembers",
            "gcmtitle": CATEGORY,
            "gcmtype": "file",
            "gcmnamespace": 6,
            "gcmlimit": 500,
            "prop": "imageinfo",
            "iiprop": "url|size|mime",
            "format": "json",
        }
        params.update(continuation)
        payload = request_json(API + "?" + urllib.parse.urlencode(params))
        for page in (payload.get("query", {}).get("pages", {}) or {}).values():
            title = page.get("title", "").removeprefix("File:")
            match = FILE_PATTERN.match(title)
            info = (page.get("imageinfo") or [{}])[0]
            source = info.get("url")
            if match and source and info.get("mime", "").startswith("image/"):
                found.append({
                    "name": match.group(1).strip(),
                    "title": page.get("title", "File:" + title),
                    "source_url": source,
                    "extension": match.group(2).lower().replace("jpeg", "jpg"),
                })
        continuation = payload.get("continue")
        if not continuation:
            break
        time.sleep(0.25)
    # Keep the newest category response's unique file titles only.
    unique = {item["title"]: item for item in found}
    return sorted(unique.values(), key=lambda item: item["name"].casefold())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = category_files()
    if not files:
        raise RuntimeError("No Character ... Introduction image files were found in Category:Drip_Marketing")

    entries = []
    used_paths = set()
    for item in files:
        base = slugify(item["title"].removeprefix("File:").rsplit(".", 1)[0])
        extension = item["extension"]
        filename = f"{base}.{extension}"
        if filename in used_paths:
            suffix = slugify(item["name"])
            filename = f"{base}-{suffix}.{extension}"
        used_paths.add(filename)
        target = OUT / filename
        if not target.exists():
            req = urllib.request.Request(item["source_url"], headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=90) as response:
                data = response.read()
            if not data:
                raise RuntimeError(f"Downloaded empty image: {item['title']}")
            target.write_bytes(data)
            print(f"Downloaded {item['title']} ({len(data)} bytes)")
        else:
            print(f"Already archived: {item['title']}")
        entries.append({
            "name": item["name"],
            "file": filename,
            "sourceFile": item["title"],
            "sourceUrl": item["source_url"],
            "licenseNote": "Check the source file licensing; original character artwork belongs to HoYoverse.",
        })

    INDEX.write_text(json.dumps({
        "source": "https://honkai-star-rail.fandom.com/wiki/Category:Drip_Marketing",
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "characters": entries,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Indexed {len(entries)} drip-marketing artworks in {INDEX}")


if __name__ == "__main__":
    main()
