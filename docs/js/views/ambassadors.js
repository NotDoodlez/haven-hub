/* Ambassadors — students who bring their school, each with their own code and link (<hub>/r/CODE).
   Everyone on the team can add one and becomes their buddy; leads see and change them all. Names that came through the links are
   ticked "came" at the check-in desk; the leaderboard counts names before the event and friends who came from the first event day. */
import { $, esc, icon, toast, busy, drawer, modal, field, formValues, copy, confirmBox, empty, ago, first, kpi, csvBuild, download, fmtDay, avatar } from '../ui.js';
import { tr, langsOf, NAMES } from '../i18n.js';
import { qrSvg } from '../qr.js';

let tab = 'amb', q = '', show = 'active';
const STATUS = { active: ['Active', 'ok'], paused: ['Paused', 'warn'], left: ['Left', 'dr'] };
const isAmb = a => a.kind === 'ambassador';

export function ambassadorsPage(ctx) {
  const D = ctx.D, A = D.ambassadors || [], R = D.referrals || [], M = D.amb || {}, lead = ctx.isLead;
  const amb = A.filter(isAmb), chan = A.filter(a => !isAmb(a)), active = amb.filter(a => a.status === 'active');
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10), week = R.filter(r => r.time.slice(0, 10) >= weekAgo).length, came = R.filter(r => r.came).length;
  ctx.setActions(`${lead ? `<button class="btn ghost" id="am-board">${icon('award')} Sunday leaderboard</button><button class="btn ghost" id="am-many">${icon('users')} Add several</button>` : ''}<button class="btn primary" id="am-add">${icon('userPlus')} Add ambassador</button>`);
  let h = `<p class="lede">Students who bring their school. Each gets a code, a link and a QR poster; friends who use the link go on to HQ's signup page with <code>?ref=CODE</code>${M.on ? ', after leaving their first name here' : ''}. ${lead ? 'You see everyone\'s ambassadors.' : 'You see the ambassadors you look after — add one at your next school visit.'}</p>`;
  if (!M.on) h += `<div class="banner">${icon('alert')}<div><b>Names are off:</b> the links go straight to HQ's signup page with the code (HQ counts it), and nothing is saved here, so the numbers below stay at 0. ${ctx.isAdmin ? 'Turn names on in <a href="#/admin/settings#s-ref">Settings → Referrals</a> once HQ is OK with it.' : 'An admin turns names on in Settings once HQ is OK with it.'}</div></div>`;
  if (M.open) h += `<div class="banner info">${icon('flag')}<div><b>Event days:</b> at the check-in desk, open <b>Names</b>, search the friend and press <b>Came</b>. Someone says “X invited me” but never used the link? <b>Add a name</b>.</div></div>`;
  h += `<div class="kpis">${kpi(lead ? 'active ambassadors' : 'your ambassadors', active.length, { icon: 'users', sub: amb.length - active.length ? `${amb.length - active.length} paused or left` : '' })}
    ${kpi('names via links', R.length, { icon: 'userPlus', tone: 'ok', sub: `${week} in the last 7 days` })}
    ${kpi('came to the event', came, { icon: 'check', sub: M.started ? 'counted on the leaderboard' : 'ticked at check-in' })}
    ${kpi('names deleted on', fmtDay(M.deleteOn || ''), { icon: 'shield', sub: 'privacy promise' })}</div>`;
  const tabs = [['amb', 'Ambassadors', amb.length], ['names', 'Names', R.length]].concat(lead ? [['chan', 'Channel codes', chan.length]] : []);
  h += `<div class="toolbar"><div class="seg">${tabs.map(([k, l, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l} <span class="muted">${n}</span></button>`).join('')}</div>
    <label class="search"><span class="sr">Search</span>${icon('search')}<input id="am-q" placeholder="${tab === 'names' ? 'Search a name or code' : 'Search name, school, code'}" value="${esc(q)}"></label>
    ${tab === 'amb' ? `<select id="am-show" aria-label="Show">${[['active', 'Active'], ['paused', 'Paused'], ['left', 'Left'], ['all', 'All']].map(([v, l]) => `<option value="${v}" ${show === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}</div><div id="am-body"></div>`;
  ctx.el.innerHTML = h;
  const body = () => { $('#am-body').innerHTML = tab === 'names' ? namesTab(ctx) : tab === 'chan' ? chanTab(ctx, chan) : ambTab(ctx, amb); };
  body();
  ctx.el.querySelector('.seg').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; q = ''; ambassadorsPage(ctx); } };
  $('#am-q').oninput = e => { q = e.target.value; body(); };
  const sh = $('#am-show'); if (sh) sh.onchange = e => { show = e.target.value; body(); };
  $('#am-add').onclick = () => ambDrawer(ctx, null, tab === 'chan' ? { kind: 'channel' } : {});
  if (lead) { $('#am-many').onclick = () => addSeveral(ctx); $('#am-board').onclick = () => board(ctx); }
  ctx.el.onclick = e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const id = b.closest('[data-key],[data-rid]'), a = id && id.dataset.key ? A.find(x => x.key === id.dataset.key) : null, r = id && id.dataset.rid ? R.find(x => x.id === id.dataset.rid) : null;
    const act = b.dataset.a;
    if (act === 'edit') return ambDrawer(ctx, a);
    if (act === 'send') return sendPage(ctx, a);
    if (act === 'poster') return openPoster(ctx, a, b);
    if (act === 'copylink') return copy(a.link, 'Link copied.');
    if (act === 'status') return setStatus(ctx, a, b.dataset.v);
    if (act === 'delete') return delAmb(ctx, a);
    if (act === 'came') return setCame(ctx, r, !r.came, b);
    if (act === 'rdel') return delName(ctx, r);
    if (act === 'addname') return addName(ctx);
    if (act === 'csv') return namesCsv(ctx);
    if (act === 'purge') return purge(ctx);
  };
}

const match = (s, ...xs) => !s || xs.some(x => String(x || '').toLowerCase().includes(s.toLowerCase()));
const ambName = (ctx, code) => { const a = (ctx.D.ambassadors || []).find(x => x.code === code); return a ? a.name : ''; };

function ambTab(ctx, amb) {
  const list = amb.filter(a => (show === 'all' || a.status === show) && match(q, a.name, a.school, a.code, a.contact)).sort((x, y) => y.score - x.score || y.n - x.n || x.name.localeCompare(y.name));
  if (!list.length) return `<div class="card">${empty({ title: amb.length ? 'Nobody here' : 'No ambassadors yet', text: amb.length ? '' : 'Recruit one or two at the end of every school visit — that is when students say yes. Press <b>Add ambassador</b> right there, then <b>Send their page</b>.' })}</div>`;
  const started = (ctx.D.amb || {}).started;
  return `<div class="cards amb-cards">${list.map(a => {
    const st = STATUS[a.status] || STATUS.active, mine = ctx.isLead || a.buddy === ctx.me.key;
    return `<div class="card amb-card" data-key="${esc(a.key)}"><div class="person-card">${avatar(a.name)}<div class="info"><b>${esc(a.name)}</b> <span class="pill ${st[1]}">${st[0]}</span>
        <div class="small muted">${a.school ? esc(a.school) + ' · ' : ''}${a.buddy ? 'buddy ' + esc(first(ctx.nameOf(a.buddy))) : '<span class="due over">no buddy</span>'}</div></div></div>
      <div class="amb-row"><button class="code-chip" data-a="copylink" title="Copy ${esc(a.link)}">${icon('link')} ${esc(a.code)}</button>
        <span class="amb-n" title="names via the link"><b>${a.n}</b> name${a.n === 1 ? '' : 's'}${a.week ? ` <span class="small ok-t">+${a.week} this week</span>` : ''}</span>${started || a.came ? `<span class="amb-n" title="friends who came"><b>${a.came}</b> came</span>` : ''}</div>
      ${a.contact || a.note ? `<p class="small" style="margin:6px 0 0">${a.contact ? `${contactLink(a.contact)}` : ''}${a.contact && a.note ? ' · ' : ''}${a.note ? `<span class="muted">${esc(a.note)}</span>` : ''}</p>` : ''}
      ${a.last ? `<p class="small muted" style="margin:4px 0 0">newest signup ${esc(ago(a.last, ctx.tz))}</p>` : ''}
      ${mine ? `<div class="actions">${a.status !== 'left' ? `<button class="btn sm primary" data-a="send">${icon('send')} Send their page</button><button class="btn sm soft" data-a="poster">${icon('file')} Poster</button>` : ''}<button class="btn sm ghost" data-a="edit">${icon('edit')} Edit</button>
        ${a.status === 'active' ? '<button class="btn sm ghost" data-a="status" data-v="paused">Pause</button>' : `<button class="btn sm ghost" data-a="status" data-v="active">Make active</button>`}${a.status !== 'left' ? '<button class="btn sm ghost" data-a="status" data-v="left">Left</button>' : ''}
        ${ctx.isLead && !a.n ? `<button class="btn sm ghost danger" data-a="delete" title="Added by mistake">${icon('trash')}</button>` : ''}</div>` : ''}</div>`;
  }).join('')}</div>`;
}
const contactLink = c => /^@\w{4,}$/.test(c) ? `<a href="https://t.me/${esc(c.slice(1))}" target="_blank" rel="noopener">${icon('message')} ${esc(c)}</a>` : /^[^\s@]+@[^\s@]+\.\w+$/.test(c) ? `<a href="mailto:${esc(c)}">${icon('mail')} ${esc(c)}</a>` : /^\+?[\d\s()-]{7,}$/.test(c) ? `<a href="tel:${esc(c.replace(/[^\d+]/g, ''))}">${icon('phone')} ${esc(c)}</a>` : esc(c);

function namesTab(ctx) {
  const D = ctx.D, R = D.referrals || [], M = D.amb || {}, list = R.filter(r => match(q, r.name, r.code, ambName(ctx, r.code)));
  const tools = `<div class="row" style="margin-bottom:12px">${M.open || ctx.isLead || (D.ambassadors || []).length ? `<button class="btn soft sm" data-a="addname">${icon('plus')} Add a name</button>` : ''}
    ${ctx.isLead && R.length ? `<button class="btn ghost sm" data-a="csv">${icon('download')} CSV</button>` : ''}${ctx.isAdmin && R.some(r => r.name) ? `<button class="btn ghost sm danger" data-a="purge">${icon('trash')} Delete all names now</button>` : ''}</div>`;
  if (!list.length) return tools + `<div class="card">${empty({ title: R.length ? 'No match' : 'No names yet', text: R.length ? '' : M.on ? 'When a friend opens an ambassador\'s link and writes their first name, it shows up here.' : 'Names are off — links go straight to HQ\'s signup page.' })}</div>`;
  return tools + `<div class="card flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Invited by</th><th>When</th><th>Came</th>${ctx.isLead ? '<th></th>' : ''}</tr></thead><tbody>${list.slice(0, 400).map(r => `<tr data-rid="${esc(r.id)}">
      <td><b>${esc(r.name || '(deleted)')}</b></td><td>${esc(first(ambName(ctx, r.code)) || '')} <span class="pill">${esc(r.code)}</span></td><td class="small muted">${esc(ago(r.time, ctx.tz))}</td>
      <td><button class="btn sm ${r.came ? 'primary' : 'ghost'}" data-a="came" aria-pressed="${r.came}">${icon('check')} ${r.came ? 'Came' : 'Came?'}</button>${r.came && r.checked_by ? `<div class="small muted">${esc(first(r.checked_by))}</div>` : ''}</td>
      ${ctx.isLead ? `<td><button class="icon-btn" data-a="rdel" aria-label="Delete this name">${icon('trash')}</button></td>` : ''}</tr>`).join('')}</tbody></table></div>${list.length > 400 ? `<p class="small muted" style="padding:10px 14px">Showing 400 of ${list.length} — search to find someone.</p>` : ''}</div>`;
}

function chanTab(ctx, chan) {
  const list = chan.filter(a => match(q, a.name, a.code));
  return `<p class="small muted">Codes for a place rather than a person — the Instagram bio, a channel post, a poster batch — so you can see which one brings signups. They have no page and stay off the leaderboard.</p>` +
    (list.length ? `<div class="card flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Where</th><th>Code + link</th><th>Names</th><th></th></tr></thead><tbody>${list.map(a => `<tr data-key="${esc(a.key)}"><td><b>${esc(a.name)}</b>${a.note ? `<div class="small muted">${esc(a.note)}</div>` : ''}</td>
      <td><button class="code-chip" data-a="copylink">${icon('link')} ${esc(a.code)}</button><div class="small muted">${esc(a.link)}</div></td><td><b>${a.n}</b>${a.week ? ` <span class="small ok-t">+${a.week}</span>` : ''}</td>
      <td><button class="btn sm ghost" data-a="edit">${icon('edit')}</button>${!a.n ? `<button class="icon-btn" data-a="delete" aria-label="Delete">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`
      : `<div class="card">${empty({ title: 'No channel codes', text: 'Press <b>Add ambassador</b> on this tab to make one, e.g. “Instagram bio” with the code IG.' })}</div>`);
}

/** Add or change one ambassador (or a channel code). preset: fields to start with; appId: made from an application. */
export function ambDrawer(ctx, a, preset = {}, appId = '') {
  const D = ctx.D, lead = ctx.isLead, x = Object.assign({ kind: 'ambassador', status: 'active' }, preset, a || {}), chan = x.kind === 'channel';
  const team = (D.team || []).filter(p => p.access !== 'viewer');
  const d = drawer({ title: a ? (chan ? 'Channel code' : a.name) : chan ? 'New channel code' : 'New ambassador', sub: chan ? 'A code for a place, not a person.' : 'A student who brings their school. Only their first name is ever shown to other ambassadors.',
    body: `<form id="amf" class="form-grid">
      ${field({ label: chan ? 'Where is it used?' : 'Name', name: 'name', value: x.name || '', required: true, full: true, placeholder: chan ? 'Instagram bio' : 'Malika Karimova' })}
      ${chan ? '' : field({ label: 'School', name: 'school', value: x.school || '', placeholder: 'School No. 110' })}
      ${chan ? '' : field({ label: 'Contact', name: 'contact', value: x.contact || '', placeholder: '@username or phone', hint: 'Only the team sees it.' })}
      ${field({ label: 'Code', name: 'code', value: x.code || '', placeholder: a ? '' : 'made from the name', hint: a ? 'Changing it breaks posters already printed.' : 'Letters and digits. Empty = made from the first name, e.g. MALIKA27.', attrs: 'maxlength="32" autocapitalize="characters"' })}
      ${chan ? '' : lead ? field({ label: 'Buddy (who looks after them)', name: 'buddy', type: 'select', value: a ? x.buddy : (x.buddy || ctx.me.key), options: [['', '— nobody yet']].concat(team.map(p => [p.key, p.name])) }) : ''}
      ${a ? field({ label: 'Status', name: 'status', type: 'select', value: x.status, options: [['active', 'Active'], ['paused', 'Paused'], ['left', 'Left (their page stops working)']] }) : ''}
      ${field({ label: 'Note', name: 'note', type: 'textarea', value: x.note || '', full: true, attrs: 'rows="2"', placeholder: chan ? '' : 'Grade 9, met at the class talk on 8 Oct' })}
      ${chan || !a ? '' : field({ label: 'Volunteer hours', name: 'hours', value: x.hours || '', hint: 'For HQ\'s signed volunteer-hours list.' })}
      ${chan || !a ? '' : field({ label: 'Rewards given', name: 'reward', value: x.reward || '', placeholder: 'stickers, badge' })}</form>
      ${appId ? `<p class="small muted">From application ${esc(appId)} — it is closed as accepted when you save.</p>` : ''}`,
    foot: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="am-save">${icon('check')} ${a ? 'Save' : chan ? 'Make the code' : 'Add ambassador'}</button>` });
  $('#am-save', d.el).onclick = async e => {
    const v = formValues($('#amf', d.el)), b = e.currentTarget;
    if (!a) v.kind = x.kind; if (a) v.key = a.key;
    if (!v.code && a) delete v.code;
    busy(b, true);
    const r = await ctx.api.post('amb.save', Object.assign({ amb: v }, appId ? { fromApplication: appId } : {}));
    busy(b, false);
    if (!r.ok) return toast(r.error, 'err');
    D.ambassadors = r.ambassadors; D.amb = r.amb; ctx.api.cache(D); d.close();
    toast(a ? 'Saved.' : `${first(r.ambassador.name)} added — code ${r.ambassador.code}.`);
    if (appId) ctx.refresh({ silent: true });
    if (!a && !chan) sendPage(ctx, r.ambassador); else ctx.render();
  };
}

/** "Send their page": their private page link + a ready message in the language they read best. */
async function sendPage(ctx, a) {
  const r = await ctx.api.post('amb.link', { key: a.key });
  if (!r.ok) return toast(r.error, 'err');
  const langs = r.langs && r.langs.length ? r.langs : langsOf(null);
  const msg = l => tr(l)('welcome', { name: r.first, event: r.event, page: r.page, link: r.link });
  const m = modal({ title: `Send ${r.first} their page`, body: `<div class="send-amb"><div class="send-qr">${qrSvg(r.link, { size: 140, label: r.link })}<div class="small muted">${esc(r.link)}</div></div>
      <div><p class="small" style="margin-top:0">Send this to ${esc(r.first)} in a private Telegram chat. The page shows their link, QR code, poster and numbers — <b>it's only for them</b>; anyone with it sees their page.</p>
      ${langs.length > 1 ? `<div class="lang-sw" role="group" aria-label="Language">${langs.map((l, i) => `<button type="button" data-l="${l}" class="${i ? '' : 'on'}">${esc(NAMES[l] || l)}</button>`).join('')}</div>` : ''}
      <textarea id="sp-msg" rows="9" style="margin-top:8px">${esc(msg(langs[0]))}</textarea></div></div>`,
    foot: `<button class="btn ghost danger" id="sp-reset" title="The old page link stops working">${icon('refresh')} New link</button><a class="btn ghost" href="${esc(ctx.api.DEMO ? '#' + r.page.split('#')[1] : r.page)}" ${ctx.api.DEMO ? 'data-close' : 'target="_blank" rel="noopener"'}>${icon('external')} Open their page</a><button class="btn primary" id="sp-copy">${icon('copy')} Copy message</button>` });
  m.el.querySelectorAll('[data-l]').forEach(b => { b.onclick = () => { m.el.querySelectorAll('[data-l]').forEach(x => x.classList.toggle('on', x === b)); $('#sp-msg', m.el).value = msg(b.dataset.l); }; });
  $('#sp-copy', m.el).onclick = () => copy($('#sp-msg', m.el).value, 'Message copied — paste it in Telegram.');
  $('#sp-reset', m.el).onclick = async () => {
    if (!await confirmBox({ title: 'Make a new page link?', text: `The link ${esc(r.first)} has now stops working. Use it if the link was shared by mistake.`, ok: 'New link', danger: true })) return;
    const n = await ctx.api.post('amb.link', { key: a.key, reset: true });
    if (!n.ok) return toast(n.error, 'err');
    m.close(); toast('New link made — send it again.'); sendPage(ctx, a);
  };
}
async function openPoster(ctx, a, btn) {
  const w = ctx.api.DEMO ? null : window.open('', '_blank'); // the demo lives in this tab: its data is made up again in a new one
  busy(btn, true, '…'); const r = await ctx.api.post('amb.link', { key: a.key }); busy(btn, false);
  if (!r.ok) { if (w) w.close(); return toast(r.error, 'err'); }
  const url = r.page.replace('#/amb?', '#/amb/poster?');
  if (w) w.location = url; else location.hash = url.split('#')[1];
}
async function setStatus(ctx, a, status) {
  if (status === 'left' && !await confirmBox({ title: `${first(a.name)} has left?`, text: 'Their page stops working. Their numbers stay, and you can make them active again later.', ok: 'Yes, left' })) return;
  const r = await ctx.api.post('amb.save', { amb: { key: a.key, status } });
  if (!r.ok) return toast(r.error, 'err');
  ctx.D.ambassadors = r.ambassadors; ctx.api.cache(ctx.D); toast(STATUS[status][0] + '.'); ctx.render();
}
async function delAmb(ctx, a) {
  if (!await confirmBox({ title: `Delete ${a.name}?`, text: 'Only for someone added by mistake. Names their link brought stay, under the code ' + esc(a.code) + '.', ok: 'Delete', danger: true })) return;
  const r = await ctx.api.post('amb.delete', { key: a.key });
  if (!r.ok) return toast(r.error, 'err');
  Object.assign(ctx.D, { ambassadors: r.ambassadors, referrals: r.referrals, amb: r.amb }); ctx.api.cache(ctx.D); toast('Deleted.'); ctx.render();
}
async function setCame(ctx, r, came, btn) {
  busy(btn, true, '…');
  const x = await ctx.api.post('referral.update', { id: r.id, came });
  busy(btn, false);
  if (!x.ok) return toast(x.error, 'err');
  Object.assign(r, x.referral);
  const a = (ctx.D.ambassadors || []).find(y => y.code === r.code); if (a) a.came += came ? 1 : -1;
  ctx.api.cache(ctx.D); toast(came ? `${r.name || 'They'} came ✓` : 'Undone.'); ctx.render();
}
async function delName(ctx, r) {
  if (!await confirmBox({ title: `Delete ${r.name || 'this name'}?`, text: 'For duplicates and test rows.', ok: 'Delete', danger: true })) return;
  const x = await ctx.api.post('referral.update', { id: r.id, delete: true });
  if (!x.ok) return toast(x.error, 'err');
  ctx.D.referrals = ctx.D.referrals.filter(y => y.id !== r.id); ctx.api.cache(ctx.D); ctx.refresh({ silent: true }); ctx.render();
}
function addName(ctx) {
  const D = ctx.D, codes = (D.ambassadors || []).filter(a => a.status !== 'left');
  const m = modal({ title: 'Add a name', size: 'sm', body: `<form id="anf"><p class="small muted" style="margin-top:0">Someone came and says who invited them, but never used the link. Ask “who invited you?”.</p>
      ${field({ label: 'Their first name', name: 'name', required: true, attrs: 'maxlength="40" autofocus' })}
      ${field({ label: 'Invited by', name: 'code', type: 'select', options: codes.map(a => [a.code, `${a.name} — ${a.code}`]) })}
      ${field({ label: 'They are here now (came)', name: 'came', type: 'toggle', value: (D.amb || {}).open ? 'yes' : 'no' })}</form>`,
    foot: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="an-go">${icon('plus')} Add</button>` });
  $('#an-go', m.el).onclick = async e => {
    const v = formValues($('#anf', m.el)), b = e.currentTarget;
    busy(b, true); const r = await ctx.api.post('referral.add', { name: v.name, code: v.code, came: !!v.came }); busy(b, false);
    if (!r.ok) return toast(r.error, 'err');
    m.close(); toast('Added.'); ctx.refresh({ silent: true });
  };
}
function namesCsv(ctx) {
  const rows = [['time', 'first name', 'code', 'invited by', 'came', 'checked by']].concat((ctx.D.referrals || []).map(r => [r.time, r.name, r.code, ambName(ctx, r.code), r.came ? 'yes' : '', r.checked_by]));
  download(`referral-names-${new Date().toISOString().slice(0, 10)}.csv`, csvBuild(rows), 'text/csv'); toast('Downloaded. It has names of minors — delete it when you are done.');
}
async function purge(ctx) {
  if (!await confirmBox({ title: 'Delete every name now?', text: `Friends' first names, and ambassadors' contacts, notes and page links are deleted. The numbers stay. This happens by itself after ${esc(fmtDay((ctx.D.amb || {}).deleteOn || ''))}. It can't be undone.`, ok: 'Delete now', danger: true })) return;
  const r = await ctx.api.post('referral.purge', {});
  if (!r.ok) return toast(r.error, 'err');
  Object.assign(ctx.D, { ambassadors: r.ambassadors, referrals: r.referrals, amb: r.amb }); ctx.api.cache(ctx.D); toast(`${r.names} names deleted.`); ctx.render();
}

/** "Add several": one per line — Name, School, @contact. */
function addSeveral(ctx) {
  const team = (ctx.D.team || []).filter(p => p.access !== 'viewer');
  const m = modal({ title: 'Add several ambassadors', body: `<form id="asf"><p class="small muted" style="margin-top:0">One per line: <code>Name, School, @telegram</code> (school and contact are optional). Codes are made from the first names.</p>
      ${field({ label: 'Ambassadors', name: 'lines', type: 'textarea', attrs: 'rows="8" placeholder="Malika Karimova, School 110, @malika_k&#10;Sardor Aliyev, Westminster Lyceum"', full: true })}
      ${field({ label: 'Buddy for all of them', name: 'buddy', type: 'select', value: ctx.me.key, options: [['', '— nobody yet']].concat(team.map(p => [p.key, p.name])) })}</form>`,
    foot: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="as-go">${icon('users')} Add</button>` });
  $('#as-go', m.el).onclick = async e => {
    const v = formValues($('#asf', m.el)), b = e.currentTarget;
    const list = String(v.lines || '').split('\n').map(l => l.split(/\t|,/).map(x => x.trim())).filter(x => x[0]).map(([name, school, contact]) => ({ name, school: school || '', contact: contact || '', buddy: v.buddy }));
    if (!list.length) return toast('Write at least one name.', 'err');
    busy(b, true); const r = await ctx.api.post('amb.save', { list }); busy(b, false);
    if (!r.ok) return toast(r.error, 'err');
    ctx.D.ambassadors = r.ambassadors; ctx.api.cache(ctx.D); m.close();
    toast(`${r.saved.length} added${r.errors.length ? ` — ${r.errors.length} not: ${r.errors[0]}` : ''}.`, r.errors.length ? 'err' : 'ok'); ctx.render();
  };
}

/** The Sunday post for the ambassadors' group: top 5 (first names), in the hub's main language. */
function board(ctx) {
  const D = ctx.D, langs = D.langs && D.langs.length ? D.langs : ['en'], started = (D.amb || {}).started, cap = (D.amb || {}).cap || 8;
  const top = (D.ambassadors || []).filter(a => isAmb(a) && a.status !== 'left' && a.score > 0).sort((x, y) => y.score - x.score || x.joined_at.localeCompare(y.joined_at)).slice(0, 5);
  const text = l => { const t = tr(l), date = new Date().toLocaleDateString({ uz: 'uz-UZ', ru: 'ru-RU' }[l] || 'en-GB', { day: 'numeric', month: 'long' });
    return t('boardTitle', { date }) + '\n\n' + (top.length ? top.map((a, i) => `${['🥇', '🥈', '🥉', '4.', '5.'][i]} ${first(a.name)} — ${Math.min(cap, a.score)}`).join('\n') : t('boardNone')) + '\n\n' + t('boardFoot'); };
  const m = modal({ title: 'Sunday leaderboard', body: `<p class="small muted" style="margin-top:0">Post it in the ambassadors' group every Sunday — a weekly number is what keeps them going. First names only; ${started ? 'friends who came' : 'names via their links'}, at most ${cap} each.</p>
      ${langs.length > 1 ? `<div class="lang-sw" role="group" aria-label="Language">${langs.map((l, i) => `<button type="button" data-l="${l}" class="${i ? '' : 'on'}">${esc(NAMES[l] || l)}</button>`).join('')}</div>` : ''}
      <textarea id="lb" rows="10" style="margin-top:8px">${esc(text(langs[0]))}</textarea>`,
    foot: `<button class="btn ghost" data-close>Close</button><button class="btn primary" id="lb-copy">${icon('copy')} Copy</button>` });
  m.el.querySelectorAll('[data-l]').forEach(b => { b.onclick = () => { m.el.querySelectorAll('[data-l]').forEach(x => x.classList.toggle('on', x === b)); $('#lb', m.el).value = text(b.dataset.l); }; });
  $('#lb-copy', m.el).onclick = () => copy($('#lb', m.el).value, 'Copied — paste it in the ambassadors\' group.');
}

/** Overview card for leads. */
export function ambCard(ctx) {
  const D = ctx.D, A = (D.ambassadors || []).filter(isAmb), R = D.referrals || [];
  if (!A.length) return '';
  const active = A.filter(a => a.status === 'active'), weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10), week = R.filter(r => r.time.slice(0, 10) >= weekAgo).length;
  const top = active.filter(a => a.score > 0).sort((x, y) => y.score - x.score).slice(0, 3), quiet = (D.amb || {}).on ? active.filter(a => !a.week).length : 0;
  return `<div class="card" style="margin-bottom:18px"><div class="card-h"><div><h3>Ambassadors</h3><div class="sub">${active.length} active · ${R.length} names via their links${week ? ` (+${week} this week)` : ''}${(D.amb || {}).on ? '' : ' · names are off'}</div></div><a class="btn soft sm" href="#/admin/ambassadors">${icon('users')} Open</a></div>
    ${top.length ? `<p style="margin:0">${top.map((a, i) => `${['🥇', '🥈', '🥉'][i]} <b>${esc(first(a.name))}</b> ${a.score}`).join(' &nbsp; ')}</p>` : '<p class="muted" style="margin:0">No names via ambassador links yet.</p>'}
    ${quiet ? `<p class="small muted" style="margin:6px 0 0">${quiet} active ambassador${quiet === 1 ? ' has' : 's have'} no new names this week — their buddies hear about it on Sunday.</p>` : ''}</div>`;
}
