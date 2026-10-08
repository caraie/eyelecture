# Institution and sponsor logos

Eleven files are referenced by `index.html` and none of them is here yet:

| File | Organisation |
| --- | --- |
| `einstein.svg` | Albert Einstein College of Medicine |
| `montefiore.svg` | Montefiore |
| `ascrs-foundation.svg` | ASCRS Foundation |
| `allergan-foundation.svg` | The Allergan Foundation |
| `duke.svg` | Duke Medicine |
| `nyu-langone.svg` | NYU Langone School of Medicine |
| `weill-cornell.svg` | Weill Cornell Medicine |
| `ucsf.svg` | UCSF |
| `toronto.svg` | University of Toronto |
| `bascom-palmer.svg` | Bascom Palmer Eye Institute |
| `houston-methodist.svg` | Houston Methodist |

Until a file exists the browser falls back to the `alt` text, which `.logo img`
styles as a wordmark — a missing logo reads as a name rather than as a broken
image, so the page is presentable in the meantime.

## Where they have to come from

These are the organisations' own trademarks. Each one has to come from the
organisation — through whoever holds the relationship, or from the brand or
press page they publish for that purpose — together with permission to show it
on this site. Pulling a file off a search result is both the wrong-quality asset
and the wrong way to get it.

Most of them publish brand guidelines that say how the mark may be used: usually
a minimum size, clear space around it, and a rule against recolouring. The
greyscale treatment in `styles.css` lifts on hover; if a guideline forbids
altering the colour, drop the `filter` on `.logo img`.

## What to supply

SVG where possible, PNG at 2× otherwise. Horizontal lockups look best in the
row. Transparent background. The row sizes everything to a 56px cap and centres
it, so the files do not need to match each other in size — only to be trimmed of
their own padding, or they will look smaller than their neighbours.
