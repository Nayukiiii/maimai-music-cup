#!/usr/bin/env python3
"""
Extract local JP package jacket previews and short audio previews from a manifest.

Jackets require UnityPy + Pillow:
  py -3 -m pip install UnityPy pillow

Audio previews require vgmstream-cli and ffmpeg in PATH.

This script is for local asset preparation. Only publish assets if you have the
rights to do so.
"""

from __future__ import annotations

import argparse
import csv
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract JP package jackets and 30s audio previews.")
    parser.add_argument("package_root", help="Game package folder, e.g. D:\\gal\\SDEZ1.66\\Package")
    parser.add_argument("--manifest", default="jp_assets_manifest.csv")
    parser.add_argument("--site-root", default=".", help="maimai-music-cup repo root. Default: current directory")
    parser.add_argument("--skip-jackets", action="store_true")
    parser.add_argument("--skip-previews", action="store_true")
    parser.add_argument("--jacket-limit", type=int, default=0)
    parser.add_argument("--preview-limit", type=int, default=0)
    parser.add_argument("--preview-start", type=float, default=30.0)
    parser.add_argument("--preview-duration", type=float, default=30.0)
    parser.add_argument("--preview-bitrate", default="96k")
    parser.add_argument("--jacket-max-size", type=int, default=0, help="Resize jackets so the longest side is at most this size.")
    parser.add_argument("--jacket-quality", type=int, default=86, help="JPEG/WebP quality. Default: 86")
    parser.add_argument("--vgmstream", default="vgmstream-cli")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    package_root = Path(args.package_root).expanduser().resolve()
    site_root = Path(args.site_root).expanduser().resolve()
    rows = read_manifest(Path(args.manifest))

    if not package_root.is_dir():
        print(f"找不到 Package 目录：{package_root}", file=sys.stderr)
        return 1
    if not rows:
        print(f"manifest 为空或不存在：{args.manifest}", file=sys.stderr)
        return 1

    if not args.skip_jackets:
        extract_jackets(package_root, site_root, rows, args)
    if not args.skip_previews:
        extract_previews(package_root, site_root, rows, args)

    print("完成。")
    return 0


def read_manifest(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def extract_jackets(package_root: Path, site_root: Path, rows: list[dict[str, str]], args: argparse.Namespace) -> None:
    try:
        import UnityPy  # type: ignore
    except ImportError:
        print("跳过封面：缺少 UnityPy。安装：py -3 -m pip install UnityPy pillow", file=sys.stderr)
        return

    unique = unique_by(rows, "assetId")
    if args.jacket_limit:
        unique = unique[: args.jacket_limit]

    done = skipped = failed = 0
    for row in unique:
        bundle_rel = row.get("jacketBundle") or row.get("jacketSmallBundle")
        out_web = row.get("expectedJacketPng")
        if not bundle_rel or not out_web:
            skipped += 1
            continue
        bundle = package_root / bundle_rel
        output = web_path_to_file(site_root, out_web)
        if output.exists() and not args.force:
            skipped += 1
            continue
        output.parent.mkdir(parents=True, exist_ok=True)
        try:
            export_first_texture(UnityPy, bundle, output, args.jacket_max_size, args.jacket_quality)
            done += 1
            print(f"封面 {row['assetId']} -> {output}")
        except Exception as exc:
            failed += 1
            print(f"封面失败 {bundle}: {exc}", file=sys.stderr)

    print(f"封面：导出 {done}，跳过 {skipped}，失败 {failed}")


def export_first_texture(UnityPy: Any, bundle: Path, output: Path, max_size: int, quality: int) -> None:
    env = UnityPy.load(str(bundle))
    candidates = []
    for obj in env.objects:
        if obj.type.name not in {"Texture2D", "Sprite"}:
            continue
        data = obj.read()
        image = getattr(data, "image", None)
        if image is not None:
            width = getattr(image, "width", 0)
            height = getattr(image, "height", 0)
            candidates.append((width * height, image))
    if not candidates:
        raise RuntimeError("AssetBundle 中没有可导出的 Texture2D/Sprite")
    _, image = max(candidates, key=lambda item: item[0])
    if max_size > 0:
        image.thumbnail((max_size, max_size))
    save_kwargs: dict[str, Any] = {}
    suffix = output.suffix.lower()
    if suffix in {".jpg", ".jpeg", ".webp"}:
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA")
        save_kwargs["quality"] = max(1, min(100, int(quality)))
        if suffix == ".webp":
            save_kwargs["method"] = 6
    image.save(output, **save_kwargs)


def extract_previews(package_root: Path, site_root: Path, rows: list[dict[str, str]], args: argparse.Namespace) -> None:
    if not shutil.which(args.vgmstream):
        print(f"跳过音频：找不到 {args.vgmstream}。请安装 vgmstream-cli 并加入 PATH。", file=sys.stderr)
        return
    if not shutil.which(args.ffmpeg):
        print(f"跳过音频：找不到 {args.ffmpeg}。请安装 ffmpeg 并加入 PATH。", file=sys.stderr)
        return

    unique = unique_by(rows, "assetId")
    if args.preview_limit:
        unique = unique[: args.preview_limit]

    done = skipped = failed = 0
    for row in unique:
        source_rel = row.get("audioAwb") or row.get("audioAcb")
        out_web = row.get("expectedPreviewMp3")
        if not source_rel or not out_web:
            skipped += 1
            continue
        source = package_root / source_rel
        output = web_path_to_file(site_root, out_web)
        if output.exists() and not args.force:
            skipped += 1
            continue
        output.parent.mkdir(parents=True, exist_ok=True)
        try:
            export_preview(args, source, output)
            done += 1
            print(f"预览 {row['assetId']} -> {output}")
        except Exception as exc:
            failed += 1
            print(f"音频失败 {source}: {exc}", file=sys.stderr)

    print(f"音频：导出 {done}，跳过 {skipped}，失败 {failed}")


def export_preview(args: argparse.Namespace, source: Path, output: Path) -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        wav = Path(tmpdir) / "preview-source.wav"
        run([args.vgmstream, "-o", str(wav), str(source)])
        run([
            args.ffmpeg,
            "-y",
            "-ss",
            str(args.preview_start),
            "-t",
            str(args.preview_duration),
            "-i",
            str(wav),
            "-c:a",
            "libmp3lame",
            "-b:a",
            args.preview_bitrate,
            str(output),
        ])


def run(command: list[str]) -> None:
    process = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if process.returncode != 0:
        stderr = process.stderr.strip() or process.stdout.strip()
        raise RuntimeError(stderr[-1000:])


def unique_by(rows: list[dict[str, str]], key: str) -> list[dict[str, str]]:
    seen = set()
    output = []
    for row in rows:
        value = row.get(key)
        if not value or value in seen:
            continue
        seen.add(value)
        output.append(row)
    return output


def web_path_to_file(site_root: Path, web_path: str) -> Path:
    clean = web_path.lstrip("/")
    return site_root / "public" / clean


if __name__ == "__main__":
    raise SystemExit(main())
