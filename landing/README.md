# Landing page

A static page for **eyelecture.com**. Three files and a folder of images, no build
step, no framework: open `index.html` and it works.

It is deliberately outside the Angular app. The app lives on
`platform.eyelecture.com` and the landing links to it — that is what every "Log in"
on the page points at.

## Everything here is provisional

There are no placeholder frames on the page any more, by request: the whole first
cut is a draft, and marking parts of it was drawing a line that does not exist. What
that means in practice is below, so nobody mistakes a draft for a decision.

| Not real yet | What it is today |
| --- | --- |
| Team names and photographs | Invented names and stock portraits. **Nobody on that row is a real person.** |
| Team descriptions | Lorem ipsum. |
| FAQ | Five plausible questions, lorem ipsum answers. |
| Roadmap dates | 2017, funding and 2019 come from the About copy. **2026 and 2027 are ours** — "rebuilding the app", then core curriculum and analytics. |
| Sponsor wordmarks | Set in the brand typeface, not the real marks. The planning notes named the third one through a transcript as "ASCIARA" / "Ciara" — **ASCRS** is the assumption here, confirm it. |
| Contact address | `info@eyelecture.com` is a guess. |
| The contact form | Has nowhere to post. See below. |

Everything else — the hero, the six features, the mission line, the About section
and the Custom/Cloud/Create trio — is the old eyelecture.com copy as supplied.

The one thing **not** carried over is the rotating hero. The old site cycled three
slides; here the first is the headline and the other two are the points under it.
Same words, no carousel.

## Why a copy of the design tokens

`styles.css` carries the tokens from `frontend/src/styles/_tokens.scss`, copied
verbatim. The landing does not go through the Angular build, so it cannot import the
SCSS; what it can do is carry the same values, which is what keeps the two from
reading as different products.

Borrowed from the design system on purpose:

- the **hero gradient** is `.el-auth-aside`, the app's sign-in panel, so the first
  thing anybody sees is the same blue the product opens with — and `.hl` goes mint
  there, because blue on blue disappears;
- the **tinted icon tiles** on the feature cards are the dashboard's;
- the **accent cards** behind Custom / Cloud / Create are `.el-card` with the
  `--acc-*` surfaces.

Two deliberate differences:

- **Only the light theme.** A marketing page has no theme switch.
- **`display` is 56px against the app's 44.** A page headline carries further than
  an in-app one. Everything below it is the app's scale unchanged.

If a token changes in the app, change it here too. Nothing will notice for you.

## Images

Screenshots in `img/` are real, taken from the deployed test environment, and all
four are **what somebody signing up sees**: creating an account, the institution
being confirmed by email domain, their dashboard, and their profile. The
administration screens — the review queue, institutions, the super user's dashboard
— are deliberately not here. A public page should show the product from the side the
public is on.

They are cropped to a common 16:10 rather than letterboxed. The bars that padding
left were the thing that looked wrong; the crop is anchored top-left, so what goes
is whitespace at the bottom and never the side navigation's rounded edge.

Three of the six hero tiles are **supplied images**, not stock: `hero-team.jpg` (a
group of clinicians), `hero-app.jpg` (the app on a tablet) and `hero-slitlamp.jpg`
(a slit lamp). They replaced two stock portraits and the phoropter. Originals are in
`img/_raw-hero/`; the files on the page are resized to ~1000px and saved as
progressive JPEG, which is what took them from 4.3 MB to 270 kB together.

The rest are hot-linked from [Unsplash](https://unsplash.com) under the Unsplash
licence:

| Where | Photo |
| --- | --- |
| Hero mosaic | `photo-1501621667575-af81f1f0bacc`, `photo-1530695440407-21fef47230b1`, `photo-1677773382668-8a84321836e9` |
| Mission band | `photo-1524178232363-1fb2b075b655` |
| Team | `photo-1622253692010-333f2da6031d`, `photo-1612349317150-e413f6a5b16d`, `photo-1659353888906-adb3e0041693`, `photo-1637059824899-a441006a6875`, `photo-1645066928295-2506defde470` |

All of them take Unsplash's own resizing parameters, so the page never downloads a
4000px original. The team ones use `fit=facearea`, which crops to the face — that is
what keeps a circular mask off somebody's forehead.

If the page should not depend on a third-party CDN, download them into `img/` and
change the `src` attributes.

The brandmark is the eyemark from the design system, inlined as SVG and taken
verbatim from `frontend/src/app/shared/components/eye-logo.component.ts`.

## The script

One block at the bottom of `index.html`, no dependencies. Three things:

- **The top bar** is transparent over the hero and solid once you scroll past it.
- **The mosaic drifts.** Each column carries a `data-drift` factor and moves at its
  own rate as the page scrolls — two up, one down — so the stack separates instead
  of sliding as one block. It runs on `requestAnimationFrame`, because scroll fires
  far more often than the screen repaints, and it stops once the hero is well out of
  view. `prefers-reduced-motion` turns it off.
- **The carousel** sets each slide's distance from the centre; the CSS does the rest.

Two patterns were picked from 21st.dev — a coverflow carousel and a centred
accordion FAQ. Those components are React, and lean on Swiper and framer-motion;
this page has no build step and no framework, so both are **written from scratch
here**, matching the behaviour rather than the code. The carousel is a flex row
translated by one slide per step with a `rotateY` and a scale on each side slide;
the FAQ is `<details>`/`<summary>`, which opens with no script at all and takes the
keyboard for free.

## Deploying

Nothing here is wired up yet. Static files, so any host will do — Cloud Storage
behind the existing load balancer, Cloud Run with a static server, or whatever
`eyelecture.com` points at today.

## The contact form

There is no backend. Rather than a Send button that quietly does nothing, submitting
opens the visitor's own mail client with every field already written into the
message. That works today, needs nothing, and loses no information.

When there is somewhere to post it, put the URL on the form:

```html
<form class="contact-form" data-contact data-endpoint="https://…">
```

It then POSTs the fields as JSON and reports success or failure in place. No other
change is needed.
