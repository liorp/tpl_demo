#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import os
import tempfile
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Seed next zoom level from existing parent tiles.",
  )
  parser.add_argument(
    "--tiles-root",
    default="frontend/public/tiles",
    help="Tile root directory containing {z}/{x}/{y}.png files.",
  )
  parser.add_argument(
    "--source-template",
    default="https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    help="HTTP URL template used to fetch missing tiles.",
  )
  parser.add_argument(
    "--from-zoom",
    type=int,
    required=True,
    help="Existing zoom level used as the parent set.",
  )
  parser.add_argument(
    "--to-zoom",
    type=int,
    required=True,
    help="Target zoom level to fetch.",
  )
  parser.add_argument(
    "--workers",
    type=int,
    default=16,
    help="Parallel fetch workers.",
  )
  parser.add_argument(
    "--timeout-seconds",
    type=float,
    default=15.0,
    help="HTTP timeout in seconds.",
  )
  parser.add_argument(
    "--max-retries",
    type=int,
    default=3,
    help="Maximum retries per tile.",
  )
  return parser.parse_args()


def collect_parent_tiles(root: Path, zoom: int) -> list[tuple[int, int]]:
  zoom_dir = root / str(zoom)
  if not zoom_dir.exists():
    return []

  parents: list[tuple[int, int]] = []
  for x_dir in zoom_dir.iterdir():
    if not x_dir.is_dir():
      continue
    try:
      x = int(x_dir.name)
    except ValueError:
      continue
    for y_file in x_dir.glob("*.png"):
      try:
        y = int(y_file.stem)
      except ValueError:
        continue
      parents.append((x, y))
  return parents


def iter_child_tiles(parents: list[tuple[int, int]]) -> list[tuple[int, int]]:
  children: list[tuple[int, int]] = []
  for x, y in parents:
    children.extend(
      [
        (x * 2, y * 2),
        (x * 2 + 1, y * 2),
        (x * 2, y * 2 + 1),
        (x * 2 + 1, y * 2 + 1),
      ],
    )
  return children


def fetch_one(
  *,
  root: Path,
  zoom: int,
  x: int,
  y: int,
  template: str,
  timeout_seconds: float,
  max_retries: int,
) -> tuple[str, str]:
  dest = root / str(zoom) / str(x) / f"{y}.png"
  if dest.exists():
    return ("skipped", f"{zoom}/{x}/{y}")

  url = template.format(z=zoom, x=x, y=y)
  dest.parent.mkdir(parents=True, exist_ok=True)

  attempt = 0
  while attempt <= max_retries:
    attempt += 1
    req = urllib.request.Request(
      url,
      headers={
        "User-Agent": "tpl_demo_offline_tile_seed/1.0 (local development)",
      },
    )
    try:
      with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
        if response.status != 200:
          raise urllib.error.HTTPError(
            url=url,
            code=response.status,
            msg="non-200 response",
            hdrs=response.headers,
            fp=None,
          )
        data = response.read()
      if not data:
        raise RuntimeError("empty response body")
      with tempfile.NamedTemporaryFile(
        dir=str(dest.parent),
        delete=False,
        prefix=f"{y}.",
        suffix=".tmp",
      ) as tmp:
        tmp.write(data)
        tmp_name = tmp.name
      os.replace(tmp_name, dest)
      return ("downloaded", f"{zoom}/{x}/{y}")
    except Exception:
      if attempt > max_retries:
        return ("failed", f"{zoom}/{x}/{y}")
      time.sleep(min(2.0, 0.25 * math.pow(2, attempt)))
  return ("failed", f"{zoom}/{x}/{y}")


def count_tiles(root: Path) -> int:
  return sum(1 for _ in root.glob("*/*/*.png"))


def update_manifest(root: Path, min_zoom: int, max_zoom: int, source_template: str) -> None:
  manifest_path = root / "manifest.json"
  if not manifest_path.exists():
    return

  payload = json.loads(manifest_path.read_text(encoding="utf-8"))
  payload["min_zoom"] = min_zoom
  payload["max_zoom"] = max_zoom
  payload["tile_count"] = count_tiles(root)
  payload["source"] = source_template
  payload["generated_at_unix"] = int(time.time())
  manifest_path.write_text(f"{json.dumps(payload, indent=2)}\n", encoding="utf-8")


def main() -> int:
  args = parse_args()
  root = Path(args.tiles_root)

  if args.to_zoom != args.from_zoom + 1:
    raise ValueError("--to-zoom must be exactly --from-zoom + 1")

  parents = collect_parent_tiles(root, args.from_zoom)
  if not parents:
    raise RuntimeError(f"No parent tiles found at zoom {args.from_zoom}")

  children = iter_child_tiles(parents)
  total = len(children)
  print(f"Parent tiles at z{args.from_zoom}: {len(parents)}")
  print(f"Candidate child tiles at z{args.to_zoom}: {total}")

  counters = {"downloaded": 0, "skipped": 0, "failed": 0}
  lock = threading.Lock()

  with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
    futures = [
      pool.submit(
        fetch_one,
        root=root,
        zoom=args.to_zoom,
        x=x,
        y=y,
        template=args.source_template,
        timeout_seconds=args.timeout_seconds,
        max_retries=args.max_retries,
      )
      for x, y in children
    ]

    completed = 0
    for future in as_completed(futures):
      status, _ = future.result()
      with lock:
        counters[status] += 1
      completed += 1
      if completed % 2000 == 0 or completed == total:
        print(
          f"Progress: {completed}/{total} "
          f"(downloaded={counters['downloaded']} skipped={counters['skipped']} failed={counters['failed']})",
        )

  if counters["failed"] > 0:
    print(f"Seeding completed with failures: {counters['failed']} tiles")
  else:
    print("Seeding completed with no failures")

  manifest_path = root / "manifest.json"
  if manifest_path.exists():
    current = json.loads(manifest_path.read_text(encoding="utf-8"))
    min_zoom = int(current.get("min_zoom", args.from_zoom))
    update_manifest(
      root=root,
      min_zoom=min(min_zoom, args.from_zoom),
      max_zoom=max(args.to_zoom, int(current.get("max_zoom", args.to_zoom))),
      source_template=args.source_template,
    )
    print("Manifest updated")

  return 0


if __name__ == "__main__":
  raise SystemExit(main())
