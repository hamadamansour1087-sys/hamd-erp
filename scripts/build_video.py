#!/usr/bin/env python3
"""Assemble tutorial video: frame PNGs + caption overlays + music → MP4.

Timeline spec JSON:
{
 "out": "download/videos/01-....mp4",
 "w": 1920, "h": 1080,
 "music": "assets-video/music/loop.wav",
 "segments": [
   {"png": "path.png", "dur": 5.0, "zoom": "in", "cap": "caps/v1/s1.png"},
   {"png": "caps/v1/title.png", "dur": 3.6}     # card (no zoom, no cap)
 ]
}
Segment = still frame with slow Ken-Zoom; optional lower-third caption PNG
(composited at bottom-center, fade-in). Cards are full-frame stills.
"""
import json
import subprocess
import sys
import os
import shutil

FPS = 30


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print('CMD FAILED:', ' '.join(cmd)[:300])
        print(r.stderr[-1500:])
        sys.exit(1)


def build(seg_idx, seg, tmp, W, H):
    out = os.path.join(tmp, f'seg{seg_idx:03d}.mp4')
    dur = float(seg['dur'])
    zoom = seg.get('zoom', 'none')
    cap = seg.get('cap')
    if zoom == 'in':
        z = "z='min(zoom+%.7f,1.07)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'" % (0.05 / (dur * FPS))
    elif zoom == 'out':
        z = "z='max(1.07-%.7f*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'" % (0.05 / (dur * FPS))
    else:
        z = "z='1.0':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
    vf = (
        f"scale={int(W * 1.5)}:{int(H * 1.5)},"
        f"zoompan={z}:d={int(dur * FPS)}:s={W}x{H}:fps={FPS},"
        "fade=t=in:st=0:d=0.35,fade=t=out:st=%.2f:d=0.35,format=yuv420p" % max(0.0, dur - 0.36)
    )
    cmd = ['ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', seg['png'], '-vf', vf,
           '-frames:v', str(int(dur * FPS)),
           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', out]
    if cap:
        # overlay caption at bottom-center with slight fade-in
        cap_in = os.path.join(tmp, f'cap{seg_idx:03d}.png')
        shutil.copy(cap, cap_in)
        vf2 = (
            f"[0:v]scale={int(W * 1.5)}:{int(H * 1.5)},zoompan={z}:d={int(dur * FPS)}:s={W}x{H}:fps={FPS}[bg];"
            f"[1:v]format=rgba,fade=t=in:st=0.15:d=0.4:alpha=1[cap];"
            f"[bg][cap]overlay=(W-w)/2:H-h-36,"
            "fade=t=in:st=0:d=0.35,fade=t=out:st=%.2f:d=0.35,format=yuv420p" % max(0.0, dur - 0.36)
        )
        cmd = ['ffmpeg', '-nostdin', '-y', '-v', 'error', '-loop', '1', '-i', seg['png'], '-loop', '1', '-t', str(dur),
               '-i', cap_in, '-filter_complex', vf2, '-t', str(dur), '-r', str(FPS),
               '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', out]
    run(cmd)
    return out


def main():
    spec = json.load(open(sys.argv[1], encoding='utf-8'))
    W, H = spec.get('w', 1920), spec.get('h', 1080)
    out_path = spec['out']
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    tmp = out_path + '.tmp'
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp, exist_ok=True)

    segs = [build(i, s, tmp, W, H) for i, s in enumerate(spec['segments'])]

    concat_list = os.path.join(tmp, 'list.txt')
    with open(concat_list, 'w') as f:
        for s in segs:
            f.write(f"file '{os.path.abspath(s)}'\n")
    joined = os.path.join(tmp, 'joined.mp4')
    run(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', concat_list,
         '-c', 'copy', joined])
    total = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                  '-of', 'csv=p=0', joined], capture_output=True, text=True).stdout.strip())

    music = spec['music']
    mdb = spec.get('music_db', -13)
    run(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', joined,
         '-stream_loop', '-1', '-i', music,
         '-filter_complex', f"[1:a]volume={mdb}dB,afade=t=in:st=0:d=1.5,afade=t=out:st={total - 3:.2f}:d=3,atrim=0:{total:.2f}[a]",
         '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
         '-movflags', '+faststart', '-shortest', out_path])
    shutil.rmtree(tmp, ignore_errors=True)
    size = os.path.getsize(out_path) / 1e6
    print(f"DONE {out_path} — {total:.1f}s, {size:.1f}MB")


if __name__ == '__main__':
    main()
