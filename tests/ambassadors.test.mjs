// 5.1: ambassadors (students who bring their school, each with a code) and referral links <hub>/r/CODE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createGas, loadBackend } from '../docs/demo/gas-fakes.js';
import { createHub } from '../server/app.mjs';
import qrcode from '../docs/js/vendor/qrcode.js';
import { qrMatrix } from '../docs/js/qr.js';

const CODE = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const HUB = 'AKfycbTESTdeployment0000000000000000000000000000';
const SIGNUP = 'https://haven.hackclub.com/springfield';

/** A hub with personal links (so tests sign in as anyone), an admin, a member and a guest viewer. */
function setupHub(opts = {}) {
  const gas = createGas({ tz: 'Asia/Tashkent' }), be = loadBackend(CODE, gas);
  const r = be.post({ action: 'setup', sheet: 'https://docs.google.com/spreadsheets/d/' + gas._ss.getId() + '/edit', hub: HUB, name: 'Ada Lovelace', email: 'ada@example.com', invites: false,
    event: { name: 'Haven Springfield', city: 'Springfield', start: opts.start || '2026-11-14', end: opts.end || '2026-11-15', timezone: 'Asia/Tashkent', signup: SIGNUP }, starter: false });
  assert.equal(r.ok, true, r.error);
  const h = { gas, be, admin: { u: r.key, t: r.token } };
  h.as = (who, body) => be.post(Object.assign({}, body, { u: who.u, t: who.t }));
  h.get = (who, q) => be.get(Object.assign({}, q, { u: who.u, t: who.t }));
  h.add = person => { const x = h.as(h.admin, { action: 'person.add', person }); assert.equal(x.ok, true, x.error); const q = new URL(x.link).searchParams; return { u: q.get('u'), t: q.get('t'), key: x.person.key }; };
  if (opts.bot) { gas._props.BOT_TOKEN = '1:x'; gas._props.BOT_USERNAME = 'test_bot'; gas._props.GROUP_CHAT_ID = '-100'; }
  return h;
}
const sk = link => Object.fromEntries(new URLSearchParams(String(link).split('#/amb?')[1] || ''));

test('referral links: off = straight to the signup page with ?ref= and nothing saved; on = first name + code, then the signup page', () => {
  const h = setupHub();
  const theo = h.add({ name: 'Theo Martins', access: 'member' });
  const a = h.as(theo, { action: 'amb.save', amb: { name: 'Malika Karimova', school: 'School 110', contact: 'https://t.me/malika_k' } });
  assert.equal(a.ok, true, a.error);
  const m = a.ambassador;
  assert.match(m.code, /^MALIKA\d\d$/); assert.equal(m.buddy, theo.key, 'whoever adds an ambassador is their buddy'); assert.equal(m.contact, '@malika_k');
  assert.equal(m.link, `https://notazizelse.github.io/haven-hub/?hub=${HUB}#/r/${m.code}`, 'a Sheet hub: the shared website');
  // off (the default): the page goes straight on, nothing is stored
  const c = h.be.get({ action: 'referral.check', code: ' ' + m.code.toLowerCase() + '"<>' });
  assert.equal(c.ok, true); assert.equal(c.on, false); assert.equal(c.code, m.code); assert.equal(c.inviter, 'Malika'); assert.equal(c.url, SIGNUP + '?ref=' + m.code);
  const off = h.be.post({ action: 'referral.save', code: m.code, name: 'Bob' });
  assert.equal(off.ok, true); assert.equal(off.saved, false); assert.equal(off.url, SIGNUP + '?ref=' + m.code);
  assert.equal(h.be.call('rows_', 'Referrals').length, 0, 'nothing was stored');
  // on
  assert.equal(h.as(h.admin, { action: 'settings.save', values: { referrals: 'maybe' } }).ok, false);
  assert.equal(h.as(h.admin, { action: 'settings.save', values: { referrals: 'on' } }).ok, true);
  assert.equal(h.be.post({ action: 'referral.save', code: m.code, name: ' ' }).code, 'name');
  const s1 = h.be.post({ action: 'referral.save', code: m.code, name: 'Aziz' });
  assert.equal(s1.saved, true); assert.equal(s1.url, SIGNUP + '?ref=' + m.code);
  assert.equal(h.be.post({ action: 'referral.save', code: m.code, name: 'Aziz' }).dup, true, 'the same name twice in an hour is one row');
  h.be.post({ action: 'referral.save', code: m.code, name: '=HYPERLINK("x")' });
  h.be.post({ action: 'referral.save', code: 'IG', name: 'Lola' }); // a code that is no ambassador still counts for it
  const bot = h.be.post({ action: 'referral.save', code: m.code, name: 'Spam', company: 'ACME' });
  assert.equal(bot.ok, true); assert.equal(bot.saved, false, 'the honeypot saves nothing');
  const rows = h.be.call('rows_', 'Referrals');
  assert.equal(rows.length, 3);
  assert.equal(rows[1].name, "'=HYPERLINK(\"x\")", 'a formula-looking name is stored as text');
  assert.deepEqual(Object.keys(rows[0]).filter(k => k[0] !== '_').sort(), ['came', 'checked_at', 'checked_by', 'code', 'id', 'name', 'time'], 'nothing else about a friend is stored');
  // what the team sees
  const mine = h.get(theo, { action: 'me' });
  assert.equal(mine.ambassadors.length, 1); assert.equal(mine.ambassadors[0].n, 2); assert.equal(mine.ambassadors[0].week, 2);
  assert.deepEqual(mine.referrals.map(r => r.name).sort(), ['=HYPERLINK("x")', 'Aziz'], 'the buddy sees the names their ambassadors brought, shown without the guard');
  const all = h.get(h.admin, { action: 'me' });
  assert.equal(all.referrals.length, 3); assert.equal(all.amb.on, true); assert.equal(all.amb.deleteOn, '2026-11-22');
  // a signup page is needed
  h.as(h.admin, { action: 'settings.save', values: { signup_url: '' } });
  assert.equal(h.be.get({ action: 'referral.check', code: 'X' }).code, 'no_signup');
});

test('ambassadors: anyone on the team adds one and looks after them; leads see all; guests see none; codes are unique; add several; channel codes', () => {
  const h = setupHub();
  const theo = h.add({ name: 'Theo Martins', access: 'member' }), lina = h.add({ name: 'Lina Petrova', access: 'member' }), omar = h.add({ name: 'Omar Haddad', access: 'lead' });
  const guest = h.add({ name: 'Ms. Rivera', access: 'viewer' });
  const t1 = h.as(theo, { action: 'amb.save', amb: { name: 'Ali Valiyev', school: 'School 12', code: 'ali' } });
  assert.equal(t1.ok, true, t1.error); assert.equal(t1.ambassador.code, 'ALI');
  assert.match(h.as(lina, { action: 'amb.save', amb: { name: 'Alisher', code: 'Ali' } }).error, /taken \(Ali Valiyev\)/);
  assert.match(h.as(lina, { action: 'amb.save', amb: { key: t1.ambassador.key, note: 'mine now' } }).error, /Only leads or Theo/);
  assert.equal(h.as(lina, { action: 'amb.save', amb: { name: 'Nodira', buddy: theo.key } }).ambassador.buddy, lina.key, 'a member can only be the buddy themselves');
  assert.equal(h.as(lina, { action: 'amb.save', amb: { name: 'IG bio', kind: 'channel' } }).ok, false, 'channel codes are for leads');
  assert.equal(h.as(guest, { action: 'amb.save', amb: { name: 'X' } }).ok, false);
  assert.equal(h.get(guest, { action: 'me' }).ambassadors, undefined, 'guests see no ambassadors');
  // Cyrillic names get Latin keys and codes
  const ru = h.as(omar, { action: 'amb.save', amb: { name: 'Малика Юсупова', buddy: lina.key } });
  assert.equal(ru.ok, true, ru.error); assert.equal(ru.ambassador.key, 'malika'); assert.match(ru.ambassador.code, /^MALIKA\d\d$/); assert.equal(ru.ambassador.buddy, lina.key);
  assert.match(h.as(omar, { action: 'amb.save', amb: { name: 'Zed', buddy: 'nobody' } }).error, /someone on the team/);
  // add several: good lines are saved, bad ones reported
  const many = h.as(omar, { action: 'amb.save', list: [{ name: 'Sardor', school: 'School 5' }, { name: 'x' }, { name: 'Kamola', code: 'ALI' }, { name: 'Bekzod' }] });
  assert.equal(many.ok, true); assert.equal(many.saved.length, 2); assert.equal(many.errors.length, 2); assert.match(many.errors[0], /^Line 2:/);
  const ch = h.as(omar, { action: 'amb.save', amb: { name: 'Instagram bio', kind: 'channel', code: 'IG' } });
  assert.equal(ch.ok, true, ch.error); assert.equal(ch.ambassador.kind, 'channel'); assert.equal(ch.ambassador.buddy, '', 'a channel code has no buddy');
  assert.equal(h.as(omar, { action: 'amb.link', key: ch.ambassador.key }).ok, false, 'a channel code has no page');
  // who sees what
  assert.deepEqual(h.get(theo, { action: 'me' }).ambassadors.map(a => a.name), ['Ali Valiyev']);
  assert.deepEqual(h.get(lina, { action: 'me' }).ambassadors.map(a => a.name).sort(), ['Nodira', 'Малика Юсупова']);
  assert.equal(h.get(omar, { action: 'me' }).ambassadors.length, 6);
  assert.equal(h.get(omar, { action: 'me' }).features.includes('ambassadors'), true);
  // left = their page stops working; delete is for leads
  const link = h.as(theo, { action: 'amb.link', key: t1.ambassador.key });
  assert.equal(h.be.post(Object.assign({ action: 'amb.page' }, sk(link.page))).ok, true);
  assert.equal(h.as(theo, { action: 'amb.save', amb: { key: t1.ambassador.key, status: 'left' } }).ok, true);
  assert.equal(h.be.post(Object.assign({ action: 'amb.page' }, sk(link.page))).code, 'gone');
  assert.equal(h.as(theo, { action: 'amb.delete', key: t1.ambassador.key }).ok, false);
  assert.equal(h.as(omar, { action: 'amb.delete', key: t1.ambassador.key }).ok, true);
});

test('the ambassador page: only with their private link; their own numbers, the top 5 (first names, capped), no one else\'s contacts', () => {
  const h = setupHub();
  h.as(h.admin, { action: 'settings.save', values: { languages: 'uz,en', referrals: 'on', referral_cap: '3', ambassador_group: 'https://t.me/+amb', referral_rewards: '1 friend: stickers\n3 friends: same team', referral_rewards_uz: '1 doʻst: stikerlar', amb_message_uz: 'Salom! {link}' } });
  const theo = h.add({ name: 'Theo Martins', access: 'member', handle: '@theo_m' });
  const ids = ['Ali', 'Bek', 'Gulnora', 'Diyor', 'Elena', 'Farrux'].map(n => h.as(theo, { action: 'amb.save', amb: { name: n + ' Testov', contact: '@' + n.toLowerCase() + '_secret', school: 'School 1' } }).ambassador);
  const counts = [5, 4, 3, 2, 1, 1];
  ids.forEach((a, i) => { for (let k = 0; k < counts[i]; k++) h.be.post({ action: 'referral.save', code: a.code, name: 'Friend' + i + '_' + k }); });
  const link = h.as(theo, { action: 'amb.link', key: ids[2].key });
  assert.equal(link.ok, true); assert.match(link.page, /#\/amb\?k=gulnora&s=[0-9a-f]{32}$/);
  const P = h.be.post(Object.assign({ action: 'amb.page' }, sk(link.page)));
  assert.equal(P.ok, true, P.error);
  assert.equal(P.me.first, 'Gulnora'); assert.equal(P.me.n, 3); assert.equal(P.me.code, ids[2].code); assert.equal(P.cap, 3);
  assert.deepEqual(P.top.map(t => [t.name, t.score]), [['Ali', 3], ['Bek', 3], ['Gulnora', 3], ['Diyor', 2], ['Elena', 1]], 'top 5, capped at referral_cap');
  assert.equal(P.top.find(t => t.name === 'Gulnora').me, true);
  assert.deepEqual(P.buddy, { name: 'Theo', handle: '@theo_m' });
  assert.equal(P.group, 'https://t.me/+amb'); assert.equal(P.rewards.uz, '1 doʻst: stikerlar'); assert.equal(P.messages.uz, 'Salom! {link}');
  const txt = JSON.stringify(P);
  assert.equal(txt.includes('_secret'), false, 'no contacts'); assert.equal(txt.includes('Friend'), false, 'no friends\' names'); assert.equal(txt.includes('Testov'), false, 'first names only');
  // wrong or missing secret
  assert.equal(h.be.post({ action: 'amb.page', k: ids[2].key, s: 'f'.repeat(32) }).code, 'gone');
  assert.equal(h.be.post({ action: 'amb.page', k: ids[2].key }).code, 'gone');
  assert.equal(h.be.get(Object.assign({ action: 'amb.page' }, sk(link.page))).ok, false, 'POST only, so the secret stays out of addresses');
  // a new link switches the old one off
  const again = h.as(theo, { action: 'amb.link', key: ids[2].key, reset: true });
  assert.equal(h.be.post(Object.assign({ action: 'amb.page' }, sk(link.page))).code, 'gone');
  assert.equal(h.be.post(Object.assign({ action: 'amb.page' }, sk(again.page))).ok, true);
});

test('check-in: everyone on the team ticks "came" during the event days; the leaderboard then counts friends who came', () => {
  const h = setupHub({ start: '2020-01-01', end: '2099-12-31' }); // the event is "now"
  h.as(h.admin, { action: 'settings.save', values: { referrals: 'on' } });
  const theo = h.add({ name: 'Theo Martins' }), lina = h.add({ name: 'Lina Petrova' });
  const a = h.as(theo, { action: 'amb.save', amb: { name: 'Ali' } }).ambassador;
  ['Bob', 'Cat', 'Dan'].forEach(n => h.be.post({ action: 'referral.save', code: a.code, name: n }));
  const L = h.get(lina, { action: 'me' });
  assert.equal(L.amb.open, true); assert.equal(L.referrals.length, 3, 'at check-in everyone sees the names');
  assert.equal(L.ambassadors.length, 0, '…but only their own ambassadors');
  const bob = L.referrals.find(r => r.name === 'Bob');
  const t = h.as(lina, { action: 'referral.update', id: bob.id, came: true });
  assert.equal(t.ok, true, t.error); assert.equal(t.referral.came, true); assert.equal(t.referral.checked_by, 'Lina Petrova');
  assert.equal(h.as(lina, { action: 'referral.update', id: bob.id, delete: true }).ok, false, 'only leads delete');
  assert.equal(h.as(lina, { action: 'referral.update', id: bob.id, code: 'X' }).ok, false, 'only leads change codes');
  // the desk adds someone who never used the link
  const add = h.as(lina, { action: 'referral.add', name: 'Eve', code: a.code.toLowerCase(), came: true });
  assert.equal(add.ok, true, add.error); assert.equal(add.referral.came, true); assert.equal(add.referral.code, a.code);
  const me = h.get(theo, { action: 'me' }).ambassadors[0];
  assert.equal(me.n, 4); assert.equal(me.came, 2); assert.equal(me.score, 2, 'from the first event day the score is friends who came');
  assert.equal(h.as(lina, { action: 'referral.update', id: bob.id, came: false }).referral.came, false);
});

test('before the event a member only sees and changes their own ambassadors\' names; privacy: names and contacts are deleted after the date', () => {
  const h = setupHub();
  h.as(h.admin, { action: 'settings.save', values: { referrals: 'on' } });
  const theo = h.add({ name: 'Theo Martins' }), lina = h.add({ name: 'Lina Petrova' });
  const a = h.as(theo, { action: 'amb.save', amb: { name: 'Ali', contact: '@ali_x', note: 'met at School 12' } }).ambassador;
  h.be.post({ action: 'referral.save', code: a.code, name: 'Bob' });
  assert.equal(h.get(lina, { action: 'me' }).referrals.length, 0);
  const rid = h.get(theo, { action: 'me' }).referrals[0].id;
  assert.equal(h.as(lina, { action: 'referral.update', id: rid, came: true }).ok, false);
  assert.equal(h.as(lina, { action: 'referral.add', name: 'Zoe', code: a.code }).ok, false);
  assert.equal(h.as(theo, { action: 'referral.add', name: 'Zoe', code: a.code }).ok, true, 'the buddy may');
  const link = h.as(theo, { action: 'amb.link', key: a.key });
  // the delete date passed → the evening job deletes names, contacts, notes and page links; counts stay
  h.as(h.admin, { action: 'settings.save', values: { referral_delete_after: '2020-01-01' } });
  h.be.call('eveningReminders'); h.be.call('resetMemo_');
  const R = h.be.call('rows_', 'Referrals');
  assert.equal(R.length, 2); assert.ok(R.every(r => r.name === '' && r.code === a.code));
  const A = h.be.call('rows_', 'Ambassadors')[0];
  assert.equal(A.contact, ''); assert.equal(A.note, ''); assert.equal(A.token, ''); assert.equal(A.name, 'Ali', 'the name stays (volunteer hours)');
  assert.equal(h.be.post(Object.assign({ action: 'amb.page' }, sk(link.page))).code, 'gone');
  assert.equal(h.get(theo, { action: 'me' }).ambassadors[0].n, 2, 'the numbers stay right');
  assert.ok(h.get(h.admin, { action: 'me' }).log.some(l => l.action === 'Referral data deleted'));
  // admins can do it any time; nobody else
  assert.equal(h.as(theo, { action: 'referral.purge' }).ok, false);
  assert.equal(h.as(h.admin, { action: 'referral.purge' }).ok, true);
  // export: ambassadors and referrals, never the page secret
  const ex = h.get(h.admin, { action: 'export' });
  assert.equal(ex.data.Ambassadors.length, 1); assert.equal(ex.data.Ambassadors[0].token, undefined); assert.equal(ex.data.Referrals.length, 2);
});

test('applications: "School ambassador" → Make ambassador; the weekly report tells leads and each buddy, and never messages an ambassador', () => {
  const h = setupHub({ bot: true });
  h.as(h.admin, { action: 'settings.save', values: { referrals: 'on' } });
  const theo = h.add({ name: 'Theo Martins' });
  h.gas._ss.getSheetByName('People').data.forEach((r, i, all) => { if (i && r[all[0].indexOf('key')] === theo.key) r[all[0].indexOf('chat_id')] = '777'; });
  const ap = h.be.post({ action: 'apply', name: 'Dilnoza', contact: '@dilnoza_art', age_group: '13-18', interests: ['School ambassador (bring my school)'], school: 'School 12', lang: 'uz' });
  assert.equal(ap.ok, true, ap.error);
  const app = h.get(h.admin, { action: 'me' }).applications[0];
  const mk = h.as(h.admin, { action: 'amb.save', amb: { name: app.name, school: app.school, contact: app.contact, buddy: theo.key }, fromApplication: app.id });
  assert.equal(mk.ok, true, mk.error);
  const app2 = h.get(h.admin, { action: 'me' }).applications[0];
  assert.equal(app2.status, 'accepted'); assert.equal(app2.amb, mk.ambassador.key);
  h.be.post({ action: 'referral.save', code: mk.ambassador.code, name: 'Friend' });
  const quiet = h.as(h.admin, { action: 'amb.save', amb: { name: 'Quiet One', buddy: theo.key } });
  assert.equal(quiet.ok, true);
  const n = h.gas._telegram.length;
  const full = h.be.call('weeklyReport');
  assert.match(full, /🎓 Ambassadors: 2 active · 1 new name via their links this week/);
  assert.match(full, /Top 5: Dilnoza 1/); assert.match(full, /No new names in 7 days: Quiet \(buddy: Theo\)/);
  const toTheo = h.gas._telegram.slice(n).filter(x => String(x.payload.chat_id) === '777').map(x => x.payload.text);
  assert.ok(toTheo.some(t => /Your ambassadors this week:\n• Dilnoza \(School 12\): 1 new, 1 in all\n• Quiet One: 0 new, 0 in all — message them this week/.test(t)), toTheo.join('\n---\n'));
  const grp = h.gas._telegram.slice(n).filter(x => String(x.payload.chat_id) === '-100').map(x => x.payload.text).join('\n');
  assert.match(grp, /🎓 1 new name via ambassador links this week · top: Dilnoza 1/);
});

test('own server: /r/CODE goes straight to the signup page while names are off, to the name step when on; links use the server address', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'hub51-'));
  const hub = await createHub({ dataDir, backupDir: join(dataDir, 'bk'), code: CODE, fetch: async () => ({ status: 200, json: async () => ({ ok: true, result: {} }) }), log: () => {},
    env: { PUBLIC_URL: 'https://hub.example.xyz', HUB_TZ: 'Asia/Tashkent', TG_SECRET: 's', TG_PATH: 'p' }, mailTransport: { sendMail: async () => {} } });
  const srv = createServer(hub.handle); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const post = async body => (await fetch(base + '/api', { method: 'POST', body: JSON.stringify(body) })).json();
  try {
    const { code } = await hub.admin['setup-code']();
    const st = await post({ action: 'setup', sheet: code, site: 'https://hub.example.xyz', name: 'Ada Admin', event: { name: 'Haven Test', start: '2026-11-14', end: '2026-11-15', timezone: 'Asia/Tashkent', signup: SIGNUP }, starter: false, invites: false });
    assert.equal(st.ok, true, st.error);
    const admin = { u: st.key, t: st.token };
    const a = await post(Object.assign({ action: 'amb.save', amb: { name: 'Ali Valiyev', code: 'ALI27' } }, admin));
    assert.equal(a.ambassador.link, 'https://hub.example.xyz/r/ALI27');
    const r1 = await fetch(base + '/r/ali27', { redirect: 'manual' });
    assert.equal(r1.status, 302); assert.equal(r1.headers.get('location'), SIGNUP + '?ref=ALI27', 'names off: straight to HQ with the code');
    await post(Object.assign({ action: 'settings.save', values: { referrals: 'on' } }, admin));
    const r2 = await fetch(base + '/r/ALI27/%3Cscript%3E', { redirect: 'manual' });
    assert.equal(r2.status, 302); assert.equal(r2.headers.get('location'), '/#/r/ALI27script', 'names on: the name step; only safe characters');
    const l = await post(Object.assign({ action: 'amb.link', key: a.ambassador.key }, admin));
    assert.match(l.page, /^https:\/\/hub\.example\.xyz\/#\/amb\?k=ali&s=[0-9a-f]{32}$/);
    const s = await post({ action: 'referral.save', code: 'ALI27', name: 'Bob' });
    assert.equal(s.saved, true);
    assert.equal((await post(Object.assign({ action: 'amb.page' }, sk(l.page)))).me.n, 1);
  } finally { await new Promise(x => srv.close(x)); hub.close(); }
});

test('QR codes: the vendored generator makes a valid matrix for an ambassador link', () => {
  const m = qrMatrix('https://haventash.xyz/r/MALIKA27');
  assert.ok(m.length >= 21 && (m.length - 17) % 4 === 0, 'a real QR size: ' + m.length);
  const finder = (r, c) => [0, 6].every(i => m[r + i][c] && m[r][c + i]) && m[r + 3][c + 3] && !m[r + 1][c + 1];
  assert.ok(finder(0, 0) && finder(0, m.length - 7) && finder(m.length - 7, 0), 'three finder patterns');
  const q = qrcode(0, 'M'); q.addData('https://haventash.xyz/r/MALIKA27'); q.make();
  assert.equal(q.getModuleCount(), m.length);
});
