#!/usr/bin/env python3
"""
Scan a local maimai game package folder and produce shareable metadata reports.

This script only reads filenames, file sizes, timestamps, small file headers, and
small text samples for likely metadata files. It does not decrypt, unpack, or
modify game files.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tga", ".dds", ".ktx", ".ktx2", ".pvr"}
AUDIO_EXTS = {".wav", ".ogg", ".mp3", ".m4a", ".aac", ".flac", ".acb", ".awb", ".adx", ".hca"}
TEXT_EXTS = {".json", ".xml", ".csv", ".tsv", ".txt", ".ini", ".yaml", ".yml", ".toml", ".conf", ".cfg"}
PACKAGE_EXTS = {
    ".dat",
    ".bin",
    ".pak",
    ".arc",
    ".bundle",
    ".assets",
    ".resource",
    ".res",
    ".zip",
    ".7z",
    ".rar",
}

METADATA_WORDS = [
    "music",
    "song",
    "楽曲",
    "title",
    "artist",
    "genre",
    "category",
    "version",
    "bpm",
    "level",
    "difficulty",
    "designer",
    "notes",
    "chart",
    "jacket",
    "thumbnail",
    "cue",
    "audio",
]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Scan a local game package and output full inventory reports.",
    )
    parser.add_argument("root", help="Game package folder, e.g. D:\\gal\\SDEZ1.66\\Package")
    parser.add_argument(
        "-o",
        "--out",
        default="game-package-scan",
        help="Output directory. Default: game-package-scan",
    )
    parser.add_argument(
        "--text-sample-bytes",
        type=int,
        default=4096,
        help="Max UTF-8 text sample bytes for likely metadata files. Default: 4096",
    )
    parser.add_argument(
        "--hash-bytes",
        type=int,
        default=65536,
        help="Bytes used for sha1_head fingerprint. Default: 65536",
    )
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        print(f"目录不存在或不是文件夹：{root}", file=sys.stderr)
        return 1

    out_dir = Path(args.out).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    rows: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    print(f"Scanning: {root}")
    for dirpath, _, filenames in os.walk(root):
      for filename in filenames:
        path = Path(dirpath) / filename
        try:
            rows.append(describe_file(root, path, args.hash_bytes, args.text_sample_bytes))
        except OSError as exc:
            errors.append({"path": str(path), "error": str(exc)})

    rows.sort(key=lambda item: item["path"].lower())

    write_all_files_csv(out_dir / "all_files.csv", rows)
    write_candidates_csv(out_dir / "candidates.csv", rows)
    write_tree_txt(out_dir / "directory_tree.txt", rows)
    write_text_samples_json(out_dir / "text_samples.json", rows)
    write_summary_json(out_dir / "summary.json", root, rows, errors)
    write_readme(out_dir / "README.txt", root, rows, errors)

    print("")
    print(f"Files: {len(rows)}")
    print(f"Total size: {format_bytes(sum(int(row['size']) for row in rows))}")
    print(f"Output: {out_dir}")
    print("")
    print("请把这个目录里的这些文件发给我：")
    print(f"- {out_dir / 'summary.json'}")
    print(f"- {out_dir / 'candidates.csv'}")
    print(f"- {out_dir / 'directory_tree.txt'}")
    print("")
    print("如果我需要全量细节，再发：")
    print(f"- {out_dir / 'all_files.csv'}")
    print(f"- {out_dir / 'text_samples.json'}")
    return 0


def describe_file(root: Path, path: Path, hash_bytes: int, sample_bytes: int) -> dict[str, Any]:
    stat = path.stat()
    rel = path.relative_to(root).as_posix()
    ext = path.suffix.lower() or "(no ext)"
    lower = rel.lower()
    header = read_head(path, max(hash_bytes, sample_bytes, 512))
    magic_hex = header[:32].hex(" ")
    kind = classify(ext, header, lower)
    hints = metadata_hints(lower, header)
    score = candidate_score(kind, lower, hints, stat.st_size)

    row: dict[str, Any] = {
        "path": rel,
        "directory": str(Path(rel).parent).replace("\\", "/"),
        "name": path.name,
        "stem": path.stem,
        "ext": ext,
        "kind": kind,
        "size": stat.st_size,
        "size_text": format_bytes(stat.st_size),
        "mtime": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        "magic_hex": magic_hex,
        "sha1_head": hashlib.sha1(header[:hash_bytes]).hexdigest()[:20],
        "score": score,
        "hints": ";".join(hints),
    }

    if kind in {"metadata", "maybe-metadata"}:
        row["text_sample"] = decode_text_sample(header[:sample_bytes])
    else:
        row["text_sample"] = ""

    return row


def classify(ext: str, header: bytes, lower_path: str) -> str:
    if ext in IMAGE_EXTS or looks_like_image(header):
        return "image"
    if ext in AUDIO_EXTS or looks_like_audio(header):
        return "audio"
    if ext in TEXT_EXTS:
        return "metadata"
    if ext in PACKAGE_EXTS:
        return "package"
    if any(word in lower_path for word in ["music", "song", "jacket", "cue", "chart", "level"]):
        return "maybe-metadata"
    return "other"


def looks_like_image(header: bytes) -> bool:
    return (
        header.startswith(b"\x89PNG\r\n\x1a\n")
        or header.startswith(b"\xff\xd8\xff")
        or header.startswith(b"RIFF") and header[8:12] == b"WEBP"
        or header.startswith(b"BM")
    )


def looks_like_audio(header: bytes) -> bool:
    return (
        header.startswith(b"RIFF") and header[8:12] == b"WAVE"
        or header.startswith(b"OggS")
        or header.startswith(b"ID3")
        or header.startswith(b"@UTF")
        or header.startswith(b"AFS2")
        or header.startswith(b"HCA")
    )


def metadata_hints(lower_path: str, header: bytes) -> list[str]:
    text = decode_text_sample(header).lower()
    haystack = f"{lower_path}\n{text}"
    return sorted({word for word in METADATA_WORDS if word.lower() in haystack})


def candidate_score(kind: str, lower_path: str, hints: list[str], size: int) -> int:
    score = len(hints) * 10
    if kind == "metadata":
        score += 50
    elif kind == "maybe-metadata":
        score += 25
    elif kind == "image":
        score += 20
    elif kind == "audio":
        score += 20
    elif kind == "package":
        score += 10

    for word in ["music", "song", "jacket", "thumbnail", "cue", "chart", "level", "sound"]:
        if word in lower_path:
            score += 12
    if 4 * 1024 <= size <= 50 * 1024 * 1024:
        score += 5
    return score


def read_head(path: Path, limit: int) -> bytes:
    with path.open("rb") as handle:
        return handle.read(limit)


def decode_text_sample(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp932", "shift_jis", "utf-16"):
        try:
            text = data.decode(encoding)
            return text.replace("\x00", "").replace("\r\n", "\n").strip()[:3000]
        except UnicodeDecodeError:
            continue
    return ""


def write_all_files_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = [
        "path",
        "directory",
        "name",
        "stem",
        "ext",
        "kind",
        "size",
        "size_text",
        "mtime",
        "magic_hex",
        "sha1_head",
        "score",
        "hints",
    ]
    write_csv(path, rows, fields)


def write_candidates_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    candidates = [
        row
        for row in rows
        if row["kind"] in {"metadata", "maybe-metadata", "image", "audio", "package"} or int(row["score"]) >= 30
    ]
    candidates.sort(key=lambda row: (-int(row["score"]), row["kind"], -int(row["size"]), row["path"]))
    fields = [
        "path",
        "kind",
        "size",
        "size_text",
        "ext",
        "score",
        "hints",
        "magic_hex",
        "sha1_head",
    ]
    write_csv(path, candidates, fields)


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_tree_txt(path: Path, rows: list[dict[str, Any]]) -> None:
    stats: dict[str, dict[str, int]] = defaultdict(lambda: {"files": 0, "bytes": 0})
    for row in rows:
        parts = Path(row["path"]).parts
        for depth in range(0, len(parts)):
            directory = "/".join(parts[:depth]) or "."
            stats[directory]["files"] += 1
            stats[directory]["bytes"] += int(row["size"])

    lines = []
    for directory, value in sorted(stats.items()):
        depth = 0 if directory == "." else directory.count("/") + 1
        indent = "  " * depth
        lines.append(f"{indent}{directory}  files={value['files']}  size={format_bytes(value['bytes'])}")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_text_samples_json(path: Path, rows: list[dict[str, Any]]) -> None:
    samples = [
        {
            "path": row["path"],
            "kind": row["kind"],
            "size": row["size"],
            "hints": row["hints"],
            "sample": row["text_sample"],
        }
        for row in rows
        if row.get("text_sample")
    ]
    samples.sort(key=lambda row: (-len(row["sample"]), row["path"]))
    path.write_text(json.dumps(samples[:300], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_summary_json(path: Path, root: Path, rows: list[dict[str, Any]], errors: list[dict[str, str]]) -> None:
    ext_stats = Counter(row["ext"] for row in rows)
    kind_stats = Counter(row["kind"] for row in rows)
    dir_stats: dict[str, dict[str, int]] = defaultdict(lambda: {"files": 0, "bytes": 0})
    for row in rows:
        top_dir = row["path"].split("/", 1)[0]
        dir_stats[top_dir]["files"] += 1
        dir_stats[top_dir]["bytes"] += int(row["size"])

    def top_rows(kind: str, limit: int = 80) -> list[dict[str, Any]]:
        selected = [row for row in rows if row["kind"] == kind]
        selected.sort(key=lambda row: (-int(row["score"]), -int(row["size"]), row["path"]))
        return [compact_row(row) for row in selected[:limit]]

    summary = {
        "scannedAt": datetime.now(timezone.utc).isoformat(),
        "root": str(root),
        "totals": {
            "files": len(rows),
            "bytes": sum(int(row["size"]) for row in rows),
            "sizeText": format_bytes(sum(int(row["size"]) for row in rows)),
            "errors": len(errors),
        },
        "kindStats": dict(kind_stats.most_common()),
        "extensionStats": [{"ext": ext, "count": count} for ext, count in ext_stats.most_common(120)],
        "topDirectories": [
            {"directory": key, **value, "sizeText": format_bytes(value["bytes"])}
            for key, value in sorted(dir_stats.items(), key=lambda item: item[1]["bytes"], reverse=True)[:120]
        ],
        "candidates": {
            "metadata": top_rows("metadata"),
            "maybeMetadata": top_rows("maybe-metadata"),
            "images": top_rows("image"),
            "audio": top_rows("audio"),
            "packages": top_rows("package"),
        },
        "errors": errors[:200],
    }
    path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def compact_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "path": row["path"],
        "size": row["size"],
        "sizeText": row["size_text"],
        "ext": row["ext"],
        "score": row["score"],
        "hints": row["hints"],
        "magicHex": row["magic_hex"],
        "sha1Head": row["sha1_head"],
    }


def write_readme(path: Path, root: Path, rows: list[dict[str, Any]], errors: list[dict[str, str]]) -> None:
    total_size = sum(int(row["size"]) for row in rows)
    content = f"""Game Package Scan

Root:
{root}

Files:
{len(rows)}

Total size:
{format_bytes(total_size)}

Errors:
{len(errors)}

Files to send first:
- summary.json
- candidates.csv
- directory_tree.txt

Send these only if requested:
- all_files.csv
- text_samples.json

Note:
This scan contains metadata only: paths, sizes, timestamps, small headers, and
small text samples from likely metadata files. It does not include full images,
audio, packages, decrypted data, or modified game files.
"""
    path.write_text(content, encoding="utf-8")


def format_bytes(size: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    value = float(size)
    index = 0
    while value >= 1024 and index < len(units) - 1:
        value /= 1024
        index += 1
    return f"{value:.0f} {units[index]}" if index == 0 else f"{value:.1f} {units[index]}"


if __name__ == "__main__":
    raise SystemExit(main())
