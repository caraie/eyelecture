/* EyeLecture registration walkthrough — built on the EyeLecture design system.
   Tokens taken verbatim from frontend/src/styles/_tokens.scss and _components.scss. */

const pptxgen = require('pptxgenjs');
const path = require('path');
const { execSync } = require('child_process');

const SHOTS = path.join(__dirname, 'shots2');
const OUT = path.join(__dirname, 'EyeLecture-walkthrough-2026-09.pptx');

// ---- Reference palette (--el-*) -------------------------------------------
const BLUE_50 = 'EEF3FE';
const BLUE_600 = '1B4FD1';
const BLUE_800 = '12327F';
const GREEN_600 = '0A7D4C';
const GREEN_800 = '075334';
const VIOLET_500 = '6E4BEF';
const VIOLET_700 = '4E31C0';
const AMBER_500 = 'D98A00';
const AMBER_700 = '9A6100';
const AMBER_SURFACE = 'FCE9C4';
const AMBER_ON = '7A4E00';
const N_0 = 'FFFFFF';
const N_25 = 'FBFCFE';
const N_50 = 'F6F8FB';
const N_200 = 'DFE5EE';
const N_400 = '97A3B6';
const N_500 = '6B7789';
const N_600 = '4B5566';
const N_900 = '0F172A';
const BLUE_300 = '8AA8F5';
const GREEN_300 = '5FD09E';
const VIOLET_300 = 'A793F7';

// ---- Type (--font-display / --font-body / --font-mono) --------------------
const DISPLAY = 'Instrument Sans';
const BODY = 'Geist';
const MONO = 'Geist Mono';

// ---- Shape scale: corner-lg 16px = 0.167in, corner-full ------------------
const R_LG = 0.167;
const R_SM = 0.083;

// Elevation 3: 0 6px 16px rgba(15,23,42,.10)
const ELEV_3 = { type: 'outer', color: N_900, opacity: 0.1, blur: 16, offset: 6, angle: 90 };

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5
pres.author = 'EyeLecture';
pres.title = 'EyeLecture — signing up';

function size(file) {
  const out = execSync(
    `python3 -c "from PIL import Image;im=Image.open('${path.join(SHOTS, file)}');print(im.size[0],im.size[1])"`
  ).toString().trim().split(' ');
  return { w: +out[0], h: +out[1] };
}

function fit(file, box) {
  const s = size(file);
  const scale = Math.min(box.w / s.w, box.h / s.h);
  const w = s.w * scale;
  const h = s.h * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y, w, h };
}

/* .el-overline — 11px, 600, uppercase, 0.08em tracking, muted.
   Same page-head pattern the app uses above every headline. */
function overline(slide, text, color) {
  slide.addText(text.toUpperCase(), {
    x: 0.6, y: 0.46, w: 9, h: 0.24, margin: 0, isTextBox: true,
    fontFace: BODY, fontSize: 11, bold: true, color: color || N_500, charSpacing: 0.9,
  });
}

/* .el-headline — Instrument Sans 600, -0.02em */
function headline(slide, text, y) {
  slide.addText(text, {
    x: 0.6, y: y || 0.76, w: 12.2, h: 0.52, margin: 0, isTextBox: true,
    fontFace: DISPLAY, fontSize: 27, bold: true, color: N_900, charSpacing: -0.5,
  });
}

/* .el-lede — 15.5px, on-surface-variant */
function lede(slide, text, y) {
  slide.addText(text, {
    x: 0.6, y: y || 1.3, w: 12.15, h: 0.3, margin: 0, isTextBox: true,
    fontFace: BODY, fontSize: 13.5, color: N_600,
  });
}

function shotSlide({ section, sectionColor, title, caption, image, notes }) {
  const slide = pres.addSlide();
  slide.background = { color: N_50 }; // --md-sys-color-background
  overline(slide, section, sectionColor);
  headline(slide, title);
  if (caption) lede(slide, caption);
  const box = { x: 0.6, y: caption ? 1.76 : 1.46, w: 12.15, h: caption ? 5.3 : 5.6 };
  const p = fit(image, box);
  // The screenshot sits on an .el-card: surface, 1px outline-variant, corner-lg.
  slide.addShape(pres.ShapeType.roundRect, {
    x: p.x - 0.09, y: p.y - 0.09, w: p.w + 0.18, h: p.h + 0.18,
    fill: { color: N_0 }, rectRadius: R_LG,
    line: { color: N_200, width: 1 },
    shadow: { ...ELEV_3 },
  });
  slide.addImage({ path: path.join(SHOTS, image), x: p.x, y: p.y, w: p.w, h: p.h });
  if (notes) slide.addNotes(notes);
  return slide;
}

function divider({ number, title, blurb, accent }) {
  const slide = pres.addSlide();
  slide.background = { color: N_900 }; // --md-sys-color-inverse-surface
  slide.addText(number, {
    x: 0.95, y: 2.0, w: 3, h: 1.5, margin: 0, isTextBox: true,
    fontFace: DISPLAY, fontSize: 84, bold: true, color: accent, charSpacing: -3,
  });
  slide.addText(title, {
    x: 0.95, y: 3.55, w: 11, h: 0.85, margin: 0, isTextBox: true,
    fontFace: DISPLAY, fontSize: 40, bold: true, color: N_25, charSpacing: -1.2,
  });
  slide.addText(blurb, {
    x: 0.98, y: 4.5, w: 9.6, h: 1.2, margin: 0, isTextBox: true,
    fontFace: BODY, fontSize: 15, color: 'A7B2C6', lineSpacing: 23,
  });
  return slide;
}

/* A slide that is only words: a lede plus a stack of labelled points. Used where a
   screenshot would just be a picture of a sentence. */
function pointsSlide({ section, sectionColor, title, caption, points, footnote }) {
  const s = pres.addSlide();
  s.background = { color: N_50 };
  overline(s, section, sectionColor);
  headline(s, title);
  if (caption) lede(s, caption);

  // The card is sized from how many there are, and the label gets the full width
  // rather than a column — a two-line heading was landing on the body under it.
  const cardH = points.length >= 5 ? 0.86 : 0.94;
  const step = cardH + 0.12;
  let y = 1.98;

  points.forEach((p) => {
    s.addShape(pres.ShapeType.roundRect, {
      x: 0.6, y, w: 12.15, h: cardH, fill: { color: N_0 }, rectRadius: R_LG,
      line: { color: N_200, width: 1 },
    });
    s.addShape(pres.ShapeType.roundRect, {
      x: 0.6, y, w: 0.055, h: cardH, fill: { color: p.accent || BLUE_600 },
      rectRadius: R_SM, line: { width: 0 },
    });
    s.addText(p.t, {
      x: 0.95, y: y + 0.11, w: 11.5, h: 0.28, margin: 0, isTextBox: true,
      fontFace: DISPLAY, fontSize: 14, bold: true, color: N_900, charSpacing: -0.2,
    });
    s.addText(p.b, {
      x: 0.95, y: y + 0.4, w: 11.5, h: cardH - 0.48, margin: 0, isTextBox: true,
      fontFace: BODY, fontSize: 12.5, color: N_600, lineSpacing: 17,
    });
    y += step;
  });

  if (footnote) {
    s.addText(footnote, {
      x: 0.6, y: y + 0.12, w: 12.15, h: 0.38, margin: 0, isTextBox: true,
      fontFace: BODY, fontSize: 12, italic: true, color: N_500,
    });
  }
  return s;
}

// ================================================================ title
{
  const s = pres.addSlide();
  s.background = { color: N_900 };
  s.addText('EYELECTURE', {
    x: 0.95, y: 1.72, w: 8, h: 0.26, margin: 0, isTextBox: true,
    fontFace: BODY, fontSize: 11, bold: true, color: BLUE_300, charSpacing: 1.1,
  });
  s.addText(
    [
      { text: 'Signing up for ', options: {} },
      { text: 'EyeLecture', options: { italic: true, color: BLUE_300 } },
    ],
    {
      x: 0.95, y: 2.1, w: 11.4, h: 0.95, margin: 0, isTextBox: true,
      fontFace: DISPLAY, fontSize: 44, bold: true, color: N_25, charSpacing: -1.5,
    }
  );
  s.addText('What every kind of user sees — before, during and after approval', {
    x: 0.98, y: 3.15, w: 11, h: 0.45, margin: 0, isTextBox: true,
    fontFace: BODY, fontSize: 18, color: 'A7B2C6',
  });
  s.addText(
    [
      { text: 'eyelecture-d.next2.ai', options: { fontFace: MONO, color: N_25 } },
      { text: '     29 September 2026     test environment', options: { fontFace: BODY, color: '7E8CA3' } },
    ],
    { x: 0.98, y: 3.85, w: 11, h: 0.36, margin: 0, isTextBox: true, fontSize: 13 }
  );
  s.addShape(pres.ShapeType.roundRect, {
    x: 0.95, y: 5.0, w: 6.6, h: 0.78, fill: { color: '1C3462' }, rectRadius: R_LG,
    line: { color: '33405A', width: 1 },
  });
  s.addText('Rebuilt after the September review — every screen here is the current one.', {
    x: 1.25, y: 5.0, w: 6.1, h: 0.78, margin: 0, valign: 'middle', isTextBox: true,
    fontFace: BODY, fontSize: 12.5, color: 'CFDDFC',
  });
  s.addNotes('Every screenshot was taken on the live test site with real accounts, on 29 September 2026.');
}

// ================================================================ what changed
pointsSlide({
  section: 'Since the last deck',
  title: 'What changed after the September review',
  caption: 'The review asked for five things. All five are in the screenshots that follow.',
  points: [
    { t: 'Personal email first',
      b: 'A private address is now required and asked for before anything else. An institutional mailbox is switched off the day somebody graduates; the personal one is what keeps the account theirs.',
      accent: BLUE_600 },
    { t: 'Super User and Program Administrator',
      b: 'What used to be one “administrator” is now two ranks. A super user works across the platform; a program administrator runs one institution and approves everybody at it.',
      accent: VIOLET_500 },
    { t: 'PGY levels',
      b: 'Residents are asked how far along they are — PGY-1 to PGY-7, editable from Reference lists rather than hard-coded.',
      accent: GREEN_600 },
    { t: 'A record of every affiliation',
      b: 'Moving institutions no longer overwrites the old one. Each is kept with its dates, and past ones still grant access to that institution’s material.',
      accent: GREEN_600 },
    { t: 'Invitations',
      b: 'The first program administrator at an institution is invited by email rather than having to sign up and wait in a queue.',
      accent: AMBER_500 },
  ],
  footnote: 'Wording on every screen was taken from the review comments verbatim where one was given.',
});

// ================================================================ 1
divider({
  number: '1',
  title: 'Signing up',
  blurb: 'Two steps, and an account exists after the first one. Nothing is asked about somebody’s training until there is an account to attach it to.',
  accent: BLUE_300,
});

shotSlide({
  section: 'Signed out',
  title: 'Sign in',
  caption: 'People sign in with a username, not an email address — so an account survives changing institutions.',
  image: '01-signin.jpg',
  notes: 'The three points on the left are the whole access model in one line each.',
});

shotSlide({
  section: 'Step one',
  title: 'Create your account',
  caption: 'A name, a username and a password. No email address yet: everything an address is needed for happens after the account exists.',
  image: '02-register-empty.jpg',
});

shotSlide({
  section: 'Step one',
  title: 'The username is permanent',
  caption: 'Said on the field itself rather than in a confirmation nobody reads. Password rules are two, and both are shown as you type.',
  image: '03-register-filled.jpg',
});

shotSlide({
  section: 'Step two',
  title: 'Complete your profile',
  caption: 'User type first, because it decides every question after it. Then the personal address — the one that outlasts everything else on the form.',
  image: '04-profile-step-empty.jpg',
  notes: 'Wording here is the review’s: "Your account exists. This helps us connect you to your institution."',
});

shotSlide({
  section: 'Step two',
  title: 'Five user types',
  caption: 'Each one is asked a different set of questions. A medical student is never asked for a clinical focus; an attending physician is never asked for an institutional address.',
  image: '05-user-type-open.jpg',
});

shotSlide({
  section: 'Step two',
  title: 'A recognised domain confirms you on the spot',
  caption: 'Typing an address on a domain the institution owns validates a trainee immediately — no queue, no waiting on a person. A resident is also asked their PGY level.',
  image: '06-profile-resident-validated.jpg',
  notes: 'Only trainees are let in by their address alone. An attending physician is reviewed either way, and a program administrator vouches for other people — neither is something a domain match can establish.',
});

shotSlide({
  section: 'Step two',
  title: 'Confirm the address, and you are in',
  caption: 'The link is what proves the mailbox is theirs. It is the last thing between them and signing in.',
  image: '07-check-your-email.jpg',
});

// ================================================================ 2
divider({
  number: '2',
  title: 'After signing up',
  blurb: 'Two outcomes: confirmed by your address, or waiting for a person. Both land somewhere that says which one you are.',
  accent: GREEN_300,
});

shotSlide({
  section: 'Validated',
  title: 'Confirmed by your domain',
  caption: 'Nothing to do. The badge says how the membership was established, so nobody has to ask.',
  image: '10-fellow-dashboard.jpg',
});

shotSlide({
  section: 'Waiting',
  title: 'Waiting for a program director',
  caption: 'An address on a domain we do not recognise means a person has to vouch for them — but the core material is open in the meantime.',
  image: '12-pending-dashboard.jpg',
  notes: 'Wording taken from the review: they can watch the core EyeLecture material in the interim.',
});

shotSlide({
  section: 'Account',
  title: 'The profile',
  caption: 'Username permanent, institutional address changeable, personal address separate and confirmable on its own. Past affiliations appear here once there are any.',
  image: '11-profile.jpg',
});

// ================================================================ 3
divider({
  number: '3',
  title: 'Running an institution',
  blurb: 'A super user works across the platform. A program administrator runs one institution — and is the person the queue is really for.',
  accent: VIOLET_300,
});

shotSlide({
  section: 'Super user',
  title: 'The dashboard',
  caption: 'How many people are waiting, how many institutions auto-validate, and how many accounts exist. Each is a link to the screen that answers it.',
  image: '20-admin-dashboard.jpg',
});

shotSlide({
  section: 'Super user',
  title: 'The validation queue',
  caption: 'Everybody waiting, with the institution they named and whether they have confirmed their address. Two buttons, and both are final.',
  image: '21-admin-queue.jpg',
});

shotSlide({
  section: 'Super user',
  title: 'Accepting somebody',
  caption: 'The dialog repeats what is being decided and offers a note, which is kept on the record with who made the decision.',
  image: '26-accept-dialog.jpg',
  notes: 'A program administrator sees no institution picker here — they can only ever validate into their own.',
});

shotSlide({
  section: 'Super user',
  title: 'People',
  caption: 'Every account, with its rank, institution, how its membership was established and whether the address is confirmed. A program administrator sees this same screen, scoped to their own institution.',
  image: '22-admin-people.jpg',
});

// ================================================================ 4
divider({
  number: '4',
  title: 'Institutions',
  blurb: 'An institution owns email domains. Anyone who signs up on one of them is validated automatically — which is how the queue stays short.',
  accent: BLUE_300,
});

shotSlide({
  section: 'Institutions',
  title: 'A line each',
  caption: 'The list is going to be long, so a closed row is a name and whether it is on. Everything else is what you look at when you are working on one institution, not when you are looking for one.',
  image: '23-institutions-list.jpg',
});

shotSlide({
  section: 'Institutions',
  title: 'Open one, and it is all there',
  caption: 'Domains, description, and the people invited to administer it. Removing a domain never removes anybody already validated by it.',
  image: '24-institution-expanded.jpg',
  notes: 'The invitation shown is waiting. Accepted, withdrawn and expired ones stay on the list too — the question people ask months later is "did we ever ask them, and what came of it".',
});

pointsSlide({
  section: 'Institutions',
  sectionColor: AMBER_700,
  title: 'How the first administrator gets in',
  caption: 'Everybody after them is approved locally. Only the first one has to come from us.',
  points: [
    { t: 'A super user sends an invitation',
      b: 'Typed on the institution’s own row. No account is created — the invitation is an offer, and it expires after fourteen days.',
      accent: AMBER_500 },
    { t: 'They open the link and pick a username',
      b: 'A name, a username, a password and a personal address. The institution and the rank came with the link, so there is nothing to choose and nothing to get wrong.',
      accent: AMBER_500 },
    { t: 'They arrive already validated',
      b: 'No review queue and no confirmation mail: reading the invitation is the proof that the mailbox is theirs.',
      accent: GREEN_600 },
    { t: 'From then on it is local',
      b: 'That administrator approves the trainees, the attending physicians and any further administrators at their institution. A super user is not in the loop again.',
      accent: VIOLET_500 },
  ],
  footnote: 'One live invitation per address per institution. Withdrawing one stops its link working immediately.',
});

shotSlide({
  section: 'Reference lists',
  title: 'The lists behind the forms',
  caption: 'Specialties, PGY levels, residency and fellowship programmes. Editing one changes every signup form at once, so retiring an entry is usually the right move over deleting it.',
  image: '25-reference-lists.jpg',
});

// ================================================================ closing
{
  const s = pres.addSlide();
  s.background = { color: N_900 };
  s.addText('WHAT IS NEXT', {
    x: 0.95, y: 1.9, w: 8, h: 0.26, margin: 0, isTextBox: true,
    fontFace: BODY, fontSize: 11, bold: true, color: BLUE_300, charSpacing: 1.1,
  });
  s.addText('Two things we need from you', {
    x: 0.95, y: 2.3, w: 11.4, h: 0.8, margin: 0, isTextBox: true,
    fontFace: DISPLAY, fontSize: 38, bold: true, color: N_25, charSpacing: -1.2,
  });
  const asks = [
    ['The email domains', 'For Einstein and Duke — the domain each one owns is what makes the happy path work at all. Without it nobody is auto-validated.'],
    ['Who the first administrator is', 'One name and one address per institution. That is the only thing an invitation needs.'],
  ];
  asks.forEach(([t, b], i) => {
    const x = 0.95 + i * 5.9;
    s.addShape(pres.ShapeType.roundRect, {
      x, y: 3.5, w: 5.5, h: 2.1, fill: { color: '15223D' }, rectRadius: R_LG,
      line: { color: '33405A', width: 1 },
    });
    s.addText(t, {
      x: x + 0.4, y: 3.85, w: 4.7, h: 0.35, margin: 0, isTextBox: true,
      fontFace: DISPLAY, fontSize: 18, bold: true, color: N_25, charSpacing: -0.4,
    });
    s.addText(b, {
      x: x + 0.4, y: 4.3, w: 4.7, h: 1.1, margin: 0, isTextBox: true,
      fontFace: BODY, fontSize: 13, color: 'A7B2C6', lineSpacing: 19,
    });
  });
  s.addText('Comments welcome — highlight anything on any slide and comment on it.', {
    x: 0.98, y: 6.1, w: 11, h: 0.36, margin: 0, isTextBox: true,
    fontFace: BODY, fontSize: 12.5, color: '7E8CA3',
  });
}

pres.writeFile({ fileName: OUT }).then(() => console.log('wrote', OUT));
