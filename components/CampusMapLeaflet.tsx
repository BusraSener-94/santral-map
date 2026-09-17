"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import ROOMS_RAW from "../public/rooms.json";

type RoomEntry={oda:string;label:string;cat:string;floor:string;cap?:number;unit?:string};
type RoomsData=Record<string,Record<string,RoomEntry[]>>;
const ROOMS=ROOMS_RAW as RoomsData;

// ── Sabitler ─────────────────────────────────────────────────────────────────
const CAMPUS_CENTER: [number, number] = [41.0673, 28.9490];
const CAMPUS_BOUNDS: [[number,number],[number,number]] = [[41.061, 28.936], [41.073, 28.958]];
const ARRIVE_M = 25; // metre – bu kadar yaklaşınca "ulaştınız"

// ── Matematik ────────────────────────────────────────────────────────────────
function hav(a:number,b:number,c:number,d:number):number{
  const R=6371000,dL=(c-a)*Math.PI/180,dO=(d-b)*Math.PI/180;
  const x=Math.sin(dL/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dO/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
function distM(pts:[number,number][]):number{
  let d=0;for(let i=1;i<pts.length;i++)d+=hav(pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1]);return Math.round(d);
}
function brng(a:number,b:number,c:number,d:number):number{
  const dO=(d-b)*Math.PI/180;
  return(Math.atan2(Math.sin(dO)*Math.cos(c*Math.PI/180),Math.cos(a*Math.PI/180)*Math.sin(c*Math.PI/180)-Math.sin(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.cos(dO))*180/Math.PI+360)%360;
}
function arrow(b:number){return["↑","↗","→","↘","↓","↙","←","↖"][Math.round(b/45)%8];}

// RDP
function pd(p:[number,number],a:[number,number],b:[number,number]):number{
  const m=(t:number,n:number)=>[n*111000*Math.cos(t*Math.PI/180),t*111000] as[number,number];
  const[px,py]=m(p[0],p[1]),[ax,ay]=m(a[0],a[1]),[bx,by]=m(b[0],b[1]);
  const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;
  if(!l2)return Math.sqrt((px-ax)**2+(py-ay)**2);
  const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l2));
  return Math.sqrt((px-ax-t*dx)**2+(py-ay-t*dy)**2);
}
function rdp(pts:[number,number][],e:number):[number,number][]{
  if(pts.length<=2)return pts;
  let md=0,mi=0;for(let i=1;i<pts.length-1;i++){const d=pd(pts[i],pts[0],pts[pts.length-1]);if(d>md){md=d;mi=i;}}
  if(md>e){const l=rdp(pts.slice(0,mi+1),e),r=rdp(pts.slice(mi),e);return[...l.slice(0,-1),...r];}
  return[pts[0],pts[pts.length-1]];
}

interface Step{text:string;arrow:string;dist:number;}
function steps(route:[number,number][]):Step[]{
  const s=rdp(route,8);if(s.length<2)return[];
  const out:Step[]=[];
  const b0=brng(s[0][0],s[0][1],s[1][0],s[1][1]);
  const dirs=["Kuzeye","KD'ya","Doğuya","GD'ye","Güneye","GB'ye","Batıya","KB'ye"];
  out.push({text:`${dirs[Math.round(b0/45)%8]} yürüyün`,arrow:arrow(b0),dist:0});
  let pb=b0;
  for(let i=1;i<s.length-1;i++){
    const nb=brng(s[i][0],s[i][1],s[i+1][0],s[i+1][1]);
    const d=Math.round(hav(s[i-1][0],s[i-1][1],s[i][0],s[i][1]));
    let df=nb-pb;while(df>180)df-=360;while(df<-180)df+=360;
    if(Math.abs(df)>35){out.push({text:`${d}m sonra ${df<0?"sola dön":"sağa dön"}`,arrow:df<0?"↰":"↱",dist:d});pb=nb;}
  }
  out.push({text:"Hedefe ulaştınız",arrow:"🏁",dist:0});
  return out;
}

// ── Graf ─────────────────────────────────────────────────────────────────────
interface GD{nodes:[number,number][];edges:[number,number][];}
function adj(g:GD):[number,number][][]{
  const N=g.nodes.length,a:[number,number][][]=Array.from({length:N},()=>[]);
  for(const[x,y]of g.edges){const w=hav(g.nodes[x][0],g.nodes[x][1],g.nodes[y][0],g.nodes[y][1]);a[x].push([y,w]);a[y].push([x,w]);}
  return a;
}
function dijk(g:GD,a:[number,number][][],fLa:number,fLo:number,tLa:number,tLo:number):[number,number][]{
  const{nodes:n}=g,N=n.length;
  let fi=0,ti=0,fd=Infinity,td=Infinity;
  for(let i=0;i<N;i++){
    const f=hav(fLa,fLo,n[i][0],n[i][1]),t=hav(tLa,tLo,n[i][0],n[i][1]);
    if(f<fd){fd=f;fi=i;}if(t<td){td=t;ti=i;}
  }
  const dist=new Float64Array(N).fill(Infinity),prev=new Int32Array(N).fill(-1),inQ=new Uint8Array(N).fill(1);
  dist[fi]=0;
  for(;;){
    let u=-1,ud=Infinity;for(let i=0;i<N;i++)if(inQ[i]&&dist[i]<ud){ud=dist[i];u=i;}
    if(u<0||dist[u]===Infinity||u===ti)break;inQ[u]=0;
    for(const[v,w]of a[u]){if(!inQ[v])continue;const nd=dist[u]+w;if(nd<dist[v]){dist[v]=nd;prev[v]=u;}}
  }
  const p:number[]=[],c_ref={c:ti};
  while(c_ref.c>=0&&p.length<=N){p.unshift(c_ref.c);if(c_ref.c===fi)break;c_ref.c=prev[c_ref.c];}
  if(p.length>=2&&p[0]===fi)return[[fLa,fLo],...p.map(i=>n[i] as[number,number]),[tLa,tLo]];
  return[[fLa,fLo],[tLa,tLo]];
}

function FitMap(){const m=useMap();useEffect(()=>{m.fitBounds(CAMPUS_BOUNDS,{padding:[20,20],animate:false});},[m]);return null;}

// Navigasyon sırasında haritayı kullanıcı konumuna kilitle
function MapFollower({pos,active}:{pos:[number,number]|null;active:boolean}){
  const m=useMap();
  useEffect(()=>{
    if(active&&pos)m.setView(pos,18,{animate:true,duration:0.5});
  },[active,pos,m]);
  return null;
}

function ZoomCtrl(){
  const m=useMap();
  useEffect(()=>{
    const zi=document.getElementById("z+"),zo=document.getElementById("z-");
    if(zi)zi.onclick=()=>m.zoomIn();if(zo)zo.onclick=()=>m.zoomOut();
  },[m]);
  return null;
}
function CenterCtrl({userPos}:{userPos:[number,number]|null}){
  const m=useMap();
  useEffect(()=>{
    const btn=document.getElementById("center-me");
    if(!btn)return;
    btn.onclick=()=>{if(userPos)m.setView(userPos,18,{animate:true,duration:0.5});};
  },[m,userPos]);
  return null;
}

// ── Veri ─────────────────────────────────────────────────────────────────────
interface Loc{num:number;name:string;gps:[number,number];cats:string[];desc:string;emoji:string;photo?:string;}
const CAT:Record<string,{c:string;l:string}>={
  eğitsel:{c:"#3b82f6",l:"Eğitsel"},sosyal:{c:"#f59e0b",l:"Sosyal"},
  idari:{c:"#8b5cf6",l:"İdari"},işlevsel:{c:"#10b981",l:"İşlevsel"},
  otopark:{c:"#6b7280",l:"Otopark"},giriş:{c:"#ef4444",l:"Giriş"},
};
const LOCS:Loc[]=[
  // ── Girişler ──────────────────────────────────────────────────────────────
  {num:1, name:"Cami Tarafı Giriş",  gps:[41.06930,28.94418],cats:["giriş"],   emoji:"🚪",desc:"Cami tarafındaki kampüs batı ana giriş kapısı."},
  {num:25,name:"Misafir Girişi",      gps:[41.06668,28.94535],cats:["giriş"],   emoji:"🚪",desc:"Ana misafir ve öğrenci güney girişi."},
  {num:33,name:"Tarihi Giriş",       gps:[41.06568,28.94669],cats:["giriş"],   emoji:"🏛️",desc:"Tarihi güç santrali ana giriş kapısı.",photo:"/buildings/tarihi-giris.jpg"},
  // ── Eğitsel ───────────────────────────────────────────────────────────────
  {num:2, name:"E1",                 gps:[41.06884,28.94474],cats:["eğitsel"],  emoji:"🏭",desc:"E1 mühendislik ve enerji binası."},
  {num:3, name:"E2",                 gps:[41.06959,28.94568],cats:["eğitsel"],  emoji:"🏭",desc:"E2 mühendislik binası."},
  {num:7, name:"L1",                 gps:[41.06909,28.94553],cats:["eğitsel"],  emoji:"🏭",desc:"L1 Enerji binası – tarihi kazan dairesi."},
  {num:8, name:"L2",                 gps:[41.06861,28.94553],cats:["eğitsel","idari"],emoji:"🏭",desc:"L2 binası."},
  {num:9, name:"L3",                 gps:[41.06906,28.94581],cats:["eğitsel"],  emoji:"🏭",desc:"L3 Enerji binası."},
  {num:11,name:"E3",                 gps:[41.06807,28.94656],cats:["eğitsel"],  emoji:"🏢",desc:"E3 akademik binası."},
  {num:12,name:"E4",                 gps:[41.06729,28.94669],cats:["eğitsel"],  emoji:"🏢",desc:"E4 akademik binası."},
  {num:13,name:"ÇSM Sınıflar",       gps:[41.06750,28.94655],cats:["eğitsel"],  emoji:"🎓",desc:"ÇSM alt kat – derslikler ve çalışma sınıfları.",photo:"/buildings/csm-siniflar.jpg"},
  {num:18,name:"E5",                 gps:[41.06610,28.94660],cats:["eğitsel"],  emoji:"🏢",desc:"E5 akademik binası.",photo:"/buildings/e5.jpg"},
  {num:19,name:"E6",                 gps:[41.06606,28.94619],cats:["eğitsel"],  emoji:"🏢",desc:"E6 akademik binası.",photo:"/buildings/e6.jpg"},
  {num:16,name:"KD4 Mimarlık",       gps:[41.06630,28.94616],cats:["eğitsel"],  emoji:"📐",desc:"Mimarlık dijital fabrikasyon stüdyosu.",photo:"/buildings/mimarlik-kd4.jpg"},
  {num:17,name:"Seyfi Arıkan",       gps:[41.06689,28.94692],cats:["eğitsel"],  emoji:"🎤",desc:"Seyfi Arkan konferans salonu."},
  {num:20,name:"Kütüphane",          gps:[41.06635,28.94598],cats:["eğitsel","sosyal"],emoji:"📚",desc:"Mehmet Kenan Tekdağ Kütüphanesi.",photo:"/buildings/kutuphane.jpg"},
  {num:22,name:"MIDL",               gps:[41.06740,28.94640],cats:["sosyal"],   emoji:"🎬",desc:"Medya ve İletişim Tasarım Laboratuvarı.",photo:"/buildings/midl.jpg"},
  {num:31,name:"Gastronomi Mutfak",  gps:[41.06603,28.94565],cats:["eğitsel"],  emoji:"👨‍🍳",desc:"Gastronomi ve mutfak sanatları laboratuvarı.",photo:"/buildings/gastronomi.jpg"},
  {num:37,name:"Blab",               gps:[41.06720,28.94590],cats:["eğitsel"],  emoji:"🔬",desc:"BLab – öğrenci proje ve maker alanı."},
  // ── İdari ─────────────────────────────────────────────────────────────────
  {num:10,name:"Rektörlük",          gps:[41.06833,28.94617],cats:["idari"],    emoji:"🏛️",desc:"Rektörlük idari ofisleri."},
  {num:14,name:"ÇSM Ofisler",        gps:[41.06769,28.94671],cats:["idari"],    emoji:"🏢",desc:"ÇSM üst kat – öğrenci kulüp ve ofisleri."},
  {num:36,name:"Öğrenci İşleri",     gps:[41.06774,28.94678],cats:["idari"],    emoji:"📋",desc:"Öğrenci İşleri Direktörlüğü – ÇSM Ofisler yanı, üst kat."},
  {num:21,name:"EN-1",               gps:[41.06720,28.94548],cats:["idari"],    emoji:"🏢",desc:"EN-1 idari ve ofis binası."},
  {num:30,name:"ÖDM",                gps:[41.06536,28.94620],cats:["idari"],    emoji:"🤝",desc:"Öğrenci Destek Merkezi (ÖDM) – danışmanlık ve kariyer.",photo:"/buildings/odm.jpg"},
  {num:32,name:"BT",                 gps:[41.06589,28.94637],cats:["idari"],    emoji:"💻",desc:"Bilişim Teknolojileri birimi.",photo:"/buildings/bt.jpg"},
  {num:40,name:"Banka",              gps:[41.06872,28.94465],cats:["işlevsel"], emoji:"🏦",desc:"Kampüs bankacılık şubesi – E1 bölgesi."},
  {num:41,name:"ATM",                gps:[41.06868,28.94458],cats:["işlevsel"], emoji:"💳",desc:"Kampüs ATM makinesi – banka yanı."},
  // ── Sosyal ────────────────────────────────────────────────────────────────
  {num:4, name:"Yemekhane",          gps:[41.06823,28.94445],cats:["sosyal"],   emoji:"🍽️",desc:"Kampüs ana yemekhanesi."},
  {num:5, name:"Nero",               gps:[41.06812,28.94473],cats:["sosyal"],   emoji:"☕",desc:"Caffè Nero kahve."},
  {num:38,name:"Starbucks",          gps:[41.06798,28.94442],cats:["sosyal"],   emoji:"☕",desc:"Starbucks Coffee – kampüs şubesi."},
  {num:23,name:"Lokanta",            gps:[41.06701,28.94566],cats:["sosyal"],   emoji:"🍜",desc:"Sosyal Lokanta – Lokma."},
  {num:24,name:"Espressolab",        gps:[41.06692,28.94569],cats:["sosyal"],   emoji:"☕",desc:"Espressolab kahve.",photo:"/buildings/espressolab.jpg"},
  {num:39,name:"Sunpeak",            gps:[41.06826,28.94440],cats:["sosyal"],   emoji:"🌞",desc:"Sunpeak kafe ve sosyal alan – Yemekhane bölgesi."},
  {num:15,name:"Enerji Müzesi",      gps:[41.06659,28.94666],cats:["sosyal"],   emoji:"⚡",desc:"santralistanbul Enerji Müzesi – halka açık."},
  {num:27,name:"Etkinlik Çadırı",    gps:[41.06562,28.94564],cats:["sosyal"],   emoji:"⛺",desc:"Açık hava etkinlik çadırı alanı.",photo:"/buildings/etkinlik-cadiri.jpg"},
  {num:35,name:"Amfi",               gps:[41.06380,28.94560],cats:["sosyal"],   emoji:"🎭",desc:"Açık hava amfi tiyatrosu."},
  // ── İşlevsel ──────────────────────────────────────────────────────────────
  {num:28,name:"Kuluçka",            gps:[41.06501,28.94550],cats:["işlevsel"], emoji:"💡",desc:"BİLGİ Sosyal Kuluçka Merkezi – CARE konteyner."},
  {num:29,name:"Revir",              gps:[41.06548,28.94629],cats:["işlevsel"], emoji:"🏥",desc:"Kampüs sağlık birimi.",photo:"/buildings/revir.jpg"},
  {num:42,name:"Kuaföz",             gps:[41.06860,28.94452],cats:["işlevsel"], emoji:"✂️",desc:"Kampüs kuaför ve berber salonu – E1 bölgesi."},
  {num:43,name:"Çalışma Alanı",      gps:[41.06855,28.94470],cats:["işlevsel"], emoji:"📖",desc:"Açık öğrenci çalışma alanı."},
  // ── Otopark ───────────────────────────────────────────────────────────────
  {num:26,name:"Otopark",            gps:[41.06587,28.94494],cats:["otopark"],  emoji:"🅿️",desc:"Kampüs ana araç otoparkı – güney."},
  {num:34,name:"Otopark Girişi",     gps:[41.06471,28.94660],cats:["otopark"],  emoji:"🚗",desc:"Otopark araç giriş/çıkış noktası."},
  {num:44,name:"Arka Otopark",       gps:[41.06605,28.95075],cats:["otopark"],  emoji:"🅿️",desc:"Kampüs arka otopark – doğu taraf."},
];

// ── İkonlar ───────────────────────────────────────────────────────────────────
function mkIcon(loc:Loc,isF:boolean,isT:boolean):L.DivIcon{
  const col=isF?"#16a34a":isT?"#ef4444":(CAT[loc.cats[0]]?.c??"#3b82f6");
  const bg=isF?"rgba(22,163,74,0.95)":isT?"rgba(239,68,68,0.95)":"rgba(15,23,42,0.88)";
  return L.divIcon({
    html:`<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="background:${bg};color:#fff;font-size:10px;font-weight:700;padding:3px 7px;border-radius:5px;white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px;box-shadow:0 2px 6px rgba(0,0,0,0.5);">${loc.name}</div>
      <div style="width:13px;height:13px;border-radius:50%;background:${col};border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.6);"></div>
    </div>`,
    className:"",iconSize:[90,32],iconAnchor:[45,30],
  });
}
// Turuncu puls noktası – PERSON simülasyon + nav modunda kullanılır
const PERSON=L.divIcon({
  html:`<div style="position:relative;width:26px;height:26px;">
    <div style="position:absolute;inset:-4px;border-radius:50%;background:rgba(249,115,22,0.25);animation:gps-pulse 2s ease-out infinite;"></div>
    <div style="position:absolute;inset:0;border-radius:50%;background:#f97316;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>
  </div>`,
  className:"",iconSize:[26,26],iconAnchor:[13,13]
});

// Yön oku – şeffaf merkez (PERSON üzerine gelir), sadece ok çıkar
function makeUserIcon(heading:number|null):L.DivIcon{
  const rot=heading??0;
  return L.divIcon({
    html:`<div style="position:relative;width:48px;height:48px;">
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
        <div style="transform:rotate(${rot}deg);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;width:48px;height:48px;padding-top:1px;">
          <div style="width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-bottom:22px solid #f97316;filter:drop-shadow(0 0 3px rgba(255,255,255,0.9)) drop-shadow(0 1px 3px rgba(0,0,0,0.7));"></div>
        </div>
      </div>
    </div>`,
    className:"",iconSize:[48,48],iconAnchor:[24,24],
  });
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
export default function CampusMap(){
  // Temel state
  const[from,setFrom]=useState<Loc|null>(null);    // null = GPS veya seçilmedi
  const[fromGPS,setFromGPS]=useState(false);        // from = kullanıcının GPS konumu
  const[to,setTo]=useState<Loc|null>(null);
  const[route,setRoute]=useState<[number,number][]|null>(null);
  const[routeM,setRouteM]=useState(0);
  const[navSteps,setNavSteps]=useState<Step[]>([]);
  const[showSteps,setShowSteps]=useState(false);
  // Swipe-to-close bottom sheet
  const[sheetTranslate,setSheetTranslate]=useState(0);
  const touchStartY=useRef(0);

  // Uygulama modu
  type Mode='idle'|'pickFrom'|'pickTo'|'ready'|'sim'|'nav'|'arrived';
  const[mode,setMode]=useState<Mode>('idle');

  // Arama & filtre
  const[search,setSearch]=useState("");
  const[cat,setCat]=useState<string|null>(null);

  // GPS
  const[userPos,setUserPos]=useState<[number,number]|null>(null);
  const[gpsOn,setGpsOn]=useState(false);
  const watchRef=useRef<number|null>(null);
  const[heading,setHeading]=useState<number|null>(null);
  const prevPosRef=useRef<[number,number]|null>(null);

  // Pusula: DeviceOrientationEvent → heading
  useEffect(()=>{
    const handler=(e:DeviceOrientationEvent)=>{
      const alpha=(e as DeviceOrientationEvent&{webkitCompassHeading?:number}).webkitCompassHeading??e.alpha;
      if(alpha!=null)setHeading(Math.round(alpha));
    };
    // iOS 13+ izin gerektirebilir
    const setup=()=>{
      window.addEventListener('deviceorientationabsolute',handler as EventListener,true);
      window.addEventListener('deviceorientation',handler as EventListener,true);
    };
    if(typeof (DeviceOrientationEvent as unknown as{requestPermission?:()=>Promise<string>}).requestPermission==='function'){
      (DeviceOrientationEvent as unknown as{requestPermission:()=>Promise<string>}).requestPermission().then(s=>{if(s==='granted')setup();}).catch(()=>{});
    } else {setup();}
    return()=>{
      window.removeEventListener('deviceorientationabsolute',handler as EventListener,true);
      window.removeEventListener('deviceorientation',handler as EventListener,true);
    };
  },[]);

  // GPS güncellenince bearing hesapla (pusula yoksa)
  useEffect(()=>{
    if(!userPos)return;
    if(heading===null&&prevPosRef.current){
      const b=brng(prevPosRef.current[0],prevPosRef.current[1],userPos[0],userPos[1]);
      if(hav(prevPosRef.current[0],prevPosRef.current[1],userPos[0],userPos[1])>3)setHeading(Math.round(b));
    }
    prevPosRef.current=userPos;
  },[userPos,heading]);

  // Simülasyon
  const[simPos,setSimPos]=useState<[number,number]|null>(null);
  const[simPct,setSimPct]=useState(0);
  const simRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const cumRef=useRef<number[]>([]);

  // Graf
  const[gd,setGd]=useState<GD|null>(null);
  const adList=useMemo(()=>gd?adj(gd):null,[gd]);
  useEffect(()=>{fetch("/campus_graph.json").then(r=>r.json()).then(setGd).catch(()=>{});},[]);

  // Aktif adım (navigasyon veya simülasyon)
  const[curStepIdx,setCurStepIdx]=useState(0);

  // ── GPS izle ──
  const toggleGPS=useCallback(()=>{
    if(gpsOn){
      if(watchRef.current!=null){navigator.geolocation.clearWatch(watchRef.current);watchRef.current=null;}
      setGpsOn(false);setUserPos(null);
    } else {
      if(!navigator.geolocation)return;
      setGpsOn(true);
      watchRef.current=navigator.geolocation.watchPosition(
        p=>setUserPos([p.coords.latitude,p.coords.longitude]),
        ()=>setGpsOn(false),
        {enableHighAccuracy:true,maximumAge:2000}
      );
    }
  },[gpsOn]);
  useEffect(()=>()=>{if(watchRef.current!=null)navigator.geolocation.clearWatch(watchRef.current);},[]);

  // ── Rota hesapla ──
  const calcRoute=useCallback((fLat:number,fLon:number,t:Loc)=>{
    const[tLa,tLo]=t.gps;
    const pts=gd&&adList?dijk(gd,adList,fLat,fLon,tLa,tLo):[[fLat,fLon],[tLa,tLo]] as[number,number][];
    setRoute(pts);setRouteM(distM(pts));
    const s=steps(pts);setNavSteps(s);setCurStepIdx(0);
    const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+hav(pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1]));
    cumRef.current=cum;
    setMode('ready');
  },[gd,adList]);

  // FROM veya GPS değişince rota yeniden hesapla
  useEffect(()=>{
    if(!to)return;
    if(fromGPS&&userPos)calcRoute(userPos[0],userPos[1],to);
    else if(from&&!fromGPS)calcRoute(from.gps[0],from.gps[1],to);
  },[from,fromGPS,userPos,to,calcRoute]);// eslint-disable-line

  // ── Simülasyon ──
  const stopSim=useCallback(()=>{
    if(simRef.current){clearInterval(simRef.current);simRef.current=null;}
    setSimPos(null);setSimPct(0);
  },[]);

  const startSim=useCallback(()=>{
    if(!route||route.length<2)return;
    stopSim();
    const cum=cumRef.current,r=route,total=cum[cum.length-1]??0;
    const TICK=50,step=(83/60)*(TICK/1000)*8;
    let trav=0;
    setSimPos(r[0]);setSimPct(0);setMode('sim');
    simRef.current=setInterval(()=>{
      trav+=step;
      if(trav>=total){clearInterval(simRef.current!);simRef.current=null;setSimPos(null);setSimPct(100);setMode('arrived');return;}
      setSimPct(Math.round((trav/total)*100));
      for(let i=1;i<cum.length;i++){
        if(cum[i]>=trav){
          const t=(trav-cum[i-1])/(cum[i]-cum[i-1]);
          setSimPos([r[i-1][0]+t*(r[i][0]-r[i-1][0]),r[i-1][1]+t*(r[i][1]-r[i-1][1])]);
          break;
        }
      }
    },TICK);
  },[route,stopSim]);
  useEffect(()=>()=>{if(simRef.current)clearInterval(simRef.current);},[]);

  // ── Gerçek GPS navigasyon – konuma göre adım ilerlet & varış tespiti ──
  useEffect(()=>{
    if(mode!=='nav'||!userPos||!to||!route)return;
    // Varış kontrolü
    const dToDest=hav(userPos[0],userPos[1],to.gps[0],to.gps[1]);
    if(dToDest<ARRIVE_M){setMode('arrived');return;}
    // Rota üzerindeki en yakın segment
    const cum=cumRef.current;
    let minD=Infinity,bestSeg=0;
    for(let i=1;i<route.length;i++){
      const d=hav(userPos[0],userPos[1],route[i][0],route[i][1]);
      if(d<minD){minD=d;bestSeg=i;}
    }
    const traveledEst=cum[Math.min(bestSeg,cum.length-1)]??0;
    const total=cum[cum.length-1]??1;
    setSimPct(Math.round((traveledEst/total)*100));
    // Aktif adım güncelle
    let cumStep=0;
    for(let i=0;i<navSteps.length;i++){
      cumStep+=navSteps[i].dist;
      if(cumStep>=traveledEst){setCurStepIdx(i);break;}
    }
  },[mode,userPos,to,route,navSteps]);

  // ── Pin tıklama mantığı ──
  const handlePinClick=useCallback((loc:Loc)=>{
    if(mode==='pickFrom'){setFrom(loc);setFromGPS(false);setMode('pickTo');return;}
    if(mode==='pickTo'){
      setTo(loc);
      const fLa=fromGPS&&userPos?userPos[0]:from?.gps[0]??0;
      const fLo=fromGPS&&userPos?userPos[1]:from?.gps[1]??0;
      calcRoute(fLa,fLo,loc);
      return;
    }
    if(mode==='ready'||mode==='sim'){
      // 3. pin → sıfırla ve yeni TO yap
      stopSim();setFrom(null);setFromGPS(false);setTo(loc);
      if(gpsOn&&userPos){setFromGPS(true);calcRoute(userPos[0],userPos[1],loc);}
      else{setMode('pickFrom');}
      return;
    }
    // idle modunda popup açılır (Leaflet varsayılan davranışı)
  },[mode,from,fromGPS,userPos,gpsOn,calcRoute,stopSim]);

  const reset=useCallback(()=>{
    stopSim();setFrom(null);setFromGPS(false);setTo(null);setRoute(null);setRouteM(0);
    setNavSteps([]);setShowSteps(false);setMode('idle');setCurStepIdx(0);setSimPct(0);
  },[stopSim]);

  // ── Android geri tuşu – panel kapat, sayfadan çıkma ──
  useEffect(()=>{
    if(mode!=='idle') history.pushState({santral:true},'');
  },[mode]);
  useEffect(()=>{
    const handler=(e:PopStateEvent)=>{
      const s=e.state as {santral?:boolean}|null;
      if(s?.santral){
        if(showSteps){setShowSteps(false);history.pushState({santral:true},'');return;}
        reset();
      }
    };
    window.addEventListener('popstate',handler);
    return()=>window.removeEventListener('popstate',handler);
  },[showSteps,reset]);

  const visible=useMemo(()=>LOCS.filter(l=>
    (!search||l.name.toLowerCase().includes(search.toLowerCase()))&&
    (!cat||l.cats.includes(cat))
  ),[search,cat]);

  const mins=Math.max(1,Math.round(routeM/83));
  const remM=Math.max(0,Math.round(routeM*(1-simPct/100)));
  const remMins=Math.max(1,Math.round(remM/83));
  const activeStep=navSteps[curStepIdx];
  const nextStep=navSteps[curStepIdx+1]??null;

  // Geçilen / kalan rota segmentleri
  const passedRoute=useMemo(()=>{
    if(!route||simPct===0)return[] as[number,number][];
    const cum=cumRef.current,total=cum[cum.length-1]??1,trav=total*simPct/100;
    let idx=0;for(let i=1;i<cum.length;i++){if(cum[i]>=trav){idx=i;break;}}
    return route.slice(0,idx+1) as[number,number][];
  },[route,simPct]);

  // Simülasyonda yakındaki bina
  const nearbyBldg=useMemo(()=>{
    if(!simPos||mode!=='sim')return null;
    let best:Loc|null=null,bd=Infinity;
    for(const loc of LOCS){
      const d=hav(simPos[0],simPos[1],loc.gps[0],loc.gps[1]);
      if(d<45&&d<bd){bd=d;best=loc;}
    }
    return best;
  },[simPos,mode]);

  const BTN:React.CSSProperties={border:"none",borderRadius:10,cursor:"pointer",
    display:"flex",alignItems:"center",justifyContent:"center",gap:6,
    fontFamily:"inherit",fontWeight:700,touchAction:"manipulation",minHeight:44};

  return(
    <div style={{position:"relative",height:"100dvh",width:"100%",overflow:"hidden",
      fontFamily:"'Segoe UI',system-ui,sans-serif",userSelect:"none"}}>

      {/* ─── Harita ─────────────────────────────────────────────────────── */}
      <div style={{position:"absolute",inset:0,zIndex:1}}>
        <MapContainer center={CAMPUS_CENTER} zoom={17}
          style={{height:"100%",width:"100%"}} minZoom={15} maxZoom={19}
          maxBounds={[[41.055,28.925],[41.085,28.965]]} maxBoundsViscosity={0.8} zoomControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap" maxZoom={19}/>
          {route&&<>
            {/* Geçilen yol – gri */}
            {passedRoute.length>1&&<Polyline positions={passedRoute} pathOptions={{color:"#94a3b8",weight:5,opacity:0.6,lineCap:"round",lineJoin:"round"}}/>}
            {/* Kalan yol gölge + renk */}
            <Polyline positions={route} pathOptions={{color:"#000",weight:9,opacity:0.12,lineCap:"round",lineJoin:"round"}}/>
            <Polyline positions={route} pathOptions={{color:"#3b82f6",weight:5,opacity:0.95,lineCap:"round",lineJoin:"round"}}/>
          </>}
          {simPos&&<Marker position={simPos} icon={PERSON} zIndexOffset={3000}/>}
          {/* PERSON (turuncu, puls) */}
          {userPos&&<Marker position={userPos} icon={PERSON} zIndexOffset={2900}/>}
          {visible.map(loc=>{
            const iF=fromGPS?false:from?.num===loc.num,iT=to?.num===loc.num;
            return(
              <Marker key={loc.num} position={loc.gps} icon={mkIcon(loc,iF,iT)}
                zIndexOffset={(iF||iT)?1000:0}
                eventHandlers={{click:()=>handlePinClick(loc)}}>
                {/* Popup sadece idle modda açılır */}
                {(mode==='idle'||mode==='ready')&&(
                  <Popup maxWidth={270} minWidth={220} closeButton>
                    <div style={{fontFamily:"'Segoe UI',sans-serif",padding:4}}>
                      {loc.photo?(
                        <div style={{borderRadius:8,overflow:"hidden",marginBottom:8,position:"relative"}}>
                          <img src={loc.photo} alt={loc.name}
                            style={{width:"100%",height:130,objectFit:"cover",display:"block"}}/>
                          <div style={{position:"absolute",bottom:0,left:0,right:0,
                            background:"linear-gradient(transparent,rgba(0,0,0,0.7))",
                            padding:"20px 10px 8px",textAlign:"center"}}>
                            <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>{loc.name}</div>
                            {ROOMS[String(loc.num)]&&(
                              <div style={{fontSize:10,color:"rgba(255,255,255,0.75)"}}>
                                {Object.values(ROOMS[String(loc.num)]).reduce((s,a)=>s+a.length,0)} mahal
                              </div>
                            )}
                          </div>
                        </div>
                      ):(
                        <div style={{
                          background:`linear-gradient(135deg,${CAT[loc.cats[0]]?.c??"#3b82f6"},${CAT[loc.cats[0]]?.c??"#3b82f6"}88)`,
                          borderRadius:8,padding:"14px 10px",textAlign:"center",marginBottom:8,
                        }}>
                          <div style={{fontSize:36,lineHeight:1}}>{loc.emoji}</div>
                          <div style={{fontWeight:800,fontSize:15,color:"#fff",marginTop:4}}>{loc.name}</div>
                          {ROOMS[String(loc.num)]&&(
                            <div style={{fontSize:10,color:"rgba(255,255,255,0.75)",marginTop:3}}>
                              {Object.values(ROOMS[String(loc.num)]).reduce((s,a)=>s+a.length,0)} mahal
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{fontSize:12,color:"#475569",marginBottom:8,lineHeight:1.5}}>{loc.desc}</div>
                      {ROOMS[String(loc.num)]&&(
                        <div style={{borderTop:"1px solid #e2e8f0",paddingTop:8,marginBottom:8}}>
                          <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",letterSpacing:"0.05em",marginBottom:6}}>MAHAL LİSTESİ</div>
                          <div style={{maxHeight:160,overflowY:"auto",fontSize:11,lineHeight:1.4}}>
                            {Object.entries(ROOMS[String(loc.num)]).map(([floor,rooms])=>(
                              <div key={floor} style={{marginBottom:8}}>
                                <div style={{fontWeight:700,color:"#1e293b",fontSize:10,
                                  background:"#f1f5f9",padding:"2px 6px",borderRadius:4,marginBottom:3}}>
                                  {floor}
                                </div>
                                {(rooms as RoomEntry[]).map((r,i)=>(
                                  <div key={i} style={{display:"flex",gap:4,alignItems:"baseline",
                                    padding:"2px 4px",borderBottom:"1px solid #f8fafc"}}>
                                    <span style={{color:"#1e293b",fontWeight:700,minWidth:44,flexShrink:0}}>{r.oda}</span>
                                    <span style={{color:"#475569",flex:1,overflow:"hidden",
                                      textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</span>
                                    {r.cap&&<span style={{color:"#94a3b8",flexShrink:0,fontSize:10}}>{r.cap}👤</span>}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={e=>{e.stopPropagation();setFrom(loc);setFromGPS(false);setMode('pickTo');
                          document.querySelectorAll('.leaflet-popup-close-button').forEach((b:Element)=>(b as HTMLElement).click());}}
                          style={{...BTN,flex:1,background:"#16a34a",color:"#fff",fontSize:12,padding:"8px 0"}}>
                          Buradan Başla
                        </button>
                        <button onClick={e=>{e.stopPropagation();setTo(loc);
                          if(gpsOn&&userPos){setFromGPS(true);calcRoute(userPos[0],userPos[1],loc);}
                          else{setMode('pickFrom');}
                          document.querySelectorAll('.leaflet-popup-close-button').forEach((b:Element)=>(b as HTMLElement).click());}}
                          style={{...BTN,flex:1,background:"#ef4444",color:"#fff",fontSize:12,padding:"8px 0"}}>
                          Buraya Git
                        </button>
                      </div>
                    </div>
                  </Popup>
                )}
              </Marker>
            );
          })}
          <FitMap/>
          <ZoomCtrl/>
          <CenterCtrl userPos={userPos}/>
          <MapFollower pos={mode==='nav'?userPos:mode==='sim'?simPos:null} active={mode==='nav'||mode==='sim'}/>
        </MapContainer>
      </div>

      {/* ─── Üst banner: seçim modu ──────────────────────────────────────── */}
      {(mode==='pickFrom'||mode==='pickTo')&&(
        <div style={{position:"absolute",top:0,left:0,right:0,zIndex:20,
          background:mode==='pickFrom'?"#16a34a":"#ef4444",
          padding:"14px 16px",display:"flex",alignItems:"center",gap:12,
          boxShadow:"0 3px 12px rgba(0,0,0,0.4)"}}>
          <span style={{fontSize:22}}>{mode==='pickFrom'?"🟢":"🔴"}</span>
          <span style={{color:"#fff",fontWeight:700,fontSize:15,flex:1}}>
            {mode==='pickFrom'?"Haritada başlangıç noktasına dokun":"Haritada varış noktasına dokun"}
          </span>
          {mode==='pickFrom'&&gpsOn&&userPos&&(
            <button onClick={()=>{setFromGPS(true);setMode('pickTo');}}
              style={{...BTN,background:"rgba(255,255,255,0.25)",color:"#fff",fontSize:12,padding:"6px 12px",minHeight:36}}>
              📍 Konum
            </button>
          )}
          <button onClick={reset} style={{...BTN,background:"rgba(0,0,0,0.2)",color:"#fff",minHeight:36,padding:"6px 10px",fontSize:20}}>✕</button>
        </div>
      )}

      {/* ─── Google Maps tarzı navigasyon kartı ─────────────────────────── */}
      {(mode==='sim'||mode==='nav')&&activeStep&&(
        <div style={{position:"absolute",top:56,left:0,right:0,zIndex:15,
          boxShadow:"0 4px 16px rgba(0,0,0,0.5)"}}>
          {/* Ana yön kartı */}
          <div style={{background:"#0d9488",padding:"14px 18px",
            display:"flex",alignItems:"center",gap:14}}>
            <div style={{fontSize:52,lineHeight:1,minWidth:56,textAlign:"center",
              filter:"drop-shadow(0 2px 4px rgba(0,0,0,0.3))"}}>
              {activeStep.arrow}
            </div>
            <div style={{flex:1}}>
              <div style={{color:"#fff",fontSize:20,fontWeight:800,lineHeight:1.2}}>
                {activeStep.text}
              </div>
              {remM>0&&<div style={{color:"rgba(255,255,255,0.75)",fontSize:13,marginTop:4}}>
                ~{remM}m · {remMins} dk kaldı
              </div>}
            </div>
            {mode==='sim'&&(
              <button onClick={()=>{stopSim();setMode('ready');}}
                style={{...BTN,background:"rgba(0,0,0,0.25)",color:"#fff",
                  minHeight:40,width:40,borderRadius:"50%",fontSize:18,padding:0}}>■</button>
            )}
          </div>
          {/* Sonraki adım */}
          {nextStep&&(
            <div style={{background:"#065f46",padding:"8px 18px 8px 88px",
              display:"flex",alignItems:"center",gap:8}}>
              <span style={{color:"rgba(255,255,255,0.6)",fontSize:12,whiteSpace:"nowrap"}}>Ardından</span>
              <span style={{fontSize:18,color:"rgba(255,255,255,0.85)"}}>{nextStep.arrow}</span>
              <span style={{fontSize:13,color:"rgba(255,255,255,0.85)",flex:1,
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nextStep.text}</span>
            </div>
          )}
        </div>
      )}

      {/* ─── Simülasyonda yakından geçilen bina ─────────────────────────── */}
      {nearbyBldg&&(
        <div style={{position:"absolute",zIndex:16,
          top:(mode==='sim'||mode==='nav')&&activeStep?170:70,
          left:"50%",transform:"translateX(-50%)",
          pointerEvents:"none"}}>
          <div style={{background:"rgba(15,23,42,0.92)",backdropFilter:"blur(8px)",
            color:"#fff",padding:"8px 16px",borderRadius:24,
            display:"flex",alignItems:"center",gap:8,
            boxShadow:"0 4px 16px rgba(0,0,0,0.5)",
            border:"1px solid rgba(255,255,255,0.1)",
            whiteSpace:"nowrap"}}>
            <span style={{fontSize:22}}>{nearbyBldg.emoji}</span>
            <div>
              <div style={{fontSize:13,fontWeight:700}}>{nearbyBldg.name}</div>
              <div style={{fontSize:10,color:"#94a3b8"}}>{nearbyBldg.desc.slice(0,40)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Varış bildirimi ─────────────────────────────────────────────── */}
      {mode==='arrived'&&(
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
          zIndex:30,background:"#16a34a",borderRadius:16,padding:"24px 32px",textAlign:"center",
          boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
          <div style={{fontSize:48}}>🎉</div>
          <div style={{color:"#fff",fontWeight:800,fontSize:18,marginTop:8}}>{to?.name}</div>
          <div style={{color:"rgba(255,255,255,0.8)",fontSize:13,marginTop:4}}>Hedefe ulaştınız!</div>
          <button onClick={reset} style={{...BTN,background:"rgba(255,255,255,0.25)",color:"#fff",
            marginTop:16,padding:"10px 24px",width:"100%",fontSize:14}}>Tamam</button>
        </div>
      )}

      {/* ─── Header ─────────────────────────────────────────────────────── */}
      {mode!=='pickFrom'&&mode!=='pickTo'&&mode!=='arrived'&&(
        <div style={{position:"absolute",top:0,left:0,right:0,zIndex:10,
          background:"linear-gradient(135deg,#7c2d12,#92400e)",
          padding:"10px 14px",display:"flex",alignItems:"center",gap:10,
          boxShadow:"0 2px 12px rgba(0,0,0,0.5)"}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:15,color:"#fff",letterSpacing:.4,textTransform:"uppercase"}}>Santral Kampüs</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.65)"}}>İstanbul Bilgi Üniversitesi</div>
          </div>
          <button onClick={toggleGPS} style={{...BTN,
            background:gpsOn?"rgba(59,130,246,0.35)":"rgba(255,255,255,0.15)",
            border:`1px solid ${gpsOn?"#3b82f6":"rgba(255,255,255,0.3)"}`,
            color:"#fff",minHeight:36,padding:"0 12px",fontSize:12,borderRadius:8,gap:4}}>
            📍{gpsOn?" Aktif":" Konum"}
          </button>
        </div>
      )}

      {/* ─── Sağ araç çubuğu: zoom + pusula + konuma git ──────────────────── */}
      <div style={{position:"absolute",right:12,top:70,zIndex:10,display:"flex",flexDirection:"column",gap:4}}>
        {[["z+","+"],["z-","−"]].map(([id,l])=>(
          <button key={id} id={id} style={{...BTN,width:40,height:40,background:"#1e293b",
            color:"#fff",border:"1px solid #334155",borderRadius:10,minHeight:40,
            boxShadow:"0 2px 8px rgba(0,0,0,0.3)",fontSize:18}}>{l}</button>
        ))}
        {/* Konuma git butonu – GPS açıksa görünür */}
        {gpsOn&&userPos&&(
          <button id="center-me"
            style={{...BTN,width:40,height:40,background:"#1e293b",
              border:"1px solid #334155",borderRadius:10,minHeight:40,
              boxShadow:"0 2px 8px rgba(0,0,0,0.3)",fontSize:18}}>📍</button>
        )}
      </div>

      {/* ─── Alt panel ───────────────────────────────────────────────────── */}
      <div
        style={{position:"absolute",bottom:0,left:0,right:0,zIndex:10,
          background:"#1e293b",borderRadius:"16px 16px 0 0",
          boxShadow:"0 -4px 24px rgba(0,0,0,0.5)",
          transform:`translateY(${Math.max(0,sheetTranslate)}px)`,
          transition:sheetTranslate===0?"transform 0.25s ease":"none"}}
        onTouchStart={e=>{touchStartY.current=e.touches[0].clientY;}}
        onTouchMove={e=>{
          const dy=e.touches[0].clientY-touchStartY.current;
          if(dy>0)setSheetTranslate(dy);
        }}
        onTouchEnd={()=>{
          if(sheetTranslate>80){
            setSheetTranslate(0);
            if(mode!=='idle')reset();
            else if(showSteps)setShowSteps(false);
          } else {
            setSheetTranslate(0);
          }
        }}>

        {/* Drag handle */}
        <div style={{display:"flex",justifyContent:"center",padding:"8px 0 2px",touchAction:"none",cursor:"grab"}}>
          <div style={{width:36,height:4,background:"#475569",borderRadius:2}}/>
        </div>

        <div style={{padding:"4px 12px 12px",display:"flex",flexDirection:"column",gap:8}}>

          {/* IDLE: Arama + yol tarifi butonu */}
          {mode==='idle'&&(
            <div style={{display:"flex",gap:8}}>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Bina ara…"
                style={{flex:1,background:"#0f172a",border:"1px solid #334155",borderRadius:10,
                  padding:"11px 14px",color:"#fff",fontSize:14,outline:"none",minHeight:44}}/>
              <button onClick={()=>setMode('pickFrom')}
                style={{...BTN,background:"#16a34a",color:"#fff",padding:"0 16px",fontSize:13,borderRadius:10}}>
                🗺 Yol Tarifi
              </button>
            </div>
          )}

          {/* READY / SIM / NAV: Rota bilgisi */}
          {(mode==='ready'||mode==='sim'||mode==='nav')&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {/* Kimden - Kime */}
              <div style={{display:"flex",alignItems:"center",gap:8,background:"#0f172a",borderRadius:10,padding:"10px 12px"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:"#16a34a",flexShrink:0}}/>
                    <span style={{fontSize:12,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {fromGPS?"📍 Konumunuz":from?.name??"—"}
                    </span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:"#ef4444",flexShrink:0}}/>
                    <span style={{fontSize:12,color:"#f1f5f9",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {to?.name??"—"}
                    </span>
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{color:"#86efac",fontWeight:800,fontSize:14}}>~{mins} dk</div>
                  <div style={{color:"#64748b",fontSize:11}}>{routeM} m</div>
                </div>
                <button onClick={reset}
                  style={{...BTN,background:"#334155",color:"#94a3b8",minHeight:36,padding:"0 10px",fontSize:18,borderRadius:8}}>✕</button>
              </div>

              {/* Sim/Nav ilerleyiş çubuğu – sadece küçük bar */}
              {(mode==='sim'||mode==='nav')&&(
                <div style={{height:4,background:"#0f172a",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${simPct}%`,background:"#0d9488",
                    borderRadius:2,transition:"width 0.1s linear"}}/>
                </div>
              )}

              {/* Aksiyon butonları */}
              {mode==='ready'&&(
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <div style={{display:"flex",gap:8}}>
                    {/* Önizleme: navigasyona gerek yok, sadece izle */}
                    <button onClick={startSim}
                      style={{...BTN,flex:1,background:"#f97316",color:"#fff",fontSize:13,
                        padding:"11px 0",borderRadius:10,flexDirection:"column",gap:2,minHeight:48}}>
                      <span style={{fontSize:18}}>▶</span>
                      <span style={{fontSize:11}}>Önizle</span>
                    </button>
                    {/* Gerçek GPS navigasyon */}
                    {gpsOn&&userPos?(
                      <button onClick={()=>{setFromGPS(true);setMode('nav');}}
                        style={{...BTN,flex:1,background:"#3b82f6",color:"#fff",fontSize:13,
                          padding:"11px 0",borderRadius:10,flexDirection:"column",gap:2,minHeight:48}}>
                        <span style={{fontSize:18}}>🚶</span>
                        <span style={{fontSize:11}}>Git (GPS)</span>
                      </button>
                    ):(
                      <button onClick={toggleGPS}
                        style={{...BTN,flex:1,background:"#334155",color:"#94a3b8",fontSize:11,
                          padding:"11px 0",borderRadius:10,flexDirection:"column",gap:2,minHeight:48}}>
                        <span style={{fontSize:18}}>📍</span>
                        <span>Konum Aç</span>
                      </button>
                    )}
                    <button onClick={()=>setShowSteps(p=>!p)}
                      style={{...BTN,background:showSteps?"#3b82f6":"#334155",color:"#fff",
                        fontSize:11,padding:"0 10px",borderRadius:10,flexDirection:"column",gap:2,minHeight:48,minWidth:50}}>
                      <span style={{fontSize:18}}>≡</span>
                      <span>{showSteps?"Gizle":"Adım"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Adım listesi – sadece showSteps açıksa, max 150px */}
              {showSteps&&(mode==='ready'||mode==='sim'||mode==='nav')&&(
                <div style={{background:"#0f172a",borderRadius:10,maxHeight:150,overflowY:"auto",padding:"4px 2px"}}>
                  {navSteps.map((s,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",
                      borderBottom:i<navSteps.length-1?"1px solid #1e293b":"none",
                      opacity:i<curStepIdx?0.3:1}}>
                      <span style={{fontSize:16,minWidth:24,textAlign:"center",
                        color:i===curStepIdx?"#f97316":"#64748b"}}>{s.arrow}</span>
                      <span style={{fontSize:12,color:i===curStepIdx?"#f1f5f9":"#94a3b8",flex:1,lineHeight:1.3}}>{s.text}</span>
                      {s.dist>0&&<span style={{fontSize:10,color:"#475569",flexShrink:0}}>{s.dist}m</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Kategori filtreleri – sadece idle modda */}
          {mode==='idle'&&(
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4} as React.CSSProperties}>
              <button onClick={()=>setCat(null)}
                style={{...BTN,fontSize:12,padding:"0 12px",minHeight:34,borderRadius:20,flexShrink:0,
                  border:"1px solid #475569",background:cat===null?"#3b82f6":"transparent",color:"#fff"}}>Tümü</button>
              {Object.entries(CAT).map(([k,v])=>(
                <button key={k} onClick={()=>setCat(p=>p===k?null:k)}
                  style={{...BTN,fontSize:12,padding:"0 12px",minHeight:34,borderRadius:20,flexShrink:0,
                    border:`1px solid ${v.c}55`,background:cat===k?v.c:"transparent",color:cat===k?"#fff":v.c}}>
                  {v.l}
                </button>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
