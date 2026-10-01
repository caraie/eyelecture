# Landing page

A static page for **eyelecture.com**. Two files, no build step, no framework:
open `index.html` and it works.

It is deliberately outside the Angular app. The app lives on
`platform.eyelecture.com` and the landing links to it — that is what every "Log in"
on the page points at.

## Why a copy of the design tokens

`styles.css` carries the tokens from `frontend/src/styles/_tokens.scss`, copied
verbatim. The landing does not go through the Angular build, so it cannot import
the SCSS; what it can do is carry the same values, which is what keeps the two from
reading as different products.

Two deliberate differences:

- **Only the light theme.** A marketing page has no theme switch.
- **`display` is 56px against the app's 44.** A page headline carries further than
  an in-app one. Everything below it is the app's scale unchanged.

If a token changes in the app, change it here too. There is no mechanism that will
notice for you.

## Where the copy came from

The text is the old eyelecture.com, as supplied — the hero, the six features, the
mission line, the About section and the Custom/Cloud/Create trio. Nothing on the
page is invented marketing.

The one thing that is **not** carried over is the rotating hero. The old site cycled
three slides; here the first is the headline and the other two are the points under
it. Same words, no carousel.

## Placeholders

Everything still waiting on real content is wrapped in `.placeholder` and carries a
dashed amber border with a tag. That is on purpose and it is ugly on purpose — a tidy
placeholder is one that ships.

| Slot | What is needed |
| --- | --- |
| Sponsor logos | The actual marks for Montefiore, Duke and ASCRS. The names in the planning notes came through a transcript as "ASCIARA" / "Ciara"; **ASCRS** is the assumption — confirm it. |
| Product screenshots | Which screens go on a public page. What exists today is the account and administration surface. |
| Team roles and photos | Names are as given: Dr. Shrivastava, Daniel, Zara, Diego, Carlos. No role or photograph has been supplied, and none is invented. |
| FAQ | Questions and answers. |
| Contact address | `mailto:info@eyelecture.com` is a guess and is marked as one. |

## Photographs

Two stock images from [Unsplash](https://unsplash.com), used under the Unsplash
licence and hot-linked from `images.unsplash.com`:

| Where | Photo | URL |
| --- | --- | --- |
| Hero | Eye examination | `images.unsplash.com/photo-1576210117723-cd06449a467d` |
| Mission band | Lecture room | `images.unsplash.com/photo-1524178232363-1fb2b075b655` |

They are placeholders in spirit even though they are not marked as such: swap them
for real photographs of the programs when there are any. If the page should not
depend on a third-party CDN, download both and serve them from this folder.

The brandmark is the eyemark from the design system, inlined as SVG and taken
verbatim from `frontend/src/app/shared/components/eye-logo.component.ts`.

## Deploying

Nothing here is wired up yet. It is two static files, so any host will do —
Cloud Storage behind the existing load balancer, Cloud Run with a static server, or
whatever `eyelecture.com` points at today.
