#!/bin/bash
# Generate lightweight poster JPGs for every tutorial video (frame @ ~15% in).
# Videos live in public/videos/*.mp4 → posters in public/videos/posters/<name>.jpg
set -e
cd /home/z/my-project
mkdir -p public/videos/posters
for f in public/videos/*.mp4; do
  name="$(basename "$f" .mp4)"
  out="public/videos/posters/${name}.jpg"
  [ -f "$out" ] && { echo "skip $name (exists)"; continue; }
  # Probe duration, pick frame at 15% (fallback 3s if probe fails)
  dur=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$f" 2>/dev/null || echo 0)
  at=$(python3 -c "print(f'{max(3.0, float('${dur:-0}') * 0.15):.2f}')")
  ffmpeg -nostdin -y -ss "$at" -i "$f" -frames:v 1 -vf "scale=854:-2" -q:v 5 "$out" 2>/dev/null
  echo "ok $name @${at}s -> $(du -h "$out" | cut -f1)"
done
echo "--- total ---"; du -sh public/videos/posters
