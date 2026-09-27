# Punchlist

A mobile-first punchlist app for job sites. **Snap a photo, mark it up with
arrows and notes, assign it to a contact, and check it off when it's done.**

It runs entirely in the browser — no server, no login, no build step. Your data
stays on your device (in the browser's local storage). It installs to your phone's
home screen like a native app and works offline.

![Punchlist](icons/icon.svg)

## What it does

- 📸 **Take pictures** — tap the camera button to shoot a photo (or pick one from
  your library) and create a punchlist item from it.
- ✏️ **Make notes on the picture** — a built-in markup editor lets you draw
  freehand, add arrows, boxes, and text labels right on the photo, then save it.
  Every item also has a title, a notes field, and a priority.
- 👥 **Add contacts** — save subs, owners, and teammates (name, company, email,
  phone). Assign items to them.
- ✈️ **Send it to them directly** — the **Send** button emails or shares the
  punchlist (with photos, where your device supports it) straight to a contact or
  any email address.
- ✅ **Check it off** — tap the circle on any item to mark it complete. A progress
  bar tracks how much of the list is done.
- 🗂️ **Multiple punchlists** — keep a separate list per job/unit. Open the menu
  (☰) to switch, create, or edit them.
- 💾 **Backup / restore** — export all your data to a file and import it on another
  device (menu → Export / Import backup).

## How to use it

1. **Open `index.html`** in a browser. On a phone, use the deployment options
   below so the camera works (browsers require HTTPS for camera access).
2. Tap the big **camera** button to add an item with a photo, or the **+** button
   to add an item without one.
3. On the item screen, tap **Annotate** to draw and add notes on the photo.
4. Tap the **contacts** icon (top right) to add people, then assign items to them.
5. Tap **✈ Send** to email/share the list.
6. Tap the **circle** on any item to check it off.

### Install to your phone's home screen

- **iPhone (Safari):** open the site → Share → *Add to Home Screen*.
- **Android (Chrome):** open the site → menu → *Install app* / *Add to Home screen*.

Once installed it opens full-screen and works offline.

## Running / hosting it

Because browsers only allow camera access over **HTTPS** (or `localhost`), use one
of these:

**Local preview (on your computer):**

```bash
# Python (built in on macOS/Linux)
python3 -m http.server 8000
# then open http://localhost:8000
```

**Put it online (so you can use it on your phone):** host these static files on
any static host — GitHub Pages, Netlify, Vercel, Cloudflare Pages, etc.

To use **GitHub Pages**: push this repo, then in the repo's
*Settings → Pages*, set the source to your branch's root. Your app will be served
at `https://<user>.github.io/<repo>/`.

## Tech notes

- Plain HTML/CSS/JavaScript — no frameworks, no build tooling.
- Data model and everything else lives in [`app.js`](app.js).
- Photos are downscaled to ~1600px and stored as JPEG data URLs in
  `localStorage`. For heavy daily use, export backups periodically — browser
  storage is finite (typically ~5–10MB per site).
- PWA support via [`manifest.webmanifest`](manifest.webmanifest) and
  [`sw.js`](sw.js) (offline app shell).

## Privacy

Everything is stored locally in your browser. Nothing is uploaded anywhere. When
you use **Send**, the summary/photos are handed to your own email or share sheet —
you choose where they go.
