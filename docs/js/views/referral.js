/* Pages for ambassadors and their friends — nobody signs in:
   #/r/CODE            a friend opens an ambassador's link: (first name →) HQ's signup page with ?ref=CODE
   #/amb?k=…&s=…       an ambassador's own page: link, QR code, poster, a message to forward, their numbers, the top 5
   #/amb/poster?k=…&s=… a printable A4 poster with their QR code
   On your own server, <server>/r/CODE goes straight to HQ while the name step is off (server/app.mjs). */
import { $, esc, icon, toast, busy, copy, skeleton, safeUrl, download } from '../ui.js';
import { tr, langsOf, pickLang, setLang, langSwitch, textIn, dayIn, rangeIn } from '../i18n.js';
import { qrSvg } from '../qr.js';

const when = (ev, lang) => rangeIn(ev.start, ev.end, lang);
const wireLang = (root, again) => root.querySelectorAll('[data-lang]').forEach(b => { b.onclick = () => { setLang(b.dataset.lang); again(); }; });
const hashQuery = () => new URLSearchParams(location.hash.split('?')[1] || '');
const top = (title, sw) => `<div class="wiz-top apply-top"><a href="#/"><img src="assets/logo-orange.png" alt="Hack Club Haven" width="96" height="61"></a><div style="flex:1"><h1 style="font-size:26px">${esc(title)}</h1></div>${sw || ''}</div>`;
/** The ambassador's message with their link in it: the hub's own text for this language, or the standard one. */
export function shareText(A, lang) {
  const t = tr(lang), own = textIn(A.messages, lang, '');
  const txt = own ? own.replace(/\{event\}/g, A.event.name) : t('shareMsg', { event: A.event.name, link: '{link}' });
  return txt.includes('{link}') ? txt.replace(/\{link\}/g, A.me.link) : txt + '\n' + A.me.link;
}

// ------------------------------------------------------------------ #/r/CODE
export async function referralPage(root, ctx, code) {
  root.innerHTML = `<div class="wiz" style="max-width:560px">${skeleton(2)}</div>`;
  const P = await ctx.api.getPublic('referral.check', { code });
  const lang = pickLang(langsOf(P)), t = tr(lang), ev = P.event || {};
  document.documentElement.lang = lang;
  if (!P.ok) {
    root.innerHTML = `<div class="wiz" style="max-width:560px">${top(ev.name || 'Haven')}<div class="card"><p>${esc(P.code === 'no_signup' ? t('refNoSignup') : P.error || 'This hub is not reachable right now.')}</p><a href="#/">${esc(t('back'))}</a></div></div>`;
    return;
  }
  document.title = ev.name + ' — Hack Club Haven';
  const go = url => { if (ctx.api.DEMO) return toast('Demo: this would open ' + url); location.replace(url); };
  if (!P.on && safeUrl(P.url)) { root.innerHTML = `<div class="boot">${esc(t('refGoing'))}</div>`; return go(safeUrl(P.url)); } // names off: nothing is saved, HQ still gets ?ref=
  const render = () => {
    const l = pickLang(langsOf(P)), tt = tr(l);
    document.documentElement.lang = l;
    root.innerHTML = `<div class="wiz ref" style="max-width:560px">${top(ev.name, langSwitch(langsOf(P), l))}
      <form class="card" id="ref" lang="${l}">
        <div class="ref-head"><img src="assets/daven.png" alt="" width="96" height="66"><div>${P.inviter ? `<h2>${esc(tt('refBy', { name: P.inviter }))}</h2>` : ''}<p class="muted" style="margin:4px 0 0">${icon('calendar')} ${esc(when(ev, l))}${ev.city ? ' · ' + esc(ev.city) : ''}</p></div></div>
        <p>${esc(tt('refLede'))}</p>
        <div class="field"><label for="r-n">${esc(tt('refName'))}</label><input id="r-n" name="name" required minlength="2" maxlength="40" autocomplete="given-name" autofocus></div>
        <label class="ref-age"><input type="checkbox" name="age" value="1"> ${esc(tt('refAge'))}</label><small class="hint" id="r-agehint"></small>
        <div class="hp" aria-hidden="true"><label>Company <input name="company" tabindex="-1" autocomplete="off"></label></div>
        <button class="btn accent lg" type="submit" style="width:100%;justify-content:center;margin-top:12px">${icon('zap')} ${esc(tt('refGo'))}</button>
        <p class="small muted" style="margin:12px 0 0">${esc(tt('refPrivacy', { date: dayIn(P.deleteOn, l) }))}</p></form>
      <p class="small" style="text-align:center"><a href="${esc(safeUrl(P.url))}" rel="noopener">${esc(tt('refSkip'))}</a></p></div>`;
    wireLang(root, render);
    const f = $('#ref');
    f.onsubmit = async e => {
      e.preventDefault();
      const name = f.name.value.trim(), b = f.querySelector('[type=submit]');
      if (name.length < 2) return toast(tt('nameShort'), 'err');
      if (!f.age.checked) { $('#r-agehint').textContent = tt('refAgeNo'); return; }
      busy(b, true, '…');
      const r = await ctx.api.postPublic('referral.save', { code: P.code, name, company: f.company.value });
      busy(b, false);
      if (!r.ok && r.code === 'name') return toast(tt('nameShort'), 'err');
      const url = safeUrl((r && r.url) || P.url);
      f.innerHTML = `<div style="text-align:center"><img src="assets/daven.png" alt="" width="110" height="76"><h3>${esc(tt('refNext'))}</h3>
        <a class="btn accent lg" href="${esc(url)}" rel="noopener">${icon('external')} ${esc(tt('refOpen'))}</a></div>`;
      setTimeout(() => go(url), 1200);
    };
  };
  render();
}

// ------------------------------------------------------------------ #/amb?k=…&s=…
async function loadAmb(root, ctx) {
  const q = hashQuery(), k = q.get('k') || '', s = q.get('s') || '';
  root.innerHTML = `<div class="wiz" style="max-width:720px">${skeleton(3)}</div>`;
  const A = k && s ? await ctx.api.postPublic('amb.page', { k, s }) : { ok: false, code: 'gone' };
  if (!A.ok) { // we don't know the hub's languages here: say it in all of them
    const say = A.code === 'gone' ? ['uz', 'ru', 'en'].map(l => `<p lang="${l}" style="margin:0 0 6px">${esc(tr(l)('ambGone'))}</p>`).join('') : `<p style="margin:0">${esc(A.error || 'The hub is not reachable right now.')}</p>`;
    root.innerHTML = `<div class="wiz" style="max-width:560px">${top('Haven')}<div class="banner bad">${icon('alert')}<div>${say}</div></div></div>`;
    return null;
  }
  return Object.assign(A, { k, s });
}

export async function ambassadorPage(root, ctx) {
  const A = await loadAmb(root, ctx);
  if (!A) return;
  const render = () => {
    const avail = langsOf(A), lang = pickLang(avail), t = tr(lang), me = A.me, ev = A.event, msg = shareText(A, lang);
    document.documentElement.lang = lang; document.title = t('ambHi', { name: me.first }) + ' — ' + ev.name;
    const rewards = textIn(A.rewards, lang, '').split('\n').map(x => x.trim()).filter(Boolean);
    const score = A.started ? me.came : me.n;
    const poster = `#/amb/poster?k=${encodeURIComponent(A.k)}&s=${encodeURIComponent(A.s)}`;
    const tg = `https://t.me/share/url?url=${encodeURIComponent(me.link)}&text=${encodeURIComponent(msg.replace(me.link, '').trim())}`;
    root.innerHTML = `<div class="wiz amb" style="max-width:760px">${top(t('ambHi', { name: me.first }), langSwitch(avail, lang))}
      <p class="lede">${esc(t('ambLede', { event: ev.name }))}</p>
      ${me.status === 'paused' ? `<div class="banner">${icon('alert')}<div>${esc(t('ambPaused'))}</div></div>` : ''}
      <div class="grid-2" style="align-items:start"><div class="stack">
        <div class="card"><div class="card-h"><h3>${esc(t('ambLink'))}</h3><span class="pill">${esc(t('ambCode'))}: ${esc(me.code)}</span></div>
          <div class="linkbox"><input readonly value="${esc(me.link)}" aria-label="${esc(t('ambLink'))}"><button class="btn soft" id="a-copy">${icon('copy')} ${esc(t('ambCopy'))}</button></div>
          <a class="btn primary" style="margin-top:10px" href="${esc(tg)}" target="_blank" rel="noopener">${icon('send')} ${esc(t('ambShare'))}</a></div>
        <div class="card"><div class="card-h"><h3>${esc(t('ambNumbers'))}</h3></div>
          ${A.on || me.n ? `<div class="amb-nums"><div><span class="big-pct">${esc(me.n)}</span><span class="muted">${esc(t('ambSigned'))}</span>${me.week ? `<span class="small">${esc(t('ambWeek', { n: me.week }))}</span>` : ''}</div>
            ${A.started ? `<div><span class="big-pct">${esc(me.came)}</span><span class="muted">${esc(t('ambCame'))}</span></div>` : ''}</div>` : `<p class="muted" style="margin:0">${esc(t('ambOff'))}</p>`}
          ${rewards.length ? `<h4 style="margin:14px 0 2px">${esc(t('ambRewards'))}</h4><p class="small muted" style="margin:0 0 8px">${esc(t('ambRewardsSub'))}</p>
            <ul class="amb-rewards">${rewards.map(r => { const n = parseInt(r, 10); const got = n > 0 && A.started && score >= n; return `<li class="${got ? 'got' : ''}">${got ? icon('check') : icon('gift')} ${esc(r)}</li>`; }).join('')}</ul>` : ''}</div>
        <div class="card"><div class="card-h"><h3>${esc(t('ambTop'))}</h3><span class="sub">${esc(A.started ? t('ambTopCame') : t('ambTopNames'))}</span></div>
          ${A.top.length ? `<ol class="amb-top">${A.top.map(x => `<li class="${x.me ? 'me' : ''}"><b>${esc(x.name)}</b>${x.me ? ` <span class="pill ok">${esc(t('ambYou'))}</span>` : ''}<span class="n">${esc(x.score)}</span></li>`).join('')}</ol>` : `<p class="muted" style="margin:0">${esc(t('ambTopNone'))}</p>`}</div>
      </div><div class="stack">
        <div class="card amb-qr"><div class="card-h"><h3>${esc(t('ambQr'))}</h3></div>${qrSvg(me.link, { size: 220, label: me.link })}
          <p class="small muted">${esc(t('ambQrSub'))}</p>
          <div class="row" style="justify-content:center"><a class="btn primary" href="${poster}">${icon('file')} ${esc(t('ambPoster'))}</a><button class="btn ghost" id="a-svg">${icon('download')} ${esc(t('ambSaveQr'))}</button></div></div>
        <div class="card"><div class="card-h"><h3>${esc(t('ambHow'))}</h3></div><ol class="how">${['ambHow1', 'ambHow2', 'ambHow3', 'ambHow4'].map(k => `<li>${esc(t(k))}</li>`).join('')}</ol>
          <div class="field"><label for="a-msg">${esc(t('ambMsg'))}</label><textarea id="a-msg" readonly rows="5">${esc(msg)}</textarea></div>
          <button class="btn soft" id="a-mcopy">${icon('copy')} ${esc(t('ambCopy'))}</button></div>
        ${A.group || A.buddy ? `<div class="card">${A.group ? `<h3 style="margin-bottom:8px">${esc(t('ambGroup'))}</h3><a class="btn soft" href="${esc(safeUrl(A.group))}" target="_blank" rel="noopener">${icon('message')} ${esc(t('ambGroupBtn'))}</a>` : ''}
          ${A.buddy ? `<p class="small" style="margin:${A.group ? '12px' : '0'} 0 0">${esc(t('ambBuddy', { name: A.buddy.name }))}${A.buddy.handle ? ` — <a href="https://t.me/${esc(A.buddy.handle.slice(1))}" target="_blank" rel="noopener">${esc(A.buddy.handle)}</a>` : ''}</p>` : ''}</div>` : ''}
      </div></div></div>`;
    wireLang(root, render);
    $('#a-copy').onclick = () => copy(me.link, t('ambCopied'));
    $('#a-mcopy').onclick = () => copy(msg, t('ambCopied'));
    $('#a-svg').onclick = () => download(`${ev.name.replace(/[^\w]+/g, '-')}-${me.code}-qr.svg`, qrSvg(me.link, { size: 1024, label: me.link }), 'image/svg+xml');
  };
  render();
}

// ------------------------------------------------------------------ #/amb/poster?k=…&s=…
export async function posterPage(root, ctx) {
  const A = await loadAmb(root, ctx);
  if (!A) return;
  let showName = true;
  const render = () => {
    const avail = langsOf(A), lang = pickLang(avail), t = tr(lang), me = A.me, ev = A.event;
    document.documentElement.lang = lang; document.title = ev.name + ' — poster ' + me.code;
    const shortLink = me.link.replace(/^https?:\/\//, '').replace(/\?hub=[^#]*/, '');
    root.innerHTML = `<div class="poster-tools no-print"><a class="btn ghost" href="#/amb?k=${encodeURIComponent(A.k)}&s=${encodeURIComponent(A.s)}">${esc(t('posterBack'))}</a>${langSwitch(avail, lang)}
        <label class="small"><input type="checkbox" id="p-name" ${showName ? 'checked' : ''}> ${esc(t('posterShowName'))}</label><button class="btn primary" id="p-print">${icon('download')} ${esc(t('posterPrint'))}</button></div>
      <div class="poster" lang="${lang}">
        <header class="poster-top"><img src="assets/logo-white.png" alt="Hack Club Haven" width="150" height="96"><div><div class="poster-ev">${esc(ev.name)}</div><div class="poster-when">${esc(when(ev, lang))}${ev.city ? ' · ' + esc(ev.city) : ''}</div></div></header>
        <h1 class="poster-title">${esc(t('posterTitle'))}</h1>
        <p class="poster-facts">${esc(t('posterFacts'))}</p>
        <div class="poster-qr">${qrSvg(me.link, { size: 380, label: me.link })}</div>
        <p class="poster-scan">${esc(t('posterScan'))}</p>
        <p class="poster-link">${esc(shortLink)}</p>
        <footer class="poster-foot"><img src="assets/daven.png" alt="" width="140" height="96">${showName ? `<span>${esc(t('posterBy', { name: me.first }))}</span>` : '<span></span>'}<span class="poster-hc">haven.hackclub.com</span></footer>
      </div>`;
    wireLang(root, render);
    $('#p-name').onchange = e => { showName = e.target.checked; render(); };
    $('#p-print').onclick = () => window.print();
  };
  render();
}
