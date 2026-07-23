#!/usr/bin/env python3
"""
Import readable maimai JP package metadata into the app's Song[] JSON shape.

This reads Music.xml and .ma2 filenames from a local game package. It also emits
asset manifests that point at matching jacket AssetBundles and CRIWARE audio
containers, but it does not decrypt, unpack, decode, or publish assets.
"""

from __future__ import annotations

import argparse
import collections
import csv
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


DIFFICULTIES = ["Basic", "Advanced", "Expert", "Master", "Re:Master"]
CHART_SUFFIXES = {
    "00": "Basic",
    "01": "Advanced",
    "02": "Expert",
    "03": "Master",
    "04": "Re:Master",
}
VERSION_MAJOR_TITLES = [
    (10000, "maimai"),
    (11000, "maimai PLUS"),
    (12000, "GreeN"),
    (13000, "GreeN PLUS"),
    (14000, "ORANGE"),
    (15000, "ORANGE PLUS"),
    (16000, "PiNK"),
    (17000, "PiNK PLUS"),
    (18000, "MURASAKi"),
    (18500, "MURASAKi PLUS"),
    (19000, "MiLK"),
    (19500, "MiLK PLUS"),
    (19900, "FiNALE"),
    (20000, "maimai DX"),
    (20500, "maimai DX PLUS"),
    (21000, "Splash"),
    (21500, "Splash PLUS"),
    (22000, "UNiVERSE"),
    (22500, "UNiVERSE PLUS"),
    (23000, "FESTiVAL"),
    (23500, "FESTiVAL PLUS"),
    (24000, "BUDDiES"),
    (24500, "BUDDiES PLUS"),
    (25000, "PRiSM"),
    (25500, "PRiSM PLUS"),
    (26000, "CiRCLE"),
    (26500, "CiRCLE PLUS"),
]
VERSION_DISPLAY_ALIASES = {
    "maimaiPLUS": "maimai PLUS",
    "GreeNPLUS": "GreeN PLUS",
    "ORANGEPLUS": "ORANGE PLUS",
    "PiNKPLUS": "PiNK PLUS",
    "maimaDX": "maimai DX",
    "maimaDXPLUS": "maimai DX PLUS",
    "MiLKPLUS": "MiLK PLUS",
    "MURASAKiPLUS": "MURASAKi PLUS",
    "SplashPLUS": "Splash PLUS",
    "UNiVERSEPLUS": "UNiVERSE PLUS",
    "FESTiVALPLUS": "FESTiVAL PLUS",
    "BUDDiESPLUS": "BUDDiES PLUS",
    "PRiSMPLUS": "PRiSM PLUS",
    "CiRCLEPLUS": "CiRCLE PLUS",
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Import JP package Music.xml data for maimai-music-cup.")
    parser.add_argument("package_root", help="Game package folder, e.g. D:\\gal\\SDEZ1.66\\Package")
    parser.add_argument("--out-json", default="src/data/importedSongs.json")
    parser.add_argument("--manifest", default="jp_assets_manifest.csv")
    parser.add_argument("--tasks", default="jp_asset_tasks.json")
    parser.add_argument("--jacket-web-dir", default="/assets/jackets/jp-db")
    parser.add_argument("--jacket-ext", default=".png", help="Generated jacket extension, e.g. .png or .webp")
    parser.add_argument("--preview-web-dir", default="/assets/previews/jp-db")
    parser.add_argument("--fallback-artist", default="maimai")
    parser.add_argument(
        "--include-preview-placeholders",
        action="store_true",
        help="Compatibility flag. previewAudio is now written by default when a matching audio container exists.",
    )
    parser.add_argument(
        "--no-preview-audio",
        action="store_true",
        help="Do not write previewAudio paths into the exported song JSON.",
    )
    parser.add_argument(
        "--keep-zero-level-charts",
        action="store_true",
        help="Keep charts whose Music.xml level is 0. By default these placeholders are removed.",
    )
    args = parser.parse_args()

    package_root = Path(args.package_root).expanduser().resolve()
    base = package_root / "Sinmai_Data" / "StreamingAssets" / "A000"
    music_root = base / "music"
    sound_root = base / "SoundData"
    jacket_root = base / "AssetBundleImages" / "jacket"
    jacket_s_root = base / "AssetBundleImages" / "jacket_s"
    version_map = load_music_version_map(base)

    if not music_root.is_dir():
        print(f"找不到曲库目录：{music_root}", file=sys.stderr)
        return 1

    songs: list[dict[str, Any]] = []
    manifest_rows: list[dict[str, str]] = []
    warnings: list[str] = []

    for xml_path in sorted(music_root.glob("music*/Music.xml")):
        raw_id = extract_music_id(xml_path.parent.name)
        if not raw_id:
            warnings.append(f"跳过无法识别 ID 的目录：{xml_path.parent}")
            continue

        asset_id = asset_id_for(raw_id)
        try:
            chart_type = infer_chart_type(raw_id)
            parsed = parse_music_xml(xml_path, chart_type)
        except ET.ParseError as exc:
            warnings.append(f"XML 解析失败：{xml_path}：{exc}")
            continue

        ma2_paths = sorted(xml_path.parent.glob("*.ma2"))
        ma2_charts = charts_from_ma2(ma2_paths, chart_type)
        charts = merge_chart_metadata(parsed["charts"], ma2_charts) if parsed["charts"] else ma2_charts
        if not args.keep_zero_level_charts:
            charts = [chart for chart in charts if chart.get("level") != "0" and chart.get("constant") != 0]
        if not charts:
            warnings.append(f"无谱面：{xml_path.parent}")
            continue

        jacket_bundle = jacket_root / f"ui_jacket_{asset_id}.ab"
        jacket_s_bundle = jacket_s_root / f"ui_jacket_{asset_id}_s.ab"
        acb = sound_root / f"music{asset_id}.acb"
        awb = sound_root / f"music{asset_id}.awb"

        song_id = f"jp-{raw_id}"
        jacket_ext = args.jacket_ext if args.jacket_ext.startswith(".") else f".{args.jacket_ext}"
        jacket_path = f"{args.jacket_web_dir}/ui_jacket_{asset_id}{jacket_ext}"
        preview_mp3 = f"{args.preview_web_dir}/music{asset_id}.mp3"
        title = parsed["title"] or f"music{raw_id}"
        version_id = read_int(parsed["version"])
        version_title = version_title_for(parsed["version"], version_map)

        song = {
            "id": song_id,
            "rawMusicId": raw_id,
            "assetId": asset_id,
            "title": title,
            "artist": parsed["artist"] or args.fallback_artist,
            "category": parsed["category"] or "未分类",
            "version": version_title,
            "versionId": version_id,
            "jacket": jacket_path,
            "bpm": parsed["bpm"] or 0,
            "chartType": chart_type,
            "charts": charts,
        }
        if not args.no_preview_audio and (acb.exists() or awb.exists()):
            song["previewAudio"] = preview_mp3
        songs.append(song)

        manifest_rows.append({
            "songId": song_id,
            "rawMusicId": raw_id,
            "assetId": asset_id,
            "title": title,
            "artist": parsed["artist"] or args.fallback_artist,
            "category": parsed["category"] or "未分类",
            "version": version_title,
            "versionId": str(version_id or ""),
            "bpm": str(parsed["bpm"] or 0),
            "chartType": chart_type,
            "chartCount": str(len(charts)),
            "musicXml": rel(xml_path, package_root),
            "musicDir": rel(xml_path.parent, package_root),
            "jacketBundle": rel(jacket_bundle, package_root) if jacket_bundle.exists() else "",
            "jacketSmallBundle": rel(jacket_s_bundle, package_root) if jacket_s_bundle.exists() else "",
            "expectedJacketPng": jacket_path,
            "audioAcb": rel(acb, package_root) if acb.exists() else "",
            "audioAwb": rel(awb, package_root) if awb.exists() else "",
            "expectedPreviewMp3": preview_mp3,
            "ma2Files": ";".join(rel(path, package_root) for path in ma2_paths),
        })

    songs.sort(key=lambda song: natural_key(song["id"]))

    out_json = Path(args.out_json)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(songs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    write_manifest(Path(args.manifest), manifest_rows)
    Path(args.tasks).write_text(json.dumps({
        "packageRoot": str(package_root),
        "generatedSongs": len(songs),
        "jacketBundles": [row for row in manifest_rows if row["jacketBundle"]],
        "audioContainers": [row for row in manifest_rows if row["audioAcb"] or row["audioAwb"]],
        "versionMap": version_map,
        "warnings": warnings[:300],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Imported songs: {len(songs)}")
    print(f"Song JSON: {out_json}")
    print(f"Asset manifest: {Path(args.manifest).resolve()}")
    print(f"Asset tasks: {Path(args.tasks).resolve()}")
    print_designer_summary(songs)
    if warnings:
        print(f"Warnings: {len(warnings)}，前几条：")
        for warning in warnings[:12]:
            print(f"- {warning}")
    return 0


def print_designer_summary(songs: list[dict[str, Any]]) -> None:
    print("Designer summary:")
    for difficulty in DIFFICULTIES:
        values = collections.Counter(
            normalize_designer(chart.get("designer", "")) or "-"
            for song in songs
            for chart in song.get("charts", [])
            if chart.get("difficulty") == difficulty
        )
        total = sum(values.values())
        top = ", ".join(f"{name}:{count}" for name, count in values.most_common(6))
        print(f"- {difficulty}: {total} / {top}")


def parse_music_xml(path: Path, chart_type: str) -> dict[str, Any]:
    root = ET.parse(path).getroot()
    text_index = build_text_index(root)

    charts = parse_notes(root, chart_type)
    if not charts:
        charts = parse_notes_from_index(text_index, chart_type)

    return {
        "title": first_text(text_index, [
            "name/str", "musicname/str", "title/str", "title", "name",
        ]),
        "artist": first_text(text_index, [
            "artistname/str", "artist/str", "artistname", "artist",
        ]),
        "category": first_text(text_index, [
            "genrename/str", "genre/str", "category/str", "genrename", "genre", "category",
        ]),
        "version": first_text(text_index, [
            "musicversion/str", "versionname/str", "version/str", "addversion/str",
            "musicversion/id", "version/id", "addversion/id",
            "musicversion", "version", "addversion",
        ]),
        "bpm": parse_bpm(first_text(text_index, ["bpm", "bpmmax", "bpm_max"])),
        "charts": charts,
    }


def load_music_version_map(base: Path) -> dict[str, str]:
    version_root = base / "musicVersion"
    if not version_root.is_dir():
        return {}

    version_map: dict[str, str] = {}
    for xml_path in sorted(version_root.glob("MusicVersion*/MusicVersion.xml")):
        try:
            root = ET.parse(xml_path).getroot()
        except ET.ParseError:
            continue
        index = build_text_index(root)
        name = first_text(index, ["name/str", "musicversionname/str", "versionname/str", "name"])
        if not name:
            continue

        numeric_candidates = []
        for key in ["id", "version", "versionid", "musicversionid", "musicversion"]:
            for value in index.get(key, []):
                number = read_int(value)
                if number is not None:
                    numeric_candidates.append(number)

        directory_id = read_int(xml_path.parent.name)
        if directory_id is not None:
            numeric_candidates.extend([
                directory_id,
                directory_id * 1000,
                directory_id * 1000 + 10000,
            ])

        for number in numeric_candidates:
            version_map[str(number)] = name
    return version_map


def version_title_for(raw_value: str, version_map: dict[str, str]) -> str:
    raw = clean(raw_value)
    if not raw:
        return "日服"

    mapped = version_map.get(raw)
    if mapped:
        return normalize_version_title(mapped)

    number = read_int(raw)
    if number is None:
        return normalize_version_title(raw)

    if str(number) in version_map:
        return normalize_version_title(version_map[str(number)])

    title = "日服"
    for threshold, candidate in VERSION_MAJOR_TITLES:
        if number >= threshold:
            title = candidate
        else:
            break
    return title


def normalize_version_title(value: str) -> str:
    title = clean(value)
    return VERSION_DISPLAY_ALIASES.get(title, title or "日服")


def parse_notes(root: ET.Element, chart_type: str) -> list[dict[str, Any]]:
    notes = [
        node
        for node in root.iter()
        if strip_ns(node.tag).lower() in {"notes", "notesdata"}
        and has_direct_chart_fields(node)
    ]
    charts = []
    for index, node in enumerate(notes):
        local_index = read_int(find_direct_text(node, ["levelid", "difficulty", "diff"])) 
        difficulty = DIFFICULTIES[local_index] if local_index is not None and 0 <= local_index < len(DIFFICULTIES) else None
        if difficulty is None and index < len(DIFFICULTIES):
            difficulty = DIFFICULTIES[index]
        if difficulty is None:
            continue

        level_int = read_int(find_direct_text(node, ["level"]))
        level_decimal = read_int(find_direct_text(node, ["leveldecimal", "level_decimal"]))
        level_text = find_direct_text(node, ["leveltext", "level_text", "levelstr", "level_str"])
        constant = make_constant(level_int, level_decimal)
        display_level = normalize_level(level_text, level_int, level_decimal)
        if not display_level:
            display_level = "?"

        designer = normalize_designer(find_direct_text(node, ["notesdesigner/str", "designer/str", "notesdesigner", "designer"]))
        chart = {
            "difficulty": difficulty,
            "level": display_level,
            "designer": designer,
            "type": chart_type,
        }
        if constant is not None:
            chart["constant"] = constant
        charts.append(chart)

    return dedupe_charts(charts)


def parse_notes_from_index(text_index: dict[str, list[str]], chart_type: str) -> list[dict[str, Any]]:
    levels = text_index.get("level", [])
    decimals = text_index.get("leveldecimal", []) or text_index.get("level_decimal", [])
    designers = text_index.get("notesdesigner/str", []) or text_index.get("designer/str", [])
    charts = []
    for index, level in enumerate(levels[:5]):
        level_int = read_int(level)
        level_decimal = read_int(decimals[index]) if index < len(decimals) else None
        chart = {
            "difficulty": DIFFICULTIES[index],
            "level": normalize_level(level, level_int, level_decimal) or level or "?",
            "designer": normalize_designer(designers[index] if index < len(designers) else ""),
            "type": chart_type,
        }
        constant = make_constant(level_int, level_decimal)
        if constant is not None:
            chart["constant"] = constant
        charts.append(chart)
    return dedupe_charts(charts)


def charts_from_ma2(paths: list[Path], chart_type: str) -> list[dict[str, Any]]:
    charts = []
    for path in paths:
        match = re.search(r"_(\d\d)(?:_[LR])?\.ma2$", path.name, re.IGNORECASE)
        if not match:
            continue
        difficulty = CHART_SUFFIXES.get(match.group(1))
        if not difficulty:
            continue
        metadata = parse_ma2_metadata(path)
        chart = {
            "difficulty": difficulty,
            "level": metadata.get("level") or "?",
            "designer": normalize_designer(metadata.get("designer", "")),
            "type": chart_type,
        }
        if metadata.get("constant") is not None:
            chart["constant"] = metadata["constant"]
        charts.append(chart)
    return dedupe_charts(charts)


def merge_chart_metadata(primary: list[dict[str, Any]], fallback: list[dict[str, Any]]) -> list[dict[str, Any]]:
    fallback_by_difficulty = {chart.get("difficulty"): chart for chart in fallback}
    merged = []
    for chart in primary:
        ma2_chart = fallback_by_difficulty.get(chart.get("difficulty"), {})
        next_chart = dict(chart)
        if is_blank_designer(next_chart.get("designer")) and not is_blank_designer(ma2_chart.get("designer")):
            next_chart["designer"] = ma2_chart["designer"]
        if (next_chart.get("level") in {None, "", "?"}) and ma2_chart.get("level"):
            next_chart["level"] = ma2_chart["level"]
        if next_chart.get("constant") is None and ma2_chart.get("constant") is not None:
            next_chart["constant"] = ma2_chart["constant"]
        merged.append(next_chart)

    seen = {chart.get("difficulty") for chart in merged}
    merged.extend(chart for chart in fallback if chart.get("difficulty") not in seen)
    return dedupe_charts(merged)


def parse_ma2_metadata(path: Path) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    try:
        text = path.read_text(encoding="utf-8-sig", errors="ignore")
    except OSError:
        return metadata

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parts = [part.strip() for part in re.split(r"[\t,]", line) if part.strip()]
        if not parts:
            continue
        key = parts[0].lower()
        values = parts[1:]
        joined = clean(" ".join(values))
        if key in {"designer", "notesdesigner", "notes_designer", "des", "chart_designer"} and joined:
            metadata["designer"] = joined
        elif key in {"lv", "level", "leveltext", "level_text"} and values:
            metadata["level"] = normalize_level(values[0], read_int(values[0]), None) or values[0]
        elif key in {"lvdecimal", "leveldecimal", "level_decimal", "constant", "const"} and values:
            number = read_decimal(values[0])
            if number is not None:
                metadata["constant"] = number

    return metadata


def dedupe_charts(charts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    output = []
    order = {name: index for index, name in enumerate(DIFFICULTIES)}
    for chart in charts:
        difficulty = chart.get("difficulty")
        if difficulty in seen or difficulty not in order:
            continue
        seen.add(difficulty)
        output.append(chart)
    return sorted(output, key=lambda chart: order[chart["difficulty"]])


def build_text_index(root: ET.Element) -> dict[str, list[str]]:
    index: dict[str, list[str]] = {}

    def walk(node: ET.Element, parents: list[str]) -> None:
        tag = strip_ns(node.tag).lower()
        path = "/".join([*parents, tag])
        value = (node.text or "").strip()
        if value:
            index.setdefault(tag, []).append(value)
            index.setdefault(path, []).append(value)
        for child in list(node):
            walk(child, [*parents, tag])

    walk(root, [])
    # Also add suffix paths, so "notes/level" can be found even with wrappers.
    for path, values in list(index.items()):
        parts = path.split("/")
        for start in range(1, len(parts) - 1):
            index.setdefault("/".join(parts[start:]), []).extend(values)
    return index


def first_text(index: dict[str, list[str]], keys: list[str]) -> str:
    for key in keys:
        values = index.get(key.lower(), [])
        for value in values:
            if value:
                return clean(value)
    return ""


def find_deep_text(node: ET.Element, keys: list[str]) -> str:
    index = build_text_index(node)
    return first_text(index, keys)


def has_direct_chart_fields(node: ET.Element) -> bool:
    return bool(find_direct_text(node, [
        "level",
        "leveldecimal",
        "level_decimal",
        "leveltext",
        "level_text",
        "levelstr",
        "level_str",
        "notesdesigner/str",
        "designer/str",
    ]))


def find_direct_text(node: ET.Element, keys: list[str]) -> str:
    for key in keys:
        value = find_direct_path_text(node, key.lower().split("/"))
        if value:
            return clean(value)
    return ""


def find_direct_path_text(node: ET.Element, parts: list[str]) -> str:
    if not parts:
        return clean(node.text or "")

    target = parts[0]
    for child in list(node):
        tag = strip_ns(child.tag).lower()
        if tag != target:
            continue
        if len(parts) == 1:
            value = clean(child.text or "")
            if value:
                return value
            str_child = find_direct_path_text(child, ["str"])
            if str_child:
                return str_child
        else:
            value = find_direct_path_text(child, parts[1:])
            if value:
                return value
    return ""


def strip_ns(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def extract_music_id(name: str) -> str:
    match = re.search(r"music(\d+)$", name)
    return match.group(1) if match else ""


def asset_id_for(raw_id: str) -> str:
    # JP package music folders may use prefixes such as 011820/111634 while
    # jackets and SoundData use the playable low 4 digits, padded to 6.
    return f"{int(raw_id) % 10000:06d}"


def infer_chart_type(raw_id: str) -> str:
    # In the JP package, classic Standard charts normally live under 00xxxx.
    # 01xxxx and higher entries are DX-era charts or special variants that use
    # DX assets/audio numbering by the low 4 digits.
    return "standard" if raw_id.startswith("00") else "dx"


def normalize_level(level_text: str | None, level_int: int | None, level_decimal: int | None) -> str:
    text = clean(level_text or "")
    if text and text != "0":
        return text
    if level_int is None:
        return ""
    if level_decimal is not None and level_decimal >= 7:
        return f"{level_int}+"
    return str(level_int)


def make_constant(level_int: int | None, level_decimal: int | None) -> float | None:
    if level_int is None:
        return None
    if level_decimal is None:
        return float(level_int)
    return round(level_int + level_decimal / 10, 1)


def read_int(value: str | None) -> int | None:
    if value is None:
        return None
    match = re.search(r"-?\d+", str(value))
    return int(match.group(0)) if match else None


def read_decimal(value: str | None) -> float | None:
    if value is None:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", str(value))
    return round(float(match.group(0)), 1) if match else None


def parse_bpm(value: str) -> int:
    number = read_int(value)
    return number or 0


def normalize_designer(value: Any) -> str:
    designer = clean(value)
    return "" if is_blank_designer(designer) else designer


def is_blank_designer(value: Any) -> bool:
    designer = clean(value)
    return designer in {"", "-", "－", "ー", "maimaiNET"}


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def rel(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def natural_key(value: str) -> list[Any]:
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", value)]


def write_manifest(path: Path, rows: list[dict[str, str]]) -> None:
    fields = [
        "songId",
        "rawMusicId",
        "assetId",
        "title",
        "artist",
        "category",
        "version",
        "versionId",
        "bpm",
        "chartType",
        "chartCount",
        "musicXml",
        "musicDir",
        "jacketBundle",
        "jacketSmallBundle",
        "expectedJacketPng",
        "audioAcb",
        "audioAwb",
        "expectedPreviewMp3",
        "ma2Files",
    ]
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    raise SystemExit(main())
