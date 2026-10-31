// Mama Care Rwanda: landing page + login popup + patient portal + admin dashboard (white, pink and green, light and true-black dark).
// Needs Tailwind CSS and React 18. No .env is needed for the frontend: change the two lines below.
// Google sign-in: in Google Cloud Console > Credentials > your Web client, add your site address
// (for example http://localhost:5173) under "Authorized JavaScript origins".
// Use it:  import Home from './Home';  <Home />
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

const API_URL = 'http://localhost:5000'; // your backend address (change it when you deploy)
const GOOGLE_CLIENT_ID = ''; // paste the same Google Client ID that is in the server .env (xxxx.apps.googleusercontent.com)

/* ================= global stores: loading, language, theme ================= */
const subscribe = (set) => (cb) => { set.add(cb); return () => set.delete(cb); };

let pending = 0;
const pendSubs = new Set();
const subPending = subscribe(pendSubs);
const bump = (n) => { pending = Math.max(0, pending + n); pendSubs.forEach((f) => f()); };
const usePending = () => useSyncExternalStore(subPending, () => pending);

let lang = (() => { try { return localStorage.getItem('mc_lang') || 'en'; } catch { return 'en'; } })();
const langSubs = new Set();
const subLang = subscribe(langSubs);
const setLang = (l) => { lang = l; try { localStorage.setItem('mc_lang', l); } catch { /* ignore */ } langSubs.forEach((f) => f()); };
const useLang = () => useSyncExternalStore(subLang, () => lang);

let theme = (() => {
  try {
    const s = localStorage.getItem('mc_theme');
    if (s === 'dark' || s === 'light') return s;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch { return 'light'; }
})();
const themeSubs = new Set();
const subTheme = subscribe(themeSubs);
const setTheme = (v) => { theme = v; try { localStorage.setItem('mc_theme', v); } catch { /* ignore */ } themeSubs.forEach((f) => f()); };
const useTheme = () => useSyncExternalStore(subTheme, () => theme);

// Kinyarwanda labels. Any text not listed here stays in English. Please have a native speaker review.
const RW = {
  Dashboard: 'Imbonerahamwe', 'New Requests': 'Ibyifuzo bishya', Cases: 'Dosiye', Referrals: 'Kohereza', 'Follow-up': 'Gukurikirana',
  Patients: 'Abarwayi', Facilities: 'Ibigo nderabuzima', 'AI Assistant': 'Umufasha wa AI', 'Calls & Transcripts': 'Guhamagara',
  'USSD Logs': 'Amateka ya USSD', Reports: 'Raporo', Settings: 'Igenamiterere', Home: 'Ahabanza', 'Call support': 'Gufashwa kuri telefoni',
  'Virtual doctor': 'Muganga ukoresheje telefoni', Notifications: 'Ubutumwa', 'My profile': 'Konti yanjye', 'Log in': 'Injira',
  'Join now': 'Iyandikishe', 'Log out': 'Sohoka', 'Sign out': 'Sohoka', 'Edit profile': 'Hindura konti', 'Create account': 'Fungura konti',
  'Get started': 'Tangira', About: 'Abo turi bo', Services: 'Serivisi', 'How it works': 'Uko bikora', 'Know the signs': 'Menya ibimenyetso',
  FAQ: 'Ibibazo', Contact: 'Twandikire', More: 'Ibindi', 'Welcome back': 'Murakaza neza', 'Urgent Alerts': 'Ibyihutirwa',
  'Recent Activity': 'Ibimaze gukorwa', 'Quick Actions': 'Ibikorwa byihuse', 'Recent Cases': 'Dosiye za vuba', 'Total Requests': 'Ibyifuzo byose',
  'Active Cases': 'Dosiye zikora', 'Referrals Made': 'Ibyoherejwe', 'Appointments Scheduled': 'Gahunda zateguwe',
  'Follow-ups Pending': 'Gukurikirana bitegereje', 'Requests by Channel': 'Ibyifuzo hakurikijwe inzira', 'Case Status Overview': 'Uko dosiye zihagaze',
  'Add New Case': 'Ongeramo dosiye', 'Find a Facility': 'Shaka ikigo nderabuzima', 'Schedule Doctor': 'Tegura muganga', 'View Reports': 'Reba raporo',
  'Save changes': 'Bika impinduka', 'Search by patient name, case ID, phone number or facility...': 'Shakisha izina, nimero ya dosiye, telefoni cyangwa ikigo...',
  'View all': 'Reba byose', 'Phone number': 'Nimero ya telefoni', 'Full name': 'Amazina yose', Send: 'Ohereza', Cancel: 'Reka',
  'Care work': 'Imirimo y\u2019ubuvuzi', 'People & places': 'Abantu n\u2019ahantu', Communication: 'Itumanaho', 'Get help': 'Gufashwa',
  Menu: 'Menu', Language: 'Ururimi', Appearance: 'Isura', Light: 'Umucyo', Dark: 'Umwijima',
};
const useT = () => { const l = useLang(); return (s) => (l === 'rw' && RW[s]) || s; };

const store = {
  get: () => { try { return localStorage.getItem('mc_token'); } catch { return null; } },
  set: (t) => { try { t ? localStorage.setItem('mc_token', t) : localStorage.removeItem('mc_token'); } catch { /* ignore */ } },
};

async function api(path, { method = 'GET', body, token, quiet } = {}) {
  if (!quiet) bump(1);
  try {
    let res;
    try {
      res = await fetch(`${API_URL}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error(`Cannot reach the server at ${API_URL}. Start the backend (node server.js) and check API_URL at the top of Home.jsx.`);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  } finally { if (!quiet) bump(-1); }
}

/* ================= small helpers ================= */
const when = (d) => new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const ago = (d) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(d)) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr${h > 1 ? 's' : ''} ago` : `${Math.round(h / 24)} d ago`;
};
const today = () => new Date().toISOString().slice(0, 10);
const TIMES = ['09:00-10:00', '10:00-11:00', '11:00-12:00', '13:00-14:00', '14:00-15:00', '15:00-16:00'];
const NEEDS = ['Medical referral', 'Virtual consultation', 'Transport support', 'Insurance guidance', 'Health information', 'Clinical assessment', 'Follow-up', 'Referral'];
const CHANNEL = { website: 'Website', ussd: 'USSD', phone: 'Phone Call', virtual: 'Virtual Doctor', community: 'Community/CHW', sms: 'SMS' };
const STATUS = { new: 'New', in_progress: 'In Progress', referred: 'Referred', awaiting_followup: 'Awaiting Follow-up', closed: 'Closed' };
const CONTACT = { phone: '*001#', email: 'info@mamacare.rw', place: 'Kigali, Rwanda' };

// Colour tokens live in CSS variables (see CSS below), so light and dark share one set of class names.
// Corner radius rule: nothing above 7px (rounded = 4px, rounded-md = 6px).
const UI = {
  btn: 'inline-flex items-center justify-center gap-2 rounded-md bg-[#d6187d] px-4 py-2 text-[13px] font-semibold text-white transition duration-200 hover:bg-[#b01063] hover:shadow-md active:scale-[.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 disabled:cursor-not-allowed disabled:opacity-50',
  out: 'inline-flex items-center justify-center gap-2 rounded-md border border-[#d6187d] px-4 py-2 text-[13px] font-semibold c-brand transition duration-200 c-hov active:scale-[.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 disabled:cursor-not-allowed disabled:opacity-50',
  sm: 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-[#d6187d] px-3 py-1.5 text-xs font-semibold text-white transition duration-200 hover:bg-[#b01063] active:scale-[.98] disabled:opacity-50',
  smOut: 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[#d6187d] px-3 py-1.5 text-xs font-semibold c-brand transition duration-200 c-hov active:scale-[.98] disabled:opacity-50',
  danger: 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50',
  ghost: 'inline-flex h-9 items-center justify-center gap-2 rounded-md border c-line c-surf px-3 text-[13px] font-medium c-text transition c-hov focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300',
  input: 'w-full rounded-md border c-line c-surf px-3 py-2 text-[13px] c-strong placeholder:text-slate-400 outline-none transition focus:border-[#d6187d] focus:ring-2 focus:ring-pink-300/50',
  sel: 'w-full min-w-[140px] flex-1 rounded-md border c-line c-surf px-3 py-2 text-[13px] c-strong outline-none transition focus:border-[#d6187d] focus:ring-2 focus:ring-pink-300/50 sm:w-auto',
  card: 'rounded-md border c-line c-surf p-4',
  label: 'mb-1.5 block text-xs font-medium c-text',
  icon: 'grid shrink-0 place-items-center rounded-md bg-[#d6187d] text-white',
  iconG: 'grid shrink-0 place-items-center rounded-md bg-emerald-600 text-white',
};

const CSS = `
.mc{--bg:#ffffff;--surface:#ffffff;--soft:#fff3f9;--line:#f1c4dc;--text:#3b4558;--strong:#111827;--muted:#6b7280;--brandt:#d6187d;--ok:#047857;--bad:#be123c;color-scheme:light}
.mc[data-theme=dark]{--bg:#000000;--surface:#0b0b0b;--soft:#151015;--line:#2a2a2a;--text:#d4d4d8;--strong:#ffffff;--muted:#a1a1aa;--brandt:#f472b6;--ok:#34d399;--bad:#fb7185;color-scheme:dark}
.mc,.mc button,.mc input,.mc select,.mc textarea{font-family:'Poppins',system-ui,-apple-system,'Segoe UI',sans-serif}
.mc h1,.mc h2,.mc h3{font-family:'Poppins',system-ui,sans-serif;letter-spacing:-.01em}
.c-bg{background:var(--bg)}.c-surf{background:var(--surface)}.c-soft{background:var(--soft)}
.c-line{border-color:var(--line)}.c-text{color:var(--text)}.c-strong{color:var(--strong)}.c-muted{color:var(--muted)}.c-brand{color:var(--brandt)}.c-ok{color:var(--ok)}.c-bad{color:var(--bad)}
.c-hov:hover{background:var(--soft)}
.c-lift{transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}
.c-lift:hover{transform:translateY(-2px);border-color:#d6187d;box-shadow:0 8px 20px -10px rgba(214,24,125,.45)}
.mc[data-theme=dark] select option{background:#0b0b0b;color:#fff}
@keyframes mcbar{0%{left:-35%}100%{left:100%}}
.mc-bar{animation:mcbar 1.1s ease-in-out infinite}
@keyframes mcfade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.mc-fade{animation:mcfade .18s ease-out}
@keyframes mcslide{from{transform:translateX(-100%)}to{transform:none}}
.mc-slide{animation:mcslide .2s ease-out}
@keyframes mcfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.mc-float{animation:mcfloat 5s ease-in-out infinite}
.mc-float2{animation:mcfloat 6s ease-in-out -2s infinite}
@keyframes mcwave{0%{opacity:.15}50%{opacity:1}100%{opacity:.15}}
.mc-wave{animation:mcwave 1.8s ease-in-out infinite}
.mc-wave2{animation:mcwave 1.8s ease-in-out .3s infinite}
.mc-wave3{animation:mcwave 1.8s ease-in-out .6s infinite}
@keyframes mcpop{0%{opacity:0;transform:translateY(14px) scale(.96)}100%{opacity:1;transform:none}}
.mc-pop{opacity:0;animation:mcpop .6s cubic-bezier(.2,.8,.2,1) forwards}
.mc-rev{opacity:0;transform:translateY(14px);transition:opacity .5s ease,transform .5s ease}
.mc-rev.mc-in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.mc-bar,.mc-fade,.mc-slide,.mc-float,.mc-float2,.mc-wave,.mc-wave2,.mc-wave3,.mc-pop{animation:none;opacity:1}.mc-rev{opacity:1;transform:none;transition:none}.c-lift:hover{transform:none}}
html{scroll-behavior:smooth}
.mc ::-webkit-scrollbar{height:8px;width:8px}.mc ::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}
`;

const BADGE = {
  new: 'bg-emerald-600 text-white', in_progress: 'bg-teal-600 text-white', referred: 'bg-amber-400 text-slate-900',
  awaiting_followup: 'bg-pink-500 text-white', closed: 'bg-slate-500 text-white', pending: 'bg-amber-400 text-slate-900',
  open: 'bg-amber-400 text-slate-900', approved: 'bg-emerald-600 text-white', resolved: 'bg-emerald-700 text-white',
  done: 'bg-emerald-700 text-white', completed: 'bg-slate-500 text-white', rejected: 'bg-rose-600 text-white',
  contacted: 'bg-sky-600 text-white', high: 'bg-rose-600 text-white', normal: 'bg-slate-500 text-white',
};
const Badge = ({ s }) => (
  <span className={`whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-semibold capitalize ${BADGE[s] || 'bg-slate-700 text-white'}`}>
    {STATUS[s] || String(s).replace(/_/g, ' ')}
  </span>
);

const useDebounced = (v, ms = 300) => {
  const [d, setD] = useState(v);
  useEffect(() => { const id = setTimeout(() => setD(v), ms); return () => clearTimeout(id); }, [v, ms]);
  return d;
};

function useApi(path, token) {
  const [data, setData] = useState(null);
  const load = useCallback((quiet) => api(path, { token, quiet: quiet === true }).then(setData).catch(() => setData([])), [path, token]);
  useEffect(() => { setData(null); load(); }, [load]);
  return [data, load];
}

/* ================= loading visuals ================= */
const Spinner = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0 animate-spin" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity=".25" />
    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);
const LineLoader = ({ className = '' }) => (
  <div className={`relative h-1 w-full overflow-hidden rounded bg-pink-100 ${className}`} role="progressbar" aria-label="Loading">
    <div className="mc-bar absolute inset-y-0 w-1/3 rounded bg-[#d6187d]" />
  </div>
);
function GlobalLoader() {
  const n = usePending();
  if (!n) return null;
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[100]"><LineLoader className="!h-[3px] !rounded-none" /></div>
      <div className="c-brand c-surf fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-md border border-[#d6187d] px-3 py-2 text-xs font-semibold shadow-lg">
        <Spinner /> Working...
      </div>
    </>
  );
}
const PageLoading = () => (
  <div className="c-brand grid place-items-center gap-4 py-16"><Spinner size={28} /><LineLoader className="max-w-xs" /></div>
);
const Btn = ({ busy, className = UI.btn, children, ...p }) => (
  <button {...p} className={className} disabled={busy || p.disabled}>{busy && <Spinner />}{children}</button>
);

/* ================= illustrations (inline SVG, no image files needed) ================= */
// Pink awareness ribbon
const Ribbon = ({ className = '' }) => (
  <svg viewBox="0 0 100 120" className={className} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M50 12c-13 0-23 9-23 22 0 24 23 40 23 40s23-16 23-40c0-13-10-22-23-22Z" />
    <path d="M50 74 28 110M50 74l22 36" />
  </svg>
);

// A mother talking on the phone with a Mama Care responder
function HeroArt() {
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <svg viewBox="0 0 440 440" className="w-full" role="img" aria-label="A smiling mother talking to a Mama Care responder on the phone">
        <circle cx="220" cy="225" r="190" fill="#d6187d" opacity=".08" />
        <circle cx="220" cy="225" r="140" fill="#d6187d" opacity=".1" />
        <circle cx="220" cy="225" r="95" fill="#0f9d6b" opacity=".12" />
        <path d="M100 440c0-86 50-126 120-126s120 40 120 126Z" fill="#d6187d" />
        <path d="M188 316c8 20 22 30 32 30s24-10 32-30" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".55" />
        <rect x="203" y="268" width="34" height="52" rx="14" fill="#74442b" />
        <ellipse cx="220" cy="220" rx="50" ry="56" fill="#8d5a3b" />
        <path d="M166 216c-8-56 26-90 56-90s64 32 52 90c-12-32-30-44-54-44s-42 12-54 44Z" fill="#0f9d6b" />
        <path d="M172 192c30-22 70-22 98 0" stroke="#fff" strokeWidth="4" fill="none" opacity=".5" strokeLinecap="round" />
        <circle cx="203" cy="226" r="3.5" fill="#2a1408" /><circle cx="237" cy="226" r="3.5" fill="#2a1408" />
        <path d="M207 246c8 8 18 8 26 0" stroke="#2a1408" strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <circle cx="192" cy="240" r="6" fill="#ff7aa8" opacity=".4" /><circle cx="248" cy="240" r="6" fill="#ff7aa8" opacity=".4" />
        <path d="M322 372c22-56 2-106-40-126" stroke="#b01063" strokeWidth="30" strokeLinecap="round" fill="none" />
        <rect x="262" y="194" width="22" height="56" rx="8" fill="#1f1320" transform="rotate(12 273 222)" />
        <rect x="266" y="201" width="14" height="38" rx="4" fill="#f9a8d4" transform="rotate(12 273 222)" />
        <circle cx="280" cy="246" r="12" fill="#8d5a3b" />
        <path className="mc-wave" d="M296 200c9 8 13 18 12 28" stroke="#d6187d" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path className="mc-wave2" d="M308 190c14 12 20 28 18 44" stroke="#d6187d" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path className="mc-wave3" d="M320 180c19 16 27 38 24 60" stroke="#d6187d" strokeWidth="4" fill="none" strokeLinecap="round" />
      </svg>
      <div className="mc-float c-surf c-strong absolute left-0 top-12 flex items-center gap-2 rounded-md border c-line px-3 py-2 text-xs font-medium shadow-lg"><span className="c-brand">♥</span> Muraho, mama!</div>
      <div className="mc-float2 c-surf c-strong absolute bottom-24 right-0 flex items-center gap-2 rounded-md border c-line px-3 py-2 text-xs font-medium shadow-lg"><span className="c-ok">●</span> A responder is calling</div>
      <div className="mc-float c-surf c-strong absolute bottom-6 left-3 rounded-md border c-line px-3 py-2 text-xs font-medium shadow-lg">Free line <b className="c-brand">{CONTACT.phone}</b></div>
      <Ribbon className="mc-float2 absolute right-4 top-3 h-14 w-14 text-[#d6187d]" />
    </div>
  );
}

// A doctor on a video call
function DoctorArt() {
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <svg viewBox="0 0 400 320" className="w-full" role="img" aria-label="A doctor on a video call with a patient">
        <rect x="30" y="16" width="340" height="250" rx="10" style={{ fill: 'var(--soft)', stroke: '#d6187d' }} strokeWidth="3" />
        <rect x="44" y="30" width="312" height="190" rx="6" fill="#fde7f3" opacity=".9" />
        <path d="M120 220c0-50 36-70 80-70s80 20 80 70Z" fill="#fff" />
        <path d="M168 150l32 46 32-46" fill="none" stroke="#0f9d6b" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="200" cy="200" r="7" fill="none" stroke="#0f9d6b" strokeWidth="5" />
        <ellipse cx="200" cy="104" rx="36" ry="40" fill="#8d5a3b" />
        <path d="M162 100c-4-34 18-52 38-52s44 18 38 52c-8-18-20-26-38-26s-30 8-38 26Z" fill="#1f1320" />
        <circle cx="188" cy="108" r="3" fill="#2a1408" /><circle cx="212" cy="108" r="3" fill="#2a1408" />
        <path d="M190 124c6 6 14 6 20 0" stroke="#2a1408" strokeWidth="3" fill="none" strokeLinecap="round" />
        <rect x="236" y="168" width="22" height="22" rx="4" fill="#d6187d" /><path d="M247 172v14M240 179h14" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <rect x="278" y="38" width="68" height="50" rx="6" fill="#0f9d6b" opacity=".9" />
        <circle cx="312" cy="58" r="9" fill="#8d5a3b" /><path d="M296 86c0-12 8-18 16-18s16 6 16 18Z" fill="#d6187d" />
        <circle cx="146" cy="292" r="16" fill="#0f9d6b" /><circle cx="200" cy="292" r="16" fill="#d6187d" /><circle cx="254" cy="292" r="16" fill="#e11d48" />
        <path d="M140 292h12M200 285v14M248 292h12" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <Ribbon className="mc-float absolute -right-1 top-0 h-12 w-12 text-[#d6187d]" />
    </div>
  );
}

// Three women supporting each other under the ribbon
function SupportArt() {
  const women = [
    [110, '#d6187d', '#7a4a30', '#0f9d6b'],
    [200, '#0f9d6b', '#8d5a3b', '#d6187d'],
    [290, '#f472b6', '#6b3d27', '#ffffff'],
  ];
  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      <svg viewBox="0 0 400 300" className="w-full" role="img" aria-label="Three women standing together under a pink ribbon">
        <circle cx="200" cy="170" r="130" fill="#d6187d" opacity=".08" />
        <g className="mc-float2" transform="translate(172 8)" stroke="#d6187d" fill="none" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M28 6c-9 0-16 6-16 15 0 17 16 28 16 28s16-11 16-28c0-9-7-15-16-15Z" /><path d="M28 49 15 76M28 49l13 27" />
        </g>
        {women.map(([x, body, skin, wrap], i) => (
          <g key={x} transform={`translate(0 ${i === 1 ? 0 : 18})`}>
            <path d={`M${x - 62} 300c0-56 28-84 62-84s62 28 62 84Z`} fill={body} />
            <ellipse cx={x} cy="168" rx="30" ry="34" fill={skin} />
            <path d={`M${x - 34} 164c-4-34 16-54 34-54s38 20 34 54c-8-20-20-26-34-26s-26 6-34 26Z`} fill={wrap} />
            <circle cx={x - 11} cy="172" r="2.6" fill="#2a1408" /><circle cx={x + 11} cy="172" r="2.6" fill="#2a1408" />
            <path d={`M${x - 8} 186c5 5 11 5 16 0`} stroke="#2a1408" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    </div>
  );
}

// Reveals a block as it scrolls into view (used on the landing page only)
function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!('IntersectionObserver' in window)) { setOn(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={`mc-rev ${on ? 'mc-in' : ''} ${className}`}>{children}</div>;
}

/* ================= building blocks ================= */
function Logo({ tagline = true }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <svg viewBox="0 0 48 48" className="h-8 w-8 shrink-0 text-[#d6187d]" aria-hidden="true">
        <path d="M24 43C19 36 6 29 6 17a10 10 0 0 1 18-6 10 10 0 0 1 18 6c0 12-13 19-18 26Z" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
        <circle cx="24" cy="17" r="4.5" fill="currentColor" />
        <path d="M15 31c0-6 3.5-9 9-9s9 3 9 9" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
      <div className="leading-tight">
        <p className="c-brand text-[15px] font-bold">Mama Care</p>
        {tagline && <p className="c-muted text-[10px] font-medium">Rwanda</p>}
      </div>
    </div>
  );
}

// Generic dropdown. `sheet` spans the screen width on phones. `up` opens the menu above the button.
function Dropdown({ trigger, children, label, width = 'w-56', align = 'right', sheet, up, wrap = '', className = UI.ghost }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  let pos;
  if (up) pos = 'absolute bottom-full left-0 right-0 mb-2';
  else if (sheet) pos = `fixed inset-x-2 top-14 sm:absolute sm:inset-x-auto sm:top-auto sm:mt-2 ${align === 'right' ? 'sm:right-0' : 'sm:left-0'}`;
  else pos = `absolute mt-2 ${align === 'right' ? 'right-0' : 'left-0'}`;
  return (
    <div ref={ref} className={`relative ${wrap}`}>
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={label} className={className}>{trigger}</button>
      {open && (
        <div role="menu" onClick={() => setOpen(false)} className={`mc-fade z-50 ${pos} ${up ? '' : width} max-h-[75vh] overflow-y-auto rounded-md border c-line c-surf p-1 shadow-xl`}>
          {children}
        </div>
      )}
    </div>
  );
}
const MenuItem = ({ children, active, className = '', ...p }) => (
  <button role="menuitem" type="button" {...p} className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] c-hov ${active ? 'c-soft font-semibold c-brand' : 'c-text'} ${className}`}>{children}</button>
);
const MenuLabel = ({ children }) => <p className="c-muted px-3 pb-1 pt-2 text-[11px] font-semibold">{children}</p>;
const MenuRule = () => <div className="my-1 h-px border-t c-line" />;

function LangMenu() {
  const l = useLang();
  return (
    <Dropdown label="Change language" width="w-40" trigger={<><span aria-hidden="true">🌐</span><span>{l === 'rw' ? 'RW' : 'EN'}</span><span className="c-muted text-[10px]">▾</span></>}>
      <MenuItem active={l === 'en'} onClick={() => setLang('en')}>English</MenuItem>
      <MenuItem active={l === 'rw'} onClick={() => setLang('rw')}>Kinyarwanda</MenuItem>
    </Dropdown>
  );
}

function ThemeToggle() {
  const th = useTheme();
  const dark = th === 'dark';
  return (
    <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'} className={`${UI.ghost} w-9 !px-0`}>
      {dark ? (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
      )}
    </button>
  );
}

function Panel({ title, icon, action, children, pad = true, className = '' }) {
  return (
    <section className={`overflow-hidden rounded-md border c-line c-surf ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-gradient-to-r from-[#0b7d55] to-[#0f9d6b] px-4 py-2 text-white">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-white">{icon && <span className="text-emerald-100">{icon}</span>}{title}</h3>
        {action && <span className="text-xs">{action}</span>}
      </header>
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

function Modal({ onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-start justify-items-center overflow-y-auto bg-black/60 p-3 sm:place-items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={`mc-fade c-strong relative my-2 w-full ${wide ? 'max-w-3xl' : 'max-w-md'} rounded-md border border-[#d6187d] c-surf p-5 shadow-2xl sm:p-6`}>
        <button onClick={onClose} aria-label="Close" className="c-muted c-hov absolute right-3 top-3 grid h-8 w-8 place-items-center rounded">✕</button>
        {children}
      </div>
    </div>
  );
}

function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 max-w-full overflow-x-auto">
      <div className="inline-flex gap-1 rounded-md border c-line c-soft p-1" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
            className={`whitespace-nowrap rounded px-3 py-1.5 text-[13px] font-semibold transition ${value === k ? 'bg-[#d6187d] text-white' : 'c-text c-hov'}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

// `hide` on a column is a Tailwind class such as "hidden md:table-cell" to drop less important columns on small screens
function Table({ cols, rows, empty = 'Nothing here yet.', onRow }) {
  if (!rows) return <PageLoading />;
  if (!rows.length) return <p className="c-muted p-8 text-center">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="c-soft c-muted border-b c-line">
            {cols.map((c) => <th key={c.h} className={`whitespace-nowrap px-3 py-2 text-xs font-semibold ${c.hide || ''}`}>{c.h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={onRow ? () => onRow(r) : undefined}
              className={`c-text border-b c-line align-top transition-colors last:border-0 ${onRow ? 'c-hov cursor-pointer' : ''}`}>
              {cols.map((c) => <td key={c.h} className={`px-3 py-2.5 ${c.hide || ''}`}>{c.r(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PageTitle = ({ title, sub, children }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0"><h1 className="c-strong text-xl font-bold">{title}</h1>{sub && <p className="c-muted mt-0.5 text-[13px]">{sub}</p>}</div>
    {children && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{children}</div>}
  </div>
);

function Bars({ rows, color = 'bg-[#d6187d]', fmt = (x) => x }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <p className="c-muted">No data yet.</p>;
  return rows.map((r) => (
    <div key={r.label} className="mb-3 last:mb-0">
      <div className="mb-1 flex justify-between gap-2 text-[13px]"><span className="c-strong font-medium">{fmt(r.label)}</span><span className="c-muted">{r.count}</span></div>
      <div className="c-soft h-2 rounded"><div className={`h-2 rounded transition-all duration-700 ${color}`} style={{ width: `${(r.count / max) * 100}%` }} /></div>
    </div>
  ));
}

const FilterBar = ({ children }) => <div className={`${UI.card} mb-4 flex flex-wrap items-center gap-3 !p-3`}>{children}</div>;
const FSelect = ({ label, value, onChange, options, className = UI.sel }) => (
  <select aria-label={label} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">{label}</option>
    {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
  </select>
);
const STATUS_OPTS = { pending: 'Pending', contacted: 'Contacted', approved: 'Approved', rejected: 'Rejected', completed: 'Completed', done: 'Done' };
const statusOptions = (keys) => keys.map((k) => [k, STATUS_OPTS[k] || k]);
const byStatus = (rows, st) => (rows && st ? rows.filter((r) => r.status === st) : rows);

/* ================= landing page ================= */
const NAV_MAIN = [['about', 'About'], ['services', 'Services'], ['how', 'How it works']];
const NAV_MORE = [['signs', 'Know the signs'], ['faq', 'FAQ'], ['contact', 'Contact']];
const SERVICES = [
  ['✧', 'AI health assistant', 'Ask about breast health in simple words and get safe next steps, any time of day.'],
  ['☎', 'Call support', `Request a call from a Mama Care responder, or dial ${CONTACT.phone} from your phone.`],
  ['▣', 'Virtual doctor', 'Request a video or phone meeting with a health professional.'],
  ['✉', 'SMS and USSD access', 'No smartphone or internet? Text or dial us to register and ask for help.'],
  ['⌖', 'Referral and transport help', 'We help you plan a visit to the nearest health facility.'],
  ['♡', 'Follow-up and reminders', 'Gentle updates so that no check-up or referral is missed.'],
];
const STEPS = [
  ['Join', 'Create an account with your phone number, or continue with Google.'],
  ['Ask or call', 'Chat with the assistant, request a call, or use SMS or USSD.'],
  ['Get guided', 'Receive clear next steps and a referral when you need one.'],
  ['See a doctor', 'Request a virtual meeting. Our team follows up with you.'],
];
const SIGNS = [
  'A new lump or thickening in the breast or underarm',
  'A change in the size or shape of a breast',
  'Dimpling, redness or other changes in the skin',
  'Nipple changes, pulling inward, or discharge',
  'Pain in one area that does not go away',
];
const FAQ = [
  ['Does the AI assistant diagnose me?', 'No. It gives guidance and helps you find the right next step. Only a qualified health professional can examine you and diagnose.'],
  ['Can I use Mama Care without internet?', `Yes. Dial ${CONTACT.phone}, or text "REGISTER" followed by your name to join by SMS.`],
  ['Is my information private?', 'We only use your details to support you, and you choose what to share.'],
  ['What if it is an emergency?', 'Go to the nearest health facility or call your local emergency number straight away. Do not wait for a reply from the assistant.'],
];

const Section = ({ id, title, sub, alt, children }) => (
  <section id={id} className={`scroll-mt-20 ${alt ? 'c-soft' : 'c-bg'}`}>
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-5 sm:py-14">
      <Reveal>
        <h2 className="c-strong text-xl font-bold sm:text-2xl">{title}</h2>
        {sub && <p className="c-muted mt-2 max-w-2xl text-[13px] leading-relaxed sm:text-sm">{sub}</p>}
      </Reveal>
      <div className="mt-7">{children}</div>
    </div>
  </section>
);

function Landing({ open }) {
  const t = useT();
  const [menu, setMenu] = useState(false);
  const go = (id) => { setMenu(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); };
  const link = 'whitespace-nowrap rounded px-3 py-1.5 text-[13px] font-medium c-text transition hover:text-[#d6187d]';
  return (
    <div className="c-bg c-text">
      <div className="bg-[#d6187d] px-4 py-1.5 text-center text-xs font-medium text-white">
        No internet? Dial <b>{CONTACT.phone}</b> or text REGISTER to get support on any phone.
      </div>
      <header className="sticky top-0 z-40 border-b c-line c-surf/95 backdrop-blur c-surf">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Mama Care Rwanda home" className="shrink-0"><Logo /></button>

          <nav className="hidden items-center gap-1 rounded-md border c-line c-soft p-1 lg:flex" aria-label="Sections">
            {NAV_MAIN.map(([id, l]) => <button key={id} onClick={() => go(id)} className={link}>{t(l)}</button>)}
            <Dropdown label="More sections" align="left" width="w-44" className={`${link} inline-flex items-center gap-1`} trigger={<>{t('More')}<span className="text-[10px]">▾</span></>}>
              {NAV_MORE.map(([id, l]) => <MenuItem key={id} onClick={() => go(id)}>{t(l)}</MenuItem>)}
            </Dropdown>
          </nav>

          <div className="flex items-center gap-2">
            <LangMenu />
            <ThemeToggle />
            <button onClick={() => open('login')} className={`${UI.smOut} hidden !h-9 !px-4 !text-[13px] sm:inline-flex`}>{t('Log in')}</button>
            <button onClick={() => open('signup')} className={`${UI.sm} hidden !h-9 !px-4 !text-[13px] sm:inline-flex`}>{t('Join now')}</button>
            <button onClick={() => setMenu(!menu)} aria-label="Open menu" aria-expanded={menu} className={`${UI.ghost} w-9 !px-0 lg:hidden`}>{menu ? '✕' : '☰'}</button>
          </div>
        </div>
        {menu && (
          <div className="mc-fade border-t c-line c-surf px-4 pb-4 pt-3 lg:hidden">
            <div className="grid gap-1 sm:grid-cols-2">
              {[...NAV_MAIN, ...NAV_MORE].map(([id, l]) => <button key={id} onClick={() => go(id)} className="c-text c-hov rounded px-3 py-2.5 text-left text-[13px] font-medium">{t(l)}</button>)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
              <button onClick={() => { setMenu(false); open('login'); }} className={UI.out}>{t('Log in')}</button>
              <button onClick={() => { setMenu(false); open('signup'); }} className={UI.btn}>{t('Join now')}</button>
            </div>
          </div>
        )}
      </header>

      <section className="c-soft border-b c-line">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-5 lg:grid-cols-[1.05fr_.95fr] lg:py-16">
          <div className="mc-pop">
            <p className="c-brand mb-3 inline-flex items-center gap-2 rounded-md border border-[#d6187d] px-3 py-1 text-xs font-semibold"><Ribbon className="h-3.5 w-3.5" /> Breast health support for every mother</p>
            <h1 className="c-strong text-3xl font-bold leading-tight sm:text-4xl">Breast health care, close to every mother in Rwanda.</h1>
            <p className="c-muted mt-4 max-w-lg text-sm leading-relaxed">
              Talk to a caring AI assistant, call our team, use SMS or USSD, or meet a doctor online. Mama Care helps you take the next step early, without fear and without being alone.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => open('signup')} className={`${UI.btn} !px-5 !py-2.5`}>{t('Get started')}</button>
              <button onClick={() => open('login')} className={`${UI.out} !px-5 !py-2.5`}>{t('Log in')}</button>
            </div>
            <ul className="c-strong mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium">
              {['AI assistant, any time', 'Works by USSD, SMS and phone', 'Virtual doctor meetings'].map((x) => <li key={x}><span className="c-ok mr-1.5">✓</span>{x}</li>)}
            </ul>
          </div>
          <HeroArt />
        </div>
      </section>

      <Section id="about" title="Who we are" sub="Mama Care Rwanda helps women notice changes early and reach care quickly. We combine a friendly digital assistant with real people, so help is never far away, whether you have a smartphone or only a basic phone. We guide and connect. We do not diagnose.">
        <div className="grid items-center gap-8 md:grid-cols-[.8fr_1.2fr]">
          <Reveal><SupportArt /></Reveal>
          <div className="grid gap-3">
            {[['Early detection', 'Know what to look for and act sooner.', '✧'], ['Access to care', 'From advice to referral to a doctor.', '✚'], ['Dignity and privacy', 'Support at your pace, in your language.', '♡']].map(([a, b, i], k) => (
              <Reveal key={a} delay={k * 80}><div className={`${UI.card} c-lift flex items-center gap-4`}><span className={`${UI.icon} h-10 w-10`}>{i}</span><div><b className="c-strong text-sm">{a}</b><p className="c-muted text-[13px]">{b}</p></div></div></Reveal>
            ))}
          </div>
        </div>
      </Section>

      <Section id="services" alt title="What we do" sub="Simple, caring ways to get the support you need, whatever phone you have.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map(([i, a, b], k) => (
            <Reveal key={a} delay={(k % 3) * 80}>
              <div className={`${UI.card} c-lift h-full`}>
                <span className={`${UI.iconG} mb-3 h-10 w-10 text-base`}>{i}</span>
                <h3 className="c-strong text-sm font-semibold">{a}</h3><p className="c-muted mt-1 text-[13px]">{b}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section id="how" title="How it works" sub="Four calm steps, from your first question to follow-up care.">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([a, b], i) => (
            <Reveal key={a} delay={i * 80}>
              <li className={`${UI.card} c-lift h-full list-none`}>
                <span className="c-brand mb-3 grid h-8 w-8 place-items-center rounded-md border border-[#d6187d] text-sm font-bold">{i + 1}</span>
                <h3 className="c-strong text-sm font-semibold">{a}</h3><p className="c-muted mt-1 text-[13px]">{b}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </Section>

      <section className="c-soft border-y c-line">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:px-5 md:grid-cols-2">
          <Reveal><DoctorArt /></Reveal>
          <Reveal delay={100}>
            <h2 className="c-strong text-xl font-bold sm:text-2xl">Meet a doctor from your own home.</h2>
            <p className="c-muted mt-3 text-[13px] leading-relaxed sm:text-sm">Pick a date and time, choose a video or phone call, and our team confirms your meeting. No long travel and no waiting rooms for the first conversation.</p>
            <button onClick={() => open('signup')} className={`${UI.btn} mt-5`}>Request a virtual doctor</button>
          </Reveal>
        </div>
      </section>

      <Section id="signs" title="Know the signs. Act early." sub="Most breast changes are not cancer, but only a health professional can tell. If you notice any of these, get checked soon.">
        <ul className="grid gap-3 md:grid-cols-2">
          {SIGNS.map((s, k) => <Reveal key={s} delay={(k % 2) * 80}><li className="c-surf c-text c-lift flex list-none gap-3 rounded-md border c-line px-4 py-3 text-[13px]"><span className="c-brand">♡</span>{s}</li></Reveal>)}
        </ul>
        <button onClick={() => open('signup')} className={`${UI.btn} mt-6`}>Talk to us now</button>
      </Section>

      <Section id="faq" alt title="Questions we often hear">
        <div className="max-w-3xl space-y-3">
          {FAQ.map(([a, b]) => (
            <details key={a} className="group c-surf rounded-md border c-line p-4 transition open:border-[#d6187d]">
              <summary className="c-strong flex cursor-pointer list-none items-center justify-between gap-4 text-[13px] font-semibold">{a}<span className="c-brand transition group-open:rotate-45">＋</span></summary>
              <p className="c-muted mt-3 text-[13px]">{b}</p>
            </details>
          ))}
        </div>
      </Section>

      <section className="c-bg">
        <Reveal className="mx-auto max-w-6xl px-4 py-12 sm:px-5">
          <div className="relative overflow-hidden rounded-md bg-gradient-to-r from-[#d6187d] to-[#f472b6] p-6 text-white sm:p-10">
            <Ribbon className="mc-float absolute -right-4 -top-4 h-40 w-40 text-white opacity-20" />
            <div className="relative max-w-xl">
              <h2 className="text-xl font-bold sm:text-2xl">You do not have to face a worry alone.</h2>
              <p className="mt-2 text-[13px] text-pink-50 sm:text-sm">Call, text or chat. A Mama Care responder is ready to listen.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={() => open('signup')} className="rounded-md bg-white px-5 py-2.5 text-[13px] font-semibold text-[#b01063] transition hover:shadow-lg active:scale-[.98]">Create my account</button>
                <span className="inline-flex items-center rounded-md border border-white/70 px-4 py-2.5 text-[13px] font-semibold">☎ Dial {CONTACT.phone}</span>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <Section id="contact" alt title="Get in touch" sub="Choose the way that is easiest for you.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[['☎', 'Call or dial', CONTACT.phone], ['✉', 'Send an SMS', 'Text REGISTER and your name'], ['@', 'Email', CONTACT.email], ['⌖', 'Find us', CONTACT.place]].map(([i, a, b]) => (
            <div key={a} className={`${UI.card} c-lift text-center`}>
              <span className={`${UI.iconG} mx-auto mb-3 h-10 w-10`}>{i}</span>
              <b className="c-strong text-sm">{a}</b><p className="c-muted mt-1 break-words text-[13px]">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <footer className="c-surf border-t c-line">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-9 sm:px-5 md:grid-cols-2">
          <div><Logo /><p className="c-muted mt-3 max-w-sm text-[13px]">Guidance and connection to care. Mama Care does not diagnose or replace a qualified health professional.</p></div>
          <p className="c-muted text-[13px]"><b className="c-strong">In an emergency</b><br />Go to the nearest health facility or call your local emergency number straight away.</p>
        </div>
        <p className="c-muted border-t c-line py-4 text-center text-xs">© {new Date().getFullYear()} Mama Care Rwanda. Early support. Healthier futures.</p>
      </footer>
    </div>
  );
}

/* ================= login / register popup ================= */
// Google's script is loaded once and shared, so opening the popup twice never adds it twice.
let gsiPromise = null;
const loadGsi = () => {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { gsiPromise = null; s.remove(); reject(new Error('Could not load Google sign-in. Check your internet connection and try again.')); };
    document.head.appendChild(s);
  });
  return gsiPromise;
};

function AuthModal({ start, onClose, onAuth, toast }) {
  const t = useT();
  const th = useTheme();
  const [mode, setMode] = useState(start);
  const [f, setF] = useState({ name: '', phone: '', pin: '' });
  const [busy, setBusy] = useState('');
  const [show, setShow] = useState(false);
  const [gErr, setGErr] = useState('');
  const [gTry, setGTry] = useState(0);
  const gRef = useRef(null);
  const live = useRef({});
  live.current = { onAuth, toast }; // always the latest callbacks, so Google's callback never goes stale
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(mode === 'login' ? 'Signing you in...' : 'Creating your account...');
    try { onAuth(await api(`/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: f, quiet: true })); }
    catch (err) { toast(err.message, 'error'); setBusy(''); }
  };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;
    let dead = false;
    setGErr('');
    loadGsi().then(() => {
      if (dead || !gRef.current || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        ux_mode: 'popup',
        auto_select: false,
        callback: async (r) => {
          if (!r?.credential) { live.current.toast('Google did not return a sign-in. Please try again.', 'error'); return; }
          setBusy('Connecting to Google...');
          try { live.current.onAuth(await api('/auth/google', { method: 'POST', body: { credential: r.credential }, quiet: true })); }
          catch (err) { live.current.toast(err.message, 'error'); setBusy(''); }
        },
      });
      gRef.current.innerHTML = '';
      const w = Math.max(200, Math.min(340, gRef.current.offsetWidth || 300));
      window.google.accounts.id.renderButton(gRef.current, { theme: th === 'dark' ? 'filled_black' : 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', logo_alignment: 'left', width: w });
    }).catch((e) => { if (!dead) setGErr(e.message); });
    return () => { dead = true; };
  }, [gTry, th]);

  return (
    <Modal onClose={busy ? () => {} : onClose}>
      <div className="mb-4 flex items-center gap-3 pr-8"><Logo tagline={false} /><Ribbon className="mc-float h-7 w-7 text-[#d6187d]" /></div>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-md border c-line c-soft p-1">
        {[['login', 'Log in'], ['signup', 'Create account']].map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} className={`rounded py-1.5 text-[13px] font-semibold transition ${mode === k ? 'bg-[#d6187d] text-white' : 'c-text'}`}>{t(l)}</button>
        ))}
      </div>
      <h2 className="c-strong text-lg font-bold">{mode === 'login' ? 'Welcome back!' : 'Create your account'}</h2>
      <p className="c-muted mb-4 mt-0.5 text-[13px]">{mode === 'login' ? 'Log in to your Mama Care support space.' : 'A few details help us support you.'}</p>

      {GOOGLE_CLIENT_ID && (
        <>
          <div ref={gRef} className="flex min-h-[44px] w-full justify-center" />
          {gErr && (
            <p className="mt-2 rounded-md border border-amber-500 p-3 text-center text-xs text-amber-700 dark:text-amber-300">
              {gErr} <button type="button" onClick={() => setGTry(gTry + 1)} className="c-brand font-semibold underline">Try again</button>
            </p>
          )}
          <div className="c-muted my-4 flex items-center gap-3 text-xs"><span className="h-px flex-1 border-t c-line" />or use your phone number<span className="h-px flex-1 border-t c-line" /></div>
        </>
      )}

      <form onSubmit={submit} className="space-y-3">
        {mode === 'signup' && (
          <div><label className={UI.label}>{t('Full name')}</label>
            <input className={UI.input} value={f.name} onChange={set('name')} placeholder="Your full name" autoComplete="name" required autoFocus /></div>
        )}
        <div><label className={UI.label}>{t('Phone number')}</label>
          <input className={UI.input} type="tel" value={f.phone} onChange={set('phone')} placeholder="e.g. 0788 123 456" autoComplete="tel" required autoFocus={mode === 'login'} /></div>
        <div><label className={UI.label}>PIN</label>
          <div className="relative">
            <input className={`${UI.input} pr-16`} type={show ? 'text' : 'password'} inputMode="numeric" minLength={4} maxLength={8}
              value={f.pin} onChange={set('pin')} placeholder={mode === 'login' ? 'Enter your PIN' : '4 to 8 characters'} required />
            <button type="button" onClick={() => setShow(!show)} className="c-brand absolute right-3 top-2 text-xs font-semibold">{show ? 'Hide' : 'Show'}</button>
          </div></div>
        <Btn busy={!!busy} className={`${UI.btn} w-full`}>{mode === 'login' ? t('Log in') : t('Create account')}</Btn>
        {mode === 'login' && (
          <button type="button" onClick={() => toast(`Please call ${CONTACT.phone} to reset your PIN.`)} className="c-brand block w-full text-center text-xs font-semibold">Forgot PIN?</button>
        )}
      </form>
      {!GOOGLE_CLIENT_ID && <p className="mt-4 rounded-md border border-amber-500 p-3 text-center text-xs text-amber-700 dark:text-amber-300">Google sign-in is off. Paste your Google Client ID into GOOGLE_CLIENT_ID at the top of Home.jsx to turn it on.</p>}

      {busy && (
        <div className="mc-fade c-surf absolute inset-0 z-10 grid place-items-center rounded-md p-8">
          <div className="c-brand w-full max-w-xs text-center">
            <div className="mx-auto mb-5 w-fit"><Spinner size={44} /></div>
            <p className="c-strong mb-4 text-sm font-semibold">{busy}</p>
            <LineLoader />
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ================= shared layout ================= */
function GlobalSearch({ token, onPick }) {
  const t = useT();
  const [s, setS] = useState('');
  const d = useDebounced(s, 350);
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (d.trim().length < 2) { setRes(null); return; }
    api(`/admin/search?q=${encodeURIComponent(d.trim())}`, { token, quiet: true }).then(setRes).catch(() => setRes(null));
  }, [d, token]);
  const pick = (type, item) => { setOpen(false); setS(''); onPick(type, item); };
  const none = res && !res.cases.length && !res.patients.length && !res.facilities.length;
  const group = (title, items, type, label) => items.length > 0 && (
    <div className="py-1"><p className="c-muted px-4 py-1 text-[11px] font-semibold">{title}</p>
      {items.map((i) => <button key={i.id} onClick={() => pick(type, i)} className="c-text c-hov block w-full px-4 py-2 text-left text-[13px]">{label(i)}</button>)}
    </div>
  );
  return (
    <div className="relative min-w-0 flex-1">
      <span className="c-brand pointer-events-none absolute left-3 top-1.5 text-lg">⌕</span>
      <input value={s} onChange={(e) => { setS(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder={t('Search by patient name, case ID, phone number or facility...')} aria-label="Search"
        className={`${UI.input} !h-9 truncate !pl-9`} />
      {open && s.trim().length >= 2 && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="c-surf absolute left-0 right-0 top-11 z-40 max-h-96 overflow-y-auto rounded-md border border-[#d6187d] py-1 shadow-xl">
            {!res && <p className="c-brand flex items-center gap-2 p-4 text-[13px]"><Spinner /> Searching...</p>}
            {none && <p className="c-muted p-4 text-[13px]">No results for "{s}".</p>}
            {res && <>
              {group('Cases', res.cases, 'case', (i) => <><b>{i.code}</b> {i.patient_name} <span className="c-muted">· {i.need}</span></>)}
              {group('Patients', res.patients, 'patient', (i) => <><b>{i.name}</b> <span className="c-muted">{i.phone || i.email}</span></>)}
              {group('Facilities', res.facilities, 'facility', (i) => <><b>{i.name}</b> <span className="c-muted">{i.district}</span></>)}
            </>}
          </div>
        </>
      )}
    </div>
  );
}

// Sidebar: a few top-level items. Groups open and close like a dropdown, and the one holding the current page opens by itself.
function SideNav({ nav, view, go, counts }) {
  const t = useT();
  const [openG, setOpenG] = useState({});
  const item = ([k, l, i], nested) => (
    <button key={k} onClick={() => go(k)} aria-current={view === k ? 'page' : undefined}
      className={`flex w-full items-center gap-3 rounded-md py-2 text-left text-[13px] font-medium transition ${nested ? 'pl-9 pr-3' : 'px-3'} ${view === k ? 'bg-[#d6187d] text-white' : 'c-text c-hov'}`}>
      {!nested && <span className="w-5 shrink-0 text-center">{i}</span>}
      <span className="flex-1 truncate">{t(l)}</span>
      {counts[k] > 0 && <span className="grid min-w-5 place-items-center rounded bg-emerald-600 px-1.5 text-[11px] font-bold text-white">{counts[k]}</span>}
    </button>
  );
  return (
    <nav aria-label="Main" className="space-y-1">
      {nav.map((e) => {
        if (Array.isArray(e)) return item(e, false);
        const has = e.items.some(([k]) => k === view);
        const isOpen = e.title in openG ? openG[e.title] : has;
        const badge = e.items.reduce((a, [k]) => a + (counts[k] || 0), 0);
        return (
          <div key={e.title}>
            <button onClick={() => setOpenG({ ...openG, [e.title]: !isOpen })} aria-expanded={isOpen}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] font-medium transition c-hov ${has ? 'c-brand' : 'c-text'}`}>
              <span className="w-5 shrink-0 text-center">{e.icon}</span><span className="flex-1 truncate">{t(e.title)}</span>
              {!isOpen && badge > 0 && <span className="grid min-w-5 place-items-center rounded bg-emerald-600 px-1.5 text-[11px] font-bold text-white">{badge}</span>}
              <span className={`c-muted text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {isOpen && <div className="mc-fade mt-0.5 space-y-0.5">{e.items.map((x) => item(x, true))}</div>}
          </div>
        );
      })}
    </nav>
  );
}

// Profile card in the bottom corner of the sidebar: edit profile and sign out, for patients and admins
function ProfileCorner({ user, admin, go, logout }) {
  const t = useT();
  return (
    <Dropdown up wrap="block w-full" label="Account menu"
      className="flex w-full items-center gap-3 rounded-md border c-line c-soft p-2 text-left transition c-hov focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
      trigger={<>
        <span className={`${UI.icon} h-9 w-9 text-sm font-bold`}>{user.name[0]?.toUpperCase()}</span>
        <span className="min-w-0 flex-1 leading-tight"><b className="c-strong block truncate text-[13px]">{user.name}</b><small className="c-muted block truncate text-[11px]">{admin ? 'Administrator' : 'Patient'}</small></span>
        <span className="c-muted text-[10px]">▲</span>
      </>}>
      <MenuItem onClick={() => go('profile')}>♙ {t('Edit profile')}</MenuItem>
      {admin && <MenuItem onClick={() => go('settings')}>⚙ {t('Settings')}</MenuItem>}
      <MenuRule />
      <MenuItem onClick={logout} className="c-bad font-semibold">⎋ {t('Sign out')}</MenuItem>
    </Dropdown>
  );
}

function Shell({ nav, view, setView, user, logout, admin, unread, notes = [], counts = {}, onPick, onAdd, children }) {
  const t = useT();
  const [drawer, setDrawer] = useState(false);
  const mainRef = useRef(null);
  const bell = admin ? 'alerts' : 'notifications';
  const go = (k) => { setView(k); setDrawer(false); mainRef.current?.scrollTo({ top: 0 }); };
  const side = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-3"><SideNav nav={nav} view={view} go={go} counts={counts} /></div>
      <div className="shrink-0 border-t c-line p-3"><ProfileCorner user={user} admin={!!admin} go={go} logout={logout} /></div>
    </>
  );
  return (
    <div className="c-bg c-strong flex overflow-hidden" style={{ height: '100dvh' }}>
      <aside className="c-surf hidden h-full w-60 shrink-0 flex-col border-r c-line lg:flex">
        <div className="shrink-0 px-4 py-4"><Logo /></div>
        {side}
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <aside className="mc-slide c-surf absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r c-line">
            <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-4">
              <Logo />
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="c-muted c-hov grid h-8 w-8 place-items-center rounded">✕</button>
            </div>
            {side}
          </aside>
        </div>
      )}

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="c-surf flex shrink-0 items-center gap-2 border-b c-line px-3 py-2 sm:gap-3 sm:px-4">
          <button onClick={() => setDrawer(true)} aria-label="Open menu" className={`${UI.ghost} w-9 shrink-0 !px-0 lg:hidden`}>☰</button>
          <div className="min-w-0 shrink-0 lg:hidden"><Logo tagline={false} /></div>
          {admin
            ? <div className="hidden min-w-0 flex-1 lg:block"><GlobalSearch token={admin.token} onPick={onPick} /></div>
            : <p className="c-muted hidden flex-1 text-[13px] lg:block"><span className="mr-2 inline-block h-2 w-2 rounded-sm bg-emerald-500" />Your personal support space</p>}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {admin && <button onClick={onAdd} className={`${UI.btn} !h-9 hidden sm:inline-flex`}>＋ {t('Add New Case')}</button>}
            <LangMenu />
            <ThemeToggle />
            <Dropdown label="Notifications" sheet width="w-80" trigger={<><span aria-hidden="true">🔔</span>{unread > 0 && <span className="grid min-w-5 place-items-center rounded bg-[#d6187d] px-1 text-[11px] font-bold text-white">{unread}</span>}</>}>
              <MenuLabel>{t('Notifications')}</MenuLabel>
              {!notes.length && <p className="c-muted px-3 py-4 text-center text-[13px]">No notifications yet.</p>}
              {notes.slice(0, 5).map((n) => (
                <MenuItem key={n.id} onClick={() => go(bell)} className="items-start">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-sm ${n.read ? 'bg-transparent' : 'bg-[#d6187d]'}`} />
                  <span className="min-w-0"><b className="c-strong block truncate">{n.title}</b><span className="c-muted line-clamp-2 text-xs">{n.body}</span></span>
                </MenuItem>
              ))}
              <MenuRule />
              <MenuItem onClick={() => go(bell)} className="c-brand justify-center font-semibold">{t('View all')}</MenuItem>
            </Dropdown>
          </div>
        </header>
        {admin && (
          <div className="c-surf flex shrink-0 items-center gap-2 border-b c-line p-2.5 lg:hidden">
            <GlobalSearch token={admin.token} onPick={onPick} />
            <button onClick={onAdd} aria-label="Add new case" className={`${UI.btn} !h-9 !w-9 shrink-0 !px-0 sm:hidden`}>＋</button>
          </div>
        )}
        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] p-3 sm:p-5">{children}</div>
        </main>
      </div>
    </div>
  );
}

function NotificationList({ token, notes, reload }) {
  const markAll = async () => { await api('/notifications/read-all', { method: 'POST', token }); reload(); };
  const mark = async (id) => { await api(`/notifications/${id}/read`, { method: 'PATCH', token }); reload(); };
  const ICON = { welcome: '♡', urgent: '⚑', doctor: '▣', call: '☎', info: '✦' };
  return (
    <>
      <PageTitle title="Notifications" sub="Reminders and updates related to your care."><button onClick={markAll} className={UI.out}>Mark all as read</button></PageTitle>
      <div className={`${UI.card} divide-y divide-[var(--line)] !p-2`}>
        {!notes.length && <p className="c-muted p-8 text-center">No notifications yet.</p>}
        {notes.map((n) => (
          <button key={n.id} onClick={() => !n.read && mark(n.id)} className="c-hov flex w-full items-start gap-3 rounded p-3 text-left">
            <span className={`${UI.icon} h-9 w-9 ${n.type === 'urgent' ? '!bg-rose-600' : ''}`}>{ICON[n.type] || '✦'}</span>
            <span className="min-w-0 flex-1"><b className="c-strong block text-[13px]">{n.title}</b><span className="c-text text-[13px]">{n.body}</span><small className="c-muted mt-1 block">{when(n.created_at)}</small></span>
            {!n.read && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-sm bg-[#d6187d]" />}
          </button>
        ))}
      </div>
    </>
  );
}

/* ---- chat used by both the patient assistant and the staff assistant ---- */
function Chat({ hello, suggestions, ask, onFlag }) {
  const [msgs, setMsgs] = useState([{ role: 'bot', text: hello }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [msgs, busy]);
  const send = async (v) => {
    const body = (v ?? text).trim();
    if (!body || busy) return;
    const history = msgs.slice(1).filter((m) => m.text).slice(-8).map((m) => ({ role: m.role, text: m.text }));
    setText(''); setBusy(true);
    setMsgs((m) => [...m, { role: 'me', text: body }]);
    try { const r = await ask(body, history); setMsgs((m) => [...m, { role: 'bot', ...r }]); }
    catch (e) { setMsgs((m) => [...m, { role: 'bot', text: e.message }]); }
    finally { setBusy(false); }
  };
  return (
    <div className={`${UI.card} flex h-[calc(100dvh-13rem)] min-h-[420px] flex-col !p-0`}>
      <div className="flex items-center gap-3 border-b c-line p-3">
        <span className={`${UI.icon} h-9 w-9`}>✧</span>
        <div><b className="c-strong text-[13px]">Mama Care AI</b><p className="c-ok text-xs">● Assistant ready</p></div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.length === 1 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((p) => <button key={p} onClick={() => send(p)} className="c-brand c-hov rounded-md border c-line px-3 py-2 text-left text-xs font-medium">{p}</button>)}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`mc-fade flex ${m.role === 'me' ? 'justify-end' : ''}`}>
            <div className={`max-w-[88%] whitespace-pre-wrap break-words rounded-md px-3.5 py-2.5 text-[13px] leading-relaxed ${m.role === 'me' ? 'bg-[#d6187d] text-white' : 'c-soft c-text'}`}>
              {m.text}
              {m.flagged && onFlag && (
                <div className="mt-3 space-y-2 border-t c-line pt-3">
                  <p className="c-brand text-[13px] font-semibold">Our team has been notified. Would you like to talk to someone now?</p>
                  {onFlag}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="c-brand flex items-center gap-2 text-xs"><Spinner /> Mama Care AI is typing...</p>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2 border-t c-line p-3">
        <input className={UI.input} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Type your message..." aria-label="Message" />
        <button className={`${UI.icon} h-9 w-9 text-base transition active:scale-95 disabled:opacity-40`} disabled={!text.trim() || busy} aria-label="Send">➤</button>
      </form>
    </div>
  );
}

/* ---- facilities (admins can add and remove, patients can browse) ---- */
function FacilitiesView({ token, toast, admin, initialQ = '' }) {
  const [rows, reload] = useApi('/facilities', token);
  const [s, setS] = useState(initialQ);
  const [dist, setDist] = useState('');
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ name: '', district: '', type: 'Health facility', phone: '' });
  const [busy, setBusy] = useState(false);
  const districts = rows ? [...new Set(rows.map((r) => r.district).filter(Boolean))].sort() : [];
  const list = rows && rows.filter((r) => `${r.name} ${r.district || ''}`.toLowerCase().includes(s.toLowerCase()) && (!dist || r.district === dist));
  const add = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api('/admin/facilities', { method: 'POST', token, body: f }); setF({ name: '', district: '', type: 'Health facility', phone: '' }); toast('Facility added.'); setShow(false); reload(); }
    catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const del = async (r) => {
    if (!window.confirm(`Remove ${r.name}?`)) return;
    try { await api(`/admin/facilities/${r.id}`, { method: 'DELETE', token }); toast('Facility removed.'); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <>
      <PageTitle title="Facilities" sub={admin ? 'Health facilities available for referrals.' : 'Find a health facility near you.'}>
        {admin && <button onClick={() => setShow(!show)} className={show ? UI.out : UI.btn}>{show ? 'Close form' : '＋ Add facility'}</button>}
      </PageTitle>
      {admin && show && (
        <form onSubmit={add} className={`${UI.card} mc-fade mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
          <input className={UI.input} placeholder="Facility name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required aria-label="Facility name" />
          <input className={UI.input} placeholder="District" value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} aria-label="District" />
          <input className={UI.input} placeholder="Phone (optional)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} aria-label="Phone" />
          <Btn busy={busy}>Save facility</Btn>
        </form>
      )}
      <FilterBar>
        <input className={`${UI.input} min-w-[200px] flex-[2]`} placeholder="Search facilities" value={s} onChange={(e) => setS(e.target.value)} aria-label="Search facilities" />
        <FSelect label="All districts" value={dist} onChange={setDist} options={districts.map((d) => [d, d])} />
      </FilterBar>
      {!list ? <PageLoading /> : !list.length ? <p className="c-muted p-8 text-center">No facilities found.</p> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <div key={r.id} className={`${UI.card} c-lift`}>
              <span className={`${UI.icon} mb-3 h-9 w-9`}>✚</span>
              <b className="c-strong block text-sm">{r.name}</b>
              <p className="c-muted text-[13px]">{r.type}{r.district ? ` · ${r.district}` : ''}</p>
              {r.phone && <p className="c-brand mt-1 text-[13px]">{r.phone}</p>}
              {admin && <button onClick={() => del(r)} className="c-bad mt-3 text-xs font-semibold">Remove</button>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ProfileForm({ token, user, setUser, toast }) {
  const [f, setF] = useState({ name: user.name, phone: user.phone || '' });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { setUser((await api('/me', { method: 'PUT', token, body: f })).user); toast('Profile saved.'); }
    catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className={`${UI.card} max-w-xl space-y-4`}>
      <div className="flex items-center gap-4"><span className={`${UI.icon} h-12 w-12 text-lg font-bold`}>{user.name[0]?.toUpperCase()}</span>
        <div className="min-w-0"><b className="c-strong block truncate text-sm">{user.name}</b><p className="c-muted truncate text-[13px]">{user.email || (user.role === 'admin' ? 'Administrator' : 'Patient account')}</p></div></div>
      <div><label className={UI.label}>Full name</label><input className={UI.input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
      <div><label className={UI.label}>Phone number</label><input className={UI.input} type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      <Btn busy={busy}>Save changes</Btn>
    </form>
  );
}

/* ================= patient portal ================= */
// A short sidebar: three single links and one dropdown group
const PATIENT_NAV = [
  ['home', 'Home', '⌂'],
  ['assistant', 'AI Assistant', '✦'],
  { title: 'Get help', icon: '☎', items: [['calls', 'Call support'], ['doctor', 'Virtual doctor'], ['facilities', 'Facilities']] },
  ['notifications', 'Notifications', '🔔'],
];

function PatientApp({ token, user, setUser, logout, toast }) {
  const [view, setView] = useState('home');
  const [notes, setNotes] = useState([]);
  const [requests, setRequests] = useState([]);
  const loadNotes = useCallback(() => api('/notifications', { token, quiet: true }).then(setNotes).catch(() => {}), [token]);
  const loadReq = useCallback(() => api('/doctor-requests', { token, quiet: true }).then(setRequests).catch(() => {}), [token]);
  useEffect(() => { loadNotes(); loadReq(); }, [loadNotes, loadReq]);
  const unread = notes.filter((n) => !n.read).length;
  const ask = async (b, history) => { const r = await api('/questions', { method: 'POST', token, body: { text: b, history } }); loadNotes(); return { text: r.ai_answer, flagged: r.flagged }; };

  return (
    <Shell nav={PATIENT_NAV} view={view} setView={setView} user={user} logout={logout} unread={unread} notes={notes} counts={{ notifications: unread }}>
      <div key={view} className="mc-fade">
        {view === 'home' && <PatientHome user={user} setView={setView} unread={unread} latest={requests[0]} />}
        {view === 'assistant' && (
          <>
            <PageTitle title="AI Assistant" sub="Ask a question and get safe next steps." />
            <Chat ask={ask} hello={`Hello ${user.name.split(' ')[0]}! I am your Mama Care AI assistant. You can ask me about your health, symptoms or next steps.`}
              suggestions={['I noticed a change in my breast. What should I do?', 'How can I find a nearby health facility?', 'I need help arranging transport or a referral.']}
              onFlag={<div className="flex flex-wrap gap-2"><button onClick={() => setView('doctor')} className={UI.sm}>Book a Virtual Doctor</button><button onClick={() => setView('calls')} className={UI.smOut}>Call Now</button></div>} />
          </>
        )}
        {view === 'calls' && <PatientCalls token={token} toast={toast} loadNotes={loadNotes} setView={setView} />}
        {view === 'doctor' && <PatientDoctor token={token} requests={requests} reload={() => { loadReq(); loadNotes(); }} toast={toast} />}
        {view === 'facilities' && <FacilitiesView token={token} toast={toast} />}
        {view === 'notifications' && <NotificationList token={token} notes={notes} reload={loadNotes} />}
        {view === 'profile' && <><PageTitle title="Edit profile" sub="Manage the details shown in your account." /><ProfileForm token={token} user={user} setUser={setUser} toast={toast} /></>}
      </div>
    </Shell>
  );
}

function PatientHome({ user, setView, unread, latest }) {
  const quick = [
    ['assistant', '✦', 'AI Assistant', 'Ask a question, get guidance'],
    ['calls', '☎', 'Call Mama Care', 'Talk to a responder (free)'],
    ['doctor', '▣', 'Virtual Doctor', 'Meet a doctor online'],
    ['facilities', '✚', 'Find a Facility', 'Health centers and hospitals'],
  ];
  return (
    <>
      <div className="relative mb-5 overflow-hidden rounded-md bg-gradient-to-r from-[#d6187d] to-[#f472b6] p-5 text-white sm:p-6">
        <Ribbon className="mc-float absolute -right-3 -top-3 h-36 w-36 text-white opacity-20" />
        <div className="relative max-w-lg">
          <h1 className="text-xl font-bold">Hello, {user.name.split(' ')[0]}!</h1>
          <p className="mt-1 text-[13px] text-pink-50">You are not alone. We are here to support you.{unread > 0 && ` You have ${unread} new update${unread > 1 ? 's' : ''}.`}</p>
          <button onClick={() => setView('assistant')} className="mt-4 rounded-md bg-white px-4 py-2 text-[13px] font-semibold text-[#b01063] transition hover:shadow-lg active:scale-[.98]">Talk to the assistant</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {quick.map(([v, i, t, s]) => (
          <button key={v} onClick={() => setView(v)} className={`${UI.card} c-lift text-center`}>
            <span className={`${UI.icon} mx-auto mb-3 h-11 w-11 text-lg`}>{i}</span>
            <b className="c-strong block text-[13px]">{t}</b><small className="c-muted text-xs">{s}</small>
          </button>
        ))}
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel title="Your next step" icon="➜"><p className="c-text text-[13px]">Share what is worrying you. We can help you explore safe next steps and connect you with care.</p><button onClick={() => setView('assistant')} className="c-brand mt-3 text-[13px] font-semibold">Start a conversation</button></Panel>
        <Panel title="Virtual doctor" icon="▣">
          {latest ? <p className="c-text text-[13px]">{latest.reason}, {latest.date} at {latest.preferred_time} <Badge s={latest.status} /></p> : <p className="c-text text-[13px]">No meeting requested yet. Choose a date and time to request a consultation.</p>}
          <button onClick={() => setView('doctor')} className="c-brand mt-3 text-[13px] font-semibold">Request a meeting</button>
        </Panel>
      </div>
      <p className="c-muted mt-6 text-center text-xs">Mama Care offers guidance and connection to care. The AI assistant does not diagnose or replace a health professional.</p>
    </>
  );
}

function PatientCalls({ token, toast, loadNotes, setView }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const call = async () => {
    setBusy(true);
    try { await api('/calls', { method: 'POST', token }); setSent(true); loadNotes(); toast('Request sent. A responder will call you soon.'); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <>
      <PageTitle title="Call support" sub="A real person can help you with next steps." />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className={`${UI.card} py-10 text-center`}>
          <div className="relative mx-auto grid h-24 w-24 place-items-center">
            {!sent && <span className="absolute inset-0 animate-ping rounded-full bg-[#d6187d] opacity-20" />}
            <span className="absolute inset-2 rounded-full border border-[#d6187d] opacity-40" />
            <span className={`${UI.icon} relative h-16 w-16 !rounded-full text-2xl`}>☎</span>
            <Ribbon className="absolute -right-4 -top-2 h-8 w-8 text-[#d6187d]" />
          </div>
          <h2 className="c-strong mt-6 text-lg font-bold">{sent ? 'Request received' : "Let's talk it through."}</h2>
          <p className="c-muted mx-auto mt-2 max-w-xs text-[13px]">{sent ? 'Please keep your phone nearby. A Mama Care responder will call you.' : 'Speak with a support person about next steps, referrals or reaching a health facility.'}</p>
          <Btn busy={busy} disabled={sent} onClick={call} className={`${UI.btn} mt-6`}>☎ Request a support call</Btn>
        </div>
        <div className={UI.card}>
          <h2 className="c-strong mb-4 text-base font-bold">Other ways to connect</h2>
          {[['☏', 'Dial from your phone', `Dial the free Mama Care line: ${CONTACT.phone}`], ['✉', 'Text us', 'SMS "REGISTER Your Name" to join, then text any question.']].map(([i, t, s]) => (
            <div key={t} className="mb-4 flex gap-4"><span className={`${UI.icon} h-9 w-9`}>{i}</span><div><b className="c-strong text-[13px]">{t}</b><p className="c-muted text-[13px]">{s}</p></div></div>
          ))}
          <button onClick={() => setView('doctor')} className="c-brand mb-5 text-[13px] font-semibold">Book a virtual doctor</button>
          <div className="c-bad rounded-md border border-rose-500 p-4 text-[13px]"><b>Need urgent medical help?</b> Contact emergency services or go to the nearest health facility now.</div>
        </div>
      </div>
    </>
  );
}

function PatientDoctor({ token, requests, reload, toast }) {
  const empty = { reason: '', date: '', time: '', method: 'Video call', notes: '' };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api('/doctor-requests', { method: 'POST', token, body: f }); setF(empty); reload(); toast('Meeting requested. We will confirm soon.'); }
    catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <>
      <PageTitle title="Virtual doctor" sub="Request a consultation time that works for you." />
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <form onSubmit={submit} className={`${UI.card} space-y-4`}>
          <div><label className={UI.label}>What would you like to discuss?</label>
            <select className={UI.input} value={f.reason} onChange={set('reason')} required>
              <option value="">Choose a reason</option>
              {['Breast health concern', 'Follow-up after a referral', 'General health question', 'Help understanding next steps'].map((r) => <option key={r}>{r}</option>)}
            </select></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={UI.label}>Preferred date</label><input className={UI.input} type="date" min={today()} value={f.date} onChange={set('date')} required /></div>
            <div><label className={UI.label}>Preferred time</label>
              <select className={UI.input} value={f.time} onChange={set('time')} required><option value="">Choose time</option>{TIMES.map((t) => <option key={t}>{t}</option>)}</select></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {['Video call', 'Phone call'].map((m) => (
              <label key={m} className={`c-text flex cursor-pointer items-center gap-3 rounded-md border p-3 text-[13px] transition ${f.method === m ? 'c-soft border-[#d6187d]' : 'c-line'}`}>
                <input type="radio" className="accent-[#d6187d]" checked={f.method === m} onChange={() => setF({ ...f, method: m })} />
                <b>{m}</b><small className="c-muted">{m === 'Video call' ? 'Meet online' : 'Audio only'}</small>
              </label>
            ))}
          </div>
          <div><label className={UI.label}>Anything you want us to know? (optional)</label>
            <textarea className={UI.input} rows={3} maxLength={500} value={f.notes} onChange={set('notes')} placeholder="Share a short note." /></div>
          <Btn busy={busy} className={`${UI.btn} w-full`}>Request meeting</Btn>
        </form>
        <div className="space-y-5">
          <div className={`${UI.card} c-soft`}><DoctorArt /></div>
          <div className={UI.card}>
            <h2 className="c-strong mb-4 text-base font-bold">Your requests</h2>
            {!requests.length && <p className="c-muted text-[13px]">No meeting requested yet.</p>}
            <div className="space-y-3">
              {requests.map((r) => (
                <div key={r.id} className="rounded-md border c-line p-3">
                  <div className="flex items-center justify-between gap-2"><b className="c-strong text-[13px]">{r.reason}</b><Badge s={r.status} /></div>
                  <p className="c-muted text-xs">{r.date} at {r.preferred_time} · {r.method}</p>
                  {r.admin_note && <p className="c-text mt-1 text-[13px]">Note from the team: {r.admin_note}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ================= admin dashboard ================= */
// Five short sidebar entries: Dashboard, three dropdown groups, Reports. Settings and Edit profile live in the profile corner.
const ADMIN_NAV = [
  ['dashboard', 'Dashboard', '⌂'],
  { title: 'Care work', icon: '▤', items: [['new', 'New Requests'], ['cases', 'Cases'], ['referrals', 'Referrals'], ['followup', 'Follow-up']] },
  { title: 'People & places', icon: '☺', items: [['patients', 'Patients'], ['facilities', 'Facilities']] },
  { title: 'Communication', icon: '✉', items: [['assistant', 'AI Assistant'], ['calls', 'Calls & Transcripts'], ['ussd', 'USSD Logs']] },
  ['reports', 'Reports', '◔'],
];

function AdminApp({ token, user, setUser, logout, toast }) {
  const [view, setView] = useState('dashboard');
  const [notes, setNotes] = useState([]);
  const [counts, setCounts] = useState({});
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [patientQ, setPatientQ] = useState('');
  const [tick, setTick] = useState(0);

  const loadNotes = useCallback(() => api('/notifications', { token, quiet: true }).then(setNotes).catch(() => {}), [token]);
  const loadCounts = useCallback(() => api('/admin/counts', { token, quiet: true }).then(setCounts).catch(() => {}), [token]);
  useEffect(() => {
    loadNotes(); loadCounts();
    const i = setInterval(() => { loadNotes(); loadCounts(); }, 30000);
    return () => clearInterval(i);
  }, [loadNotes, loadCounts]);
  const changed = () => { setTick((x) => x + 1); loadCounts(); loadNotes(); };
  const unread = notes.filter((n) => !n.read).length;

  const pick = (type, item) => {
    if (type === 'case') setOpenId(item.id);
    else if (type === 'patient') { setPatientQ(item.name); setView('patients'); }
    else setView('facilities');
  };
  const ctx = { token, toast, go: setView, openCase: setOpenId, addCase: () => setAdding(true), changed };

  return (
    <Shell nav={ADMIN_NAV} view={view} setView={setView} user={user} logout={logout} admin={{ token }} unread={unread} notes={notes} counts={counts} onPick={pick} onAdd={() => setAdding(true)}>
      <div key={`${view}-${tick}`} className="mc-fade">
        {view === 'dashboard' && <Dashboard {...ctx} user={user} />}
        {view === 'new' && <CasesView {...ctx} filter="new" title="New Requests" sub="Requests that nobody has picked up yet." />}
        {view === 'cases' && <CasesView {...ctx} title="Cases" sub="Every case across all channels." />}
        {view === 'referrals' && <ReferralsView {...ctx} />}
        {view === 'followup' && <FollowupsView {...ctx} />}
        {view === 'patients' && <PatientsView {...ctx} initialQ={patientQ} />}
        {view === 'facilities' && <FacilitiesView token={token} toast={toast} admin initialQ="" />}
        {view === 'assistant' && <StaffAssistant {...ctx} />}
        {view === 'calls' && <CallsView {...ctx} />}
        {view === 'ussd' && <UssdView {...ctx} />}
        {view === 'reports' && <ReportsView {...ctx} />}
        {(view === 'settings' || view === 'profile') && <SettingsView {...ctx} user={user} setUser={setUser} />}
        {view === 'alerts' && <NotificationList token={token} notes={notes} reload={loadNotes} />}
      </div>
      {openId && <CaseDrawer id={openId} {...ctx} onClose={() => setOpenId(null)} />}
      {adding && <AddCaseModal {...ctx} onClose={() => setAdding(false)} />}
    </Shell>
  );
}

const ALERT_ICON = { urgent: '⚠', followup: '↻', transport: '⛟', call: '☎' };
const actText = (a) => a.action.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const CH_COLORS = ['#d6187d', '#0f9d6b', '#f472b6', '#34d399', '#9d174d', '#065f46'];

function Dashboard({ token, user, go, openCase, addCase }) {
  const t = useT();
  const [d, load] = useApi('/admin/overview', token);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const i = setInterval(() => { load(true); setNow(new Date()); }, 30000); return () => clearInterval(i); }, [load]);
  if (!d?.stats) return <PageLoading />;
  const S = d.stats;
  const cards = [['Total Requests', S.total, '☺'], ['Active Cases', S.active, '▤'], ['Referrals Made', S.referrals, '✓'], ['Appointments Scheduled', S.appointments, '▦'], ['Follow-ups Pending', S.followups, '♥']];
  const total = d.channels.reduce((a, c) => a + c.count, 0);
  const order = ['new', 'in_progress', 'referred', 'awaiting_followup', 'closed'];
  const sc = Object.fromEntries(d.statuses.map((s) => [s.status, s.count]));
  const first = user.name.split(' ').slice(0, 2).join(' ');

  return (
    <>
      <div className="relative mb-5 overflow-hidden rounded-md bg-gradient-to-r from-[#d6187d] to-[#f472b6] p-5 text-white">
        <Ribbon className="mc-float absolute -right-3 -top-3 h-36 w-36 text-white opacity-20" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{t('Welcome back')}, {first}!</h1>
            <p className="mt-1 text-[13px] text-pink-50">Here is what is happening with Mama Care Rwanda today.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={addCase} className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#b01063] transition hover:shadow-lg active:scale-[.98]">＋ {t('Add New Case')}</button>
              <button onClick={() => go('reports')} className="rounded-md border border-white/70 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10">{t('View Reports')}</button>
            </div>
          </div>
          <p className="hidden rounded-md border border-white/40 px-3 py-2 text-right text-xs font-medium sm:block">{now.toLocaleDateString([], { dateStyle: 'long' })}<br /><span className="text-pink-50">{now.toLocaleTimeString([], { timeStyle: 'short' })}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cards.map(([title, s, i], idx) => (
          <div key={title} className={`${UI.card} c-lift !p-3.5 ${idx === 4 ? 'col-span-2 md:col-span-1' : ''}`}>
            <div className="flex items-center gap-2.5"><span className={`${UI.iconG} h-8 w-8 text-sm`}>{i}</span><p className="c-text text-xs font-medium leading-tight">{t(title)}</p></div>
            <p className="c-strong mt-3 flex flex-wrap items-baseline gap-x-2 text-2xl font-bold">{s.value}<span className={`text-xs font-semibold ${s.change < 0 ? 'c-bad' : 'c-ok'}`}>{s.change < 0 ? '↓' : '↑'} {Math.abs(s.change)}%</span></p>
            <p className="c-muted text-[11px]">vs. last 7 days</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title={t('Requests by Channel')}>
              {!total ? <p className="c-muted py-8 text-center">No requests yet.</p> : (
                <>
                  <p className="c-strong mb-2 text-xl font-bold">{total} <span className="c-muted text-xs font-normal">{t('Total Requests')}</span></p>
                  <div className="mb-4 flex h-2.5 overflow-hidden rounded" role="img" aria-label="Requests by channel">
                    {d.channels.map((c, i) => <div key={c.channel} title={`${CHANNEL[c.channel] || c.channel}: ${c.count}`} style={{ width: `${(c.count / total) * 100}%`, background: CH_COLORS[i % CH_COLORS.length] }} />)}
                  </div>
                  <ul className="space-y-1.5 text-[13px]">
                    {d.channels.map((c, i) => (
                      <li key={c.channel} className="c-text flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CH_COLORS[i % CH_COLORS.length] }} />
                        <span className="flex-1 truncate">{CHANNEL[c.channel] || c.channel}</span><b className="c-strong">{Math.round((c.count / total) * 100)}%</b><span className="c-brand">({c.count})</span></li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
            <Panel title={t('Case Status Overview')}>
              <Bars rows={order.map((k) => ({ label: k, count: sc[k] || 0 }))} color="bg-emerald-500" fmt={(x) => STATUS[x]} />
            </Panel>
          </div>

          <Panel title={t('Recent Cases')} pad={false} action={<button onClick={() => go('cases')} className="font-semibold hover:underline">View all cases →</button>}>
            <Table rows={d.recent} empty="No cases yet. Add the first one." onRow={(r) => openCase(r.id)} cols={[
              { h: 'Case ID', r: (r) => <b className="c-strong">{r.code}</b> }, { h: 'Patient Name', r: (r) => r.patient_name },
              { h: 'Channel', hide: 'hidden md:table-cell', r: (r) => CHANNEL[r.channel] || r.channel }, { h: 'Support Needed', hide: 'hidden lg:table-cell', r: (r) => r.need },
              { h: 'Status', r: (r) => <Badge s={r.status} /> }, { h: 'Assigned To', hide: 'hidden xl:table-cell', r: (r) => r.assigned_to || '—' },
              { h: 'Last Updated', hide: 'hidden sm:table-cell', r: (r) => <span className="whitespace-nowrap">{ago(r.updated_at)}</span> },
            ]} />
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title={t('Quick Actions')} icon="⚡">
            <div className="grid grid-cols-2 gap-2">
              {[[t('Add New Case'), '＋', addCase], [t('Find a Facility'), '⌖', () => go('facilities')], [t('Schedule Doctor'), '▦', () => go('calls')], [t('View Reports'), '◔', () => go('reports')]].map(([l, i, fn]) => (
                <button key={l} onClick={fn} className="c-text c-lift flex flex-col items-center gap-2 rounded-md border c-line p-3 text-center text-xs font-medium"><span className={`${UI.icon} h-8 w-8`}>{i}</span>{l}</button>
              ))}
            </div>
          </Panel>
          <Panel title={t('Urgent Alerts')} icon="🔔" pad={false} action={<button onClick={() => go('alerts')} className="font-semibold hover:underline">{t('View all')} →</button>}>
            {!d.alerts.length ? <p className="c-muted p-5 text-center text-[13px]">No urgent alerts. Nice work.</p> : d.alerts.map((a) => (
              <button key={a.key} onClick={() => go(a.view)} className="c-hov flex w-full items-start gap-3 border-b c-line px-4 py-3 text-left last:border-0">
                <span className={`${UI.icon} h-8 w-8 text-sm ${a.type === 'urgent' ? '!bg-rose-600' : ''}`}>{ALERT_ICON[a.type]}</span>
                <span className="min-w-0 flex-1"><b className="c-strong block text-[13px]">{a.title}</b><small className="c-muted">{a.sub}</small></span>
                <small className="c-muted shrink-0">{ago(a.at)}</small>
              </button>
            ))}
          </Panel>
          <Panel title={t('Recent Activity')} icon="▤" pad={false} action={<button onClick={() => go('reports')} className="font-semibold hover:underline">{t('View all')} →</button>}>
            {!d.activity.length ? <p className="c-muted p-5 text-center text-[13px]">No activity yet.</p> : d.activity.slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-start gap-3 border-b c-line px-4 py-3 last:border-0">
                <span className={`${UI.icon} h-8 w-8 text-sm`}>✓</span>
                <span className="min-w-0 flex-1"><b className="c-strong block text-[13px]">{actText(a)}</b><small className="c-muted break-words">{a.actor || 'System'}{a.target ? ` · ${a.target}` : ''}</small></span>
                <small className="c-muted shrink-0">{ago(a.created_at)}</small>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ---- cases ---- */
function CasesView({ token, filter, title, sub, openCase, addCase }) {
  const [status, setStatus] = useState(filter || '');
  const [ch, setCh] = useState('');
  const [pr, setPr] = useState('');
  const [s, setS] = useState('');
  const ds = useDebounced(s, 350);
  const [rows] = useApi(`/admin/cases?status=${status}&q=${encodeURIComponent(ds)}`, token);
  const list = rows && rows.filter((r) => (!ch || r.channel === ch) && (!pr || r.priority === pr));
  const dirty = s || ch || pr || (!filter && status);
  const clear = () => { setS(''); setCh(''); setPr(''); setStatus(filter || ''); };
  return (
    <>
      <PageTitle title={title} sub={sub}><button onClick={addCase} className={UI.btn}>＋ Add New Case</button></PageTitle>
      <FilterBar>
        <input className={`${UI.input} min-w-[200px] flex-[2]`} placeholder="Search by name, case ID or phone" value={s} onChange={(e) => setS(e.target.value)} aria-label="Search cases" />
        {!filter && <FSelect label="All statuses" value={status} onChange={setStatus} options={Object.entries(STATUS)} />}
        <FSelect label="All channels" value={ch} onChange={setCh} options={Object.entries(CHANNEL)} />
        <FSelect label="Any priority" value={pr} onChange={setPr} options={[['high', 'High'], ['normal', 'Normal']]} />
        {dirty && <button onClick={clear} className={UI.smOut}>Clear</button>}
      </FilterBar>
      <Panel title={`${list ? list.length : '...'} cases`} icon="▤" pad={false}>
        <Table rows={list} empty="No cases found." onRow={(r) => openCase(r.id)} cols={[
          { h: 'Case ID', r: (r) => <b className="c-strong">{r.code}</b> }, { h: 'Patient', r: (r) => <>{r.patient_name}{r.phone && <small className="c-muted block">{r.phone}</small>}</> },
          { h: 'Channel', hide: 'hidden md:table-cell', r: (r) => CHANNEL[r.channel] || r.channel }, { h: 'Support Needed', hide: 'hidden lg:table-cell', r: (r) => r.need },
          { h: 'Priority', hide: 'hidden sm:table-cell', r: (r) => <Badge s={r.priority} /> }, { h: 'Status', r: (r) => <Badge s={r.status} /> },
          { h: 'Assigned To', hide: 'hidden xl:table-cell', r: (r) => r.assigned_to || '—' }, { h: 'Updated', hide: 'hidden md:table-cell', r: (r) => <span className="whitespace-nowrap">{ago(r.updated_at)}</span> },
        ]} />
      </Panel>
    </>
  );
}

function AddCaseModal({ token, toast, onClose, changed, prefill = {} }) {
  const [f, setF] = useState({ patient_name: prefill.name || '', phone: prefill.phone || '', channel: 'community', need: NEEDS[0], priority: 'normal', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const c = await api('/admin/cases', { method: 'POST', token, body: f }); toast(`Case ${c.code} created.`); changed(); onClose(); }
    catch (err) { toast(err.message, 'error'); setBusy(false); }
  };
  return (
    <Modal onClose={onClose}>
      <h2 className="c-strong mb-4 pr-8 text-lg font-bold">Add New Case</h2>
      <form onSubmit={submit} className="space-y-3">
        <div><label className={UI.label}>Patient name</label><input className={UI.input} value={f.patient_name} onChange={set('patient_name')} required autoFocus /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={UI.label}>Phone number</label><input className={UI.input} type="tel" value={f.phone} onChange={set('phone')} placeholder="0788 123 456" /></div>
          <div><label className={UI.label}>Channel</label><select className={UI.input} value={f.channel} onChange={set('channel')}>{Object.entries(CHANNEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><label className={UI.label}>Support needed</label><select className={UI.input} value={f.need} onChange={set('need')}>{NEEDS.map((n) => <option key={n}>{n}</option>)}</select></div>
          <div><label className={UI.label}>Priority</label><select className={UI.input} value={f.priority} onChange={set('priority')}><option value="normal">Normal</option><option value="high">High</option></select></div>
        </div>
        <div><label className={UI.label}>Notes (optional)</label><textarea className={UI.input} rows={3} maxLength={1000} value={f.notes} onChange={set('notes')} /></div>
        <div className="flex flex-wrap gap-3"><Btn busy={busy}>Create case</Btn><button type="button" onClick={onClose} className={UI.out}>Cancel</button></div>
      </form>
    </Modal>
  );
}

function CaseDrawer({ id, token, toast, onClose, changed }) {
  const [d, load] = useApi(`/admin/cases/${id}`, token);
  const [facs] = useApi('/facilities', token);
  const [f, setF] = useState(null);
  const [ref, setRef] = useState({ facility_id: '', reason: '' });
  const [fu, setFu] = useState({ due_date: '', note: '' });
  const [busy, setBusy] = useState('');
  useEffect(() => { if (d?.case) setF({ status: d.case.status, assigned_to: d.case.assigned_to || '', priority: d.case.priority, notes: d.case.notes || '' }); }, [d]);

  const run = async (key, fn, ok) => {
    setBusy(key);
    try { await fn(); toast(ok); load(true); changed(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  };
  if (!d) return <Modal onClose={onClose} wide><PageLoading /></Modal>;
  if (!d.case || !f) return <Modal onClose={onClose} wide><p className="c-muted p-8 text-center">Could not load this case.</p></Modal>;
  const c = d.case;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center gap-3 pr-8">
        <h2 className="c-strong text-lg font-bold">{c.code}</h2><Badge s={c.status} /><Badge s={c.priority} />
      </div>
      <p className="c-text mb-4 text-[13px]"><b className="c-strong">{c.patient_name}</b>{c.phone && ` · ${c.phone}`} · {CHANNEL[c.channel] || c.channel} · {c.need}<br /><small className="c-muted">Opened {when(c.created_at)}</small></p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={UI.label}>Status</label><select className={UI.input} value={f.status} onChange={set('status')}>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label className={UI.label}>Assigned to</label><input className={UI.input} value={f.assigned_to} onChange={set('assigned_to')} placeholder="e.g. Dr. Niyonzima" /></div>
        <div><label className={UI.label}>Priority</label><select className={UI.input} value={f.priority} onChange={set('priority')}><option value="normal">Normal</option><option value="high">High</option></select></div>
        <div className="sm:col-span-2"><label className={UI.label}>Notes</label><textarea className={UI.input} rows={3} value={f.notes} onChange={set('notes')} /></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn busy={busy === 'save'} onClick={() => run('save', () => api(`/admin/cases/${id}`, { method: 'PATCH', token, body: f }), 'Case updated.')}>Save changes</Btn>
        <Btn busy={busy === 'ai'} className={UI.out} onClick={() => run('ai', () => api(`/admin/cases/${id}/summary`, { method: 'POST', token }), 'AI summary ready.')}>✦ AI summary</Btn>
        <Btn busy={busy === 'close'} className={UI.out} onClick={() => run('close', () => api(`/admin/cases/${id}`, { method: 'PATCH', token, body: { status: 'closed' } }), 'Case closed.')}>Close case</Btn>
      </div>
      {c.ai_summary && <div className="c-soft c-text mt-4 whitespace-pre-wrap rounded-md border c-line p-4 text-[13px]"><b className="c-brand mb-1 block">Summary</b>{c.ai_summary}</div>}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-md border c-line p-4">
          <h3 className="c-strong mb-3 text-sm font-semibold">Referral</h3>
          <select className={`${UI.input} mb-2`} value={ref.facility_id} onChange={(e) => setRef({ ...ref, facility_id: e.target.value })} aria-label="Facility">
            <option value="">Choose a facility</option>{(facs || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <input className={`${UI.input} mb-2`} placeholder="Reason (optional)" value={ref.reason} onChange={(e) => setRef({ ...ref, reason: e.target.value })} />
          <Btn busy={busy === 'ref'} className={UI.sm} disabled={!ref.facility_id}
            onClick={() => run('ref', () => api('/admin/referrals', { method: 'POST', token, body: { case_id: id, ...ref } }).then(() => setRef({ facility_id: '', reason: '' })), 'Referral assigned. The patient was notified.')}>Assign referral</Btn>
          <ul className="c-text mt-3 space-y-2 text-[13px]">{d.referrals.map((r) => <li key={r.id} className="flex items-center justify-between gap-2"><span>{r.facility || 'Facility'}</span><Badge s={r.status} /></li>)}</ul>
        </div>
        <div className="rounded-md border c-line p-4">
          <h3 className="c-strong mb-3 text-sm font-semibold">Follow-up</h3>
          <input className={`${UI.input} mb-2`} type="date" min={today()} value={fu.due_date} onChange={(e) => setFu({ ...fu, due_date: e.target.value })} aria-label="Follow-up date" />
          <input className={`${UI.input} mb-2`} placeholder="Note (optional)" value={fu.note} onChange={(e) => setFu({ ...fu, note: e.target.value })} />
          <Btn busy={busy === 'fu'} className={UI.sm} disabled={!fu.due_date}
            onClick={() => run('fu', () => api('/admin/followups', { method: 'POST', token, body: { case_id: id, ...fu } }).then(() => setFu({ due_date: '', note: '' })), 'Follow-up scheduled.')}>Schedule follow-up</Btn>
          <ul className="c-text mt-3 space-y-2 text-[13px]">{d.followups.map((r) => <li key={r.id} className="flex items-center justify-between gap-2"><span>{r.due}{r.note ? ` · ${r.note}` : ''}</span><Badge s={r.status} /></li>)}</ul>
        </div>
      </div>
    </Modal>
  );
}

/* ---- referrals + follow-ups (the "new" form is hidden until you ask for it) ---- */
function ReferralsView({ token, toast, openCase, changed }) {
  const [rows, reload] = useApi('/admin/referrals', token);
  const [facs] = useApi('/facilities', token);
  const [f, setF] = useState({ code: '', facility_id: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [st, setSt] = useState('');
  const add = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api('/admin/referrals', { method: 'POST', token, body: f }); setF({ code: '', facility_id: '', reason: '' }); toast('Referral assigned.'); setShow(false); reload(); changed(); }
    catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };
  const done = async (r) => {
    try { await api(`/admin/referrals/${r.id}`, { method: 'PATCH', token, body: { status: 'completed' } }); toast('Referral completed.'); reload(); changed(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <>
      <PageTitle title="Referrals" sub="Patients sent to a health facility.">
        <FSelect label="All statuses" value={st} onChange={setSt} options={statusOptions(['pending', 'completed'])} className={`${UI.sel} sm:!w-44`} />
        <button onClick={() => setShow(!show)} className={show ? UI.out : UI.btn}>{show ? 'Close form' : '＋ New referral'}</button>
      </PageTitle>
      {show && (
        <form onSubmit={add} className={`${UI.card} mc-fade mb-4 grid gap-3 md:grid-cols-4`}>
          <input className={UI.input} placeholder="Case ID, e.g. MC-1048" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required aria-label="Case ID" />
          <select className={UI.input} value={f.facility_id} onChange={(e) => setF({ ...f, facility_id: e.target.value })} required aria-label="Facility"><option value="">Choose a facility</option>{(facs || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <input className={UI.input} placeholder="Reason (optional)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} aria-label="Reason" />
          <Btn busy={busy}>Save referral</Btn>
        </form>
      )}
      <Panel title="All referrals" icon="⇄" pad={false}>
        <Table rows={byStatus(rows, st)} empty="No referrals found." cols={[
          { h: 'Case', r: (r) => <button onClick={() => openCase(r.case_id)} className="c-brand font-bold hover:underline">{r.code}</button> },
          { h: 'Patient', r: (r) => r.patient_name }, { h: 'Facility', r: (r) => r.facility || '—' }, { h: 'Reason', hide: 'hidden lg:table-cell', r: (r) => r.reason || '—' },
          { h: 'Date', hide: 'hidden md:table-cell', r: (r) => when(r.created_at) }, { h: 'Status', r: (r) => <Badge s={r.status} /> },
          { h: 'Action', r: (r) => r.status === 'pending' && <button onClick={() => done(r)} className={UI.sm}>Mark completed</button> },
        ]} />
      </Panel>
    </>
  );
}

function FollowupsView({ token, toast, openCase, changed }) {
  const [rows, reload] = useApi('/admin/followups', token);
  const [f, setF] = useState({ code: '', due_date: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(null);
  const [show, setShow] = useState(false);
  const [st, setSt] = useState('');
  const add = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api('/admin/followups', { method: 'POST', token, body: f }); setF({ code: '', due_date: '', note: '' }); toast('Follow-up scheduled.'); setShow(false); reload(); changed(); }
    catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };
  const act = async (r, kind) => {
    setWait(r.id + kind);
    try {
      if (kind === 'msg') { await api(`/admin/followups/${r.id}/message`, { method: 'POST', token }); toast('Follow-up message sent.'); }
      else { await api(`/admin/followups/${r.id}`, { method: 'PATCH', token, body: { status: 'done' } }); toast('Follow-up done.'); changed(); }
      reload();
    } catch (e) { toast(e.message, 'error'); } finally { setWait(null); }
  };
  return (
    <>
      <PageTitle title="Follow-up" sub="Check-ins so that no patient is forgotten.">
        <FSelect label="All statuses" value={st} onChange={setSt} options={statusOptions(['pending', 'done'])} className={`${UI.sel} sm:!w-44`} />
        <button onClick={() => setShow(!show)} className={show ? UI.out : UI.btn}>{show ? 'Close form' : '＋ Schedule follow-up'}</button>
      </PageTitle>
      {show && (
        <form onSubmit={add} className={`${UI.card} mc-fade mb-4 grid gap-3 md:grid-cols-4`}>
          <input className={UI.input} placeholder="Case ID, e.g. MC-1048" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required aria-label="Case ID" />
          <input className={UI.input} type="date" min={today()} value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} required aria-label="Follow-up date" />
          <input className={UI.input} placeholder="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} aria-label="Note" />
          <Btn busy={busy}>Save follow-up</Btn>
        </form>
      )}
      <Panel title="All follow-ups" icon="☑" pad={false}>
        <Table rows={byStatus(rows, st)} empty="No follow-ups found." cols={[
          { h: 'Case', r: (r) => <button onClick={() => openCase(r.case_id)} className="c-brand font-bold hover:underline">{r.code}</button> },
          { h: 'Patient', r: (r) => <>{r.patient_name}{r.phone && <small className="c-muted block">{r.phone}</small>}</> },
          { h: 'Due', r: (r) => <span className={r.overdue ? 'c-bad font-bold' : ''}>{r.due}{r.overdue && ' (overdue)'}</span> },
          { h: 'Note', hide: 'hidden md:table-cell', r: (r) => r.note || '—' }, { h: 'Status', r: (r) => <Badge s={r.status} /> },
          { h: 'Actions', r: (r) => r.status === 'pending' && (
            <div className="flex flex-wrap gap-2">
              <Btn busy={wait === r.id + 'msg'} className={UI.smOut} onClick={() => act(r, 'msg')}>Send message</Btn>
              <Btn busy={wait === r.id + 'done'} className={UI.sm} onClick={() => act(r, 'done')}>Mark done</Btn>
            </div>) },
        ]} />
      </Panel>
    </>
  );
}

/* ---- patients ---- */
function PatientsView({ token, initialQ, changed, toast }) {
  const [s, setS] = useState(initialQ || '');
  const [src, setSrc] = useState('');
  const ds = useDebounced(s, 350);
  const [rows] = useApi(`/admin/patients?q=${encodeURIComponent(ds)}`, token);
  const [add, setAdd] = useState(null);
  const sources = rows ? [...new Set(rows.map((r) => r.source).filter(Boolean))] : [];
  const list = rows && rows.filter((r) => !src || r.source === src);
  return (
    <>
      <PageTitle title="Patients" sub="Everyone registered on web, SMS or Google." />
      <FilterBar>
        <input className={`${UI.input} min-w-[200px] flex-[2]`} placeholder="Search name, phone or email" value={s} onChange={(e) => setS(e.target.value)} aria-label="Search patients" />
        <FSelect label="Joined via (all)" value={src} onChange={setSrc} options={sources.map((x) => [x, x.charAt(0).toUpperCase() + x.slice(1)])} />
        {(s || src) && <button onClick={() => { setS(''); setSrc(''); }} className={UI.smOut}>Clear</button>}
      </FilterBar>
      <Panel title="Registered patients" icon="☺" pad={false}>
        <Table rows={list} empty="No patients found." cols={[
          { h: 'Name', r: (r) => <b className="c-strong">{r.name}</b> }, { h: 'Contact', r: (r) => r.phone || r.email || '—' },
          { h: 'Joined via', hide: 'hidden md:table-cell', r: (r) => <span className="capitalize">{r.source}</span> }, { h: 'Cases', hide: 'hidden sm:table-cell', r: (r) => r.cases },
          { h: 'Joined', hide: 'hidden lg:table-cell', r: (r) => when(r.created_at) }, { h: 'Last login', hide: 'hidden xl:table-cell', r: (r) => (r.last_login ? ago(r.last_login) : 'Never') },
          { h: 'Action', r: (r) => <button onClick={() => setAdd(r)} className={UI.smOut}>＋ New case</button> },
        ]} />
      </Panel>
      {add && <AddCaseModal token={token} toast={toast} changed={changed} prefill={{ name: add.name, phone: add.phone }} onClose={() => setAdd(null)} />}
    </>
  );
}

/* ---- AI assistant + flagged questions ---- */
function StaffAssistant({ token, toast }) {
  const [tab, setTab] = useState('ask');
  const ask = async (text, history) => ({ text: (await api('/admin/assistant', { method: 'POST', token, body: { text, history } })).answer });
  return (
    <>
      <PageTitle title="AI Assistant" sub="Guidance for staff, and questions that patients flagged as serious." />
      <Tabs value={tab} onChange={setTab} tabs={[['ask', 'Ask the assistant'], ['flagged', 'Flagged questions']]} />
      {tab === 'ask' && <Chat ask={ask} hello="Hello! Ask me about triage questions, referral steps, or how to explain next steps to a patient. I cannot diagnose."
        suggestions={['What should I ask a patient who found a lump?', 'How do I explain a referral in simple words?', 'Which symptoms need urgent escalation?']} />}
      {tab === 'flagged' && <FlaggedQuestions token={token} toast={toast} />}
    </>
  );
}

function FlaggedQuestions({ token, toast }) {
  const [only, setOnly] = useState(true);
  const [rows, reload] = useApi(`/admin/questions?flagged=${only ? 1 : 0}`, token);
  const [wait, setWait] = useState(null);
  const resolve = async (id) => {
    setWait(id);
    try { await api(`/admin/questions/${id}`, { method: 'PATCH', token }); toast('Marked as resolved.'); reload(); } catch (e) { toast(e.message, 'error'); } finally { setWait(null); }
  };
  return (
    <Panel title="Patient questions" icon="⚑" pad={false} action={<label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="accent-[#d6187d]" checked={only} onChange={() => setOnly(!only)} /> Flagged only</label>}>
      <Table rows={rows} empty="No questions yet." cols={[
        { h: 'From', r: (r) => <><b className="c-strong">{r.name || 'Unregistered'}</b><small className="c-muted block">{r.phone || 'web'} · {r.source}</small></> },
        { h: 'Question', r: (r) => <span className="block max-w-xs">{r.flagged && <b className="c-bad mr-1">⚑</b>}{r.body}</span> },
        { h: 'AI answer', hide: 'hidden lg:table-cell', r: (r) => <span className="c-muted block max-w-xs">{(r.ai_answer || '').slice(0, 140)}</span> },
        { h: 'Time', hide: 'hidden md:table-cell', r: (r) => when(r.created_at) },
        { h: 'Status', r: (r) => r.status === 'open' ? <Btn busy={wait === r.id} className={UI.sm} onClick={() => resolve(r.id)}>Resolve</Btn> : <Badge s="resolved" /> },
      ]} />
    </Panel>
  );
}

/* ---- calls, transcripts, virtual doctor ---- */
function CallsView({ token, toast, changed }) {
  const [tab, setTab] = useState('calls');
  const [calls, reloadCalls] = useApi('/admin/calls', token);
  const [docs, reloadDocs] = useApi('/doctor-requests', token);
  const [tr, setTr] = useState(null);
  const [wait, setWait] = useState(null);
  const [st, setSt] = useState('');

  const setCall = async (id, status) => {
    setWait(id + status);
    try { await api(`/admin/calls/${id}`, { method: 'PATCH', token, body: { status } }); toast('Call updated.'); reloadCalls(); changed(); } catch (e) { toast(e.message, 'error'); } finally { setWait(null); }
  };
  const actDoc = async (id, status) => {
    const admin_note = status === 'rejected' ? window.prompt('Short note for the patient (optional)') || '' : '';
    setWait(id + status);
    try { await api(`/doctor-requests/${id}`, { method: 'PATCH', token, body: { status, admin_note } }); toast(`Request ${status}.`); reloadDocs(); changed(); } catch (e) { toast(e.message, 'error'); } finally { setWait(null); }
  };
  const switchTab = (k) => { setTab(k); setSt(''); };
  return (
    <>
      <PageTitle title="Calls & Transcripts" sub="Support calls, call notes and virtual doctor meetings.">
        <FSelect label="All statuses" value={st} onChange={setSt} className={`${UI.sel} sm:!w-44`}
          options={statusOptions(tab === 'calls' ? ['pending', 'contacted', 'done'] : ['pending', 'approved', 'rejected', 'completed'])} />
      </PageTitle>
      <Tabs value={tab} onChange={switchTab} tabs={[['calls', 'Support calls'], ['doctor', 'Virtual doctor']]} />
      {tab === 'calls' && (
        <Panel title="Call requests" icon="☎" pad={false}>
          <Table rows={byStatus(calls, st)} empty="No call requests found." cols={[
            { h: 'Patient', r: (r) => <b className="c-strong">{r.name}</b> }, { h: 'Phone', r: (r) => r.phone || 'No phone saved' },
            { h: 'Requested', hide: 'hidden md:table-cell', r: (r) => when(r.created_at) }, { h: 'Status', r: (r) => <Badge s={r.status} /> },
            { h: 'Transcript', r: (r) => <button onClick={() => setTr(r)} className={UI.smOut}>{r.transcript ? 'View / edit' : 'Add notes'}</button> },
            { h: 'Actions', r: (r) => (
              <div className="flex flex-wrap gap-2">
                {r.status === 'pending' && <Btn busy={wait === r.id + 'contacted'} className={UI.smOut} onClick={() => setCall(r.id, 'contacted')}>Mark contacted</Btn>}
                {r.status !== 'done' && <Btn busy={wait === r.id + 'done'} className={UI.sm} onClick={() => setCall(r.id, 'done')}>Mark done</Btn>}
              </div>) },
          ]} />
        </Panel>
      )}
      {tab === 'doctor' && (
        <Panel title="Virtual doctor requests" icon="▣" pad={false}>
          <Table rows={byStatus(docs, st)} empty="No doctor requests found." cols={[
            { h: 'Patient', r: (r) => <><b className="c-strong">{r.name}</b><small className="c-muted block">{r.phone}</small></> },
            { h: 'Reason', hide: 'hidden md:table-cell', r: (r) => <>{r.reason}{r.notes && <small className="c-muted block">{r.notes}</small>}</> },
            { h: 'When', r: (r) => `${r.date}, ${r.preferred_time}` }, { h: 'Method', hide: 'hidden lg:table-cell', r: (r) => r.method }, { h: 'Status', r: (r) => <Badge s={r.status} /> },
            { h: 'Actions', r: (r) => (
              <div className="flex flex-wrap gap-2">
                {r.status === 'pending' && <><Btn busy={wait === r.id + 'approved'} className={UI.sm} onClick={() => actDoc(r.id, 'approved')}>Approve</Btn><Btn busy={wait === r.id + 'rejected'} className={UI.danger} onClick={() => actDoc(r.id, 'rejected')}>Reject</Btn></>}
                {r.status === 'approved' && <Btn busy={wait === r.id + 'completed'} className={UI.smOut} onClick={() => actDoc(r.id, 'completed')}>Mark completed</Btn>}
              </div>) },
          ]} />
        </Panel>
      )}
      {tr && <TranscriptModal call={tr} token={token} toast={toast} onClose={() => setTr(null)} done={() => { setTr(null); reloadCalls(); }} />}
    </>
  );
}

function TranscriptModal({ call, token, toast, onClose, done }) {
  const [text, setText] = useState(call.transcript || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api(`/admin/calls/${call.id}`, { method: 'PATCH', token, body: { transcript: text } }); toast('Transcript saved.'); done(); }
    catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  return (
    <Modal onClose={onClose}>
      <h2 className="c-strong mb-1 pr-8 text-lg font-bold">Call notes</h2>
      <p className="c-muted mb-4 text-[13px]">{call.name} · {when(call.created_at)}</p>
      <textarea className={UI.input} rows={9} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write what was discussed and the agreed next step." aria-label="Transcript" />
      <div className="mt-4 flex flex-wrap gap-3"><Btn busy={busy} onClick={save}>Save transcript</Btn><button onClick={onClose} className={UI.out}>Cancel</button></div>
    </Modal>
  );
}

/* ---- USSD + SMS ---- */
function UssdView({ token, toast }) {
  const [tab, setTab] = useState('ussd');
  const [ussd] = useApi('/admin/ussd', token);
  const [sms, reload] = useApi('/admin/sms', token);
  const [f, setF] = useState({ phone: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [dir, setDir] = useState('');
  const send = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api('/admin/sms', { method: 'POST', token, body: f }); setF({ phone: '', body: '' }); toast('SMS sent.'); reload(); } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const smsRows = sms && dir ? sms.filter((r) => r.direction === dir) : sms;
  return (
    <>
      <PageTitle title="USSD Logs" sub={`Sessions on ${CONTACT.phone} and the SMS inbox.`}>
        {tab === 'sms' && <FSelect label="All messages" value={dir} onChange={setDir} options={[['in', 'Received'], ['out', 'Sent']]} className={`${UI.sel} sm:!w-44`} />}
      </PageTitle>
      <Tabs value={tab} onChange={setTab} tabs={[['ussd', 'USSD sessions'], ['sms', 'SMS inbox']]} />
      {tab === 'ussd' && (
        <Panel title="USSD sessions" icon="▦" pad={false}>
          <Table rows={ussd} empty="No USSD sessions yet. Set the USSD callback URL at your provider." cols={[
            { h: 'Phone', r: (r) => <b className="c-strong">{r.phone}</b> }, { h: 'Input', r: (r) => r.input || '(opened menu)' },
            { h: 'Response', hide: 'hidden md:table-cell', r: (r) => <span className="c-muted block max-w-md whitespace-pre-wrap">{r.response}</span> }, { h: 'Time', r: (r) => when(r.created_at) },
          ]} />
        </Panel>
      )}
      {tab === 'sms' && (
        <>
          <form onSubmit={send} className={`${UI.card} mb-4 flex flex-wrap gap-3`}>
            <input className={`${UI.input} sm:!w-56`} placeholder="Phone number" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required aria-label="Phone number" />
            <input className={`${UI.input} min-w-[200px] flex-1`} placeholder="Write a message (max 300 characters)" maxLength={300} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required aria-label="Message" />
            <Btn busy={busy}>Send SMS</Btn>
          </form>
          <Panel title="Messages" icon="✉" pad={false}>
            <Table rows={smsRows} empty="No SMS messages found." cols={[
              { h: 'Direction', r: (r) => <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${r.direction === 'in' ? 'bg-[#d6187d] text-white' : 'bg-slate-500 text-white'}`}>{r.direction === 'in' ? 'Received' : 'Sent'}</span> },
              { h: 'Phone', r: (r) => <><b className="c-strong">{r.name || r.phone}</b>{r.name && <small className="c-muted block">{r.phone}</small>}</> },
              { h: 'Message', r: (r) => <span className="block max-w-md">{r.body}</span> }, { h: 'Time', hide: 'hidden md:table-cell', r: (r) => when(r.created_at) },
            ]} />
          </Panel>
        </>
      )}
    </>
  );
}

/* ---- reports ---- */
function ReportsView({ token, toast }) {
  const [days, setDays] = useState(30);
  const [r] = useApi(`/admin/reports?days=${days}`, token);
  const [act] = useApi('/admin/activity', token);
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true); bump(1);
    try {
      const res = await fetch(`${API_URL}/api/admin/reports/cases.csv`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Could not export the file.');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await res.blob());
      a.download = 'mama-care-cases.csv';
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Export ready.');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); bump(-1); }
  };
  const max = r?.daily ? Math.max(1, ...r.daily.map((x) => x.count)) : 1;
  return (
    <>
      <PageTitle title="Reports" sub="Numbers to share with partners and the care team.">
        <select className={`${UI.sel} sm:!w-40`} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">{[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select>
        <Btn busy={busy} className={UI.out} onClick={download}>⬇ Export cases (CSV)</Btn>
      </PageTitle>
      {!r?.byChannel ? <PageLoading /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            {[['Cases opened', r.total], ['Cases closed', r.closed], ['Closure rate', `${r.total ? Math.round((r.closed / r.total) * 100) : 0}%`]].map(([l, v]) => (
              <div key={l} className={`${UI.card} c-lift`}><p className="c-muted text-xs">{l}</p><p className="c-brand text-2xl font-bold">{v}</p></div>
            ))}
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <Panel title="By channel"><Bars rows={r.byChannel} fmt={(x) => CHANNEL[x] || x} /></Panel>
            <Panel title="By support needed"><Bars rows={r.byNeed} color="bg-emerald-500" /></Panel>
            <Panel title="By status"><Bars rows={r.byStatus} color="bg-lime-500" fmt={(x) => STATUS[x] || x} /></Panel>
          </div>
          <Panel title="Cases per day" className="mt-5">
            {!r.daily.length ? <p className="c-muted">No cases in this period.</p> : (
              <div className="flex h-36 items-end gap-1 overflow-x-auto border-b c-line">
                {r.daily.map((x) => <div key={x.label} title={`${x.label}: ${x.count}`} className="min-w-3 flex-1 rounded-t bg-[#d6187d]" style={{ height: `${(x.count / max) * 100}%`, minHeight: 3 }} />)}
              </div>
            )}
          </Panel>
        </>
      )}
      <Panel title="Activity history" icon="◷" pad={false} className="mt-5">
        <Table rows={act} cols={[
          { h: 'Who', r: (a) => <b className="c-strong">{a.actor || 'System'}</b> }, { h: 'Action', r: (a) => actText(a) },
          { h: 'Target', hide: 'hidden sm:table-cell', r: (a) => a.target || '—' }, { h: 'Detail', hide: 'hidden lg:table-cell', r: (a) => a.detail || '—' }, { h: 'Time', hide: 'hidden md:table-cell', r: (a) => when(a.created_at) },
        ]} />
      </Panel>
    </>
  );
}

/* ---- settings (also opened by "Edit profile" in the profile corner) ---- */
function SettingsView({ token, user, setUser, toast }) {
  const [sys] = useApi('/admin/system', token);
  const [pin, setPin] = useState({ current: '', pin: '' });
  const [busy, setBusy] = useState(false);
  const l = useLang();
  const th = useTheme();
  const savePin = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api('/me/pin', { method: 'POST', token, body: pin }); setPin({ current: '', pin: '' }); toast('PIN changed.'); } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const on = (v) => <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${v ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>{v ? 'Connected' : 'Not set'}</span>;
  return (
    <>
      <PageTitle title="Settings" sub="Your account, language, appearance and connected services." />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <ProfileForm token={token} user={user} setUser={setUser} toast={toast} />
          <form onSubmit={savePin} className={`${UI.card} max-w-xl space-y-4`}>
            <h2 className="c-strong text-sm font-bold">Change PIN</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={UI.input} type="password" placeholder="Current PIN" value={pin.current} onChange={(e) => setPin({ ...pin, current: e.target.value })} aria-label="Current PIN" />
              <input className={UI.input} type="password" placeholder="New PIN (4 to 8)" minLength={4} maxLength={8} value={pin.pin} onChange={(e) => setPin({ ...pin, pin: e.target.value })} required aria-label="New PIN" />
            </div>
            <Btn busy={busy}>Change PIN</Btn>
          </form>
        </div>
        <div className="space-y-5">
          <Panel title="Language and appearance" icon="🌐">
            <p className="c-muted mb-2 text-xs font-semibold">Language</p>
            <div className="flex flex-wrap gap-2">{[['en', 'English'], ['rw', 'Kinyarwanda']].map(([k, n]) => <button key={k} onClick={() => setLang(k)} className={l === k ? UI.btn : UI.out}>{n}</button>)}</div>
            <p className="c-muted mb-2 mt-5 text-xs font-semibold">Appearance</p>
            <div className="flex flex-wrap gap-2">{[['light', '☀ Light'], ['dark', '☾ Dark']].map(([k, n]) => <button key={k} onClick={() => setTheme(k)} className={th === k ? UI.btn : UI.out}>{n}</button>)}</div>
            <p className="c-muted mt-3 text-[13px]">Menus and dashboard titles switch language. Patient messages stay as written.</p>
          </Panel>
          <Panel title="Connected services" icon="⚙">
            {!sys?.model ? <PageLoading /> : (
              <ul className="c-text space-y-3 text-[13px]">
                <li className="flex items-center justify-between gap-3"><span>AI assistant (OpenAI, {sys.model})</span>{on(sys.ai)}</li>
                <li className="flex items-center justify-between gap-3"><span>SMS (Africa's Talking)</span>{on(sys.sms)}</li>
                <li className="flex items-center justify-between gap-3"><span>USSD and SMS webhook key</span>{on(sys.ussd)}</li>
                <li className="flex items-center justify-between gap-3"><span>Google sign-in</span>{on(sys.google)}</li>
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ================= root ================= */
export default function Home() {
  const [token, setToken] = useState(store.get());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!store.get());
  const [authMode, setAuthMode] = useState(null);
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  const th = useTheme();

  const toast = (text, type = 'ok') => {
    setMsg({ text, type });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3500);
  };

  // Real Poppins from Google Fonts
  useEffect(() => {
    if (document.getElementById('app-font')) return;
    const pre = document.createElement('link');
    pre.rel = 'preconnect'; pre.href = 'https://fonts.gstatic.com'; pre.crossOrigin = 'anonymous';
    document.head.appendChild(pre);
    const l = document.createElement('link');
    l.id = 'app-font';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }, []);

  // keep the page behind the app in the same colour, so overscroll never flashes white in dark mode
  useEffect(() => {
    document.documentElement.style.background = th === 'dark' ? '#000000' : '#ffffff';
    document.documentElement.style.colorScheme = th;
    document.body.style.margin = '0';
    document.body.style.background = th === 'dark' ? '#000000' : '#ffffff';
  }, [th]);

  useEffect(() => {
    if (!token) return;
    api('/me', { token, quiet: true }).then((d) => setUser(d.user)).catch(() => { store.set(null); setToken(null); }).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onAuth = ({ token: t, user: u }) => { store.set(t); setToken(t); setUser(u); setAuthMode(null); toast(`Welcome, ${u.name.split(' ')[0]}!`); };
  const logout = () => { store.set(null); setToken(null); setUser(null); toast('You are signed out. Take care and stay healthy!'); };

  let screen;
  if (loading) screen = <div className="grid min-h-screen place-items-center"><PageLoading /></div>;
  else if (!user) screen = <Landing open={setAuthMode} />;
  else if (user.role === 'admin') screen = <AdminApp token={token} user={user} setUser={setUser} logout={logout} toast={toast} />;
  else screen = <PatientApp token={token} user={user} setUser={setUser} logout={logout} toast={toast} />;

  // overflow-x-clip (not hidden) so scrolling and sticky headers keep working
  return (
    <div className="mc c-bg c-text min-h-screen overflow-x-clip text-[13px] antialiased" data-theme={th}>
      <style>{CSS}</style>
      <GlobalLoader />
      {screen}
      {!user && authMode && <AuthModal start={authMode} onClose={() => setAuthMode(null)} onAuth={onAuth} toast={toast} />}
      {msg && (
        <div role="status" className={`mc-fade c-surf fixed bottom-6 left-1/2 z-[110] max-w-[90vw] -translate-x-1/2 rounded-md border px-5 py-3 text-[13px] font-semibold shadow-xl ${msg.type === 'error' ? 'border-rose-400 c-bad' : 'border-[#d6187d] c-brand'}`}>{msg.text}</div>
      )}
    </div>
  );
}