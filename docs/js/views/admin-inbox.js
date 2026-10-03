/* Inbox (leads): new emails to your city address, reported by the inbox watcher (apps-script/inbox-watcher.gs, set up in Settings → Connections).
   Mark each one handled or ignored, or turn it into a task for someone — so no sponsor or school email waits for a week. */
import { $, esc, icon, toast, busy, modal, field, formValues, empty, ago, safeUrl, first } from '../ui.js';

let tab = 'new';
const tomorrow = tz => { const d = new Date(Date.now() + 864e5).toLocaleString('sv-SE', { timeZone: tz }); return d.slice(0, 10); };
const sender = f => { const m = String(f || '').match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/); return m ? { name: m[1], email: m[2] } : { name: String(f || ''), email: /@/.test(f) ? String(f) : '' }; };

export function inboxPage(ctx) {
  const D = ctx.D, all = D.inbox || [], by = s => all.filter(x => (x.status || 'new') === s);
  const list = tab === 'all' ? all : by(tab);
  ctx.el.innerHTML = `<p class="lede">New emails to your city address, so nothing waits. Handle it, ignore it, or turn it into a task for someone. Replies happen in Gmail — this list only keeps track.</p>
    <div class="toolbar"><div class="seg">${[['new', 'New'], ['done', 'Handled'], ['ignored', 'Ignored'], ['all', 'All']].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l} ${k === 'new' && by('new').length ? `<span class="cnt">${by('new').length}</span>` : `<span class="muted">${k === 'all' ? all.length : by(k).length}</span>`}</button>`).join('')}</div></div>
    ${list.length ? `<div class="card flush"><ul class="mail-list">${list.map(row).join('')}</ul></div>`
      : `<div class="card">${empty({ title: all.length ? 'Nothing here' : 'No emails yet', text: all.length ? '' : ctx.isAdmin ? 'Connect your city mailbox once: <a href="#/admin/settings#s-conn">Settings → Connections</a> → inbox watcher (5 minutes). New emails then show up here and leads get a Telegram message.' : 'An admin connects the city mailbox in Settings → Connections.' })}</div>`}`;
  ctx.el.querySelector('.seg').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; inboxPage(ctx); } };
  ctx.el.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const m = all.find(x => x.id === b.closest('[data-id]').dataset.id);
    if (b.dataset.a === 'task') return makeTask(ctx, m);
    busy(b, true, '…');
    const r = await ctx.api.post('inbox.update', { id: m.id, status: b.dataset.a });
    busy(b, false);
    if (!r.ok) return toast(r.error, 'err');
    Object.assign(m, r.email); D.inboxNew = by('new').length; ctx.api.cache(D);
    toast(r.email.status === 'done' ? 'Marked as handled.' : r.email.status === 'ignored' ? 'Ignored.' : 'Back to New.'); ctx.render();
  };
  function row(m) {
    const s = sender(m.from), link = safeUrl(m.link), st = m.status || 'new';
    return `<li class="mail ${st}" data-id="${esc(m.id)}"><div class="mail-h"><b>${esc(s.name || s.email || 'Unknown sender')}</b>${s.email && s.name ? ` <span class="small muted">${esc(s.email)}</span>` : ''}<span class="t small muted">${esc(ago(m.time, ctx.tz))}</span></div>
      <div class="mail-s">${esc(m.subject)}</div>${m.snippet ? `<div class="mail-p small muted">${esc(m.snippet.slice(0, 220))}</div>` : ''}
      <div class="actions">${link ? `<a class="btn sm soft" href="${esc(link)}" target="_blank" rel="noopener">${icon('external')} Open in Gmail</a>` : ''}
        ${st === 'new' ? `<button class="btn sm primary" data-a="done">${icon('check')} Handled</button><button class="btn sm ghost" data-a="task">${icon('plus')} Make a task</button><button class="btn sm ghost" data-a="ignored">Ignore</button>`
          : `<span class="small muted">${st === 'done' ? 'Handled' : 'Ignored'}${m.handled_by ? ' by ' + esc(first(m.handled_by)) : ''}${m.task ? ` · task <b>${esc(m.task)}</b>` : ''}</span><button class="btn sm ghost" data-a="new">Back to New</button>`}</div></li>`;
  }
}

/** "Make a task": who answers this email, and by when. The email is then marked handled, with the task next to it. */
function makeTask(ctx, m) {
  const D = ctx.D, s = sender(m.from);
  const md = modal({ title: 'Make a task from this email', body: `<form id="it" class="form-grid">
      ${field({ label: 'Task', name: 'title', value: `Reply to ${s.name || s.email}: ${m.subject}`.slice(0, 200), required: true, full: true })}
      ${field({ label: 'Who', name: 'owner', type: 'select', value: D.me.key, options: D.team.map(p => [p.key, p.name]) })}
      ${field({ label: 'By', name: 'due', type: 'date', value: tomorrow(ctx.tz) })}
      ${field({ label: 'What to do', name: 'why', type: 'textarea', full: true, value: `Email from ${m.from} (${m.time}).${m.snippet ? '\n“' + m.snippet.slice(0, 300) + '”' : ''}`, attrs: 'rows="3"' })}</form>`,
    foot: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="it-go">${icon('plus')} Make the task</button>` });
  $('#it-go', md.el).onclick = async e => {
    const v = formValues($('#it', md.el)), b = e.currentTarget;
    if (!v.title || !v.due) return toast('Write the task and pick a date.', 'err');
    busy(b, true);
    const link = safeUrl(m.link);
    const r = await ctx.api.post('task.add', { task: { title: v.title, owner: v.owner, due: v.due + ' 18:00', mins: 15, why: v.why, links: link ? [{ label: 'The email', url: link }] : [] } });
    if (!r.ok) { busy(b, false); return toast(r.error, 'err'); }
    const u = await ctx.api.post('inbox.update', { id: m.id, status: 'done', task: r.task.id });
    busy(b, false);
    if (u.ok) Object.assign(m, u.email);
    md.close(); toast(`Task ${r.task.id} made for ${first(ctx.nameOf(v.owner))}.`); ctx.refresh({ silent: true });
  };
}
