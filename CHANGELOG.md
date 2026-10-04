# Changelog

A hub keeps working when the website is newer than its backend: new pages appear once the hub's `Code.gs` lists the feature. To update a Google Sheet hub, paste the new `Code.gs` and deploy a **new version** of the same deployment ([setup.md → Updating](setup.md#updating)); on your own server run `hubctl deploy`.

## 5.1.0 — 2026-10-04

- **Ambassadors.** Students who bring their school, each with a code and a link `<hub>/r/CODE` (a QR code on their poster). New page *Ambassadors* for everyone on the team: whoever adds an ambassador is their **buddy** and looks after them; leads see and change them all. *Add several*, *Send their page* (a ready Telegram message in the hub's languages), *Poster*, pause / left, channel codes (`IG`, `UZ1`… for a place rather than a person), *Sunday leaderboard* (top 5, first names only, to copy into the ambassadors' group). Applications has a new interest *School ambassador* and a *Make ambassador* button. The Overview shows an Ambassadors card.
- **Referral links.** `/r/CODE` always ends on your signup page with `?ref=CODE`, so HQ counts the referral. With `referrals = on` (Settings → Referrals & ambassadors) the page first asks the friend's first name (Uzbek / Russian / English) and saves it with the code — nothing else — so you know who invited whom and hand out rewards at check-in. Off (the default) saves nothing; printed QR codes work either way. On your own server `/r/CODE` goes straight to the signup page while names are off.
- **An ambassador's own page** (`#/amb?k=…&s=…`, no account): their link, QR code, an A4 poster to print, the message to forward, their numbers, the rewards they reached and the top 5. It never shows anyone's contacts. A new link switches the old one off.
- **Check-in.** During the event days everyone on the team can tick *Came* in *Ambassadors → Names*, or add someone who says who invited them. From the first event day the leaderboard counts friends who came, capped at `referral_cap` (8).
- **Privacy.** After `referral_delete_after` (default: 7 days after the event) the hub deletes friends' names and ambassadors' contacts, notes and page links by itself; the numbers stay. Admins can do it any time. The bot never messages ambassadors; buddies get one Sunday message about their own ambassadors, and the weekly report has an ambassadors section.
- Grew out of Abbos's **Referral page, part 1** (5.0.0): his code whitelist and formula guard are now in `Code.gs`, and the separate `apps-script/referrals/` web app is gone — one place for the data, no second Sheet.
- QR codes are made in the browser by the vendored [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT, `docs/js/vendor/qrcode.js`).
- Uzbek dates are written out by the hub: many browsers have no Uzbek month names and printed “M11 14” on the public page.
- `hubctl deploy` takes a backup first and stops if it fails.

## 5.0.0 — 2026-10-03

- **Single-use invites** (setting `signin_mode`, Settings → How people sign in). An invite (`#/invite?k=…`) works once: the person opens it and picks *Sign in with Google*, a password (own server) or *just this device*, and it is used up. Messages, reminders and the bot never carry a key, so a forwarded or leaked message lets nobody in. A newer invite switches the older one off; invites expire after `invite_days` (7). People shows *invite sent* / *invite expired*; *⋯ → New invite & message*. **New hubs start with invites; hubs from before v5 keep personal links until an admin switches** — links people already have keep working until you reset them.
- **Apply page in English, Uzbek and Russian** (`#/apply`). Pick the languages of the public page and the Apply page in Settings → Public page (the first is the default; `?lang=uz` picks one). The form now asks for school, several interests and free time; answers are stored in English with the language used, so the dashboard reads the same. The tagline and the join-form text can be written per language. Adding a language is one block in `docs/js/i18n.js` (CONTRIBUTING.md). ⚠️ The Uzbek and Russian texts need a native speaker's check.
- **Participant signups.** Leads type HQ's count on the Overview (or send `/signups 57` to the bot, or a script pushes it with the feed key). The Signups card shows the goal, the trend and the funding estimate (`funding_per_signup`); the public page can show the count (`public_show_signups`).
- **Group feed.** The organizer group hears about new signup counts, new applications (first name + interest only) and new files — each can be switched off (`feed_signups`, `feed_applications`, `feed_files`).
- **Inbox.** `apps-script/inbox-watcher.gs` runs in your city mailbox's own Google account (the hub never gets permission to read mail) and reports new emails every 5 minutes. Leads see them in *Inbox*, get a Telegram message (`inbox_alerts`), and mark each one handled, ignored, or turn it into a task.
- **Uploads on Files.** Anyone on the team uploads a picture, PDF, Office file, ZIP, MP4/MP3, font or text file (up to about 6 MB) — team-only by default. Files live in a private Drive folder (Google Sheet hubs) or `data/files` (own server) and are only handed to people allowed to see the tile. Uploaders and leads delete them.
- **Feed key** (Settings → Connections): lets outside scripts call `inbox.push` and `signups.push` — nothing else. Renew it to switch every script off.
- **Referral page, part 1.** `apps-script/referrals/Code.gs` — a small separate web app on its own “Referrals” Sheet (`time · name · code`): a visitor opens `?code=…`, types their name, the row is saved and they go on to HQ's signup page with `?ref=<code>`, so HQ counts the referral. Set `SIGNUP_URL` and `EVENT_NAME` at the top for your city. It is not part of the hub backend.
- Setup wizard: invites on/off and the page languages. Demo and showcase updated. `apply` answers `dup: true` for a repeat; `ping` reports the sign-in mode.
- Fixes: the server's allowed-origins list was read as one string; a reminders test failed near midnight in some time zones.

## 4.5.1 — 2026-10-03

- **Last seen = the last time someone opened the hub.** Every visit stamps a new `last_seen` column in People (at most every 5 minutes); People, Team, the person pages, Scorecards (“Silent” = not on the hub for 5+ days) and the weekly report use it. Before, it was the last thing they *did*.
- Privacy and terms pages (`docs/privacy.html`, `docs/terms.html`) — Google asks for them before an OAuth app can be published.

## 4.5.0 — 2026-10-03

- **Showcase + guided tour.** The front page of the shared website is now a tour of what every role gets, with screenshots of the real app, and `?demo=1&tour=1` walks through it live — the real backend in the browser on a made-up team. The demo now lives in `docs/demo/`, so it works on GitHub Pages.
- **Sponsors page.** A logo gallery: drop a picture to add a sponsor (it is shrunk in the browser), set the kind, a public one-liner, a private note, order and visibility. Public sponsors appear as *Supported by* on the public page. *Copy for haven.hackclub.com* exports the `sponsors` block for the city page on HQ's site. Logos are public pictures: a public Drive folder, or `/files/pub/` on your own server.
- **Profile photos.** Everyone can add a photo (made small in the browser); admins can set anyone's. Shown next to names everywhere, never on the public page.
- **A page per person** (`#/team/<key>`): photo, job, contacts, open and finished tasks with proof, hours given, on-time rate and their latest activity; admins edit, reset and remove from there. The Team page is a grid of photo cards with progress for leads.
- **Applications know your team.** An applicant with the same email, Telegram username or name as someone on the team (or someone removed) is flagged — close it as theirs, give them a task, or open their page. A first name alone is a *maybe*.
- **Sign in with Google.** Optional, no Google script on the page. People connect Google in Profile, or match the verified email an admin saved; new people can *Sign up with Google* on the join form. Apps Script checks tokens with Google's `tokeninfo`; the server checks the signature itself (`server/google.mjs`).
- **Password reset links** (own server): *People → ⋯ → Send a password reset link* — by Telegram, email or copy; one use, 24 hours, keeps the username.
- Settings: *Sign in with Google* card with the exact addresses to register. `hubUrl_()` adds `?hub=` to links in admin messages. Neutral defaults (time zone `UTC`, example domains). GitHub Actions runs the tests.

## 4.4.0 — 2026-10-01
Change the team on the fly: unassigned tasks and *Take this task*, per-task handover when someone leaves, inline access and area in People, *Add several*, *Accept & invite*.

## 4.3.0 — 2026-10-01
Files: team links (Canva, Figma, Sheets…) plus a public team-files repo, and *What you need* on every task.

## 4.2.1 — 2026-10-01
A hub can move to its own domain; old `?hub=` links follow it.

## 4.2.0 — 2026-09-30
Task-change alerts, a month calendar, username + password sign-in on your own server, *Export CSV → Update the whole plan* with renumbering.

## 4.1.0 — 2026-09-30
Run Haven Hub on your own server: Node + SQLite, Cloudflare Tunnel, Telegram webhook, outbox, backups, `hubctl`, one-click move from a Google Sheet.

## 4.0.0 — 2026-09-30
The shareable Haven Hub: admin dashboard, roles, email reminders and invites, public event page, join form, guest viewers.
