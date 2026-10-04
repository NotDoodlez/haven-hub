/* Haven Hub — inbox watcher (optional).
   Runs in the Google account of your city mailbox (e.g. yourcity@haven.hackclub.com), NOT in the hub's Sheet,
   so the hub itself never needs permission to read anyone's email.
   Every 5 minutes it looks for new emails and sends the hub the sender, the subject, the first lines and a Gmail link.
   They show up in Dashboard → Inbox, and leads get a Telegram message. Replies still happen in Gmail.

   Set up (5 minutes):
   1. Signed in as the city mailbox, open https://script.new and replace everything with this file.
   2. Fill in HUB_API and FEED_KEY below — both are in the hub: Dashboard → Settings → Connections.
   3. Choose the function "install" in the toolbar → Run → allow access.
   To stop: run "uninstall". A new feed key (Settings → Connections → Renew) also stops it until you paste the new one.

   If your mailbox belongs to an organization, its admins may block Apps Script. Then forward the mail to a Gmail
   account you own (Gmail → Settings → Forwarding) and run the watcher there. */

const HUB_API = '';   // the hub address: ends in /exec (Google Sheet hub) or /api (own server)
const FEED_KEY = '';  // starts with fk_ — it can only add emails to Inbox and save the signup count
const QUERY = 'in:inbox -category:promotions -category:social -category:forums'; // which emails count (Gmail search)
const MAX_THREADS = 40;

function checkInbox() {
  if (!/^https:\/\//.test(HUB_API) || !/^fk_/.test(FEED_KEY)) throw new Error('Fill in HUB_API and FEED_KEY at the top first (Dashboard → Settings → Connections).');
  const props = PropertiesService.getScriptProperties(), started = Date.now();
  const since = Number(props.getProperty('since')) || started - 2 * 864e5; // first run: the last two days
  const from = since - 10 * 60e3; // a little overlap: an email that arrived during the last check is not missed (the hub skips ones it has)
  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const items = [];
  GmailApp.search(QUERY + ' after:' + Math.floor(from / 1000), 0, MAX_THREADS).forEach(th => {
    th.getMessages().forEach(m => {
      const at = m.getDate().getTime(), sender = m.getFrom();
      if (at < from || (me && sender.toLowerCase().indexOf(me) >= 0)) return; // older, or our own reply
      items.push({ id: m.getId(), time: m.getDate().toISOString(), from: sender, subject: m.getSubject(),
        snippet: m.getPlainBody().replace(/\s+/g, ' ').trim().slice(0, 300),
        link: 'https://mail.google.com/mail/u/?authuser=' + encodeURIComponent(me) + '#all/' + th.getId() });
    });
  });
  for (let i = 0; i < items.length; i += 50) send_(items.slice(i, i + 50), me);
  props.setProperty('since', String(started));
  return items.length;
}

function send_(items, mailbox) {
  const res = UrlFetchApp.fetch(HUB_API, { method: 'post', contentType: 'text/plain;charset=utf-8', muteHttpExceptions: true,
    payload: JSON.stringify({ action: 'inbox.push', key: FEED_KEY, mailbox: mailbox, items: items }) });
  let r = null;
  try { r = JSON.parse(res.getContentText()); } catch (e) { /* not JSON */ }
  if (!r || !r.ok) throw new Error('The hub said: ' + (r ? r.error : 'HTTP ' + res.getResponseCode() + ' — check HUB_API.'));
  return r.added;
}

/** Run once: checks now, then every 5 minutes. */
function install() {
  uninstall();
  const n = checkInbox();
  ScriptApp.newTrigger('checkInbox').timeBased().everyMinutes(5).create();
  Logger.log('Connected. ' + n + ' email(s) from the last two days sent to the hub. It now checks every 5 minutes.');
}

function uninstall() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'checkInbox').forEach(t => ScriptApp.deleteTrigger(t));
}
