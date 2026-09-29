# Registration & access — review feedback, September 2026

Source: comments and overlay text boxes on the Google Slides deck
`EyeLecture-registration-walkthrough` (42 slides).
Reviewers: **Anurag Shrivastava** (most items), **Eddie Nash**, **Arthi Vaidyanathan**, **Nikki Daniels**.
Dates run Sep 11 → Sep 22, 2026. **Where two comments conflict, the later one wins** — this is
flagged inline.

Two kinds of feedback are merged here:

- **Comments** — threaded comments in the deck.
- **Overlays** — text boxes the reviewers dropped on top of the screenshots. These are *proposed
  replacement copy*, written in the voice the final UI should use.

Each item is written so it can be implemented without going back to the deck. Slide numbers refer
to the deck; file paths refer to this repo.

---

## 1. Renaming — do this first, it touches everything

| Current | New | Why |
|---|---|---|
| `Residency administrator` | **Program Administrator** | Covers fellowships that are not attached to a residency program. (Sep 21) |
| `Administrator` (the global role) | **Super User** | "Will refer to this as the Super User going forward." The super user is *us*, not the institution. (Sep 22) |
| `User rank` (field label) | **User type** | (Sep 14, confirmed by the overlay on slide 11) |
| Button `Turn down` | **Decline** | (Sep 22) |
| Button `Validate` | **Accept** | (Sep 22) |
| Badge `Recognised` | **Validated** | And delete the subtext under the institution name in that green banner. (Sep 21) |

"Keep consistent across all with 'Decline' or 'Accept' for the buttons" — the rename applies to
every screen, not just the validation queue.

Touches: `backend/src/modules/users/enums/user-role.enum.ts`, the migration that owns the
`user_role` enum, and every template under `frontend/src/app/features/`.

---

## 2. Permissions model — the substantive change

Today: a Super User approves attending physicians and program administrators; a program
administrator approves only trainees at their own institution. The reviewers want this instead:

1. **A Program Administrator can validate *anyone* at their own institution** — trainees, attending
   physicians requesting affiliation, and other program administrators.
2. **The Super User only validates the *first* administrator at a new institution.** From that
   point on, that administrator adds and validates everybody else there. (Sep 14, restated Sep 22)
3. **Remove the institution picker from the validate dialog.** An administrator is signed in under
   one institution and can only ever validate for it; the user already named the institution when
   they signed up. Slide 26. (Sep 22)
   - Note this conflicts with the Super User case, who *does* validate across institutions.
     Likely resolution: hide the picker for program administrators, keep it for the Super User.
4. **Attending physicians are not administrators.** Once validated they can view core lectures plus
   their institution's lectures — no performance dashboards, no accepting or declining trainees.
   (Sep 22; Eddie asked the same question Sep 21)

Touches: `backend/src/modules/users/users.service.ts` (`assertCanReview`, `findPendingValidation`,
`countPendingValidation`), `frontend/src/app/core/services/auth.service.ts` (`canReview`),
`frontend/src/app/features/directory/validation-queue.component.html`.

---

## 3. Access before verification

This is a recurring theme and it changes what the pending-state screens should say.

- **Everybody can use the core EyeLecture curriculum while unverified.** Institutional verification
  only unlocks *that institution's* material. Nikki (Sep 11): a user abroad with an unknown email
  domain must not think they have no access at all until somebody approves them.
- **An attending physician does not have to be verified at all.** They can hold a generic,
  unaffiliated account with the core curriculum. Verification is only needed if they affiliate with
  an institution and want its custom content. (Sep 14, restated Sep 22)

Every "you are waiting" screen must therefore say *what the person can already do*, not just what
they are missing.

---

## 4. Onboarding — fields to add

The validation *sequence* is the same for medical student, resident and fellow (Sep 22), but the
*fields* differ:

| Type | Extra field |
|---|---|
| Resident | **PGY level** (PGY-1, PGY-2, …) |
| Fellow | **Specialty** (glaucoma, retina, cornea, …) |
| Program Administrator | **Specialty**, because program administrators are usually attending physicians too |

Add **"Non-clinical"** to the specialty list, so program coordinators and clerical staff have an
option. (Sep 22)

Also on step 2:

- Helper text under **Primary email**: `Use your Institutional email address here for verification purposes (e.g. user@medicalschool.edu)` (Sep 14)
- **Recovery email becomes required** — drop "(Optional)". Students lose their institutional email
  when they graduate and need a way back in. (Sep 21)
- Shorten the recovery-email description to: `Choose a back-up email account for password recovery purposes only` (Sep 21)
- Tell the user on step 1 that **the username cannot be changed**. (Sep 21, agreed in thread)

Touches: `frontend/src/app/features/auth/complete-profile.component.{ts,html}`,
`backend/src/modules/auth/dto/complete-profile.dto.ts`,
`backend/src/modules/catalogs/` (new PGY catalog, "Non-clinical" specialty).

**Open question:** slide 22 has an overlay arrow reading `← Remove this for attendings` pointing at
the step-2 form. It is not clear which field it points at. Ask before implementing.

---

## 5. Profile / "Your account"

- **Simplify Membership** to exactly: Username *(fixed)*, Email *(editable)*, Recovery email
  *(editable)*, Current Institution *(editable)*, Member since. (Sep 21)
- Add a separate **"Past affiliations"** heading listing previous residency and fellowship. (Sep 21, Sep 22)
- Add **Specialty** (cornea, retina, …, Non-clinical) under "Your account". (Sep 22, three separate comments)
- **Show both email addresses** — primary and recovery — on the account card. (Eddie Sep 21, Anurag Sep 22)
- Under Membership, **replace the explanatory sentence with the "Verified by domain" badge**. (Sep 21)

### The email-is-fixed problem (needs a decision)

The deck says the institutional address is fixed because it is what links the account to the
institution. Both Eddie and Anurag pushed back: the **username** is the fixed identity, and the
whole point of it was to let people change email as they move institutions. Overlay on slide 16
just reads `if you change institutions`.

> "When the student graduates, they will lose access to the institutional email, but the recovery
> email always works." — Anurag, Sep 21

Proposed model to confirm: username fixed forever · primary email editable (re-triggers domain
matching, and therefore re-validation against the new institution) · recovery email always editable
and always present · old institution moves to "Past affiliations".

Touches: `frontend/src/app/features/profile/profile.component.html`,
`backend/src/modules/auth/auth.service.ts`, `backend/src/modules/users/users.service.ts`.

---

## 6. Copy changes — exact strings

Where a string has two proposed versions, the later date wins.

### Landing / sign-in — `features/auth/login.component.html`

- Rework the blue panel tagline. Keep the original colours and fonts. Starting point offered:
  `Focus your mind. Master your craft. Interactive, High-Yield, & Peer-Reviewed: Ophthalmology Education for the Next Generation.` (Sep 14)

### Register step 1 — `features/auth/register.component.html`

- `Just a username and a password. We ask about your training on the next screen.`
  → `Start by choosing a username and password` (Sep 14)
- Add a note that the username cannot be changed later.

### Complete profile step 2 — `features/auth/complete-profile.component.html`

- Header: overlays propose `Your account exists. This helps us connect you to your institution.`
  **But** Anurag then said (Sep 21) this phrasing is confusing and wants to talk it through.
  **Do not ship it as-is.**
- `Please sign up with your school email address.`
  → `Please register with your Institution email address` (Sep 21)
- Unknown-domain message. The long overlay version was superseded:
  - Overlay (earlier): *"Your email is not associated with a known institutional domain. Your
    affiliation will be manually confirmed by an administrator. In the interim, you have access to
    all of the core EyeLecture modules."*
  - **Final (Sep 21):** `Your account will require further confirmation for full access to Eyelecture.com`

### Check your email — `features/auth/verify-email.component.html` / the done card

- **Delete** the "Your email address is affiliated with …" line entirely. (Sep 21)
- `The link expires after 48 hours…`
  → `The verification link sent to your registered account expires after 48 hours` (Sep 21)

### Dashboard, pending state — `features/dashboard/dashboard.component.html`

- `Your membership is being reviewed` → `Your Institutional account is in review` (Sep 22)
- **Remove** `An administrator needs to confirm your account.` (Sep 22)
- `No institution linked to your account yet.` → `Unaffiliated` (Sep 21)
- `A residency administrator at <institution> needs to confirm you belong there…`
  → `Your account requires Institutional verification for full access to Eyelecture.com` (Sep 21)
- Make the trainee and attending versions of these messages **uniform**. (Sep 21)

### Admin dashboard — `features/dashboard/dashboard.component.html`

- Tile subtitle `People who need you to confirm them`
  → `Pending user requests that require administrator validation` (Sep 22)

### Validation queue — `features/directory/validation-queue.component.html`

- Empty state `Nothing waiting` → `No Pending Requests`
- Empty-state subtext → `All user requests have been validated by a residency administrator`
  *(reword to "program administrator" once the rename in §1 lands)* (Sep 22)
- Program-administrator queue description → `Students who indicated an affiliation with your institution but whose email addresses did not match an institutional domain.` (overlays, slides 34 and 35)

---

## 7. Notifications — new work

1. **On acceptance**, email the user: their account has been validated and they now have full access
   to their institution's content. (Sep 22; Eddie asked for this Sep 21)
2. **On a new request**, email the administrator in real time, and **repeat after about a week** if
   the request is still unvalidated — Arthi's worry is that requests get lost in an inbox (Sep 15).
   Anurag agreed and added: best case, the administrator can **accept or decline straight from the
   email** without signing in. Volume should be low, since anyone on an institutional domain never
   reaches this path.

---

## 8. Out of scope for this pass, but logged

- **Lecture keywords.** Each lecture needs keywords, and that likely needs its own menu under the
  administrator area with UI for managing them. (Sep 22)

---

## 9. Questions to put back to the reviewers

1. Slide 22 — what does `← Remove this for attendings` point at?
2. "The rank still needs an administrator" — does that mean a **Super User** still has to approve, or
   the institution's program administrator? (Sep 22) Under the new model in §2 it should be the
   program administrator, except for the first administrator at an institution.
3. The complete-profile header copy — Anurag wants to discuss `Your account exists. This helps us
   connect you to your institution.` before it ships.
4. Sign-in caption "Neither email address signs anybody in" was read as *"Either email address signs
   you in"* (Sep 14). Worth checking the UI does not create the same ambiguity.
5. If the primary email becomes editable, does changing it to a different institution's domain
   re-trigger automatic validation there, or does it require a new manual approval?

---

## Appendix — structural changes to the deck itself

Not product feedback, just so the deck can be tidied:

- A **blank slide was inserted at position 6** (after "Sign in").
- **Slides 8 and 9 are duplicates** of "Step 1 — filled in".
- The final **"What we would like you to look at"** slide was deleted.
