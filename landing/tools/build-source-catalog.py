from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import openpyxl


def clean_domain(value: str) -> str:
    parsed = urlparse(value if "://" in value else f"https://{value}")
    host = (parsed.netloc or parsed.path).lower().split("@")[-1].split(":")[0]
    return host[4:] if host.startswith("www.") else host


def safe_slug(value: str, fallback: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:60] or fallback


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: build-source-catalog.py INPUT.xlsx OUTPUT.json")

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    sheet = openpyxl.load_workbook(input_path, read_only=True, data_only=True)["منابع"]
    keys: set[tuple[str, str]] = set()
    sources: list[dict[str, str]] = []
    for row in sheet.iter_rows(min_row=2, values_only=True):
        source_id, name, url, source_type, language, category, logo, active = row
        if not name or not url or str(active).strip() not in {"بله", "yes", "true", "1"}:
            continue
        domain = clean_domain(str(url))
        key = (str(name).strip(), domain)
        if key in keys:
            continue
        keys.add(key)
        index = len(sources) + 1
        slug = safe_slug(domain, f"source-{index}")
        if any(item["slug"] == slug for item in sources):
            slug = f"{slug}-{index}"
        logo_value = str(logo or "").strip()
        if logo_value.lower() in {"https://x.com/", "https://x.com", "http://x.com/"}:
            logo_value = ""
        default_logo = f"https://icons.duckduckgo.com/ip3/{domain}.ico"
        sources.append(
            {
                "id": str(source_id or f"source-{index}"),
                "name": str(name).strip(),
                "url": str(url).strip(),
                "domain": domain,
                "type": str(source_type or "website").strip(),
                "language": str(language or "").strip(),
                "category": str(category or "").strip(),
                "slug": slug,
                "logoUrl": logo_value if logo_value.startswith(("http://", "https://")) else default_logo,
            }
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(sources, ensure_ascii=False, indent=2)
    output_path.write_text(serialized, encoding="utf-8")
    output_path.with_suffix(".js").write_text(
        f"window.DESKA_SOURCE_CATALOG = {serialized};\n",
        encoding="utf-8",
    )
    print(json.dumps({"sources": len(sources), "output": str(output_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
