#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate private small jacket thumbnails for the maimai cup site.")
    parser.add_argument("--source", default="deploy/private-assets/assets/jackets/jp-db")
    parser.add_argument("--output", default="deploy/private-assets/assets/jackets-sm/jp-db")
    parser.add_argument("--size", type=int, default=192)
    parser.add_argument("--quality", type=int, default=72)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero when any thumbnail fails.")
    args = parser.parse_args()

    try:
        from PIL import Image
    except Exception as exc:  # pragma: no cover - depends on host package
        print(f"找不到 Pillow/PIL，跳过缩略图生成：{exc}", file=sys.stderr)
        return 0

    source = Path(args.source)
    output = Path(args.output)
    if not source.exists():
        print(f"缩略图源目录不存在，跳过：{source}")
        return 0

    output.mkdir(parents=True, exist_ok=True)
    output.chmod(0o755)
    files = sorted([path for path in source.iterdir() if path.suffix.lower() in {".webp", ".png", ".jpg", ".jpeg"}])
    exported = 0
    skipped = 0
    failed = 0

    for src in files:
        dst = output / f"{src.stem}.webp"
        if not args.force and dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            skipped += 1
            continue
        try:
            with Image.open(src) as image:
                image = image.convert("RGB")
                image.thumbnail((args.size, args.size))
                canvas = Image.new("RGB", (args.size, args.size), (20, 8, 16))
                x = (args.size - image.width) // 2
                y = (args.size - image.height) // 2
                canvas.paste(image, (x, y))
                canvas.save(dst, "WEBP", quality=args.quality, method=6)
            dst.chmod(0o644)
            exported += 1
        except Exception as exc:  # pragma: no cover - data dependent
            failed += 1
            print(f"缩略图失败 {src}: {exc}", file=sys.stderr)

    print(f"缩略图：导出 {exported}，跳过 {skipped}，失败 {failed}，输出 {output}")
    return 1 if args.strict and failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
