# README GIF

Records the top-of-README GIF against the actual built demo (see CLAUDE.md
"5. Make it visible in 30 seconds"). Not part of `npm run test:e2e` — this
is a recording, not a check.

```bash
npm run demo:data && npm run build:demo
npx playwright test --config=playwright.gif.config.ts
```

That writes a `.webm` under `test-results/`. Convert it to a GIF:

```bash
# Playwright's own bundled ffmpeg (~/Library/Caches/ms-playwright/ffmpeg-*/ffmpeg-mac)
# can trim/scale but this build has no gif muxer -- extract PNG frames instead:
ffmpeg -y -ss 2.3 -t 14 -i test-results/.../video.webm -r 10 -vf "scale=800:-1" /tmp/gif-frames/frame_%04d.png

# then assemble with Pillow (pip install Pillow -- not a project dependency,
# tooling only, not added to requirements.txt):
python3 -c "
from PIL import Image
import glob
frames = sorted(glob.glob('/tmp/gif-frames/frame_*.png'))
imgs = [Image.open(f).convert('RGB') for f in frames]
base = imgs[0].quantize(colors=128, method=Image.MEDIANCUT)
quantized = [im.quantize(palette=base, dither=Image.FLOYDSTEINBERG) for im in imgs]
quantized[0].save('design/replay-crossover.gif', save_all=True, append_images=quantized[1:], duration=100, loop=0, optimize=True)
"
```

`-ss 2.3` skips past the metric-select interaction at the start of the spec
(clicking the dropdown open and choosing "xG" takes about that long) so the
GIF doesn't open on a one-frame flash of the still-selected "Points" metric.
