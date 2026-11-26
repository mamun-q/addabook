/* AddaBook — single-file app (Supabase backend) */
const SUPABASE_URL = 'https://eowrjgdvdntnpgyamuxl.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvd3JqZ2R2ZG50bnBneWFtdXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2MjkzMjQsImV4cCI6MjExMTIwNTMyNH0.Zl_dnGYGtJneH8x8cHbnY7TIX40QKYyS6XIAJK_CuDI';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let me = null;            // my profile row
let curView = 'feed';
let profilesCache = {};   // id -> profile
let friendIds = new Set();
let followIds = new Set();
let blockedIds = new Set();
let unreadNotifs = 0;
let activeChat = null;    // conversation id open
let chatChannel = null;
let notifChannel = null;

const $ = s => document.querySelector(s);
const view = () => $('#view');
const BN = '০১২৩৪৫৬৭৮৯';
const bn = n => String(n).replace(/[0-9]/g, d => BN[d]);
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const COLORS = ['#4F46E5','#2563EB','#DB2777','#059669','#D97706','#7C3AED','#0891B2','#DC2626'];
function colorFor(id){ let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
function avatar(p, size = 38, fs = 15){
  if (p && p.avatar_url) return `<img class="avimg" src="${esc(p.avatar_url)}" style="width:${size}px;height:${size}px" alt="">`;
  const name = (p && p.name) || '?';
  return `<span class="av" style="background:${colorFor(p ? p.id : name)};width:${size}px;height:${size}px;font-size:${fs}px">${esc(name.trim()[0] || '?')}</span>`;
}
function badges(p){ return (p && p.verified ? '<span class="vf">✓</span>' : '') + (p && p.badge ? '<span class="gold">◆</span>' : ''); }
function timeAgo(ts){
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'এখনই';
  if (s < 3600) return bn(Math.floor(s / 60)) + ' মিনিট আগে';
  if (s < 86400) return bn(Math.floor(s / 3600)) + ' ঘণ্টা আগে';
  if (s < 86400 * 30) return bn(Math.floor(s / 86400)) + ' দিন আগে';
  return new Date(ts).toLocaleDateString('bn-BD');
}
function toast(msg){
  const old = document.querySelector('.toast'); if (old) old.remove();
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}
function sheet(html){
  $('#overlay').innerHTML = `<div class="sheet" onclick="if(event.target===this)closeSheet()"><div class="sheetbox">${html}</div></div>`;
}
function closeSheet(){ $('#overlay').innerHTML = ''; }
function linkTags(text){
  return esc(text).replace(/#([\p{L}\p{N}_]+)/gu, '<a class="tag" href="#" onclick="openTag(\'$1\');return false">#$1</a>');
}
async function notify(userId, type, postId = null, convId = null){
  if (!me || userId === me.id) return;
  await sb.from('notifications').insert({ user_id: userId, actor_id: me.id, type, post_id: postId, conversation_id: convId });
}
async function cacheProfiles(ids){
  const missing = [...new Set(ids)].filter(id => id && !profilesCache[id]);
  if (!missing.length) return;
  const { data } = await sb.from('profiles').select('*').in('id', missing);
  (data || []).forEach(p => profilesCache[p.id] = p);
}
function prof(id){ return profilesCache[id] || { id, name: 'ব্যবহারকারী', avatar_url: '' }; }

/* ---------- ICONS ---------- */
const I = {
  search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  bell:'<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/></svg>',
  msg:'<svg viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z"/></svg>',
  home:'<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  users:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"/><path d="M16 5a3.5 3.5 0 0 1 0 6.5M18.5 15.4c1.7.7 2.7 2.1 3.1 4.1"/></svg>',
  fire:'<svg viewBox="0 0 24 24"><path d="M12 3c1 3-2 4.5-2 7a4.5 4.5 0 0 0 9 0c0-2-1-3.5-2-5-.3 1.2-1 2-2 2.5C14.5 6 13.5 4.5 12 3z"/><path d="M12 21a6.5 6.5 0 0 1-6.5-6.5c0-1.5.5-2.8 1.3-4 .5 1 1.2 1.7 2.2 2.2C8.7 14 9 15.5 10 16.5c-.3-2.3.8-3.7 2-5.5 1.2 1.8 3.5 3.3 3.5 6A6.5 6.5 0 0 1 12 21z" transform="scale(0.92) translate(1,0)"/></svg>',
  user:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/></svg>',
  heart:'<svg viewBox="0 0 24 24"><path d="M12 20.5C7 16.5 3 13.3 3 9.3A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 9 3.3c0 4-4 7.2-9 11.2z"/></svg>',
  comment:'<svg viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z"/></svg>',
  share:'<svg viewBox="0 0 24 24"><path d="M13 5.5 20 12l-7 6.5v-4C7 14.5 4.5 17 3 19c0-6 3.5-10 10-11z"/></svg>',
  bookmark:'<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  dots:'<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  img:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 3 3 3-3 5 5"/></svg>',
  send:'➤'
};

/* ---------- SHELL ---------- */
function renderShell(){
  $('#topbar').innerHTML = `<div class="top">
    <div class="logo">আড্ডা<em>Book</em></div>
    <div class="ic">
      <button class="icb" onclick="go('search')" aria-label="খোঁজো">${I.search}</button>
      <button class="icb" onclick="go('notifs')" aria-label="নোটিফিকেশন">${I.bell}${unreadNotifs ? `<span class="dotn">${bn(unreadNotifs)}</span>` : ''}</button>
      <button class="icb" onclick="go('chat')" aria-label="চ্যাট">${I.msg}</button>
    </div></div>`;
  const items = [['feed','হোম',I.home],['friends','বন্ধু',I.users],['trending','আবিষ্কার',I.fire],['chat','চ্যাট',I.msg],['profile','প্রোফাইল',I.user]];
  $('#navbar').innerHTML = `<div class="nav">${items.map(([k,t,ic]) => `<button class="${curView === k ? 'on' : ''}" onclick="go('${k}')">${ic}${t}</button>`).join('')}</div>`;
}
function go(v, arg){
  curView = v; activeChat = null;
  if (chatChannel) { sb.removeChannel(chatChannel); chatChannel = null; }
  renderShell();
  window.scrollTo(0, 0);
  ({ feed: renderFeed, friends: renderFriends, trending: renderTrending, chat: renderChatList,
     profile: () => renderProfile(me.id), notifs: renderNotifs, search: renderSearch,
     tokens: renderTokens, dating: renderDating, groups: renderGroups, saved: renderSaved, settings: renderSettings }[v] || renderFeed)(arg);
}

/* ---------- AUTH ---------- */
function renderAuth(mode = 'login'){
  $('#topbar').innerHTML = ''; $('#navbar').innerHTML = '';
  view().innerHTML = `<div class="view">
    <div class="hero"><div class="mark">অ</div>
      <div style="font-size:25px;font-weight:800;position:relative;z-index:1">আড্ডাBook</div>
      <p style="font-size:13.5px;opacity:.88;margin-top:5px;position:relative;z-index:1">বন্ধুদের সাথে প্রতিদিনের আড্ডা, এক জায়গায়</p></div>
    <div class="loginbox">
      ${mode === 'signup' ? '<input class="field" id="authName" placeholder="তোমার নাম">' : ''}
      <input class="field" id="authEmail" type="email" placeholder="ইমেইল">
      <input class="field" id="authPass" type="password" placeholder="পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)">
      <div id="authErr" style="color:var(--danger);font-size:13px;margin-bottom:10px"></div>
      ${mode === 'login'
        ? `<button class="btn block" onclick="doLogin()">লগ ইন</button>
           <p style="text-align:center;margin-top:15px;font-size:13.5px;color:var(--mut)">অ্যাকাউন্ট নেই? <a href="#" onclick="renderAuth('signup');return false"><b>নতুন অ্যাকাউন্ট খোলো</b></a></p>`
        : `<button class="btn block" onclick="doSignup()">অ্যাকাউন্ট খোলো</button>
           <p style="text-align:center;margin-top:15px;font-size:13.5px;color:var(--mut)">আগে থেকেই অ্যাকাউন্ট আছে? <a href="#" onclick="renderAuth('login');return false"><b>লগ ইন করো</b></a></p>`}
    </div>
    <p style="text-align:center;color:var(--faint);font-size:11.5px;padding:18px 0 6px">© 2026 আড্ডাBook · LIMON Labs</p></div>`;
}
async function doSignup(){
  const name = $('#authName').value.trim(), email = $('#authEmail').value.trim(), pass = $('#authPass').value;
  const err = $('#authErr');
  if (!name || !email || pass.length < 6) { err.textContent = 'নাম, ইমেইল আর কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দাও'; return; }
  const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { name } } });
  if (error) { err.textContent = 'হয়নি: ' + error.message; return; }
  if (!data.session) { err.style.color = 'var(--ok)'; err.textContent = 'অ্যাকাউন্ট তৈরি! ইমেইলে পাঠানো লিংকে চাপ দিয়ে নিশ্চিত করে তারপর লগ ইন করো।'; return; }
  await boot();
}
async function doLogin(){
  const email = $('#authEmail').value.trim(), pass = $('#authPass').value;
  const err = $('#authErr');
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { err.textContent = 'লগ ইন হয়নি — ইমেইল/পাসওয়ার্ড মিলিয়ে আবার চেষ্টা করো'; return; }
  await boot();
}
async function doLogout(){ await sb.auth.signOut(); me = null; renderAuth(); }

/* ---------- BOOT ---------- */
async function loadMyRelations(){
  const [fr, fo, bl] = await Promise.all([
    sb.from('friendships').select('*').or(`requester.eq.${me.id},addressee.eq.${me.id}`),
    sb.from('follows').select('following').eq('follower', me.id),
    sb.from('blocks').select('blocked').eq('blocker', me.id)
  ]);
  friendIds = new Set(); (fr.data || []).forEach(r => { if (r.status === 'accepted') friendIds.add(r.requester === me.id ? r.addressee : r.requester); });
  followIds = new Set((fo.data || []).map(r => r.following));
  blockedIds = new Set((bl.data || []).map(r => r.blocked));
}
async function refreshNotifBadge(){
  const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', me.id).eq('is_read', false);
  unreadNotifs = count || 0; renderShell();
}
function subscribeNotifs(){
  if (notifChannel) sb.removeChannel(notifChannel);
  notifChannel = sb.channel('notifs-' + me.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + me.id }, () => { unreadNotifs++; renderShell(); })
    .subscribe();
}
async function boot(){
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { renderAuth(); return; }
  let { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (!profile) {
    const name = session.user.user_metadata?.name || (session.user.email || 'ব্যবহারকারী').split('@')[0];
    const ins = await sb.from('profiles').insert({ id: session.user.id, name, tokens: 100 }).select().single();
    profile = ins.data;
  }
  me = profile; profilesCache[me.id] = me;
  if (localStorage.getItem('adda-theme') === 'dark') document.documentElement.classList.add('dark');
  await loadMyRelations();
  sb.rpc('rpc_award', { p_reason: 'login' }).then(({ data }) => { if (typeof data === 'number') { me.tokens = data; profilesCache[me.id] = me; } });
  await refreshNotifBadge();
  subscribeNotifs();
  go('feed');
}
document.addEventListener('DOMContentLoaded', boot);

/* ---------- UPLOAD ---------- */
async function uploadImage(file){
  if (!file) return '';
  const path = me.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
  const { error } = await sb.storage.from('media').upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (error) { toast('ছবি আপলোড হয়নি'); return ''; }
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
}

/* ---------- POSTS ---------- */
async function fetchPosts(opts = {}){
  let q = sb.from('posts').select('*').order('created_at', { ascending: false }).limit(120);
  if (opts.groupId) q = q.eq('group_id', opts.groupId);
  else if (!opts.authorId && !opts.tag && !opts.savedOnly) q = q.is('group_id', null);
  if (opts.authorId) q = q.eq('user_id', opts.authorId);
  const { data: posts } = await q;
  let list = posts || [];
  if (opts.tag) list = list.filter(p => (p.body || '').includes('#' + opts.tag));
  if (opts.savedOnly) {
    const { data: sv } = await sb.from('saves').select('post_id').eq('user_id', me.id);
    const ids = new Set((sv || []).map(r => r.post_id));
    list = list.filter(p => ids.has(p.id));
  }
  list = list.filter(p => !blockedIds.has(p.user_id));
  if (!list.length) return [];
  const ids = list.map(p => p.id);
  await cacheProfiles(list.map(p => p.user_id));
  const [likes, comments, myLikes, mySaves, pollVotes] = await Promise.all([
    sb.from('likes').select('post_id').in('post_id', ids),
    sb.from('comments').select('post_id').in('post_id', ids),
    sb.from('likes').select('post_id').eq('user_id', me.id).in('post_id', ids),
    sb.from('saves').select('post_id').eq('user_id', me.id).in('post_id', ids),
    sb.from('poll_votes').select('*').in('post_id', ids)
  ]);
  const lc = {}, cc = {}, pv = {};
  (likes.data || []).forEach(r => lc[r.post_id] = (lc[r.post_id] || 0) + 1);
  (comments.data || []).forEach(r => cc[r.post_id] = (cc[r.post_id] || 0) + 1);
  (pollVotes.data || []).forEach(r => { (pv[r.post_id] = pv[r.post_id] || []).push(r); });
  const myL = new Set((myLikes.data || []).map(r => r.post_id));
  const myS = new Set((mySaves.data || []).map(r => r.post_id));
  list.forEach(p => {
    p._likes = lc[p.id] || 0; p._comments = cc[p.id] || 0;
    p._liked = myL.has(p.id); p._saved = myS.has(p.id);
    p._votes = pv[p.id] || []; p._myVote = (pv[p.id] || []).find(v => v.user_id === me.id);
  });
  return list;
}
function feedScore(p){
  let s = p._likes * 3 + p._comments * 5;
  if (p.boost_until && new Date(p.boost_until) > new Date()) s += 500;
  if (friendIds.has(p.user_id) || followIds.has(p.user_id)) s += 40;
  if (p.user_id === me.id) s += 10;
  s -= (Date.now() - new Date(p.created_at).getTime()) / 3600000 * 0.7;
  return s;
}
function pollHtml(p){
  if (!p.poll || !Array.isArray(p.poll.options)) return '';
  const total = p._votes.length;
  return `<div class="poll">${p.poll.options.map((opt, i) => {
    const cnt = p._votes.filter(v => v.option_idx === i).length;
    const pct = total ? Math.round(cnt / total * 100) : 0;
    return `<button onclick="votePoll('${p.id}',${i})">${p._myVote ? `<span class="fill" style="width:${pct}%"></span>` : ''}<span>${esc(opt)}${p._myVote && p._myVote.option_idx === i ? ' ✓' : ''}</span>${p._myVote ? `<span class="pct">${bn(pct)}%</span>` : ''}</button>`;
  }).join('')}<small style="color:var(--faint);font-size:11.5px">${bn(total)}টি ভোট</small></div>`;
}
function postCard(p){
  const a = prof(p.user_id);
  const boosted = p.boost_until && new Date(p.boost_until) > new Date();
  return `<div class="card" id="post-${p.id}">
    <div class="chead">
      <a href="#" onclick="goProfile('${a.id}');return false">${avatar(a, 42, 16)}</a>
      <div style="flex:1;min-width:0"><b><a href="#" style="color:var(--ink)" onclick="goProfile('${a.id}');return false">${esc(a.name)}</a>${badges(a)}${boosted ? '<span class="boosted">বুস্ট করা</span>' : ''}</b>
      <small>${timeAgo(p.created_at)}${p.location ? ' · 📍 ' + esc(p.location) : ''}${p.feeling ? ' · অনুভূতি: ' + esc(p.feeling) : ''}</small></div>
      <button class="icb" style="width:32px;height:32px" onclick="postMenu('${p.id}')">${I.dots}</button>
    </div>
    ${p.body ? `<div class="ptext">${linkTags(p.body)}</div>` : ''}
    ${p.image_url ? `<img class="pimg" src="${esc(p.image_url)}" loading="lazy" alt="">` : ''}
    ${pollHtml(p)}
    <div class="counts"><span>${bn(p._likes)} লাইক</span><span>${bn(p._comments)} মন্তব্য</span></div>
    <div class="acts">
      <button class="${p._liked ? 'liked' : ''}" onclick="toggleLike('${p.id}',this)">${I.heart}লাইক</button>
      <button onclick="openComments('${p.id}')">${I.comment}মন্তব্য</button>
      <button class="${p._saved ? 'saved' : ''}" onclick="toggleSave('${p.id}',this)">${I.bookmark}সেভ</button>
    </div></div>`;
}
async function toggleLike(postId, btn){
  const { data: post } = await sb.from('posts').select('user_id').eq('id', postId).single();
  const { data: existing } = await sb.from('likes').select('post_id').eq('post_id', postId).eq('user_id', me.id).maybeSingle();
  if (existing) { await sb.from('likes').delete().eq('post_id', postId).eq('user_id', me.id); }
  else { await sb.from('likes').insert({ post_id: postId, user_id: me.id }); if (post) notify(post.user_id, 'like', postId); }
  refreshPost(postId);
}
async function toggleSave(postId, btn){
  const { data: existing } = await sb.from('saves').select('post_id').eq('post_id', postId).eq('user_id', me.id).maybeSingle();
  if (existing) { await sb.from('saves').delete().eq('post_id', postId).eq('user_id', me.id); toast('সেভ সরানো হয়েছে'); }
  else { await sb.from('saves').insert({ post_id: postId, user_id: me.id }); toast('পোস্ট সেভ হয়েছে'); }
  refreshPost(postId);
}
async function refreshPost(postId){
  const el = document.getElementById('post-' + postId); if (!el) return;
  const { data: p } = await sb.from('posts').select('*').eq('id', postId).single(); if (!p) { el.remove(); return; }
  const [one] = await fetchPostsByIds([p]); el.outerHTML = postCard(one);
}
async function fetchPostsByIds(posts){
  const ids = posts.map(p => p.id);
  await cacheProfiles(posts.map(p => p.user_id));
  const [likes, comments, myLikes, mySaves, pollVotes] = await Promise.all([
    sb.from('likes').select('post_id').in('post_id', ids),
    sb.from('comments').select('post_id').in('post_id', ids),
    sb.from('likes').select('post_id').eq('user_id', me.id).in('post_id', ids),
    sb.from('saves').select('post_id').eq('user_id', me.id).in('post_id', ids),
    sb.from('poll_votes').select('*').in('post_id', ids)
  ]);
  const lc = {}, cc = {}, pv = {};
  (likes.data || []).forEach(r => lc[r.post_id] = (lc[r.post_id] || 0) + 1);
  (comments.data || []).forEach(r => cc[r.post_id] = (cc[r.post_id] || 0) + 1);
  (pollVotes.data || []).forEach(r => { (pv[r.post_id] = pv[r.post_id] || []).push(r); });
  const myL = new Set((myLikes.data || []).map(r => r.post_id));
  const myS = new Set((mySaves.data || []).map(r => r.post_id));
  posts.forEach(p => { p._likes = lc[p.id] || 0; p._comments = cc[p.id] || 0; p._liked = myL.has(p.id); p._saved = myS.has(p.id); p._votes = pv[p.id] || []; p._myVote = (pv[p.id] || []).find(v => v.user_id === me.id); });
  return posts;
}
async function votePoll(postId, idx){
  const { data: mine } = await sb.from('poll_votes').select('*').eq('post_id', postId).eq('user_id', me.id).maybeSingle();
  if (mine) { toast('তুমি ইতিমধ্যে ভোট দিয়েছ'); return; }
  await sb.from('poll_votes').insert({ post_id: postId, user_id: me.id, option_idx: idx });
  refreshPost(postId);
}
async function openComments(postId){
  const { data: post } = await sb.from('posts').select('user_id').eq('id', postId).single();
  const { data: comments } = await sb.from('comments').select('*').eq('post_id', postId).order('created_at');
  await cacheProfiles((comments || []).map(c => c.user_id));
  sheet(`<h3>মন্তব্য</h3>
    <div id="clist">${(comments || []).map(c => { const a = prof(c.user_id); return `<div class="row">${avatar(a, 34, 13)}<div style="flex:1"><b>${esc(a.name)}</b>${badges(a)}<small style="display:block;color:var(--ink2);font-size:13.5px">${esc(c.body)}</small><small>${timeAgo(c.created_at)}</small></div></div>`; }).join('') || '<div class="empty">এখনো কোনো মন্তব্য নেই — প্রথমটা তুমিই করো</div>'}</div>
    <div style="display:flex;gap:8px;margin-top:12px"><input class="field" style="margin:0;flex:1" id="cinput" placeholder="মন্তব্য লেখো..."><button class="btn" onclick="addComment('${postId}','${post ? post.user_id : ''}')">পাঠাও</button></div>`);
  $('#cinput').focus();
}
async function addComment(postId, ownerId){
  const body = $('#cinput').value.trim(); if (!body) return;
  const { error } = await sb.from('comments').insert({ post_id: postId, user_id: me.id, body });
  if (error) { toast('মন্তব্য যায়নি'); return; }
  if (ownerId) notify(ownerId, 'comment', postId);
  sb.rpc('rpc_award', { p_reason: 'comment' });
  openComments(postId); refreshPost(postId);
}
function postMenu(postId){
  sheet(`<h3>পোস্টের অপশন</h3><div id="pmenu">লোড হচ্ছে...</div>`);
  sb.from('posts').select('*').eq('id', postId).single().then(async ({ data: p }) => {
    if (!p) { closeSheet(); return; }
    const mine = p.user_id === me.id;
    const boosted = p.boost_until && new Date(p.boost_until) > new Date();
    $('#pmenu').innerHTML = `
      ${mine ? `<button class="menu-item" onclick="editPost('${p.id}')">✏️ পোস্ট এডিট করো</button>
      ${!boosted ? `<button class="menu-item" onclick="boostPost('${p.id}')">🚀 বুস্ট করো (৫০ টোকেন, ২৪ ঘণ্টা)</button>` : '<div class="menu-item">🚀 এই পোস্ট বুস্ট অবস্থায় আছে</div>'}
      <button class="menu-item" style="color:var(--danger)" onclick="deletePost('${p.id}')">🗑 পোস্ট মুছে ফেলো</button>`
      : `<button class="menu-item" onclick="reportItem('post','${p.id}')">🚩 রিপোর্ট করো</button>
         <button class="menu-item" style="color:var(--danger)" onclick="blockUser('${p.user_id}')">🚫 এই ব্যবহারকারীকে ব্লক করো</button>`}
      <button class="menu-item" onclick="closeSheet()">বন্ধ করো</button>`;
  });
}
async function editPost(postId){
  const { data: p } = await sb.from('posts').select('*').eq('id', postId).single();
  sheet(`<h3>পোস্ট এডিট</h3><textarea class="field" id="editBody">${esc(p.body)}</textarea>
    <button class="btn block" onclick="saveEdit('${postId}')">সংরক্ষণ করো</button>`);
}
async function saveEdit(postId){
  await sb.from('posts').update({ body: $('#editBody').value }).eq('id', postId);
  closeSheet(); refreshPost(postId); toast('পোস্ট আপডেট হয়েছে');
}
async function deletePost(postId){
  await sb.from('posts').delete().eq('id', postId);
  closeSheet(); const el = document.getElementById('post-' + postId); if (el) el.remove(); toast('পোস্ট মুছে গেছে');
}
async function boostPost(postId){
  const { error } = await sb.rpc('rpc_spend', { p_item: 'boost', p_target: postId });
  if (error) { toast('টোকেন যথেষ্ট নেই'); return; }
  me.tokens -= 50; closeSheet(); refreshPost(postId); toast('পোস্ট ২৪ ঘণ্টার জন্য বুস্ট হয়েছে 🚀');
}
async function reportItem(type, id){
  await sb.from('reports').insert({ reporter: me.id, target_type: type, target_id: id, reason: '' });
  closeSheet(); toast('রিপোর্ট পাঠানো হয়েছে — ধন্যবাদ');
}
async function blockUser(uid){
  await sb.from('blocks').insert({ blocker: me.id, blocked: uid });
  blockedIds.add(uid); closeSheet(); toast('ব্লক করা হয়েছে'); go(curView === 'feed' ? 'feed' : curView);
}

/* ---------- COMPOSER ---------- */
function openComposer(groupId = null){
  sheet(`<h3>${groupId ? 'গ্রুপে পোস্ট' : 'নতুন পোস্ট'}</h3>
    <textarea class="field" id="postBody" placeholder="মনে কী চলছে, ${esc(me.name.split(' ')[0])}?"></textarea>
    <div style="display:flex;gap:8px"><input class="field" style="flex:1" id="postFeeling" placeholder="অনুভূতি (ঐচ্ছিক)"><input class="field" style="flex:1" id="postLoc" placeholder="জায়গা (ঐচ্ছিক)"></div>
    <label style="display:flex;gap:8px;align-items:center;font-size:13.5px;color:var(--mut);margin:4px 0 10px">${I.img} ছবি যোগ করো <input type="file" id="postImg" accept="image/*" style="font-size:12px"></label>
    <div id="pollBox" style="display:none">
      <input class="field poll-opt" placeholder="অপশন ১"><input class="field poll-opt" placeholder="অপশন ২">
      <input class="field poll-opt" placeholder="অপশন ৩ (ঐচ্ছিক)"><input class="field poll-opt" placeholder="অপশন ৪ (ঐচ্ছিক)">
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost" style="flex:1" onclick="document.getElementById('pollBox').style.display='block'">📊 পোল যোগ করো</button>
      <button class="btn" style="flex:2" onclick="submitPost(${groupId ? `'${groupId}'` : 'null'})">পোস্ট করো</button>
    </div>`);
  $('#postBody').focus();
}
async function submitPost(groupId){
  const body = $('#postBody').value.trim();
  const opts = [...document.querySelectorAll('.poll-opt')].map(i => i.value.trim()).filter(Boolean);
  const file = $('#postImg').files[0];
  if (!body && !file && opts.length < 2) { toast('কিছু লেখো, ছবি দাও বা পোল বানাও'); return; }
  const image_url = file ? await uploadImage(file) : '';
  const poll = opts.length >= 2 ? { options: opts } : null;
  const { error } = await sb.from('posts').insert({ user_id: me.id, body, image_url, feeling: $('#postFeeling').value.trim(), location: $('#postLoc').value.trim(), poll, group_id: groupId });
  if (error) { toast('পোস্ট হয়নি, আবার চেষ্টা করো'); return; }
  sb.rpc('rpc_award', { p_reason: 'post' }).then(({ data }) => { if (typeof data === 'number') { me.tokens = data; const b = document.getElementById('feedTokens'); if (b) b.textContent = '🪙 টোকেন: ' + bn(me.tokens); } });
  closeSheet(); toast('পোস্ট হয়েছে ✓ (+১৫ টোকেন)');
  if (groupId) renderGroupDetail(groupId); else if (curView === 'feed') renderFeed(); else if (curView === 'profile') renderProfile(me.id);
}

/* ---------- FEED ---------- */
async function renderFeed(tagFilter = null){
  curView = 'feed'; renderShell();
  view().innerHTML = `<div class="view">
    <div class="stories" id="storiesRow">
      <button class="story" onclick="goProfile('${me.id}')"><span class="ring"><i>${me.avatar_url ? `<img src="${esc(me.avatar_url)}">` : esc(me.name[0] || 'অ')}</i></span>তুমি</button>
    </div>
    <button class="composer" onclick="openComposer()">${avatar(me, 38, 15)}<span class="fake">মনে কী চলছে?</span><span style="color:var(--acc);display:flex">${I.img}</span></button>
    <div style="display:flex;gap:8px;padding:12px 12px 0">
      <button class="btn ghost sm" style="flex:1" onclick="go('groups')">👥 গ্রুপ</button>
      <button class="btn ghost sm" style="flex:1" onclick="go('dating')">💘 মনের মানুষ</button>
    </div>
    ${tagFilter ? `<div style="padding:12px 16px 0;font-size:14px">ট্যাগ: <b>#${esc(tagFilter)}</b> <a href="#" onclick="renderFeed();return false">✕ সব দেখো</a></div>` : ''}
    <div id="feedList"><div class="empty">লোড হচ্ছে...</div></div></div>`;
  const friends = [...friendIds].slice(0, 12);
  await cacheProfiles(friends);
  const srow = $('#storiesRow');
  if (srow) srow.insertAdjacentHTML('beforeend', friends.map(id => { const p = prof(id); return `<button class="story" onclick="goProfile('${id}')"><span class="ring"><i>${p.avatar_url ? `<img src="${esc(p.avatar_url)}">` : esc(p.name[0] || '?')}</i></span>${esc(p.name.split(' ')[0])}</button>`; }).join(''));
  let posts = await fetchPosts(tagFilter ? { tag: tagFilter } : {});
  posts.sort((a, b) => feedScore(b) - feedScore(a));
  $('#feedList').innerHTML = posts.length ? posts.map(postCard).join('') : `<div class="card empty">এখনো কোনো পোস্ট নেই।<br>প্রথম পোস্টটা তুমিই করো — পাবে ১৫ টোকেন!</div>`;
}
function openTag(tag){ curView = 'feed'; renderFeed(tag); }

/* ---------- FRIENDS ---------- */
let friendsTab = 'suggest';
async function renderFriends(tab = 'suggest'){
  curView = 'friends'; friendsTab = tab; renderShell();
  view().innerHTML = `<div class="view">
    <div style="padding:14px 16px 0;font-size:18px;font-weight:800">বন্ধুরা</div>
    <div class="seg">
      <button class="${tab === 'suggest' ? 'on' : ''}" onclick="renderFriends('suggest')">পরামর্শ</button>
      <button class="${tab === 'requests' ? 'on' : ''}" onclick="renderFriends('requests')">অনুরোধ</button>
      <button class="${tab === 'mine' ? 'on' : ''}" onclick="renderFriends('mine')">আমার বন্ধু</button>
    </div>
    <div id="friendsBody"><div class="empty">লোড হচ্ছে...</div></div></div>`;
  const body = $('#friendsBody');
  if (tab === 'suggest') {
    const { data: all } = await sb.from('profiles').select('*').neq('id', me.id).limit(60);
    const { data: rels } = await sb.from('friendships').select('*').or(`requester.eq.${me.id},addressee.eq.${me.id}`);
    const related = new Set(); (rels || []).forEach(r => { related.add(r.requester); related.add(r.addressee); });
    const list = (all || []).filter(p => !related.has(p.id) && !blockedIds.has(p.id));
    body.innerHTML = `<div class="card" style="padding:6px 15px">${list.length ? list.map(p => userRow(p, `<button class="btn sm" onclick="sendFriendReq('${p.id}',this)">বন্ধু যোগ করো</button>`)).join('') : '<div class="empty">আপাতত নতুন কেউ নেই</div>'}</div>`;
  } else if (tab === 'requests') {
    const { data: reqs } = await sb.from('friendships').select('*').eq('addressee', me.id).eq('status', 'pending').order('created_at', { ascending: false });
    await cacheProfiles((reqs || []).map(r => r.requester));
    body.innerHTML = `<div class="card" style="padding:6px 15px">${(reqs || []).length ? reqs.map(r => { const p = prof(r.requester); return userRow(p, `<button class="btn sm" onclick="respondReq('${r.id}',true,this)">গ্রহণ</button> <button class="btn ghost sm" onclick="respondReq('${r.id}',false,this)">মুছো</button>`); }).join('') : '<div class="empty">কোনো অনুরোধ নেই</div>'}</div>`;
  } else {
    await cacheProfiles([...friendIds]);
    const list = [...friendIds].map(prof);
    body.innerHTML = `<div class="card" style="padding:6px 15px">${list.length ? list.map(p => userRow(p, `<button class="btn ghost sm" onclick="startChat('${p.id}')">মেসেজ</button>`)).join('') : '<div class="empty">এখনো কোনো বন্ধু নেই — পরামর্শ ট্যাব থেকে যোগ করো</div>'}</div>`;
  }
}
function userRow(p, actionHtml){
  return `<div class="row"><a href="#" onclick="goProfile('${p.id}');return false">${avatar(p, 46, 17)}</a>
    <div style="flex:1;min-width:0"><b><a href="#" style="color:var(--ink)" onclick="goProfile('${p.id}');return false">${esc(p.name)}</a>${badges(p)}</b>
    <small>${p.city ? '📍 ' + esc(p.city) + ' · ' : ''}${p.id === me.id ? 'তুমি' : (friendIds.has(p.id) ? 'বন্ধু' : 'নতুন মানুষ')}</small></div>
    <div style="display:flex;gap:6px">${actionHtml}</div></div>`;
}
async function sendFriendReq(uid, btn){
  const { error } = await sb.from('friendships').insert({ requester: me.id, addressee: uid });
  if (error) { toast('পাঠানো যায়নি'); return; }
  notify(uid, 'friend_request'); btn.textContent = 'পাঠানো হয়েছে ✓'; btn.disabled = true; btn.classList.add('ghost');
}
async function respondReq(id, accept, btn){
  if (accept) {
    const { data: r } = await sb.from('friendships').update({ status: 'accepted' }).eq('id', id).select().single();
    if (r) { friendIds.add(r.requester); notify(r.requester, 'friend_accept'); toast('নতুন বন্ধু যোগ হয়েছে 🎉'); }
  } else await sb.from('friendships').delete().eq('id', id);
  renderFriends('requests');
}
async function unfriend(uid){
  await sb.from('friendships').delete().or(`and(requester.eq.${me.id},addressee.eq.${uid}),and(requester.eq.${uid},addressee.eq.${me.id})`);
  friendIds.delete(uid); toast('বন্ধু তালিকা থেকে সরানো হয়েছে'); renderProfile(uid);
}
async function toggleFollow(uid, btn){
  if (followIds.has(uid)) { await sb.from('follows').delete().eq('follower', me.id).eq('following', uid); followIds.delete(uid); }
  else { await sb.from('follows').insert({ follower: me.id, following: uid }); followIds.add(uid); notify(uid, 'follow'); }
  renderProfile(uid);
}

/* ---------- TRENDING ---------- */
async function renderTrending(){
  curView = 'trending'; renderShell();
  view().innerHTML = `<div class="view"><div style="padding:14px 16px 0;font-size:18px;font-weight:800">ট্রেন্ডিং</div>
    <div class="card" id="trendTags" style="padding:6px 15px"><div class="empty">লোড হচ্ছে...</div></div>
    <div class="seclabel">জনপ্রিয় পোস্ট</div><div id="trendPosts"></div></div>`;
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: posts } = await sb.from('posts').select('body').gte('created_at', since).limit(300);
  const counts = {};
  (posts || []).forEach(p => { const m = (p.body || '').match(/#([\p{L}\p{N}_]+)/gu) || []; m.forEach(t => counts[t] = (counts[t] || 0) + 1); });
  const tags = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  $('#trendTags').innerHTML = tags.length ? tags.map(([t, c], i) => `<button class="trend" onclick="openTag('${esc(t.slice(1))}')"><span class="rank ${i < 2 ? 'hot' : ''}">${bn(i + 1)}</span><span style="flex:1"><b>${esc(t)}</b><small>বাংলাদেশে ট্রেন্ডিং · ${bn(c)}টি পোস্ট</small></span><span style="color:var(--faint)">${I.fire.replace('currentColor','')}</span></button>`).join('') : '<div class="empty">এই সপ্তাহে এখনো কোনো হ্যাশট্যাগ ট্রেন্ড হয়নি — পোস্টে #ট্যাগ ব্যবহার করো!</div>';
  let pop = await fetchPosts({});
  pop.sort((a, b) => (b._likes * 3 + b._comments * 5) - (a._likes * 3 + a._comments * 5));
  $('#trendPosts').innerHTML = pop.slice(0, 10).map(postCard).join('') || '<div class="card empty">এখনো পোস্ট নেই</div>';
}

/* ---------- SEARCH ---------- */
function renderSearch(){
  curView = 'search'; renderShell();
  view().innerHTML = `<div class="view">
    <div class="searchbar">🔍<input id="q" placeholder="মানুষ, পোস্ট বা গ্রুপ খোঁজো..." oninput="doSearch(this.value)"></div>
    <div id="searchRes"><div class="empty">নাম, জায়গা বা যেকোনো শব্দ লিখে খোঁজো</div></div></div>`;
  $('#q').focus();
}
let searchTimer = null;
function doSearch(q){
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    q = q.trim(); const box = $('#searchRes'); if (!box) return;
    if (q.length < 2) { box.innerHTML = '<div class="empty">কমপক্ষে ২ অক্ষর লেখো</div>'; return; }
    const [people, posts, groups] = await Promise.all([
      sb.from('profiles').select('*').or(`name.ilike.%${q}%,city.ilike.%${q}%`).limit(10),
      sb.from('posts').select('*').ilike('body', `%${q}%`).is('group_id', null).order('created_at', { ascending: false }).limit(10),
      sb.from('groups').select('*').ilike('name', `%${q}%`).limit(10)
    ]);
    await cacheProfiles((posts.data || []).map(p => p.user_id));
    const enriched = posts.data ? await fetchPostsByIds(posts.data) : [];
    box.innerHTML = `
      ${(people.data || []).length ? `<div class="seclabel">মানুষ</div><div class="card" style="padding:6px 15px">${people.data.map(p => userRow(p, p.id === me.id ? '' : `<button class="btn ghost sm" onclick="goProfile('${p.id}')">প্রোফাইল</button>`)).join('')}</div>` : ''}
      ${(groups.data || []).length ? `<div class="seclabel">গ্রুপ</div><div class="card" style="padding:6px 15px">${groups.data.map(g => groupRow(g)).join('')}</div>` : ''}
      ${enriched.length ? `<div class="seclabel">পোস্ট</div>${enriched.map(postCard).join('')}` : ''}
      ${!(people.data || []).length && !(groups.data || []).length && !enriched.length ? '<div class="empty">কিছু পাওয়া যায়নি</div>' : ''}`;
  }, 300);
}

/* ---------- NOTIFICATIONS ---------- */
const NOTIF_TEXT = { like: 'তোমার পোস্টে লাইক দিয়েছে', comment: 'তোমার পোস্টে মন্তব্য করেছে', friend_request: 'তোমাকে বন্ধুর অনুরোধ পাঠিয়েছে', friend_accept: 'তোমার বন্ধুর অনুরোধ গ্রহণ করেছে', follow: 'তোমাকে ফলো করেছে', gift: 'তোমাকে ১০০ টোকেন উপহার পাঠিয়েছে', match: 'তোমার সাথে ম্যাচ হয়েছে 💘', message: 'তোমাকে মেসেজ পাঠিয়েছে' };
async function renderNotifs(){
  curView = 'notifs'; renderShell();
  view().innerHTML = `<div class="view"><div style="padding:14px 16px;font-size:18px;font-weight:800">নোটিফিকেশন</div><div id="notifList"><div class="empty">লোড হচ্ছে...</div></div></div>`;
  const { data } = await sb.from('notifications').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(40);
  await cacheProfiles((data || []).map(n => n.actor_id));
  $('#notifList').innerHTML = (data || []).length ? data.map(n => { const a = prof(n.actor_id); return `<div class="notif ${n.is_read ? '' : 'unread'}">${avatar(a, 42, 16)}<div><p><b>${esc(a.name)}</b> ${NOTIF_TEXT[n.type] || 'নতুন আপডেট'}</p><small>${timeAgo(n.created_at)}</small></div></div>`; }).join('') : '<div class="empty">কোনো নোটিফিকেশন নেই</div>';
  await sb.from('notifications').update({ is_read: true }).eq('user_id', me.id).eq('is_read', false);
  unreadNotifs = 0; renderShell();
}

/* ---------- PROFILE ---------- */
async function goProfile(uid){ curView = 'profile'; renderProfile(uid); }
async function renderProfile(uid){
  curView = 'profile'; renderShell();
  const { data: p } = await sb.from('profiles').select('*').eq('id', uid).single();
  if (!p) { view().innerHTML = '<div class="empty">প্রোফাইল পাওয়া যায়নি</div>'; return; }
  profilesCache[uid] = p; const mine = uid === me.id;
  const [friendsRes, postsRes, followersRes] = await Promise.all([
    sb.from('friendships').select('id').eq('status', 'accepted').or(`requester.eq.${uid},addressee.eq.${uid}`),
    sb.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    sb.from('follows').select('follower').eq('following', uid)
  ]);
  const friendCount = (friendsRes.data || []).length;
  view().innerHTML = `<div class="view">
    <div class="cover" ${p.cover_url ? `style="background-image:url('${esc(p.cover_url)}')"` : ''}></div>
    <div class="prof">
      <div class="big">${p.avatar_url ? `<img src="${esc(p.avatar_url)}">` : esc(p.name[0] || '?')}</div>
      <div style="font-size:20px;font-weight:800">${esc(p.name)}${badges(p)}</div>
      <p style="color:var(--mut);font-size:13px;margin-top:3px">${p.city ? '📍 ' + esc(p.city) + ' · ' : ''}${bn(friendCount)} জন বন্ধু</p>
      ${p.bio ? `<p style="font-size:13.5px;color:var(--ink2);margin-top:7px;line-height:1.6">${esc(p.bio)}</p>` : ''}
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      ${mine ? `<button class="btn" onclick="editProfile()">প্রোফাইল এডিট</button>
        <button class="btn ghost" onclick="go('settings')">⚙️ সেটিংস</button>`
      : `${friendIds.has(uid) ? `<button class="btn ghost" onclick="unfriend('${uid}')">বন্ধু ✓</button>` : `<button class="btn" onclick="sendFriendReq('${uid}',this)">বন্ধু যোগ করো</button>`}
        <button class="btn ${followIds.has(uid) ? 'ghost' : ''}" onclick="toggleFollow('${uid}',this)">${followIds.has(uid) ? 'ফলো করছ ✓' : 'ফলো করো'}</button>
        <button class="btn" onclick="startChat('${uid}')">মেসেজ</button>
        <button class="btn ghost" onclick="giftTokens('${uid}')">🎁 উপহার (১০০)</button>`}
      </div></div>
    <div class="stats"><div><b>${bn(postsRes.count || 0)}</b><small>পোস্ট</small></div><div><b>${bn(friendCount)}</b><small>বন্ধু</small></div><div><b>${bn((followersRes.data || []).length)}</b><small>ফলোয়ার</small></div></div>
    <div class="seclabel">পোস্টসমূহ</div><div id="profPosts"><div class="empty">লোড হচ্ছে...</div></div></div>`;
  const posts = await fetchPosts({ authorId: uid });
  $('#profPosts').innerHTML = posts.length ? posts.map(postCard).join('') : '<div class="card empty">এখনো কোনো পোস্ট নেই</div>';
}
async function giftTokens(uid){
  const { error } = await sb.rpc('rpc_spend', { p_item: 'gift', p_target: uid });
  if (error) { toast('টোকেন যথেষ্ট নেই (লাগবে ১০০)'); return; }
  me.tokens -= 100; notify(uid, 'gift'); toast('১০০ টোকেন উপহার পাঠানো হয়েছে 🎁');
}
function toggleTheme(){
  const dark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('adda-theme', dark ? 'dark' : 'light');
}
function editProfile(){
  sheet(`<h3>প্রোফাইল এডিট</h3>
    <input class="field" id="epName" value="${esc(me.name)}" placeholder="নাম">
    <input class="field" id="epCity" value="${esc(me.city || '')}" placeholder="শহর (যেমন: ঢাকা)">
    <textarea class="field" id="epBio" placeholder="নিজের সম্পর্কে দু-এক লাইন">${esc(me.bio || '')}</textarea>
    <label style="display:block;font-size:13.5px;color:var(--mut);margin:2px 0 4px">প্রোফাইল ছবি <input type="file" id="epAvatar" accept="image/*" style="font-size:12px"></label>
    <label style="display:block;font-size:13.5px;color:var(--mut);margin:6px 0 12px">কভার ছবি <input type="file" id="epCover" accept="image/*" style="font-size:12px"></label>
    <button class="btn block" onclick="saveProfile()">সংরক্ষণ করো</button>`);
}
async function saveProfile(){
  const upd = { name: $('#epName').value.trim() || me.name, city: $('#epCity').value.trim(), bio: $('#epBio').value.trim() };
  const af = $('#epAvatar').files[0]; if (af) upd.avatar_url = await uploadImage(af);
  const cf = $('#epCover').files[0]; if (cf) upd.cover_url = await uploadImage(cf);
  const { data, error } = await sb.from('profiles').update(upd).eq('id', me.id).select().single();
  if (error) { toast('সংরক্ষণ হয়নি'); return; }
  me = data; profilesCache[me.id] = me; closeSheet(); toast('প্রোফাইল আপডেট হয়েছে ✓'); renderProfile(me.id);
}
async function renderSaved(){
  curView = 'saved'; renderShell();
  view().innerHTML = `<div class="view"><div style="padding:14px 16px;font-size:18px;font-weight:800">সেভ করা পোস্ট</div><div id="savedList"><div class="empty">লোড হচ্ছে...</div></div></div>`;
  const posts = await fetchPosts({ savedOnly: true });
  $('#savedList').innerHTML = posts.length ? posts.map(postCard).join('') : '<div class="card empty">কোনো সেভ করা পোস্ট নেই</div>';
}

/* ---------- GROUPS ---------- */
const GCATS = [['#4F46E5','🎓'],['#059669','⚽'],['#DB2777','🎵'],['#D97706','🍜'],['#0891B2','💻'],['#7C3AED','📚']];
async function renderGroups(){
  curView = 'groups'; renderShell();
  view().innerHTML = `<div class="view"><div style="padding:14px 16px 0;font-size:18px;font-weight:800">গ্রুপ</div>
    <div style="padding:12px 12px 0"><button class="btn block" onclick="createGroupSheet()">+ নতুন গ্রুপ বানাও</button></div>
    <div class="card" id="groupList" style="padding:6px 15px"><div class="empty">লোড হচ্ছে...</div></div></div>`;
  const { data: groups } = await sb.from('groups').select('*').order('created_at', { ascending: false }).limit(60);
  const { data: members } = await sb.from('group_members').select('group_id');
  const counts = {}; (members || []).forEach(m => counts[m.group_id] = (counts[m.group_id] || 0) + 1);
  const { data: mine } = await sb.from('group_members').select('group_id').eq('user_id', me.id);
  window._myGroups = new Set((mine || []).map(m => m.group_id));
  $('#groupList').innerHTML = (groups || []).length ? groups.map(g => groupRow(g, counts[g.id] || 0)).join('') : '<div class="empty">এখনো কোনো গ্রুপ নেই — প্রথমটা তুমিই বানাও!</div>';
}
function groupRow(g, memberCount){
  const [col, em] = GCATS[(g.name || '').length % GCATS.length];
  const joined = window._myGroups && window._myGroups.has(g.id);
  return `<div class="grp"><span class="gic" style="background:${col}">${em}</span>
    <div style="flex:1;min-width:0"><b style="font-size:14.5px">${esc(g.name)}</b><small style="display:block;color:var(--faint);font-size:11.5px">${esc(g.category || 'সাধারণ')} · ${memberCount !== undefined ? bn(memberCount) + ' সদস্য' : ''}</small></div>
    <button class="btn ${joined ? 'ghost' : ''} sm" onclick="openGroup('${g.id}')">${joined ? 'খোলো' : 'যোগ দাও'}</button></div>`;
}
function createGroupSheet(){
  sheet(`<h3>নতুন গ্রুপ</h3>
    <input class="field" id="gName" placeholder="গ্রুপের নাম">
    <input class="field" id="gCat" placeholder="বিষয় (যেমন: পড়াশোনা, খেলা, গান)">
    <textarea class="field" id="gAbout" placeholder="গ্রুপ সম্পর্কে এক লাইন"></textarea>
    <button class="btn block" onclick="createGroup()">গ্রুপ বানাও</button>`);
}
async function createGroup(){
  const name = $('#gName').value.trim(); if (!name) { toast('গ্রুপের নাম দাও'); return; }
  const { data: g, error } = await sb.from('groups').insert({ name, category: $('#gCat').value.trim(), about: $('#gAbout').value.trim(), created_by: me.id }).select().single();
  if (error) { toast('গ্রুপ তৈরি হয়নি'); return; }
  await sb.from('group_members').insert({ group_id: g.id, user_id: me.id });
  closeSheet(); toast('গ্রুপ তৈরি হয়েছে 🎉'); openGroup(g.id);
}
async function openGroup(gid){
  const { data: isMember } = await sb.from('group_members').select('group_id').eq('group_id', gid).eq('user_id', me.id).maybeSingle();
  if (!isMember) {
    await sb.from('group_members').insert({ group_id: gid, user_id: me.id });
    toast('গ্রুপে যোগ দিয়েছ ✓');
  }
  renderGroupDetail(gid);
}
async function renderGroupDetail(gid){
  curView = 'groups'; renderShell();
  const { data: g } = await sb.from('groups').select('*').eq('id', gid).single();
  if (!g) { renderGroups(); return; }
  const { data: members } = await sb.from('group_members').select('user_id').eq('group_id', gid);
  view().innerHTML = `<div class="view">
    <div style="padding:14px 16px 0"><a href="#" onclick="renderGroups();return false" style="font-size:13.5px">← সব গ্রুপ</a>
    <div style="font-size:20px;font-weight:800;margin-top:6px">${esc(g.name)}</div>
    <p style="color:var(--mut);font-size:13px;margin-top:2px">${esc(g.category || '')} · ${bn((members || []).length)} সদস্য</p>
    ${g.about ? `<p style="font-size:13.5px;margin-top:6px;line-height:1.6">${esc(g.about)}</p>` : ''}
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn" style="flex:1" onclick="openComposer('${gid}')">গ্রুপে পোস্ট করো</button>
      <button class="btn ghost" style="flex:1" onclick="openGroupChat('${gid}')">গ্রুপ চ্যাট</button>
      <button class="btn ghost" onclick="leaveGroup('${gid}')">ছাড়ো</button>
    </div></div>
    <div class="seclabel">গ্রুপের পোস্ট</div><div id="groupPosts"><div class="empty">লোড হচ্ছে...</div></div></div>`;
  const posts = await fetchPosts({ groupId: gid });
  $('#groupPosts').innerHTML = posts.length ? posts.map(postCard).join('') : '<div class="card empty">এই গ্রুপে এখনো পোস্ট নেই</div>';
}
async function leaveGroup(gid){
  await sb.from('group_members').delete().eq('group_id', gid).eq('user_id', me.id);
  toast('গ্রুপ ছেড়েছ'); renderGroups();
}

/* ---------- CHAT ---------- */
async function renderChatList(){
  curView = 'chat'; renderShell();
  view().innerHTML = `<div class="view"><div style="padding:14px 16px;font-size:18px;font-weight:800">চ্যাট</div><div id="chatList"><div class="empty">লোড হচ্ছে...</div></div></div>`;
  const { data: myConvs } = await sb.from('conversation_members').select('conversation_id').eq('user_id', me.id);
  const ids = (myConvs || []).map(r => r.conversation_id);
  if (!ids.length) { $('#chatList').innerHTML = '<div class="empty">এখনো কোনো চ্যাট নেই।<br>বন্ধুর প্রোফাইল থেকে "মেসেজ" চাপ দিলেই চ্যাট শুরু হবে।</div>'; return; }
  const [{ data: convs }, { data: members }, { data: msgs }] = await Promise.all([
    sb.from('conversations').select('*').in('id', ids),
    sb.from('conversation_members').select('*').in('conversation_id', ids),
    sb.from('messages').select('*').in('conversation_id', ids).order('created_at', { ascending: false }).limit(200)
  ]);
  await cacheProfiles((members || []).map(m => m.user_id));
  const groupIds = (convs || []).map(c => c.group_id).filter(Boolean);
  const groupMap = {};
  if (groupIds.length) { const { data: gs } = await sb.from('groups').select('*').in('id', groupIds); (gs || []).forEach(g => groupMap[g.id] = g); }
  const lastMsg = {}; (msgs || []).forEach(m => { if (!lastMsg[m.conversation_id]) lastMsg[m.conversation_id] = m; });
  const rows = (convs || []).map(c => {
    const others = (members || []).filter(m => m.conversation_id === c.id && m.user_id !== me.id);
    const lm = lastMsg[c.id];
    let title, avHtml;
    if (c.is_group && c.group_id && groupMap[c.group_id]) { const g = groupMap[c.group_id]; title = g.name + ' (গ্রুপ)'; avHtml = `<span class="av" style="background:#4F46E5;width:47px;height:47px;font-size:17px">👥</span>`; }
    else if (others.length) { const p = prof(others[0].user_id); title = p.name; avHtml = avatar(p, 47, 17); }
    else { title = 'চ্যাট'; avHtml = avatar(null, 47, 17); }
    return { c, title, avHtml, lm };
  }).sort((a, b) => new Date(b.lm?.created_at || b.c.created_at) - new Date(a.lm?.created_at || a.c.created_at));
  $('#chatList').innerHTML = rows.map(({ c, title, avHtml, lm }) => `<button class="chatrow" onclick="openChat('${c.id}')"><span class="avw">${avHtml}</span><span style="flex:1;min-width:0"><b>${esc(title)}</b><small>${lm ? esc(lm.body) : 'চ্যাট শুরু করো'}</small></span><small style="color:var(--faint);font-size:11px">${lm ? timeAgo(lm.created_at) : ''}</small></button>`).join('');
}
async function findOrCreateDM(uid){
  const { data: mine } = await sb.from('conversation_members').select('conversation_id').eq('user_id', me.id);
  const myIds = (mine || []).map(r => r.conversation_id);
  if (myIds.length) {
    const { data: theirs } = await sb.from('conversation_members').select('conversation_id').eq('user_id', uid).in('conversation_id', myIds);
    for (const t of (theirs || [])) {
      const { data: conv } = await sb.from('conversations').select('*').eq('id', t.conversation_id).single();
      if (conv && !conv.is_group) return conv.id;
    }
  }
  const newId = crypto.randomUUID();
  const { error } = await sb.from('conversations').insert({ id: newId, is_group: false });
  if (error) return null;
  await sb.from('conversation_members').insert([{ conversation_id: newId, user_id: me.id }, { conversation_id: newId, user_id: uid }]);
  return newId;
}
async function startChat(uid){
  const id = await findOrCreateDM(uid);
  if (id) openChat(id); else toast('চ্যাট খোলা যায়নি');
}
async function openGroupChat(gid){
  const { data: existing } = await sb.from('conversations').select('id').eq('group_id', gid).maybeSingle();
  if (existing) { openChat(existing.id); return; }
  const newId = crypto.randomUUID();
  const { error } = await sb.from('conversations').insert({ id: newId, is_group: true, group_id: gid });
  if (error) { toast('গ্রুপ চ্যাট খোলা যায়নি'); return; }
  const { data: members } = await sb.from('group_members').select('user_id').eq('group_id', gid);
  await sb.from('conversation_members').insert((members || []).map(m => ({ conversation_id: newId, user_id: m.user_id })));
  openChat(newId);
}
async function openChat(convId){
  curView = 'chat'; activeChat = convId; renderShell();
  const { data: conv } = await sb.from('conversations').select('*').eq('id', convId).single();
  const { data: members } = await sb.from('conversation_members').select('user_id').eq('conversation_id', convId);
  await cacheProfiles((members || []).map(m => m.user_id));
  let title = 'চ্যাট', headAv = '';
  if (conv && conv.is_group && conv.group_id) {
    const { data: g } = await sb.from('groups').select('name').eq('id', conv.group_id).single();
    title = (g ? g.name : 'গ্রুপ') + ' · গ্রুপ চ্যাট'; headAv = `<span class="av" style="background:#4F46E5;width:38px;height:38px;font-size:15px">👥</span>`;
  } else {
    const other = (members || []).find(m => m.user_id !== me.id);
    if (other) { const p = prof(other.user_id); title = p.name; headAv = avatar(p, 38, 15); }
  }
  view().innerHTML = `<div class="view">
    <div style="display:flex;gap:10px;align-items:center;padding:12px 16px;background:var(--card);border-bottom:1px solid var(--line2);position:sticky;top:57px;z-index:5">
      <button class="icb" style="width:34px;height:34px" onclick="renderChatList()">←</button>${headAv}<b style="font-size:15.5px">${esc(title)}</b></div>
    <div id="msgList" style="padding:10px 0 4px"><div class="empty">লোড হচ্ছে...</div></div>
    <div class="chatbar"><input id="msgInput" placeholder="মেসেজ লেখো..." onkeydown="if(event.key==='Enter')sendMsg('${convId}')"><button class="send" onclick="sendMsg('${convId}')">${I.send}</button></div></div>`;
  const { data: msgs } = await sb.from('messages').select('*').eq('conversation_id', convId).order('created_at').limit(200);
  $('#msgList').innerHTML = (msgs || []).length ? msgs.map(msgHtml).join('') : '<div class="empty">প্রথম মেসেজটা পাঠাও 👋</div>';
  window.scrollTo(0, document.body.scrollHeight);
  if (chatChannel) sb.removeChannel(chatChannel);
  chatChannel = sb.channel('chat-' + convId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + convId }, payload => {
      if (activeChat !== convId) return;
      const box = $('#msgList'); if (!box) return;
      if (box.querySelector('.empty')) box.innerHTML = '';
      box.insertAdjacentHTML('beforeend', msgHtml(payload.new));
      window.scrollTo(0, document.body.scrollHeight);
    }).subscribe();
  const inp = $('#msgInput'); if (inp) inp.focus();
}
function msgHtml(m){
  const mine = m.sender_id === me.id;
  return `<div class="msg ${mine ? 'me' : ''}">${esc(m.body)}<small>${timeAgo(m.created_at)}</small></div>`;
}
async function sendMsg(convId){
  const inp = $('#msgInput'); const body = inp.value.trim(); if (!body) return;
  inp.value = '';
  const { error } = await sb.from('messages').insert({ conversation_id: convId, sender_id: me.id, body });
  if (error) { toast('মেসেজ যায়নি'); inp.value = body; return; }
  const { data: members } = await sb.from('conversation_members').select('user_id').eq('conversation_id', convId);
  (members || []).filter(m => m.user_id !== me.id).forEach(m => notify(m.user_id, 'message', null, convId));
}

/* ---------- SETTINGS ---------- */
async function renderSettings(){
  curView = 'settings'; renderShell();
  const { data: fresh } = await sb.from('profiles').select('tokens').eq('id', me.id).single();
  if (fresh) me.tokens = fresh.tokens;
  view().innerHTML = `<div class="view">
    <div style="padding:14px 16px 0;font-size:18px;font-weight:800">সেটিংস</div>
    <div class="card" style="padding:6px 15px">
      <button class="menu-item" onclick="editProfile()">✏️ প্রোফাইল এডিট</button>
      <button class="menu-item" onclick="go('groups')">👥 গ্রুপ</button>
      <button class="menu-item" onclick="go('dating')">💘 মনের মানুষ</button>
      <button class="menu-item" onclick="go('tokens')">🪙 টোকেন ওয়ালেট <span style="margin-left:auto;font-weight:800;color:var(--acc)">${bn(me.tokens)}</span></button>
      <button class="menu-item" onclick="go('saved')">🔖 সেভ করা পোস্ট</button>
      <button class="menu-item" onclick="toggleTheme();toast('থিম বদলানো হয়েছে')">🌙 ডার্ক / লাইট থিম</button>
      <button class="menu-item" style="color:var(--danger)" onclick="doLogout()">🚪 লগ আউট</button>
    </div>
    <p style="text-align:center;color:var(--faint);font-size:11.5px;padding:16px 0 4px">আড্ডাBook · LIMON Labs</p></div>`;
}

/* ---------- TOKENS ---------- */
const REASONS = { welcome: 'স্বাগত বোনাস 🎉', login: 'দৈনিক লগইন বোনাস', post: 'পোস্ট করার পুরস্কার', comment: 'মন্তব্যের পুরস্কার', invite: 'বন্ধু আমন্ত্রণের পুরস্কার', quiz: 'কুইজ পুরস্কার', boost: 'পোস্ট বুস্ট', gift: 'উপহার পাঠিয়েছ', gift_received: 'উপহার পেয়েছ 🎁', badge: 'প্রিমিয়াম ব্যাজ' };
async function renderTokens(){
  curView = 'tokens'; renderShell();
  const { data: fresh } = await sb.from('profiles').select('*').eq('id', me.id).single();
  if (fresh) { me = fresh; profilesCache[me.id] = me; }
  view().innerHTML = `<div class="view">
    <div class="wallet"><small>তোমার ব্যালেন্স</small><div class="bal"><span class="coin">অ</span>${bn(me.tokens)} টোকেন</div>
    <small>প্রতিদিন লগইন, পোস্ট আর মন্তব্য করে টোকেন আয় করো</small></div>
    <div class="seclabel">টোকেন আয় করো</div>
    <div class="card" style="padding:6px 15px">
      <div class="earn"><span class="eic">📅</span><div><b>প্রতিদিন লগইন</b><small>প্রতিদিন একবার</small></div><span class="plus">+১০</span></div>
      <div class="earn"><span class="eic">📝</span><div><b>পোস্ট করো</b><small>দিনে সর্বোচ্চ ৫টি পোস্টে</small></div><span class="plus">+১৫</span></div>
      <div class="earn"><span class="eic">💬</span><div><b>মন্তব্য করো</b><small>দিনে সর্বোচ্চ ১০টি</small></div><span class="plus">+৩</span></div>
      <div class="earn"><span class="eic">🎉</span><div><b>স্বাগত বোনাস</b><small>নতুন অ্যাকাউন্টে একবার</small></div><span class="plus">+১০০</span></div>
    </div>
    <div class="seclabel">টোকেন খরচ করো</div>
    <div class="card" style="padding:6px 15px">
      <div class="earn"><span class="eic">🚀</span><div><b>পোস্ট বুস্ট</b><small>নিজের পোস্টের ⋯ মেনু থেকে, ২৪ ঘণ্টা সবার উপরে</small></div><span class="minus">৫০</span></div>
      <div class="earn"><span class="eic">🎁</span><div><b>বন্ধুকে উপহার</b><small>বন্ধুর প্রোফাইল থেকে পাঠাও</small></div><span class="minus">১০০</span></div>
      <div class="earn"><span class="eic">◆</span><div><b>প্রিমিয়াম ব্যাজ</b><small>নামের পাশে সোনালি ব্যাজ ${me.badge ? '— তোমার আছে ✓' : ''}</small></div>${me.badge ? '' : `<button class="btn sm" onclick="buyBadge()">২০০ দিয়ে কেনো</button>`}</div>
    </div>
    <div class="seclabel">ইতিহাস</div>
    <div class="card" id="txnList" style="padding:6px 15px"><div class="empty">লোড হচ্ছে...</div></div></div>`;
  const { data: txns } = await sb.from('token_txns').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(30);
  $('#txnList').innerHTML = (txns || []).length ? txns.map(t => `<div class="earn"><div><b style="font-size:13.5px">${REASONS[t.reason] || t.reason}</b><small>${timeAgo(t.created_at)}</small></div><span class="${t.amount >= 0 ? 'plus' : 'minus'}">${t.amount >= 0 ? '+' : ''}${bn(t.amount)}</span></div>`).join('') : '<div class="empty">এখনো কোনো লেনদেন নেই</div>';
}
async function buyBadge(){
  const { error } = await sb.rpc('rpc_spend', { p_item: 'badge', p_target: null });
  if (error) { toast('টোকেন যথেষ্ট নেই (লাগবে ২০০)'); return; }
  me.badge = true; me.tokens -= 200; toast('অভিনন্দন! প্রিমিয়াম ব্যাজ পেয়ে গেছ ◆'); renderTokens();
}

/* ---------- DATING : মনের মানুষ ---------- */
const INTERESTS = ['গান','সিনেমা','ক্রিকেট','বই পড়া','ভ্রমণ','রান্না','ফটোগ্রাফি','কবিতা','খেলাধুলা','প্রযুক্তি'];
let deck = [], deckIdx = 0;
async function renderDating(){
  curView = 'dating'; renderShell();
  const { data: dp } = await sb.from('dating_profiles').select('*').eq('user_id', me.id).maybeSingle();
  if (!dp || !dp.active) {
    view().innerHTML = `<div class="view">
      <div class="card" style="text-align:center;padding:24px 18px">
        <div style="font-size:40px">💘</div>
        <div style="font-size:19px;font-weight:800;margin:6px 0">মনের মানুষ</div>
        <p style="color:var(--mut);font-size:13.5px;line-height:1.7">আলাদা একটা জায়গা, যেখানে মনের মিল খুঁজে পাবে।<br>শুধু ১৮+ দের জন্য · সম্পূর্ণ ঐচ্ছিক · ম্যাচ হলেই চ্যাট</p>
      </div>
      <div class="card"><h3 style="margin-bottom:12px;font-size:15.5px">তোমার ডেটিং প্রোফাইল</h3>
        <input class="field" id="dAge" type="number" min="18" max="80" placeholder="বয়স (১৮ বা তার বেশি)">
        <select class="field" id="dGender"><option value="">তুমি —</option><option>ছেলে</option><option>মেয়ে</option><option>অন্যান্য</option></select>
        <select class="field" id="dLooking"><option value="">খুঁজছ —</option><option>ছেলে</option><option>মেয়ে</option><option>সবাইকে</option></select>
        <div style="font-size:13px;color:var(--mut);margin:2px 0 8px">পছন্দ বেছে নাও (ম্যাচ % এগুলো দিয়েই হিসাব হয়):</div>
        <div class="chiprow2" style="padding:0 0 10px">${INTERESTS.map(i => `<label class="ichip" style="cursor:pointer"><input type="checkbox" class="dInt" value="${i}" style="accent-color:#DB2777"> ${i}</label>`).join('')}</div>
        <textarea class="field" id="dBio" placeholder="নিজের সম্পর্কে দু-এক লাইন"></textarea>
        <button class="btn block" onclick="saveDatingProfile()">প্রোফাইল চালু করো</button>
      </div>
      <div class="safe" style="margin-top:12px">🛡 নিরাপত্তা: কেউ বিরক্ত করলে সাথে সাথে ব্লক/রিপোর্ট করো। কারো সাথে দেখা করতে গেলে পাবলিক জায়গা বেছে নাও, বন্ধুকে জানিয়ে যাও। ব্যক্তিগত তথ্য (ঠিকানা, পাসওয়ার্ড) কাউকে দিও না।</div></div>`;
    return;
  }
  window._myDating = dp;
  view().innerHTML = `<div class="view">
    <div style="padding:14px 16px 0;display:flex;align-items:center"><span style="font-size:18px;font-weight:800">মনের মানুষ 💘</span>
    <button class="btn ghost sm" style="margin-left:auto" onclick="datingSettings()">আমার প্রোফাইল</button></div>
    <div id="deckBox"><div class="empty">লোড হচ্ছে...</div></div>
    <div class="seclabel">তোমার ম্যাচ</div><div class="card" id="matchList" style="padding:6px 15px"><div class="empty">লোড হচ্ছে...</div></div>
    <div class="safe" style="margin-top:12px">🛡 ম্যাচ ছাড়া কেউ তোমাকে মেসেজ পাঠাতে পারবে না। বিরক্তিকর কাউকে ব্লক করো — সে আর তোমাকে দেখতে পাবে না।</div></div>`;
  const [{ data: all }, { data: myLikes }] = await Promise.all([
    sb.from('dating_profiles').select('*').eq('active', true).neq('user_id', me.id).limit(60),
    sb.from('dating_likes').select('liked').eq('liker', me.id)
  ]);
  const likedSet = new Set((myLikes || []).map(r => r.liked));
  const passed = new Set(JSON.parse(localStorage.getItem('adda-passed') || '[]'));
  let cands = (all || []).filter(d => !likedSet.has(d.user_id) && !passed.has(d.user_id) && !blockedIds.has(d.user_id));
  if (dp.looking_for && dp.looking_for !== 'সবাইকে') cands = cands.filter(d => d.gender === dp.looking_for);
  await cacheProfiles(cands.map(d => d.user_id));
  deck = cands.map(d => {
    const shared = (d.interests || []).filter(i => (dp.interests || []).includes(i)).length;
    const base = Math.max((d.interests || []).length, (dp.interests || []).length, 1);
    return { d, match: Math.min(98, 55 + Math.round(shared / base * 45)) };
  }).sort((a, b) => b.match - a.match);
  deckIdx = 0; showCard();
  const { data: likesOnMe } = await sb.from('dating_likes').select('liker').eq('liked', me.id);
  const onMe = new Set((likesOnMe || []).map(r => r.liker));
  const matches = [...likedSet].filter(id => onMe.has(id));
  await cacheProfiles(matches);
  $('#matchList').innerHTML = matches.length ? matches.map(id => { const p = prof(id); return userRow(p, `<button class="btn sm" onclick="startChat('${id}')">মেসেজ 💘</button>`); }).join('') : '<div class="empty">এখনো ম্যাচ হয়নি — পছন্দের প্রোফাইলে ❤ দাও</div>';
}
function showCard(){
  const box = $('#deckBox'); if (!box) return;
  if (deckIdx >= deck.length) { box.innerHTML = '<div class="card empty">আপাতত আর কেউ নেই।<br>পরে আবার দেখো — নতুন মানুষ যোগ দিলে এখানে আসবে।</div>'; return; }
  const { d, match } = deck[deckIdx]; const p = prof(d.user_id);
  const photo = d.photo_url || p.avatar_url;
  box.innerHTML = `<div class="dcard">
    <div class="dphoto" ${photo ? `style="background-image:url('${esc(photo)}')"` : ''}>
      ${photo ? '' : `<span class="face">${esc(p.name[0] || '?')}</span>`}
      <span class="matchp">${bn(match)}% ম্যাচ</span>
      <div class="dinfo"><b>${esc(p.name)}, ${bn(d.age)}</b>${badges(p)}<div style="font-size:12.5px;opacity:.92">${p.city ? '📍 ' + esc(p.city) + ' · ' : ''}এলাকার কাছাকাছি</div></div>
    </div>
    <div class="chiprow2">${(d.interests || []).map(i => `<span class="ichip">${esc(i)}</span>`).join('')}</div>
    ${d.bio ? `<p class="dbio">${esc(d.bio)}</p>` : ''}
    <div class="dacts">
      <button class="dbtn" onclick="passCard()" aria-label="পাস">✕</button>
      <button class="dbtn super" onclick="likeCard(true)" aria-label="সুপার লাইক">★</button>
      <button class="dbtn like" onclick="likeCard(false)" aria-label="লাইক">❤</button>
    </div>
    <div style="text-align:center;padding-bottom:12px"><a href="#" onclick="datingCardMenu('${d.user_id}');return false" style="font-size:12.5px;color:var(--faint)">রিপোর্ট / ব্লক</a></div></div>`;
}
function passCard(){
  const { d } = deck[deckIdx];
  const passed = JSON.parse(localStorage.getItem('adda-passed') || '[]'); passed.push(d.user_id);
  localStorage.setItem('adda-passed', JSON.stringify(passed));
  deckIdx++; showCard();
}
async function likeCard(isSuper){
  const { d } = deck[deckIdx];
  await sb.from('dating_likes').insert({ liker: me.id, liked: d.user_id, is_super: isSuper });
  const { data: back } = await sb.from('dating_likes').select('liker').eq('liker', d.user_id).eq('liked', me.id).maybeSingle();
  if (back) { notify(d.user_id, 'match'); toast('ম্যাচ হয়েছে! 💘 এখন চ্যাট করতে পারো'); }
  else toast(isSuper ? 'সুপার লাইক পাঠানো হয়েছে ★' : 'লাইক পাঠানো হয়েছে ❤');
  deckIdx++; showCard();
  setTimeout(() => { const ml = $('#matchList'); if (ml) renderDating(); }, 400);
}
function datingCardMenu(uid){
  sheet(`<h3>নিরাপত্তা</h3>
    <button class="menu-item" onclick="reportItem('dating','${uid}')">🚩 এই প্রোফাইল রিপোর্ট করো</button>
    <button class="menu-item" style="color:var(--danger)" onclick="blockUser('${uid}')">🚫 ব্লক করো</button>
    <button class="menu-item" onclick="closeSheet()">বন্ধ করো</button>`);
}
async function saveDatingProfile(){
  const age = parseInt($('#dAge').value, 10);
  if (!age || age < 18) { toast('ডেটিং শুধু ১৮ বছর বা তার বেশি বয়সীদের জন্য'); return; }
  const interests = [...document.querySelectorAll('.dInt:checked')].map(c => c.value);
  const { error } = await sb.from('dating_profiles').upsert({ user_id: me.id, age, gender: $('#dGender').value, looking_for: $('#dLooking').value, interests, bio: $('#dBio').value.trim(), photo_url: me.avatar_url || '', active: true });
  if (error) { toast('প্রোফাইল তৈরি হয়নি'); return; }
  toast('ডেটিং প্রোফাইল চালু হয়েছে 💘'); renderDating();
}
function datingSettings(){
  const dp = window._myDating;
  sheet(`<h3>আমার ডেটিং প্রোফাইল</h3>
    <p style="font-size:13.5px;color:var(--mut);line-height:1.7">বয়স: ${bn(dp.age)} · ${esc(dp.gender || '')} · খুঁজছ: ${esc(dp.looking_for || '')}<br>পছন্দ: ${(dp.interests || []).join(', ') || '—'}<br>${esc(dp.bio || '')}</p>
    <button class="btn block" style="margin-top:12px;background:var(--danger);box-shadow:none" onclick="deactivateDating()">ডেটিং বন্ধ করো</button>
    <button class="menu-item" onclick="closeSheet()">বন্ধ করো</button>`);
}
async function deactivateDating(){
  await sb.from('dating_profiles').update({ active: false }).eq('user_id', me.id);
  closeSheet(); toast('ডেটিং প্রোফাইল বন্ধ করা হয়েছে'); renderDating();
}
