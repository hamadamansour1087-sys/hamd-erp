#!/bin/bash
cd /home/z/my-project
time ffmpeg -nostdin -y -v error -i assets-video/frames/v1/01-landing.png \
  -vf "scale=2880:1620,zoompan=z='min(zoom+0.000298,1.07)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=168:s=1920x1080:fps=30,fade=t=in:st=0:d=0.35,fade=t=out:st=5.24:d=0.35,format=yuv420p" \
  -frames:v 168 -c:v libx264 -preset veryfast -crf 21 /tmp/seg-test.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/seg-test.mp4
