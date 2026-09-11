"use client";
import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ──────────────────────────────────────────────────────────────────
interface Loc {
  num: number; name: string; x: number; y: number;
  cats: string[]; desc: string; photo?: string;
}
interface Step { icon: string; text: string; meters: number; }

// ── Building photos ────────────────────────────────────────────────────────
const PHOTOS: Record<number, string> = {
  3:  '/buildings/tarihi-giris.jpg',
  4:  '/buildings/bt.jpg',
  5:  '/buildings/revir.jpg',
  6:  '/buildings/odm.jpg',
  8:  '/buildings/etkinlik-cadiri.jpg',
  9:  '/buildings/gastronomi.jpg',
  12: '/buildings/e5.jpg',
  13: '/buildings/e6.jpg',
  14: '/buildings/mimarlik-kd4.jpg',
  15: '/buildings/kutuphane.jpg',
  16: '/buildings/mimarlik-kd4.jpg',
  19: '/buildings/csm-siniflar.jpg',
  22: '/buildings/midl.jpg',
  23: '/buildings/espressolab.jpg',
};

// ── 42 Buildings (map4 positions) ──────────────────────────────────────────
const RAW_LOCS = [
  {num:1,  name:'Amfi',                    x:91.09,y:51.60,cats:['sosyal','işlevsel'],   desc:'Açık hava etkinlikleri, konserler ve törenler için kullanılan amfi; kampüsün en büyük toplanma alanıdır.'},
  {num:2,  name:'Otopark Girişi',          x:77.81,y:34.27,cats:['otopark'],             desc:'Kampüs araç girişine hizmet eden ana otopark giriş kapısıdır. Güvenlik noktası ve bariyer sistemi bulunmaktadır.'},
  {num:3,  name:'Tarihi Giriş',            x:64.17,y:32.22,cats:['giriş'],              desc:'Kampüsün tarihi ana kapısı; yayalar için giriş-çıkış noktası olarak kullanılmaktadır.'},
  {num:4,  name:'BT',                      x:61.51,y:33.89,cats:['idari'],              desc:'Bilgi İşlem ve Bilişim Teknolojileri birimi bu binada yer almaktadır.'},
  {num:5,  name:'Revir',                   x:68.18,y:41.46,cats:['işlevsel'],           desc:'Kampüs sağlık birimi; ilk yardım, hasta kabulü ve sağlık danışmanlığı hizmetleri sunmaktadır.'},
  {num:6,  name:'Öğrenci Destek Merkezi', x:67.86,y:45.19,cats:['idari'],              desc:'Akademik danışmanlık, psikolojik destek ve kariyer hizmetleri sunan öğrenci merkezi.'},
  {num:7,  name:'Kuluçka',                x:72.29,y:49.55,cats:['işlevsel'],           desc:'Girişimcilik kuluçka merkezi; öğrenci projelerine mentorluk ve çalışma alanı sağlamaktadır.'},
  {num:8,  name:'Etkinlik Çadırı',         x:64.58,y:47.24,cats:['sosyal'],             desc:'Büyük etkinlikler ve kariyer fuarları için çok amaçlı etkinlik çadırı alanı.'},
  {num:9,  name:'Gastronomi Mutfak',       x:57.92,y:44.80,cats:['eğitsel'],            desc:'Gastronomi bölümüne ait uygulama laboratuvar mutfağı.'},
  {num:10, name:'Misafir Girişi',          x:48.44,y:45.57,cats:['giriş'],              desc:'Dış ziyaretçi ve misafir araç girişine ayrılmış güvenlik kontrollü giriş kapısı.'},
  {num:11, name:'Otopark',                x:60.42,y:61.49,cats:['otopark'],            desc:'Kampüs genelindeki araç parkını sağlayan açık ve kapalı otopark bölgesi.'},
  {num:12, name:'E-5',                    x:58.65,y:29.91,cats:['eğitsel'],            desc:'E-5 akademik binası; ileri mühendislik laboratuvarları ve dersliklerden oluşmaktadır.'},
  {num:13, name:'E-6',                    x:58.65,y:35.69,cats:['eğitsel'],            desc:'E-6 akademik binası; derslikler ve araştırma odalarını barındıran eğitim kompleksidir.'},
  {num:14, name:'Mimarlık',               x:56.82,y:34.66,cats:['eğitsel'],            desc:'Mimarlık fakültesi ana binası; tasarım atölyeleri ve stüdyolardan oluşan yaratıcı öğrenme ortamı.'},
  {num:15, name:'Kütüphane',             x:55.57,y:38.77,cats:['eğitsel','sosyal'],   desc:'50.000\'den fazla kaynak ile zengin dijital veri tabanlarına erişim sağlayan merkez kütüphane.'},
  {num:16, name:'KD4 – Mimarlık',        x:52.55,y:34.66,cats:['eğitsel'],            desc:'Mimarlık bölümüne ait KD4 yapısı; dijital fabrikasyon stüdyosu ve sunum salonlarını barındırmaktadır.'},
  {num:17, name:'Enerji Müzesi',         x:51.04,y:27.47,cats:['sosyal'],             desc:'Yenilenebilir enerji sistemleri konusunda interaktif sergi ve eğitim içerikleri sunan müze.'},
  {num:18, name:'Seyfi Arıkan',          x:48.96,y:22.72,cats:['eğitsel'],            desc:'Seyfi Arıkan konferans salonu; sempozyumlar ve büyük ölçekli etkinlikler için kullanılmaktadır.'},
  {num:19, name:'ÇSM Sınıflar',          x:46.46,y:32.60,cats:['eğitsel'],            desc:'Çok amaçlı spor merkezi sınıf bölümü; beden eğitimi ve spor teorisi derslerinin yapıldığı alan.'},
  {num:20, name:'ÇSM Ofisler',           x:41.77,y:29.91,cats:['eğitsel','idari'],    desc:'Çok amaçlı spor merkezi idari ofisleri; spor kulüpleri koordinasyonu buradan yürütülür.'},
  {num:21, name:'E-4',                   x:44.11,y:24.39,cats:['eğitsel'],            desc:'E-4 akademik binası; mühendislik dersliklerini ve bilgisayar laboratuvarlarını barındırmaktadır.'},
  {num:22, name:'MIDL',                  x:40.42,y:34.66,cats:['sosyal'],             desc:'Medya ve İletişim Tasarım Laboratuvarı; ses kayıt ve video prodüksiyon ekipmanlarıyla donatılmış atölye.'},
  {num:23, name:'Espressolab',           x:46.20,y:41.08,cats:['sosyal'],             desc:'Kampüs içindeki Espressolab kafesi; filtre kahve, espresso ve hafif atıştırmalık seçenekleri sunmaktadır.'},
  {num:24, name:'Lokma',                 x:43.70,y:39.79,cats:['sosyal'],             desc:'Geleneksel lezzetler sunan Lokma restoranı; değişen günlük menüleriyle hizmet vermektedir.'},
  {num:25, name:'Blab',                  x:35.16,y:35.30,cats:['sosyal'],             desc:'Business Lab (Blab); girişimcilik ve iş geliştirme projelerine odaklanan açık çalışma ve buluşma alanı.'},
  {num:26, name:'Banka',                 x:37.66,y:36.97,cats:['işlevsel'],           desc:'Kampüs içindeki banka şubesi; hesap işlemleri, EFT/havale ve burs ödemeleri için hizmet vermektedir.'},
  {num:27, name:'EN-1',                  x:35.99,y:40.70,cats:['idari'],              desc:'EN-1 idari binası; fakülte yönetim ofisleri ve öğrenci işleri birimleri bu yapıda yer almaktadır.'},
  {num:28, name:'E-3',                   x:33.33,y:23.11,cats:['eğitsel'],            desc:'E-3 mühendislik binası; temel mühendislik derslikleri ve fizik-kimya laboratuvarlarını barındırmaktadır.'},
  {num:29, name:'Rektörlük',             x:28.23,y:26.44,cats:['idari'],              desc:'Üniversite rektörlük binası; üst yönetim ofisleri ve resmi toplantı salonlarını barındırmaktadır.'},
  {num:30, name:'L3',                    x:17.86,y:28.11,cats:['eğitsel'],            desc:'L3 binası; çok amaçlı derslik ve proje çalışma alanlarından oluşan akademik yapı.'},
  {num:31, name:'L2',                    x:23.02,y:34.66,cats:['idari'],              desc:'L2 idari ve akademik binası; bölüm yönetim ofisleri ve öğretim üyesi çalışma odalarını barındırmaktadır.'},
  {num:32, name:'L1',                    x:15.26,y:32.22,cats:['eğitsel','idari'],    desc:'L1 binası; derslikler, ofisler ve yönetim birimleriyle kampüsün merkezî akademik yapılarından biridir.'},
  {num:33, name:'E-2',                   x:10.57,y:27.86,cats:['eğitsel'],            desc:'E-2 mühendislik binası; elektronik ve bilgisayar mühendisliği dersliklerini barındırmaktadır.'},
  {num:34, name:'E-1',                   x:15.00,y:48.27,cats:['eğitsel'],            desc:'E-1 mühendislik binası; kampüsün en eski akademik yapılarından biridir.'},
  {num:35, name:'ATM',                   x:21.88,y:49.94,cats:['işlevsel'],           desc:'Kampüs içindeki 7/24 hizmet veren ATM noktası.'},
  {num:36, name:'Kuaför',                x:22.71,y:50.96,cats:['sosyal','işlevsel'],  desc:'Kampüs kuaför salonu; saç kesimi ve bakım hizmetlerini uygun fiyatlarla sunmaktadır.'},
  {num:37, name:'Nero',                  x:24.38,y:50.58,cats:['sosyal'],             desc:'Nero kafesi; çeşitli sıcak-soğuk içecekler ve sandviçlerle kampüste önemli bir sosyal mekân işlevi görmektedir.'},
  {num:38, name:'Starbucks',             x:24.11,y:53.02,cats:['sosyal'],             desc:'Kampüs Starbucks Corner; klasik Starbucks menüsü ile hizmet vermektedir.'},
  {num:39, name:'Sunpeak',               x:26.56,y:52.37,cats:['sosyal'],             desc:'Sunpeak kafe alanı; güneşli terasında çay, kahve ve hafif yiyecek seçenekleri sunmaktadır.'},
  {num:40, name:'Yemekhane',             x:22.03,y:54.04,cats:['sosyal'],             desc:'Kampüs ana yemekhane; günlük değişen menülerle öğrenci ve personele yemek servisi yapmaktadır.'},
  {num:41, name:'Çalışma Alanı',         x:20.36,y:55.07,cats:['eğitsel','sosyal'],   desc:'Öğrencilere özel sessiz çalışma alanı; bireysel masalar ve ücretsiz Wi-Fi ile hizmet vermektedir.'},
  {num:42, name:'Cami Tarafı Giriş',     x:12.76,y:59.18,cats:['giriş'],              desc:'Cami yönündeki kampüs yaya giriş kapısı; güvenlik kontrol noktasıyla aktif bir giriş kapısıdır.'},
];
const LOCS: Loc[] = RAW_LOCS.map(l => ({ ...l, photo: PHOTOS[l.num] }));

// ── Road graph ─────────────────────────────────────────────────────────────
const WAYPTS: Record<string, [number, number]> = {
  W1:[9,70],W2:[9,63],W3:[9,55],W4:[9,48],W5:[9,40],W6:[9,31],
  S1:[12,64],S2:[20,64],S3:[30,64],S4:[45,63],S5:[57,62],S6:[66,60],S7:[73,59],S8:[78,56],
  ES1:[79,57],ES2:[84,57],
  LB1:[13,48],LB2:[13,40],LB3:[13,33],LB4:[17,28],
  CC:[22,52],
  U1:[22,32],U2:[28,26],U3:[33,22],U4:[40,27],UV1:[40,33],U5:[44,24],UV2:[46,31],
  U6:[50,25],U7:[55,30],U8:[60,29],UV3:[61,35],U9:[65,28],U10:[68,36],U11:[75,35],
  M1:[22,44],M2:[28,41],M3:[35,39],M4:[43,39],M5:[50,41],M6:[56,42],
  M7:[63,42],M8:[68,42],M9:[73,47],M10:[78,45],
  E1:[80,43],E2:[84,48],E3:[88,52],
};
const ROAD_EDGES: [string,string][] = [
  ['W1','W2'],['W2','W3'],['W3','W4'],['W4','W5'],['W5','W6'],
  ['W2','S1'],['S1','S2'],['S2','S3'],['S3','S4'],['S4','S5'],['S5','S6'],['S6','S7'],['S7','S8'],['S8','ES1'],['ES1','ES2'],
  ['W4','LB1'],['W5','LB2'],['LB2','M1'],['W6','LB3'],['LB3','LB4'],['LB4','U1'],['LB3','U1'],
  ['S2','CC'],['CC','M1'],
  ['U1','U2'],['U2','U3'],['U3','U4'],['U4','UV1'],['U4','U5'],['U5','UV2'],['UV2','U6'],
  ['U6','U7'],['U7','U8'],['U8','UV3'],['UV3','U9'],['U9','U10'],['U10','U11'],
  ['M1','M2'],['M2','M3'],['M3','M4'],['M4','M5'],['M5','M6'],['M6','M7'],['M7','M8'],['M8','M9'],['M9','M10'],
  ['U2','M2'],['UV1','M3'],['UV2','M4'],['U6','M5'],['U7','M6'],['UV3','M7'],['U10','M8'],['U11','M10'],
  ['M1','S2'],['M3','S3'],['M5','S4'],['M8','S6'],['M9','S7'],['M10','S8'],
  ['M10','E1'],['U11','E1'],['E1','E2'],['E2','E3'],['E3','ES2'],['ES2','ES1'],['ES1','S8'],
];
const BLDG_ROAD: Record<string,string> = {
  b1:'E3',b2:'U11',b3:'U9',b4:'UV3',b5:'M8',b6:'M8',b7:'M9',b8:'M7',b9:'M6',b10:'M5',
  b11:'S5',b12:'U8',b13:'UV3',b14:'UV3',b15:'M6',b16:'U7',b17:'U6',b18:'U6',
  b19:'UV2',b20:'U4',b21:'U5',b22:'UV1',b23:'M4',b24:'M4',b25:'M3',b26:'M3',
  b27:'M3',b28:'U3',b29:'U2',b30:'LB4',b31:'U1',b32:'LB3',b33:'W6',b34:'LB1',
  b35:'CC',b36:'CC',b37:'CC',b38:'CC',b39:'CC',b40:'CC',b41:'CC',b42:'S1',
};

// ── Graph (module-level, built once) ───────────────────────────────────────
const GNODES: Record<string,[number,number]> = {};
LOCS.forEach(l => { GNODES[`b${l.num}`] = [l.x, l.y]; });
Object.entries(WAYPTS).forEach(([k,v]) => { GNODES[k] = v; });

const ADJ: Record<string,[string,number][]> = {};
Object.keys(GNODES).forEach(k => { ADJ[k] = []; });
function addEdge(a: string, b: string) {
  const na = GNODES[a], nb = GNODES[b];
  if (!na || !nb) return;
  const w = Math.sqrt((na[0]-nb[0])**2 + (na[1]-nb[1])**2);
  ADJ[a].push([b,w]); ADJ[b].push([a,w]);
}
ROAD_EDGES.forEach(([a,b]) => addEdge(a,b));
Object.entries(BLDG_ROAD).forEach(([bid,wid]) => addEdge(bid,wid));

function dijkstra(start: string, end: string): string[] | null {
  const dist: Record<string,number> = {};
  const prev: Record<string,string|undefined> = {};
  const visited = new Set<string>();
  Object.keys(GNODES).forEach(k => { dist[k] = Infinity; });
  dist[start] = 0;
  const pq: [number,string][] = [[0,start]];
  while (pq.length) {
    pq.sort((a,b) => a[0]-b[0]);
    const [d,u] = pq.shift()!;
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === end) break;
    for (const [v,w] of ADJ[u] ?? []) {
      const nd = d + w;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; pq.push([nd,v]); }
    }
  }
  if (dist[end] === Infinity) return null;
  const path: string[] = [];
  let cur: string|undefined = end;
  while (cur) { path.unshift(cur); cur = prev[cur]; }
  return path[0] === start ? path : null;
}

// Bearing arrow from dx/dy
function bearingArrow(dx: number, dy: number): string {
  const angle = Math.atan2(dy * 0.4, dx) * 180 / Math.PI; // account for aspect ratio
  const arrows = ['→','↘','↓','↙','←','↖','↑','↗'];
  return arrows[Math.round(((angle + 360) % 360) / 45) % 8];
}

function buildSteps(path: string[], from: Loc, to: Loc): Step[] {
  if (path.length < 2) return [];
  // Compute total distance (1%x ≈ 10m, 1%y ≈ 4m for this campus map)
  let total = 0;
  for (let i = 0; i < path.length-1; i++) {
    const [ax,ay] = GNODES[path[i]], [bx,by] = GNODES[path[i+1]];
    total += Math.sqrt((ax-bx)**2*100 + (ay-by)**2*16);
  }
  const totalM = Math.round(total);
  const walkMin = Math.max(1, Math.round(totalM / 80));

  // Collect intermediate building stops
  const stops = path
    .filter(id => id.startsWith('b') && id !== `b${from.num}` && id !== `b${to.num}`)
    .map(id => LOCS.find(l => `b${l.num}` === id)?.name)
    .filter(Boolean) as string[];

  // Overall direction
  const [fx,fy] = GNODES[`b${from.num}`], [tx,ty] = GNODES[`b${to.num}`];
  const arrow = bearingArrow(tx-fx, ty-fy);

  const steps: Step[] = [];
  steps.push({ icon: '🟢', text: `${from.name}'den çıkın`, meters: 0 });
  steps.push({ icon: arrow, text: `${to.name} yönüne doğru ilerleyin`, meters: totalM });
  stops.forEach(s => steps.push({ icon: '📍', text: `${s} yanından geçin`, meters: 0 }));
  steps.push({ icon: '⏱️', text: `Tahmini yürüyüş: ~${walkMin} dakika (${totalM}m)`, meters: 0 });
  steps.push({ icon: '🔴', text: `${to.name}'e ulaştınız`, meters: 0 });
  return steps;
}

// ── Category meta ──────────────────────────────────────────────────────────
const CAT_META: Record<string,{color:string;bg:string;emoji:string;label:string}> = {
  'eğitsel': {color:'#2563eb',bg:'#dbeafe',emoji:'🎓',label:'Eğitsel'},
  'sosyal':  {color:'#d97706',bg:'#fef3c7',emoji:'☕',label:'Sosyal'},
  'idari':   {color:'#7c3aed',bg:'#ede9fe',emoji:'🏢',label:'İdari'},
  'işlevsel':{color:'#059669',bg:'#d1fae5',emoji:'⚙️',label:'İşlevsel'},
  'otopark': {color:'#475569',bg:'#f1f5f9',emoji:'🅿️',label:'Otopark'},
  'giriş':   {color:'#dc2626',bg:'#fee2e2',emoji:'🚪',label:'Giriş'},
};
const ALL_CATS = ['eğitsel','sosyal','idari','işlevsel','otopark','giriş'];
const MAP_ASPECT = 40.573; // 1439 × 584.25 → 40.573%

// ── Component ──────────────────────────────────────────────────────────────
export default function CampusMap() {
  const [sel,     setSel]     = useState<Loc|null>(null);
  const [from,    setFrom]    = useState<Loc|null>(null);
  const [to,      setTo]      = useState<Loc|null>(null);
  const [route,   setRoute]   = useState<string[]|null>(null);
  const [steps,   setSteps]   = useState<Step[]>([]);
  const [search,  setSearch]  = useState('');
  const [catFilter,setCatFilter] = useState<string|null>(null);
  const [night,   setNight]   = useState(false);
  const [navMode, setNavMode] = useState(false);
  const [showSteps,setShowSteps] = useState(false);
  const [discovered,setDiscovered] = useState<Set<number>>(new Set());

  const computeRoute = useCallback((f: Loc, t: Loc) => {
    const path = dijkstra(`b${f.num}`, `b${t.num}`);
    setRoute(path);
    setSteps(path ? buildSteps(path, f, t) : []);
  }, []);

  function pickFrom(loc: Loc) {
    setFrom(loc); setSel(null); setNavMode(true);
    if (to) computeRoute(loc, to);
  }
  function pickTo(loc: Loc) {
    setTo(loc); setSel(null); setNavMode(true);
    if (from) computeRoute(from, loc);
  }
  function resetNav() {
    setFrom(null); setTo(null); setRoute(null); setSteps([]); setShowSteps(false);
  }
  function handlePin(loc: Loc) {
    if (navMode && !from) { pickFrom(loc); return; }
    if (navMode && !to)   { pickTo(loc);   return; }
    setSel(prev => prev?.num === loc.num ? null : loc);
    setDiscovered(prev => new Set([...prev, loc.num]));
  }

  const visible = useMemo(() => LOCS.filter(l => {
    const s = search === '' || l.name.toLowerCase().includes(search.toLowerCase());
    const c = catFilter === null || l.cats.includes(catFilter);
    return s && c;
  }), [search, catFilter]);

  const routePts = route
    ? route.map(id => { const [x,y]=GNODES[id]; return `${x},${(y*MAP_ASPECT/100).toFixed(3)}`; }).join(' ')
    : '';

  const totalM = useMemo(() => {
    if (!route || route.length < 2) return 0;
    let d = 0;
    for (let i=0;i<route.length-1;i++) {
      const [ax,ay]=GNODES[route[i]],[bx,by]=GNODES[route[i+1]];
      d += Math.sqrt((ax-bx)**2*100+(ay-by)**2*16);
    }
    return Math.round(d);
  }, [route]);

  // Theme
  const bg     = night ? '#1a1a2e' : '#f8f5f0';
  const card   = night ? '#16213e' : '#ffffff';
  const txt    = night ? '#e2e8f0' : '#1c1917';
  const sub    = night ? '#94a3b8' : '#6b7280';
  const brd    = night ? '#2d3748' : '#e5e7eb';
  const hdr    = night ? '#0f0f23' : '#7c2d12';
  const imgF   = night ? 'brightness(0.48) saturate(0.85)' : 'none';

  const xp = discovered.size;

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:bg,maxWidth:480,margin:'0 auto',color:txt}}>

      {/* ── Header ── */}
      <div style={{background:hdr,color:'#fff',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontWeight:800,fontSize:16,letterSpacing:.5}}>🗺️ SANTRAL KAMPÜS</div>
          <div style={{fontSize:11,opacity:.7}}>İstanbul Bilgi Üniversitesi</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2}}>
            <span style={{fontSize:10,opacity:.85}}>Keşif {xp}/{LOCS.length}</span>
            <div style={{width:50,height:4,background:'rgba(255,255,255,.2)',borderRadius:2,overflow:'hidden'}}>
              <motion.div animate={{width:`${xp/LOCS.length*100}%`}} style={{height:'100%',background:'#fbbf24',borderRadius:2}}/>
            </div>
          </div>
          <button onClick={()=>setNight(n=>!n)} style={{background:'rgba(255,255,255,.15)',border:'none',borderRadius:20,padding:'5px 10px',cursor:'pointer',fontSize:14,color:'#fff',lineHeight:1}}>
            {night?'☀️':'🌙'}
          </button>
        </div>
      </div>

      {/* ── Search + Nav toggle ── */}
      <div style={{padding:'10px 14px',background:card,borderBottom:`1px solid ${brd}`,display:'flex',gap:8}}>
        <div style={{flex:1,display:'flex',alignItems:'center',gap:8,background:night?'#2d3748':'#f3f4f6',borderRadius:20,padding:'7px 14px'}}>
          <span style={{fontSize:14}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Bina ara…"
            style={{border:'none',background:'transparent',flex:1,color:txt,fontSize:14,outline:'none'}}/>
          {search&&<button onClick={()=>setSearch('')} style={{border:'none',background:'transparent',cursor:'pointer',color:sub,fontSize:14,padding:0}}>✕</button>}
        </div>
        <button
          onClick={()=>{setNavMode(n=>!n);if(navMode)resetNav();}}
          style={{padding:'7px 12px',borderRadius:20,border:'none',cursor:'pointer',background:navMode?'#059669':(night?'#2d3748':'#f3f4f6'),color:navMode?'#fff':sub,fontWeight:600,fontSize:13,whiteSpace:'nowrap'}}>
          {navMode?'🧭 Aktif':'🧭'}
        </button>
      </div>

      {/* ── Navigation panel ── */}
      <AnimatePresence>
        {navMode&&(
          <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
            style={{background:night?'#0d2218':'#f0fdf4',borderBottom:`1px solid ${brd}`,overflow:'hidden'}}>
            <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:8}}>
              {/* From / To slots */}
              <div style={{display:'flex',gap:8,alignItems:'stretch'}}>
                <div style={{display:'flex',flexDirection:'column',gap:6,flex:1}}>
                  {[{label:'Nereden',val:from,color:'#4caf50',onClear:()=>{setFrom(null);setRoute(null);}},
                    {label:'Nereye', val:to,  color:'#f44336',onClear:()=>{setTo(null);setRoute(null);}}
                  ].map(({label,val,color,onClear})=>(
                    <div key={label} style={{display:'flex',alignItems:'center',gap:8,background:card,borderRadius:10,padding:'6px 12px',border:`1px solid ${val?color:brd}`}}>
                      <div style={{width:10,height:10,borderRadius:'50%',background:val?color:'#ccc',flexShrink:0}}/>
                      <span style={{fontSize:13,color:val?txt:sub,flex:1}}>{val?val.name:`${label}? Haritadan seçin`}</span>
                      {val&&<button onClick={onClear} style={{border:'none',background:'transparent',cursor:'pointer',color:sub,fontSize:12}}>✕</button>}
                    </div>
                  ))}
                </div>
                <button onClick={resetNav} style={{padding:'0 10px',borderRadius:10,border:`1px solid ${brd}`,background:'transparent',color:sub,fontSize:12,cursor:'pointer',alignSelf:'stretch'}}>↺</button>
              </div>
              {/* Route info */}
              {route&&(
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontSize:13,color:'#059669',fontWeight:700}}>🚶 ~{Math.max(1,Math.round(totalM/80))} dk · {totalM}m</span>
                  <button onClick={()=>setShowSteps(s=>!s)}
                    style={{fontSize:12,padding:'4px 10px',borderRadius:8,border:'1px solid #059669',background:showSteps?'#059669':'transparent',color:showSteps?'#fff':'#059669',cursor:'pointer'}}>
                    {showSteps?'▲ Gizle':'▼ Adımlar'}
                  </button>
                </div>
              )}
              {!route&&from&&to&&<span style={{fontSize:12,color:'#ef4444'}}>Bu iki nokta arasında rota bulunamadı.</span>}
            </div>

            {/* Step-by-step */}
            {showSteps&&steps.length>0&&(
              <div style={{borderTop:`1px solid ${brd}`,padding:'8px 14px 12px',display:'flex',flexDirection:'column',gap:7}}>
                {steps.map((s,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,fontSize:13}}>
                    <span style={{fontSize:16,flexShrink:0,width:24,textAlign:'center'}}>{s.icon}</span>
                    <span style={{color:txt,flex:1}}>{s.text}</span>
                    {s.meters>0&&<span style={{color:sub,fontSize:11,flexShrink:0}}>{s.meters}m</span>}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Category filter ── */}
      <div style={{padding:'7px 12px',background:card,display:'flex',gap:5,overflowX:'auto',borderBottom:`1px solid ${brd}`}}>
        <button onClick={()=>setCatFilter(null)}
          style={{flexShrink:0,padding:'4px 10px',borderRadius:20,border:`1px solid ${catFilter===null?'#7c2d12':brd}`,background:catFilter===null?'#7c2d12':'transparent',color:catFilter===null?'#fff':sub,fontSize:12,cursor:'pointer',fontWeight:catFilter===null?700:400}}>
          Tümü
        </button>
        {ALL_CATS.map(c=>{
          const m=CAT_META[c], active=catFilter===c;
          return(
            <button key={c} onClick={()=>setCatFilter(active?null:c)}
              style={{flexShrink:0,padding:'4px 10px',borderRadius:20,border:`1px solid ${active?m.color:brd}`,background:active?m.color:'transparent',color:active?'#fff':sub,fontSize:12,cursor:'pointer',fontWeight:active?700:400}}>
              {m.emoji} {m.label}
            </button>
          );
        })}
      </div>

      {/* ── Map ── */}
      <div style={{position:'relative',width:'100%',paddingBottom:`${MAP_ASPECT}%`,overflow:'hidden',flexShrink:0}}>
        {/* Background */}
        <div style={{position:'absolute',inset:0,backgroundImage:"url('/campus-map.jpg')",backgroundSize:'100% 100%',filter:imgF,transition:'filter .5s'}}/>

        {/* Route SVG */}
        {route&&(
          <svg viewBox={`0 0 100 ${MAP_ASPECT}`} preserveAspectRatio="none"
            style={{position:'absolute',inset:0,width:'100%',height:'100%',zIndex:15,pointerEvents:'none',overflow:'visible'}}>
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="0.4" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <polyline points={routePts} fill="none" stroke="rgba(59,130,246,0.35)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points={routePts} fill="none" stroke="#60a5fa" strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="1.8 0.9" style={{animation:'dash .8s linear infinite'}} filter="url(#glow)"/>
            {from&&<circle cx={from.x} cy={(from.y*MAP_ASPECT/100).toFixed(3)} r="1.4" fill="#4caf50" stroke="#fff" strokeWidth="0.35"/>}
            {to&&  <circle cx={to.x}   cy={(to.y  *MAP_ASPECT/100).toFixed(3)} r="1.4" fill="#f44336" stroke="#fff" strokeWidth="0.35"/>}
          </svg>
        )}

        {/* Pins */}
        {visible.map(loc=>{
          const isSel  = sel?.num===loc.num;
          const isFrom = from?.num===loc.num;
          const isTo   = to?.num===loc.num;
          const isDone = discovered.has(loc.num);
          const c = CAT_META[loc.cats[0]] ?? CAT_META['eğitsel'];
          const dotBg = isFrom?'#4caf50':isTo?'#f44336':isDone?c.color:(night?'#1e293b':'#fff');
          const dotBd = isFrom?'#4caf50':isTo?'#f44336':c.color;
          const dotTx = (isFrom||isTo||isDone)?'#fff':c.color;
          return(
            <motion.button key={loc.num} onClick={()=>handlePin(loc)}
              initial={{scale:0}} animate={{scale:1}} transition={{type:'spring',stiffness:280,damping:20}}
              style={{position:'absolute',left:`${loc.x}%`,top:`${loc.y}%`,transform:'translate(-50%,-50%)',zIndex:isSel||isFrom||isTo?25:10,background:'none',border:'none',cursor:'pointer',padding:0}}>
              {isSel&&(
                <motion.div animate={{scale:[1,2.2,1],opacity:[.5,0,.5]}} transition={{duration:1.4,repeat:Infinity}}
                  style={{position:'absolute',inset:0,borderRadius:'50%',background:c.color,zIndex:-1}}/>
              )}
              <div style={{width:22,height:22,borderRadius:'50%',background:dotBg,border:`2px solid ${dotBd}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:dotTx,boxShadow:'0 2px 8px rgba(0,0,0,.3)',transition:'all .15s'}}>
                {c.emoji}
              </div>
              {(isSel||search!=='')&&(
                <div style={{position:'absolute',top:'100%',left:'50%',transform:'translateX(-50%)',marginTop:2,background:night?'#1e293b':'#fff',padding:'1px 5px',borderRadius:5,fontSize:8,fontWeight:700,whiteSpace:'nowrap',color:c.color,border:`1px solid ${c.color}30`,boxShadow:'0 1px 4px rgba(0,0,0,.2)',pointerEvents:'none'}}>
                  {loc.name}
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* ── Building info card ── */}
      <AnimatePresence>
        {sel&&(
          <motion.div key={sel.num} initial={{y:60,opacity:0}} animate={{y:0,opacity:1}} exit={{y:60,opacity:0}}
            transition={{type:'spring',damping:28,stiffness:320}}
            style={{position:'fixed',bottom:0,left:'50%',width:'min(100vw,480px)',transform:'translateX(-50%)',background:card,borderRadius:'20px 20px 0 0',zIndex:300,boxShadow:'0 -8px 32px rgba(0,0,0,.25)',borderTop:`3px solid ${CAT_META[sel.cats[0]]?.color??'#2563eb'}`}}>
            <div style={{width:36,height:4,background:brd,borderRadius:2,margin:'12px auto 8px'}}/>

            {/* Photo */}
            {sel.photo&&(
              <div style={{margin:'0 16px 10px',borderRadius:12,overflow:'hidden',height:170,background:night?'#2d3748':'#f3f4f6'}}>
                <img src={sel.photo} alt={sel.name} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
              </div>
            )}
            {!sel.photo&&(
              <div style={{margin:'0 16px 10px',borderRadius:12,height:80,background:CAT_META[sel.cats[0]]?.bg??'#dbeafe',display:'flex',alignItems:'center',justifyContent:'center',fontSize:36}}>
                {CAT_META[sel.cats[0]]?.emoji??'🏢'}
              </div>
            )}

            <div style={{padding:'0 16px 24px'}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8}}>
                <div>
                  <div style={{fontWeight:800,fontSize:17,marginBottom:5}}>{sel.name}</div>
                  <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                    {sel.cats.map(c=>{
                      const m=CAT_META[c];
                      return m?(
                        <span key={c} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 8px',borderRadius:8,background:m.bg,color:m.color,fontSize:11,fontWeight:600}}>
                          {m.emoji} {m.label}
                        </span>
                      ):null;
                    })}
                  </div>
                </div>
                <button onClick={()=>setSel(null)} style={{background:night?'#2d3748':'#f3f4f6',border:'none',borderRadius:'50%',width:28,height:28,cursor:'pointer',color:sub,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:14}}>✕</button>
              </div>

              <p style={{fontSize:13,color:sub,lineHeight:1.65,margin:'0 0 14px'}}>{sel.desc}</p>

              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>pickFrom(sel)}
                  style={{flex:1,padding:'9px',borderRadius:10,border:'1px solid #4caf50',background:from?.num===sel.num?'#4caf50':'transparent',color:from?.num===sel.num?'#fff':'#4caf50',fontWeight:600,fontSize:13,cursor:'pointer'}}>
                  🟢 Buradan Çık
                </button>
                <button onClick={()=>pickTo(sel)}
                  style={{flex:1,padding:'9px',borderRadius:10,border:'1px solid #f44336',background:to?.num===sel.num?'#f44336':'transparent',color:to?.num===sel.num?'#fff':'#f44336',fontWeight:600,fontSize:13,cursor:'pointer'}}>
                  🔴 Buraya Git
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes dash{to{stroke-dashoffset:-2.7}}`}</style>
    </div>
  );
}
