/**
 * Haven Hub — the backend for one Haven's Team Hub.                                             v5.1.0
 *
 * A Google Sheet is the database (you can edit it by hand). This script, bound to that Sheet, is:
 *   - the JSON API for the website  https://notazizelse.github.io/haven-hub/?hub=<your deployment id>
 *   - the mailer (invite links, reminders, alerts — only ever to people in the People tab)
 *   - an optional team-only Telegram bot (reminders, BLOCKED alerts, posts in your organizer group)
 *
 * Set up (full guide: setup.md in github.com/notazizelse/haven-hub)
 *   1. Paste this whole file into Extensions → Apps Script (or copy the template Sheet — the code comes with it).
 *   2. Deploy → New deployment → ⚙ Web app. Execute as: Me. Who has access: Anyone. Deploy → copy the Web app URL.
 *   3. Open the website → "Set up your Haven" → paste that URL. Everything else happens in the dashboard.
 *
 * Update to a new version: paste the new file over this one → Deploy → Manage deployments → ✏️ → Version: New version → Deploy.
 * The URL stays the same. Secrets never go in this file: personal tokens live in the Sheet, the bot token in Script properties.
 */

const HUB_VERSION = '5.1.0';
// On your own server (server/index.mjs) this same file runs on Node; HUB_SERVER is then provided by the server.
const SELF_HOSTED = typeof HUB_SERVER !== 'undefined' && !!HUB_SERVER;
const DEFAULT_SITE = 'https://notazizelse.github.io/haven-hub';
const HUB_RE = /^AKfy[\w-]{30,}$/;
const HUB_NAME_RE = /^[a-z][a-z0-9-]{1,30}$/; // short hub name on the shared website (a hub that runs on its own server)
const REPO_RE = /^[\w.-]{1,39}\/[\w.-]{1,100}$/; // a GitHub repo, owner/name

// Column order = v3 order + new columns at the end, so older sheets upgrade in place. Code reads and writes by header NAME.
const TABS = {
  Settings: ['key', 'value', 'note'],
  People: ['key', 'name', 'role', 'area', 'handle', 'token', 'is_lead', 'chat_id', 'active', 'backup', 'works', 'weekend', 'one', 'ask', 'email', 'access', 'notify', 'joined_at', 'photo', 'google_sub', 'google_email', 'last_seen'],
  Tasks: ['id', 'owner', 'title', 'due', 'mins', 'why', 'steps', 'done_when', 'links', 'ask', 'status', 'proof', 'blocked_reason', 'started_at', 'done_at', 'updated_at', 'area', 'review', 'reviewed_by', 'created_by', 'resources'],
  Log: ['time', 'who', 'task', 'action', 'note'],
  Meetings: ['date', 'time', 'where', 'what'],
  Rules: ['title', 'text'],
  Milestones: ['date', 'label', 'kind', 'public', 'done'],
  Applications: ['id', 'time', 'name', 'contact', 'age_group', 'interest', 'note', 'status', 'handled_by', 'email', 'verified', 'sub', 'person', 'lang', 'school', 'availability'],
  Sponsors: ['name', 'logo_url', 'link', 'note', 'id', 'tier', 'blurb', 'public', 'order', 'logo_file'],
  Resources: ['id', 'title', 'url', 'kind', 'section', 'private', 'thumb', 'note', 'order', 'added_by', 'added_at', 'file', 'mime', 'size', 'preview'],
  Signups: ['date', 'count', 'source', 'note', 'by', 'time'],
  Inbox: ['id', 'time', 'from', 'subject', 'snippet', 'link', 'status', 'handled_by', 'task', 'mailbox', 'got_at'],
  Links: ['name', 'access', 'personal_link', 'telegram_connected', 'message_to_send'],
  Invites: ['code', 'key', 'created_at', 'expires_at', 'used_at', 'used_how', 'by'],
  Ambassadors: ['key', 'name', 'school', 'contact', 'code', 'token', 'buddy', 'status', 'kind', 'joined_at', 'note', 'app_id', 'reward', 'hours'],
  Referrals: ['id', 'time', 'name', 'code', 'came', 'checked_by', 'checked_at'],
  Report: ['time', 'what', 'detail'],
};
const STATUSES = ['Not started', 'In progress', 'Blocked', 'Done', 'Dropped'];
/** What this backend can do. The website shows a feature only when the hub lists it (Apps Script hubs update Code.gs when they get round to it). */
const FEATURES = ['files', 'unassigned', 'sponsors', 'photos', 'profiles', 'appmatch', 'apply', 'invites', 'signups', 'inbox', 'uploads', 'ambassadors'];
const ACCESS = ['admin', 'lead', 'member', 'viewer'];
const RANK = { viewer: 0, member: 1, lead: 2, admin: 3 };
const NEED = { any: 0, member: 1, lead: 2, admin: 3 };
const NOTIFY = ['auto', 'telegram', 'email', 'both', 'none'];
/** Languages the website has for the public page and the Apply page (docs/js/i18n.js). English is the base: its texts are the plain settings. */
const LANGS = ['en', 'uz', 'ru'];
const LANG_NAMES = { en: 'English', uz: 'Oʻzbekcha', ru: 'Русский' };

/** Every setting: [key, default, what it does]. Stored in the Settings tab; edited in Dashboard → Settings. */
const SETTINGS = [
  ['event_name', 'Haven', 'Shown on the website, in emails and bot messages, e.g. "Haven Springfield"'],
  ['city', '', 'Your city'],
  ['event_start', '2026-11-14', 'First event day, YYYY-MM-DD'],
  ['event_end', '2026-11-15', 'Last event day, YYYY-MM-DD'],
  ['timezone', '', 'IANA time zone, e.g. Asia/Tashkent, Europe/Berlin, America/New_York'],
  ['greeting', 'Hi', 'First word of reminders ("Salom", "Hola", …)'],
  ['contact_name', '', 'Who people go to when stuck (empty = the first admin)'],
  ['site_url', DEFAULT_SITE, 'Address of the website'],
  ['hub_id', '', 'Web-app deployment ID — filled in automatically'],
  ['reminder_hour', '18', 'Daily reminder hour, 0–23, your time zone'],
  ['weekly_report', 'yes', 'Sunday 19:00 report to leads (+ short post in the Telegram group)'],
  ['email_reminders', 'yes', 'Email reminders to people who have not connected Telegram'],
  ['done_alerts', 'yes', 'Telegram DM to leads (with photos) every time a task is done'],
  ['group_done_posts', 'yes', 'Post finished tasks + weekly report in the Telegram group'],
  ['change_alerts', 'yes', 'Tell people when their tasks are added, removed, moved or get a new date (admins get a copy)'],
  ['public_page', 'yes', 'Show a public event page at the hub link (no personal link needed)'],
  ['tagline', 'A weekend game jam for teenagers, run by teenagers.', 'One line under the event name on the public page'],
  ['signup_url', '', 'Participant signup page, e.g. https://haven.hackclub.com/yourcity'],
  ['city_email', '', 'Public contact email, e.g. yourcity@haven.hackclub.com'],
  ['instagram', '', 'Full Instagram URL'],
  ['telegram_channel', '', 'Full Telegram channel URL'],
  ['website', '', 'Any other public website'],
  ['public_show_progress', 'yes', 'Public page shows % of organizing tasks done + public milestones'],
  ['public_show_team', 'no', 'Public page lists first names + roles (off by default — most of the team are minors)'],
  ['join_form', 'yes', 'Public "Join the team" form'],
  ['join_intro', 'We need help with design, social media, outreach, tech and the event weekend. No experience needed.', 'Text above the join form'],
  ['languages', 'en', 'Languages of the public page and the Apply page, e.g. "en,uz,ru" — the first one is the default'],
  ['moved_to', '', 'Set when the hub moved to its own server: every request is sent to this address. Clear it to switch this Sheet back on'],
  ['files_repo', '', 'Public GitHub repo with your team files (posters, logos, slides), as owner/repo — shown on the Files page'],
  ['files_branch', 'main', 'Branch of that repo'],
  ['self_claim', 'yes', 'Team members can take unassigned tasks themselves ("Take this task")'],
  ['google_client_id', '', 'Google sign-in: the OAuth Web client ID (…apps.googleusercontent.com). Empty = the shared website\'s client'],
  ['signin_mode', 'link', 'How people get in: "invite" = a single-use invite, then Google, a password or "this device" (messages never carry a key) · "link" = a personal link that keeps working'],
  ['invite_days', '7', 'Days an invite works before it expires (1–60)'],
  ['signup_goal', '', 'Participant signups you aim for (the Signups card and the bot show progress)'],
  ['funding_per_signup', '', 'HQ funding per signup for your country in USD, e.g. 3.25 — shows an estimate next to the count (empty = hidden)'],
  ['public_show_signups', 'no', 'Public page shows how many people signed up'],
  ['feed_signups', 'yes', 'Post new signup counts in the Telegram group'],
  ['feed_applications', 'yes', 'Post new team applications in the Telegram group (first name + interest only)'],
  ['feed_files', 'yes', 'Post new files and links in the Telegram group (not the leads-only ones)'],
  ['inbox_alerts', 'leads', 'New emails from the inbox watcher: "leads" (Telegram to leads), "group" (the organizer group) or "no"'],
  ['referrals', 'off', 'Referral links (<hub>/r/CODE): "on" = the page asks the friend\'s first name and saves it with the code, then the signup page · "off" = straight to the signup page with ?ref=CODE, nothing saved'],
  ['referral_delete_after', '', 'Names saved by referral links (and ambassadors\' contacts) are deleted after this day, YYYY-MM-DD (empty = 7 days after the event)'],
  ['referral_cap', '8', 'Most friends one ambassador can count on the leaderboard'],
  ['ambassador_group', '', 'Link to the ambassadors\' Telegram group (shown on their page)'],
  ['referral_rewards', '', 'What ambassadors get, one line each, e.g. "3 friends: same team" — shown on their page (empty = hidden)'],
  ['amb_message', '', 'The message ambassadors send to friends; {link} = their link (empty = the standard text)'],
];
/** The shared website's Google sign-in client (owned by the Haven Hub maintainers). A hub can use its own: Settings → google_client_id. */
const SHARED_GOOGLE_CLIENT_ID = '';
// The tagline and the join-form text in every other language: tagline_uz, join_intro_ru, … (empty = the English text)
LANGS.filter(l => l !== 'en').forEach(l => {
  SETTINGS.push(['tagline_' + l, '', 'Tagline in ' + LANG_NAMES[l] + ' (empty = the English one)']);
  SETTINGS.push(['join_intro_' + l, '', 'Text above the join form in ' + LANG_NAMES[l] + ' (empty = the English one)']);
  SETTINGS.push(['referral_rewards_' + l, '', 'Ambassador rewards in ' + LANG_NAMES[l] + ' (empty = the English text)']);
  SETTINGS.push(['amb_message_' + l, '', 'Ambassadors\' message to friends in ' + LANG_NAMES[l] + ' (empty = the standard text)']);
});
/** "en,uz,ru" → ['en', 'uz', 'ru'] — known languages only, English when nothing is left. */
function langsOf_(v) { const out = String(v || '').toLowerCase().split(/[\s,;]+/).filter((l, i, a) => LANGS.indexOf(l) >= 0 && a.indexOf(l) === i); return out.length ? out : ['en']; }
/** A setting in every language the hub offers: { en: '…', uz: '…' } (only filled ones). */
function texts_(key) { const S = S_(), o = {}; langsOf_(S.languages).forEach(l => { const v = l === 'en' ? S[key] : S[key + '_' + l]; if (v) o[l] = v; }); if (!o.en && S[key]) o.en = S[key]; return o; }
const YESNO = ['weekly_report', 'email_reminders', 'done_alerts', 'group_done_posts', 'change_alerts', 'public_page', 'public_show_progress', 'public_show_team', 'join_form', 'self_claim',
  'public_show_signups', 'feed_signups', 'feed_applications', 'feed_files'];
const URL_KEYS = ['site_url', 'signup_url', 'instagram', 'telegram_channel', 'website', 'moved_to', 'ambassador_group'];

/** Optional starter checklist added at setup. Days are relative to event_start. Edit or delete freely. */
const STARTER = {
  rules: [
    ['Be 100× your usual friendliness', 'Hack Club Haven law #1 — with participants, parents and each other.'],
    ['No phone in front of participants', 'Hack Club Haven law #2.'],
    ['Take breaks', 'Hack Club Haven law #3. Sleep before the event.'],
    ['Reply within 24 hours', 'Even if it\'s just "on it". Silence is the only wrong answer.'],
    ['Every task ends in proof', 'A photo, a link, a file, or a name + number. "Done" without proof isn\'t done.'],
    ['Stuck? Press Blocked the same day', 'Write what you need and from whom. Asking early is never wrong.'],
    ['Never announce anything unconfirmed', 'Venue, prizes, sponsors — only after the lead has it in writing.'],
  ],
  milestones: [
    [-33, 'Venue confirmed in writing', 'gate', 'no'],
    [-22, 'Parent guide + waivers sent to everyone registered', 'deadline', 'no'],
    [-19, 'Adults confirmed (≈1 per 35 attendees + first aid + safeguarding)', 'gate', 'no'],
    [-7, 'Budget to HQ (check the exact date in your organizer guide)', 'deadline', 'no'],
    [0, 'Event day 1', 'event', 'yes'],
    [1, 'Event day 2 — everyone ships', 'event', 'yes'],
  ],
  // [days from event_start, time, title, minutes, area, why, steps, done when]
  tasks: [
    [-44, '20:00', 'Book your call with your HQ Engagement Manager', 20, 'Lead', 'HQ offers every organizer a 30-minute call — bring your questions.', ['Ask in #haven-help on the Hack Club Slack how to book it', 'Book 3–4 days ahead', 'Write your top 3 questions'], 'Screenshot of the booking'],
    [-42, '20:00', 'Post the signup launch on your socials', 45, 'Growth', 'Nobody can register for an event they have not heard of.', ['Write the post (what, when, who: ages 13–18, free)', 'Link your city signup page on haven.hackclub.com', 'Post on every channel you have and pin it'], 'Link to the post'],
    [-40, '20:00', 'Ask HQ about the merch + certificate shipping cutoff for your country', 15, 'Lead', 'Merch and certificates come from HQ and only go to people who ship a game. Shipping abroad takes time.', ['Ask in #haven-help or email haven@hackclub.com', 'Write the cutoff date in the proof'], 'The cutoff date'],
    [-33, '20:00', 'Get the venue confirmed in writing', 60, 'Operations', 'Everything else depends on the venue. A verbal yes is not a yes.', ['Agree date, hours, rooms, WiFi and power', 'Ask for an email or a signed letter', 'Save it in your Drive'], 'Photo or PDF of the written confirmation'],
    [-26, '20:00', 'Confirm the adults: ≈1 per 35 attendees + a first-aider + a safeguarding officer', 60, 'Safety', 'HQ rule: adult supervision, at least one first-aid trained person and a safeguarding officer.', ['List how many attendees you expect', 'Ask teachers, parents, mentors', 'Get each adult to confirm in writing'], 'Names of the confirmed adults and their role'],
    [-22, '20:00', 'Send the parent guide + waivers to everyone registered', 45, 'Safety', 'HQ asks for this about 3 weeks before the event.', ['Fill in HQ\'s parent-guide template', 'Send it with the waiver link', 'Track who has signed'], 'Screenshot of the sent message'],
    [-15, '20:00', 'Send all printing to the printer', 60, 'Design', 'Signs, badges and posters take days to print.', ['Collect every file', 'Get a quote', 'Pay and confirm the pickup date'], 'Order confirmation or photo'],
    [-12, '20:00', 'Order food for both days', 45, 'Operations', 'Hungry teenagers don\'t ship games.', ['Count attendees + team + adults', 'Get two quotes', 'Order and confirm delivery times'], 'Order confirmation'],
    [-7, '20:00', 'Submit the budget to HQ', 60, 'Finance', 'HQ has a budget deadline before the event — check the exact date in your organizer guide.', ['List every cost with receipts or quotes', 'Submit it the way HQ asks'], 'Screenshot of the submission'],
    [-7, '15:00', 'Venue walkthrough + WiFi load test', 120, 'Operations', 'Find the problems a week early, not on the day.', ['Walk the rooms with the team', 'Connect 10+ devices and run a speed test', 'Check power strips, projector, toilets, exits'], 'Photos + speed-test screenshot'],
    [1, '14:00', 'Ship check: every game on itch.io with code on GitHub', 60, 'Program', 'HQ: every participant ships a playable game on itch.io with code on GitHub. Videos, private games and Drive links don\'t count.', ['Collect every itch.io + GitHub link', 'Open each one', 'Help anyone who hasn\'t shipped yet'], 'Shipped count / attendee count'],
    [3, '20:00', 'Thank sponsors, venue, mentors and adults', 45, 'Lead', 'You will want them again next year.', ['One personal message each', 'Share 2–3 photos from the event'], 'Screenshot of the messages'],
    [7, '20:00', 'Send the volunteer-hours list to HQ', 30, 'Lead', 'HQ signs volunteer hours for organizers when you give them an itemised list.', ['Dashboard → People → Export volunteer hours', 'Check it, then send it to HQ'], 'Screenshot of the sent email'],
  ],
};

// ================================================================== small helpers
let MEMO = {};
function resetMemo_() { MEMO = {}; }
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function setProp_(k, v) { PropertiesService.getScriptProperties().setProperty(k, String(v)); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function clean_(v, max) { return String(v === null || v === undefined ? '' : v).replace(/\r/g, '').trim().slice(0, max || 500); }
function yn_(v) { return v === true || /^(yes|true|on|1)$/i.test(String(v || '')) ? 'yes' : 'no'; }
function isDate_(s) { return /^\d{4}-\d\d-\d\d$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z').getTime()) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
function isEmail_(s) { return /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(s); }
function isUrl_(s) { return /^https?:\/\/[^\s<>"']+$/i.test(s); }
function isTz_(s) { return /^(UTC|GMT|Etc\/[\w+\-]+|[A-Za-z]+(\/[A-Za-z0-9_+\-]+){1,2})$/.test(s); }
/** "2026-10-09 20:00" (also accepts "2026-10-09T20:00" and a bare date → 20:00). Returns '' if invalid. */
function normDue_(s) {
  s = clean_(s, 25).replace('T', ' ');
  if (/^\d{4}-\d\d-\d\d$/.test(s)) s += ' 20:00';
  const m = s.match(/^(\d{4}-\d\d-\d\d) (\d\d):(\d\d)/);
  return m && isDate_(m[1]) && Number(m[2]) < 24 && Number(m[3]) < 60 ? s.slice(0, 16) : '';
}
function addDays_(ymd, n) { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function cell_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd HH:mm'); // a cell someone formatted as a date by hand
  return String(v);
}

// ================================================================== settings
function S_() {
  if (MEMO.S) return MEMO.S;
  const s = {};
  SETTINGS.forEach(d => { s[d[0]] = d[1]; });
  if (ss_().getSheetByName('Settings')) rows_('Settings').forEach(r => { if (r.key) s[r.key] = r.value; });
  MEMO.S = s;
  return s;
}
function tz_() {
  if (MEMO.tz) return MEMO.tz;
  MEMO.tz = 'Etc/UTC'; // placeholder while the Settings tab is read (a date cell in it would otherwise loop back here)
  let t = '';
  try { t = (ss_().getSheetByName('Settings') && S_().timezone) || Session.getScriptTimeZone(); } catch (e) { /* ignore */ }
  MEMO.tz = isTz_(t || '') ? t : 'Etc/UTC';
  return MEMO.tz;
}
function fmt_(d, pattern) { return Utilities.formatDate(d, tz_(), pattern || 'yyyy-MM-dd HH:mm'); }
function now_() { return fmt_(new Date()); }
function event_() { return S_().event_name || 'Haven'; }
function contact_() {
  if (S_().contact_name) return S_().contact_name;
  const a = activePeople_().find(p => access_(p) === 'admin');
  return a ? first_(a) : 'your lead';
}
function site_() { return (S_().site_url || DEFAULT_SITE).replace(/\/+$/, ''); }
function publicLink_() { const h = S_().hub_id; return site_() + '/' + (h ? '?hub=' + h : ''); }
/** A page of the hub, e.g. hubUrl_('admin/applications') — with ?hub= when the hub lives on the shared website. */
function hubUrl_(route) { return publicLink_() + '#/' + String(route || ''); }
function settingsOut_() { const s = S_(), o = {}; SETTINGS.forEach(d => { o[d[0]] = s[d[0]]; }); o.timezone = tz_(); return o; }
function eventOut_() {
  const s = S_();
  return { name: event_(), city: s.city, start: s.event_start, end: s.event_end, tagline: s.tagline, greeting: s.greeting || 'Hi', contact: contact_(), reminderHour: Number(s.reminder_hour) || 18 };
}
function saveSettingsRaw_(vals) {
  const rows = rows_('Settings'), add = [];
  Object.keys(vals).forEach(k => {
    const r = rows.find(x => x.key === k);
    if (r) { if (r.value !== vals[k]) { r.value = vals[k]; write_('Settings', r); } }
    else add.push({ key: k, value: vals[k], note: (SETTINGS.find(d => d[0] === k) || [])[2] || '' });
  });
  if (add.length) appendMany_('Settings', add);
  MEMO.S = null; MEMO.tz = null;
}
/** Adds a row for every setting that is missing, so the Settings tab explains itself. */
function ensureSettings_(overrides) {
  overrides = overrides || {};
  const have = rows_('Settings').map(r => r.key);
  const add = SETTINGS.filter(d => have.indexOf(d[0]) < 0).map(d => ({ key: d[0], value: overrides[d[0]] !== undefined ? overrides[d[0]] : d[1], note: d[2] }));
  if (add.length) appendMany_('Settings', add);
  MEMO.S = null; MEMO.tz = null;
}

// ================================================================== the Sheet as a database (by header name)
function sheet_(name) {
  let sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    const h = TABS[name] || [];
    if (h.length) sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#783D2B').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange('A:Z').setNumberFormat('@'); // plain text: dates stay exactly as typed
  }
  return sh;
}
/** Header row of a tab; appends any missing standard columns (so v3 sheets upgrade themselves). */
function header_(name) {
  if (MEMO['h:' + name]) return MEMO['h:' + name];
  const sh = sheet_(name), cols = Math.max(sh.getLastColumn(), 1);
  let h = sh.getRange(1, 1, 1, cols).getValues()[0].map(v => String(v).trim());
  while (h.length && !h[h.length - 1]) h.pop();
  const missing = (TABS[name] || []).filter(k => h.indexOf(k) < 0);
  if (missing.length) {
    sh.getRange(1, h.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#783D2B').setFontColor('#ffffff');
    h = h.concat(missing);
  }
  MEMO['h:' + name] = h;
  return h;
}
/** The tab exists already (reads of optional tabs don't create them). */
function has_(name) { return !!MEMO['h:' + name] || !!ss_().getSheetByName(name); }
function rows_(name) {
  if (MEMO['r:' + name]) return MEMO['r:' + name];
  const h = header_(name), sh = sheet_(name), last = sh.getLastRow();
  let out = [];
  if (last >= 2) {
    out = sh.getRange(2, 1, last - 1, h.length).getValues()
      .map((r, i) => ({ r: r, row: i + 2 })).filter(x => x.r.join('') !== '')
      .map(x => { const o = { _row: x.row }; h.forEach((k, j) => { o[k || '_c' + j] = cell_(x.r[j]); }); return o; });
  }
  MEMO['r:' + name] = out;
  return out;
}
function rowValues_(h, obj) { return h.map((k, j) => { const v = obj[k || '_c' + j]; return v === undefined || v === null ? '' : String(v); }); }
function write_(name, obj) {
  const h = header_(name), rg = sheet_(name).getRange(obj._row, 1, 1, h.length);
  rg.setNumberFormat('@'); rg.setValues([rowValues_(h, obj)]);
}
/** Writes many changed rows in one call (rewrites the block between the first and last changed row). */
function writeMany_(name, objs) {
  if (!objs.length) return;
  if (objs.length < 4) { objs.forEach(o => write_(name, o)); return; }
  const h = header_(name), all = rows_(name), byRow = {};
  all.forEach(o => { byRow[o._row] = o; });
  objs.forEach(o => { byRow[o._row] = o; });
  const lo = Math.min.apply(null, objs.map(o => o._row)), hi = Math.max.apply(null, objs.map(o => o._row)), vals = [];
  const blank = sheet_(name).getRange(lo, 1, hi - lo + 1, h.length).getValues();
  for (let r = lo; r <= hi; r++) vals.push(byRow[r] ? rowValues_(h, byRow[r]) : blank[r - lo].map(cell_));
  const rg = sheet_(name).getRange(lo, 1, vals.length, h.length); rg.setNumberFormat('@'); rg.setValues(vals);
}
function appendMany_(name, objs) {
  if (!objs.length) return objs;
  const h = header_(name), sh = sheet_(name), start = Math.max(sh.getLastRow(), 1) + 1;
  const rg = sh.getRange(start, 1, objs.length, h.length);
  rg.setNumberFormat('@'); rg.setValues(objs.map(o => rowValues_(h, o)));
  const memo = MEMO['r:' + name];
  objs.forEach((o, i) => { o._row = start + i; h.forEach((k, j) => { if (o[k || '_c' + j] === undefined) o[k || '_c' + j] = ''; }); if (memo) memo.push(o); });
  return objs;
}
function append_(name, obj) { return appendMany_(name, [obj])[0]; }
function replaceAll_(name, objs) {
  const h = header_(name), sh = sheet_(name), last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, h.length).clearContent();
  delete MEMO['r:' + name];
  if (objs.length) { const rg = sh.getRange(2, 1, objs.length, h.length); rg.setNumberFormat('@'); rg.setValues(objs.map(o => rowValues_(h, o))); }
  delete MEMO['r:' + name];
}
function deleteRows_(name, objs) {
  const sh = sheet_(name);
  objs.map(o => o._row).sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
  delete MEMO['r:' + name];
}
function log_(who, task, action, note) { append_('Log', { time: now_(), who: who, task: task, action: action, note: clean_(note, 500) }); }
function logMany_(items) { appendMany_('Log', items.map(x => ({ time: now_(), who: x[0], task: x[1], action: x[2], note: clean_(x[3], 500) }))); }
function report_(what, detail) { append_('Report', { time: now_(), what: what, detail: clean_(detail, 45000) }); }
function colLetter_(name, key) {
  let n = header_(name).indexOf(key) + 1, s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// ================================================================== people + access
function people_() { return rows_('People'); }
function activePeople_() { return people_().filter(p => p.active !== 'no'); }
/** People who own tasks (everyone active except read-only guests). */
function team_() { return activePeople_().filter(p => access_(p) !== 'viewer'); }
function access_(p) {
  const a = String((p && p.access) || '').toLowerCase().trim();
  if (RANK[a] !== undefined) return a;
  return String(p && p.is_lead).toLowerCase() === 'yes' ? 'admin' : 'member'; // v3 sheets
}
function isLead_(p) { return !!p && RANK[access_(p)] >= 2; }
function isAdmin_(p) { return !!p && access_(p) === 'admin'; }
function hasAdmin_() { return !!ss_().getSheetByName('People') && people_().some(p => p.active !== 'no' && p.token && access_(p) === 'admin'); }
function person_(token) {
  token = String(token || '');
  if (token.length < 10) return null;
  return people_().find(p => p.token === token && p.active !== 'no') || null;
}
function first_(p) { return String(p.name || '').split(' ')[0]; }
function tag_(p) { return /^@\w+/.test(p.handle || '') ? ' ' + p.handle : ''; }
function nameOf_(key) { if (!key) return 'Unassigned'; const p = people_().find(x => x.key === key); return p ? p.name : key; }
/** "-" or "unassigned" as an owner = nobody yet: anyone on the team can take it ("Take this task"). */
function isUnassigned_(v) { return /^(-|unassigned)$/i.test(String(v == null ? '' : v).trim()); }
const NOBODY = { key: '', name: 'Unassigned' };
function newToken_() { return Utilities.getUuid().replace(/-/g, ''); }
/** Password sign-in exists only on your own server (server/accounts.mjs): { username } or null. */
function account_(p) { return SELF_HOSTED && p && p.key && typeof HUB_SERVER.account === 'function' ? HUB_SERVER.account(p.key) : null; }
/** Server only: removes someone's password + signs them out everywhere (Reset sign-in, removed from the team). */
function dropAccount_(p) { if (SELF_HOSTED && p && typeof HUB_SERVER.dropAccount === 'function') HUB_SERVER.dropAccount(p.key); }
/** Every personal link carries the hub, the person's key (their name) and their secret token. The server refuses a key/token mismatch.
 *  Someone who made a password gets the sign-in page instead: their links carry no key any more. */
function linkFor_(p) {
  const h = S_().hub_id;
  if (account_(p)) return site_() + '/' + (h ? '?hub=' + h : '') + '#/signin';
  if (inviteMode_()) return hubUrl_(access_(p) === 'member' ? 'tasks' : 'admin'); // invites: messages carry no key — the person is signed in on their device
  return site_() + '/?' + (h ? 'hub=' + h + '&' : '') + 'u=' + encodeURIComponent(p.key) + '&t=' + p.token;
}
/** The message that goes with a personal link — or, with inv ({ url, expires }), with a single-use invite. */
function inviteText_(p, inv) {
  const link = linkFor_(p), g = S_().greeting || 'Hi', acc = account_(p);
  if (inv) {
    const viewer = access_(p) === 'viewer';
    return `${g}, ${first_(p)}! ${viewer ? `Here is your read-only guest invite to the ${event_()} Team Hub` : `Welcome to the ${event_()} organizing team! Here is your invite to our Team Hub`} — it works once, until ${niceDue_(inv.expires)}:\n${inv.url}\n\n` +
      `Open it on your phone and choose how you'll sign in${googleClientId_() ? ' (Google is the quickest)' : ''}. After that the hub opens straight to ${viewer ? 'our progress' : 'your tasks'}.\nIt's only for you — please don't forward it.`;
  }
  if (acc) return `${g}, ${first_(p)}! Sign in to the ${event_()} Team Hub with your username "${acc.username}" and your password:\n${link}\n\nForgot your password? Ask ${contact_()} to reset your sign-in.`;
  if (access_(p) === 'viewer') return `${g}, ${first_(p)}! Here is your read-only guest link to the ${event_()} Team Hub:\n${link}\n\nYou can see our progress and deadlines. Please don't share it.`;
  const gmail = googleClientId_() && (p.google_email || p.email) ? `\n\nOr press "Sign in with Google" on the hub and pick ${p.google_email || p.email}.` : '';
  return `${g}, ${first_(p)}! This is your personal ${event_()} Team Hub link (only for ${p.name}):\n${link}${gmail}\n\n` +
    `Open it → read your first task → press Start.\nFinished → Done + proof. Stuck → Blocked + what you need.\nDon't share it — it's your key.`;
}
function keyFor_(name) {
  const base = (String(name).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')[0] || 'person').slice(0, 20);
  const taken = people_().map(p => p.key);
  let k = base, i = 2;
  while (taken.indexOf(k) >= 0) k = base.slice(0, 18) + i++;
  return k;
}
function personOut_(p) {
  return { key: p.key, name: p.name, role: p.role, area: p.area, handle: p.handle, email: p.email, access: access_(p), notify: p.notify || 'auto',
    active: p.active !== 'no', telegram: !!p.chat_id, hasLink: !!p.token, password: !!account_(p), google: !!p.google_sub, google_email: p.google_email || '',
    backup: p.backup, works: p.works, weekend: p.weekend, one: p.one, ask: p.ask, joined_at: p.joined_at, invite: inviteStatus_(p) };
}

/** Opening the hub (every "me" load) stamps last_seen — at most every 5 minutes, and only that one cell, so it is safe without the lock. */
function touchSeen_(p) {
  if (!p || !p._row || (p.last_seen && p.last_seen >= fmt_(new Date(Date.now() - 5 * 60e3)))) return;
  const c = header_('People').indexOf('last_seen') + 1;
  if (c < 1) return;
  try { const now = now_(), rg = sheet_('People').getRange(p._row, c); rg.setNumberFormat('@'); rg.setValue(now); p.last_seen = now; } catch (e) { /* only a timestamp */ }
}
/** Name → when they were last on the hub: their last visit, or the last thing they did there (whichever is newer). */
function seenMap_(logAll) {
  const seen = {};
  (logAll || rows_('Log')).forEach(l => { if (l.who && ['system', 'bot', 'inbox'].indexOf(l.who) < 0 && !(seen[l.who] > l.time)) seen[l.who] = l.time; });
  people_().forEach(p => { if (p.last_seen && !(seen[p.name] > p.last_seen)) seen[p.name] = p.last_seen; });
  return seen;
}

// ================================================================== profile photos (small pictures kept in the People tab — never on the public page)
const PHOTO_DATA_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;
const PHOTO_URL_RE = /^https:\/\/lh3\.googleusercontent\.com\/[\w\-\/=.~%]+$/; // a Google account picture
/** '' (no photo), the photo, or null when it isn't a small picture. A Sheet cell holds 50 000 characters. */
function photoIn_(v) {
  v = String(v == null ? '' : v).trim();
  if (!v) return '';
  if (PHOTO_URL_RE.test(v) && v.length < 600) return v;
  return PHOTO_DATA_RE.test(v) && v.length <= 48000 ? v : null;
}
/** Anyone on the team sets their own photo; admins can set anyone's. */
function savePhoto_(me, b) {
  const p = b.key && b.key !== me.key ? findPerson_(b.key) : me;
  if (!p || p.active === 'no') return { ok: false, error: 'No such person.' };
  if (p.key !== me.key && !isAdmin_(me)) return { ok: false, code: 'forbidden', error: 'Only admins can change someone else\'s photo.' };
  const v = photoIn_(b.photo);
  if (v === null) return { ok: false, error: 'That picture is too big or not a JPG, PNG or WebP — pick another one.' };
  p.photo = v; write_('People', p);
  log_(me.name, '', v ? 'Photo changed' : 'Photo removed', p.key === me.key ? '' : p.name);
  return { ok: true, key: p.key, photo: v };
}

// ================================================================== Google sign-in (the person's Google account, matched by Google's id or by the email in People)
function googleClientId_() { return SELF_HOSTED ? (typeof HUB_SERVER.googleClientId === 'function' ? HUB_SERVER.googleClientId() : '') : (S_().google_client_id || SHARED_GOOGLE_CLIENT_ID); }
/** Apps Script: asks Google whether the sign-in is real (the server checks Google's signature itself, see server/google.mjs). */
function verifyGoogle_(b) {
  const cid = googleClientId_();
  if (!cid) return { error: 'Google sign-in is not set up for this hub yet.' };
  const tok = String(b.idToken || ''), nonce = String(b.nonce || '');
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(tok) || nonce.length < 16) return { error: 'Google sign-in failed — try again.' };
  const cache = CacheService.getScriptCache();
  if (cache.get('gn_' + nonce)) return { error: 'That Google sign-in was already used — press the button again.' };
  let j = {};
  try {
    const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tok), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return { error: 'Google did not accept that sign-in — press the button again.' };
    j = JSON.parse(r.getContentText() || '{}');
  } catch (e) { return { error: 'Could not reach Google — try again in a minute.' }; }
  if (['https://accounts.google.com', 'accounts.google.com'].indexOf(j.iss) < 0 || j.aud !== cid || Number(j.exp) * 1000 < Date.now() || j.nonce !== nonce) return { error: 'Google sign-in failed — press the button again.' };
  cache.put('gn_' + nonce, '1', 21600);
  return { claims: { sub: String(j.sub || ''), email: String(j.email || '').toLowerCase(), email_verified: String(j.email_verified) === 'true', name: String(j.name || ''), picture: String(j.picture || '') } };
}
/** Who this Google account is on the team: bound before (Google's id), or the email an admin typed into People (verified by Google). */
function googleFind_(c) {
  const sub = String(c.sub || ''), email = String(c.email || '').toLowerCase(), act = activePeople_();
  if (!sub) return { p: null };
  const p = act.find(q => q.google_sub === sub);
  if (p) return { p: p, bind: false };
  if (c.email_verified && email) {
    const q = act.find(x => !x.google_sub && (String(x.email || '').toLowerCase() === email || String(x.google_email || '').toLowerCase() === email));
    if (q) return { p: q, bind: true };
  }
  return { p: null };
}
function bindGoogle_(p, c) {
  const email = c.email_verified ? String(c.email || '').toLowerCase() : '';
  p.google_sub = String(c.sub); p.google_email = email;
  if (!p.email && email && !activePeople_().some(q => q.key !== p.key && q.email === email)) p.email = email; // reminders can now go there too
  if (!p.photo && PHOTO_URL_RE.test(String(c.picture || ''))) p.photo = String(c.picture);
  write_('People', p);
}
/** Holds a Google sign-in that isn't on the team yet for 30 minutes, so the join form can use the verified name + email. */
function googleTicket_(c) {
  const id = newToken_();
  CacheService.getScriptCache().put('gt_' + id, JSON.stringify({ sub: c.sub, email: c.email_verified ? String(c.email || '').toLowerCase() : '', name: clean_(c.name, 60) }), 1800);
  return id;
}
function ticketClaims_(id) {
  if (!/^[0-9a-f]{32}$/.test(String(id || ''))) return null;
  try { return JSON.parse(CacheService.getScriptCache().get('gt_' + id) || 'null'); } catch (e) { return null; }
}
/** → { ok, key, token, bound } or { ok:false, code:'not_on_team', name, email, ticket }. Both setups call it after Google said the sign-in is real. */
function googleSignIn_(c) {
  const f = googleFind_(c);
  if (!f.p) {
    const email = c.email_verified ? String(c.email || '').toLowerCase() : '';
    return { ok: false, code: 'not_on_team', name: clean_(c.name, 60), email: email, ticket: googleTicket_(c),
      error: `${email || 'This Google account'} isn't on the ${event_()} team yet. Apply to join, or ask ${contact_()} to add this email in People.` };
  }
  const p = f.p;
  if (f.bind) { bindGoogle_(p, c); log_(p.name, '', 'Google connected', p.google_email); }
  if (!p.token) { p.token = newToken_(); write_('People', p); refreshLinks(); }
  log_(p.name, '', 'Signed in', 'Google');
  return { ok: true, key: p.key, token: p.token, name: p.name, bound: !!f.bind };
}
/** Signed in already: connect this Google account, so next time "Sign in with Google" is enough. */
function googleLink_(key, c) {
  const p = findPerson_(key);
  if (!p || p.active === 'no') return { ok: false, error: 'No such person.' };
  if (people_().some(q => q.key !== p.key && q.google_sub === String(c.sub))) return { ok: false, error: 'That Google account is already connected to someone else on the team. Pick another account.' };
  bindGoogle_(p, c); log_(p.name, '', 'Google connected', p.google_email);
  return { ok: true, google: true, google_email: p.google_email, photo: p.photo || '' };
}
function googleUnlink_(me) {
  if (!me.google_sub) return { ok: true };
  me.google_sub = ''; me.google_email = ''; write_('People', me);
  log_(me.name, '', 'Google disconnected', '');
  return { ok: true };
}
/** Apps Script hubs: "Sign in with Google" → this person's key (the website keeps it like a personal link). Own server: server/app.mjs answers instead. */
function authGoogle_(_, b) {
  const v = verifyGoogle_(b);
  if (v.error) return { ok: false, error: v.error };
  const r = googleSignIn_(v.claims);
  return r.ok ? { ok: true, u: r.key, t: r.token, name: r.name } : r;
}
function authGoogleLink_(me, b) {
  const v = verifyGoogle_(b);
  return v.error ? { ok: false, error: v.error } : googleLink_(me.key, v.claims);
}

// ================================================================== tasks
function taskOut_(t) {
  return { id: t.id, owner: t.owner, title: t.title, area: t.area || '', due: t.due, mins: Number(t.mins) || 0, why: t.why,
    steps: t.steps ? String(t.steps).split('\n').filter(Boolean) : [], done_when: t.done_when,
    links: t.links ? String(t.links).split('\n').filter(Boolean).map(l => { const i = l.indexOf(' | '); return i > 0 ? { label: l.slice(0, i), url: l.slice(i + 3) } : { label: l, url: l }; }) : [],
    ask: t.ask, status: t.status || 'Not started', proof: t.proof, blocked_reason: t.blocked_reason, review: t.review || '', reviewed_by: t.reviewed_by || '',
    started_at: t.started_at, done_at: t.done_at, updated_at: t.updated_at, created_by: t.created_by || '',
    resources: t.resources ? String(t.resources).split('\n').filter(Boolean).map(refOut_).filter(Boolean) : [] };
}
function nextNum_() { return rows_('Tasks').reduce((m, t) => { const x = String(t.id).match(/^T(\d+)$/); return x ? Math.max(m, Number(x[1])) : m; }, 0) + 1; }
function idFor_(n) { return 'T' + (n < 1000 ? ('00' + n).slice(-3) : String(n)); }
function linksIn_(v, errs) {
  const arr = Array.isArray(v) ? v : String(v || '').split('\n').filter(s => s.trim()).map(l => { const i = l.indexOf(' | '); return i > 0 ? { label: l.slice(0, i), url: l.slice(i + 3) } : { label: l, url: l }; });
  return arr.slice(0, 10).map(l => {
    const url = clean_(l && l.url, 500), label = clean_((l && l.label) || url, 80).replace(/ \| /g, ' / ');
    if (!url) return '';
    if (!isUrl_(url)) { errs.push('Links must start with http:// or https:// (' + url.slice(0, 40) + ')'); return ''; }
    return label + ' | ' + url;
  }).filter(Boolean).join('\n');
}
/** Copies validated task fields from x into t. isNew = title and due are required. */
function taskFields_(x, t, errs, isNew) {
  if (isNew || x.title !== undefined) { const v = clean_(x.title, 200); if (!v) errs.push('Title is required.'); else t.title = v; }
  if (isNew || x.due !== undefined) { const v = normDue_(x.due); if (!v) errs.push('Due must be a date and time (YYYY-MM-DD HH:MM).'); else t.due = v; }
  if (isNew || x.mins !== undefined) { const m = parseInt(x.mins, 10); t.mins = String(m > 0 ? Math.min(m, 6000) : 30); }
  ['why', 'done_when', 'ask'].forEach(k => { if (x[k] !== undefined) t[k] = clean_(x[k], 1000); else if (isNew) t[k] = ''; });
  if (x.area !== undefined) t.area = clean_(x.area, 40); else if (isNew) t.area = '';
  if (x.steps !== undefined) t.steps = (Array.isArray(x.steps) ? x.steps : String(x.steps || '').split('\n')).map(s => clean_(s, 500)).filter(Boolean).slice(0, 30).join('\n');
  else if (isNew) t.steps = '';
  if (x.links !== undefined) t.links = linksIn_(x.links, errs); else if (isNew) t.links = '';
  if (x.resources !== undefined) t.resources = refsIn_(x.resources, errs); else if (isNew) t.resources = '';
}
function ownerFor_(v) {
  const k = String(v || '').trim().toLowerCase(), team = team_();
  if (!k) return null;
  return team.find(p => p.key.toLowerCase() === k) || team.find(p => String(p.name).toLowerCase() === k) ||
    (team.filter(p => first_(p).toLowerCase() === k).length === 1 ? team.find(p => first_(p).toLowerCase() === k) : null);
}
function addTasks_(me, b) {
  const x = b.task || {}, errs = [], base = { status: 'Not started' };
  const owners = (Array.isArray(x.owners) && x.owners.length ? x.owners : [x.owner]).map(v => String(v || '')).filter(Boolean);
  taskFields_(x, base, errs, true);
  if (!owners.length) errs.push('Choose who owns the task.');
  const ps = owners.map(k => { const p = isUnassigned_(k) ? NOBODY : ownerFor_(k); if (!p) errs.push('Unknown owner: ' + k); return p; });
  if (errs.length) return { ok: false, error: errs[0], errors: errs };
  let n = nextNum_();
  const now = now_(), made = ps.slice(0, 50).map(p => Object.assign({}, base, { id: idFor_(n++), owner: p.key, created_by: me.key, updated_at: now }));
  appendMany_('Tasks', made);
  logMany_(made.map(t => [me.name, t.id, 'Added', t.owner + ': ' + t.title]));
  tellChanges_(me, made.map(t => [null, snap_(t)]), b);
  groupNew_(made);
  return { ok: true, task: taskOut_(made[0]), tasks: made.map(taskOut_) };
}
/** One line in the organizer group about new tasks (owners hear about them through the change alerts). */
function groupNew_(tasks) {
  const open = tasks.filter(t => !t.owner);
  if (open.length) postGroup_(`📭 Up for grabs — anyone can take ${open.length === 1 ? 'it' : 'them'} in the Team Hub (Take this task):\n` + open.slice(0, 10).map(t => `• ${t.id} ${t.title} (due ${t.due})`).join('\n') + (open.length > 10 ? `\n…and ${open.length - 10} more` : ''));
  tasks = tasks.filter(t => t.owner);
  if (!tasks.length) return;
  const by = {};
  tasks.forEach(t => { (by[t.owner] = by[t.owner] || []).push(t); });
  if (tasks.length === 1) { const t = tasks[0], p = people_().find(q => q.key === t.owner) || { name: t.owner }; postGroup_(`🆕 New task for ${p.name}${tag_(p)}: ${t.id} — ${t.title} (due ${t.due})`); }
  else postGroup_(`🆕 ${tasks.length} new tasks: ` + Object.keys(by).map(k => `${nameOf_(k)} (${by[k].length})`).join(', '));
}
function editTask_(me, b) {
  const x = b.task || {}, t = rows_('Tasks').find(q => q.id === String(x.id || b.id || ''));
  if (!t) return { ok: false, error: 'No such task.' };
  const errs = [], before = snap_(t), prevOwner = t.owner;
  taskFields_(x, t, errs, false);
  if (x.owner !== undefined && x.owner !== t.owner) { const p = isUnassigned_(x.owner) ? NOBODY : ownerFor_(x.owner); if (!p) errs.push('Unknown owner: ' + x.owner); else t.owner = p.key; }
  if (x.status !== undefined && x.status !== t.status) {
    if (STATUSES.indexOf(x.status) < 0) errs.push('Unknown status.');
    else { t.status = x.status; if (x.status === 'Done' && !t.done_at) t.done_at = now_(); if (x.status !== 'Done') { t.done_at = ''; t.review = ''; t.reviewed_by = ''; } }
  }
  if (errs.length) return { ok: false, error: errs[0], errors: errs };
  t.updated_at = now_(); write_('Tasks', t);
  log_(me.name, t.id, 'Edited', editNote_(before, snap_(t)));
  tellChanges_(me, [[before, snap_(t)]], b);
  if (t.owner !== prevOwner) groupNew_([t]);
  return { ok: true, task: taskOut_(t) };
}
function bulkTasks_(me, b) {
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 500), op = String(b.op || '');
  const tasks = rows_('Tasks').filter(t => ids.indexOf(t.id) >= 0);
  if (!tasks.length) return { ok: false, error: 'Select at least one task.' };
  const before = tasks.map(snap_);
  let note = '', moved = [];
  if (op === 'reassign') {
    const p = isUnassigned_(b.owner) ? NOBODY : ownerFor_(b.owner); if (!p) return { ok: false, error: 'Choose a new owner.' };
    moved = tasks.filter(t => t.owner !== p.key); moved.forEach(t => { t.owner = p.key; });
    note = 'to ' + p.key; if (moved.length) { moved.forEach(t => { t.updated_at = now_(); }); writeMany_('Tasks', moved); }
  } else if (op === 'shift') {
    const d = parseInt(b.days, 10); if (!d || Math.abs(d) > 365) return { ok: false, error: 'Days must be between -365 and 365.' };
    tasks.forEach(t => { if (normDue_(t.due)) t.due = addDays_(t.due.slice(0, 10), d) + t.due.slice(10, 16); }); note = (d > 0 ? '+' : '') + d + ' days';
  } else if (op === 'status') {
    if (['Not started', 'In progress', 'Dropped'].indexOf(b.status) < 0) return { ok: false, error: 'Bulk status can be Not started, In progress or Dropped.' };
    tasks.forEach(t => { t.status = b.status; if (b.status === 'Not started') { t.done_at = ''; t.review = ''; t.reviewed_by = ''; } }); note = b.status;
  } else if (op === 'area') {
    const a = clean_(b.area, 40); tasks.forEach(t => { t.area = a; }); note = a;
  } else return { ok: false, error: 'Unknown bulk action.' };
  if (op !== 'reassign') { const now = now_(); tasks.forEach(t => { t.updated_at = now; }); writeMany_('Tasks', tasks); }
  logMany_(tasks.map(t => [me.name, t.id, 'Bulk ' + op, note]));
  tellChanges_(me, tasks.map((t, i) => [before[i], snap_(t)]), b);
  groupNew_(moved);
  return { ok: true, tasks: tasks.map(taskOut_) };
}
function importTasks_(me, b) {
  const rows = Array.isArray(b.rows) ? b.rows.slice(0, 300) : [], errors = [], made = [];
  if (!rows.length) return { ok: false, error: 'Nothing to import.' };
  rows.forEach((x, i) => {
    const e = [], t = { status: 'Not started' };
    taskFields_(x || {}, t, e, true);
    const p = x && isUnassigned_(x.owner) ? NOBODY : ownerFor_(x && x.owner);
    if (!p) e.push(x && x.owner ? `Unknown owner "${String(x.owner).slice(0, 30)}"` : 'Owner is missing (write "-" for unassigned)');
    if (e.length) errors.push({ row: i + 1, errors: e }); else made.push(Object.assign(t, { owner: p.key }));
  });
  if (b.dryRun || errors.length) return { ok: !errors.length, dryRun: !!b.dryRun, count: made.length, errors: errors, error: errors.length ? `${errors.length} row(s) have problems` + (b.dryRun ? ' — fix them and check again.' : ' — nothing was imported.') : '' };
  let n = nextNum_();
  const now = now_();
  made.forEach(t => { t.id = idFor_(n++); t.created_by = me.key; t.updated_at = now; });
  appendMany_('Tasks', made);
  logMany_([[me.name, '', 'Imported', made.length + ' tasks']]);
  tellChanges_(me, made.map(t => [null, snap_(t)]), b);
  groupNew_(made);
  return { ok: true, count: made.length, tasks: made.map(taskOut_) };
}
function deleteTasks_(me, b) {
  const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(String), tasks = rows_('Tasks').filter(t => ids.indexOf(t.id) >= 0);
  if (!tasks.length) return { ok: false, error: 'No such task.' };
  const info = tasks.map(t => [me.name, t.id, 'Deleted', t.owner + ': ' + t.title]), before = tasks.map(snap_);
  deleteRows_('Tasks', tasks);
  logMany_(info);
  tellChanges_(me, before.map(s => [s, null]), b);
  return { ok: true, deleted: tasks.map(t => t.id) };
}

/** "Update the whole plan" (admin): a CSV with every task. A row with an id updates that task (status and proof stay), a row without one is a new task.
 *  dropMissing: open tasks that are not in the file become Dropped (finished tasks are never touched).
 *  renumber: afterwards every task gets a new id in due-date order (T001 = first due), dropped ones last.
 *  dryRun: only says what would change. Everyone affected gets ONE message about their new plan. */
function syncTasks_(me, b) {
  const rows = Array.isArray(b.rows) ? b.rows.slice(0, 1000) : [];
  if (!rows.length) return { ok: false, error: 'Nothing to import.' };
  const all = rows_('Tasks'), byId = {}, seen = {}, errors = [], plan = [];
  all.forEach(t => { byId[t.id] = t; });
  rows.forEach((x, i) => {
    x = x || {};
    const e = [], id = clean_(x.id, 12).toUpperCase(), cur = id ? byId[id] || null : null;
    if (id && !cur) e.push(`There is no task ${id} — leave the id empty for a new task`);
    if (id && seen[id]) e.push(`${id} is in the file twice`);
    if (id) seen[id] = true;
    const t = cur ? Object.assign({}, cur) : { status: 'Not started' };
    taskFields_(x, t, e, !cur);
    const p = isUnassigned_(x.owner) ? NOBODY : ownerFor_(x.owner);
    if (!p) e.push(x.owner ? `Unknown owner "${String(x.owner).slice(0, 30)}"` : 'Owner is missing (write "-" for unassigned)'); else t.owner = p.key;
    if (e.length) errors.push({ row: i + 1, errors: e }); else plan.push({ cur: cur, t: t });
  });
  if (errors.length) return { ok: false, dryRun: !!b.dryRun, errors: errors, error: `${errors.length} row(s) have problems — fix them and check again. Nothing was changed.` };
  const inFile = {};
  plan.forEach(x => { if (x.cur) inFile[x.cur.id] = true; });
  const drop = b.dropMissing ? all.filter(t => !inFile[t.id] && ['Done', 'Dropped'].indexOf(t.status) < 0) : [];
  const changed = x => !x.cur || SYNC_FIELDS.some(k => String(x.cur[k] || '') !== String(x.t[k] || ''));
  const befores = plan.map(x => snap_(x.cur)).concat(drop.map(snap_));
  const nNew = plan.filter(x => !x.cur).length, nUpd = plan.filter(x => x.cur && changed(x)).length;
  if (b.dryRun) {
    const items = [];
    plan.forEach((x, i) => diffTask_(befores[i], snap_(x.t)).forEach(it => items.push(it)));
    drop.forEach((t, j) => diffTask_(befores[plan.length + j], snap_(Object.assign({}, t, { status: 'Dropped' }))).forEach(it => items.push(it)));
    const per = {};
    items.forEach(it => {
      const c = per[it.key] = per[it.key] || { key: it.key, name: nameOf_(it.key), added: 0, removed: 0, dates: 0, edits: 0 };
      c[CHANGE_GROUP[it.kind]]++;
    });
    return { ok: true, dryRun: true, count: plan.length, added: nNew, updated: nUpd, dropped: drop.length, unchanged: plan.length - nNew - nUpd,
      people: Object.keys(per).map(k => per[k]), changes: items.slice(0, 300).map(it => ({ who: nameOf_(it.key), text: changeLines_([it])[0] })) };
  }
  flushChanges(true); // alerts still waiting go out first, with the task numbers they were written with
  const now = now_(), upd = [], add = [];
  let n = nextNum_();
  plan.forEach(x => {
    if (x.cur) { if (changed(x)) { Object.assign(x.cur, x.t, { updated_at: now }); upd.push(x.cur); } }
    else { x.t.id = idFor_(n++); x.t.created_by = me.key; x.t.updated_at = now; add.push(x.t); }
  });
  drop.forEach(t => { t.status = 'Dropped'; t.updated_at = now; upd.push(t); });
  writeMany_('Tasks', upd);
  appendMany_('Tasks', add);
  let map = null;
  if (b.renumber) {
    const num = id => { const m = String(id).match(/^T(\d+)$/); return m ? Number(m[1]) : 1e9; };
    const list = rows_('Tasks').slice().sort((p, q) => ((p.status === 'Dropped') - (q.status === 'Dropped')) || (p.due < q.due ? -1 : p.due > q.due ? 1 : 0) || num(p.id) - num(q.id));
    map = {};
    list.forEach((t, i) => { map[t.id] = idFor_(i + 1); });
    list.forEach(t => { t.id = map[t.id]; });
    replaceAll_('Tasks', list);
  }
  const pairs = plan.map((x, i) => [befores[i], snap_(x.cur || x.t)]).concat(drop.map((t, j) => [befores[plan.length + j], snap_(t)]));
  tellChanges_(me, pairs, b, { plan: true, now: true });
  if (b.notify !== false && S_().change_alerts !== 'no') postGroup_(`🗂 The task plan was updated: ${nNew} new, ${nUpd} changed, ${drop.length} dropped${map ? ', and every task has a new number in date order' : ''}. Everyone got a message with their part.`);
  log_(me.name, '', 'Plan updated', `${nNew} new, ${nUpd} changed, ${drop.length} dropped${map ? ', renumbered by date' : ''}`);
  const moves = map ? Object.keys(map).filter(k => k !== map[k]) : [];
  if (moves.length) report_('Tasks renumbered', moves.map(k => k + ' → ' + map[k]).join(', '));
  return { ok: true, added: nNew, updated: nUpd, dropped: drop.length, renumbered: map };
}
const SYNC_FIELDS = ['owner', 'title', 'due', 'mins', 'why', 'steps', 'done_when', 'links', 'ask', 'area', 'resources'];

// ================================================================== Files: links (Canva, Figma, Sheets…) + the team files repo + what each task needs
const RES_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** What a link points at, from its address — decides the icon and the button ("Edit in Canva"). */
function kindOf_(url) {
  const u = String(url || '').toLowerCase();
  if (/^https:\/\/([\w-]+\.)?canva\.(com|link)\//.test(u)) return 'canva';
  if (/^https:\/\/([\w-]+\.)?figma\.com\//.test(u)) return 'figma';
  if (/docs\.google\.com\/spreadsheets\//.test(u)) return 'sheet';
  if (/docs\.google\.com\/forms\/|forms\.gle\//.test(u)) return 'form';
  if (/docs\.google\.com\/document\//.test(u)) return 'doc';
  if (/docs\.google\.com\/presentation\//.test(u)) return 'slides';
  if (/(drive|docs)\.google\.com\//.test(u)) return 'drive';
  if (/^https:\/\/(www\.)?github\.com\//.test(u)) return 'github';
  if (/(youtube\.com|youtu\.be|vimeo\.com)\/|\.(mp4|mov|webm)(\?|$)/.test(u)) return 'video';
  if (/\.(png|jpe?g|gif|webp)(\?|$)/.test(u)) return 'image';
  if (/\.pdf(\?|$)/.test(u)) return 'pdf';
  return 'link';
}
function resources_() {
  if (MEMO.res) return MEMO.res;
  const by = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.section).localeCompare(String(b.section)) || String(a.title).localeCompare(String(b.title));
  MEMO.res = rows_('Resources').filter(r => r.id && r.title && (r.url || r.file)).sort(by);
  return MEMO.res;
}
function resourceOut_(r) {
  const o = { id: r.id, title: r.title, url: r.url, kind: r.kind || kindOf_(r.url), section: r.section || '', private: r.private === 'yes' || r.private === 'leads', leads: r.private === 'leads', thumb: r.thumb || '', note: r.note || '' };
  if (r.file) Object.assign(o, { url: '', file: true, mime: r.mime || '', size: Number(r.size) || 0, preview: r.preview || '', by: r.added_by || '', added_at: r.added_at || '' }); // an upload: the website asks file.get for it
  return o;
}
/** private: 'no' = everyone with access (guests too), 'yes' = the team (not guests), 'leads' = leads and admins only. */
function seesRes_(lvl, r) { return r.private === 'leads' ? RANK[lvl] >= 2 : r.private === 'yes' ? lvl !== 'viewer' : true; }
/** One line of a task's "what you need" → an item: a Files link id, or gh:<path in the team files repo> (a trailing / = a folder). */
function refOut_(ref) {
  if (/^gh:/.test(ref)) {
    const path = ref.slice(3).replace(/\/+$/, ''), folder = /\/$/.test(ref);
    return { ref: ref, kind: folder ? 'folder' : 'file', path: path, title: path.split('/').pop(), folder: folder };
  }
  const r = resources_().find(x => x.id === ref);
  return r ? Object.assign({ ref: ref }, resourceOut_(r)) : null;
}
function refsIn_(v, errs) {
  const out = [];
  (Array.isArray(v) ? v : String(v || '').split('\n')).map(s => String(s || '').trim()).filter(Boolean).forEach(ref => {
    if (/^gh:/.test(ref)) {
      const p = ref.slice(3).replace(/^\/+/, '');
      if (!p || p.length > 300 || /(^|\/)\.\.?(\/|$)/.test(p) || /[\u0000-\u001f]/.test(p)) { errs.push('That file path looks wrong: ' + ref.slice(0, 60)); return; }
      ref = 'gh:' + p;
    } else if (!RES_ID_RE.test(ref) || !resources_().some(r => r.id === ref)) { errs.push('No such link in Files: ' + ref.slice(0, 40)); return; }
    if (out.indexOf(ref) < 0) out.push(ref);
  });
  if (out.length > 12) errs.push('A task can list at most 12 files and links.');
  return out.slice(0, 12).join('\n');
}
function resourceFields_(x, r, errs) {
  const title = clean_(x.title, 120), url = clean_(x.url, 800), thumb = clean_(x.thumb, 800);
  if (!title) errs.push('Give the link a title.');
  if (!/^https:\/\/[^\s<>"']+$/i.test(url)) errs.push('The link must start with https:// (' + url.slice(0, 40) + ')');
  if (thumb && !/^https:\/\/[^\s<>"']+$/i.test(thumb)) errs.push('The picture link must start with https://');
  Object.assign(r, { title: title, url: url, kind: kindOf_(url), section: clean_(x.section, 40), private: x.private === 'leads' || x.leads === true ? 'leads' : yn_(x.private), thumb: thumb, note: clean_(x.note, 300), order: String(parseInt(x.order, 10) || 0) });
}
/** Leads: add or change links on the Files page. One ({resource}) or many ({resources: [...]}, matched by id — so a list can be re-imported). */
function saveResources_(me, b) {
  const list = Array.isArray(b.resources) ? b.resources.slice(0, 300) : [b.resource || {}], all = rows_('Resources'), errs = [], add = [], upd = [];
  let n = all.reduce((m, r) => { const x = String(r.id).match(/^r(\d+)$/); return x ? Math.max(m, Number(x[1])) : m; }, 0) + 1;
  list.forEach((x, i) => {
    x = x || {};
    const e = [], id = clean_(x.id, 40).toLowerCase(), cur = id ? all.find(r => r.id === id) || add.find(r => r.id === id) : null;
    if (id && !RES_ID_RE.test(id)) e.push('Ids are small letters, digits and dashes: ' + id);
    const r = cur || { id: id || 'r' + n++, added_by: me.key, added_at: now_() };
    if (cur && cur.file) { // an upload: only its title, section, note, order and who sees it change
      const t = clean_(x.title, 120); if (!t) e.push('Give the file a title.');
      Object.assign(cur, { title: t || cur.title, section: clean_(x.section, 40), note: clean_(x.note, 300), private: x.private === 'leads' || x.leads === true ? 'leads' : yn_(x.private), order: String(parseInt(x.order, 10) || 0) });
    } else resourceFields_(x, r, e);
    if (e.length) errs.push((list.length > 1 ? `Row ${i + 1}: ` : '') + e[0]);
    else if (!cur) add.push(r);
    else if (upd.indexOf(r) < 0 && add.indexOf(r) < 0) upd.push(r);
  });
  if (errs.length) return { ok: false, error: errs[0], errors: errs };
  writeMany_('Resources', upd); appendMany_('Resources', add); MEMO.res = null;
  log_(me.name, '', 'Files', `${add.length} link(s) added, ${upd.length} changed`);
  if (!b.quiet) feedFiles_(me.name, add);
  return { ok: true, resources: resources_().map(resourceOut_), resource: resourceOut_(add[0] || upd[0]) };
}
function deleteResource_(me, b) {
  const r = rows_('Resources').find(x => x.id === String(b.id || ''));
  if (!r) return { ok: false, error: 'No such link.' };
  if (!isLead_(me) && !(r.file && r.added_by === me.key)) return { ok: false, code: 'forbidden', error: 'Only leads — or whoever uploaded the file — can delete it.' };
  const used = rows_('Tasks').filter(t => String(t.resources || '').split('\n').indexOf(r.id) >= 0);
  if (used.length && !b.force) return { ok: false, code: 'used', tasks: used.map(t => t.id), error: `${used.length} task(s) list this link (${used.slice(0, 5).map(t => t.id).join(', ')}). Delete it anyway to remove it from them too.` };
  if (used.length) { used.forEach(t => { t.resources = String(t.resources).split('\n').filter(x => x !== r.id).join('\n'); }); writeMany_('Tasks', used); }
  deleteRows_('Resources', [r]); MEMO.res = null;
  if (r.file) { try { DriveApp.getFileById(r.file).setTrashed(true); } catch (e) { /* already gone */ } }
  log_(me.name, '', 'Files', (r.file ? 'File' : 'Link') + ' deleted: ' + r.title);
  return { ok: true, id: r.id, tasks: used.map(t => t.id) };
}
function filesOut_() { const S = S_(); return { repo: S.files_repo || '', branch: S.files_branch || 'main', server: SELF_HOSTED }; }
function filesList_(me) {
  const viewer = access_(me) === 'viewer';
  return { ok: true, files: filesOut_(), resources: resources_().filter(r => seesRes_(access_(me), r)).map(resourceOut_) };
}

/** Admin, once after moving files to a new place: task links that point into an old GitHub repo move to "what you need" or to a new address.
 *  b = { prefix: 'https://github.com/owner/old-repo/', branch: 'main', map: { 'path/in/old/repo': 'files-link-id' | 'gh:new/path' | 'https://…' | '' (= drop) }, dryRun }
 *  Nobody gets a message: only where the links point changes. */
function relinkTasks_(me, b) {
  const prefix = String(b.prefix || '').replace(/\/+$/, '') + '/', map = b.map || {}, branch = String(b.branch || 'main'), errs = [];
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/$/.test(prefix)) return { ok: false, error: 'prefix must look like https://github.com/owner/repo/' };
  Object.keys(map).forEach(k => { const v = String(map[k] || ''); if (v && !/^https:\/\//.test(v) && !/^gh:[^.]/.test(v) && !resources_().some(r => r.id === v)) errs.push(`"${k}" → "${v}" is not a link, a gh: path or a Files id`); });
  if (errs.length) return { ok: false, error: errs[0], errors: errs };
  const has = k => Object.prototype.hasOwnProperty.call(map, k);
  const look = path => { path = path.replace(/\/+$/, ''); return has(path) ? String(map[path] || '') : has(path + '/') ? String(map[path + '/'] || '') : null; };
  const changed = [], unmapped = [], counts = { moved: 0, rewritten: 0, dropped: 0 };
  rows_('Tasks').forEach(t => {
    if (!t.links) return;
    const keep = [], refs = String(t.resources || '').split('\n').filter(Boolean);
    let touched = false;
    String(t.links).split('\n').filter(Boolean).forEach(line => {
      const i = line.indexOf(' | '), label = i > 0 ? line.slice(0, i) : '', url = i > 0 ? line.slice(i + 3) : line;
      const m = url.indexOf(prefix) === 0 ? url.slice(prefix.length).match(/^(?:blob|tree)\/([^/]+)\/(.+)$/) : null;
      if (!m || m[1] !== branch) { keep.push(line); return; }
      let path; try { path = decodeURIComponent(m[2].split('#')[0].split('?')[0]); } catch (e) { path = m[2]; }
      const to = look(path);
      if (to === null) { unmapped.push({ task: t.id, path: path }); keep.push(line); return; }
      touched = true;
      if (!to) counts.dropped++;
      else if (/^https:\/\//.test(to)) { keep.push((label || to) + ' | ' + to); counts.rewritten++; }
      else { if (refs.indexOf(to) < 0) refs.push(to); counts.moved++; }
    });
    if (touched) changed.push({ t: t, links: keep.join('\n'), resources: refs.slice(0, 12).join('\n') });
  });
  const out = { ok: true, dryRun: !!b.dryRun, tasks: changed.length, moved: counts.moved, rewritten: counts.rewritten, dropped: counts.dropped, unmapped: unmapped };
  if (b.dryRun || !changed.length) return out;
  const now = now_();
  changed.forEach(c => { c.t.links = c.links; c.t.resources = c.resources; c.t.updated_at = now; });
  writeMany_('Tasks', changed.map(c => c.t));
  logMany_(changed.map(c => [me.name, c.t.id, 'Links moved', 'to Files']));
  return out;
}

// ================================================================== uploads: files the team adds on the Files page (a private Drive folder / data/files on your own server)
const UPLOAD_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv',
  'application/zip': 'zip', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'font/ttf': 'ttf', 'font/otf': 'otf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx' };
function filesFolder_() {
  const id = prop_('FILES_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recreate below */ } }
  const f = DriveApp.createFolder(event_() + ' — Team Hub files');
  setProp_('FILES_FOLDER_ID', f.getId());
  return f;
}
function uploadKind_(mime) {
  const e = UPLOAD_TYPES[mime] || '';
  return /^image\//.test(mime) ? 'image' : e === 'pdf' ? 'pdf' : e === 'mp4' ? 'video' : /^(docx|xlsx|pptx)$/.test(e) ? 'office' : e === 'zip' ? 'zip' : /^(txt|csv)$/.test(e) ? 'text' : /^(ttf|otf)$/.test(e) ? 'font' : 'file';
}
/** Anyone on the team: { data (base64), mime, fname, title, section, note, private, preview (small data: picture) } → a new tile on the Files page. */
function uploadFile_(me, b) {
  const data = String(b.data || ''), mime = String(b.mime || ''), preview = String(b.preview || '');
  if (!UPLOAD_TYPES[mime]) return { ok: false, error: 'That kind of file can\'t be uploaded — use a picture, PDF, Word, Excel, PowerPoint, ZIP, MP4, MP3, font or text file. Anything else: put it in Drive and add a link.' };
  if (!/^[A-Za-z0-9+\/=]+$/.test(data) || data.length > 9000000) return { ok: false, error: 'The file is too big (max about 6 MB). Put bigger files in Drive or Canva and add a link instead.' };
  if (preview && !(PHOTO_DATA_RE.test(preview) && preview.length <= 48000)) return { ok: false, error: 'The preview picture is too big.' };
  let priv = b.private === 'leads' ? 'leads' : b.private === 'no' ? 'no' : 'yes'; // team only unless the uploader chose otherwise
  if (priv === 'leads' && !isLead_(me)) priv = 'yes';
  const title = clean_(b.title, 120) || clean_(b.fname, 120) || 'File';
  const base = String(b.fname || title).replace(/\.[A-Za-z0-9]+$/, '').replace(/[^\w.\- ]+/g, '').trim().slice(0, 60) || 'file';
  let f;
  try { f = filesFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(data), mime, base + '.' + UPLOAD_TYPES[mime])); f.setDescription('library|' + me.key); }
  catch (err) { botLog_('upload', String(err)); return { ok: false, error: 'Could not save the file: ' + String(err).slice(0, 80) }; }
  const all = rows_('Resources'), n = all.reduce((m, r) => { const x = String(r.id).match(/^r(\d+)$/); return x ? Math.max(m, Number(x[1])) : m; }, 0) + 1;
  const r = { id: 'r' + n, title: title, url: '', kind: uploadKind_(mime), section: clean_(b.section, 40) || 'Uploads', private: priv, thumb: '', note: clean_(b.note, 300), order: '0',
    added_by: me.key, added_at: now_(), file: f.getId(), mime: mime, size: String(Math.floor(data.replace(/=+$/, '').length * 3 / 4)), preview: preview };
  append_('Resources', r); MEMO.res = null;
  log_(me.name, '', 'File uploaded', title);
  feedFiles_(me.name, [r]);
  return { ok: true, resource: resourceOut_(r), resources: resources_().filter(x => seesRes_(access_(me), x)).map(resourceOut_) };
}
/** An uploaded file, for someone allowed to see it (the same rule as its tile on the Files page). */
function libraryFile_(me, q) {
  const r = rows_('Resources').find(x => x.id === String(q.id || ''));
  if (!r || !r.file || !seesRes_(access_(me), r)) return { ok: false, error: 'File not found.' };
  try { const f = DriveApp.getFileById(r.file), blob = f.getBlob(); return { ok: true, name: f.getName(), mime: blob.getContentType(), data: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) }; }
  catch (e) { return { ok: false, error: 'File not found — it may have been deleted.' }; }
}
/** "📁 Ann added “Poster v2” to Files" in the organizer group — never for leads-only links. */
function feedFiles_(who, rs) {
  if (S_().feed_files === 'no') return;
  const shown = (rs || []).filter(r => r.private !== 'leads');
  if (!shown.length) return;
  const one = shown[0], what = r => r.file ? 'file' : 'link';
  postGroup_(shown.length === 1 ? `📁 ${who} added the ${what(one)} “${one.title}” to Files${one.section ? ' → ' + one.section : ''}.`
    : `📁 ${who} added ${shown.length} files and links to Files: ` + shown.slice(0, 6).map(r => '“' + r.title + '”').join(', ') + (shown.length > 6 ? '…' : ''));
}
/** Own server: new files in the team files repo (after a pull). */
function feedRepo_(paths) {
  if (S_().feed_files === 'no' || !paths || !paths.length) return;
  postGroup_(`📁 New in the team files: ` + paths.slice(0, 8).map(p => String(p).split('/').pop()).join(', ') + (paths.length > 8 ? ` …and ${paths.length - 8} more` : '') + '. Open Files in the Team Hub.');
}

// ================================================================== participant signups (the total from HQ's signup page — typed by a lead, sent to the bot, or pushed by a script)
function signups_() {
  if (!has_('Signups')) return [];
  return rows_('Signups').filter(r => isDate_(r.date) && String(r.count) !== '').map(r => ({ date: r.date, count: Number(r.count) || 0, source: r.source || '', note: r.note || '', by: r.by || '' }))
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}
function signupsOut_() {
  const S = S_(), list = signups_(), last = list[list.length - 1] || null;
  return { list: list.slice(-120), total: last ? last.count : 0, date: last ? last.date : '', goal: parseInt(S.signup_goal, 10) || 0, rate: Number(S.funding_per_signup) || 0 };
}
/** "📈 Signups: 57 (+5 since Mon 5 Oct) · goal 180 (32%) · ≈ $185 from HQ" — '' before the first count. */
function signupLine_() {
  const o = signupsOut_();
  if (!o.date) return '';
  const prev = o.list.length > 1 ? o.list[o.list.length - 2] : null, d = prev ? o.total - prev.count : 0;
  return `📈 Signups: ${o.total}` + (prev ? ` (${d >= 0 ? '+' : ''}${d} since ${niceDue_(prev.date)})` : '') + (o.goal ? ` · goal ${o.goal} (${Math.round(100 * o.total / o.goal)}%)` : '') + (o.rate ? ` · ≈ $${Math.round(o.total * o.rate)} from HQ` : '');
}
/** Today's total (one row per day — a second count on the same day replaces it). opts: { date, note, source, quiet }. */
function recordSignups_(who, count, opts) {
  opts = opts || {};
  if (!/^\s*\d{1,6}\s*$/.test(String(count == null ? '' : count))) return { ok: false, error: 'The count is a whole number, e.g. 57.' };
  const n = parseInt(count, 10), today = fmt_(new Date(), 'yyyy-MM-dd'), date = opts.date ? String(opts.date) : today;
  if (!isDate_(date)) return { ok: false, error: 'The date must be YYYY-MM-DD.' };
  if (date > today) return { ok: false, error: 'That date is in the future.' };
  const before = signupsOut_(), row = rows_('Signups').find(r => r.date === date);
  const o = { date: date, count: String(n), source: clean_(opts.source || 'by hand', 40), note: clean_(opts.note, 200), by: clean_(who, 60), time: now_() };
  if (row) { Object.assign(row, o); write_('Signups', row); } else append_('Signups', o);
  log_(clean_(who, 60), '', 'Signups', n + (date !== today ? ' on ' + date : '') + (o.note ? ' — ' + o.note : ''));
  const post = !opts.quiet && S_().feed_signups !== 'no' && date >= before.date && !(n === before.total && date === before.date);
  if (post) postGroup_(signupLine_());
  return { ok: true, signups: signupsOut_(), posted: post };
}
function saveSignups_(me, b) { return recordSignups_(me.name, b.count, { date: b.date, note: b.note, source: 'by hand' }); }
function deleteSignups_(me, b) {
  const row = rows_('Signups').find(r => r.date === String(b.date || ''));
  if (!row) return { ok: false, error: 'No count for that day.' };
  deleteRows_('Signups', [row]);
  log_(me.name, '', 'Signups removed', row.date + ': ' + row.count);
  return { ok: true, signups: signupsOut_() };
}

// ================================================================== the feed key: small scripts that report into the hub (the inbox watcher, a signups counter)
function feedKey_() { return prop_('FEED_KEY'); }
function feedOk_(b) { const k = feedKey_(), g = String((b && b.key) || ''); return !!k && g.length === k.length && g === k; }
/** Where a script sends its reports: this hub's API address. */
function apiUrl_() { return SELF_HOSTED ? (HUB_SERVER.publicUrl() || site_()) + '/api' : HUB_RE.test(S_().hub_id || '') ? 'https://script.google.com/macros/s/' + S_().hub_id + '/exec' : ''; }
/** Admins: the feed key (made the first time; renew = a new one, the old one stops working). */
function feedKeyAction_(me, b) {
  if (b.renew || !feedKey_()) { setProp_('FEED_KEY', 'fk_' + newToken_() + newToken_()); log_(me.name, '', 'Feed key', b.renew ? 'renewed — update your scripts' : 'made'); }
  return { ok: true, key: feedKey_(), api: apiUrl_() };
}
function pushSignups_(_, b) {
  if (!feedOk_(b)) return { ok: false, code: 'auth', error: 'Wrong feed key — copy it again from Dashboard → Settings → Connections.' };
  const src = clean_(b.source, 40) || 'script';
  return recordSignups_(src, b.count, { source: src, note: b.note });
}

// ================================================================== inbox: new emails, reported by the inbox watcher (apps-script/inbox-watcher.gs runs in the mailbox's own Google account)
function inboxOut_(r) { return { id: r.id, time: r.time, from: r.from, subject: r.subject, snippet: r.snippet, link: r.link, status: r.status || 'new', handled_by: r.handled_by || '', task: r.task || '', mailbox: r.mailbox || '' }; }
function inbox_() { if (!has_('Inbox')) return []; return rows_('Inbox').filter(r => r.id).slice().sort((a, b) => a.time < b.time ? 1 : a.time > b.time ? -1 : 0); }
function timeIn_(v) { const s = String(v || ''); if (/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(s)) return s; const d = new Date(s); return isNaN(d.getTime()) ? now_() : fmt_(d); }
function fromName_(f) { const m = String(f || '').match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/); return m ? m[1] : String(f || ''); }
/** The watcher: { key, mailbox, items: [{ id, time, from, subject, snippet, link }] } — an email it already sent is skipped. */
function pushInbox_(_, b) {
  if (!feedOk_(b)) return { ok: false, code: 'auth', error: 'Wrong feed key — copy it again from Dashboard → Settings → Connections.' };
  const items = Array.isArray(b.items) ? b.items.slice(0, 50) : [], have = {}, add = [], box = clean_(b.mailbox, 120);
  rows_('Inbox').forEach(r => { have[r.id] = 1; });
  items.forEach(x => {
    x = x || {};
    const id = clean_(x.id, 120), link = clean_(x.link, 500);
    if (!id || have[id]) return;
    have[id] = 1;
    add.push({ id: id, time: timeIn_(x.time), from: clean_(x.from, 200), subject: clean_(x.subject, 300) || '(no subject)', snippet: clean_(x.snippet, 600),
      link: /^https:\/\/mail\.google\.com\//.test(link) ? link : '', status: 'new', handled_by: '', task: '', mailbox: box, got_at: now_() });
  });
  if (!add.length) return { ok: true, added: 0 };
  appendMany_('Inbox', add);
  const all = rows_('Inbox');
  if (all.length > 600) replaceAll_('Inbox', all.slice().sort((p, q) => p.time < q.time ? -1 : 1).slice(-500)); // the newest 500 are enough
  log_('inbox', '', 'New email', add.length === 1 ? fromName_(add[0].from) + ': ' + add[0].subject : add.length + ' emails');
  const mode = S_().inbox_alerts || 'leads';
  if (mode !== 'no') {
    const text = `📬 ${add.length === 1 ? 'New email' : add.length + ' new emails'}${box ? ' to ' + box : ''}\n` + add.slice(0, 8).map(x => `• ${x.from ? fromName_(x.from) + ': ' : ''}${x.subject}`).join('\n') +
      (add.length > 8 ? `\n…and ${add.length - 8} more` : '') + `\n\nTeam Hub → Inbox`;
    if (mode === 'group') postGroup_(text); else notifyLeads_({ text: text });
  }
  return { ok: true, added: add.length };
}
/** Leads: an email is handled (or ignored, or back to new); task = the task made from it. */
function updateInbox_(me, b) {
  const r = rows_('Inbox').find(x => x.id === String(b.id || ''));
  if (!r) return { ok: false, error: 'No such email.' };
  if (b.status !== undefined) { if (['new', 'done', 'ignored'].indexOf(b.status) < 0) return { ok: false, error: 'Bad status.' }; r.status = b.status; r.handled_by = b.status === 'new' ? '' : me.name; }
  if (b.task !== undefined) { const t = String(b.task || ''); if (t && !rows_('Tasks').some(x => x.id === t)) return { ok: false, error: 'No such task.' }; r.task = t; }
  write_('Inbox', r);
  log_(me.name, r.task || '', 'Email ' + (r.status === 'done' ? 'handled' : r.status), r.subject);
  return { ok: true, email: inboxOut_(r) };
}

// ================================================================== task-change alerts (added / removed / moved / new date)
const CHANGE_GROUP = { added: 'added', restored: 'added', 'moved-in': 'added', removed: 'removed', dropped: 'removed', 'moved-away': 'removed', date: 'dates', renamed: 'edits', details: 'edits' };
/** The parts of a task its owner cares about, to spot what changed. */
function snap_(t) { return t ? { id: t.id || '', owner: t.owner, title: t.title, due: t.due, status: t.status || 'Not started', details: [t.why, t.steps, t.done_when, t.links, t.ask, t.resources || ''].join('\u0001') } : null; }
/** Before/after snapshots of one task → what its owner(s) should hear. a = null: a new task; b = null: deleted. */
function diffTask_(a, b) {
  const out = [], t = b || a, it = (key, kind, from, to) => out.push({ key: key, kind: kind, id: t.id, title: t.title, due: t.due, from: from || '', to: to || '' });
  const off = s => !s || s.status === 'Dropped';
  if (off(a) && off(b)) return out;
  if (off(a)) { it(b.owner, a ? 'restored' : 'added'); return out; }
  if (!b) { it(a.owner, 'removed'); return out; }
  if (b.status === 'Dropped') { it(a.owner, 'dropped'); return out; }
  if (a.owner !== b.owner) { it(a.owner, 'moved-away', '', b.owner); it(b.owner, 'moved-in', a.owner); return out; }
  if (a.due !== b.due) it(b.owner, 'date', a.due, b.due);
  if (a.title !== b.title) it(b.owner, 'renamed', a.title, b.title);
  if (a.details !== b.details) it(b.owner, 'details');
  return out;
}
function editNote_(a, b) {
  const n = [];
  if (a.due !== b.due) n.push(`due ${a.due} → ${b.due}`);
  if (a.owner !== b.owner) n.push(`owner ${a.owner} → ${b.owner}`);
  if (a.title !== b.title) n.push('title');
  if (a.status !== b.status) n.push('status ' + b.status);
  if (a.details !== b.details) n.push('details');
  return n.join('; ') || 'no change';
}
/** Turns [before, after] pairs into alerts. b.notify === false (the "Tell people" switch off) or the change_alerts setting stops them. */
function tellChanges_(me, pairs, b, opts) {
  const items = [];
  pairs.forEach(p => diffTask_(p[0], p[1]).forEach(x => items.push(x)));
  return queueChanges_(me, items, b, opts);
}
/** Apps Script: sends right away (one message per person per save). Own server: waits until the edits stop, so a burst of edits is one message. */
function queueChanges_(me, items, b, opts) {
  opts = opts || {};
  if (!items.length || (b && (b.notify === false || b.notify === 'no')) || S_().change_alerts === 'no') return 0;
  const at = Date.now();
  items.forEach(x => { x.by = me ? me.name : 'system'; x.byKey = me ? me.key : ''; x.at = at; if (opts.plan) x.plan = 1; });
  if (!SELF_HOSTED || opts.now) { sendChanges_(items); return items.length; }
  let q = [];
  try { q = JSON.parse(prop_('PENDING_CHANGES') || '[]'); } catch (e) { q = []; }
  setProp_('PENDING_CHANGES', JSON.stringify(q.concat(items).slice(-3000)));
  return items.length;
}
/** Own server, every 30 s: sends the waiting alerts once nobody edited for a minute (or 5 minutes after the first one at the latest). */
function flushChanges(force) {
  let q = [];
  try { q = JSON.parse(prop_('PENDING_CHANGES') || '[]'); } catch (e) { q = []; }
  if (!q.length) return 0;
  const now = Date.now(), newest = q.reduce((m, x) => Math.max(m, x.at || 0), 0), oldest = q.reduce((m, x) => Math.min(m, x.at || now), now);
  if (!force && now - newest < 60e3 && now - oldest < 300e3) return 0;
  PropertiesService.getScriptProperties().deleteProperty('PENDING_CHANGES');
  sendChanges_(q);
  return q.length;
}
const WD_ = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON_ = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-10-16 18:00" → "Fri 16 Oct 18:00" */
function niceDue_(s) {
  s = String(s || '');
  if (!/^\d{4}-\d\d-\d\d/.test(s)) return s;
  const d = new Date(s.slice(0, 10) + 'T12:00:00Z');
  return WD_[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON_[d.getUTCMonth()] + (s.length > 10 ? ' ' + s.slice(11, 16) : '');
}
/** One line per task; several changes to the same task become one line. Added-then-removed within one batch says nothing. */
function changeLines_(items) {
  const by = {}, order = [];
  items.forEach(x => { const k = x.id || 'new:' + x.title; if (!by[k]) { by[k] = []; order.push(k); } by[k].push(x); });
  return order.map(k => {
    const xs = by[k], last = xs[xs.length - 1], id = last.id ? last.id + ' ' : '', has = kind => xs.filter(x => x.kind === kind).pop();
    const came = has('added') || has('restored') || has('moved-in'), left = has('removed') || has('dropped') || has('moved-away');
    if (came && left) return null;
    if (has('removed')) return `🗑 ${id}${last.title} — removed`;
    if (has('dropped')) return `🗑 ${id}${last.title} — dropped, no need to do it`;
    if (has('moved-away')) return `↪️ ${id}${last.title} — moved to ${nameOf_(has('moved-away').to)}`;
    if (came) return `🆕 ${id}${last.title} — due ${niceDue_(last.due)}` + (came.kind === 'moved-in' ? ` (was ${nameOf_(came.from)}'s)` : came.kind === 'restored' ? ' (back on your list)' : '');
    const d = has('date'), r = has('renamed'), parts = [];
    if (d) parts.push(`now ${niceDue_(d.to)} (was ${niceDue_(d.from)})`);
    if (r) parts.push(`renamed from "${r.from}"`);
    if (has('details')) parts.push('details updated');
    return `${d ? '📅' : '✏️'} ${id}${last.title} — ${parts.join(' · ')}`;
  }).filter(Boolean);
}
function changeCounts_(list) {
  const c = { added: 0, removed: 0, dates: 0, edits: 0 }, seen = {};
  list.forEach(x => { const k = x.kind + (x.id || x.title); if (!seen[k]) { seen[k] = 1; c[CHANGE_GROUP[x.kind]]++; } });
  return [c.added && c.added + ' new', c.removed && c.removed + ' removed', c.dates && c.dates + ' new date' + (c.dates > 1 ? 's' : ''), c.edits && c.edits + ' updated'].filter(Boolean).join(' · ');
}
/** Sends the alerts: one message per task owner (Telegram, or email when Telegram isn't connected) and one summary per admin saying who was told how. */
function sendChanges_(items) {
  const people = people_(), groups = {}, keys = [], how = {}, lines = {};
  items.forEach(x => { if (!groups[x.key]) { groups[x.key] = []; keys.push(x.key); } groups[x.key].push(x); });
  const names = list => list.map(x => x.by).filter((v, i, a) => v && a.indexOf(v) === i);
  keys.forEach(k => {
    const p = people.find(q => q.key === k), list = groups[k];
    lines[k] = changeLines_(list);
    if (!lines[k].length) return;
    if (!k) { how[k] = 'open'; return; }
    if (!p || p.active === 'no') { how[k] = 'gone'; return; }
    if (isAdmin_(p)) { how[k] = 'admin'; return; } // admins read their own changes in the summary below
    if (list.every(x => x.byKey === k)) { how[k] = 'self'; return; }
    how[k] = notify_(p, changeMessage_(p, list, lines[k], names(list).join(', '))) || '';
  });
  const shown = keys.filter(k => lines[k].length);
  if (!shown.length) return;
  const plan = items.some(x => x.plan), total = shown.reduce((s, k) => s + lines[k].length, 0), short = plan || total > 30;
  const label = { telegram: 'told on Telegram', email: 'told by email', 'telegram+email': 'told on Telegram + email', '': '⚠️ not reached (no Telegram or email): tell them yourself',
    self: 'their own change', admin: 'admin, gets this summary', gone: 'not on the team any more', open: 'unassigned — anyone can take it' };
  activePeople_().filter(isAdmin_).forEach(a => {
    const who = names(items).map(n => n === a.name ? 'you' : n).join(', ');
    let text = `🧾 ${plan ? 'Task plan updated' : 'Task changes'} by ${who} — ${shown.length} ${shown.length === 1 ? 'person' : 'people'}\n`;
    shown.forEach(k => {
      const nm = k === a.key ? 'You' : nameOf_(k), st = k === a.key ? '' : ' — ' + (label[how[k]] !== undefined ? label[how[k]] : label['']);
      text += short ? `\n${nm}${st}: ${changeCounts_(groups[k])}` : `\n${nm}${st}\n` + lines[k].slice(0, 6).join('\n') + (lines[k].length > 6 ? `\n…and ${lines[k].length - 6} more` : '') + '\n';
    });
    notify_(a, { text: text.trim(), subject: (plan ? 'Task plan updated' : 'Task changes') + ` — ${shown.length} ${shown.length === 1 ? 'person' : 'people'}`, button: ['Open all tasks', hubUrl_('admin/tasks')] });
  });
}
function changeMessage_(p, list, lines, by) {
  const link = linkFor_(p), plan = list.some(x => x.plan);
  if (plan || lines.length > 8) {
    const next = rows_('Tasks').filter(t => t.owner === p.key && ['Done', 'Dropped'].indexOf(t.status) < 0).sort((a, b) => a.due < b.due ? -1 : 1).slice(0, 5);
    const text = `🗂 ${plan ? 'Your task plan was updated' : 'Your tasks changed'} (by ${by}): ${changeCounts_(list)}` +
      (next.length ? '\n\nNext up:\n' + next.map(t => `• ${t.id} ${t.title} — ${niceDue_(t.due)}`).join('\n') : '') + `\n\nAll your tasks: ${link}`;
    return { text: text, subject: plan ? 'Your task plan was updated' : `Your tasks changed (${lines.length})`, button: ['Open my tasks', link] };
  }
  const x = list[list.length - 1], one = lines.length === 1;
  const subj = !one ? `Your tasks changed (${lines.length})` : /^🆕/.test(lines[0]) ? 'New task: ' + x.title : /^🗑/.test(lines[0]) ? 'Task removed: ' + x.title :
    /^↪️/.test(lines[0]) ? 'Task moved: ' + x.title : /^📅/.test(lines[0]) ? 'New date: ' + x.title : 'Task changed: ' + x.title;
  return { text: `📝 Your tasks changed (by ${by}):\n${lines.join('\n')}\n\n${link}`, subject: subj, button: ['Open my tasks', link] };
}

/** Start / Done / Blocked / Reopen — by the owner or a lead. Done needs proof, Blocked needs a reason. */
/** Members take an unassigned task themselves (setting self_claim). Leads are told. */
function claimTask_(me, b) {
  if (S_().self_claim === 'no') return { ok: false, error: 'Ask a lead to give you this task.' };
  const t = rows_('Tasks').find(q => q.id === String(b.id || ''));
  if (!t) return { ok: false, error: 'No such task.' };
  if (t.owner) return { ok: false, code: 'taken', error: t.owner === me.key ? 'It is already yours.' : `${nameOf_(t.owner)} took it already.` };
  if (['Done', 'Dropped'].indexOf(t.status) >= 0) return { ok: false, error: 'That task is closed.' };
  t.owner = me.key; t.updated_at = now_(); write_('Tasks', t);
  log_(me.name, t.id, 'Took the task', t.title);
  notifyLeads_({ text: `🙋 ${me.name} took ${t.id} — ${t.title} (due ${t.due})` }, me.key);
  return { ok: true, task: taskOut_(t) };
}
function setStatus_(me, b) {
  const t = rows_('Tasks').find(x => x.id === b.id);
  if (!t) return { ok: false, error: 'No such task.' };
  if (t.owner !== me.key && !isLead_(me)) return { ok: false, error: 'Not your task.' };
  if (STATUSES.indexOf(b.status) < 0) return { ok: false, error: 'Bad status.' };
  const proof = clean_(b.proof, 3000), reason = clean_(b.reason, 1000);
  if (b.status === 'Done' && proof.length < 3) return { ok: false, error: 'Add the proof: a photo, a file, a link, or a name + number.' };
  if (b.status === 'Blocked' && reason.length < 5) return { ok: false, error: 'Write what you need and from whom.' };
  const prev = t.status;
  t.status = b.status; t.updated_at = now_();
  if (b.status === 'In progress' && !t.started_at) t.started_at = now_();
  if (b.status === 'Done') { t.done_at = now_(); t.proof = proof; t.blocked_reason = ''; t.review = ''; t.reviewed_by = ''; }
  if (b.status === 'Blocked') t.blocked_reason = reason;
  if (b.status === 'Not started' || b.status === 'In progress') { t.done_at = ''; t.review = ''; t.reviewed_by = ''; }
  write_('Tasks', t);
  log_(me.name, t.id, b.status, b.status === 'Done' ? proof : reason);
  const who = people_().find(p => p.key === t.owner) || me;
  if (b.status === 'In progress' && prev !== 'In progress') notifyLeads_({ text: `▶️ ${who.name} started ${t.id} — ${t.title}` }, who.key);
  if (b.status === 'Blocked') {
    const msg = `🔴 BLOCKED — ${who.name}${tag_(who)}\n${t.id} ${t.title}\nNeeds: ${reason}`;
    notifyLeads_({ text: msg, subject: `Blocked: ${t.id} ${t.title}` }, who.key);
    postGroup_(msg);
  }
  if (b.status === 'Done') {
    const blobs = proofBlobs_(proof), textProof = proof.replace(/^Photo: https?:\/\/\S+$/gm, '').trim();
    if (S_().done_alerts !== 'no') {
      const dm = `✅ ${who.name} finished ${t.id} — ${t.title}` + (textProof ? `\nProof: ${textProof}` : '') + (blobs.length ? `\n📷 ${blobs.length} file(s)` : '');
      activePeople_().filter(p => isLead_(p) && p.key !== who.key && p.chat_id && wantsTg_(p)).forEach(p => { tg_(p.chat_id, dm); blobs.forEach(bl => sendPhoto_(p.chat_id, bl, t.id + ' — ' + who.name)); });
    }
    if (S_().group_done_posts !== 'no') {
      const gm = `✅ ${who.name}${tag_(who)} finished ${t.id} — ${t.title}`;
      if (blobs.length) postGroupPhoto_(blobs[0], gm); else postGroup_(gm);
    }
  }
  return { ok: true, task: taskOut_(t) };
}
/** A lead reviews a finished task: 'ok' = approved (saved), 'redo' = back to In progress + the owner is told what to fix. */
function reviewTask_(me, b) {
  const t = rows_('Tasks').find(x => x.id === b.id);
  if (!t) return { ok: false, error: 'No such task.' };
  const note = clean_(b.note, 1000);
  if (b.verdict === 'redo') {
    if (note.length < 3) return { ok: false, error: 'Say what to fix.' };
    t.status = 'In progress'; t.done_at = ''; t.blocked_reason = 'Redo: ' + note; t.review = 'redo'; t.reviewed_by = me.name; t.updated_at = now_();
    write_('Tasks', t);
    log_(me.name, t.id, 'Asked to redo', note);
    const owner = people_().find(p => p.key === t.owner);
    if (owner) notify_(owner, { text: `🔁 ${me.name} asked you to redo ${t.id} — ${t.title}\nWhat to fix: ${note}\n\n${linkFor_(owner)}`, subject: `Please redo: ${t.title}`, button: ['Open the task', linkFor_(owner)] });
    return { ok: true, task: taskOut_(t) };
  }
  if (t.status !== 'Done') return { ok: false, error: 'Only finished tasks can be approved.' };
  t.review = 'approved'; t.reviewed_by = me.name; write_('Tasks', t);
  log_(me.name, t.id, 'Approved', note);
  return { ok: true, task: taskOut_(t) };
}

// ================================================================== proof files (private Drive folder)
function proofFolder_() {
  const id = prop_('PROOF_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recreate below */ } }
  const f = DriveApp.createFolder(event_() + ' — Team Hub proof files');
  setProp_('PROOF_FOLDER_ID', f.getId());
  return f;
}
function uploadProof_(me, b) {
  const t = rows_('Tasks').find(x => x.id === b.id);
  if (!t) return { ok: false, error: 'No such task.' };
  if (t.owner !== me.key && !isLead_(me)) return { ok: false, error: 'Not your task.' };
  const data = String(b.data || '');
  if (!/^[A-Za-z0-9+\/=]+$/.test(data) || data.length > 9000000) return { ok: false, error: 'The file is too big (max about 6 MB) or not valid. Try a smaller file.' };
  const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf', 'text/plain': 'txt', 'application/zip': 'zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx' };
  const mime = TYPES[b.mime] ? b.mime : 'image/jpeg';
  const orig = String(b.fname || '').replace(/[^\w.\- ]+/g, '').slice(0, 40).replace(/\.[A-Za-z0-9]+$/, '');
  const name = t.id + '_' + me.key + '_' + fmt_(new Date(), 'yyyyMMdd-HHmmss') + (orig ? '_' + orig : '') + '.' + TYPES[mime];
  try {
    const f = proofFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(data), mime, name));
    f.setDescription(t.id + '|' + t.owner);
    log_(me.name, t.id, 'File uploaded', name);
    return { ok: true, id: f.getId(), url: fileUrl_(f.getId()) };
  } catch (err) { botLog_('upload', String(err)); return { ok: false, error: 'Could not save the file: ' + String(err).slice(0, 80) }; }
}
/** Link written into the proof text. The website finds files by the "/file/d/<id>" part, on Google Drive and on the server alike. */
function fileUrl_(id) { return SELF_HOSTED ? (HUB_SERVER.publicUrl() || site_()) + '/file/d/' + id : 'https://drive.google.com/file/d/' + id + '/view'; }
function photoOut_(me, id) {
  try {
    const f = DriveApp.getFileById(id), parts = String(f.getDescription() || '').split('|');
    let inFolder = false;
    const ps = f.getParents(); while (ps.hasNext()) if (ps.next().getId() === prop_('PROOF_FOLDER_ID')) inFolder = true;
    if (!inFolder || !parts[0]) return { ok: false, error: 'Not a proof file.' };
    if (parts[1] !== me.key && !isLead_(me)) return { ok: false, error: 'Not allowed.' };
    const blob = f.getBlob();
    return { ok: true, name: f.getName(), mime: blob.getContentType(), data: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
  } catch (err) { return { ok: false, error: 'File not found.' }; }
}

// ================================================================== people management (admin)
function personFields_(x, p, errs, isNew) {
  if (isNew || x.name !== undefined) { const v = clean_(x.name, 60); if (!v) errs.push('Name is required.'); else p.name = v; }
  ['role', 'area'].forEach(k => { if (x[k] !== undefined) p[k] = clean_(x[k], 60); else if (isNew) p[k] = ''; });
  ['backup', 'works', 'weekend', 'one', 'ask'].forEach(k => { if (x[k] !== undefined) p[k] = clean_(x[k], 1000); else if (isNew) p[k] = ''; });
  if (x.handle !== undefined) {
    let h = clean_(x.handle, 60).replace(/^https?:\/\/t\.me\//i, '');
    if (h && h[0] !== '@') h = '@' + h;
    if (h && !/^@\w{4,}$/.test(h)) errs.push('That Telegram username looks wrong (like @name, letters, digits and _).');
    p.handle = h;
  } else if (isNew) p.handle = '';
  if (x.email !== undefined) { const v = clean_(x.email, 120).toLowerCase(); if (v && !isEmail_(v)) errs.push('That email looks wrong.'); p.email = v; }
  else if (isNew) p.email = '';
  if (isNew || x.access !== undefined) { const v = String(x.access || 'member'); if (ACCESS.indexOf(v) < 0) errs.push('Unknown access level.'); else { p.access = v; p.is_lead = RANK[v] >= 2 ? 'yes' : 'no'; } }
  if (isNew || x.notify !== undefined) { const v = String(x.notify || 'auto'); if (NOTIFY.indexOf(v) < 0) errs.push('Unknown notification choice.'); else p.notify = v; }
}
function otherAdmins_(key) { return activePeople_().filter(q => q.key !== key && access_(q) === 'admin' && q.token).length; }
function findPerson_(key) { return people_().find(p => p.key === String(key || '')) || null; }
function addPerson_(me, b) {
  const x = b.person || {}, errs = [], p = { active: 'yes', chat_id: '', joined_at: now_() };
  personFields_(x, p, errs, true);
  if (p.email && activePeople_().some(q => q.email === p.email)) errs.push('Someone on the team already uses that email.');
  if (errs.length) return { ok: false, error: errs[0], errors: errs };
  p.key = keyFor_(x.key || p.name); p.token = newToken_();
  // someone who applied with "Sign up with Google": their Google account comes along, so they can sign in with it straight away
  const app = b.fromApplication ? rows_('Applications').find(r => r.id === String(b.fromApplication)) : null;
  if (app && app.verified === 'yes' && app.sub && !people_().some(q => q.google_sub === app.sub)) { p.google_sub = app.sub; p.google_email = app.email; if (!p.email && !activePeople_().some(q => q.email === app.email)) p.email = app.email; }
  append_('People', p);
  log_(me.name, '', 'Person added', `${p.name} (${p.access})`);
  let emailed = false;
  const inv = inviteMode_() ? newInvite_(p, me.name) : null;
  if (x.invite && p.email) emailed = mailInvite_(p, false, inv);
  if (app) { app.status = 'accepted'; app.handled_by = me.name; app.person = p.key; write_('Applications', app); }
  refreshLinks();
  return linkOut_(p, inv, { person: personOut_(p), emailed: emailed });
}
function editPerson_(me, b) {
  const x = b.person || {}, p = findPerson_(x.key);
  if (!p) return { ok: false, error: 'No such person.' };
  const errs = [], was = access_(p);
  personFields_(x, p, errs, false);
  if (was === 'admin' && access_(p) !== 'admin' && !otherAdmins_(p.key)) errs.push('The hub needs at least one admin. Make someone else admin first.');
  if (p.email && activePeople_().some(q => q.key !== p.key && q.email === p.email)) errs.push('Someone else already uses that email.');
  if (errs.length) return { ok: false, error: errs[0], errors: errs };
  write_('People', p);
  log_(me.name, '', 'Person edited', p.name);
  refreshLinks();
  return { ok: true, person: personOut_(p) };
}
function deactivatePerson_(me, b) {
  const p = findPerson_(b.key);
  if (!p) return { ok: false, error: 'No such person.' };
  if (access_(p) === 'admin' && !otherAdmins_(p.key)) return { ok: false, error: 'You can\'t remove the last admin.' };
  // Their open tasks: b.reassign = { T012: 'ann', T013: '-' } picks a new owner per task; b.reassignTo = everyone else's default; otherwise unassigned.
  let to = null;
  if (b.reassignTo && !isUnassigned_(b.reassignTo)) { to = ownerFor_(b.reassignTo); if (!to || to.key === p.key) return { ok: false, error: 'Choose who takes over their tasks.' }; }
  const plan = b.reassign && typeof b.reassign === 'object' ? b.reassign : {}, target = {}, bad = [];
  const open = rows_('Tasks').filter(t => t.owner === p.key && ['Done', 'Dropped'].indexOf(t.status) < 0);
  open.forEach(t => {
    const want = Object.prototype.hasOwnProperty.call(plan, t.id) ? plan[t.id] : to ? to.key : '-';
    const q = isUnassigned_(want) || !want ? NOBODY : ownerFor_(want);
    if (!q || q.key === p.key) bad.push(t.id); else target[t.id] = q.key;
  });
  if (bad.length) return { ok: false, error: `Pick someone else for ${bad.slice(0, 5).join(', ')} (or leave it unassigned).` };
  p.active = 'no'; p.chat_id = ''; p.token = ''; write_('People', p);
  dropAccount_(p);
  if (open.length) {
    const before = open.map(snap_), now = now_();
    open.forEach(t => { t.owner = target[t.id]; t.updated_at = now; }); writeMany_('Tasks', open);
    tellChanges_(me, open.map((t, i) => [before[i], snap_(t)]), b); groupNew_(open);
  }
  const given = open.filter(t => t.owner).length;
  log_(me.name, '', 'Person removed', p.name + (open.length ? ` — ${given} open task(s) handed over, ${open.length - given} unassigned` : ''));
  refreshLinks();
  return { ok: true, person: personOut_(p), moved: given, unassigned: open.length - given };
}
function reactivatePerson_(me, b) {
  const p = findPerson_(b.key);
  if (!p) return { ok: false, error: 'No such person.' };
  p.active = 'yes'; p.token = newToken_(); write_('People', p);
  log_(me.name, '', 'Person re-added', p.name);
  const inv = inviteMode_() ? newInvite_(p, me.name) : null;
  refreshLinks();
  return linkOut_(p, inv, { person: personOut_(p) });
}
/** What People shows after adding someone or making a new link: the invite (single-use) or the personal link, and the message to send. */
function linkOut_(p, inv, extra) {
  return Object.assign({ ok: true, link: inv ? inv.url : linkFor_(p), message: inviteText_(p, inv), invite: !!inv, expires: inv ? inv.expires : '' }, extra || {});
}
/** A link leaked, or someone forgot their password: new token (old link stops working), the password is removed and Telegram is unlinked. */
function resetLink_(me, b) {
  const p = findPerson_(b.key);
  if (!p || p.active === 'no') return { ok: false, error: 'No such person.' };
  const had = !!account_(p) || !!p.google_sub;
  dropAccount_(p);
  p.token = newToken_(); p.chat_id = ''; p.google_sub = ''; p.google_email = ''; write_('People', p);
  log_(me.name, '', had ? 'Sign-in reset' : 'Link reset', p.name);
  const inv = inviteMode_() ? newInvite_(p, me.name) : null;
  refreshLinks();
  return linkOut_(p, inv, { person: personOut_(p) });
}
/** "Get link": the personal link — or, with invites, a NEW single-use invite (the older open one stops working). */
function personLink_(me, b) {
  const p = findPerson_(b.key);
  if (!p || p.active === 'no') return { ok: false, error: 'No such person.' };
  if (!p.token) { p.token = newToken_(); write_('People', p); }
  if (inviteMode_()) { const inv = newInvite_(p, me.name); log_(me.name, '', 'Invite made', p.name); refreshLinks(); return linkOut_(p, inv); }
  if (account_(p)) return { ok: false, code: 'password', error: `${first_(p)} signs in with a password, so there is no link to copy. Forgot it? Use "Reset sign-in" to give them a new link.` };
  refreshLinks();
  return linkOut_(p, null);
}
/** Own server: someone just made a password → a new secret, so every old link stops working. Telegram stays connected. */
function rotateToken_(key, why) {
  const p = findPerson_(key);
  if (!p || p.active === 'no') return '';
  p.token = newToken_(); write_('People', p);
  log_(p.name, '', why || 'Password created', 'links switched off');
  refreshLinks();
  return p.token;
}
function invitePerson_(me, b) {
  const p = findPerson_(b.key);
  if (!p || p.active === 'no') return { ok: false, error: 'No such person.' };
  if (!p.email) return { ok: false, error: 'Add their email first (Edit).' };
  if (!p.token) { p.token = newToken_(); write_('People', p); }
  const ok = mailInvite_(p, false, inviteMode_() ? newInvite_(p, me.name) : null);
  if (ok) log_(me.name, '', 'Invite emailed', p.name);
  return ok ? { ok: true } : { ok: false, error: 'Could not send the email (daily limit reached?). Copy the link instead.' };
}
function savePrefs_(me, b) {
  const errs = [], x = {};
  if (b.notify !== undefined) x.notify = b.notify;
  if (b.email !== undefined) x.email = b.email;
  personFields_(x, me, errs, false);
  if (me.email && activePeople_().some(q => q.key !== me.key && q.email === me.email)) errs.push('Someone else already uses that email.');
  if (errs.length) return { ok: false, error: errs[0] };
  write_('People', me);
  log_(me.name, '', 'Notifications changed', me.notify);
  return { ok: true, me: { notify: me.notify, email: me.email } };
}
function tgDisconnect_(me) { me.chat_id = ''; write_('People', me); log_(me.name, '', 'Telegram disconnected', ''); refreshLinks(); return { ok: true }; }

/** Links tab: one row per person with their personal link and a ready-to-send message. */
function refreshLinks() {
  const sh = sheet_('Links');
  sh.getRange(1, 1, 1, TABS.Links.length).setValues([TABS.Links]).setFontWeight('bold').setBackground('#783D2B').setFontColor('#ffffff');
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, Math.max(sh.getLastColumn(), TABS.Links.length)).clearContent();
  const inv = inviteMode_();
  const rows = activePeople_().filter(p => p.token).map(p => { const o = inv ? openInvite_(p) : null;
    return [p.name, access_(p), inv ? (o ? o.url : '(no open invite — People → Get invite)') : linkFor_(p), p.chat_id ? 'yes' : 'no', inv ? (o ? inviteText_(p, o) : '') : inviteText_(p)]; });
  if (rows.length) { const rg = sh.getRange(2, 1, rows.length, TABS.Links.length); rg.setNumberFormat('@'); rg.setValues(rows); }
  delete MEMO['r:Links'];
}
/** For people added by hand in the People tab: gives them a link. */
function addMissingTokens() {
  resetMemo_();
  const fix = people_().filter(p => p.active !== 'no' && p.key && !p.token);
  fix.forEach(p => { p.token = newToken_(); if (!p.access) p.access = 'member'; if (!p.notify) p.notify = 'auto'; });
  writeMany_('People', fix); refreshLinks();
  return fix.length;
}
function resetToken(key) { resetMemo_(); const r = resetLink_({ name: 'system' }, { key: key }); if (!r.ok) throw new Error(r.error); return r.link; }

// ================================================================== single-use invites (setting signin_mode = "invite")
// An invite is a link that works ONCE: the person opens it, picks how they sign in from now on (Google, a password on your own
// server, or "just this device"), and the link is used up. Messages after that never carry a key — a forwarded or leaked
// message lets nobody in. A newer invite for the same person switches the older one off.
function inviteMode_() { return S_().signin_mode === 'invite'; }
const INVITE_RE = /^[0-9a-f]{40}$/;
function inviteUrl_(code) { const h = S_().hub_id; return site_() + '/' + (h ? '?hub=' + h : '') + '#/invite?k=' + code; }
/** A new invite for p; hours = how long it works (default: the invite_days setting). */
function newInvite_(p, by, hours) {
  const now = now_(), old = rows_('Invites').filter(x => x.key === p.key && !x.used_at);
  old.forEach(x => { x.used_at = now; x.used_how = 'replaced'; });
  writeMany_('Invites', old);
  const days = Math.min(60, Math.max(1, parseInt(S_().invite_days, 10) || 7));
  const code = (newToken_() + newToken_()).slice(0, 40), exp = fmt_(new Date(Date.now() + (hours ? hours * 3600e3 : days * 864e5)));
  append_('Invites', { code: code, key: p.key, created_at: now, expires_at: exp, used_at: '', used_how: '', by: clean_(by, 60) });
  return { code: code, url: inviteUrl_(code), expires: exp };
}
/** The newest invite of p that still works → { url, expires } or null. */
function openInvite_(p) {
  const now = now_(), x = rows_('Invites').filter(i => i.key === p.key && !i.used_at && i.expires_at >= now).pop();
  return x ? { code: x.code, url: inviteUrl_(x.code), expires: x.expires_at } : null;
}
/** People page: '' (never invited) · 'open' (sent, not used yet) · 'used' (they are in) · 'expired'. */
function inviteStatus_(p) {
  if (!has_('Invites')) return '';
  const mine = rows_('Invites').filter(i => i.key === p.key && i.used_how !== 'replaced');
  if (!mine.length) return '';
  const last = mine[mine.length - 1];
  return last.used_at ? 'used' : last.expires_at >= now_() ? 'open' : 'expired';
}
function inviteFind_(code) {
  code = String(code || '').trim().toLowerCase();
  if (!INVITE_RE.test(code)) return { code: 'bad', error: 'This invite link is incomplete — copy the whole link from the message.' };
  const iv = rows_('Invites').find(x => x.code === code), who = contact_();
  if (!iv) return { code: 'bad', error: `This invite does not work. Ask ${who} for a new one.` };
  if (iv.used_how === 'replaced') return { code: 'replaced', error: `A newer invite replaced this one — open the newest message, or ask ${who} for a new invite.` };
  if (iv.used_at) return { code: 'used', error: `This invite was used already. Sign in the way you chose then — or ask ${who} for a new invite.` };
  if (iv.expires_at < now_()) return { code: 'expired', error: `This invite has expired. Ask ${who} for a new one.` };
  const p = findPerson_(iv.key);
  if (!p || p.active === 'no') return { code: 'bad', error: 'This invite does not work any more.' };
  return { iv: iv, p: p };
}
/** Public: who the invite is for, and which ways to sign in this hub offers. Nothing is used up yet. */
function inviteCheck_(_, b) {
  const f = inviteFind_(b.k);
  if (f.error) return { ok: false, code: f.code, error: f.error };
  return { ok: true, name: f.p.name, first: first_(f.p), event: event_(), access: access_(f.p), expires: f.iv.expires_at,
    google: googleClientId_(), password: SELF_HOSTED && typeof HUB_SERVER.account === 'function' && !account_(f.p), hasPassword: !!account_(f.p) };
}
/** Apps Script hubs: use the invite → this person's key for this browser. how = 'device' | 'google' (+ idToken, nonce). Own server: server/app.mjs answers. */
function inviteClaim_(_, b) {
  const how = String(b.how || 'device');
  if (how === 'password') return { ok: false, error: 'Passwords need a hub on its own server — choose Google or "Just this device".' };
  let claims = null;
  if (how === 'google') { const v = verifyGoogle_(b); if (v.error) return { ok: false, error: v.error }; claims = v.claims; }
  const r = inviteUse_(b.k, how === 'google' ? 'google' : 'device', claims);
  return r.ok ? { ok: true, u: r.key, t: r.token, name: r.name } : r;
}
/** Both setups, once the way to sign in was checked: the invite is used up (and Google connected) → { ok, key, token, name }. */
function inviteUse_(code, how, claims) {
  const f = inviteFind_(code);
  if (f.error) return { ok: false, code: f.code, error: f.error };
  const p = f.p;
  if (claims) {
    if (!claims.sub) return { ok: false, error: 'Google sign-in failed — press the button again.' };
    if (people_().some(q => q.key !== p.key && q.google_sub === String(claims.sub))) return { ok: false, error: 'That Google account is already connected to someone else on the team. Pick another account.' };
    bindGoogle_(p, claims);
  }
  if (!p.token) { p.token = newToken_(); write_('People', p); }
  f.iv.used_at = now_(); f.iv.used_how = how; write_('Invites', f.iv);
  log_(p.name, '', 'Joined with the invite', how === 'google' ? 'Google' + (p.google_email ? ' ' + p.google_email : '') : how === 'password' ? 'password' : 'this device');
  refreshLinks();
  return { ok: true, key: p.key, token: p.token, name: p.name };
}
/** Admins who lost their way in: Sheet menu "Show admin links" / hubctl admin-links. With invites, each gets a fresh one (24 hours). */
function adminLinks_() {
  return activePeople_().filter(isAdmin_).map(p => {
    if (!p.token) { p.token = newToken_(); write_('People', p); }
    return { name: p.name, link: inviteMode_() ? newInvite_(p, 'admin links', 24).url : linkFor_(p) };
  });
}

// ================================================================== applications (public "Join the team" form)
function apply_(_, b) {
  const S = S_();
  if (!hasAdmin_() || S.public_page !== 'yes' || S.join_form !== 'yes') return { ok: false, error: 'This team is not taking applications here.' };
  if (clean_(b.company)) return { ok: true, message: 'Thanks!' }; // honeypot: bots fill every field
  const g = b.ticket ? ticketClaims_(b.ticket) : null; // "Sign up with Google": Google confirmed this name + email
  if (b.ticket && !g) return { ok: false, error: 'Your Google sign-in timed out — press "Sign up with Google" again, or fill in the form without it.' };
  const email = g && g.email ? g.email : (isEmail_(clean_(b.email, 120).toLowerCase()) ? clean_(b.email, 120).toLowerCase() : '');
  const name = clean_(b.name, 60) || (g ? g.name : ''), contact = clean_(b.contact, 80) || email, age = String(b.age_group || '');
  const lang = LANGS.indexOf(String(b.lang || '')) >= 0 ? String(b.lang) : 'en';
  const list = v => (Array.isArray(v) ? v : String(v || '').split(/\s*[,\n]\s*/)).map(x => clean_(x, 60)).filter(Boolean).slice(0, 10).join(', ');
  if (name.length < 2) return { ok: false, error: 'Write your name.' };
  if (contact.length < 3) return { ok: false, error: 'Write your Telegram username or email so we can reach you.' };
  if (['13-18', '19+'].indexOf(age) < 0) return { ok: false, error: 'Choose your age group.' };
  const cache = CacheService.getScriptCache(), n = Number(cache.get('apply_n') || 0), ck = 'apply_c_' + contact.toLowerCase().replace(/[^\w@.]/g, '').slice(0, 60);
  if (n >= 30) return { ok: false, error: 'Too many applications right now — try again in an hour.' };
  if (cache.get(ck)) return { ok: true, dup: true, message: 'We already have your application. An organizer will message you.' };
  cache.put('apply_n', String(n + 1), 3600); cache.put(ck, '1', 600);
  const all = rows_('Applications'), id = 'A' + ('00' + (all.reduce((m, a) => Math.max(m, parseInt(String(a.id).slice(1), 10) || 0), 0) + 1)).slice(-3);
  const a = { id: id, time: now_(), name: name, contact: contact, age_group: age, interest: clean_(list(b.interests || b.interest), 300), note: clean_(b.note, 1000), status: 'new', handled_by: '',
    email: email, verified: g && g.email ? 'yes' : 'no', sub: g ? String(g.sub || '') : '', person: '', lang: lang, school: clean_(b.school, 100), availability: clean_(list(b.availability), 200) };
  append_('Applications', a);
  const m = appMatch_(a, people_());
  const msg = `📝 New team application — ${a.name} (${age})\nContact: ${a.contact}${a.verified === 'yes' ? ' (Google-verified)' : ''}\nWants to help with: ${a.interest || '—'}` +
    (a.school ? `\nSchool: ${a.school}` : '') + (a.availability ? `\nFree: ${a.availability}` : '') + (lang !== 'en' ? `\nWrote in: ${LANG_NAMES[lang]}` : '') + (a.note ? '\n' + a.note : '') +
    (m ? `\n\n⚠️ ${m.maybe ? 'Maybe' : 'Already'} on the team: ${m.p.name}${m.p.role ? ' (' + m.p.role + ')' : ''}${m.p.active === 'no' ? ' — removed earlier' : ''}` : '') + '\n\nDashboard → Applications';
  activePeople_().filter(isAdmin_).forEach(p => notify_(p, { text: msg, subject: `New team application: ${a.name}`, button: ['Open applications', hubUrl_('admin/applications')] }));
  if (S.feed_applications !== 'no') postGroup_(`📝 Someone new wants to join: ${String(a.name).split(' ')[0]} (${age})${a.interest ? ' — ' + a.interest : ''}. Admins: Dashboard → Applications.`);
  log_('system', '', 'Application', String(a.name).split(' ')[0] + (a.interest ? ' — ' + a.interest : ''));
  return { ok: true, message: 'Thanks! An organizer will message you soon.' };
}
/** b.person = the person this application belongs to ("already on the team"). */
function updateApplication_(me, b) {
  const a = rows_('Applications').find(r => r.id === String(b.id || ''));
  if (!a) return { ok: false, error: 'No such application.' };
  if (['new', 'accepted', 'declined'].indexOf(b.status) < 0) return { ok: false, error: 'Bad status.' };
  if (b.person !== undefined) { const p = b.person ? findPerson_(b.person) : null; if (b.person && !p) return { ok: false, error: 'No such person.' }; a.person = p ? p.key : ''; }
  a.status = b.status; a.handled_by = me.name; write_('Applications', a);
  log_(me.name, '', 'Application ' + b.status, a.name + (a.person ? ' — already on the team as ' + nameOf_(a.person) : ''));
  return { ok: true, application: appOut_(a, people_()) };
}
function normName_(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u0400-\u04ff]+/g, ' ').trim(); }
/** Is this applicant already on the team (or was they)? By email, Telegram username or name — a first name alone is only a "maybe". */
function appMatch_(a, ppl) {
  const c = String(a.contact || '').toLowerCase().trim(), emails = [String(a.email || '').toLowerCase(), isEmail_(c) ? c : ''].filter(Boolean), h = /^@\w{4,}$/.test(c) ? c : '';
  const by = (p, how, maybe) => ({ p: p, how: how, maybe: !!maybe });
  let p = a.person ? ppl.find(q => q.key === a.person) : null;
  if (p) return by(p, 'linked');
  p = a.sub ? ppl.find(q => q.google_sub === a.sub) : null;
  if (p) return by(p, 'Google account');
  p = emails.length ? ppl.find(q => [q.email, q.google_email].some(e => e && emails.indexOf(String(e).toLowerCase()) >= 0)) : null;
  if (p) return by(p, 'email');
  p = h ? ppl.find(q => String(q.handle || '').toLowerCase() === h) : null;
  if (p) return by(p, 'Telegram');
  const n = normName_(a.name);
  if (!n) return null;
  p = ppl.find(q => normName_(q.name) === n);
  if (p) return by(p, 'name', n.indexOf(' ') < 0);
  const f = n.split(' ')[0], same = ppl.filter(q => normName_(q.name).split(' ')[0] === f && q.active !== 'no');
  return f.length >= 3 && same.length === 1 ? by(same[0], 'first name', true) : null;
}
function appOut_(a, ppl) {
  const m = ppl ? appMatch_(a, ppl) : null;
  return { id: a.id, time: a.time, name: a.name, contact: a.contact, age_group: a.age_group, interest: a.interest, note: a.note, status: a.status || 'new', handled_by: a.handled_by,
    email: a.email || '', verified: a.verified === 'yes', person: a.person || '', lang: a.lang || 'en', school: a.school || '', availability: a.availability || '',
    match: m ? { key: m.p.key, name: m.p.name, role: m.p.role, area: m.p.area, active: m.p.active !== 'no', how: m.how, maybe: m.maybe } : null };
}

/** "Email me my link": always the same answer, so nobody can find out who is on the team. */
function requestLink_(_, b) {
  const email = clean_(b.email, 120).toLowerCase(), msg = { ok: true, message: 'If that email belongs to someone on the team, their link is on its way. Check spam too.' };
  if (!isEmail_(email) || !hasAdmin_()) return msg;
  const cache = CacheService.getScriptCache(), n = Number(cache.get('rl_n') || 0);
  if (n >= 40 || cache.get('rl_' + email)) return msg;
  cache.put('rl_n', String(n + 1), 3600); cache.put('rl_' + email, '1', 600);
  const p = activePeople_().find(q => q.email === email && q.token);
  if (p) { mailInvite_(p, true, inviteMode_() ? newInvite_(p, 'email request', 24) : null); log_(p.name, '', 'Link emailed', ''); }
  return msg;
}

// ================================================================== ambassadors + referral links (grew out of Abbos's "Referral page, part 1")
// An ambassador is a student — not an organizer — who brings their school. Their link <hub>/r/CODE sends friends on to the signup page
// with ?ref=CODE, so HQ counts the referral too. With referrals = "on", the page first asks the friend's first name and saves it with the
// code, so the team knows who invited whom and hands out rewards at check-in. Nothing else about a friend is stored, and names are deleted
// after referral_delete_after. Ambassadors never sign in: a private link opens their own page (code, QR code, poster, numbers, top 5).
// Anyone on the team can add an ambassador and becomes their buddy; leads see and change them all. The bot never messages ambassadors.
const AMB_STATUS = ['active', 'paused', 'left'];
const NO_COUNT = { n: 0, came: 0, week: 0, last: '' };
const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h' };
/** Codes go into links and the Sheet: letters, digits, _ and - only, upper case. */
function cleanCode_(v) { return String(v == null ? '' : v).replace(/[^A-Za-z0-9_-]/g, '').replace(/^-+/, '').slice(0, 32).toUpperCase(); }
/** A friend's first name as stored: short, and never read as a formula by the Sheet. */
function cleanFirst_(v) { const t = clean_(v, 40).replace(/\s+/g, ' '); return /^[=+\-@]/.test(t) ? "'" + t : t; }
function shownName_(v) { return String(v || '').replace(/^'(?=[=+\-@])/, ''); }
/** "Малика Каримова" → "malika" (Latin letters only — for keys and codes). */
function latin_(name) { return String(name || '').trim().split(/\s+/)[0].toLowerCase().split('').map(c => TRANSLIT[c] !== undefined ? TRANSLIT[c] : c).join('').normalize('NFKD').replace(/[^a-z0-9]/g, ''); }
function ambassadors_() { return has_('Ambassadors') ? rows_('Ambassadors').filter(a => a.key) : []; }
function referrals_() { return has_('Referrals') ? rows_('Referrals').filter(r => r.id) : []; }
function findAmb_(key) { return ambassadors_().find(a => a.key === String(key || '')) || null; }
function ambByCode_(code) { const c = cleanCode_(code); return c ? ambassadors_().find(a => cleanCode_(a.code) === c) || null : null; }
const isAmb_ = a => (a.kind || 'ambassador') === 'ambassador';
const ambStatus_ = a => a.status || 'active';
function firstOf_(key) { const p = findPerson_(key); return p ? first_(p) : ''; }
/** The link on posters and QR codes: <server>/r/CODE on your own server, <site>?hub=…#/r/CODE on a Sheet hub. */
function refLink_(code) { const c = encodeURIComponent(cleanCode_(code)), pub = SELF_HOSTED ? HUB_SERVER.publicUrl() : ''; return pub ? pub + '/r/' + c : hubUrl_('r/' + c); }
function ambPageLink_(a) { return hubUrl_('amb?k=' + encodeURIComponent(a.key) + '&s=' + a.token); }
/** HQ's signup page with the code, so HQ counts the referral too ('' when the hub has no signup page). */
function signupWithRef_(code) { const u = S_().signup_url, c = cleanCode_(code); return !u ? '' : c ? u + (u.indexOf('?') >= 0 ? '&' : '?') + 'ref=' + encodeURIComponent(c) : u; }
function referralsOn_() { return S_().referrals === 'on'; }
/** The day names are deleted: the setting, or 7 days after the event. */
function refDeleteDate_() { const S = S_(); return isDate_(S.referral_delete_after) ? S.referral_delete_after : addDays_(isDate_(S.event_end) ? S.event_end : isDate_(S.event_start) ? S.event_start : fmt_(new Date(), 'yyyy-MM-dd'), 7); }
function refCap_() { const n = parseInt(S_().referral_cap, 10); return n >= 1 && n <= 1000 ? n : 8; }
function today_() { return fmt_(new Date(), 'yyyy-MM-dd'); }
/** From the first event day on, the leaderboard counts friends who came (checked in), not names. */
function checkinStarted_() { return today_() >= S_().event_start; }
/** The event days: everyone on the team can tick "came" at the check-in desk. */
function checkinOpen_() { const S = S_(), d = today_(); return d >= S.event_start && d <= (S.event_end || S.event_start); }
/** Per code: names saved, friends who came, names in the last 7 days, the newest one. */
function refCounts_() {
  const o = {}, weekAgo = fmt_(new Date(Date.now() - 7 * 864e5));
  referrals_().forEach(r => {
    const c = cleanCode_(r.code); if (!c) return;
    const x = o[c] || (o[c] = { n: 0, came: 0, week: 0, last: '' });
    x.n++; if (r.came === 'yes') x.came++; if (r.time >= weekAgo) x.week++; if (r.time > x.last) x.last = r.time;
  });
  return o;
}
/** Leaderboard score: friends who came once check-in started, names before that — never more than referral_cap. */
function ambScore_(x) { return Math.min(refCap_(), checkinStarted_() ? x.came : x.n); }
/** The top 5 ambassadors as ambassadors see it: first name + score only. */
function ambTop_(counts, meKey) {
  return ambassadors_().filter(a => isAmb_(a) && ambStatus_(a) !== 'left').map(a => ({ a: a, s: ambScore_(counts[cleanCode_(a.code)] || NO_COUNT) })).filter(x => x.s > 0)
    .sort((p, q) => q.s - p.s || String(p.a.joined_at).localeCompare(String(q.a.joined_at))).slice(0, 5).map(x => ({ name: first_(x.a), score: x.s, me: x.a.key === meKey }));
}
function ambOut_(a, counts) {
  const x = counts[cleanCode_(a.code)] || NO_COUNT;
  return { key: a.key, name: a.name, school: a.school, contact: a.contact, code: cleanCode_(a.code), buddy: a.buddy || '', status: ambStatus_(a), kind: a.kind || 'ambassador', joined_at: a.joined_at,
    note: a.note, app_id: a.app_id || '', reward: a.reward || '', hours: a.hours || '', link: refLink_(a.code), page: !!a.token, n: x.n, came: x.came, week: x.week, last: x.last, score: ambScore_(x) };
}
function referralOut_(r) { return { id: r.id, time: r.time, name: shownName_(r.name), code: cleanCode_(r.code), came: r.came === 'yes', checked_by: r.checked_by || '', checked_at: r.checked_at || '' }; }
/** Leads look after every ambassador; anyone else on the team looks after the ones they are the buddy of. */
function canAmb_(me, a) { return isLead_(me) || (!!a && !!a.buddy && a.buddy === me.key); }
/** Who may see a name that came through a link: leads, everyone during the event days (check-in), and the ambassador's buddy. */
function seesRef_(me, r, mine) { if (isLead_(me) || checkinOpen_()) return true; const a = ambByCode_(r.code); return !!a && (mine ? mine.indexOf(a.key) >= 0 : a.buddy === me.key); }
/** What the hub shows someone on the team: their ambassadors (all of them for leads) and the names those links brought. */
function ambData_(me) {
  const lead = isLead_(me), counts = refCounts_(), list = ambassadors_().filter(a => lead || a.buddy === me.key), keys = list.map(a => a.key);
  return {
    ambassadors: list.map(a => ambOut_(a, counts)),
    referrals: referrals_().filter(r => seesRef_(me, r, keys)).sort((p, q) => p.time < q.time ? 1 : p.time > q.time ? -1 : 0).slice(0, 1500).map(referralOut_),
    amb: { on: referralsOn_(), cap: refCap_(), started: checkinStarted_(), open: checkinOpen_(), deleteOn: refDeleteDate_(), names: lead ? referrals_().length : null },
  };
}
function newAmbCode_(name) {
  const base = latin_(name).replace(/[0-9]/g, '').slice(0, 8).toUpperCase() || 'AMB', taken = {};
  ambassadors_().forEach(a => { taken[cleanCode_(a.code)] = 1; });
  for (let i = 0; i < 300; i++) { const c = base + (10 + Math.floor(Math.random() * 90)); if (!taken[c]) return c; }
  return base + Date.now().toString(36).slice(-5).toUpperCase();
}
function ambKey_(name) {
  const base = (latin_(name) || 'amb').slice(0, 20), taken = ambassadors_().map(a => a.key);
  let k = base, i = 2;
  while (taken.indexOf(k) >= 0) k = base.slice(0, 18) + i++;
  return k;
}
function cleanContact_(v) { return clean_(v, 80).replace(/^https?:\/\/t\.me\//i, '@'); }
/** Add or change ambassadors: { amb: {…} }, or { list: [{…}, …] } ("Add several"), optionally { fromApplication: 'A007' }.
 *  Anyone on the team may add one (they become the buddy); only leads pick someone else as the buddy or change other people's ambassadors. */
function saveAmb_(me, b) {
  const many = Array.isArray(b.list), list = many ? b.list.slice(0, 100) : [b.amb || {}], lead = isLead_(me), team = team_().map(p => p.key), errs = [], saved = [];
  const app = b.fromApplication ? rows_('Applications').find(r => r.id === String(b.fromApplication)) : null;
  if (b.fromApplication && !app) return { ok: false, error: 'No such application.' };
  list.forEach((x, i) => {
    x = x || {};
    const at = many ? `Line ${i + 1}: ` : '', cur = x.key ? findAmb_(x.key) : null;
    if (x.key && !cur) return errs.push(at + 'No such ambassador.');
    if (cur && !canAmb_(me, cur)) return errs.push(at + `Only leads${cur.buddy ? ' or ' + firstOf_(cur.buddy) + ' (the buddy)' : ''} can change ${first_(cur)}.`);
    const a = cur ? Object.assign({}, cur) : { kind: 'ambassador', status: 'active', joined_at: now_(), token: '', buddy: '', code: '' };
    if (!cur || x.name !== undefined) { const v = clean_(x.name, 60); if (v.length < 2) return errs.push(at + 'Write their name.'); a.name = v; }
    [['school', 100], ['note', 500], ['reward', 200], ['hours', 20]].forEach(f => { if (x[f[0]] !== undefined) a[f[0]] = clean_(x[f[0]], f[1]); else if (!cur) a[f[0]] = ''; });
    if (x.contact !== undefined) a.contact = cleanContact_(x.contact); else if (!cur) a.contact = '';
    if (x.kind !== undefined && (lead || !cur)) a.kind = x.kind === 'channel' ? 'channel' : 'ambassador';
    if (a.kind === 'channel' && !lead) return errs.push(at + 'Only leads make channel codes.');
    if (x.status !== undefined) { if (AMB_STATUS.indexOf(String(x.status)) < 0) return errs.push(at + 'Status is active, paused or left.'); a.status = String(x.status); }
    if (lead && x.buddy !== undefined) { const k = String(x.buddy || ''); if (k && team.indexOf(k) < 0) return errs.push(at + 'The buddy must be someone on the team.'); a.buddy = k; }
    else if (!cur) a.buddy = a.kind === 'channel' ? '' : me.key;
    if (x.code !== undefined && cleanCode_(x.code)) {
      const c = cleanCode_(x.code), other = ambByCode_(c);
      if (c.length < 2) return errs.push(at + 'The code needs at least 2 letters or digits.');
      if (other && (!cur || other.key !== cur.key)) return errs.push(at + `The code ${c} is taken (${other.name}).`);
      a.code = c;
    } else if (!cleanCode_(a.code)) a.code = newAmbCode_(a.name);
    if (a.status === 'left') a.token = '';
    if (cur) { Object.assign(cur, a); write_('Ambassadors', cur); saved.push(cur); }
    else {
      a.key = ambKey_(a.name); a.token = a.kind === 'channel' ? '' : newToken_();
      if (app && !many) a.app_id = app.id;
      append_('Ambassadors', a); saved.push(a);
    }
    log_(me.name, '', cur ? 'Ambassador changed' : a.kind === 'channel' ? 'Channel code added' : 'Ambassador added', a.name + ' — ' + a.code);
  });
  if (!saved.length) return { ok: false, error: errs[0] || 'Nothing to save.', errors: errs };
  if (app && saved[0].app_id === app.id) { app.status = 'accepted'; app.handled_by = me.name; write_('Applications', app); }
  const counts = refCounts_(), d = ambData_(me);
  return { ok: true, ambassador: ambOut_(saved[0], counts), saved: saved.map(a => a.key), errors: errs, ambassadors: d.ambassadors, amb: d.amb };
}
/** Leads: remove an ambassador added by mistake (the names their link brought stay, under the code). Someone who stops: status "left". */
function deleteAmb_(me, b) {
  const a = findAmb_(b.key);
  if (!a) return { ok: false, error: 'No such ambassador.' };
  deleteRows_('Ambassadors', [a]);
  log_(me.name, '', 'Ambassador removed', a.name + ' — ' + cleanCode_(a.code));
  return Object.assign({ ok: true }, ambData_(me));
}
/** The ambassador's private page link (made the first time; reset = a new one, the old link stops working). */
function ambLink_(me, b) {
  const a = findAmb_(b.key);
  if (!a || !canAmb_(me, a)) return { ok: false, error: 'No such ambassador.' };
  if (!isAmb_(a)) return { ok: false, error: 'A channel code has no page — share its link.' };
  if (ambStatus_(a) === 'left') return { ok: false, error: `${first_(a)} has left — set them back to active first.` };
  if (b.reset || !a.token) { a.token = newToken_(); write_('Ambassadors', a); log_(me.name, '', b.reset ? 'Ambassador page link reset' : 'Ambassador page link made', a.name); }
  return { ok: true, key: a.key, name: a.name, first: first_(a), page: ambPageLink_(a), link: refLink_(a.code), code: cleanCode_(a.code), event: event_(), langs: langsOf_(S_().languages) };
}
/** Public: what a referral link needs — is the name step on, who invited (first name), where the signup is. */
function referralCheck_(_, b) {
  const S = S_(), code = cleanCode_(b.code), a = ambByCode_(code), url = signupWithRef_(code);
  if (!url) return { ok: false, code: 'no_signup', error: 'This event has no signup page yet.' };
  return { ok: true, on: referralsOn_(), code: code, inviter: a && isAmb_(a) && ambStatus_(a) !== 'left' ? first_(a) : '', url: url, deleteOn: refDeleteDate_(),
    langs: langsOf_(S.languages), event: { name: event_(), city: S.city, start: S.event_start, end: S.event_end } };
}
/** Public: a friend's first name + the code (only while referrals = on), then on to the signup page. A flood or a bot: nothing is saved, people still get through. */
function referralSave_(_, b) {
  const code = cleanCode_(b.code), url = signupWithRef_(code);
  if (!url) return { ok: false, code: 'no_signup', error: 'This event has no signup page yet.' };
  if (!referralsOn_() || clean_(b.company)) return { ok: true, url: url, saved: false }; // off: nothing is stored · company = the honeypot bots fill in
  const name = cleanFirst_(b.name);
  if (shownName_(name).length < 2) return { ok: false, code: 'name', error: 'Write your first name.', url: url };
  const cache = CacheService.getScriptCache(), n = Number(cache.get('ref_n') || 0), ck = 'ref_c_' + (code + '_' + normName_(shownName_(name))).replace(/[^\w]/g, '').slice(0, 80);
  if (n >= 300) return { ok: true, url: url, saved: false };
  if (cache.get(ck)) return { ok: true, url: url, saved: true, dup: true };
  cache.put('ref_n', String(n + 1), 3600); cache.put(ck, '1', 3600);
  append_('Referrals', { id: nextRefId_(), time: now_(), name: name, code: code, came: '', checked_by: '', checked_at: '' });
  return { ok: true, url: url, saved: true };
}
function nextRefId_() { return 'R' + ('000' + (referrals_().reduce((m, r) => Math.max(m, parseInt(String(r.id).slice(1), 10) || 0), 0) + 1)).slice(-4); }
/** The check-in desk (or a lead): a friend who came says who invited them, but never used the link. */
function referralAdd_(me, b) {
  const code = cleanCode_(b.code), name = cleanFirst_(b.name), came = yn_(b.came) === 'yes', a = ambByCode_(code);
  if (shownName_(name).length < 2) return { ok: false, error: 'Write their first name.' };
  if (!code) return { ok: false, error: 'Which code? Ask “who invited you?”' };
  if (!isLead_(me) && !checkinOpen_() && !(a && a.buddy === me.key)) return { ok: false, code: 'forbidden', error: 'Before the event, only leads (or the buddy) add names by hand.' };
  const r = append_('Referrals', { id: nextRefId_(), time: now_(), name: name, code: code, came: came ? 'yes' : '', checked_by: came ? me.name : '', checked_at: came ? now_() : '' });
  log_(me.name, '', came ? 'Checked in (referral)' : 'Referral added', code + (a ? ' — ' + first_(a) : ''));
  return { ok: true, referral: referralOut_(r) };
}
/** Tick "came" at check-in, fix a name or a code (leads), or delete a row (leads). */
function referralUpdate_(me, b) {
  const r = referrals_().find(x => x.id === String(b.id || ''));
  if (!r || !seesRef_(me, r)) return { ok: false, error: 'No such name.' };
  if (b.delete) {
    if (!isLead_(me)) return { ok: false, code: 'forbidden', error: 'Only leads delete names.' };
    deleteRows_('Referrals', [r]); log_(me.name, '', 'Referral removed', cleanCode_(r.code));
    return { ok: true, deleted: r.id };
  }
  if (b.came !== undefined) {
    const c = yn_(b.came) === 'yes';
    r.came = c ? 'yes' : ''; r.checked_by = c ? me.name : ''; r.checked_at = c ? now_() : '';
    log_(me.name, '', c ? 'Checked in (referral)' : 'Check-in undone (referral)', cleanCode_(r.code));
  }
  if (b.name !== undefined) { const v = cleanFirst_(b.name); if (shownName_(v).length < 2) return { ok: false, error: 'Write their first name.' }; r.name = v; }
  if (b.code !== undefined) { if (!isLead_(me)) return { ok: false, code: 'forbidden', error: 'Only leads change a code.' }; const c = cleanCode_(b.code); if (!c) return { ok: false, error: 'Write the code.' }; r.code = c; }
  write_('Referrals', r);
  return { ok: true, referral: referralOut_(r) };
}
/** Deletes what referral links collected: friends' names (each row stays with its code and "came", so the numbers stay right)
 *  and ambassadors' contacts, notes and page links. Runs by itself the day after referral_delete_after; admins can run it any time. */
function purgeReferrals_(who) {
  const rs = referrals_().filter(r => r.name), as = ambassadors_().filter(a => a.contact || a.note || a.token);
  rs.forEach(r => { r.name = ''; }); writeMany_('Referrals', rs);
  as.forEach(a => { a.contact = ''; a.note = ''; a.token = ''; }); writeMany_('Ambassadors', as);
  if (rs.length || as.length) log_(who, '', 'Referral data deleted', `${rs.length} names, ${as.length} ambassadors' contacts and page links`);
  return { names: rs.length, ambassadors: as.length };
}
function purgeAction_(me) { return Object.assign({ ok: true }, purgeReferrals_(me.name), ambData_(me)); }
function autoPurge_() { if ((has_('Referrals') || has_('Ambassadors')) && today_() > refDeleteDate_()) purgeReferrals_('system'); }
/** Public, with the ambassador's private link (k + s): their own page. Never anyone else's contacts — the top 5 is first names + numbers. */
function ambPage_(_, b) {
  const a = findAmb_(b.k), s = String(b.s || '');
  if (!a || !isAmb_(a) || !a.token || s.length < 16 || a.token !== s || ambStatus_(a) === 'left') return { ok: false, code: 'gone', error: 'This link does not work any more. Ask the organizer who gave it to you for a new one.' };
  const S = S_(), counts = refCounts_(), x = counts[cleanCode_(a.code)] || NO_COUNT, buddy = a.buddy ? findPerson_(a.buddy) : null;
  return { ok: true, version: HUB_VERSION, langs: langsOf_(S.languages), event: { name: event_(), city: S.city, start: S.event_start, end: S.event_end },
    me: { first: first_(a), school: a.school || '', code: cleanCode_(a.code), link: refLink_(a.code), status: ambStatus_(a), n: x.n, came: x.came, week: x.week, score: ambScore_(x) },
    on: referralsOn_(), started: checkinStarted_(), cap: refCap_(), top: ambTop_(counts, a.key),
    buddy: buddy && buddy.active !== 'no' ? { name: first_(buddy), handle: /^@\w{4,}$/.test(buddy.handle || '') ? buddy.handle : '' } : null,
    group: isUrl_(S.ambassador_group || '') ? S.ambassador_group : '', messages: texts_('amb_message'), rewards: texts_('referral_rewards'),
    links: { signup: S.signup_url, telegram: S.telegram_channel || '', instagram: S.instagram || '' } };
}
/** Sunday: the ambassadors' week for the leads' report, and one message for each buddy about their own ambassadors. */
function ambReport_() {
  const list = ambassadors_().filter(a => isAmb_(a) && ambStatus_(a) === 'active');
  if (!list.length) return { text: '', group: '', buddies: [] };
  const c = refCounts_(), on = referralsOn_(), x = a => c[cleanCode_(a.code)] || NO_COUNT, weekAgo = fmt_(new Date(Date.now() - 7 * 864e5));
  const all = referrals_(), week = all.filter(r => r.time >= weekAgo).length, top = ambTop_(c, '');
  let text = `🎓 Ambassadors: ${list.length} active` + (on ? ` · ${week} new name${week === 1 ? '' : 's'} via their links this week (${all.length} in all)` : ' · referral names are off (Settings → Referrals)');
  if (top.length) text += '\nTop 5: ' + top.map(t => `${t.name} ${t.score}`).join(' · ');
  const quiet = on ? list.filter(a => !x(a).week) : [];
  if (quiet.length) text += '\nNo new names in 7 days: ' + quiet.slice(0, 12).map(a => first_(a) + (a.buddy ? ` (buddy: ${firstOf_(a.buddy)})` : ' (no buddy)')).join(', ') + (quiet.length > 12 ? '…' : '');
  const by = {}; list.forEach(a => { if (a.buddy) (by[a.buddy] = by[a.buddy] || []).push(a); });
  const buddies = Object.keys(by).map(findPerson_).filter(p => p && p.active !== 'no').map(p => [p, `🎓 ${S_().greeting || 'Hi'}, ${first_(p)}! Your ambassadors this week:\n` +
    by[p.key].map(a => `• ${a.name}${a.school ? ' (' + a.school + ')' : ''}: ` + (on ? `${x(a).week} new, ${x(a).n} in all` + (x(a).week ? '' : ' — message them this week') : `code ${cleanCode_(a.code)}`)).join('\n') +
    `\n\n${hubUrl_('admin/ambassadors')}`]);
  return { text: text, group: on && week ? `🎓 ${week} new name${week === 1 ? '' : 's'} via ambassador links this week` + (top.length ? ' · top: ' + top.slice(0, 3).map(t => `${t.name} ${t.score}`).join(', ') : '') : '', buddies: buddies };
}

// ================================================================== settings + lists (admin)
function saveSettings_(me, b) {
  const v = b.values || {}, errs = [], out = {}, known = SETTINGS.map(d => d[0]);
  Object.keys(v).forEach(k => {
    if (known.indexOf(k) < 0) return;
    let val = YESNO.indexOf(k) >= 0 ? yn_(v[k]) : clean_(v[k], /^(amb_message|referral_rewards)/.test(k) ? 1000 : /^(join_intro|tagline)/.test(k) ? 500 : 200);
    if (k === 'languages') { const want = String(val || '').toLowerCase().split(/[\s,;]+/).filter(Boolean), bad = want.filter(l => LANGS.indexOf(l) < 0); if (bad.length) errs.push(`Unknown language: ${bad.join(', ')} — the website knows ${LANGS.join(', ')}.`); val = langsOf_(val).join(','); }
    if (k === 'event_name' && !val) errs.push('The event name is required.');
    if (k === 'timezone' && val && !isTz_(val)) errs.push('Time zone must be an IANA name like Europe/Berlin.');
    if ((k === 'event_start' || k === 'event_end') && val && !isDate_(val)) errs.push('Event dates must be YYYY-MM-DD.');
    if (k === 'reminder_hour') { const h = parseInt(val, 10); if (!(h >= 0 && h <= 23)) errs.push('Reminder hour must be 0–23.'); else val = String(h); }
    if (URL_KEYS.indexOf(k) >= 0 && val && !isUrl_(val)) errs.push(`${k.replace(/_/g, ' ')} must be a full link starting with https://`);
    if (k === 'city_email' && val && !isEmail_(val)) errs.push('Public email looks wrong.');
    if (k === 'hub_id' && val && !HUB_RE.test(val) && !HUB_NAME_RE.test(val)) errs.push('Hub ID looks wrong (AKfy… or a short name like springfield).');
    if (k === 'files_repo') { val = val.replace(/^https:\/\/github\.com\//i, '').replace(/\.git$|\/+$/g, ''); if (val && !REPO_RE.test(val)) errs.push('Team files repo: write it as owner/repo, e.g. yourname/haven-yourcity-team.'); }
    if (k === 'files_branch') { val = val || 'main'; if (!/^[\w.\/-]{1,60}$/.test(val)) errs.push('Branch name looks wrong.'); }
    if (k === 'google_client_id' && val && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(val)) errs.push('The Google client ID ends with .apps.googleusercontent.com — copy it from Google Cloud → Credentials.');
    if (k === 'site_url') val = val.replace(/\/+$/, '');
    if (k === 'signin_mode' && ['link', 'invite'].indexOf(val) < 0) errs.push('Sign-in must be "invite" or "link".');
    if (k === 'invite_days') { const d = parseInt(val, 10); if (!(d >= 1 && d <= 60)) errs.push('Invites can last 1–60 days.'); else val = String(d); }
    if (k === 'signup_goal' && val) { const n = parseInt(val, 10); if (!(n >= 1 && n <= 100000)) errs.push('The signup goal is a number, e.g. 180.'); else val = String(n); }
    if (k === 'funding_per_signup' && val) { const f = Number(String(val).replace(',', '.').replace(/^\$/, '')); if (!(f > 0 && f < 1000)) errs.push('Funding per signup is an amount in USD, e.g. 3.25.'); else val = String(Math.round(f * 100) / 100); }
    if (k === 'inbox_alerts' && ['leads', 'group', 'no'].indexOf(val) < 0) errs.push('Inbox alerts: leads, group or no.');
    if (k === 'referrals' && ['on', 'off'].indexOf(val) < 0) errs.push('Referral names: on or off.');
    if (k === 'referral_delete_after' && val && !isDate_(val)) errs.push('The day referral names are deleted must be YYYY-MM-DD.');
    if (k === 'referral_cap') { const n = parseInt(val, 10); if (!(n >= 1 && n <= 1000)) errs.push('The leaderboard cap is a number, e.g. 8.'); else val = String(n); }
    out[k] = val;
  });
  const start = out.event_start || S_().event_start, end = out.event_end || S_().event_end;
  if (start && end && end < start) errs.push('The event can\'t end before it starts.');
  if (errs.length) return { ok: false, error: errs[0], errors: errs };
  const before = Object.assign({}, S_());
  saveSettingsRaw_(out);
  let warn = '';
  if (['timezone', 'reminder_hour', 'weekly_report'].some(k => out[k] !== undefined && out[k] !== before[k])) { try { installTriggers_(); } catch (e) { warn = 'Saved, but the reminder timer could not be updated: in the Sheet use Haven Hub → Turn on reminders.'; } }
  if (out.timezone && out.timezone !== before.timezone) { try { ss_().setSpreadsheetTimeZone(out.timezone); } catch (e) { /* ignore */ } }
  if (['site_url', 'hub_id', 'event_name', 'greeting'].some(k => out[k] !== undefined && out[k] !== before[k])) refreshLinks();
  log_(me.name, '', 'Settings saved', Object.keys(out).join(', '));
  return { ok: true, settings: settingsOut_(), event: eventOut_(), warning: warn };
}
const LISTS = ['Meetings', 'Rules', 'Milestones']; // sponsors have their own page: sponsor.save / sponsor.delete / sponsor.order
function saveList_(me, b) {
  const tab = String(b.tab || ''), rows = Array.isArray(b.rows) ? b.rows.slice(0, 200) : null;
  if (LISTS.indexOf(tab) < 0 || !rows) return { ok: false, error: 'Bad list.' };
  const errs = [], clean = [];
  rows.forEach((r, i) => {
    const o = {};
    TABS[tab].forEach(k => { o[k] = clean_(r && r[k], k === 'text' || k === 'what' ? 600 : 200); });
    if (!(o.title || o.label || o.what)) return; // empty row: skip
    if (tab !== 'Rules' && !isDate_(o.date)) errs.push(`Row ${i + 1}: the date must be YYYY-MM-DD.`);
    if (tab === 'Meetings' && o.time && !/^\d\d:\d\d$/.test(o.time)) errs.push(`Row ${i + 1}: time must be HH:MM.`);
    if (tab === 'Milestones') { o.kind = ['gate', 'deadline', 'event'].indexOf(o.kind) >= 0 ? o.kind : 'deadline'; o.public = yn_(o.public); o.done = yn_(o.done); }
    clean.push(o);
  });
  if (errs.length) return { ok: false, error: errs[0], errors: errs };
  if (tab !== 'Rules') clean.sort((a, b2) => (a.date + (a.time || '')) < (b2.date + (b2.time || '')) ? -1 : 1);
  replaceAll_(tab, clean);
  log_(me.name, '', tab + ' saved', clean.length + ' rows');
  return { ok: true, rows: clean };
}
function rules_() { return rows_('Rules').filter(r => r.title).map(r => ({ title: r.title, text: r.text })); }
function meetings_() { return rows_('Meetings').filter(m => m.date || m.what).map(m => ({ date: m.date, time: m.time, where: m.where, what: m.what })); }
// ================================================================== sponsors + partners (logo gallery; uploaded logos are public pictures)
const SPONSOR_TIERS = ['Sponsor', 'Prize sponsor', 'In-kind', 'Venue', 'Partner', 'Community partner', 'Food'];
const LOGO_DATA_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/;
/** Where an uploaded logo can be seen by anyone: this server's /files/pub/…, or a public Google Drive picture. */
function publicFileUrl_(id) { return SELF_HOSTED ? (HUB_SERVER.publicUrl() || site_()) + '/files/pub/' + id : 'https://drive.google.com/thumbnail?id=' + id + '&sz=w800'; }
function sponsorsAll_() {
  return rows_('Sponsors').filter(x => x.name).map((x, i) => ({ x: x, i: i }))
    .sort((a, b) => (Number(a.x.order) || 0) - (Number(b.x.order) || 0) || a.i - b.i).map(o => o.x);
}
function sponsorOut_(x) {
  const logo = x.logo_file ? publicFileUrl_(x.logo_file) : x.logo_url;
  return { id: x.id || 'row' + x._row, name: x.name, link: x.link, note: x.note, tier: x.tier || '', blurb: x.blurb || '', public: x.public !== 'no', order: Number(x.order) || 0, logo: logo || '', logo_url: x.logo_url || '', logo_file: x.logo_file || '' };
}
/** Admins: everything. Public page: only sponsors marked public, without the private note. */
function sponsors_(all) {
  return sponsorsAll_().filter(x => all || x.public !== 'no').map(x => { const o = sponsorOut_(x); if (!all) { delete o.note; delete o.logo_file; delete o.logo_url; delete o.order; } return o; });
}
/** Gives old rows (from list.save) an id, so they can be edited one by one. */
function sponsorIds_() {
  const fix = rows_('Sponsors').filter(x => x.name && !x.id);
  let n = rows_('Sponsors').reduce((m, x) => { const k = String(x.id).match(/^s(\d+)$/); return k ? Math.max(m, Number(k[1])) : m; }, 0) + 1;
  fix.forEach(x => { x.id = 's' + n++; if (!x.public) x.public = 'yes'; });
  writeMany_('Sponsors', fix);
}
function publicFolder_() {
  const id = prop_('PUBLIC_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recreate below */ } }
  const f = DriveApp.createFolder(event_() + ' — public pictures (sponsor logos)');
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* some school accounts forbid public files: each upload falls back below */ }
  setProp_('PUBLIC_FOLDER_ID', f.getId());
  return f;
}
/** A logo the admin uploaded (already shrunk by the website) → { file } or, when Google forbids public files, { data } kept in the Sheet. */
function saveLogo_(logo, name) {
  const mime = String(logo.mime || ''), data = String(logo.data || '').replace(/^data:[^,]*,/, '');
  if (['image/png', 'image/jpeg', 'image/webp'].indexOf(mime) < 0) return { error: 'The logo must be a PNG, JPG or WebP picture.' };
  if (!/^[A-Za-z0-9+\/=]+$/.test(data) || data.length > 2000000) return { error: 'That logo is too big — use one under 1.5 MB.' };
  const fname = 'logo_' + String(name || 'sponsor').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + '_' + fmt_(new Date(), 'yyyyMMdd-HHmmss') + '.' + mime.split('/')[1].replace('jpeg', 'jpg');
  try {
    const f = publicFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(data), mime, fname));
    f.setDescription('sponsor logo');
    if (!SELF_HOSTED) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { file: f.getId() };
  } catch (err) {
    if (data.length <= 45000) return { data: 'data:' + mime + ';base64,' + data };
    return { error: 'Google did not allow a public picture here (' + String(err).slice(0, 60) + '). Paste a link to the logo instead, or use a smaller picture.' };
  }
}
/** Add or change one sponsor: { sponsor: { id?, name, link, tier, blurb, note, public, logo_url }, logo?: { data, mime } }. */
function saveSponsor_(me, b) {
  const x = b.sponsor || {}, errs = [];
  sponsorIds_();
  const all = rows_('Sponsors'), cur = x.id ? all.find(r => r.id === String(x.id)) : null;
  if (x.id && !cur) return { ok: false, error: 'No such sponsor.' };
  const r = cur || { id: 's' + (all.reduce((m, y) => { const k = String(y.id).match(/^s(\d+)$/); return k ? Math.max(m, Number(k[1])) : m; }, 0) + 1), order: String(all.length + 1), public: 'yes' };
  const name = x.name !== undefined ? clean_(x.name, 80) : r.name, link = clean_(x.link, 300), url = clean_(x.logo_url, 48000);
  if (!name) errs.push('Write the sponsor\'s name.');
  if (link && !isUrl_(link)) errs.push('The website must start with https://');
  if (url && !isUrl_(url) && !LOGO_DATA_RE.test(url)) errs.push('The logo link must start with https://');
  if (errs.length) return { ok: false, error: errs[0], errors: errs };
  r.name = name;
  [['link', 300], ['tier', 40], ['blurb', 200], ['note', 300]].forEach(f => { if (x[f[0]] !== undefined || !cur) r[f[0]] = clean_(x[f[0]], f[1]); }); // an edit only changes what it sends
  if (x.public !== undefined) r.public = yn_(x.public);
  if (x.logo_url !== undefined) { r.logo_url = url; if (url) r.logo_file = ''; }
  if (x.removeLogo) { r.logo_url = ''; r.logo_file = ''; }
  if (b.logo && b.logo.data) {
    const up = saveLogo_(b.logo, name);
    if (up.error) return { ok: false, error: up.error };
    r.logo_file = up.file || ''; r.logo_url = up.data || '';
  }
  if (cur) write_('Sponsors', r); else append_('Sponsors', r);
  log_(me.name, '', cur ? 'Sponsor changed' : 'Sponsor added', name);
  return { ok: true, sponsor: sponsorOut_(r), sponsors: sponsors_(true) };
}
function deleteSponsor_(me, b) {
  sponsorIds_();
  const r = rows_('Sponsors').find(x => x.id === String(b.id || ''));
  if (!r) return { ok: false, error: 'No such sponsor.' };
  deleteRows_('Sponsors', [r]);
  log_(me.name, '', 'Sponsor removed', r.name);
  return { ok: true, sponsors: sponsors_(true) };
}
/** b.ids = every sponsor id in the new order. */
function orderSponsors_(me, b) {
  sponsorIds_();
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(String), rows = rows_('Sponsors').filter(x => x.name);
  rows.forEach(x => { const i = ids.indexOf(x.id); x.order = String(i < 0 ? ids.length + 1 : i + 1); });
  writeMany_('Sponsors', rows);
  return { ok: true, sponsors: sponsors_(true) };
}
function milestones_() { return rows_('Milestones').filter(m => m.label).map(m => ({ date: m.date, label: m.label, kind: m.kind || 'deadline', public: m.public === 'yes', done: m.done === 'yes' })); }

// ================================================================== API
const ACTIONS = {
  ping: { level: 'public', fn: apiPing_ },
  public: { level: 'public', fn: apiPublic_ },
  setup: { level: 'public', post: true, lock: true, fn: apiSetup_ },
  apply: { level: 'public', post: true, lock: true, fn: apply_ },
  requestLink: { level: 'public', post: true, lock: true, fn: requestLink_ },
  'invite.check': { level: 'public', post: true, fn: inviteCheck_ },
  'invite.claim': { level: 'public', post: true, lock: true, fn: inviteClaim_ },
  'auth.google': { level: 'public', post: true, lock: true, fn: authGoogle_ },
  me: { level: 'any', fn: apiMe_ },
  tgdisconnect: { level: 'any', post: true, lock: true, fn: tgDisconnect_ },
  'auth.google.link': { level: 'any', post: true, lock: true, fn: authGoogleLink_ },
  'auth.google.unlink': { level: 'any', post: true, lock: true, fn: googleUnlink_ },
  'photo.save': { level: 'member', post: true, lock: true, fn: savePhoto_ },
  'person.activity': { level: 'lead', fn: personActivity_ },
  photo: { level: 'member', fn: (me, q) => photoOut_(me, String(q.id || '')) },
  status: { level: 'member', post: true, lock: true, fn: setStatus_ },
  'task.claim': { level: 'member', post: true, lock: true, fn: claimTask_ },
  upload: { level: 'member', post: true, lock: true, fn: uploadProof_ },
  prefs: { level: 'member', post: true, lock: true, fn: savePrefs_ },
  review: { level: 'lead', post: true, lock: true, fn: reviewTask_ },
  'task.add': { level: 'lead', post: true, lock: true, fn: addTasks_ },
  'task.edit': { level: 'lead', post: true, lock: true, fn: editTask_ },
  'task.bulk': { level: 'lead', post: true, lock: true, fn: bulkTasks_ },
  'task.import': { level: 'lead', post: true, lock: true, fn: importTasks_ },
  'task.sync': { level: 'admin', post: true, lock: true, fn: syncTasks_ },
  'task.delete': { level: 'admin', post: true, lock: true, fn: deleteTasks_ },
  'task.relink': { level: 'admin', post: true, lock: true, fn: relinkTasks_ },
  'files.list': { level: 'any', fn: filesList_ },
  'file.get': { level: 'any', fn: libraryFile_ },
  'file.upload': { level: 'member', post: true, lock: true, fn: uploadFile_ },
  'signups.save': { level: 'lead', post: true, lock: true, fn: saveSignups_ },
  'signups.delete': { level: 'admin', post: true, lock: true, fn: deleteSignups_ },
  'signups.push': { level: 'public', post: true, lock: true, fn: pushSignups_ },
  'inbox.push': { level: 'public', post: true, lock: true, fn: pushInbox_ },
  'inbox.update': { level: 'lead', post: true, lock: true, fn: updateInbox_ },
  'feed.key': { level: 'admin', post: true, lock: true, fn: feedKeyAction_ },
  'referral.check': { level: 'public', fn: referralCheck_ },
  'referral.save': { level: 'public', post: true, lock: true, fn: referralSave_ },
  'amb.page': { level: 'public', post: true, fn: ambPage_ },
  'amb.save': { level: 'member', post: true, lock: true, fn: saveAmb_ },
  'amb.link': { level: 'member', post: true, lock: true, fn: ambLink_ },
  'amb.delete': { level: 'lead', post: true, lock: true, fn: deleteAmb_ },
  'referral.add': { level: 'member', post: true, lock: true, fn: referralAdd_ },
  'referral.update': { level: 'member', post: true, lock: true, fn: referralUpdate_ },
  'referral.purge': { level: 'admin', post: true, lock: true, fn: purgeAction_ },
  'resource.save': { level: 'lead', post: true, lock: true, fn: saveResources_ },
  'resource.delete': { level: 'member', post: true, lock: true, fn: deleteResource_ },
  'person.add': { level: 'admin', post: true, lock: true, fn: addPerson_ },
  'person.edit': { level: 'admin', post: true, lock: true, fn: editPerson_ },
  'person.deactivate': { level: 'admin', post: true, lock: true, fn: deactivatePerson_ },
  'person.reactivate': { level: 'admin', post: true, lock: true, fn: reactivatePerson_ },
  'person.resetLink': { level: 'admin', post: true, lock: true, fn: resetLink_ },
  'person.link': { level: 'admin', post: true, lock: true, fn: personLink_ },
  'person.invite': { level: 'admin', post: true, lock: true, fn: invitePerson_ },
  'application.update': { level: 'admin', post: true, lock: true, fn: updateApplication_ },
  'settings.save': { level: 'admin', post: true, lock: true, fn: saveSettings_ },
  'list.save': { level: 'admin', post: true, lock: true, fn: saveList_ },
  'sponsor.save': { level: 'admin', post: true, lock: true, fn: saveSponsor_ },
  'sponsor.delete': { level: 'admin', post: true, lock: true, fn: deleteSponsor_ },
  'sponsor.order': { level: 'admin', post: true, lock: true, fn: orderSponsors_ },
  'tg.setToken': { level: 'admin', post: true, fn: tgSetToken_ },
  botinfo: { level: 'admin', fn: () => ({ ok: true, info: botInfo_() }) },
  bottest: { level: 'admin', post: true, fn: botTest_ },
  export: { level: 'admin', fn: apiExport_ },
  health: { level: 'admin', fn: apiHealth_ },
};
ACTIONS.add = ACTIONS['task.add'];   // v3 names
ACTIONS.edit = ACTIONS['task.edit'];

function doGet(e) { return json_(dispatch_((e && e.parameter) || {}, 'GET')); }
function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  return json_(dispatch_(b || {}, 'POST'));
}
function dispatch_(q, method) {
  resetMemo_();
  try {
    maybeUpgrade_();
    const moved = S_().moved_to;
    if (moved && !SELF_HOSTED) return { ok: false, code: 'moved', url: moved, error: 'This Team Hub moved to ' + moved };
    const name = String(q.action || 'me'), a = Object.prototype.hasOwnProperty.call(ACTIONS, name) ? ACTIONS[name] : null;
    if (!a) return { ok: false, error: 'Unknown action.' };
    if (a.post && method !== 'POST') return { ok: false, error: 'Use POST.' };
    const run = () => {
      let me = null;
      if (a.level !== 'public') {
        me = person_(q.t);
        if (!me) return { ok: false, code: 'auth', error: `This link doesn't work (any more). Ask ${contact_()} for your personal Team Hub link.` };
        if (q.u && q.u !== me.key) return { ok: false, code: 'auth', error: `This link belongs to ${me.name}, but the address says "${String(q.u).slice(0, 30)}". Ask ${contact_()} for your own link.` };
        if (RANK[access_(me)] < NEED[a.level]) return { ok: false, code: 'forbidden', error: 'Your link can\'t do that.' };
      }
      return a.fn(me, q);
    };
    if (!a.lock) return run();
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return { ok: false, error: 'The hub is busy — try again in a few seconds.' };
    try { resetMemo_(); return run(); } finally { lock.releaseLock(); }
  } catch (err) {
    try { report_('Error', String(q.action) + ': ' + String(err && err.stack || err)); } catch (e2) { /* ignore */ }
    return { ok: false, error: 'Something went wrong on the server: ' + String(err && err.message || err).slice(0, 200) };
  }
}

function apiPing_() {
  const ready = hasAdmin_();
  return { ok: true, version: HUB_VERSION, ready: ready, event: ready ? { name: event_(), city: S_().city } : null, google: ready ? googleClientId_() : '', signin: ready && inviteMode_() ? 'invite' : 'link' };
}
/** Leads: one person's page — what they did lately (the newest 60 log lines by them or about their tasks) and the applications that are theirs. */
function personActivity_(me, q) {
  const p = findPerson_(q.key);
  if (!p) return { ok: false, error: 'No such person.' };
  const ids = {}; rows_('Tasks').forEach(t => { if (t.owner === p.key) ids[t.id] = 1; });
  const log = rows_('Log').filter(l => l.who === p.name || (l.task && ids[l.task]) || (!l.task && String(l.note || '').indexOf(p.name) === 0)).slice(-60).reverse()
    .map(l => ({ time: l.time, who: l.who, task: l.task, action: l.action, note: access_(me) === 'viewer' ? '' : l.note }));
  const apps = isAdmin_(me) ? rows_('Applications').map(a => appOut_(a, people_())).filter(a => a.match && a.match.key === p.key && !a.match.maybe) : [];
  return { ok: true, key: p.key, log: log, applications: apps };
}
function apiPublic_() {
  if (!hasAdmin_()) return { ok: false, code: 'not_ready', error: 'This hub is not set up yet.' };
  const S = S_(), ev = eventOut_(), langs = langsOf_(S.languages);
  const base = { ok: true, version: HUB_VERSION, tz: tz_(), langs: langs, event: { name: ev.name, city: ev.city, start: ev.start, end: ev.end, tagline: ev.tagline, taglines: texts_('tagline') } }; // no names on the public page
  if (S.public_page !== 'yes') return Object.assign(base, { enabled: false });
  const tasks = rows_('Tasks').filter(t => t.status !== 'Dropped'), done = tasks.filter(t => t.status === 'Done').length;
  return Object.assign(base, {
    enabled: true,
    links: { signup: S.signup_url, email: S.city_email, instagram: S.instagram, telegram: S.telegram_channel, website: S.website },
    progress: S.public_show_progress === 'yes' ? { done: done, total: tasks.length, milestones: milestones_().filter(m => m.public).map(m => ({ date: m.date, label: m.label, done: m.done })) } : null,
    team: S.public_show_team === 'yes' ? team_().map(p => ({ name: first_(p), role: p.role, area: p.area })) : null,
    join: S.join_form === 'yes' ? { intro: S.join_intro, intros: texts_('join_intro'), channel: S.telegram_channel || '' } : null,
    sponsors: sponsors_(false),
    google: googleClientId_(),
    signups: S.public_show_signups === 'yes' && signups_().length ? (o => ({ total: o.total, goal: o.goal, date: o.date }))(signupsOut_()) : null,
  });
}
function apiMe_(me, q) {
  touchSeen_(me);
  const S = S_(), lvl = access_(me), seeAll = lvl !== 'member';
  if (q.hub && !S.hub_id && lvl === 'admin' && HUB_RE.test(String(q.hub))) { saveSettingsRaw_({ hub_id: String(q.hub) }); refreshLinks(); }
  const all = rows_('Tasks'), ppl = activePeople_(), lead = isLead_(me);
  const out = {
    ok: true, version: HUB_VERSION, now: now_(), tz: tz_(), event: eventOut_(),
    me: { key: me.key, name: me.name, role: me.role, area: me.area, access: lvl, lead: lead, admin: isAdmin_(me), telegram: !!me.chat_id,
      email: me.email, notify: me.notify || 'auto', backup: me.backup, works: me.works, weekend: me.weekend, one: me.one, ask: me.ask, photo: me.photo || '',
      google: !!me.google_sub, google_email: me.google_email || '',
      account: account_(me), tg_start: lvl === 'viewer' ? '' : me.token }, // tg_start: the code behind "Connect Telegram" (someone signed in with a password has no link to take it from)
    accounts: SELF_HOSTED && typeof HUB_SERVER.account === 'function', // this hub offers password sign-in
    google: googleClientId_(), // Google sign-in client id ('' = off)
    bot: prop_('BOT_USERNAME').replace(/^@/, ''),
    // everyone sees the team; leads also see how to reach each person and their weekend job (the profile pages)
    team: ppl.filter(p => access_(p) !== 'viewer').map(p => Object.assign({ key: p.key, name: p.name, role: p.role, area: p.area, access: access_(p), handle: lvl === 'viewer' ? '' : p.handle, one: p.one, photo: p.photo || '' },
      lead ? { email: p.email, backup: p.backup, works: p.works, weekend: p.weekend, ask: p.ask, telegram: !!p.chat_id, joined_at: p.joined_at, google: !!p.google_sub, password: !!account_(p) } : {})),
    tasks: lvl === 'viewer' ? [] : all.filter(t => t.owner === me.key).map(taskOut_),
    open: lvl === 'viewer' ? [] : all.filter(t => !t.owner && ['Done', 'Dropped'].indexOf(t.status) < 0).map(taskOut_),
    selfClaim: S.self_claim !== 'no',
    rules: rules_(), meetings: meetings_(), milestones: milestones_(),
    publicLink: publicLink_(),
    features: FEATURES,
    files: filesOut_(), resources: resources_().filter(r => seesRes_(lvl, r)).map(resourceOut_),
    signups: signupsOut_(), signin: S.signin_mode === 'invite' ? 'invite' : 'link', langs: langsOf_(S.languages),
  };
  if (lead) { const ib = inbox_(); out.inbox = ib.slice(0, 200).map(inboxOut_); out.inboxNew = ib.filter(r => (r.status || 'new') === 'new').length; }
  if (lvl !== 'viewer') Object.assign(out, ambData_(me)); // ambassadors: all of them for leads, your own for everyone else
  if (!lead) out.tasks.concat(out.open).forEach(t => { t.resources = t.resources.filter(r => !r.leads); }); // links only leads may see stay out of members' tasks
  if (seeAll) {
    out.all = all.map(taskOut_);
    if (lvl === 'viewer') out.all.forEach(t => { t.proof = ''; t.blocked_reason = ''; t.ask = ''; t.resources = t.resources.filter(r => !r.private); });
    const logAll = rows_('Log');
    out.lastSeen = seenMap_(logAll);
    out.log = logAll.slice(-80).reverse().map(l => ({ time: l.time, who: l.who, task: l.task, action: l.action, note: lvl === 'viewer' ? '' : l.note }));
    if (lvl !== 'viewer') {
      out.telegram = ppl.map(p => ({ key: p.key, name: p.name, connected: !!p.chat_id }));
      out.group = { set: !!prop_('GROUP_CHAT_ID'), topic: !!prop_('GROUP_THREAD_ID') };
    }
  }
  if (lvl === 'admin') {
    out.people = people_().map(personOut_);
    const everyone = people_();
    out.applications = rows_('Applications').map(a => appOut_(a, everyone)).reverse();
    const byApp = {}; ambassadors_().forEach(a => { if (a.app_id) byApp[a.app_id] = a.key; });
    out.applications.forEach(x => { if (byApp[x.id]) x.amb = byApp[x.id]; });
    out.settings = settingsOut_();
    out.sponsors = sponsors_(true);
    out.sponsorTiers = SPONSOR_TIERS;
    out.hosting = SELF_HOSTED ? 'server' : 'google';
    out.feed = { key: !!feedKey_(), api: apiUrl_() };
    out.allLangs = LANGS.map(l => ({ code: l, name: LANG_NAMES[l] }));
    out.sheetUrl = SELF_HOSTED ? '' : ss_().getUrl();
  }
  return out;
}
function apiExport_() {
  const data = {};
  ['Settings', 'People', 'Tasks', 'Log', 'Meetings', 'Rules', 'Milestones', 'Applications', 'Sponsors', 'Resources', 'Signups', 'Inbox', 'Ambassadors', 'Referrals'].forEach(n => { // never Invites (live sign-in codes)
    if (['Signups', 'Inbox', 'Ambassadors', 'Referrals'].indexOf(n) >= 0 && !has_(n)) { data[n] = []; return; }
    data[n] = rows_(n).map(r => { const o = {}; Object.keys(r).forEach(k => { if (k[0] !== '_' && ['token', 'chat_id', 'google_sub', 'sub'].indexOf(k) < 0) o[k] = r[k]; }); return o; });
  });
  return { ok: true, version: HUB_VERSION, exported: now_(), data: data };
}
function apiHealth_() {
  const trig = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  let quota = null; try { quota = MailApp.getRemainingDailyQuota(); } catch (e) { /* no mail scope yet */ }
  return { ok: true, version: HUB_VERSION, tz: tz_(), triggers: trig, mailQuota: quota, proofFolder: !!prop_('PROOF_FOLDER_ID'), bot: !!prop_('BOT_TOKEN'),
    hubId: S_().hub_id, siteUrl: site_(), sheetUrl: SELF_HOSTED ? '' : ss_().getUrl(), lastError: prop_('BOT_LAST_ERROR'), server: SELF_HOSTED ? HUB_SERVER.stats() : null };
}

// ================================================================== first-run setup + upgrade
function apiSetup_(_, b) {
  if (hasAdmin_()) return { ok: false, error: 'This hub is already set up. Open your admin link — or in the Sheet use the menu Haven Hub → Show admin links.' };
  if (SELF_HOSTED) {
    if (!HUB_SERVER.checkSetupCode(String(b.sheet || '').trim())) return { ok: false, code: 'proof', error: 'That setup code is wrong or used up. On the server run:  hubctl setup-code' };
  } else {
    const m = String(b.sheet || '').match(/\/d\/([\w-]{20,})/) || String(b.sheet || '').trim().match(/^([\w-]{20,})$/);
    if (!m || m[1] !== ss_().getId()) return { ok: false, code: 'proof', error: 'That is not the Google Sheet this hub runs on. Paste the address of YOUR copy of the Sheet (from the browser bar).' };
  }
  const errs = [], name = clean_(b.name, 60), email = clean_(b.email, 120).toLowerCase(), ev = b.event || {};
  if (!name) errs.push('Write your name.');
  if (email && !isEmail_(email)) errs.push('Your email looks wrong.');
  const vals = {
    event_name: clean_(ev.name, 80), city: clean_(ev.city, 60), event_start: clean_(ev.start, 10) || SETTINGS[2][1], event_end: clean_(ev.end, 10) || SETTINGS[3][1],
    timezone: clean_(ev.timezone, 60) || Session.getScriptTimeZone(), public_page: yn_(b.publicPage !== false), join_form: yn_(b.joinForm !== false),
    signup_url: clean_(ev.signup, 200), hub_id: !SELF_HOSTED && HUB_RE.test(String(b.hub || '')) ? String(b.hub) : '', site_url: isUrl_(clean_(b.site, 200)) ? clean_(b.site, 200).replace(/\/+$/, '') : DEFAULT_SITE,
    signin_mode: b.invites === false ? 'link' : 'invite', languages: langsOf_(b.languages).join(','), // new hubs: single-use invites
  };
  if (!vals.event_name) errs.push('Write the event name.');
  if (!isDate_(vals.event_start) || !isDate_(vals.event_end) || vals.event_end < vals.event_start) errs.push('Check the event dates.');
  if (!isTz_(vals.timezone)) errs.push('Choose a time zone.');
  if (vals.signup_url && !isUrl_(vals.signup_url)) errs.push('The signup link must start with https://');
  if (errs.length) return { ok: false, error: errs[0], errors: errs };
  Object.keys(TABS).forEach(header_);
  ensureSettings_(vals);
  saveSettingsRaw_(vals);
  try { ss_().setSpreadsheetTimeZone(vals.timezone); ss_().rename(vals.event_name + ' — Team Hub'); } catch (e) { /* ignore */ }
  const admin = { key: keyFor_(name), name: name, role: clean_(b.role, 60) || 'Lead organizer', area: 'Lead', email: email, access: 'admin', is_lead: 'yes', notify: 'auto',
    active: 'yes', token: newToken_(), chat_id: '', joined_at: now_(), handle: '', backup: '', works: '', weekend: '', one: '', ask: '' };
  append_('People', admin);
  const start = vals.event_start;
  if (b.starter !== false) {
    if (!rules_().length) appendMany_('Rules', STARTER.rules.map(r => ({ title: r[0], text: r[1] })));
    if (!rows_('Milestones').length) appendMany_('Milestones', STARTER.milestones.map(x => ({ date: addDays_(start, x[0]), label: x[1], kind: x[2], public: x[3], done: 'no' })));
    let n = nextNum_();
    appendMany_('Tasks', STARTER.tasks.map(x => ({ id: idFor_(n++), owner: admin.key, title: x[2], due: addDays_(start, x[0]) + ' ' + x[1], mins: String(x[3]), area: x[4], why: x[5],
      steps: x[6].join('\n'), done_when: x[7], links: '', ask: '', status: 'Not started', updated_at: now_(), created_by: 'starter' })));
  } else if (!rows_('Milestones').length) {
    appendMany_('Milestones', [{ date: start, label: 'Event day 1', kind: 'event', public: 'yes', done: 'no' }, { date: vals.event_end, label: 'Event day 2', kind: 'event', public: 'yes', done: 'no' }]);
  }
  applyValidation_();
  let warn = '';
  try { installTriggers_(); } catch (e) { warn = 'Reminders are not switched on yet: in the Sheet use Haven Hub → Turn on reminders.'; }
  refreshLinks();
  log_('system', '', 'Hub set up', `${vals.event_name} · admin ${admin.name}`);
  const d = ss_().getSheetByName('Sheet1'); if (d && d.getLastRow() === 0) { try { ss_().deleteSheet(d); } catch (e) { /* last sheet */ } }
  const inv = inviteMode_() && email ? newInvite_(admin, 'setup') : null; // with invites: a way in from the admin's other devices
  const emailed = email ? mailInvite_(admin, false, inv) : false;
  return { ok: true, key: admin.key, token: admin.token, link: linkFor_(admin), invites: inviteMode_(), emailed: emailed, warning: warn };
}
/** Runs by itself the first time a v3 Sheet (People tab, no Settings tab) gets a request. Safe to run again by hand. */
function upgrade() {
  resetMemo_();
  const had = !!ss_().getSheetByName('Settings');
  Object.keys(TABS).forEach(header_);
  ensureSettings_({ timezone: Session.getScriptTimeZone(), site_url: (prop_('SITE_URL') || DEFAULT_SITE).replace(/\/+$/, ''),
    group_done_posts: prop_('GROUP_DONE_POSTS') === 'no' ? 'no' : 'yes' });
  const fix = people_().filter(p => !p.access || !p.notify);
  fix.forEach(p => { if (!p.access) p.access = access_(p); if (!p.notify) p.notify = 'auto'; });
  writeMany_('People', fix);
  sponsorIds_();
  applyValidation_();
  refreshLinks();
  log_('system', '', had ? 'Checked tables' : 'Upgraded to v4', HUB_VERSION);
  return 'Upgraded to ' + HUB_VERSION;
}
function maybeUpgrade_() {
  if (ss_().getSheetByName('Settings') || !ss_().getSheetByName('People') || !people_().length) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try { resetMemo_(); if (!ss_().getSheetByName('Settings')) upgrade(); } finally { lock.releaseLock(); resetMemo_(); }
}
function applyValidation_() {
  const rule = list => SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(true).build();
  const set = (tab, key, list) => { const c = header_(tab).indexOf(key) + 1; if (c > 0) sheet_(tab).getRange(2, c, 999, 1).setDataValidation(rule(list)); };
  try {
    set('People', 'access', ACCESS); set('People', 'notify', NOTIFY); set('People', 'active', ['yes', 'no']);
    set('Tasks', 'status', STATUSES); set('Tasks', 'review', ['', 'approved', 'redo']);
    set('Milestones', 'kind', ['gate', 'deadline', 'event']); set('Milestones', 'public', ['yes', 'no']); set('Milestones', 'done', ['yes', 'no']);
    set('Applications', 'status', ['new', 'accepted', 'declined']);
    if (has_('Inbox')) set('Inbox', 'status', ['new', 'done', 'ignored']);
    if (has_('Ambassadors')) { set('Ambassadors', 'status', AMB_STATUS); set('Ambassadors', 'kind', ['ambassador', 'channel']); }
    if (has_('Referrals')) set('Referrals', 'came', ['', 'yes']);
  } catch (e) { /* cosmetic only */ }
}

// ================================================================== Sheet menu (fallbacks for admins)
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Haven Hub')
    .addItem('Show admin links', 'menuAdminLinks')
    .addItem('Refresh the Links tab', 'refreshLinks')
    .addItem('Give a link to people added by hand', 'menuMissingTokens')
    .addItem('Reset someone\'s link…', 'menuResetLink')
    .addSeparator()
    .addItem('Rebuild the Progress tab', 'buildProgress')
    .addItem('Turn on reminders', 'menuTriggers')
    .addItem('Check the Telegram bot', 'menuBotDoctor')
    .addSeparator()
    .addItem('Move this hub to my own server…', 'menuMoveToServer')
    .addToUi();
}
function menuAdminLinks() {
  resetMemo_(); maybeUpgrade_();
  const ui = SpreadsheetApp.getUi();
  if (!hasAdmin_()) { ui.alert('Not set up yet', `1. Extensions → Apps Script → Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).\n2. Open ${DEFAULT_SITE}/#/setup and paste the Web app URL.`, ui.ButtonSet.OK); return; }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = adminLinks_().map(x => `<p><b>${esc(x.name)}</b><br><a href="${esc(x.link)}" target="_blank">${esc(x.link)}</a></p>`).join('') + (inviteMode_() ? '<p style="color:#777">Each is a new single-use invite (24 hours).</p>' : '') +
    `<p style="color:#777">Public page: <a href="${esc(publicLink_())}" target="_blank">${esc(publicLink_())}</a></p>` +
    (S_().hub_id ? '' : '<p style="color:#b00">The hub ID is not known yet — open the website once from the setup wizard, or fill hub_id in the Settings tab.</p>');
  ui.showModalDialog(HtmlService.createHtmlOutput(`<div style="font-family:Arial;font-size:13px;word-break:break-all">${html}</div>`).setWidth(520).setHeight(320), 'Admin links (keep them private)');
}
function menuMissingTokens() { const n = addMissingTokens(); SpreadsheetApp.getUi().alert(n ? `Done — ${n} new link(s) in the Links tab.` : 'Everyone already has a link.'); }
function menuResetLink() {
  const ui = SpreadsheetApp.getUi(), r = ui.prompt('Reset a personal link', 'Type the person\'s key (People tab, column "key"). Their old link stops working.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  try { ui.alert('New link (also in the Links tab):\n\n' + resetToken(r.getResponseText().trim())); } catch (e) { ui.alert(String(e.message || e)); }
}
function menuTriggers() { resetMemo_(); installTriggers_(); SpreadsheetApp.getUi().alert('Reminders are on: every day at ' + (Number(S_().reminder_hour) || 18) + ':00 (' + tz_() + ')' + (prop_('BOT_TOKEN') ? ', and the bot checks Telegram every minute.' : '.')); }
function menuBotDoctor() { SpreadsheetApp.getUi().alert(botDoctor()); }
function menuMoveToServer() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('Move this hub to your own server (1/2)', 'Address of the server, e.g. https://hub.yourevent.xyz', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const b = ui.prompt('Move this hub to your own server (2/2)', 'One-time import code (on the server run:  hubctl import-code)', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  try { ui.alert('Done', moveToServer_(a.getResponseText().trim(), b.getResponseText().trim()), ui.ButtonSet.OK); }
  catch (e) { ui.alert('Not moved', String(e.message || e) + '\n\nNothing changed in this Sheet.', ui.ButtonSet.OK); }
}

// ================================================================== move to your own server (server/ in the haven-hub repo)
/** Everything the server needs: every tab (tokens + Telegram links included) and the bot settings. Proof files go separately, in batches. */
function moveBundle_() {
  resetMemo_();
  const sheets = {}, props = {};
  ss_().getSheets().forEach(sh => {
    const n = sh.getName(); if (n === 'Progress' || n === 'Sheet1') return;
    sheets[n] = sh.getLastRow() ? sh.getDataRange().getValues().map(r => r.map(cell_)) : [];
  });
  ['BOT_TOKEN', 'BOT_USERNAME', 'GROUP_CHAT_ID', 'GROUP_THREAD_ID', 'PROOF_FOLDER_ID'].forEach(k => { if (prop_(k)) props[k] = prop_(k); });
  return { version: HUB_VERSION, tz: tz_(), exported: now_(), sheets: sheets, props: props };
}
function moveToServer_(server, code) {
  server = String(server || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^\s\/]+/.test(server)) throw new Error('The server address must start with https://');
  const post = (path, body) => {
    const res = UrlFetchApp.fetch(server + path, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(body) });
    let j; try { j = JSON.parse(res.getContentText()); } catch (e) { throw new Error('The server answered HTTP ' + res.getResponseCode() + ' — is the address right and the hub running?'); }
    if (!j.ok) throw new Error(j.error || 'The server refused the import.');
    return j;
  };
  const start = post('/admin/import', { code: code, bundle: moveBundle_() });
  let files = 0, batch = [], size = 0;
  const send = () => { if (batch.length) { post('/admin/import/files', { code: code, importId: start.importId, files: batch }); files += batch.length; batch = []; size = 0; } };
  if (prop_('PROOF_FOLDER_ID')) {
    const it = proofFolder_().getFiles();
    while (it.hasNext()) {
      const f = it.next(), bl = f.getBlob(), data = Utilities.base64Encode(bl.getBytes());
      if (size + data.length > 7000000) send();
      batch.push({ id: f.getId(), name: f.getName(), mime: bl.getContentType(), desc: f.getDescription() || '', data: data }); size += data.length;
    }
    send();
  }
  const done = post('/admin/import/finish', { code: code, importId: start.importId });
  // Switch this Sheet off: every link now forwards to the server, and the old timers stop (the old bot poller would fight the server's webhook).
  const home = /^https:\/\/\S+$/.test(String(done.home || '')) ? done.home : server; // where people open the hub now (e.g. the shared website with ?hub=name)
  saveSettingsRaw_({ moved_to: home });
  ScriptApp.getProjectTriggers().forEach(t => { if (['pollTelegram', 'eveningReminders', 'weeklyReport'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  const msg = `Moved to ${home}: ${done.people} people, ${done.tasks} tasks, ${files} proof files${done.bot ? ', Telegram bot @' + done.bot : ''}.\n` +
    `This Sheet is now a frozen backup and every old link forwards to the server.\nTo undo: clear moved_to in the Settings tab, then Haven Hub → Turn on reminders.`;
  log_('system', '', 'Moved to server', server); report_('Moved to server', msg);
  return msg;
}

// ================================================================== reminders + reports
function installTriggers_() {
  if (SELF_HOSTED) return; // the server's own scheduler runs reminders and reports
  const S = S_(), tz = tz_(), hour = Math.min(23, Math.max(0, parseInt(S.reminder_hour, 10) || 18));
  ScriptApp.getProjectTriggers().forEach(t => { if (['pollTelegram', 'eveningReminders', 'weeklyReport'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  if (prop_('BOT_TOKEN')) ScriptApp.newTrigger('pollTelegram').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('eveningReminders').timeBased().atHour(hour).everyDays(1).inTimezone(tz).create();
  if (S.weekly_report !== 'no') ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(19).inTimezone(tz).create();
}
function installTriggers() { resetMemo_(); installTriggers_(); }
function wantsTg_(p) { const n = p.notify || 'auto'; return !!p.chat_id && (n === 'auto' || n === 'telegram' || n === 'both'); }
function wantsEmail_(p) { const n = p.notify || 'auto'; if (!p.email || n === 'none' || n === 'telegram') return false; return n === 'email' || n === 'both' || !p.chat_id; }
/** Sends a message the way the person chose. m = { text, subject?, button?, kind? }. No subject = Telegram only.
 *  Returns how it went out: 'telegram', 'email', 'telegram+email' — or '' when it could not reach them. */
function notify_(p, m) {
  if (!p || p.active === 'no' || access_(p) === 'viewer') return '';
  let tg = false, em = false;
  if (wantsTg_(p)) tg = !!tg_(p.chat_id, m.text).ok;
  if (m.subject && wantsEmail_(p) && (m.kind !== 'reminder' || S_().email_reminders !== 'no')) em = mail_(p.email, m.subject, m.text, m.button);
  return tg && em ? 'telegram+email' : tg ? 'telegram' : em ? 'email' : '';
}
function notifyLeads_(m, exceptKey) {
  if (typeof m === 'string') m = { text: m };
  activePeople_().filter(p => isLead_(p) && p.key !== exceptKey).forEach(p => notify_(p, m));
}
function mail_(to, subject, text, button) {
  try {
    if (!to || MailApp.getRemainingDailyQuota() < 1) { botLog_('mail', 'daily email limit reached'); return false; }
    MailApp.sendEmail({ to: to, subject: `[${event_()}] ${subject}`, body: text, htmlBody: emailHtml_(subject, text, button), name: event_() + ' Team Hub' });
    return true;
  } catch (err) { botLog_('mail', String(err)); return false; }
}
function mailInvite_(p, recovery, inv) {
  if (inv) {
    const subj = recovery ? 'Your sign-in link for the Team Hub' : access_(p) === 'viewer' ? 'Your guest invite to our Team Hub' : 'Welcome to the team — your Team Hub invite';
    const text = recovery ? `${S_().greeting || 'Hi'}, ${first_(p)}! Here is a new sign-in link for the ${event_()} Team Hub. It works once, for 24 hours:\n${inv.url}\n\nDidn't ask for it? Ignore this email — nothing changes.` : inviteText_(p, inv);
    return mail_(p.email, subj, text, [recovery ? 'Sign in' : 'Open my invite', inv.url]);
  }
  const link = linkFor_(p), acc = account_(p);
  const text = recovery && !acc ? `${S_().greeting || 'Hi'}, ${first_(p)}! Here is your personal ${event_()} Team Hub link again:\n${link}\n\nDon't share it — it's your key.` : inviteText_(p);
  const subject = acc ? 'How to sign in to the Team Hub' : recovery ? 'Your Team Hub link' : (access_(p) === 'viewer' ? 'Your guest link to our Team Hub' : 'Welcome to the team — your Team Hub link');
  return mail_(p.email, subject, text, [acc ? 'Sign in' : 'Open the Team Hub', link]);
}
function emailHtml_(title, text, button) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const body = esc(text).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" style="color:#C4541B;word-break:break-all">${u}</a>`).replace(/\n/g, '<br>');
  return `<div style="background:#FFF6EC;padding:24px 12px;font-family:Nunito,Arial,sans-serif;color:#2B1D17">` +
    `<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;padding:24px;border:1px solid #F0D5BD">` +
    `<img src="${esc(site_())}/assets/logo-orange.png" alt="Hack Club Haven" width="110" style="display:block;margin:0 0 14px">` +
    `<h2 style="color:#783D2B;margin:0 0 12px;font-size:20px">${esc(title)}</h2><div style="font-size:15px;line-height:1.55">${body}</div>` +
    (button ? `<p style="margin:22px 0 0"><a href="${esc(button[1])}" style="background:#783D2B;color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">${esc(button[0])}</a></p>` : '') +
    `</div><p style="text-align:center;color:#7A6A62;font-size:12px;margin-top:14px">${esc(event_())} · Team Hub · you get this because you are on the organizing team</p></div>`;
}
/** Daily at reminder_hour: each person gets tomorrow's + overdue tasks; leads get the team summary. (Name kept from v3: the timer calls it.) */
function eveningReminders() {
  resetMemo_(); maybeUpgrade_();
  if (!hasAdmin_()) return;
  try { autoPurge_(); } catch (e) { report_('Error', 'autoPurge: ' + String(e && e.stack || e)); } // referral names: deleted after referral_delete_after
  const nowS = now_(), tmr = fmt_(new Date(Date.now() + 864e5), 'yyyy-MM-dd'), g = S_().greeting || 'Hi';
  const tasks = rows_('Tasks').filter(t => ['Done', 'Dropped'].indexOf(t.status) < 0);
  team_().forEach(p => {
    const mine = tasks.filter(t => t.owner === p.key), over = mine.filter(t => t.due < nowS), soon = mine.filter(t => t.due >= nowS && t.due.slice(0, 10) === tmr);
    if (!over.length && !soon.length) return;
    let msg = `${g}, ${first_(p)}!`;
    if (soon.length) msg += `\n\nDue tomorrow:\n` + soon.map(t => `• ${t.id} ${t.title} (${t.due.slice(11)})`).join('\n');
    if (over.length) msg += `\n\nOverdue — finish it, or press Blocked and say what you need:\n` + over.map(t => `• ${t.id} ${t.title} (was ${t.due})`).join('\n');
    msg += `\n\n${linkFor_(p)}`;
    notify_(p, { text: msg, subject: soon.length ? `Due tomorrow: ${soon.map(t => t.title).join(', ').slice(0, 80)}` : `${over.length} overdue task(s)`, kind: 'reminder', button: ['Open my tasks', linkFor_(p)] });
  });
  const s = summaryText_(), busy = s.over.length || s.blocked.length || s.soon.length;
  activePeople_().filter(isLead_).forEach(p => notify_(p, busy ? { text: progressText_() + '\n\n' + s.text, subject: 'Daily team summary', kind: 'reminder' } : { text: progressText_() + '\n\n' + s.text }));
  if (busy) postGroup_(s.text);
}
/** Sunday 19:00: full report to the leads, short version to the organizer group. Run by hand any time. */
function weeklyReport() {
  resetMemo_(); maybeUpgrade_();
  if (!hasAdmin_() || S_().weekly_report === 'no') return '';
  const nowS = now_(), f = ms => fmt_(new Date(ms)), weekAgo = f(Date.now() - 7 * 864e5), nextWeek = f(Date.now() + 7 * 864e5);
  const tasks = rows_('Tasks').filter(t => t.status !== 'Dropped'), people = activePeople_();
  const open = tasks.filter(t => t.status !== 'Done'), done7 = tasks.filter(t => t.status === 'Done' && t.done_at >= weekAgo);
  const over = open.filter(t => t.due < nowS), next = open.filter(t => t.due >= nowS && t.due <= nextWeek).sort((a, b) => a.due < b.due ? -1 : 1);
  const seen = seenMap_();
  const silent = team_().filter(p => !isLead_(p) && (!seen[p.name] || seen[p.name] < f(Date.now() - 5 * 864e5))).map(first_);
  const days = Math.max(0, Math.ceil((new Date(S_().event_start + 'T00:00:00Z').getTime() - Date.now()) / 864e5));
  const nm = k => { const p = people.find(x => x.key === k); return p ? first_(p) : k; };
  let full = `📊 Weekly report — ${nowS}\n${days} days to ${event_()}\n\nDone this week: ${done7.length}\nOverdue now: ${over.length}\nDue in the next 7 days: ${next.length}\n`;
  if (over.length) full += '\nOVERDUE:\n' + over.slice(0, 12).map(t => `• ${nm(t.owner)}: ${t.id} ${t.title} (was ${t.due})`).join('\n') + (over.length > 12 ? `\n…and ${over.length - 12} more` : '') + '\n';
  if (next.length) full += '\nNEXT 7 DAYS:\n' + next.slice(0, 15).map(t => `• ${t.due.slice(5, 10)} ${nm(t.owner)}: ${t.title}`).join('\n') + (next.length > 15 ? `\n…and ${next.length - 15} more` : '') + '\n';
  if (silent.length) full += '\n🔇 Not on the hub for 5+ days: ' + silent.join(', ') + '\n';
  full += '\n' + progressText_();
  const amb = ambReport_();
  if (amb.text) full += '\n\n' + amb.text;
  notifyLeads_({ text: full, subject: `Weekly report — ${days} days to go`, button: ['Open the dashboard', hubUrl_('admin')] });
  amb.buddies.forEach(x => { if (!isLead_(x[0])) notify_(x[0], { text: x[1] }); }); // leads read it in their report
  const gm = `📊 Week report — ${days} days to ${event_()}\nDone this week: ${done7.length} · Overdue: ${over.length}\n` + (next.length ? 'Next 7 days:\n' + next.slice(0, 6).map(t => `• ${t.due.slice(5, 10)} ${nm(t.owner)}: ${t.title}`).join('\n') : 'Nothing due next week.') +
    (signupLine_() ? '\n' + signupLine_() : '') + (amb.group ? '\n' + amb.group : '');
  if (S_().group_done_posts !== 'no') postGroup_(gm);
  log_('system', '', 'Weekly report', `done ${done7.length}, overdue ${over.length}`);
  return full;
}
/** Everyone's progress in one board: done / open / overdue / blocked per person. */
function progressText_() {
  const nowS = now_(), tasks = rows_('Tasks').filter(t => t.status !== 'Dropped');
  const rowsP = team_().map(p => {
    const mine = tasks.filter(t => t.owner === p.key), done = mine.filter(t => t.status === 'Done').length, open = mine.filter(t => t.status !== 'Done');
    return { p: p, total: mine.length, done: done, over: open.filter(t => t.due < nowS).length, blk: open.filter(t => t.status === 'Blocked').length, prog: open.filter(t => t.status === 'In progress').length };
  }).sort((a, b) => (b.over + b.blk) - (a.over + a.blk) || b.done - a.done);
  const dn = rowsP.reduce((s, r) => s + r.done, 0), tot = rowsP.reduce((s, r) => s + r.total, 0);
  let s = `📈 Progress — ${nowS}\nTeam: ${dn} of ${tot} tasks done (${tot ? Math.round(100 * dn / tot) : 0}%)\n`;
  rowsP.forEach(r => { s += `\n${r.over || r.blk ? '🔴' : r.done === r.total && r.total ? '✅' : '🟢'} ${first_(r.p)}: ${r.done}/${r.total} done` + (r.prog ? ` · ${r.prog} in progress` : '') + (r.over ? ` · ${r.over} overdue` : '') + (r.blk ? ` · ${r.blk} blocked` : ''); });
  const nobody = tasks.filter(t => !t.owner && t.status !== 'Done');
  if (nobody.length) s += `\n📭 Unassigned: ${nobody.length} open task(s) — give them to someone, or let people take them`;
  const su = signupLine_(); if (su) s += '\n\n' + su;
  return s;
}
/** Team-wide picture by person NAME: group digest, /team and the leads' daily summary. */
function summaryText_() {
  const nowS = now_(), tasks = rows_('Tasks').filter(t => ['Done', 'Dropped'].indexOf(t.status) < 0), tmr = fmt_(new Date(Date.now() + 864e5), 'yyyy-MM-dd');
  const over = tasks.filter(t => t.due < nowS), blocked = tasks.filter(t => t.status === 'Blocked'), soon = tasks.filter(t => t.due >= nowS && t.due.slice(0, 10) === tmr);
  const who = k => { if (!k) return 'Unassigned'; const p = people_().find(x => x.key === k); return p ? p.name + tag_(p) : k; };
  let s = `📊 ${event_()} — ${nowS}\nOverdue: ${over.length} · Blocked: ${blocked.length} · Due tomorrow: ${soon.length}`;
  if (blocked.length) s += '\n\n🔴 Blocked:\n' + blocked.map(t => `• ${who(t.owner)} — ${t.id} ${t.title}: ${t.blocked_reason}`).join('\n');
  if (over.length) s += '\n\n⏰ Overdue:\n' + over.slice(0, 15).map(t => `• ${who(t.owner)} — ${t.id} ${t.title} (was ${t.due})`).join('\n');
  if (soon.length) s += '\n\n📅 Due tomorrow:\n' + soon.slice(0, 15).map(t => `• ${who(t.owner)} — ${t.id} ${t.title} (${t.due.slice(11)})`).join('\n');
  return { text: s, over: over, blocked: blocked, soon: soon };
}
/** Builds the live "Progress" tab: formulas over Tasks + Log, so it updates the moment anyone marks a task done. Safe to run again. */
function buildProgress() {
  resetMemo_();
  const ss = ss_(), people = team_(), T = k => colLetter_('Tasks', k), start = S_().event_start;
  let sh = ss.getSheetByName('Progress'); if (sh) sh.clear(); else sh = ss.insertSheet('Progress', 0);
  sh.clearConditionalFormatRules();
  const own = `Tasks!$${T('owner')}$2:$${T('owner')}$2000`, st = `Tasks!$${T('status')}$2:$${T('status')}$2000`, due = `Tasks!$${T('due')}$2:$${T('due')}$2000`;
  const lt = `Log!$${colLetter_('Log', 'time')}$2:$${colLetter_('Log', 'time')}$9000`, lw = `Log!$${colLetter_('Log', 'who')}$2:$${colLetter_('Log', 'who')}$9000`;
  sh.getRange('A1').setValue(event_() + ' — live progress (updates by itself)').setFontSize(14).setFontWeight('bold');
  sh.getRange('A2').setFormula(`="Now: "&TEXT(NOW(),"yyyy-MM-dd HH:mm")&"  ·  Event: ${start}  ·  "&MAX(0,ROUNDUP(DATEVALUE("${start}")-NOW(),0))&" days to go"`);
  const H = ['Person', 'key', 'Tasks', 'Done', 'In progress', 'Blocked', 'Overdue', '% done', 'Last activity'];
  sh.getRange(4, 1, 1, H.length).setValues([H]).setFontWeight('bold').setBackground('#FFE3CF');
  const f = people.map((p, i) => {
    const r = 5 + i, k = `$B${r}`;
    return [p.name, p.key, `=COUNTIFS(${own},${k},${st},"<>Dropped")`, `=COUNTIFS(${own},${k},${st},"Done")`, `=COUNTIFS(${own},${k},${st},"In progress")`,
      `=COUNTIFS(${own},${k},${st},"Blocked")`, `=COUNTIFS(${own},${k},${st},"<>Done",${st},"<>Dropped",${due},"<"&TEXT(NOW(),"yyyy-MM-dd HH:mm"))`,
      `=IF(C${r}=0,0,D${r}/C${r})`, `=IFERROR(LOOKUP(2,1/(${lw}=$A${r}),${lt}),"—")`];
  });
  const n = f.length, last = 4 + n, tr = last + 1;
  if (n) sh.getRange(5, 1, n, H.length).setValues(f);
  sh.getRange(tr, 1, 1, 8).setFormulas([['="TEAM"', '', `=SUM(C5:C${last})`, `=SUM(D5:D${last})`, `=SUM(E5:E${last})`, `=SUM(F5:F${last})`, `=SUM(G5:G${last})`, `=IF(C${tr}=0,0,D${tr}/C${tr})`]]).setFontWeight('bold').setBackground('#F3F3F3');
  sh.getRange(5, 8, n + 1, 1).setNumberFormat('0%');
  if (n) {
    sh.getRange(5, 9, n, 1).setNumberFormat('@'); sh.getRange(5, 2, n, 1).setFontColor('#999999');
    sh.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground('#F8C9C0').setFontColor('#A01000').setRanges([sh.getRange(5, 6, n, 2)]).build()]);
  }
  sh.setColumnWidth(1, 150); sh.setFrozenRows(4);
  SpreadsheetApp.flush();
}

// ================================================================== Telegram bot (team only, optional)
function botLog_(what, detail) {
  const key = what + ': ' + detail, p = PropertiesService.getScriptProperties();
  p.setProperty('BOT_LAST_ERROR', now_() + ' · ' + key.slice(0, 300));
  if (p.getProperty('BOT_LAST_ERROR_KEY') !== key) { p.setProperty('BOT_LAST_ERROR_KEY', key); try { log_('bot', '', 'Error', key); } catch (e) { /* ignore */ } }
}
function tgCall_(method, payload) {
  const token = prop_('BOT_TOKEN'); if (!token) return { ok: false, description: 'No bot token yet (Dashboard → Settings → Telegram).' };
  try {
    const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(payload || {}) });
    let j; try { j = JSON.parse(res.getContentText() || '{}'); } catch (err) { j = { ok: false, description: 'Bad reply (HTTP ' + res.getResponseCode() + ')' }; }
    if (!j.ok && method !== 'getUpdates') botLog_(method, j.description || ('HTTP ' + res.getResponseCode()));
    return j;
  } catch (err) { botLog_(method, String(err)); return { ok: false, description: String(err) }; }
}
function tg_(chatId, text, extra) {
  if (!chatId || !prop_('BOT_TOKEN')) return { ok: false, description: 'no chat' };
  return tgCall_('sendMessage', Object.assign({ chat_id: chatId, text: String(text).slice(0, 4000), disable_web_page_preview: true }, extra || {}));
}
/** Post into the organizer group (in the topic where /setgroup was sent). */
function postGroup_(text) {
  const gid = prop_('GROUP_CHAT_ID'); if (!gid || !prop_('BOT_TOKEN')) return { ok: false, description: 'Group not set. Add the bot to your group and send /setgroup there.' };
  const th = prop_('GROUP_THREAD_ID');
  let r = tg_(gid, text, th ? { message_thread_id: Number(th) } : {});
  if (!r.ok && th && /thread/i.test(r.description || '')) r = tg_(gid, text); // the topic was deleted: post in the main chat
  return r;
}
function proofBlobs_(proof) {
  if (!prop_('BOT_TOKEN')) return [];
  const out = []; String(proof || '').replace(/\/file\/d\/([\w-]+)/g, (m, id) => { try { out.push(DriveApp.getFileById(id).getBlob()); } catch (e) { /* ignore */ } return m; });
  return out.slice(0, 4);
}
function sendPhoto_(chatId, blob, caption, extra) {
  const token = prop_('BOT_TOKEN'); if (!token || !chatId) return { ok: false };
  try {
    const isImg = /^image\//.test(blob.getContentType() || '');
    const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + (isImg ? 'sendPhoto' : 'sendDocument'), { method: 'post', muteHttpExceptions: true, payload: Object.assign({ chat_id: String(chatId), caption: String(caption || '').slice(0, 900) }, isImg ? { photo: blob } : { document: blob }, extra || {}) });
    const j = JSON.parse(res.getContentText() || '{}'); if (!j.ok) botLog_('sendPhoto', j.description || 'failed'); return j;
  } catch (err) { botLog_('sendPhoto', String(err)); return { ok: false }; }
}
function postGroupPhoto_(blob, caption) {
  const gid = prop_('GROUP_CHAT_ID'); if (!gid) return { ok: false };
  const th = prop_('GROUP_THREAD_ID');
  let r = sendPhoto_(gid, blob, caption, th ? { message_thread_id: th } : {});
  if (!r.ok && th) r = sendPhoto_(gid, blob, caption);
  return r;
}
/** Runs every minute once a bot token is saved. Understands /start <code>, /tasks, /hub, /team and, in the organizer group, /setgroup and "T014 DONE — link". Everyone else is ignored. */
function pollTelegram() {
  resetMemo_();
  if (!prop_('BOT_TOKEN') || SELF_HOSTED) return; // on a server the bot uses a webhook instead
  const lock = LockService.getScriptLock(); if (!lock.tryLock(25000)) return;
  try {
    const offset = Number(prop_('TG_OFFSET') || 0);
    const data = tgCall_('getUpdates', { offset: offset, timeout: 0, allowed_updates: ['message'] });
    setProp_('BOT_LAST_POLL', now_());
    if (!data.ok) { botLog_('getUpdates', data.description || 'failed'); if (/webhook/i.test(data.description || '')) tgCall_('deleteWebhook', {}); return; }
    let last = offset - 1;
    (data.result || []).forEach(u => { last = Math.max(last, u.update_id); try { handleUpdate_(u); } catch (err) { botLog_('handler', String(err)); } });
    if (last >= offset) setProp_('TG_OFFSET', String(last + 1));
  } finally { lock.releaseLock(); }
}
function handleUpdate_(u) {
  const m = u.message; if (!m || !m.text || !m.from) return;
  if (m.from.is_bot) { // group admins who "remain anonymous" arrive as GroupAnonymousBot
    if (m.from.username === 'GroupAnonymousBot' && /^\/setgroup/i.test(m.text.trim())) tg_(m.chat.id, 'Your message came as an anonymous admin, so I cannot tell who you are. Group settings → Administrators → your name → turn OFF "Remain anonymous", then send /setgroup again.', m.message_thread_id ? { message_thread_id: m.message_thread_id } : {});
    return;
  }
  const txt = m.text.trim(), uid = String(m.from.id), people = people_();
  const me = people.find(p => p.chat_id === uid && p.active !== 'no') || null;
  const parts = txt.split(/\s+/); let cmd = parts[0].toLowerCase();
  const at = cmd.indexOf('@');
  if (at > 0) { const mine = prop_('BOT_USERNAME').replace(/^@/, '').toLowerCase(); if (mine && cmd.slice(at + 1) !== mine) return; cmd = cmd.slice(0, at); }
  if (m.chat.type === 'private') return privateMsg_(m, parts, cmd, uid, me, people);
  return groupMsg_(m, txt, cmd, me);
}
function privateMsg_(m, parts, cmd, uid, me, people) {
  const chat = m.chat.id, hour = Number(S_().reminder_hour) || 18;
  if (cmd === '/start' || cmd === '/connect') {
    const tok = parts[1] || '';
    if (tok) {
      const p = people.find(x => x.token && x.token === tok && x.active !== 'no');
      if (!p) { tg_(chat, `That code is not valid any more. Ask ${contact_()} for your current Team Hub link.`); return; }
      if (access_(p) === 'viewer') { tg_(chat, 'Guest links don\'t use the bot — it only reminds organizers.'); return; }
      const clash = people.filter(x => x.chat_id === uid && x.key !== p.key); clash.forEach(x => { x.chat_id = ''; }); writeMany_('People', clash); // one Telegram account = one person
      p.chat_id = uid; write_('People', p); log_(p.name, '', 'Telegram connected', ''); refreshLinks();
      let msg = `Connected, ${first_(p)}! ✅\nI only talk to the ${event_()} organizers.\n\n• Every day at ${hour}:00 I tell you what is due tomorrow or overdue.\n• /tasks — your open tasks\n• /hub — your personal Team Hub link\n• /team — how the team is doing`;
      if (isLead_(p)) msg += `\n\nYou are a lead, so BLOCKED alerts come to you here. To make me post in the organizer group: add me to the group, open the topic you want, and send /setgroup there.`;
      tg_(chat, msg); return;
    }
    if (me) { tg_(chat, `You're connected, ${first_(me)}. /tasks to see what's open, /hub for your link.`); return; }
    tg_(chat, `This bot is only for the ${event_()} organizer team. Open your personal Team Hub link and press "Connect Telegram".`);
    return;
  }
  if (!me) return; // strangers get nothing
  if (cmd === '/tasks') { tg_(chat, openList_(me) || 'Nothing open. 🎉'); return; }
  if (cmd === '/hub') { tg_(chat, account_(me) ? `Your Team Hub (sign in as "${account_(me).username}"):\n${linkFor_(me)}` : inviteMode_() ? `Your Team Hub:\n${linkFor_(me)}\n\nIt opens on the phones you already signed in on${me.google_sub ? ', or press "Sign in with Google"' : ''}. New phone? Ask ${contact_()} for a new invite.` : 'Your personal Team Hub (only yours — don\'t share):\n' + linkFor_(me)); return; }
  if (cmd === '/signups') { tg_(chat, signupsCmd_(me, parts[1])); return; }
  if (cmd === '/progress') { tg_(chat, isLead_(me) ? progressText_() : summaryText_().text); return; }
  if (cmd === '/team' || cmd === '/status') { tg_(chat, summaryText_().text); return; }
  tg_(chat, 'I only send reminders. Report in your Team Hub (Start / Done / Blocked). /tasks · /hub · /team · /signups');
}
function groupMsg_(m, txt, cmd, me) {
  if (!me) {
    if (cmd === '/setgroup') tg_(m.chat.id, 'I do not know this Telegram account yet. Open a private chat with me and press "Connect Telegram" in your Team Hub first, then send /setgroup here again.', m.message_thread_id ? { message_thread_id: m.message_thread_id } : {});
    return;
  }
  const here = String(m.chat.id) === prop_('GROUP_CHAT_ID'), th = m.message_thread_id ? { message_thread_id: m.message_thread_id } : {};
  const say = t => tg_(m.chat.id, t, th);
  if (cmd === '/setgroup') {
    if (!isLead_(me)) { say('Only leads can set the group.'); return; }
    setProp_('GROUP_CHAT_ID', String(m.chat.id)); setProp_('GROUP_THREAD_ID', m.message_thread_id ? String(m.message_thread_id) : '');
    log_(me.name, '', 'Group set', (m.chat.title || '') + (m.message_thread_id ? ' (topic ' + m.message_thread_id + ')' : ''));
    say('✅ Done. I will post team updates here: BLOCKED alerts, finished tasks, new tasks and the daily digest. Team members can also write "T014 DONE — link" or "T014 BLOCKED — what I need" here.');
    return;
  }
  if (!here) return;
  const rep = txt.match(/^(T\d{3,})\s+(done|blocked)\b[\s:—–-]*(.*)$/i);
  if (rep) {
    const st = rep[2].toLowerCase() === 'done' ? 'Done' : 'Blocked', r = setStatus_(me, { id: rep[1].toUpperCase(), status: st, proof: rep[3], reason: rep[3] });
    if (!r.ok) say('⚠️ ' + r.error);
    return;
  }
  if (cmd === '/tasks') { say(me.name + ':\n' + (openList_(me) || 'Nothing open. 🎉')); return; }
  if (cmd === '/progress') { say(progressText_()); return; }
  if (cmd === '/team' || cmd === '/status') { say(summaryText_().text); return; }
  if (cmd === '/signups') { const n = txt.split(/\s+/)[1], r = signupsCmd_(me, n, true); if (r) say(r); return; }
  if (cmd === '/blocked') { const b = rows_('Tasks').filter(t => t.status === 'Blocked'); say(b.length ? b.map(t => `• ${nameOf_(t.owner)} — ${t.id} ${t.title}: ${t.blocked_reason}`).join('\n') : 'Nothing blocked. 🎉'); return; }
  if (cmd === '/help') say('Commands: /tasks (yours) · /team (overdue + blocked) · /blocked · /signups (leads: /signups 57 saves today\'s count). Report a task here: "T014 DONE — link" or "T014 BLOCKED — what you need".');
}
/** /signups → the count; a lead's /signups 57 saves today's total. inGroup: the saved count is posted by the feed already, so say nothing more. */
function signupsCmd_(me, n, inGroup) {
  if (n === undefined || n === '') return signupLine_() || 'No signup count yet.' + (isLead_(me) ? ' Send /signups 57 with the number from HQ\'s dashboard.' : '');
  if (!isLead_(me)) return 'Only leads can save the signup count.';
  const r = recordSignups_(me.name, n, { source: 'Telegram' });
  if (!r.ok) return '⚠️ ' + r.error;
  return inGroup && r.posted ? '' : '✅ Saved. ' + signupLine_();
}
function openList_(p) {
  const open = rows_('Tasks').filter(t => t.owner === p.key && ['Done', 'Dropped'].indexOf(t.status) < 0).sort((a, b) => a.due < b.due ? -1 : 1);
  return open.slice(0, 10).map(t => `• ${t.id} ${t.title} — due ${t.due}${t.status === 'Blocked' ? ' (BLOCKED)' : ''}`).join('\n');
}
function tgSetToken_(me, b) {
  const tok = clean_(b.token, 100);
  if (!tok) {
    ['BOT_TOKEN', 'BOT_USERNAME', 'TG_OFFSET'].forEach(k => PropertiesService.getScriptProperties().deleteProperty(k));
    try { installTriggers_(); } catch (e) { /* ignore */ }
    log_(me.name, '', 'Bot removed', ''); return { ok: true, report: 'Bot token removed. The bot is off.', bot: '' };
  }
  if (!/^\d{5,}:[\w-]{30,}$/.test(tok)) return { ok: false, error: 'That doesn\'t look like a token from @BotFather (it looks like 123456789:AAE…).' };
  setProp_('BOT_TOKEN', tok); setProp_('BOT_USERNAME', ''); setProp_('TG_OFFSET', '0');
  const report = botDoctor();
  log_(me.name, '', 'Bot token saved', prop_('BOT_USERNAME'));
  return { ok: !!prop_('BOT_USERNAME'), report: report, bot: prop_('BOT_USERNAME'), error: prop_('BOT_USERNAME') ? '' : 'Telegram did not accept that token.' };
}
function botInfo_() {
  const info = { token: !!prop_('BOT_TOKEN'), siteUrl: site_(), lastPoll: prop_('BOT_LAST_POLL'), lastError: prop_('BOT_LAST_ERROR'), usernameSetting: prop_('BOT_USERNAME') };
  if (info.token) {
    const me = tgCall_('getMe', {}); info.tokenOk = !!me.ok; info.username = me.ok ? me.result.username : ''; info.tokenError = me.ok ? '' : me.description;
    const wh = tgCall_('getWebhookInfo', {}); info.webhook = wh.ok ? (wh.result.url || '') : ''; info.pending = wh.ok ? wh.result.pending_update_count : null;
    info.canJoinGroups = me.ok ? me.result.can_join_groups !== false : null; info.canReadAll = me.ok ? !!me.result.can_read_all_group_messages : null;
  }
  const trig = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  info.mode = SELF_HOSTED ? 'webhook' : 'polling';
  info.polling = SELF_HOSTED ? (!!info.webhook && info.webhook === HUB_SERVER.webhookUrl()) : trig.indexOf('pollTelegram') >= 0;
  info.reminders = SELF_HOSTED || trig.indexOf('eveningReminders') >= 0;
  const people = team_();
  info.connected = people.filter(p => p.chat_id).length; info.total = people.length; info.missing = people.filter(p => !p.chat_id).map(p => p.name);
  info.groupSet = !!prop_('GROUP_CHAT_ID'); info.groupTopic = prop_('GROUP_THREAD_ID');
  return info;
}
function botTest_(me, b) {
  const stamp = now_();
  if (b.target === 'group') { const r = postGroup_(`🧪 Test from the Team Hub (${stamp}). If you can read this, the group link works.`); return { ok: !!r.ok, detail: r.ok ? 'Delivered to the organizer group.' : (r.description || 'Failed') }; }
  if (b.target === 'email') { if (!me.email) return { ok: false, detail: 'Add your email in Profile first.' }; const ok = mail_(me.email, 'Test email', `🧪 Test from the Team Hub (${stamp}). If you can read this, email works.`); return { ok: ok, detail: ok ? 'Sent to ' + me.email : 'Could not send (daily limit?)' }; }
  if (!me.chat_id) return { ok: false, detail: 'You have not connected Telegram yet: Profile → Connect Telegram.' };
  const r = tg_(me.chat_id, `🧪 Test from the Team Hub (${stamp}). If you can read this, the bot can message you.`);
  return { ok: !!r.ok, detail: r.ok ? 'Delivered to you on Telegram.' : ('Telegram said: ' + (r.description || 'failed')) };
}
/** Run from the editor (or Haven Hub → Check the Telegram bot) whenever the bot is silent. Fixes what it can and says what is wrong. */
function botDoctor() {
  resetMemo_();
  const L = [];
  if (!prop_('BOT_TOKEN')) L.push('❌ No bot token yet. Dashboard → Settings → Telegram → paste the token from @BotFather.');
  else {
    const me = tgCall_('getMe', {});
    if (!me.ok) L.push('❌ Telegram rejected the token: ' + me.description + ' — get a fresh token from @BotFather (/token).');
    else {
      L.push('✅ Token works: @' + me.result.username);
      if (prop_('BOT_USERNAME').replace(/^@/, '').toLowerCase() !== me.result.username.toLowerCase()) { setProp_('BOT_USERNAME', me.result.username); L.push('🔧 Saved the bot name (this makes the "Connect Telegram" button appear).'); }
      if (SELF_HOSTED) { HUB_SERVER.setWebhook(); L.push('✅ Telegram now delivers messages straight to the server (webhook).'); }
      else {
        const wh = tgCall_('getWebhookInfo', {});
        if (wh.ok && wh.result.url) { tgCall_('deleteWebhook', {}); L.push('🔧 A webhook was blocking the bot — removed it.'); }
        try { installTriggers_(); L.push('✅ Timers on: check for messages every minute + daily reminders.'); } catch (e) { L.push('❌ Could not install the timers: in the Sheet use Haven Hub → Turn on reminders.'); }
      }
      const lead = activePeople_().find(p => isLead_(p) && p.chat_id);
      if (lead) { const r = tg_(lead.chat_id, '🧪 Bot check: if you can read this, the bot can message you.'); L.push(r.ok ? '✅ Test message delivered to ' + lead.name : '❌ Could not message ' + lead.name + ': ' + r.description); }
      else L.push('ℹ️ No lead has connected yet: Profile → Connect Telegram → Start.');
      L.push(prop_('GROUP_CHAT_ID') ? '✅ Organizer group is set.' : 'ℹ️ Organizer group not set yet: add the bot to the group, open the topic, send /setgroup.');
    }
  }
  const out = L.join('\n');
  try { refreshLinks(); report_('Bot check', out); } catch (e) { /* no sheet yet */ }
  return out;
}
