// v5: Apply page in several languages, single-use invites, the participant signup count, the bot feed, the inbox watcher, uploads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createGas, loadBackend } from '../docs/demo/gas-fakes.js';
import { createHub } from '../server/app.mjs';

const CODE = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const HUB = 'AKfycbTESTdeployment0000000000000000000000000000';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='; // 1×1 px
const CID = '1234-test.apps.googleusercontent.com';
const kOf = link => (String(link).match(/#\/invite\?k=([0-9a-f]{40})$/) || [])[1];

/** A new hub with the v5 defaults (single-use invites). bot: true = a Telegram bot + an organizer group. */
function setupHub(opts = {}) {
  const gas = createGas({ tz: 'Asia/Tashkent' }), be = loadBackend(CODE, gas);
  const r = be.post({ action: 'setup', sheet: 'https://docs.google.com/spreadsheets/d/' + gas._ss.getId() + '/edit', hub: HUB, name: 'Ada Lovelace', email: 'ada@example.com',
    event: { name: 'Haven Springfield', city: 'Springfield', start: '2026-11-14', end: '2026-11-15', timezone: 'Asia/Tashkent' }, starter: false, languages: opts.languages });
  assert.equal(r.ok, true, r.error);
  const h = { gas, be, admin: { u: r.key, t: r.token }, setup: r };
  h.as = (who, body) => be.post(Object.assign({}, body, { u: who.u, t: who.t }));
  h.get = (who, q) => be.get(Object.assign({}, q, { u: who.u, t: who.t }));
  /** Adds someone and uses their invite on "this device" → their key. */
  h.add = person => {
    const x = h.as(h.admin, { action: 'person.add', person }); assert.equal(x.ok, true, x.error);
    const c = be.post({ action: 'invite.claim', k: kOf(x.link), how: 'device' }); assert.equal(c.ok, true, c.error);
    return { u: c.u, t: c.t, key: x.person.key, added: x };
  };
  if (opts.bot) { gas._props.BOT_TOKEN = '1:x'; gas._props.BOT_USERNAME = 'test_bot'; gas._props.GROUP_CHAT_ID = '-100'; }
  h.group = () => gas._telegram.filter(x => x.method === 'sendMessage' && String(x.payload.chat_id) === '-100').map(x => x.payload.text);
  return h;
}
const tgMsg = (h, from, text, chat) => { h.gas._updates.push({ update_id: Date.now() + Math.random(), message: { text, from: { id: from }, chat: chat || { id: from, type: 'private' } } }); h.be.call('pollTelegram'); };
const lastTo = (h, chat) => h.gas._telegram.filter(x => x.method === 'sendMessage' && String(x.payload.chat_id) === String(chat)).map(x => x.payload.text).pop();

// ------------------------------------------------------------------ M4: single-use invites
test('invites: new hubs use them; a message never carries a key; one use; a newer invite switches the older one off', () => {
  const h = setupHub();
  assert.equal(h.setup.invites, true);
  assert.equal(h.get(h.admin, { action: 'me' }).signin, 'invite');
  const x = h.as(h.admin, { action: 'person.add', person: { name: 'Bob Builder', email: 'bob@example.com', access: 'member', invite: true } });
  assert.equal(x.ok, true, x.error); assert.equal(x.invite, true); assert.match(x.expires, /^\d{4}-\d\d-\d\d \d\d:\d\d$/);
  const k = kOf(x.link);
  assert.ok(k, 'the link is an invite: ' + x.link);
  assert.doesNotMatch(x.message, /[?&]t=/); assert.match(x.message, /works once/);
  const mail = h.gas._mails.find(m => m.to === 'bob@example.com');
  assert.ok(mail && mail.body.includes(k), 'the invite email carries the invite'); assert.doesNotMatch(mail.htmlBody, /[?&]t=[0-9a-f]{32}/);
  assert.equal(h.get(h.admin, { action: 'me' }).people.find(p => p.key === x.person.key).invite, 'open');
  // check says who it is for, without using it up
  const c = h.be.post({ action: 'invite.check', k });
  assert.equal(c.ok, true); assert.equal(c.first, 'Bob'); assert.equal(c.access, 'member'); assert.equal(c.password, false, 'no passwords on a Google Sheet hub');
  assert.equal(h.be.post({ action: 'invite.check', k }).ok, true, 'checking twice is fine');
  assert.equal(h.be.post({ action: 'invite.claim', k, how: 'password' }).ok, false);
  const use = h.be.post({ action: 'invite.claim', k, how: 'device' });
  assert.equal(use.ok, true, use.error); assert.equal(use.u, x.person.key); assert.match(use.t, /^[0-9a-f]{32}$/);
  assert.equal(h.get(use, { action: 'me' }).me.name, 'Bob Builder');
  const again = h.be.post({ action: 'invite.claim', k, how: 'device' });
  assert.equal(again.ok, false); assert.equal(again.code, 'used');
  assert.equal(h.get(h.admin, { action: 'me' }).people.find(p => p.key === x.person.key).invite, 'used');
  // Get link = a new invite; the older open one stops working
  const l1 = h.as(h.admin, { action: 'person.link', key: x.person.key }), l2 = h.as(h.admin, { action: 'person.link', key: x.person.key });
  assert.equal(h.be.post({ action: 'invite.check', k: kOf(l1.link) }).code, 'replaced');
  assert.equal(h.be.post({ action: 'invite.check', k: kOf(l2.link) }).ok, true);
  assert.equal(h.be.post({ action: 'invite.check', k: 'nope' }).code, 'bad');
  assert.equal(h.be.post({ action: 'invite.check', k: 'f'.repeat(40) }).code, 'bad');
  // expired
  const inv = h.be.call('rows_', 'Invites').find(i => i.code === kOf(l2.link)); inv.expires_at = '2020-01-01 00:00'; h.be.call('write_', 'Invites', inv); h.be.call('resetMemo_');
  assert.equal(h.be.post({ action: 'invite.claim', k: kOf(l2.link), how: 'device' }).code, 'expired');
  // reminders and the bot never carry a key either
  h.as(h.admin, { action: 'task.add', task: { title: 'Late', owner: x.person.key, due: '2020-01-01 10:00' } });
  const n = h.gas._mails.length; h.be.call('eveningReminders');
  const rem = h.gas._mails.slice(n).find(m => m.to === 'bob@example.com');
  assert.ok(rem); assert.doesNotMatch(rem.body, /[?&]t=/); assert.match(rem.body, /#\/tasks$/);
  // invites never leave the hub in an export
  const ex = h.get(h.admin, { action: 'export' });
  assert.equal(ex.data.Invites, undefined); assert.equal(JSON.stringify(ex).includes(k), false);
});

test('invites: Google on a Sheet hub, lost-link emails, admin links, reset sign-in, switching back to links', () => {
  const h = setupHub();
  h.as(h.admin, { action: 'settings.save', values: { google_client_id: CID } });
  const tokens = {}; let n = 0;
  h.gas._google = tok => tokens[tok] || null;
  const tok = (claims, nonce) => { const t = 'h.' + (n++) + '.s'; tokens[t] = Object.assign({ iss: 'https://accounts.google.com', aud: CID, exp: String(Math.floor(Date.now() / 1000) + 600), nonce, email_verified: 'true' }, claims); return t; };
  const x = h.as(h.admin, { action: 'person.add', person: { name: 'Cy Lead', access: 'lead' } }), k = kOf(x.link);
  assert.equal(h.be.post({ action: 'invite.check', k }).google, CID);
  const nonce = randomBytes(16).toString('hex');
  const g = h.be.post({ action: 'invite.claim', k, how: 'google', idToken: tok({ sub: 'g-cy', email: 'cy@gmail.com' }, nonce), nonce });
  assert.equal(g.ok, true, g.error);
  const cy = h.get(g, { action: 'me' }).me;
  assert.equal(cy.google, true); assert.equal(cy.google_email, 'cy@gmail.com'); assert.equal(cy.email, 'cy@gmail.com', 'the Google email becomes their email');
  // someone else's invite can't take a Google account that is already used
  const y = h.as(h.admin, { action: 'person.add', person: { name: 'Dee' } }), n2 = randomBytes(16).toString('hex');
  assert.match(h.be.post({ action: 'invite.claim', k: kOf(y.link), how: 'google', idToken: tok({ sub: 'g-cy', email: 'cy@gmail.com' }, n2), nonce: n2 }).error, /already connected/);
  assert.equal(h.be.post({ action: 'invite.check', k: kOf(y.link) }).ok, true, 'a failed Google try does not use the invite up');
  // "email me how to sign in" sends a fresh invite (24 h)
  const m0 = h.gas._mails.length;
  h.be.post({ action: 'requestLink', email: 'cy@gmail.com' });
  const rl = h.gas._mails.slice(m0).find(m => m.to === 'cy@gmail.com');
  assert.ok(rl); assert.match(rl.body, /#\/invite\?k=[0-9a-f]{40}/); assert.match(rl.body, /24 hours/);
  // admin links (Sheet menu / hubctl) are fresh invites too
  const al = h.be.call('adminLinks_');
  assert.equal(al.length, 1); assert.ok(kOf(al[0].link));
  // reset sign-in: Google forgotten, the old device key stops working, a new invite comes back
  const rs = h.as(h.admin, { action: 'person.resetLink', key: x.person.key });
  assert.equal(rs.ok, true, rs.error); assert.ok(kOf(rs.link));
  assert.equal(h.get(g, { action: 'me' }).ok, false);
  // a hub can go back to personal links
  h.as(h.admin, { action: 'settings.save', values: { signin_mode: 'link' } });
  const pl = h.as(h.admin, { action: 'person.link', key: x.person.key });
  assert.match(pl.link, /&t=[0-9a-f]{32}$/); assert.equal(pl.invite, false);
  assert.equal(h.as(h.admin, { action: 'settings.save', values: { signin_mode: 'magic' } }).ok, false);
  assert.equal(h.as(h.admin, { action: 'settings.save', values: { invite_days: '99' } }).ok, false);
});

test('invites on the own server: "this device" gives a session, a password is made in the same step, used invites stay used', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'hub5-'));
  const hub = await createHub({ dataDir, backupDir: join(dataDir, 'bk'), code: CODE, fetch: async () => ({ status: 200, json: async () => ({ ok: true, result: {} }) }), log: () => {},
    env: { PUBLIC_URL: 'https://hub.example.xyz', HUB_TZ: 'Asia/Tashkent', TG_SECRET: 's', TG_PATH: 'p' }, mailTransport: { sendMail: async () => {} } });
  const srv = createServer(hub.handle); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const post = async body => (await fetch(base + '/api', { method: 'POST', body: JSON.stringify(body) })).json();
  const get = async q => (await fetch(base + '/api?' + new URLSearchParams(q))).json();
  try {
    const { code } = await hub.admin['setup-code']();
    const st = await post({ action: 'setup', sheet: code, site: 'https://hub.example.xyz', name: 'Ada Admin', email: 'ada@example.com', event: { name: 'Haven Test', start: '2026-11-14', end: '2026-11-15', timezone: 'Asia/Tashkent' }, starter: false });
    assert.equal(st.ok, true, st.error); assert.equal(st.invites, true);
    const admin = { u: st.key, t: st.token };
    const bob = await post(Object.assign({ action: 'person.add', person: { name: 'Bob Builder' } }, admin)), kb = kOf(bob.link);
    assert.match(bob.link, /^https:\/\/hub\.example\.xyz\/#\/invite\?k=/);
    assert.equal((await post({ action: 'invite.check', k: kb })).password, true);
    const dev = await post({ action: 'invite.claim', k: kb, how: 'device' });
    assert.equal(dev.ok, true, dev.error); assert.match(dev.t, /^hs_/, 'a session, never the person\'s secret');
    assert.equal((await get({ action: 'me', t: dev.t })).me.name, 'Bob Builder');
    assert.equal((await post({ action: 'invite.claim', k: kb, how: 'device' })).code, 'used');
    // uploads live in data/files on the server
    const up = await post({ action: 'file.upload', t: dev.t, data: PNG, mime: 'image/png', fname: 'badge.png', title: 'Badge' });
    assert.equal(up.ok, true, up.error);
    const row = hub.store.getFile(hub.be.call('rows_', 'Resources').find(r => r.id === up.resource.id).file);
    assert.ok(row && existsSync(join(dataDir, 'files', row.id)));
    assert.equal((await get({ action: 'file.get', t: dev.t, id: up.resource.id })).data, 'data:image/png;base64,' + PNG);
    assert.equal((await post({ action: 'resource.delete', t: dev.t, id: up.resource.id })).ok, true);
    assert.equal(existsSync(join(dataDir, 'files', row.id)), false); assert.equal(hub.store.getFile(row.id), undefined);
    // a password straight from the invite
    const cy = await post(Object.assign({ action: 'person.add', person: { name: 'Cy Lead', access: 'lead' } }, admin)), kc = kOf(cy.link);
    assert.match((await post({ action: 'invite.claim', k: kc, how: 'password', username: 'cyuser', password: 'short' })).error, /8 characters/);
    assert.equal((await post({ action: 'invite.check', k: kc })).ok, true, 'a refused password does not use the invite up');
    const pw = await post({ action: 'invite.claim', k: kc, how: 'password', username: 'cylead', password: 'purple otter 42' });
    assert.equal(pw.ok, true, pw.error); assert.equal(pw.username, 'cylead'); assert.match(pw.t, /^hs_/);
    const li = await post({ action: 'login', username: 'cylead', password: 'purple otter 42' });
    assert.equal(li.ok, true, li.error);
    assert.equal((await post({ action: 'invite.claim', k: kc, how: 'device' })).code, 'used');
    // a taken username: nothing changes, the invite still works
    const dee = await post(Object.assign({ action: 'person.add', person: { name: 'Dee' } }, admin)), kd = kOf(dee.link);
    assert.match((await post({ action: 'invite.claim', k: kd, how: 'password', username: 'cylead', password: 'green heron 77' })).error, /taken/);
    assert.equal((await post({ action: 'invite.check', k: kd })).ok, true);
    // hubctl admin-links → a fresh invite
    const al = await hub.admin['admin-links']();
    assert.equal(al[0].name, 'Ada Admin'); assert.ok(kOf(al[0].link));
    // CORS: only the listed site, never an empty or partial origin
    const o1 = await fetch(base + '/api', { method: 'OPTIONS', headers: { Origin: 'https://notazizelse.github' } });
    assert.equal(o1.headers.get('access-control-allow-origin'), null);
  } finally { await new Promise(x => srv.close(x)); hub.close(); }
});

// ------------------------------------------------------------------ M3: Apply page (several languages)
test('apply: languages, school, several interests, free time; admins see it, the group hears first name + interest only', () => {
  const h = setupHub({ bot: true, languages: 'uz,ru,en' });
  assert.deepEqual(h.be.get({ action: 'public' }).langs, ['uz', 'ru', 'en']);
  h.as(h.admin, { action: 'settings.save', values: { tagline_uz: 'Ikki kun. Bitta oʻyin.', join_intro_ru: 'Помоги нам', tagline: 'Two days. One game.' } });
  const pub = h.be.get({ action: 'public' });
  assert.deepEqual(pub.event.taglines, { uz: 'Ikki kun. Bitta oʻyin.', en: 'Two days. One game.' });
  assert.equal(pub.join.intros.ru, 'Помоги нам'); assert.ok(pub.join.intros.en);
  assert.equal(h.as(h.admin, { action: 'settings.save', values: { languages: 'en,fr' } }).ok, false);
  const r = h.be.post({ action: 'apply', name: 'Malika Karimova', contact: '@malika', age_group: '13-18', lang: 'uz', school: 'School 110', interests: ['Design & posters', 'Social media & video'], availability: ['Weekends', 'After school'], note: 'I draw' });
  assert.equal(r.ok, true, r.error);
  const a = h.get(h.admin, { action: 'me' }).applications[0];
  assert.equal(a.lang, 'uz'); assert.equal(a.school, 'School 110'); assert.equal(a.interest, 'Design & posters, Social media & video'); assert.equal(a.availability, 'Weekends, After school');
  const g = h.group().pop();
  assert.match(g, /Malika \(13-18\)/); assert.doesNotMatch(g, /Karimova|@malika|School 110/, 'contacts stay with the admins');
  assert.equal(h.be.post({ action: 'apply', name: 'Tom', contact: '@tom', age_group: '13-18', lang: 'xx' }).ok, true);
  assert.equal(h.get(h.admin, { action: 'me' }).applications[0].lang, 'en', 'unknown languages count as English');
  h.as(h.admin, { action: 'settings.save', values: { feed_applications: 'no' } });
  const before = h.group().length;
  h.be.post({ action: 'apply', name: 'Quiet One', contact: '@q', age_group: '13-18' });
  assert.equal(h.group().length, before);
});

// ------------------------------------------------------------------ M5: participant signups + the bot feed
test('signups: leads save the count (dashboard or /signups 57), everyone sees progress, the group hears it, scripts push it with the feed key', () => {
  const h = setupHub({ bot: true });
  const lead = h.add({ name: 'Cy Lead', access: 'lead' }), mem = h.add({ name: 'Bob Builder' });
  h.as(h.admin, { action: 'settings.save', values: { signup_goal: '180', funding_per_signup: '$3,25' } });
  assert.equal(h.get(h.admin, { action: 'me' }).settings.funding_per_signup, '3.25');
  assert.equal(h.as(mem, { action: 'signups.save', count: 5 }).code, 'forbidden');
  assert.equal(h.as(lead, { action: 'signups.save', count: 'lots' }).ok, false);
  const yday = new Date(Date.now() - 864e5).toLocaleString('sv-SE', { timeZone: 'Asia/Tashkent' }).slice(0, 10);
  assert.equal(h.as(lead, { action: 'signups.save', count: 40, date: yday }).ok, true);
  const s = h.as(lead, { action: 'signups.save', count: 57 });
  assert.equal(s.ok, true, s.error); assert.equal(s.signups.total, 57); assert.equal(s.signups.goal, 180);
  assert.match(h.group().pop(), /Signups: 57 \(\+17 since .*\) · goal 180 \(32%\) · ≈ \$185 from HQ/);
  assert.equal(h.as(lead, { action: 'signups.save', count: 58 }).signups.list.length, 2, 'one row per day');
  assert.equal(h.get(mem, { action: 'me' }).signups.total, 58, 'everyone on the team sees it');
  assert.equal(h.as(lead, { action: 'signups.save', count: 1, date: '2099-01-01' }).ok, false);
  // the bot: /signups for everyone, /signups N for leads
  h.gas._updates.push({ update_id: 1, message: { text: '/start ' + mem.t, from: { id: 555 }, chat: { id: 555, type: 'private' } } });
  h.gas._updates.push({ update_id: 2, message: { text: '/start ' + lead.t, from: { id: 777 }, chat: { id: 777, type: 'private' } } });
  h.be.call('pollTelegram');
  tgMsg(h, 555, '/signups'); assert.match(lastTo(h, 555), /Signups: 58/);
  tgMsg(h, 555, '/signups 99'); assert.match(lastTo(h, 555), /Only leads/);
  tgMsg(h, 777, '/signups 61'); assert.match(lastTo(h, 777), /Saved\. 📈 Signups: 61/);
  const n = h.group().length;
  tgMsg(h, 777, '/signups 64', { id: -100, type: 'supergroup' });
  assert.equal(h.group().length, n + 1, 'in the group the count is posted once (the feed), with no extra reply');
  assert.match(h.group().pop(), /Signups: 64/);
  assert.match(h.be.call('progressText_'), /Signups: 64/, 'the leads\' daily summary and the weekly report carry it');
  // the public page shows it only when switched on
  assert.equal(h.be.get({ action: 'public' }).signups, null);
  h.as(h.admin, { action: 'settings.save', values: { public_show_signups: true } });
  assert.deepEqual(h.be.get({ action: 'public' }).signups, { total: 64, goal: 180, date: h.be.call('fmt_', new Date(), 'yyyy-MM-dd') });
  // a script pushes it with the feed key (admins only make the key)
  assert.equal(h.as(lead, { action: 'feed.key' }).code, 'forbidden');
  const fk = h.as(h.admin, { action: 'feed.key' });
  assert.match(fk.key, /^fk_[0-9a-f]{64}$/); assert.equal(fk.api, 'https://script.google.com/macros/s/' + HUB + '/exec');
  assert.equal(h.be.post({ action: 'signups.push', key: 'fk_wrong', count: 70 }).code, 'auth');
  assert.equal(h.be.post({ action: 'signups.push', key: fk.key, count: 70, source: 'HQ counter' }).ok, true);
  assert.equal(h.get(h.admin, { action: 'me' }).signups.total, 70);
  const renewed = h.as(h.admin, { action: 'feed.key', renew: true });
  assert.notEqual(renewed.key, fk.key);
  assert.equal(h.be.post({ action: 'signups.push', key: fk.key, count: 71 }).code, 'auth', 'the old key stops working');
  assert.equal(h.as(h.admin, { action: 'signups.delete', date: yday }).ok, true);
  assert.equal(h.get(h.admin, { action: 'me' }).signups.list.length, 1);
});

test('feed: new files and links go to the group (never leads-only ones); switches keep it quiet', () => {
  const h = setupHub({ bot: true });
  h.as(h.admin, { action: 'resource.save', resources: [{ title: 'Poster', url: 'https://www.canva.com/design/x', section: 'Design' }, { title: 'Budget', url: 'https://docs.google.com/spreadsheets/d/b/edit', private: 'leads' }] });
  const g = h.group().pop();
  assert.match(g, /added the link “Poster” to Files → Design/); assert.doesNotMatch(g, /Budget/);
  h.as(h.admin, { action: 'settings.save', values: { feed_files: 'no' } });
  const n = h.group().length;
  h.as(h.admin, { action: 'resource.save', resources: [{ title: 'Logo', url: 'https://example.com/logo' }] });
  assert.equal(h.group().length, n);
  h.as(h.admin, { action: 'settings.save', values: { feed_files: 'yes' } });
  h.be.call('feedRepo_', ['posters/launch.png', 'brand/logo.svg']);
  assert.match(h.group().pop(), /New in the team files: launch\.png, logo\.svg/);
});

// ------------------------------------------------------------------ M6: inbox watcher + uploads
test('inbox: the watcher reports new emails once; leads are told and handle them; members never see them', () => {
  const h = setupHub({ bot: true });
  const lead = h.add({ name: 'Cy Lead', access: 'lead' }), mem = h.add({ name: 'Bob Builder' });
  h.gas._updates.push({ update_id: 1, message: { text: '/start ' + lead.t, from: { id: 777 }, chat: { id: 777, type: 'private' } } }); h.be.call('pollTelegram');
  const key = h.as(h.admin, { action: 'feed.key' }).key;
  const items = [{ id: 'm1', time: '2026-10-03T09:15:00Z', from: 'PCBWay <ava@pcbway.com>', subject: 'Re: badges', snippet: 'Please send the files', link: 'https://mail.google.com/mail/u/0/#inbox/m1' },
    { id: 'm2', time: '2026-10-03T10:00:00Z', from: 'school@example.uz', subject: 'Class visit', link: 'javascript:alert(1)' }];
  assert.equal(h.be.post({ action: 'inbox.push', key: 'nope', items }).code, 'auth');
  const p = h.be.post({ action: 'inbox.push', key, mailbox: 'city@haven.example', items });
  assert.equal(p.ok, true, p.error); assert.equal(p.added, 2);
  assert.equal(h.be.post({ action: 'inbox.push', key, items }).added, 0, 'the same email is never added twice');
  assert.match(lastTo(h, 777), /2 new emails to city@haven\.example\n• PCBWay: Re: badges/);
  const me = h.get(lead, { action: 'me' });
  assert.equal(me.inboxNew, 2); assert.equal(me.inbox[0].id, 'm2', 'newest first');
  assert.equal(me.inbox[0].link, '', 'only Gmail links are kept');
  assert.equal(me.inbox[1].time, h.be.call('fmt_', new Date('2026-10-03T09:15:00Z')));
  assert.equal(h.get(mem, { action: 'me' }).inbox, undefined);
  assert.equal(h.as(mem, { action: 'inbox.update', id: 'm1', status: 'done' }).code, 'forbidden');
  const t = h.as(h.admin, { action: 'task.add', task: { title: 'Send PCBWay the files', owner: lead.key, due: '2026-10-08 18:00' } }).task;
  const up = h.as(lead, { action: 'inbox.update', id: 'm1', status: 'done', task: t.id });
  assert.equal(up.ok, true, up.error); assert.equal(up.email.handled_by, 'Cy Lead'); assert.equal(up.email.task, t.id);
  assert.equal(h.as(lead, { action: 'inbox.update', id: 'm1', status: 'maybe' }).ok, false);
  assert.equal(h.get(lead, { action: 'me' }).inboxNew, 1);
  assert.ok(h.get(h.admin, { action: 'export' }).data.Inbox.length === 2);
  assert.equal(h.get(h.admin, { action: 'me' }).lastSeen.inbox, undefined, 'the watcher is not a person');
});

test('uploads: anyone on the team adds a file; who may see it decides who can open it; uploaders and leads delete it', () => {
  const h = setupHub({ bot: true });
  const lead = h.add({ name: 'Cy Lead', access: 'lead' }), mem = h.add({ name: 'Bob Builder' }), guest = h.add({ name: 'Ms Guest', access: 'viewer' }), other = h.add({ name: 'Dee' });
  assert.match(h.as(mem, { action: 'file.upload', data: PNG, mime: 'application/x-msdownload', fname: 'a.exe' }).error, /can't be uploaded/);
  assert.match(h.as(mem, { action: 'file.upload', data: 'not base64!', mime: 'image/png' }).error, /too big/);
  assert.equal(h.as(guest, { action: 'file.upload', data: PNG, mime: 'image/png' }).code, 'forbidden');
  const up = h.as(mem, { action: 'file.upload', data: PNG, mime: 'image/png', fname: 'poster draft.png', title: 'Poster draft', section: 'Design', preview: 'data:image/png;base64,' + PNG, private: 'leads' });
  assert.equal(up.ok, true, up.error);
  const r = up.resource;
  assert.equal(r.file, true); assert.equal(r.kind, 'image'); assert.equal(r.section, 'Design'); assert.equal(r.private, true); assert.equal(r.leads, false, 'members can\'t make leads-only files');
  assert.equal(r.size, 70); assert.equal(r.by, mem.key);
  assert.match(h.group().pop(), /Bob Builder added the file “Poster draft” to Files → Design/);
  const f = h.get(other, { action: 'file.get', id: r.id });
  assert.equal(f.ok, true, f.error); assert.equal(f.mime, 'image/png'); assert.equal(f.data, 'data:image/png;base64,' + PNG); assert.equal(f.name, 'poster draft.png');
  assert.equal(h.get(guest, { action: 'file.get', id: r.id }).ok, false, 'team-only files stay away from guests');
  assert.equal(h.get(guest, { action: 'me' }).resources.some(x => x.id === r.id), false);
  // edit: only its title/section/who sees it
  assert.equal(h.as(lead, { action: 'resource.save', resources: [{ id: r.id, title: 'Poster v2', section: 'Design', private: 'leads' }] }).ok, true);
  assert.equal(h.get(mem, { action: 'file.get', id: r.id }).ok, false, 'now leads only');
  assert.equal(h.get(lead, { action: 'file.get', id: r.id }).ok, true);
  // delete: not someone else's (as a member); the uploader and leads can
  const up2 = h.as(other, { action: 'file.upload', data: PNG, mime: 'image/png', fname: 'x.png' });
  assert.equal(up2.resource.section, 'Uploads');
  assert.equal(h.as(mem, { action: 'resource.delete', id: up2.resource.id }).code, 'forbidden');
  assert.equal(h.as(mem, { action: 'resource.delete', id: r.id }).ok, true, 'the uploader deletes their own file');
  assert.equal(Object.keys(h.gas._files).some(id => h.gas._files[id].getName() === 'poster draft.png'), false, 'the file itself is gone too');
  assert.equal(h.as(lead, { action: 'resource.delete', id: up2.resource.id }).ok, true);
  assert.equal(h.as(mem, { action: 'resource.delete', id: 'poster-canva' }).ok, false);
});
