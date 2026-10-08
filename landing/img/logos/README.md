# Institution and sponsor logos

Ten of the eleven marks are in place, supplied by the team. The eleventh is not:

| File | Organisation | Status |
| --- | --- | --- |
| `einstein.png` | Albert Einstein College of Medicine | in |
| `montefiore.svg` | Montefiore | in (vector) |
| `ascrs-foundation.png` | ASCRS Foundation | in |
| `allergan-foundation.png` | The Allergan Foundation | in |
| `duke.png` | Duke Medicine | in |
| `nyu-langone.png` | NYU Langone School of Medicine | in |
| `weill-cornell.png` | Weill Cornell Medicine | in |
| `ucsf.svg` | UCSF | in (vector) |
| `toronto.png` | University of Toronto | in |
| `bascom-palmer.png` | Bascom Palmer Eye Institute | in |
| `houston-methodist.svg` | Houston Methodist | **missing** |

Until a file exists the browser falls back to the `alt` text, which `.logo img`
styles as a wordmark — a missing logo reads as a name, not as a broken image.

## How they were standardised

The originals are in `_raw/`, exactly as supplied: SVG, PNG, JPEG and WEBP, from
220px to 2300px wide, each with a different amount of its own padding baked in.
That padding is what makes a row of logos look uneven — a mark with a generous
margin renders smaller than its neighbour at the same nominal size.

So each raster file was:

1. **Trimmed** to its own content. Files with real transparency are cropped on
   the alpha channel; files on a flat white background are cropped on the
   difference from white.
2. **Resized to fit a 440 × 112 box**, preserving its ratio. Every one of them
   ended up height-limited, so they all now render at the same height — which is
   the thing that makes a row look deliberate.
3. **Saved as PNG**, lossless, alpha preserved.

The row renders them at a 56px cap, so the files are 2× for a retina screen.

**The two vector files were left as vector** — rasterising them would be a
downgrade. The standard here is the box they render in, not the container they
arrive in. UCSF needed one fix: it carried `width`/`height` in pixels and no
`viewBox`, which means a browser has no coordinate space to scale it into. It
now has the `viewBox` its own dimensions imply and no fixed size, so CSS
controls it like every other logo in the row.

Nothing is recoloured and nothing is redrawn. Most brand guidelines forbid both,
and a greyscale treatment was dropped for exactly that reason.

## Adding the missing one

Drop `houston-methodist.svg` (or `.png`, and change the extension in
`index.html`) into this folder. If it is a raster file, run it through the same
trim-and-fit so it matches the rest: trimmed of padding, fitted inside 440 × 112.
