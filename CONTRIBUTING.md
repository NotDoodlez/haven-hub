# Contributing to Haven Hub

Thank you! Haven Hub is made by Haven organizers — most of us are teenagers — for other organizers. Issues and pull requests are welcome.

## Before you start

- Read [ARCHITECTURE.md](ARCHITECTURE.md) (10 minutes) — it explains where everything lives.
- Bigger change? Open an issue first, so we can agree on the shape before you write it.
- Follow the [Hack Club Code of Conduct](https://hackclub.com/conduct/).

## Working on it

```bash
python dev/serve.py     # http://localhost:5178/docs/?demo=1
npm run sync            # after editing apps-script/Code.gs
npm test                # must pass — GitHub Actions runs it on your pull request too
```

Ground rules that keep every Haven working:

1. **`Code.gs` stays one file** with no imports — organizers paste it into Apps Script. It must run on Apps Script *and* on the server runtime (`server/runtime.mjs`).
2. **Never break an old hub.** Add tab columns at the end of `TABS`, keep old action names working, and show new pages only when the backend lists the feature (`FEATURES`).
3. **Minors' data first.** Nothing new on the public page unless an admin switches it on; no third-party scripts or trackers; never put tokens or contacts in URLs or exports.
4. **No build step and no new dependencies** for the website. Plain ES modules, plain CSS.
5. **Plain, short wording** in the interface — many organizers read English as a second language.
6. Add or update a test in `tests/` for every backend change.

## Adding or fixing a language

The public page and the Apply page are translated; the dashboard is English.

1. Open [`docs/js/i18n.js`](docs/js/i18n.js). Copy the whole `en: { … }` block, give it your language's code (e.g. `kk`), and translate every value. Keep `{event}`, `{goal}`, `{done}`… exactly as they are.
2. Add the language's own name to `NAMES` at the top (e.g. `kk: 'Қазақша'`).
3. Add the code to `LANGS` near the top of `apps-script/Code.gs` (and `LANG_NAMES` next to it), then `npm run sync` and `npm test`.
4. Check it in the demo: `?demo=1&as=guest&lang=kk`, then open *Apply to join*.
5. In the pull request, say who checked the text — a native speaker, please.

Fixing a word in Uzbek or Russian is just as welcome: those texts were written for Haven Tashkent and still need a native speaker's review.

Interests and free-time answers are stored in English (`stored()` in i18n.js), so a new language never changes what the dashboard shows.

## Pull requests

- One topic per pull request, with a short description of *what changes for organizers*.
- Screenshots for visible changes (`node dev/screenshots.mjs` redraws the showcase ones).
- Add a line to [CHANGELOG.md](CHANGELOG.md) under the next version.

## Ideas we'd love help with

- More languages for the public and Apply pages (see above), and translations of the dashboard itself.
- A published template Sheet and a shared Google sign-in client (maintainer steps in [setup.md](setup.md#for-maintainers)).
- A script that reads HQ's signup count and sends it with `signups.push` (the feed key is in Settings → Connections), so nobody has to type it.
