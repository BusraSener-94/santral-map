"use client";

import { useState, useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-rotate";
import ROOMS_RAW from "../public/rooms.json";
import { t, greetUser, tFloor, tCat, isEN, setLang } from "../lib/i18n";

type Occupant={name:string;title:string};
type RoomEntry={oda:string;label:string;cat:string;floor:string;cap?:number;unit?:string;occupants?:Occupant[]};
type RoomsData=Record<string,Record<string,RoomEntry[]>>;
const ROOMS=ROOMS_RAW as RoomsData;

// ── Sabitler ─────────────────────────────────────────────────────────────────
const CAMPUS_CENTER: [number, number] = [41.0673, 28.9490];
const CAMPUS_BOUNDS: [[number,number],[number,number]] = [[41.063, 28.941], [41.071, 28.957]];
const ARRIVE_M = 40; // metre – bu kadar yaklaşınca "ulaştınız" (GPS sapması için toleranslı)

interface OnboardStep{text:string;target:string|null;ring?:string;preview?:string;}

// Google Sheets Web App URL
const SHEET_URL = "https://script.google.com/macros/s/AKfycbx-wzOfRVu_1CIQZzde3r8f1wdsHpSE1MIkxT-PxR3UVLl758OySrZO_P7ZBrlUGFFd/exec";
const SHEET_TOKEN = "ks_bilgi_2526";

type UserRole = "Öğrenci"|"Öğretmen"|"Personel"|"Misafir";
interface UserProfile {
  name:string; role:UserRole;
  studentId?:string;   // Öğrenci
  faculty?:string;     // Öğretmen – fakülte
  department?:string;  // Öğretmen – bölüm
  unit?:string;        // Personel – birim
  position?:string;    // Personel – görev
  ts:number;
}

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
  const dirs=[t('dirNorth'),t('dirNE'),t('dirEast'),t('dirSE'),t('dirSouth'),t('dirSW'),t('dirWest'),t('dirNW')];
  out.push({text:`${dirs[Math.round(b0/45)%8]} ${t('stepWalk')}`,arrow:arrow(b0),dist:0});
  let pb=b0;
  for(let i=1;i<s.length-1;i++){
    const nb=brng(s[i][0],s[i][1],s[i+1][0],s[i+1][1]);
    const d=Math.round(hav(s[i-1][0],s[i-1][1],s[i][0],s[i][1]));
    let df=nb-pb;while(df>180)df-=360;while(df<-180)df+=360;
    if(Math.abs(df)>35){out.push({text:`${d}m ${t('stepAfter')} ${df<0?t('stepTurnLeft'):t('stepTurnRight')}`,arrow:df<0?"↰":"↱",dist:d});pb=nb;}
  }
  out.push({text:t('stepArrived'),arrow:"🏁",dist:0});
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

function FitOnRoute({route,fromPos,toPos}:{route:[number,number][]|null;fromPos:[number,number]|null;toPos:[number,number]|null}){
  const m=useMap();
  useEffect(()=>{
    if(!route||!fromPos||!toPos)return;
    const lats=[fromPos[0],toPos[0]],lons=[fromPos[1],toPos[1]];
    m.fitBounds([[Math.min(...lats),Math.min(...lons)],[Math.max(...lats),Math.max(...lons)]],
      {padding:[80,100],animate:true,duration:0.7,maxZoom:18});
  },[route]); // eslint-disable-line
  return null;
}

function FitOnCat({cat,locs}:{cat:string|null;locs:Loc[]}){
  const m=useMap();
  useEffect(()=>{
    if(cat===null){m.fitBounds(CAMPUS_BOUNDS,{padding:[30,30],animate:true,duration:0.5});return;}
    const pts=locs.filter(l=>l.cats.includes(cat)).map(l=>l.gps);
    if(pts.length===0)return;
    const lats=pts.map(p=>p[0]),lons=pts.map(p=>p[1]);
    m.fitBounds([[Math.min(...lats),Math.min(...lons)],[Math.max(...lats),Math.max(...lons)]],
      {padding:[60,60],animate:true,duration:0.5,maxZoom:18});
  },[cat,m]); // eslint-disable-line
  return null;
}

// Navigasyon sırasında haritayı kullanıcı konumuna kilitle
// autoTrack=false iken panTo yapılmaz; kullanıcı serbest dolaşabilir
function MapFollower({pos,active,autoTrack,onDrag}:{
  pos:[number,number]|null;active:boolean;autoTrack:boolean;onDrag:()=>void;
}){
  const m=useMap();
  useEffect(()=>{
    if(!active||!pos||!autoTrack)return;
    m.panTo(pos,{animate:true,duration:0.5});
  },[active,pos,m,autoTrack]);
  useEffect(()=>{
    if(!active)return;
    m.on('dragstart',onDrag);
    return()=>{m.off('dragstart',onDrag);};
  },[active,m,onDrag]);
  return null;
}

// leaflet-rotate'nin CompassBearing handler'ını kapat – telefon sallandığında harita dönmesin
function DisableCompassAutoRotate(){
  const m=useMap();
  useEffect(()=>{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (m as any).compassBearing?.disable();
  },[m]);
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

function MapRefCapture({mapRef}:{mapRef:MutableRefObject<L.Map|null>}){
  const m=useMap();
  useEffect(()=>{mapRef.current=m;},[m,mapRef]);
  return null;
}

// ── Veri ─────────────────────────────────────────────────────────────────────
interface Loc{num:number;name:string;nameEN?:string;gps:[number,number];cats:string[];desc:string;descEN?:string;emoji:string;photo?:string;photos?:string[];hidden?:boolean;logo?:string;logoSize?:number;keywords?:string[];}

function PhotoGallery({loc,height,mb=10}:{loc:Loc;height:number;mb?:number}){
  const imgs=loc.photos||(loc.photo?[loc.photo]:null);
  const[idx,setIdx]=useState(0);
  const galleryRef=useRef<HTMLDivElement>(null);
  // mouse/desktop pointer tracking
  const mStartX=useRef<number|null>(null);
  const mDragging=useRef(false);

  useEffect(()=>{setIdx(0);},[loc.num]);

  // Native non-passive touch – iOS Safari scroll müdahalesini engeller
  useEffect(()=>{
    const el=galleryRef.current;
    if(!el||!imgs||imgs.length<=1)return;
    let sx=0,sy=0,dir:null|'h'|'v'=null;
    const onStart=(e:TouchEvent)=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;dir=null;};
    const onMove=(e:TouchEvent)=>{
      if(dir==='v')return;
      const dx=Math.abs(e.touches[0].clientX-sx),dy=Math.abs(e.touches[0].clientY-sy);
      if(dir===null&&(dx>5||dy>5))dir=dx>dy?'h':'v';
      if(dir==='h')e.preventDefault();
    };
    const onEnd=(e:TouchEvent)=>{
      if(dir!=='h')return;
      const diff=sx-e.changedTouches[0].clientX;
      if(Math.abs(diff)>25){
        if(diff>0)setIdx(i=>(i+1)%imgs.length);
        else setIdx(i=>(i-1+imgs.length)%imgs.length);
      }
    };
    el.addEventListener('touchstart',onStart,{passive:true});
    el.addEventListener('touchmove',onMove,{passive:false});
    el.addEventListener('touchend',onEnd,{passive:true});
    return()=>{
      el.removeEventListener('touchstart',onStart);
      el.removeEventListener('touchmove',onMove);
      el.removeEventListener('touchend',onEnd);
    };
  },[imgs?.length,loc.num]);

  if(!imgs)return null;

  // Mouse / desktop
  const onPDown=(e:React.PointerEvent<HTMLDivElement>)=>{
    if(e.pointerType==='touch'||imgs.length<=1)return;
    mStartX.current=e.clientX;mDragging.current=true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPUp=(e:React.PointerEvent<HTMLDivElement>)=>{
    if(!mDragging.current||mStartX.current===null)return;
    const diff=mStartX.current-e.clientX;
    if(Math.abs(diff)>25){
      if(diff>0)setIdx(i=>(i+1)%imgs.length);
      else setIdx(i=>(i-1+imgs.length)%imgs.length);
    }
    mStartX.current=null;mDragging.current=false;
  };
  const onPCancel=()=>{mStartX.current=null;mDragging.current=false;};

  return(
    <div ref={galleryRef} onPointerDown={onPDown} onPointerUp={onPUp} onPointerCancel={onPCancel}
      style={{position:"relative",marginBottom:mb,touchAction:"none",userSelect:"none",
        cursor:imgs.length>1?"grab":"default"}}>
      <img src={imgs[idx]} alt={loc.nameEN||loc.name} draggable={false}
        style={{width:"100%",height,objectFit:"cover",borderRadius:10,display:"block",pointerEvents:"none"}}/>
      {imgs.length>1&&(
        <>
          <button onMouseDown={e=>e.preventDefault()}
            onClick={()=>setIdx(i=>(i-1+imgs.length)%imgs.length)}
            style={{position:"absolute",left:4,top:"50%",transform:"translateY(-50%)",
              background:"rgba(0,0,0,0.45)",border:"none",color:"#fff",borderRadius:"50%",
              width:26,height:26,cursor:"pointer",fontSize:16,lineHeight:1,zIndex:2}}>‹</button>
          <button onMouseDown={e=>e.preventDefault()}
            onClick={()=>setIdx(i=>(i+1)%imgs.length)}
            style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",
              background:"rgba(0,0,0,0.45)",border:"none",color:"#fff",borderRadius:"50%",
              width:26,height:26,cursor:"pointer",fontSize:16,lineHeight:1,zIndex:2}}>›</button>
          <div style={{position:"absolute",bottom:5,left:"50%",transform:"translateX(-50%)",display:"flex",gap:4,zIndex:2}}>
            {imgs.map((_,i)=>(
              <div key={i} style={{width:5,height:5,borderRadius:"50%",
                background:i===idx?"#fff":"rgba(255,255,255,0.4)"}}/>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
const locName=(l:Loc)=>isEN()&&l.nameEN?l.nameEN:l.name;
const locDesc=(l:Loc)=>isEN()&&l.descEN?l.descEN:l.desc;
/** Returns matched locs with the keyword that triggered the match (undefined = name match) */
function searchLocs(q:string,locs:Loc[]):{loc:Loc;keyword?:string}[]{
  if(!q)return locs.map(l=>({loc:l}));
  const lq=q.toLocaleLowerCase();
  const res:{loc:Loc;keyword?:string}[]=[];
  for(const l of locs){
    if(locName(l).toLocaleLowerCase().includes(lq)||l.name.toLocaleLowerCase().includes(lq)){
      res.push({loc:l});continue;
    }
    const kw=l.keywords?.find(k=>k.toLocaleLowerCase().includes(lq)||lq.includes(k.toLocaleLowerCase()));
    if(kw)res.push({loc:l,keyword:kw});
  }
  return res;
}
type EntityKind='staff'|'institute'|'dept';
interface Entity{id:string;name:string;nameEN?:string;title?:string;titleEN?:string;kind:EntityKind;parentPoiNum:number;room?:string;}
const ENTITY_ICON:Record<EntityKind,string>={staff:"👤",institute:"🏛️",dept:"🏢"};
const ENTITIES:Entity[]=[
  // Staff
  {id:"kayit_muduru",name:"Kayıt İşleri",title:"Öğrenci İşleri Daire Başkanlığı – Oda 216",kind:"dept",parentPoiNum:14,room:"216"},
  // Institutes in L1
  {id:"lisansustu",name:"Lisansüstü Programlar Enstitüsü",nameEN:"Institute of Graduate Programs",kind:"institute",parentPoiNum:7},
  {id:"bilisim_hukuku",name:"Bilişim ve Teknoloji Hukuku Enstitüsü",nameEN:"Institute of IT and Technology Law",title:"Hukuk Enstitüsü",kind:"institute",parentPoiNum:7},
  // Offices in ÇSM Ofisler
  {id:"etm",name:"ETM – Eğitim Teknolojileri Merkezi",nameEN:"ETM – Educational Technology Center",title:"Eski UZEM",titleEN:"Former UZEM",kind:"dept",parentPoiNum:14},
  {id:"kayit_isleri",name:"Kayıt İşleri Müdürlüğü",nameEN:"Registrar's Office",kind:"dept",parentPoiNum:14,room:"216"},
  {id:"hukuk_musavir",name:"Hukuk Müşavirliği",nameEN:"Legal Counsel",kind:"dept",parentPoiNum:14,room:"215"},
  // International Center
  {id:"erasmus",name:"Erasmus / Exchange Ofisi",nameEN:"Erasmus / Exchange Office",title:"Uluslararası Öğrenci Hareketliliği",titleEN:"International Student Mobility",kind:"dept",parentPoiNum:45},
  // ÖDM
  {id:"psikolojik_destek",name:"Psikolojik Danışmanlık",nameEN:"Psychological Counseling",title:"Öğrenci Destek Merkezi",titleEN:"Student Support Center",kind:"dept",parentPoiNum:30},
  {id:"kariyer",name:"Kariyer Merkezi",nameEN:"Career Center",title:"Öğrenci Destek Merkezi",titleEN:"Student Support Center",kind:"dept",parentPoiNum:30},
  // EN-1 departments
  {id:"insaat",name:"İnşaat Mühendisliği",nameEN:"Civil Engineering",kind:"dept",parentPoiNum:21},
  {id:"makine",name:"Makine Mühendisliği",nameEN:"Mechanical Engineering",kind:"dept",parentPoiNum:21},
  {id:"mekatronik",name:"Mekatronik Mühendisliği",nameEN:"Mechatronics Engineering",kind:"dept",parentPoiNum:21},
  {id:"matematik",name:"Matematik Bölümü",nameEN:"Mathematics Department",kind:"dept",parentPoiNum:21},
  {id:"mol_biyoloji",name:"Moleküler Biyoloji ve Genetik",nameEN:"Molecular Biology & Genetics",kind:"dept",parentPoiNum:21},
];
function entName(e:Entity){return isEN()&&e.nameEN?e.nameEN:e.name;}
function entTitle(e:Entity){return isEN()&&e.titleEN?e.titleEN:e.title;}
function searchEntities(q:string):Entity[]{
  if(!q)return[];
  const lq=q.toLocaleLowerCase();
  return ENTITIES.filter(e=>
    e.name.toLocaleLowerCase().includes(lq)||
    (e.nameEN?.toLocaleLowerCase().includes(lq)??false)||
    (e.title?.toLocaleLowerCase().includes(lq)??false)||
    (e.titleEN?.toLocaleLowerCase().includes(lq)??false)
  );
}
const CAT:Record<string,{c:string;l:string}>={
  eğitsel:{c:"#3b82f6",l:"Eğitsel"},sosyal:{c:"#f59e0b",l:"Sosyal"},
  idari:{c:"#8b5cf6",l:"İdari"},işlevsel:{c:"#10b981",l:"İşlevsel"},
  otopark:{c:"#6b7280",l:"Otopark"},giriş:{c:"#ef4444",l:"Giriş"},
};
// Çevrilmiş kategori etiketleri – CAT anahtarlarıyla eşleşir
const CAT_LABELS = {
  eğitsel: t('catEgitsel'),
  sosyal:  t('catSosyal'),
  idari:   t('catIdari'),
  işlevsel:t('catIslevsel'),
  otopark: t('catOtopark'),
  giriş:   t('catGiris'),
} as const;
function RoomRow({r,roomKey,expanded,onToggle,dark,highlighted}:{
  r:RoomEntry;roomKey:string;expanded:boolean;onToggle:(k:string)=>void;dark?:boolean;highlighted?:boolean;
}){
  const hasOcc=!!r.occupants?.length;
  const baseTxt=dark?"#e2e8f0":"#1e293b";
  const subTxt=dark?"#94a3b8":"#475569";
  const divider=dark?"#1e293b":"#f8fafc";
  return(
    <div style={{borderBottom:`1px solid ${divider}`,
      boxShadow:highlighted?"inset 3px 0 0 #f97316, 0 0 8px rgba(249,115,22,0.25)":"none",
      borderRadius:highlighted?4:0,transition:"box-shadow 0.6s ease"}}>
      <div style={{display:"flex",gap:6,alignItems:"center",padding:"3px 6px",
        background:highlighted?(dark?"rgba(249,115,22,0.1)":"rgba(249,115,22,0.06)"):
          expanded?(dark?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.03)"):"transparent",
        transition:"background 0.25s"}}>
        <span style={{color:baseTxt,fontWeight:700,minWidth:48,flexShrink:0,fontSize:dark?11:12}}>{r.oda}</span>
        <span style={{color:subTxt,flex:1,overflow:"hidden",textOverflow:"ellipsis",
          whiteSpace:"nowrap",fontSize:dark?11:12}}>{r.label===r.cat?tCat(r.label):r.label}</span>
        {r.cap&&(
          hasOcc?(
            <button onClick={()=>onToggle(roomKey)}
              style={{display:"flex",alignItems:"center",gap:3,
                background:expanded?(dark?"rgba(99,102,241,0.2)":"rgba(99,102,241,0.12)"):"transparent",
                border:"none",borderRadius:6,padding:"2px 5px",cursor:"pointer",
                color:expanded?"#818cf8":dark?"#64748b":"#6366f1",
                fontSize:dark?10:11,fontWeight:700,
                transition:"background 0.15s,color 0.15s",flexShrink:0}}>
              {r.cap}<span style={{fontSize:dark?10:11}}>👤</span>
              <span style={{fontSize:9,opacity:0.7,marginLeft:1}}>{expanded?"▲":"▼"}</span>
            </button>
          ):(
            <span style={{color:subTxt,fontSize:dark?10:11,flexShrink:0,paddingRight:2}}>{r.cap}👤</span>
          )
        )}
      </div>
      {expanded&&hasOcc&&(
        <div style={{padding:"4px 6px 6px 54px",background:dark?"rgba(99,102,241,0.06)":"rgba(99,102,241,0.04)"}}>
          {r.occupants!.map((o,i)=>(
            <div key={i} style={{display:"flex",alignItems:"baseline",gap:6,
              padding:"3px 0",borderBottom:i<r.occupants!.length-1?`1px solid ${divider}`:"none"}}>
              <span style={{fontSize:dark?11:12,color:baseTxt,fontWeight:600,flex:1}}>{o.name}</span>
              <span style={{fontSize:dark?10:11,color:subTxt,flexShrink:0}}>{o.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
const LOCS:Loc[]=[
  // ── Girişler ──────────────────────────────────────────────────────────────
  {num:1, name:"Cami Tarafı Giriş",  nameEN:"West Gate",           gps:[41.06855,28.94406],cats:["giriş"],   emoji:"🚪",desc:"Cami tarafındaki kampüs batı ana giriş kapısı.",descEN:"West main campus entrance gate near the mosque.",photo:"/buildings/cami-giris.jpg",photos:["/buildings/cami-giris.jpg","/buildings/cami-giris2.jpg"]},
  {num:25,name:"Misafir Girişi",      nameEN:"South Gate",           gps:[41.06668,28.94535],cats:["giriş"],   emoji:"🚪",desc:"Ana misafir ve öğrenci güney girişi.",descEN:"Main south entrance for visitors and students."},
  {num:33,name:"Tarihi Giriş",        nameEN:"Historic Gate",        gps:[41.06568,28.94669],cats:["giriş"],   emoji:"🏛️",desc:"Tarihi güç santrali ana giriş kapısı.",descEN:"Historic main entrance of the power plant complex.",photo:"/buildings/tarihi-giris.jpg"},
  // ── Eğitsel ───────────────────────────────────────────────────────────────
  {num:2, name:"E1",                  gps:[41.06884,28.94474],cats:["eğitsel"],  emoji:"🏭",desc:"İletişim Fakültesi – Görsel İletişim Tasarımı (VCD), Dijital Oyun Tasarımı, Radyo Televizyon ve Sinema (FTV), Dijital Yapımcılık ve Yayıncılık.",descEN:"Faculty of Communication – Visual Communication Design (VCD), Digital Game Design, Radio Television and Cinema (FTV), Digital Production and Broadcasting.",photo:"/buildings/e1.jpg",keywords:["Görsel İletişim Tasarımı","VCD","Dijital Oyun Tasarımı","Oyun Tasarımı","FTV","Radyo Televizyon","Sinema","Dijital Yapımcılık","İletişim Fakültesi"]},
  {num:3, name:"E2",                  gps:[41.06959,28.94568],cats:["eğitsel"],  emoji:"🏭",desc:"Sosyal ve Beşeri Bilimler Fakültesi – Psikoloji, Sosyoloji, Tarih, Karşılaştırmalı Edebiyat, İngiliz Dili ve Edebiyatı, Müzik.",descEN:"Faculty of Social Sciences and Humanities – Psychology, Sociology, History, Comparative Literature, English Language & Literature, Music.",photo:"/buildings/e2.jpg",keywords:["Psikoloji","Sosyoloji","Tarih","Karşılaştırmalı Edebiyat","İngiliz Dili","İngiliz Edebiyatı","Müzik","Sosyal Bilimler","Beşeri Bilimler","SOSBEL"]},
  {num:7, name:"L1",                  gps:[41.06909,28.94553],cats:["eğitsel"],  emoji:"🏭",desc:"Lisansüstü Programlar Enstitüsü, Bilişim ve Teknoloji Hukuku Enstitüsü, araştırma merkezleri.",descEN:"Institute of Graduate Programs, Institute of IT and Technology Law, research centers.",photo:"/buildings/l1.jpg",keywords:["Yüksek Lisans","Doktora","SBE","FBE","Enstitü","Graduate"]},
  {num:8, name:"L2",                  gps:[41.06861,28.94553],cats:["eğitsel","idari"],emoji:"🏭",desc:"L2 binası.",descEN:"L2 building.",photo:"/buildings/l2.jpg"},
  {num:9, name:"L3",                  gps:[41.06906,28.94581],cats:["eğitsel"],  emoji:"🏭",desc:"L3 Enerji binası.",descEN:"L3 Energy building.",photo:"/buildings/l3.jpg"},
  {num:11,name:"E3",                  gps:[41.06807,28.94656],cats:["eğitsel"],  emoji:"🏢",desc:"Mühendislik ve Doğa Bilimleri Fakültesi – Bilgisayar Mühendisliği, Elektrik Elektronik Mühendisliği, Enerji Sistemleri Mühendisliği.",descEN:"Faculty of Engineering and Natural Sciences – Computer Engineering, Electrical & Electronics Engineering, Energy Systems Engineering.",photo:"/buildings/e3.jpg",keywords:["Bilgisayar Mühendisliği","Elektrik Elektronik Mühendisliği","Enerji Sistemleri","Mühendislik Fakültesi","BM","EEE","CS","Doğa Bilimleri","Yazılım"]},
  {num:12,name:"E4",                  gps:[41.06729,28.94669],cats:["eğitsel"],  emoji:"🏢",desc:"İletişim Fakültesi – Medya, Reklamcılık, Sahne Sanatları, Sanat ve Kültür Yönetimi.",descEN:"Faculty of Communication – Media, Advertising, Performing Arts, Arts and Cultural Management.",photo:"/buildings/e4.jpg",keywords:["Medya","Reklamcılık","Reklam","Sahne Sanatları","Sanat ve Kültür Yönetimi","Performans","İletişim E4"]},
  {num:13,name:"ÇSM Sınıflar",        nameEN:"CSM Classrooms",      gps:[41.06692,28.94621],cats:["eğitsel"],  emoji:"🎓",desc:"ÇSM alt kat – derslikler ve çalışma sınıfları.",descEN:"CSM lower floor – classrooms and study rooms.",photo:"/buildings/csm-siniflar.jpg"},
  {num:18,name:"E5",                  gps:[41.06610,28.94660],cats:["eğitsel"],  emoji:"🏢",desc:"Sosyal ve Beşeri Bilimler Fakültesi – Uluslararası İlişkiler, Avrupa Birliği Enstitüsü.",descEN:"Faculty of Social Sciences and Humanities – International Relations, European Union Institute.",photo:"/buildings/e5.jpg",keywords:["Uluslararası İlişkiler","Avrupa Birliği","AB Enstitüsü","Siyaset Bilimi","Uluslararası E5","UI","International Relations"]},
  {num:19,name:"E6",                  gps:[41.06606,28.94619],cats:["eğitsel"],  emoji:"🏢",desc:"E6 akademik binası.",descEN:"E6 academic building.",photo:"/buildings/e6.jpg"},
  {num:16,name:"KD4 Mimarlık",        nameEN:"KD4 Architecture",    gps:[41.06630,28.94616],cats:["eğitsel"],  emoji:"📐",desc:"Mimarlık Fakültesi – Mimarlık, İç Mimarlık, Endüstri Ürünleri Tasarımı.",descEN:"Faculty of Architecture – Architecture, Interior Architecture, Industrial Product Design.",photo:"/buildings/mimarlik-kd4.jpg",keywords:["Mimarlık Fakültesi","İç Mimarlık","Endüstri Ürünleri Tasarımı","Tasarım","Stüdyo","Atölye","MİMFAK","KD4"]},
  {num:17,name:"Seyfi Arıkan",        gps:[41.06689,28.94692],cats:["eğitsel"],  emoji:"🎤",desc:"Hukuk Fakültesi – derslikler ve konferans salonu.",descEN:"Faculty of Law – classrooms and conference hall.",photo:"/buildings/seyfi-arikan.jpg",keywords:["Hukuk Fakültesi","Hukuk","Özel Hukuk","Kamu Hukuku","Konferans Salonu","Amfi","Derslik Hukuk"]},
  {num:20,name:"Kütüphane",           nameEN:"Library",             gps:[41.06635,28.94598],cats:["eğitsel","sosyal"],emoji:"📚",desc:"Mehmet Kenan Tekdağ Kütüphanesi.",descEN:"Mehmet Kenan Tekdağ Library.",photo:"/buildings/kutuphane.jpg",keywords:["Tekdağ","Mehmet Kenan","Okuma Salonu","Kitap","Araştırma","Veritabanı","Kütüphane"]},
  {num:22,name:"MIDL",               gps:[41.06726,28.94597],cats:["sosyal"],   emoji:"🎬",desc:"Medya ve İletişim Tasarım Laboratuvarı.",descEN:"Media and Communication Design Laboratory.",photo:"/buildings/midl.jpg"},
  {num:31,name:"Gastronomi Mutfak",   nameEN:"Gastronomy Kitchen",  gps:[41.06603,28.94565],cats:["eğitsel"],  emoji:"👨‍🍳",desc:"Gastronomi ve Mutfak Sanatları bölümü – uygulama mutfakları.",descEN:"Gastronomy and Culinary Arts department – practice kitchens.",photo:"/buildings/gastronomi.jpg"},
  {num:37,name:"Blab",               gps:[41.06753,28.94561],cats:["sosyal"],   emoji:"☕",desc:"Blab Coffee – kampüs kafe alanı.",descEN:"Blab Coffee – campus café.",photo:"/buildings/blab.jpg"},
  // ── İdari ─────────────────────────────────────────────────────────────────
  {num:10,name:"Rektörlük",           nameEN:"Rector's Office",     gps:[41.06833,28.94617],cats:["idari"],    emoji:"🏛️",desc:"Rektörlük idari ofisleri.",descEN:"Rectorate administrative offices.",keywords:["Rektör","Genel Sekreter","Yönetim","İdari","Dekanlık","Akademik Kurul"]},
  {num:14,name:"ÇSM Ofisler",         nameEN:"CSM Offices",         gps:[41.06725,28.94627],cats:["idari"],    emoji:"🏢",desc:"ÇSM üst kat – öğrenci kulüp ve ofisleri. ETM Eğitim Teknolojileri Uygulama ve Araştırma Merkezi (Eski UZEM).",descEN:"CSM upper floor – student clubs and offices. ETM Educational Technology Application and Research Center.",photo:"/buildings/csm-ofisler.jpg",keywords:["Öğrenci Kulüpleri","ÇSM"]},
  {num:36,name:"Öğrenci İşleri",      nameEN:"Student Affairs",     gps:[41.06709,28.94646],cats:["idari"],    emoji:"📋",desc:"Öğrenci İşleri Direktörlüğü – ÇSM Ofisler yanı, üst kat.",descEN:"Student Affairs Directorate – next to CSM Offices, upper floor.",photo:"/buildings/ogrenci-isleri.jpg",keywords:["Transkript","Belge","Diploma","Mezuniyet","Kayıt Yenileme","Öğrenci Belgesi","Sertifika","Vizeler","Not"]},
  {num:45,name:"Uluslararası Merkez", nameEN:"International Center",gps:[41.06769,28.94670],cats:["idari"],    emoji:"🌍",desc:"Uluslararası Öğrenci Merkezi.",descEN:"International Student Center.",photo:"/buildings/uluslararasi.jpg",keywords:["Yabancı Öğrenci","Mübadele","Uluslararası Öğrenci","International Student"]},
  {num:21,name:"EN-1",               gps:[41.06757,28.94543],cats:["eğitsel","idari"],emoji:"🏢",desc:"Mühendislik ve Doğa Bilimleri Fakültesi – İnşaat Mühendisliği, Makine Mühendisliği, Mekatronik Mühendisliği, Matematik, Moleküler Biyoloji ve Genetik.",descEN:"Faculty of Engineering and Natural Sciences – Civil Engineering, Mechanical Engineering, Mechatronics Engineering, Mathematics, Molecular Biology and Genetics."},
  {num:30,name:"ÖDM",                gps:[41.06536,28.94620],cats:["idari"],    emoji:"🤝",desc:"Öğrenci Destek Merkezi (ÖDM) – danışmanlık ve kariyer.",descEN:"Student Support Center (ÖDM) – counseling and career services.",photo:"/buildings/odm.jpg",keywords:["Danışmanlık","Kariyer","Psikolojik Destek","PDR","Rehberlik","Öğrenci Destek","Psikoloji Merkezi"]},
  {num:32,name:"BT",                 gps:[41.06589,28.94637],cats:["idari"],    emoji:"💻",desc:"Bilişim Teknolojileri birimi.",descEN:"Information Technologies unit.",photo:"/buildings/bt.jpg",keywords:["Bilişim","IT","Teknik Destek","Wifi","İnternet","Şifre","Parola","Yazıcı","Laptop","BİT","Helpdesk"]},
  {num:40,name:"Yapı Kredi",         gps:[41.06746,28.94560],cats:["işlevsel"], emoji:"🏦",desc:"Yapı Kredi bankacılık şubesi.",descEN:"Yapı Kredi bank branch."},
  {num:46,name:"Yapı Kredi ATM",     gps:[41.06828,28.94469],cats:["işlevsel"], emoji:"🏧",desc:"Yapı Kredi ATM – kafeterya yanı.",descEN:"Yapı Kredi ATM – next to cafeteria.",photo:"/buildings/yapikredi-atm.jpg"},
  {num:47,name:"VakıfBank ATM",      gps:[41.06702,28.94539],cats:["işlevsel"], emoji:"🏧",desc:"VakıfBank ATM – güney kampüs.",descEN:"VakıfBank ATM – south campus.",photo:"/buildings/vakifbank-atm.jpg"},
  // ── Sosyal ────────────────────────────────────────────────────────────────
  {num:4, name:"Yemekhane",           nameEN:"Cafeteria",           gps:[41.06814,28.94451],cats:["sosyal"],   emoji:"🍽️",desc:"Kampüs ana yemekhanesi.",descEN:"Main campus cafeteria.",photo:"/buildings/yemekhane.jpg"},
  {num:5, name:"Nero",               gps:[41.06809,28.94477],cats:["sosyal"],   emoji:"☕",desc:"Caffè Nero kahve.",descEN:"Caffè Nero coffee.",logo:"/buildings/nero-logo.png",photo:"/buildings/nero.jpg"},
  {num:38,name:"Starbucks",          gps:[41.06815,28.94466],cats:["sosyal"],   emoji:"☕",desc:"Starbucks Coffee – kampüs şubesi.",descEN:"Starbucks Coffee – campus branch.",logo:"/buildings/starbucks-logo.png",logoSize:20,photo:"/buildings/starbucks.jpg"},
  {num:23,name:"Lokanta",             nameEN:"Restaurant",          gps:[41.06701,28.94566],cats:["sosyal"],   emoji:"🍜",desc:"Sosyal Lokanta – Lokma.",descEN:"Social Restaurant – Lokma."},
  {num:24,name:"Espressolab",        gps:[41.06692,28.94569],cats:["sosyal"],   emoji:"☕",desc:"Espressolab kahve.",descEN:"Espressolab coffee.",photo:"/buildings/espressolab.jpg"},
  {num:39,name:"Sunpeak",            gps:[41.06807,28.94463],cats:["sosyal"],   emoji:"🌞",desc:"Sunpeak Coffee – kampüs yeni binası.",descEN:"Sunpeak Coffee – new campus building.",photo:"/buildings/sunpeak.jpg",logo:"/buildings/sunpeak-logo.png"},
  {num:15,name:"Enerji Müzesi",       nameEN:"Energy Museum",       gps:[41.06659,28.94666],cats:["sosyal"],   emoji:"⚡",desc:"santralistanbul Enerji Müzesi – halka açık.",descEN:"santralistanbul Energy Museum – open to the public.",photo:"/buildings/enerji-muzesi.jpg"},
  {num:27,name:"Etkinlik Çadırı",     nameEN:"Event Tent",          gps:[41.06562,28.94564],cats:["sosyal"],   emoji:"⛺",desc:"Açık hava etkinlik çadırı alanı.",descEN:"Outdoor event tent area.",photo:"/buildings/etkinlik-cadiri.jpg"},
  {num:35,name:"Amfi Girişi",         nameEN:"Amphitheater",        gps:[41.06463,28.94543],cats:["sosyal"],   emoji:"🎭",desc:"Açık hava amfi tiyatrosu girişi.",descEN:"Open-air amphitheater entrance.",photo:"/buildings/amfi.jpg",photos:["/buildings/amfi.jpg","/buildings/amfi2.jpg"]},
  // ── İşlevsel ──────────────────────────────────────────────────────────────
  {num:28,name:"Kuluçka",             nameEN:"Incubator",           gps:[41.06501,28.94550],cats:["işlevsel"], emoji:"💡",desc:"BİLGİ Sosyal Kuluçka Merkezi – CARE konteyner.",descEN:"BİLGİ Social Incubation Center – CARE container.",photo:"/buildings/kulucka.jpg"},
  {num:29,name:"Revir",               nameEN:"Health Center",       gps:[41.06548,28.94629],cats:["işlevsel"], emoji:"🏥",desc:"Kampüs sağlık birimi.",descEN:"Campus health unit.",photo:"/buildings/revir.jpg",keywords:["Doktor","Sağlık","Hasta","İlaç","Hemşire","Acil","Sağlık Merkezi","Tıp","Revir"]},
  {num:42,name:"Kuaför",              nameEN:"Hair Salon",          gps:[41.06820,28.94466],cats:["işlevsel"], emoji:"✂️",desc:"Kampüs kuaför ve berber salonu – HairCraft.",descEN:"Campus hair and barber salon – HairCraft.",logo:"/buildings/haircraft-logo.png",photo:"/buildings/haircraft.jpg"},
  {num:43,name:"Çalışma Alanı",       nameEN:"Study Area",          gps:[41.06809,28.94445],cats:["işlevsel"], emoji:"📖",desc:"Yemekhane arkasındaki öğrenci çalışma salonu.",descEN:"Student study hall behind the cafeteria.",photo:"/buildings/calisma-salonu.jpg"},
  // ── Otopark ───────────────────────────────────────────────────────────────
  {num:26,name:"Otopark",             nameEN:"Car Park",            gps:[41.06587,28.94494],cats:["otopark"],  emoji:"🅿️",desc:"Kampüs ana araç otoparkı – güney.",descEN:"Main campus car park – south.",photo:"/buildings/otopark.jpg",photos:["/buildings/otopark.jpg","/buildings/otopark2.jpg"]},
  {num:34,name:"Otopark Girişi",      nameEN:"Parking Entrance",    gps:[41.06471,28.94660],cats:["otopark"],  emoji:"🚗",desc:"Otopark araç giriş/çıkış noktası.",descEN:"Car park vehicle entry/exit point.",photo:"/buildings/otopark-girisi.jpg"},
  {num:44,name:"Arka Otopark",        nameEN:"North Car Park",      gps:[41.06930,28.94449],cats:["otopark"],  emoji:"🅿️",desc:"Kampüs arka otopark – kuzey taraf.",descEN:"Rear campus car park – north side.",photo:"/buildings/arka-otopark.jpg"},
];

// ── İkonlar ───────────────────────────────────────────────────────────────────
function mkIcon(loc:Loc,isF:boolean,isT:boolean,showLabel:boolean):L.DivIcon{
  const col=isF?"#16a34a":isT?"#ef4444":(CAT[loc.cats[0]]?.c??"#3b82f6");
  if(!showLabel&&!loc.logo){
    return L.divIcon({
      html:`<div style="width:9px;height:9px;border-radius:50%;background:${col};border:2px solid rgba(255,255,255,0.8);box-shadow:0 1px 4px rgba(0,0,0,0.5);"></div>`,
      className:"",iconSize:[9,9],iconAnchor:[4,4],
    });
  }
  if(loc.logo){
    const sz=loc.logoSize??26,half=Math.round(sz/2);
    const border=isF?"3px solid #16a34a":isT?"3px solid #ef4444":"none";
    return L.divIcon({
      html:`<img src="${loc.logo}" alt="${loc.name}" style="width:${sz}px;height:${sz}px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5));${border?`outline:${border};outline-offset:-2px;border-radius:50%;`:""}"/>`,
      className:"",iconSize:[sz,sz],iconAnchor:[half,half],
    });
  }
  const bg=isF?"#16a34a":isT?"#ef4444":"rgba(15,23,42,0.72)";
  const tc="#fff";
  const sh=isF||isT?"0 2px 6px rgba(0,0,0,0.4)":"0 1px 3px rgba(0,0,0,0.3)";
  return L.divIcon({
    html:`<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="background:${bg};color:${tc};font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;white-space:nowrap;max-width:88px;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px;box-shadow:${sh};backdrop-filter:blur(4px);">${locName(loc)}</div>
      <div style="width:9px;height:9px;border-radius:50%;background:${col};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5);"></div>
    </div>`,
    className:"",iconSize:[90,26],iconAnchor:[45,24],
  });
}
function ZoomWatcher({setShowLabels}:{setShowLabels:(v:boolean)=>void}){
  const map=useMap();
  useMapEvents({zoomend:()=>setShowLabels(map.getZoom()>=17)});
  useEffect(()=>{setShowLabels(map.getZoom()>=17);},[map,setShowLabels]);
  return null;
}
// Karpuz – kullanıcı konumu simgesi
const PERSON=L.divIcon({
  html:`<div style="position:relative;width:64px;height:64px;">
    <div style="position:absolute;inset:-8px;border-radius:50%;background:rgba(249,115,22,0.20);animation:gps-pulse 2s ease-out infinite;"></div>
    <img src="/karpuzgif.gif" style="position:absolute;inset:0;width:64px;height:64px;object-fit:contain;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.6));"/>
  </div>`,
  className:"",iconSize:[64,64],iconAnchor:[32,32]
});

const FRIEND_COLORS=["#10b981","#3b82f6","#a855f7","#f59e0b","#ec4899"];
function mkFriendIcon(idx:number){
  const col=FRIEND_COLORS[idx%FRIEND_COLORS.length];
  const num=idx+1;
  return L.divIcon({
    html:`<div style="position:relative;width:40px;height:48px;">
      <div style="position:absolute;inset:-6px;border-radius:50%;background:${col}38;animation:gps-pulse 2s ease-out infinite;"></div>
      <div style="width:40px;height:40px;border-radius:50%;background:${col};border:3px solid #fff;
        display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;color:#fff;
        box-shadow:0 2px 8px rgba(0,0,0,0.45);">${num}</div>
      <div style="position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);
        width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;
        border-top:8px solid ${col};"></div>
    </div>`,
    className:"",iconSize:[40,48],iconAnchor:[20,48]
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
  const mapInstanceRef=useRef<L.Map|null>(null);
  const sheetRef=useRef<HTMLDivElement>(null);
  const handleRef=useRef<HTMLDivElement>(null);
  const dragY=useRef(0);
  const dragStartH=useRef(230);
  const sheetDismiss=useRef(()=>{});

  // Uygulama modu
  type Mode='idle'|'pickFrom'|'pickTo'|'ready'|'sim'|'nav'|'arrived';
  const[mode,setMode]=useState<Mode>('idle');

  // Arama & filtre
  const[search,setSearch]=useState("");
  const[cat,setCat]=useState<string|null>(null);
  const[showLabels,setShowLabels]=useState(true); // başlangıç zoom 17 >= 17

  // GPS
  const[userPos,setUserPos]=useState<[number,number]|null>(null);
  const[gpsOn,setGpsOn]=useState(false);
  const watchRef=useRef<number|null>(null);
  const[sharedPins,setSharedPins]=useState<[number,number][]>([]);
  // sessionStorage ile oturum başına sadece 1 kez splash → re-mount'ta tekrar çıkmaz
  const[splash,setSplash]=useState<"visible"|"fading"|"hidden">(()=>{
    if(typeof window!=="undefined"&&sessionStorage.getItem("splash_shown"))return"hidden";
    return"visible";
  });
  const[userProfile,setUserProfile]=useState<UserProfile|null>(null);
  const[showWelcome,setShowWelcome]=useState(false);
  const[selectedLoc,setSelectedLoc]=useState<Loc|null>(null);
  const[panelLoc,setPanelLoc]=useState<Loc|null>(null);
  const [tourStep, setTourStep] = useState<number>(0);
  const [showTour, setShowTour] = useState<boolean>(false);
  const [isDarkTheme, setIsDarkTheme] = useState(true);
  const[wRole,setWRole]=useState<UserRole|null>(null);
  const[wName,setWName]=useState("");
  const[wExtra,setWExtra]=useState(""); // Öğretmen→fakülte, Personel→görev
  const[wKvkk,setWKvkk]=useState(false);
  const[kvkkModal,setKvkkModal]=useState(false);
  const[heading,setHeading]=useState<number|null>(null);
  const prevPosRef=useRef<[number,number]|null>(null);
  const[onboardStep,setOnboardStep]=useState<number|null>(null);
  const ONBOARD_STEPS=useMemo<OnboardStep[]>(()=>[
    {text:t('onboard0'),target:null},
    {text:t('onboard1'),target:"gps-btn"},
    {text:t('onboard2'),target:null,preview:"to-input"},
    {text:t('onboard3'),target:null,preview:"cat-row"},
    {text:t('onboard4'),target:null,preview:"from-gps-btn"},
    {text:t('onboard5'),target:null},
    {text:t('onboard6'),target:"nav-card",ring:"speed-btn"},
    {text:t('onboard7'),target:null},
  ],[]);
  const[hlRect,setHlRect]=useState<DOMRect|null>(null);
  const[ringRect,setRingRect]=useState<DOMRect|null>(null);
  const[simSpeed,setSimSpeed]=useState(1);
  const simSpeedRef=useRef(1);
  const longPressTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const[stickyNearby,setStickyNearby]=useState<Loc|null>(null);
  const stickyNearbyTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const nearbyLockUntilRef=useRef<number>(0);
  const[autoTrack,setAutoTrack]=useState(true);
  const handleMapDrag=useCallback(()=>setAutoTrack(false),[]);
  // nav/sim başladığında takibi aç
  useEffect(()=>{
    if(mode==='nav'||mode==='sim'){
      setAutoTrack(true);
      if(sheetRef.current)sheetRef.current.style.height="185px";
    }
  },[mode]);
  const[gpsError,setGpsError]=useState<string|null>(null);
  const[showKarpuzIntro,setShowKarpuzIntro]=useState(false);
  const[fromSearch,setFromSearch]=useState("");
  const[toSearch,setToSearch]=useState("");
  const[activeRouteInput,setActiveRouteInput]=useState<'from'|'to'|null>(null);
  const[isMuted,setIsMuted]=useState(false);
  const[listening,setListening]=useState(false);
  const[voiceHint,setVoiceHint]=useState<string|null>(null);
  const voiceHintTextRef=useRef<string>('');
  const[editingTo,setEditingTo]=useState(false);
  const[editToSearch,setEditToSearch]=useState("");
  const[expandedRoomKey,setExpandedRoomKey]=useState<string|null>(null);
  const toggleRoom=(k:string)=>setExpandedRoomKey(p=>p===k?null:k);
  const[targetRoom,setTargetRoom]=useState<string|null>(null);
  const[highlightedRoomKey,setHighlightedRoomKey]=useState<string|null>(null);
  useEffect(()=>{
    if(!targetRoom||!to)return;
    const bRooms=ROOMS[String(to.num)];
    if(!bRooms)return;
    for(const[floor,rooms]of Object.entries(bRooms)){
      const idx=(rooms as RoomEntry[]).findIndex(r => {
        if (r.oda === targetRoom) return true;
        const roomNumbers = r.oda.split(/[-\s,]+/);
        return roomNumbers.includes(targetRoom);
      });
      if(idx>=0){
        const rk=`${to.num}_${floor}_${idx}`;
        setExpandedRoomKey(rk);
        setHighlightedRoomKey(rk);
        const tid=setTimeout(()=>setHighlightedRoomKey(null),2500);
        return()=>clearTimeout(tid);
      }
    }
  },[targetRoom,to]);

  // Onboarding: aktif adımın hedef elemanını bul, highlight rect hesapla
  useEffect(()=>{
    if(onboardStep===null){setHlRect(null);setRingRect(null);return;}
    const step=ONBOARD_STEPS[onboardStep];
    const t=step.target;
    const r=step.ring??t;
    const update=()=>{
      const el=t?document.getElementById(t):null;
      if(el)setHlRect(el.getBoundingClientRect());
      else setHlRect(null);
      const rel=r?document.getElementById(r):null;
      if(rel)setRingRect(rel.getBoundingClientRect());
      else setRingRect(null);
    };
    update();
    window.addEventListener('resize',update);
    return()=>window.removeEventListener('resize',update);
  },[onboardStep,mode]);

  const handleLogoPress=useCallback(()=>{
    longPressTimer.current=setTimeout(()=>{
      localStorage.removeItem("karpuza_onboard");
      setOnboardStep(0);
      longPressTimer.current=null;
    },700);
  },[]);
  const handleLogoRelease=useCallback(()=>{
    if(longPressTimer.current){clearTimeout(longPressTimer.current);longPressTimer.current=null;}
  },[]);

  const advanceOnboard=useCallback(()=>{
    setOnboardStep(s=>{
      if(s===null)return null;
      if(s>=ONBOARD_STEPS.length-1){localStorage.setItem("karpuza_onboard","1");return null;}
      return s+1;
    });
    if(sheetRef.current)sheetRef.current.style.transform="translateY(0px)";
  },[]);

  // fromSearch / toSearch senkronizasyonu
  useEffect(()=>{
    if(fromGPS)setFromSearch(t('yourLocation'));
    else if(from)setFromSearch(locName(from));
    else setFromSearch("");
  },[from,fromGPS]);
  useEffect(()=>{
    if(to)setToSearch(locName(to));
    else setToSearch("");
  },[to]);

  // Splash + init: profil okuma her zaman çalışır; animasyon sadece ilk oturum yükünde
  useEffect(()=>{
    const stored=localStorage.getItem("karpuza_user");
    if(!stored){
      // İlk kez gelen kullanıcı – 3 sn logo göster, sonra karşılama ekranına geç
      if(splash!=="hidden"){
        const t1=setTimeout(()=>setSplash("fading"),3000);
        const t2=setTimeout(()=>{setSplash("hidden");setShowWelcome(true);},3900);
        return()=>{clearTimeout(t1);clearTimeout(t2);};
      }
      setShowWelcome(true);
      return;
    }
    // Dönen kullanıcı
    const p:UserProfile=JSON.parse(stored);
    setUserProfile(p);
    if(SHEET_URL){
      fetch(SHEET_URL,{method:"POST",mode:"no-cors",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({type:"ziyaret",ts:new Date().toLocaleString("tr-TR"),
          name:p.name,role:p.role,token:SHEET_TOKEN})
      }).catch(()=>{});
    }
    if(splash==="hidden")return; // Aynı oturumda yeniden mount → animasyon atla
    sessionStorage.setItem("splash_shown","1");
    const t1=setTimeout(()=>setSplash("fading"),3000);
    const t2=setTimeout(()=>setSplash("hidden"),3900);
    return()=>{clearTimeout(t1);clearTimeout(t2);};
  },[]);

  // ?pins=lat1,lon1|lat2,lon2 (veya eski ?pin=lat,lon) → arkadaşların konumlarını haritada göster
  useEffect(()=>{
    const sp=new URLSearchParams(window.location.search);
    const multi=sp.get("pins");
    const single=sp.get("pin");
    const raw=multi??single;
    if(!raw)return;
    const parsed:([number,number])[]=(multi?raw.split("|"):[raw])
      .map(s=>{const[a,b]=s.split(",");return[parseFloat(a),parseFloat(b)]as[number,number];})
      .filter(([a,b])=>!isNaN(a)&&!isNaN(b));
    if(parsed.length>0)setSharedPins(parsed);
  },[]);

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

  // ── Sesli Arama (STT) ──────────────────────────────────────────────────────
  // STT transkript normalizasyonu
  const normalizeTranscript=(raw:string):string=>{
    let s=raw.toLowerCase().trim();
    // Türkçe sayı kelimeleri → rakam
    const nums:Record<string,string>={bir:'1',iki:'2','üç':'3','dört':'4','beş':'5',
      'altı':'6',yedi:'7',sekiz:'8',dokuz:'9',on:'10'};
    for(const[w,d] of Object.entries(nums)) s=s.replace(new RegExp(`\\b${w}\\b`,'g'),d);
    // Stop-words
    for(const sw of ['git','gidelim','gitmek','istiyorum','istiyom','nerede','nasıl',
      'giderim','bina','binası','binasına','götür','lütfen','acaba','abi','hocam','yol'])
      s=s.replace(new RegExp(`\\b${sw}\\b`,'g'),'');
    // "e 3" → "e3", "l 1" → "l1"
    s=s.replace(/\b([a-züçşğıöeaı])\s+(\d)\b/g,'$1$2');
    // Türkçe yönelme ekleri sondan kırp
    s=s.replace(/(\w{3,}?)(ye|ya|nın|nin|nün|nun|da|de|ta|te)\b/g,'$1');
    return s.replace(/\s+/g,' ').trim();
  };

  const startVoiceSearch=useCallback((target:'from'|'to')=>{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!SR){alert(isEN()?"Voice search not supported in this browser.":"Bu tarayıcı sesli aramayı desteklemiyor.");return;}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec=new SR() as any;
    rec.lang=isEN()?'en-US':'tr-TR';
    rec.continuous=false;
    rec.interimResults=false;
    setListening(true);
    rec.onend=()=>setListening(false);
    rec.onerror=()=>{setListening(false);setVoiceHint(isEN()?"Could not understand, try again.":"Anlaşılamadı, tekrar deneyin.");setTimeout(()=>setVoiceHint(null),2500);};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult=(e:any)=>{
      const transcript:string=normalizeTranscript(e.results[0][0].transcript);
      const scored=LOCS.map(l=>{
        const name=locName(l).toLowerCase();
        const code=l.name.toLowerCase(); // orijinal TR kod (E3, L1 gibi)
        // Tam eşleşme
        if(code===transcript||name===transcript)return{l,s:200};
        // Transkript bina kodunu içeriyor
        if(transcript.includes(code)||code.includes(transcript))return{l,s:150};
        if(transcript.includes(name))return{l,s:100};
        // Keyword eşleşmesi
        const kwHit=l.keywords?.find(k=>transcript.includes(k.toLowerCase())||k.toLowerCase().includes(transcript));
        if(kwHit)return{l,s:90};
        const words=transcript.split(/\s+/).filter((w:string)=>w.length>1);
        const hits=words.filter((w:string)=>name.includes(w)||code.includes(w)||w.includes(code));
        // desc, keywords ve cats içinde de ara
        const desc=(l.desc||'').toLowerCase();
        const kwWords=words.filter((w:string)=>l.keywords?.some(k=>k.toLowerCase().includes(w)));
        const catHits=words.filter((w:string)=>desc.includes(w)).length;
        return{l,s:hits.length*10+catHits*5+kwWords.length*8+(name.startsWith(words[0]??'')?8:0)};
      }).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);
      if(scored.length===0){setVoiceHint(isEN()?"Building not found.":"Bina bulunamadı.");setTimeout(()=>setVoiceHint(null),2500);}
      if(scored.length>0){
        const loc=scored[0].l;
        if(target==='from'){
          setFrom(loc);setFromGPS(false);setFromSearch(locName(loc));setActiveRouteInput(null);setPanelLoc(loc);
          if(to){calcRoute(loc.gps[0],loc.gps[1],to);setMode('ready');}
        } else {
          setToSearch(locName(loc));setTo(loc);setActiveRouteInput('to');setPanelLoc(loc);
          // Başlangıç seçilmemişse from inputuna odaklan
          if(!from&&!fromGPS){
            setTimeout(()=>document.getElementById('search-input')?.focus(),300);
          } else if(from||(fromGPS&&userPos)){
            const fLa=fromGPS&&userPos?userPos[0]:from!.gps[0];
            const fLo=fromGPS&&userPos?userPos[1]:from!.gps[1];
            calcRoute(fLa,fLo,loc);setMode('ready');
          } else if(fromGPS&&!userPos){
            setMode('pickFrom');
          }
        }
      } else {
        if(target==='from'){setFromSearch(transcript);setActiveRouteInput('from');}
        else{setToSearch(transcript);setActiveRouteInput('to');}
      }
    };
    rec.start();
  },[from,fromGPS,to,userPos]); // eslint-disable-line

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
  const[simPaused,setSimPaused]=useState(false);
  const simRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const cumRef=useRef<number[]>([]);
  const simTravRef=useRef(0);
  const announcedRef=useRef<Set<number>>(new Set());

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
      setGpsOn(false);setUserPos(null);setGpsError(null);
    } else {
      if(!navigator.geolocation){setGpsError(t('gpsNotSupported'));return;}
      setGpsOn(true);setGpsError(null);
      watchRef.current=navigator.geolocation.watchPosition(
        p=>{setUserPos([p.coords.latitude,p.coords.longitude]);setGpsError(null);},
        (err)=>{
          setGpsOn(false);
          if(err.code===1)
            setGpsError(t('gpsDenied'));
          else if(err.code===2)
            setGpsError(t('gpsUnavailable'));
          else
            setGpsError(t('gpsTimeout'));
        },
        {enableHighAccuracy:true,maximumAge:5000,timeout:15000}
      );
    }
  },[gpsOn]);
  useEffect(()=>()=>{if(watchRef.current!=null)navigator.geolocation.clearWatch(watchRef.current);},[]);

  // ── Rota hesapla ──
  const calcRoute=useCallback((fLat:number,fLon:number,t:Loc)=>{
    const[tLa,tLo]=t.gps;
    if(!fLat&&!fLon)return; // GPS henüz gelmemişse [0,0] geçersizdir
    if(Math.abs(fLat-tLa)<0.00005&&Math.abs(fLon-tLo)<0.00005)return;
    const pts=gd&&adList?dijk(gd,adList,fLat,fLon,tLa,tLo):[[fLat,fLon],[tLa,tLo]] as[number,number][];
    setRoute(pts);setRouteM(distM(pts));
    const s=steps(pts);setNavSteps(s);setCurStepIdx(0);
    const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+hav(pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1]));
    cumRef.current=cum;
    setMode('ready');
  },[gd,adList]);

  // FROM veya GPS değişince rota yeniden hesapla (arrived/nav/sim'de tekrar hesaplanmasın)
  const prevGpsCalcRef = useRef<[number, number] | null>(null);
  useEffect(()=>{
    if(!to||mode==='arrived'||mode==='nav'||mode==='sim')return;
    
    if(fromGPS&&userPos){
      if(!prevGpsCalcRef.current || hav(prevGpsCalcRef.current[0], prevGpsCalcRef.current[1], userPos[0], userPos[1]) > 3) {
        calcRoute(userPos[0],userPos[1],to);
        prevGpsCalcRef.current = userPos;
      }
    }
    else if(from&&!fromGPS){
       calcRoute(from.gps[0],from.gps[1],to);
       prevGpsCalcRef.current = null;
    }
  },[from,fromGPS,userPos,to,mode,calcRoute]);

  // GPS başlangıç + varış noktasına çok yakınsa → "Zaten buradasınız" (bir kez göster)
  const arrivedAlertedRef=useRef(false);
  useEffect(()=>{
    if(!to||!userPos||!fromGPS)return;
    if(mode==='arrived'||mode==='sim'){arrivedAlertedRef.current=false;return;}
    if(hav(userPos[0],userPos[1],to.gps[0],to.gps[1])<ARRIVE_M&&!arrivedAlertedRef.current){
      arrivedAlertedRef.current=true;
      setVoiceHint(isEN()?"📍 You're already here!":"📍 Zaten buradasınız!");
      setTimeout(()=>setVoiceHint(null),3000);
      setMode('arrived');
    }
  },[userPos,to,fromGPS,mode]); // eslint-disable-line

  // ── Simülasyon ──
  const stopSim=useCallback(()=>{
    if(simRef.current){clearInterval(simRef.current);simRef.current=null;}
    setSimPos(null);setSimPct(0);setSimPaused(false);simTravRef.current=0;
  },[]);

  const runSimInterval=useCallback((cum:number[],r:[number,number][],total:number)=>{
    const TICK=50;
    simRef.current=setInterval(()=>{
      const step=(83/60)*(TICK/1000)*8*simSpeedRef.current;
      simTravRef.current+=step;
      const trav=simTravRef.current;
      if(trav>=total||total<=0){clearInterval(simRef.current!);simRef.current=null;setSimPos(null);setSimPct(100);setMode('arrived');return;}
      setSimPct(Math.round((trav/total)*100));
      for(let i=1;i<cum.length;i++){
        if(cum[i]>=trav){
          const t=(trav-cum[i-1])/(cum[i]-cum[i-1]);
          setSimPos([r[i-1][0]+t*(r[i][0]-r[i-1][0]),r[i-1][1]+t*(r[i][1]-r[i-1][1])]);
          break;
        }
      }
    },TICK);
  },[]);

  const startSim=useCallback(()=>{
    if(!route||route.length<2)return;
    // GPS konumu varış noktasına yakınsa "Zaten buradasınız"
    if(fromGPS&&userPos&&to&&hav(userPos[0],userPos[1],to.gps[0],to.gps[1])<ARRIVE_M){
      setVoiceHint(isEN()?"📍 You're already here!":"📍 Zaten buradasınız!");
      setTimeout(()=>setVoiceHint(null),3000);
      setMode('arrived');return;
    }
    // Manuel seçimde aynı bina
    if(!fromGPS&&from&&to&&from.num===to.num){
      setVoiceHint(isEN()?"⚠️ Start and destination are the same!":"⚠️ Başlangıç ve varış noktası aynı olamaz!");
      setTimeout(()=>setVoiceHint(null),3000);return;
    }
    stopSim();
    announcedRef.current.clear();
    const cum=cumRef.current,r=route as [number,number][],total=cum[cum.length-1]??0;
    if(total<=0){setMode('arrived');return;}
    setSimSpeed(1);simSpeedRef.current=1;
    setSimPos(r[0]);setSimPct(0);setSimPaused(false);simTravRef.current=0;setMode('sim');
    runSimInterval(cum,r,total);
  },[route,stopSim,runSimInterval,from,fromGPS,userPos,to]);// eslint-disable-line

  const pauseSim=useCallback(()=>{
    if(simRef.current){clearInterval(simRef.current);simRef.current=null;}
    setSimPaused(true);
  },[]);

  const resumeSim=useCallback(()=>{
    if(!route||route.length<2)return;
    const cum=cumRef.current,r=route as [number,number][],total=cum[cum.length-1]??0;
    setSimPaused(false);
    runSimInterval(cum,r,total);
  },[route,runSimInterval]);
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
  const submitWelcome=useCallback(()=>{
    if(!wRole||!wName.trim()||!wKvkk)return;
    const profile:UserProfile={
      name:wName.trim(), role:wRole,
      faculty:  wRole==="Öğretmen"&&wExtra.trim() ? wExtra.trim() : undefined,
      position: wRole==="Personel"&&wExtra.trim() ? wExtra.trim() : undefined,
      ts:Date.now()
    };
    localStorage.setItem("karpuza_user",JSON.stringify(profile));
    setUserProfile(profile); setShowWelcome(false);
    setShowTour(true);
    setTourStep(0);
    
    // Onboarding intro kapandıktan sonra başlar (dismissKarpuzIntro içinde)
    if(SHEET_URL){
      fetch(SHEET_URL,{method:"POST",mode:"no-cors",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({type:"kayıt",ts:new Date(profile.ts).toLocaleString("tr-TR"),
          name:profile.name,role:profile.role,
          extra:wExtra.trim()||"-",token:SHEET_TOKEN})
      }).catch(()=>{});
    }
  },[wRole,wName,wExtra,wKvkk]);

  const handlePinClick=useCallback((loc:Loc)=>{
    if(mode==='pickFrom'){setPanelLoc(loc);setFrom(loc);setFromGPS(false);setMode('pickTo');return;}
    if(mode==='pickTo'){
      setPanelLoc(loc);setTo(loc);
      if(from||(fromGPS&&userPos)){
        const fLa=fromGPS&&userPos?userPos[0]:from!.gps[0];
        const fLo=fromGPS&&userPos?userPos[1]:from!.gps[1];
        calcRoute(fLa,fLo,loc);
      }
      return;
    }
    // Diğer tüm modlarda (idle, ready, sim, nav, arrived) bina modalı aç
    setSelectedLoc(loc);
  },[mode,from,fromGPS,userPos,calcRoute]);

  const dismissKarpuzIntro=useCallback(()=>{
    setShowKarpuzIntro(false);
    if(!localStorage.getItem("karpuza_onboard"))setOnboardStep(0);
  },[]);

  const reset=useCallback(()=>{
    stopSim();setFrom(null);setFromGPS(false);setTo(null);setRoute(null);setRouteM(0);
    setNavSteps([]);setShowSteps(false);setMode('idle');setCurStepIdx(0);setSimPct(0);
    setPanelLoc(null);announcedRef.current.clear();setTargetRoom(null);setExpandedRoomKey(null);
    if(sheetRef.current)sheetRef.current.style.height="185px";
  },[stopSim]);

  const swapFromTo=useCallback(()=>{
    const newFrom=to;
    const newTo=fromGPS?null:from;
    setFrom(newFrom??null);setFromGPS(false);setFromSearch(newFrom?locName(newFrom):"");
    setTo(newTo??null);setToSearch(newTo?locName(newTo):"");
    if(newFrom&&newTo){calcRoute(newFrom.gps[0],newFrom.gps[1],newTo);setMode('ready');}
    else if(newFrom){setMode('pickTo');}
  },[from,to,fromGPS,calcRoute]);

  // sheetDismiss her render'da güncellenir — stale closure olmadan reset/showSteps kullanır
  sheetDismiss.current=()=>{setShowSteps(false);};

  // ── Bottom sheet non-passive drag listener ──
  useEffect(()=>{
    const handle=handleRef.current;
    const sheet=sheetRef.current;
    if(!handle||!sheet)return;
    const onStart=(e:TouchEvent)=>{
      sheet.style.transition="none";
      dragY.current=e.touches[0].clientY;
      dragStartH.current=sheet.getBoundingClientRect().height;
    };
    const onMove=(e:TouchEvent)=>{
      e.preventDefault();
      const dy=e.touches[0].clientY-dragY.current;
      const maxH=window.innerHeight*0.72;
      sheet.style.height=`${Math.max(52,Math.min(maxH,dragStartH.current-dy))}px`;
    };
    const onEnd=(e:TouchEvent)=>{
      const PEEK=52,MID=185,maxH=window.innerHeight*0.72;
      const curH=sheet.getBoundingClientRect().height;
      const dy=e.changedTouches[0].clientY-dragY.current;
      sheet.style.transition="height 0.25s cubic-bezier(0.32,0.72,0,1)";
      if((dragStartH.current<=PEEK+10&&dy>40)||(curH<PEEK+35&&dy>20)){
        sheet.style.height=`${PEEK}px`;
        sheetDismiss.current();
        setTimeout(()=>mapInstanceRef.current?.invalidateSize({animate:false}),260);
        return;
      }
      const snap=[PEEK,MID,maxH].reduce((a,b)=>Math.abs(b-curH)<Math.abs(a-curH)?b:a);
      sheet.style.height=`${snap}px`;
      setTimeout(()=>mapInstanceRef.current?.invalidateSize({animate:false}),260);
    };
    const onMouseStart=(e:MouseEvent)=>{
      sheet.style.transition="none";
      dragY.current=e.clientY;
      dragStartH.current=sheet.getBoundingClientRect().height;
      const onMouseMove=(e:MouseEvent)=>{
        const dy=e.clientY-dragY.current;
        const maxH=window.innerHeight*0.72;
        sheet.style.height=`${Math.max(52,Math.min(maxH,dragStartH.current-dy))}px`;
      };
      const onMouseUp=(e:MouseEvent)=>{
        window.removeEventListener('mousemove',onMouseMove);
        window.removeEventListener('mouseup',onMouseUp);
        const PEEK=52,MID=185,maxH=window.innerHeight*0.72;
        const curH=sheet.getBoundingClientRect().height;
        const dy=e.clientY-dragY.current;
        sheet.style.transition="height 0.25s cubic-bezier(0.32,0.72,0,1)";
        if((dragStartH.current<=PEEK+10&&dy>40)||(curH<PEEK+35&&dy>20)){
          sheet.style.height=`${PEEK}px`;sheetDismiss.current();return;
        }
        const snap=[PEEK,MID,maxH].reduce((a,b)=>Math.abs(b-curH)<Math.abs(a-curH)?b:a);
        sheet.style.height=`${snap}px`;
      };
      window.addEventListener('mousemove',onMouseMove);
      window.addEventListener('mouseup',onMouseUp);
    };
    handle.addEventListener('touchstart',onStart,{passive:true});
    handle.addEventListener('touchmove',onMove,{passive:false});
    handle.addEventListener('touchend',onEnd,{passive:true});
    handle.addEventListener('mousedown',onMouseStart);
    return()=>{
      handle.removeEventListener('touchstart',onStart);
      handle.removeEventListener('touchmove',onMove);
      handle.removeEventListener('touchend',onEnd);
      handle.removeEventListener('mousedown',onMouseStart);
    };
  },[]);

  // Input focus veya panelLoc seçilince panel aç
  useEffect(()=>{
    if(!sheetRef.current)return;
    if(panelLoc){
      // Bina seçimi: 72vh aç (klavye kapalı)
      sheetRef.current.style.transition="height 0.25s cubic-bezier(0.32,0.72,0,1)";
      sheetRef.current.style.height=`${Math.round(window.innerHeight*0.72)}px`;
    } else if(activeRouteInput){
      sheetRef.current.style.transition="height 0.25s cubic-bezier(0.32,0.72,0,1)";
      sheetRef.current.style.height="310px";
      sheetRef.current.scrollTop=0;
    }
  },[activeRouteInput,panelLoc]);

  // iOS Safari: klavye açılınca paneli klavye üstüne kilitle
  useEffect(()=>{
    const vv=window.visualViewport;
    if(!vv)return;
    const onVVChange=()=>{
      if(!sheetRef.current)return;
      const kbH=Math.max(0,window.innerHeight-vv.offsetTop-vv.height);
      sheetRef.current.style.bottom = kbH >= 50 ? `${kbH}px` : '0px';
    };
    vv.addEventListener('resize',onVVChange);
    vv.addEventListener('scroll',onVVChange);
    return()=>{vv.removeEventListener('resize',onVVChange);vv.removeEventListener('scroll',onVVChange);};
  },[]);

  // Sim başlayınca panel default'a dönsün; arrived modunda içeriğe göre büyüsün
  useEffect(()=>{
    if(!sheetRef.current)return;
    if(mode==='sim'){
      sheetRef.current.style.transition="height 0.4s cubic-bezier(0.32,0.72,0,1)";
      sheetRef.current.style.height="185px";
    } else if(mode==='arrived'){
      sheetRef.current.style.transition="height 0.35s cubic-bezier(0.32,0.72,0,1)";
      sheetRef.current.style.height="280px";
    }
  },[mode]);

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

  const visible=useMemo(()=>LOCS.filter(l=>{
    if(cat&&!l.cats.includes(cat))return false;
    if(!search)return true;
    const lq=search.toLocaleLowerCase();
    return locName(l).toLocaleLowerCase().includes(lq)||
      l.name.toLocaleLowerCase().includes(lq)||
      l.keywords?.some(k=>k.toLocaleLowerCase().includes(lq)||lq.includes(k.toLocaleLowerCase()));
  }),[search,cat]);
  const mapVisible=useMemo(()=>visible.filter(l=>!l.hidden),[visible]);

  const mins=Math.max(1,Math.round(routeM/83));
  const remM=Math.max(0,Math.round(routeM*(1-simPct/100)));
  const remMins=Math.max(1,Math.round(remM/83));
  const activeStep=navSteps[curStepIdx];
  const nextStep=navSteps[curStepIdx+1]??null;

  // TTS navigasyon sesi kaldırıldı – ileride ses seçeneği eklenebilir

  // Yakın binalara görsel bildirim (sim + nav)
  useEffect(()=>{
    const pos=mode==='sim'?simPos:mode==='nav'?userPos:null;
    if(!pos)return;
    const nearby=LOCS.filter(l=>{
      if(announcedRef.current.has(l.num))return false;
      const dlat=l.gps[0]-pos[0],dlon=l.gps[1]-pos[1];
      return Math.sqrt(dlat*dlat+dlon*dlon)<0.00035;
    });
    if(!nearby.length)return;
    const loc=nearby[0];
    announcedRef.current.add(loc.num);
    setVoiceHint(isEN()?`📍 Passing by: ${locName(loc)}`:`📍 Yakında: ${locName(loc)}`);
    setTimeout(()=>setVoiceHint(null),3500);
  },[simPos,userPos,mode]); // eslint-disable-line

  // 1 dakika uyarısı (nav)
  const alerted1minRef=useRef(false);
  useEffect(()=>{if(route)alerted1minRef.current=false;},[route]);
  useEffect(()=>{
    if(mode==='nav'&&remMins<=1&&remM>15&&!alerted1minRef.current){
      alerted1minRef.current=true;
      setVoiceHint(isEN()?"🏁 Almost there!":"🏁 Az kaldı, varış noktasına yaklaşıyorsunuz!");
      setTimeout(()=>setVoiceHint(null),4000);
    }
  },[remMins,mode,remM]); // eslint-disable-line

  // Sekme geri döndüğünde harita tile'larını yenile
  useEffect(()=>{
    const onVisible=()=>{
      if(document.visibilityState==='visible')
        setTimeout(()=>mapInstanceRef.current?.invalidateSize({animate:false}),150);
    };
    document.addEventListener('visibilitychange',onVisible);
    return()=>document.removeEventListener('visibilitychange',onVisible);
  },[]);

  // Geçilen / kalan rota segmentleri
  const passedRoute=useMemo(()=>{
    if(!route||simPct===0)return[] as[number,number][];
    const cum=cumRef.current,total=cum[cum.length-1]??1,trav=total*simPct/100;
    let idx=0;for(let i=1;i<cum.length;i++){if(cum[i]>=trav){idx=i;break;}}
    return route.slice(0,idx+1) as[number,number][];
  },[route,simPct]);

  // Zoom animasyonu sırasında noktalar gizlenir, zoomend sonrası doğru yerde belirir
  const HideOnZoom=useMemo(()=>(L.Canvas as any).extend({
    _onZoom(this:any){(L.Canvas as any).prototype._onZoom.call(this);this._container.style.visibility='hidden';},
    _update(this:any){(L.Canvas as any).prototype._update.call(this);this._container.style.visibility='';}
  }),[]);
  const staticCanvas=useMemo(()=>new HideOnZoom({padding:0.5}),[HideOnZoom]);
  const dynCanvas=useMemo(()=>new HideOnZoom({padding:0.5}),[HideOnZoom]);

  // Simülasyonda yakındaki bina
  const nearbyBldg=useMemo(()=>{
    if(!simPos||mode!=='sim')return null;
    let best:Loc|null=null,bd=Infinity;
    for(const loc of LOCS){
      const d=hav(simPos[0],simPos[1],loc.gps[0],loc.gps[1]);
      if(d<65&&d<bd){bd=d;best=loc;}
    }
    return best;
  },[simPos,mode]);

  useEffect(()=>{
    if(nearbyBldg){
      if(stickyNearbyTimer.current)clearTimeout(stickyNearbyTimer.current);
      setStickyNearby(prev=>{
        const now=Date.now();
        // Farklı bina && kilit süresi dolmadıysa geçiş yapma
        if(prev&&prev.num!==nearbyBldg.num&&now<nearbyLockUntilRef.current)return prev;
        nearbyLockUntilRef.current=now+3000;
        return nearbyBldg;
      });
    } else {
      stickyNearbyTimer.current=setTimeout(()=>{
        setStickyNearby(null);
        nearbyLockUntilRef.current=0;
      },5000);
    }
    return()=>{if(stickyNearbyTimer.current)clearTimeout(stickyNearbyTimer.current);};
  },[nearbyBldg]);

  const BTN:React.CSSProperties={border:"none",borderRadius:10,cursor:"pointer",
    display:"flex",alignItems:"center",justifyContent:"center",gap:6,
    fontFamily:"inherit",fontWeight:700,touchAction:"manipulation",minHeight:44};

  return(
    <div style={{position:"relative",height:"100dvh",width:"100vw",maxWidth:"100vw",maxHeight:"100dvh",overflow:"hidden",
      fontFamily:"'Segoe UI',system-ui,sans-serif",userSelect:"none"}}>


      {/* Haritayı giriş ekranı gelene kadar gizle */}
      {splash!=="hidden"&&!showWelcome&&(
        <div style={{position:"fixed",inset:0,zIndex:9998,background:"#0f172a",pointerEvents:"none"}}/>
      )}

      {/* ─── Splash ekranı ─────────────────────────────────────────────── */}
      {splash!=="hidden"&&(
        <div style={{position:"fixed",inset:0,zIndex:9999,
          background:"#0c1828",
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          opacity:splash==="fading"?0:1,
          transition:"opacity 0.75s ease",
          pointerEvents:splash==="fading"?"none":"auto"}}>
          <img src={isEN()?"/karpuza-sor-en.png":"/karpuza-sor.png"} alt="Karpuz'a Sor"
            style={{height:"50vh",width:"auto",maxWidth:"82vw",
              objectFit:"contain",borderRadius:24,
              boxShadow:"0 12px 48px rgba(0,0,0,0.7)"}}/>
          <div style={{marginTop:28,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <img src={isDarkTheme ? "/bilgi-logotype.png" : "/bilgi-logo-day.png"} alt="BİLGİ" style={{height:26,objectFit:"contain"}} />
            <div style={{color:"rgba(255,255,255,0.50)",fontSize:12,letterSpacing:.6}}>
              {t('campusName')}
            </div>
            <div style={{marginTop:12,display:"flex",alignItems:"center",gap:10}}>
              <div style={{height:1,width:28,background:"linear-gradient(to right,transparent,rgba(212,175,55,0.5))"}}/>
              <div style={{
                color:"rgba(212,175,55,0.85)",fontSize:11,letterSpacing:6,fontWeight:600,
                textShadow:"0 0 12px rgba(212,175,55,0.6),0 0 24px rgba(212,175,55,0.3)"}}>
                ETM
              </div>
              <div style={{height:1,width:28,background:"linear-gradient(to left,transparent,rgba(212,175,55,0.5))"}}/>
            </div>
          </div>
        </div>
      )}

      {/* ─── Kayıt ekranı – Responsive 2-Sütun Masaüstü & Mobil Bento Tasarımı ────────── */}
      {showWelcome&&(
        <div style={{position:"fixed",inset:0,zIndex:9998,
          background:isDarkTheme?"#0f172a":"#f8fafc",
          overflowY:"auto",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"space-between",
          padding:"24px 32px",transition:"background 0.25s ease"}}>

          <style>{`
            .bento-card {
              display: flex;
              flex-direction: row;
              width: 100%;
              max-width: 860px;
              border-radius: 28px;
              overflow: hidden;
              margin: 20px 0;
            }
            .bento-left {
              width: 44%;
              padding: 44px 36px;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              text-align: center;
            }
            .bento-right {
              width: 56%;
              padding: 40px 38px;
              display: flex;
              flex-direction: column;
              justify-content: center;
            }
            .bento-header {
              width: 100%;
              max-width: 1100px;
            }
            @media (max-width: 768px) {
              .bento-card {
                flex-direction: column;
                max-width: 420px;
                border-radius: 22px;
                margin: 10px 0;
              }
              .bento-left {
                width: 100%;
                padding: 24px 20px 12px;
              }
              .bento-right {
                width: 100%;
                padding: 12px 20px 24px;
              }
            }
          `}</style>

          {/* Üst Bar: Geniş ekranda iki yana yayılan ferah kurumsal başlık */}
          <header className="bento-header" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",marginBottom:"auto"}}>
            <img src={isDarkTheme ? "/bilgi-logotype.png" : "/bilgi-logo-day.png"} alt="BİLGİ" style={{height:32,objectFit:"contain"}} />
            
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {/* Gece / Gündüz Toggle */}
              <button onClick={()=>setIsDarkTheme(!isDarkTheme)}
                style={{background:isDarkTheme?"rgba(255,255,255,0.06)":"#ffffff",border:`1px solid ${isDarkTheme?"rgba(255,255,255,0.12)":"#cbd5e1"}`,borderRadius:20,padding:"6px 12px",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",boxShadow:isDarkTheme?"none":"0 2px 6px rgba(0,0,0,0.05)"}}>
                {isDarkTheme ? "🌙" : "☀️"}
              </button>

              {/* TR / EN Dil Seçici */}
              <div style={{display:"flex",gap:2,background:isDarkTheme?"rgba(255,255,255,0.06)":"#ffffff",borderRadius:20,padding:"4px 5px",border:`1px solid ${isDarkTheme?"rgba(255,255,255,0.12)":"#cbd5e1"}`,boxShadow:isDarkTheme?"none":"0 2px 6px rgba(0,0,0,0.05)"}}>
                {(["TR","EN"] as const).map(l=>(
                  <button key={l} onClick={()=>setLang(l.toLowerCase() as "tr"|"en")}
                    style={{padding:"4px 12px",borderRadius:16,border:"none",fontSize:11.5,fontWeight:800,letterSpacing:.5,
                      background:isEN()===(l==="EN")?(isDarkTheme?"#ffffff":"#0284c7"):"transparent",
                      color:isEN()===(l==="EN")?(isDarkTheme?"#0f172a":"#ffffff"):(isDarkTheme?"#94a3b8":"#64748b"),cursor:"pointer",transition:"all 0.2s"}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </header>

          {/* Orta Alan: Modern Geniş 2-Sütunlu Bento Kart */}
          <main className="bento-card" style={{
            background:isDarkTheme?"rgba(30, 41, 59, 0.7)":"#ffffff",
            backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",
            border:isDarkTheme?"1px solid rgba(255,255,255,0.1)":"1px solid #e2e8f0",
            boxShadow:isDarkTheme?"0 25px 60px -15px rgba(0,0,0,0.65)":"0 20px 45px -15px rgba(0,0,0,0.08)"}}>
            
            {/* SOL SÜTUN: Marka, Maskot & Karşılama */}
            <div className="bento-left" style={{
              background:isDarkTheme?"rgba(255,255,255,0.02)":"#f8fafc",
              borderRight:isDarkTheme?"1px solid rgba(255,255,255,0.06)":"1px solid #e2e8f0"}}>
              
              <div style={{width:116,height:116,borderRadius:28,overflow:"hidden",marginBottom:20,
                boxShadow:isDarkTheme?"0 16px 36px rgba(0,0,0,0.5)":"0 14px 30px rgba(0,0,0,0.1)",
                border:isDarkTheme?"1px solid rgba(255,255,255,0.12)":"1px solid rgba(0,0,0,0.06)"}}>
                <img src={isEN() ? "/karpuza-sor-en.png" : "/karpuza-sor.png"} alt="Karpuza Sor" style={{width:"100%",height:"100%",objectFit:"cover"}} />
              </div>

              <div style={{display:"inline-block",padding:"4px 12px",borderRadius:20,background:isDarkTheme?"rgba(56,189,248,0.12)":"#e0f2fe",color:isDarkTheme?"#38bdf8":"#0284c7",fontSize:11,fontWeight:800,letterSpacing:.8,marginBottom:12}}>
                SANTRALİSTANBUL
              </div>

              <h1 style={{color:isDarkTheme?"#ffffff":"#0f172a",fontWeight:800,fontSize:23,margin:"0 0 8px 0",letterSpacing:-0.4,lineHeight:1.3}}>
                {isEN() ? "Welcome to Karpuza Sor" : "Karpuza Sor'a Hoş Geldin"}
              </h1>
              <p style={{color:isDarkTheme?"#94a3b8":"#64748b",fontSize:13.5,margin:0,lineHeight:1.55}}>
                {isEN() ? "Your smart campus guide. Find classrooms, cafes, and buildings effortlessly." : "Santral Kampüsü'nde derslikleri, kafeleri ve binaları tek dokunuşla bul."}
              </p>
            </div>

            {/* SAĞ SÜTUN: Form Elemanları */}
            <div className="bento-right">
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                
                {/* Rol Başlığı ve Butonlar */}
                <div>
                  <div style={{fontSize:11.5,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",color:isDarkTheme?"#94a3b8":"#64748b",marginBottom:8}}>
                    {isEN() ? "Select Your Role" : "Rolünü Seç"}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:8}}>
                    {(["Öğrenci","Öğretmen","Personel","Misafir"] as UserRole[]).map(r=>{
                      const active = wRole === r;
                      const label = r==="Öğrenci"?(isEN()?"Student":"Öğrenci"):
                                    r==="Öğretmen"?(isEN()?"Faculty":"Öğretim"):
                                    r==="Personel"?(isEN()?"Staff":"Personel"):
                                    (isEN()?"Guest":"Misafir");
                      return(
                        <button key={r} onClick={()=>{setWRole(r);setWExtra("");}}
                          style={{padding:"12px 4px",borderRadius:14,
                            border:active?`2px solid ${isDarkTheme?"#38bdf8":"#0284c7"}`:`1px solid ${isDarkTheme?"rgba(255,255,255,0.1)":"#cbd5e1"}`,
                            background:active?(isDarkTheme?"rgba(56,189,248,0.18)":"#e0f2fe"):(isDarkTheme?"rgba(255,255,255,0.03)":"#ffffff"),
                            color:active?(isDarkTheme?"#38bdf8":"#0284c7"):(isDarkTheme?"#cbd5e1":"#475569"),
                            fontSize:12.5,fontWeight:active?800:600,cursor:"pointer",transition:"all 0.15s ease",textAlign:"center"}}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* İsim Girişi */}
                <div>
                  <div style={{fontSize:11.5,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",color:isDarkTheme?"#94a3b8":"#64748b",marginBottom:6}}>
                    {isEN() ? "Full Name" : "Ad Soyad"}
                  </div>
                  <input value={wName} onChange={e=>setWName(e.target.value)} placeholder={isEN()?"e.g. John Doe":"Örn. Deniz Yılmaz"}
                    style={{width:"100%",padding:"14px 16px",borderRadius:14,
                      background:isDarkTheme?"rgba(255,255,255,0.05)":"#f8fafc",
                      border:`1px solid ${isDarkTheme?"rgba(255,255,255,0.14)":"#cbd5e1"}`,
                      color:isDarkTheme?"#ffffff":"#0f172a",fontSize:14.5,fontWeight:500,outline:"none",boxSizing:"border-box"}}/>
                </div>

                {wRole==="Öğretmen"&&(
                  <div>
                    <div style={{fontSize:11.5,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",color:isDarkTheme?"#94a3b8":"#64748b",marginBottom:6}}>
                      {isEN() ? "Department" : "Bölüm"}
                    </div>
                    <input value={wExtra} onChange={e=>setWExtra(e.target.value)} placeholder={isEN()?"Department / Faculty (Optional)":"Bölümünüz / Göreviniz (İsteğe bağlı)"}
                      style={{width:"100%",padding:"14px 16px",borderRadius:14,
                        background:isDarkTheme?"rgba(255,255,255,0.05)":"#f8fafc",
                        border:`1px solid ${isDarkTheme?"rgba(255,255,255,0.14)":"#cbd5e1"}`,
                        color:isDarkTheme?"#ffffff":"#0f172a",fontSize:14.5,fontWeight:500,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                )}

                {/* KVKK Metni */}
                <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",padding:"2px 2px"}}>
                  <input type="checkbox" checked={wKvkk} onChange={e=>setWKvkk(e.target.checked)}
                    style={{marginTop:3,width:16,height:16,accentColor:isDarkTheme?"#38bdf8":"#0284c7",cursor:"pointer"}}/>
                  <span style={{color:isDarkTheme?"#94a3b8":"#64748b",fontSize:11.5,lineHeight:1.5}}>
                    {isEN() ? "I consent to anonymous usage analytics under " : "Kullanım istatistiklerinin toplanmasına "}
                    <strong onClick={e=>{e.preventDefault();setKvkkModal(true);}} style={{color:isDarkTheme?"#38bdf8":"#0284c7",textDecoration:"underline",cursor:"pointer"}}>
                      {isEN() ? "KVKK" : "KVKK"}
                    </strong>
                    {isEN() ? " terms." : " kapsamında onay veriyorum."}
                  </span>
                </label>

                {/* KVKK Modal */}
                {kvkkModal&&(
                  <div onClick={()=>setKvkkModal(false)} style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
                    <div onClick={e=>e.stopPropagation()} style={{background:isDarkTheme?"#1e293b":"#ffffff",borderRadius:"24px",padding:"26px",maxWidth:460,width:"90%",border:`1px solid ${isDarkTheme?"rgba(255,255,255,0.1)":"#e2e8f0"}`,boxShadow:"0 20px 40px rgba(0,0,0,0.3)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                        <div style={{color:isDarkTheme?"#ffffff":"#0f172a",fontWeight:800,fontSize:16}}>KVKK Aydınlatma Metni</div>
                        <button onClick={()=>setKvkkModal(false)} style={{background:isDarkTheme?"rgba(255,255,255,0.08)":"#f1f5f9",border:"none",color:isDarkTheme?"#94a3b8":"#64748b",width:28,height:28,borderRadius:"50%",cursor:"pointer",fontSize:14}}>✕</button>
                      </div>
                      <p style={{color:isDarkTheme?"#cbd5e1":"#334155",fontSize:12.5,lineHeight:1.7,margin:0}}>
                        {isEN() ? "Istanbul Bilgi University collects your name and role information solely to measure anonymous usage statistics of the Karpuza Sor campus navigation application. Your data is not shared with third parties." : "İstanbul Bilgi Üniversitesi, Karpuza Sor kampüs navigasyon uygulamasının anonim kullanım istatistiklerini ölçmek amacıyla adınızı ve rolünüzü toplamaktadır. Verileriniz üçüncü taraflarla paylaşılmaz."}
                      </p>
                    </div>
                  </div>
                )}

                {/* Aksiyon Butonu */}
                {(()=>{
                  const ok=!!(wName.trim()&&wRole&&wKvkk);
                  return(
                    <button onClick={submitWelcome} disabled={!ok}
                      style={{padding:"15px",borderRadius:14,border:"none",marginTop:4,width:"100%",
                        background:ok?(isDarkTheme?"#38bdf8":"#0284c7"):(isDarkTheme?"rgba(255,255,255,0.06)":"#e2e8f0"),
                        color:ok?(isDarkTheme?"#0f172a":"#ffffff"):(isDarkTheme?"#64748b":"#94a3b8"),fontSize:15,fontWeight:800,
                        cursor:ok?"pointer":"default",transition:"all 0.2s ease",boxShadow:ok?"0 8px 20px rgba(2,132,199,0.3)":"none"}}>
                      {isEN() ? "Start Exploring →" : "Haritaya Başla →"}
                    </button>
                  );
                })()}

              </div>
            </div>
          </main>

          {/* Alt Footer: Geniş ekranda ortalı ve dengeli */}
          <footer className="bento-header" style={{display:"flex",justifyContent:"center",gap:24,alignItems:"center",marginTop:"auto",paddingTop:12}}>
            <a href="https://www.instagram.com/bilgiedtech" target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:7,textDecoration:"none"}}>
              <img src="/instagram-logo.png" alt="Instagram" style={{width:14,opacity:0.6}}/>
              <span style={{color:isDarkTheme?"#94a3b8":"#64748b",fontSize:12,fontWeight:600}}>@bilgiedtech</span>
            </a>
            <a href="https://www.youtube.com/@bilgiUZEM" target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:7,textDecoration:"none"}}>
              <img src="/youtube-logo.png" alt="YouTube" style={{width:14,opacity:0.6}}/>
              <span style={{color:isDarkTheme?"#94a3b8":"#64748b",fontSize:12,fontWeight:600}}>@bilgiUZEM</span>
            </a>
          </footer>
        </div>
      )}

      
      {/* ─── Modern 5-Adımlı İnteraktif Rehber Kartı (Geri Butonlu & Karpuz Maskotlu) ─── */}
      {!showWelcome && showTour && (
        <div style={{
          position: "fixed",
          bottom: 28,
          left: "50%",
          transform: "translateX(-50%)",
          width: "calc(100% - 32px)",
          maxWidth: 440,
          background: isDarkTheme ? "#1e293b" : "#ffffff",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: 22,
          padding: "16px 18px 14px",
          boxShadow: "0 18px 45px rgba(0, 0, 0, 0.22)",
          border: isDarkTheme ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.08)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          animation: "fadeInUp 0.25s ease-out"
        }}>
          {/* Üst Kısım: Karpuz Maskot Avatarı ve Yönerge Metni */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              overflow: "hidden",
              flexShrink: 0,
              background: isDarkTheme ? "rgba(255,255,255,0.06)" : "#f1f5f9",
              border: "2px solid #c8102e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 10px rgba(200, 16, 46, 0.2)"
            }}>
              <img 
                src="/karpuz-mascot.png" 
                alt="Karpuz" 
                onError={(e)=>{ (e.target as any).src = isEN() ? "/karpuza-sor-en.png" : "/karpuza-sor.png"; }}
                style={{ width: "92%", height: "92%", objectFit: "contain" }}
              />
            </div>

            <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.45, fontWeight: 600, color: isDarkTheme ? "#f8fafc" : "#1e293b" }}>
              {tourStep === 0 && (isEN() ? "Ready? Let's explore the campus together." : "Hazır mısın? Kampüsü birlikte keşfedelim.")}
              {tourStep === 1 && (isEN() ? "Type here to search buildings, rooms or units. I also understand room codes like 'E1 203'." : "Bina, oda ya da birim aramak için buraya yaz, 'E1 203' gibi oda numaralarını da anlıyorum.")}
              {tourStep === 2 && (isEN() ? "Filter by categories: Educational, Social, Administrative..." : "Kategorilere göre filtrele: Eğitsel, Sosyal, İdari...")}
              {tourStep === 3 && (isEN() ? "Enable your location so I can show nearby places and guide you live." : "Konumunu aç; sana en yakın yerleri göstereyim ve seni canlı yönlendireyim.")}
              {tourStep === 4 && (isEN() ? "Tap any spot on the map, open its card, and select 'Go here'. Leave the rest to me." : "Haritadaki bir noktaya dokun, kartını aç ve 'Buraya git' de. Gerisini bana bırak.")}
            </div>
          </div>

          {/* Alt Kısım: Turu Atla - Noktalı İlerleme - Geri ve İleri/Başla Butonları */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
            {/* Turu Atla */}
            <button 
              onClick={() => setShowTour(false)}
              style={{
                background: "none",
                border: "none",
                color: isDarkTheme ? "#94a3b8" : "#64748b",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                padding: "6px 4px"
              }}>
              {isEN() ? "Skip tour" : "Turu atla"}
            </button>

            {/* İlerleme Noktaları */}
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {[0, 1, 2, 3, 4].map(idx => (
                <div 
                  key={idx}
                  style={{
                    width: tourStep === idx ? 16 : 6,
                    height: 6,
                    borderRadius: 3,
                    background: tourStep === idx ? "#c8102e" : (isDarkTheme ? "rgba(255,255,255,0.2)" : "#cbd5e1"),
                    transition: "all 0.2s ease"
                  }}
                />
              ))}
            </div>

            {/* Navigasyon Butonları: Geri & İleri/Başla */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {tourStep > 0 && (
                <button
                  onClick={() => setTourStep(tourStep - 1)}
                  style={{
                    background: isDarkTheme ? "rgba(255,255,255,0.08)" : "#f1f5f9",
                    border: `1px solid ${isDarkTheme ? "rgba(255,255,255,0.12)" : "#cbd5e1"}`,
                    color: isDarkTheme ? "#e2e8f0" : "#475569",
                    borderRadius: 18,
                    padding: "6px 12px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s"
                  }}>
                  ← {isEN() ? "Back" : "Geri"}
                </button>
              )}

              <button
                onClick={() => {
                  if (tourStep < 4) {
                    setTourStep(tourStep + 1);
                  } else {
                    setShowTour(false);
                  }
                }}
                style={{
                  background: "#c8102e",
                  border: "none",
                  color: "#ffffff",
                  borderRadius: 18,
                  padding: "6px 16px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(200, 16, 46, 0.3)",
                  transition: "all 0.15s"
                }}>
                {tourStep === 4 ? (isEN() ? "Start" : "Başla") : (isEN() ? "Next →" : "İleri →")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Harita ─────────────────────────────────────────────────────── */}
      <div style={{position:"absolute",inset:0,zIndex:1}}>
        <MapContainer center={CAMPUS_CENTER} zoom={17}
          style={{height:"100%",width:"100%"}} minZoom={13} maxZoom={19}
          zoomControl={false} zoomSnap={0.1}
          fadeAnimation={false} markerZoomAnimation={false} zoomAnimation={false}
          {...({rotate:true,touchRotate:true} as object)}>
          <DisableCompassAutoRotate/>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap" maxZoom={19} keepBuffer={6}/>
          {route&&<>
            {/* Kalan yol: gölge + mavi nokta – staticCanvas'ta, sadece route değişince yeniden çizilir */}
            <Polyline renderer={staticCanvas} positions={route} interactive={false} smoothFactor={0} pathOptions={{color:"#1d4ed8",weight:14,opacity:0.15,lineCap:"round",lineJoin:"round",dashArray:"1 16"}}/>
            <Polyline renderer={staticCanvas} positions={route} interactive={false} smoothFactor={0} pathOptions={{color:"#3b82f6",weight:8,opacity:0.95,lineCap:"round",lineJoin:"round",dashArray:"1 16"}}/>
            {/* Geçilen yol – dynCanvas'ta, simPct değişince sadece bu canvas yeniden çizilir */}
            {passedRoute.length>1&&<Polyline renderer={dynCanvas} positions={passedRoute} interactive={false} smoothFactor={0} pathOptions={{color:"#94a3b8",weight:8,opacity:0.55,lineCap:"round",lineJoin:"round",dashArray:"1 16"}}/>}
          </>}
          {/* Tek Karpuz marker – sim'de simPos, diğerinde userPos */}
          {(mode==='sim'?simPos:userPos)&&(
            <Marker position={(mode==='sim'?simPos:userPos)!} icon={PERSON} zIndexOffset={3000}/>
          )}
          {/* Arkadaşların konumları – ?pin= / ?pins= URL parametresinden */}
          {sharedPins.map((pin,idx)=>{
            const label=sharedPins.length===1?t('friendPin'):`${t('friendPin')} ${idx+1}`;
            return(
              <Marker key={idx} position={pin} icon={mkFriendIcon(idx)} zIndexOffset={2500}
                eventHandlers={{click:()=>{
                  const friendLoc:Loc={num:-1-idx,name:label,gps:pin,cats:[],desc:"",emoji:"👤"};
                  stopSim();setTo(friendLoc);setToSearch(label);setPanelLoc(null);
                  const fLat=fromGPS&&userPos?userPos[0]:from?.gps[0]??pin[0];
                  const fLon=fromGPS&&userPos?userPos[1]:from?.gps[1]??pin[1];
                  if(from||fromGPS)calcRoute(fLat,fLon,friendLoc);
                  setMode('ready');
                }}}>
                <Tooltip permanent direction="top" offset={[0,-48]}>{label}</Tooltip>
              </Marker>
            );
          })}
          {mapVisible.map(loc=>{
            const iF=fromGPS?false:from?.num===loc.num,iT=to?.num===loc.num;
            // Nav/sim'de sadece varış etiketi, diğerleri gizli
            const navActive=mode==='nav'||mode==='sim';
            const showLabel=navActive?iT:(showLabels||iF||iT);
            return(
              <Marker key={loc.num} position={loc.gps} icon={mkIcon(loc,iF,iT,showLabel)}
                zIndexOffset={(iF||iT)?1000:0}
                eventHandlers={{click:()=>handlePinClick(loc)}}>
              </Marker>
            );
          })}
          <FitMap/>
          <MapRefCapture mapRef={mapInstanceRef}/>
          <FitOnCat cat={cat} locs={LOCS}/>
          <FitOnRoute route={route} fromPos={fromGPS&&userPos?userPos:from?.gps??null} toPos={to?.gps??null}/>
          <ZoomCtrl/>
          <ZoomWatcher setShowLabels={setShowLabels}/>
          <CenterCtrl userPos={userPos}/>
          <MapFollower pos={mode==='nav'?userPos:mode==='sim'?simPos:null} active={mode==='nav'||mode==='sim'} autoTrack={autoTrack} onDrag={handleMapDrag}/>
        </MapContainer>
      </div>

      {/* ─── Bina bilgi modalı ──────────────────────────────────────────── */}
      {selectedLoc&&(
        <div onClick={()=>setSelectedLoc(null)}
          style={{position:"fixed",inset:0,zIndex:30,
            background:"rgba(0,0,0,0.55)",
            display:"flex",alignItems:"center",justifyContent:"center",
            padding:"20px 16px"}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:360,
              maxHeight:"82vh",overflowY:"auto",
              boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>

            {/* Fotoğraf veya emoji başlık */}
            {(selectedLoc.photo||selectedLoc.photos)?(
              <div style={{position:"relative",borderRadius:"20px 20px 0 0",overflow:"hidden"}}>
                <PhotoGallery loc={selectedLoc} height={170} mb={0}/>
                <div style={{position:"absolute",bottom:0,left:0,right:0,zIndex:3,
                  background:"linear-gradient(transparent,rgba(0,0,0,0.75))",
                  padding:"24px 16px 14px",pointerEvents:"none"}}>
                  <div style={{fontWeight:800,fontSize:18,color:"#fff"}}>{locName(selectedLoc)}</div>
                  {ROOMS[String(selectedLoc.num)]&&(
                    <div style={{fontSize:11,color:"rgba(255,255,255,0.75)",marginTop:2}}>
                      {Object.values(ROOMS[String(selectedLoc.num)]).reduce((s,a)=>s+a.length,0)} {t('mahalUnit')}
                    </div>
                  )}
                </div>
                <button onClick={()=>setSelectedLoc(null)}
                  style={{position:"absolute",top:10,right:10,width:32,height:32,zIndex:4,
                    borderRadius:"50%",border:"none",background:"rgba(0,0,0,0.4)",
                    color:"#fff",fontSize:18,cursor:"pointer",display:"flex",
                    alignItems:"center",justifyContent:"center",lineHeight:1}}>✕</button>
              </div>
            ):(
              <div style={{
                background:`linear-gradient(135deg,${CAT[selectedLoc.cats[0]]?.c??"#3b82f6"},${CAT[selectedLoc.cats[0]]?.c??"#3b82f6"}99)`,
                borderRadius:"20px 20px 0 0",padding:"24px 16px 20px",
                display:"flex",alignItems:"center",gap:14,position:"relative"}}>
                <div style={{fontSize:42}}>{selectedLoc.emoji}</div>
                <div>
                  <div style={{fontWeight:800,fontSize:18,color:"#fff"}}>{locName(selectedLoc)}</div>
                  {ROOMS[String(selectedLoc.num)]&&(
                    <div style={{fontSize:11,color:"rgba(255,255,255,0.75)",marginTop:2}}>
                      {Object.values(ROOMS[String(selectedLoc.num)]).reduce((s,a)=>s+a.length,0)} {t('mahalUnit')}
                    </div>
                  )}
                </div>
                <button onClick={()=>setSelectedLoc(null)}
                  style={{position:"absolute",top:12,right:12,width:32,height:32,
                    borderRadius:"50%",border:"none",background:"rgba(0,0,0,0.25)",
                    color:"#fff",fontSize:18,cursor:"pointer",display:"flex",
                    alignItems:"center",justifyContent:"center",lineHeight:1}}>✕</button>
              </div>
            )}

            <div style={{padding:"14px 16px 20px"}}>
              <p style={{margin:"0 0 12px",fontSize:13,color:"#475569",lineHeight:1.6}}>
                {locDesc(selectedLoc)}
              </p>

              {/* Mahal listesi */}
              {ROOMS[String(selectedLoc.num)]&&(
                <div style={{borderTop:"1px solid #e2e8f0",paddingTop:12,marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",
                    letterSpacing:"0.06em",marginBottom:8}}>{t('roomListTitle')}</div>
                  <div style={{maxHeight:180,overflowY:"auto",fontSize:12,lineHeight:1.5}}>
                    {Object.entries(ROOMS[String(selectedLoc.num)]).map(([floor,rooms])=>(
                      <div key={floor} style={{marginBottom:10}}>
                        <div style={{fontWeight:700,color:"#1e293b",fontSize:11,
                          background:"#f1f5f9",padding:"3px 8px",borderRadius:6,marginBottom:4}}>
                          {tFloor(floor)}
                        </div>
                        {(rooms as RoomEntry[]).map((r,i)=>{
                          const rk=`${selectedLoc.num}_${floor}_${i}`;
                          return<RoomRow key={rk} r={r} roomKey={rk}
                            expanded={expandedRoomKey===rk} onToggle={toggleRoom}
                            highlighted={highlightedRoomKey===rk}/>;
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Aksiyon butonları */}
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>{stopSim();setPanelLoc(selectedLoc);setFrom(selectedLoc);setFromGPS(false);setMode('pickTo');setSelectedLoc(null);}}
                  style={{...BTN,flex:1,background:"#16a34a",color:"#fff",
                    fontSize:14,padding:"12px 0",borderRadius:12}}>
                  {t('btnStartHere')}
                </button>
                {(from||fromGPS||(gpsOn&&userPos))&&(
                  <button onClick={()=>{stopSim();setPanelLoc(selectedLoc);setTo(selectedLoc);
                    if(gpsOn&&userPos){setFromGPS(true);calcRoute(userPos[0],userPos[1],selectedLoc);}
                    else if(from){calcRoute(from.gps[0],from.gps[1],selectedLoc);}
                    setSelectedLoc(null);}}
                    style={{...BTN,flex:1,background:"#ef4444",color:"#fff",
                      fontSize:14,padding:"12px 0",borderRadius:12}}>
                    {t('btnGoHere')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Seçim modu – merkezi yüzen kart ───────────────────────────── */}
      {mode==='pickFrom'&&(
        <div style={{position:"absolute",top:68,left:"50%",transform:"translateX(-50%)",
          zIndex:20,display:"flex",flexDirection:"column",alignItems:"center",gap:10,
          background:"#16a34a",
          borderRadius:20,padding:"14px 20px",width:"80%",maxWidth:320,
          boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
          animation:"onboard-fadein 0.25s ease"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,width:"100%"}}>
            <span style={{fontSize:22}}>🟢</span>
            <span style={{color:"#fff",fontWeight:700,fontSize:15,flex:1}}>
              {t('pickFromTitle')}
            </span>
            <button onClick={reset}
              style={{...BTN,background:"rgba(0,0,0,0.2)",color:"#fff",
                minHeight:32,width:32,borderRadius:"50%",fontSize:16,padding:0,flexShrink:0}}>
              ✕
            </button>
          </div>
          <div style={{color:"rgba(255,255,255,0.85)",fontSize:12,textAlign:"center",lineHeight:1.6,whiteSpace:"pre-line"}}>
            {t('pickFromDesc')}
          </div>
          {gpsOn&&userPos&&(
            <button onClick={()=>{setFromGPS(true);setMode('pickTo');}}
              style={{...BTN,background:"rgba(255,255,255,0.25)",color:"#fff",
                fontSize:13,padding:"8px 20px",minHeight:36,borderRadius:30,width:"100%"}}>
              {t('useMyLocation')}
            </button>
          )}
        </div>
      )}

      {/* ─── Onboarding step 6 demo nav bar (idle modda) ─────────────────── */}
      {onboardStep===6&&mode==='idle'&&(
        <div id="nav-card" style={{position:"absolute",top:56,left:0,right:0,zIndex:15,
          boxShadow:"0 4px 16px rgba(0,0,0,0.5)"}}>
          <div style={{background:"#0d9488",padding:"14px 18px",
            display:"flex",alignItems:"center",gap:14}}>
            <div style={{fontSize:52,lineHeight:1,minWidth:56,textAlign:"center",
              filter:"drop-shadow(0 2px 4px rgba(0,0,0,0.3))"}}>⬅️</div>
            <div style={{flex:1}}>
              <div style={{color:"#fff",fontSize:20,fontWeight:800,lineHeight:1.2}}>{`${t('dirSW')} ${t('stepWalk')}`}</div>
              <div style={{color:"rgba(255,255,255,0.75)",fontSize:13,marginTop:4}}>~162m · 2 {t('minRemaining')}</div>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <button id="speed-btn" style={{...BTN,background:"rgba(0,0,0,0.3)",color:"#fff",
                minHeight:36,padding:"0 11px",borderRadius:8,fontSize:13,fontWeight:800,
                pointerEvents:"none"}}>1×</button>
              <button style={{...BTN,background:"rgba(0,0,0,0.25)",color:"#fff",
                minHeight:40,width:40,borderRadius:"50%",fontSize:18,padding:0,
                pointerEvents:"none"}}>■</button>
            </div>
          </div>
          <div style={{background:"#065f46",padding:"8px 18px 8px 88px",
            display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:"rgba(255,255,255,0.6)",fontSize:12,whiteSpace:"nowrap"}}>{t('thenLabel')}</span>
            <span style={{fontSize:18,color:"rgba(255,255,255,0.85)"}}>↱</span>
            <span style={{fontSize:13,color:"rgba(255,255,255,0.85)"}}>{`39m ${t('stepAfter')} ${t('stepTurnRight')}`}</span>
          </div>
        </div>
      )}

      {/* ─── Google Maps tarzı navigasyon kartı ─────────────────────────── */}
      {(mode==='sim'||mode==='nav')&&activeStep&&(
        <div id="nav-card" style={{position:"absolute",top:56,left:0,right:0,zIndex:15,
          boxShadow:"0 2px 12px rgba(0,0,0,0.45)"}}>
          {/* Ana yön kartı – kompakt */}
          <div style={{background:"#0d9488",padding:"9px 12px",
            display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:36,lineHeight:1,minWidth:40,textAlign:"center",
              filter:"drop-shadow(0 1px 3px rgba(0,0,0,0.3))"}}>
              {activeStep.arrow}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:"#fff",fontSize:16,fontWeight:800,lineHeight:1.2,
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {activeStep.text}
              </div>
              {remM>0&&<div style={{color:"rgba(255,255,255,0.75)",fontSize:12,marginTop:2}}>
                ~{remM}m · {remMins} {t('minRemaining')}
              </div>}
            </div>
            {mode==='sim'&&(
              <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
                <button id="speed-btn" onClick={()=>{const n=simSpeed===1?2:simSpeed===2?4:1;setSimSpeed(n);simSpeedRef.current=n;}}
                  style={{...BTN,background:"rgba(0,0,0,0.3)",color:"#fff",
                    minHeight:32,padding:"0 10px",borderRadius:8,fontSize:12,fontWeight:800}}>
                  {simSpeed}×
                </button>
                {simPaused?(
                  <button onClick={resumeSim}
                    style={{...BTN,background:"#16a34a",color:"#fff",
                      minHeight:36,width:36,borderRadius:"50%",fontSize:16,padding:0}}>▶</button>
                ):(
                  <button onClick={pauseSim}
                    style={{...BTN,background:"rgba(0,0,0,0.25)",color:"#fff",
                      minHeight:36,width:36,borderRadius:"50%",fontSize:16,padding:0}}>⏸</button>
                )}
              </div>
            )}
          </div>
          {/* Sonraki adım – kompakt */}
          {nextStep&&(
            <div style={{background:"#065f46",padding:"5px 12px",
              display:"flex",alignItems:"center",gap:6}}>
              <span style={{color:"rgba(255,255,255,0.6)",fontSize:11,whiteSpace:"nowrap",flexShrink:0}}>{t('thenLabel')}</span>
              <span style={{fontSize:15,color:"rgba(255,255,255,0.85)",flexShrink:0}}>{nextStep.arrow}</span>
              <span style={{fontSize:12,color:"rgba(255,255,255,0.85)",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nextStep.text}</span>
            </div>
          )}
        </div>
      )}

      {/* ─── Simülasyonda yakından geçilen bina ─────────────────────────── */}
      {/* stickyNearby kaldırıldı – görsel gürültü */}

      {/* ─── Sesli komut hint toast – sabit HUD, harita konumundan bağımsız ── */}
      {(()=>{if(voiceHint)voiceHintTextRef.current=voiceHint;return null;})()}
      <div style={{position:"fixed",
        top:(mode==='nav'||mode==='sim')&&activeStep?155:100,
        left:"50%",transform:"translateX(-50%)",
        zIndex:40,background:"rgba(15,23,42,0.92)",backdropFilter:"blur(8px)",
        color:"#fff",padding:"8px 18px",borderRadius:20,fontSize:13,
        boxShadow:"0 4px 16px rgba(0,0,0,0.5)",whiteSpace:"nowrap",
        pointerEvents:"none",
        opacity:voiceHint?1:0,
        transition:"opacity 0.35s ease"}}>
        {voiceHintTextRef.current}
      </div>


      {/* ─── Yüzen Üst Arama Çubuğu (Floating Search Bar) ───────────────────── */}
      {mode !== 'pickFrom' && !showWelcome && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 10,
          width: "calc(100% - 32px)", maxWidth: 440,
          background: isDarkTheme ? "rgba(30, 41, 59, 0.85)" : "rgba(255, 255, 255, 0.9)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          borderRadius: 24, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15)",
          border: isDarkTheme ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid rgba(0, 0, 0, 0.05)"
        }}>
          <div onClick={() => window.location.reload()} style={{ cursor: "pointer", flexShrink: 0 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", background: "#bbf7d0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src="/karpuz-mascot.png" alt="Karpuz" onError={(e)=>{ (e.target as any).src = isEN() ? "/karpuza-sor-en.png" : "/karpuza-sor.png"; }} style={{ width: "90%", height: "90%", objectFit: "contain" }} />
            </div>
          </div>
          <div onClick={() => { setMode('pickTo'); setActiveRouteInput('to'); }} style={{ flex: 1, display: "flex", flexDirection: "column", cursor: "text" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: isDarkTheme ? "#f8fafc" : "#1e293b", marginBottom: 2 }}>{isEN() ? "Where to?" : "Nereye gidiyoruz?"}</span>
            <span style={{ fontSize: 11, color: isDarkTheme ? "#94a3b8" : "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isEN() ? "Search classroom, cafe, building..." : "Derslik, kafe, bina ara..."}</span>
          </div>
          <div style={{ display: "flex", background: isDarkTheme ? "rgba(0,0,0,0.3)" : "#f1f5f9", borderRadius: 8, padding: 2, flexShrink: 0 }}>
            {(["TR", "EN"] as const).map(l => (
              <button key={l} onClick={() => setLang(l.toLowerCase() as "tr"|"en")}
                style={{
                  padding: "4px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                  background: isEN() === (l === "EN") ? (isDarkTheme ? "rgba(255,255,255,0.2)" : "#ffffff") : "transparent",
                  color: isEN() === (l === "EN") ? (isDarkTheme ? "#ffffff" : "#0f172a") : (isDarkTheme ? "#64748b" : "#94a3b8"),
                  boxShadow: isEN() === (l === "EN") && !isDarkTheme ? "0 2px 4px rgba(0,0,0,0.05)" : "none"
                }}>{l}</button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Sağ araç çubuğu: zoom + pusula + konuma git ──────────────────── */}
      <div style={{position:"absolute",right:12,top:(mode==='nav'||mode==='sim')&&activeStep?145:82,zIndex:10,display:"flex",flexDirection:"column",gap:4}}>
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
        {/* Konumu paylaş / gruba ekle – GPS açık ve konum alındıysa görünür */}
        {gpsOn&&userPos&&(
          <button
            onClick={()=>{
              const me=userPos[0].toFixed(6)+","+userPos[1].toFixed(6);
              const existing=sharedPins.map(([a,b])=>a.toFixed(6)+","+b.toFixed(6));
              const allPins=[...existing,me];
              const param=allPins.length===1?"pin="+me:"pins="+allPins.join("|");
              const url=window.location.origin+window.location.pathname+"?"+param;
              navigator.clipboard.writeText(url).catch(()=>{});
              setVoiceHint(sharedPins.length>0
                ?isEN()?"🔗 Added to group link!":"🔗 Gruba eklendi, link kopyalandı!"
                :t('shareLocationCopied'));
              setTimeout(()=>setVoiceHint(null),3000);
            }}
            style={{...BTN,width:40,height:40,
              background:sharedPins.length>0?"#0d9488":"#1e293b",
              border:`1px solid ${sharedPins.length>0?"#5eead4":"#334155"}`,
              borderRadius:10,minHeight:40,
              boxShadow:"0 2px 8px rgba(0,0,0,0.3)",fontSize:18}}>📤</button>
        )}
        {/* Merkeze Dön – kullanıcı nav/sim sırasında haritayı kaydırdığında çıkar */}
        {!autoTrack&&(mode==='nav'||mode==='sim')&&(
          <button onClick={()=>setAutoTrack(true)}
            style={{...BTN,width:40,height:40,background:"#0d9488",
              border:"none",borderRadius:10,minHeight:40,
              boxShadow:"0 2px 8px rgba(0,0,0,0.4),0 0 0 2px #5eead4",
              fontSize:20,color:"#fff",animation:"onboard-fadein 0.18s ease"}}>⊙</button>
        )}
      </div>

      {/* ─── Alt panel ───────────────────────────────────────────────────── */}
      <div
        style={{position:"fixed",bottom:0,left:0,right:0,zIndex:10,
          background:"#1e293b",borderRadius:"16px 16px 0 0",
          boxShadow:showKarpuzIntro
            ?"0 -4px 24px rgba(0,0,0,0.5),0 0 0 2px #0d9488,0 0 32px rgba(13,148,136,0.45)"
            :"0 -4px 24px rgba(0,0,0,0.5)",
          height:"185px",maxHeight:"85dvh",
          width:"100%",maxWidth:"100%",boxSizing:"border-box",
          display:"flex",flexDirection:"column",
          overflow:"hidden",
          transition:"height 0.25s cubic-bezier(0.32,0.72,0,1),bottom 0.15s ease"}}
        ref={sheetRef}>

        {/* Drag handle – flex-shrink:0 ile ezilmez */}
        <div ref={handleRef}
          style={{display:"flex",justifyContent:"center",alignItems:"center",
            padding:"16px 0",cursor:"grab",width:"100%",touchAction:"none",flexShrink:0}}>
          <div style={{width:36,height:4,background:"#475569",borderRadius:2}}/>
        </div>

        {/* Kaydırılabilir içerik alanı */}
        <div style={{padding:"4px 12px 12px",display:"flex",flexDirection:"column",gap:8,
          flex:1,overflowY:"auto",overflowX:"hidden",minHeight:0}}>

          {/* ARRIVED: Varış kutlaması alt panelde */}
          {mode==='arrived'&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",
              justifyContent:"center",gap:6,padding:"8px 0 env(safe-area-inset-bottom,12px)",
              textAlign:"center",animation:"onboard-fadein .3s ease"}}>
              <div style={{fontSize:42}}>🎉</div>
              <div style={{color:"#86efac",fontWeight:800,fontSize:18,lineHeight:1.2}}>{to?locName(to):""}</div>
              <div style={{color:"#94a3b8",fontSize:13}}>{t('arrivedMsg')}</div>
              <button onClick={reset}
                style={{...BTN,background:"#16a34a",color:"#fff",width:"100%",
                  fontSize:15,fontWeight:700,minHeight:48,borderRadius:12,marginTop:6,
                  paddingBottom:"calc(env(safe-area-inset-bottom,0px) + 0px)"}}>
                {isEN()?"New Route":"Yeni Rota Çiz"}
              </button>
            </div>
          )}


          {/* IDLE: Dikey 3 bölüm – Başlangıç | GPS satırı | Varış + Yol Tarifi */}
          {mode==='idle'&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>

              {/* Başlangıç input */}
              <div style={{position:"relative"}}>
                <input id="search-input" value={fromSearch}
                  onChange={e=>{setFromSearch(e.target.value);setActiveRouteInput('from');}}
                  onFocus={e=>{setActiveRouteInput('from');window.scrollTo(0,0);document.body.scrollTop=0;setTimeout(()=>e.target.scrollIntoView({behavior:'smooth',block:'nearest'}),300);}}
                  onBlur={()=>setTimeout(()=>setActiveRouteInput(p=>p==='from'?null:p),160)}
                  placeholder={t('fromPlaceholder')}
                  style={{width:"100%",boxSizing:"border-box",
                    background:"#0f172a",border:`1px solid ${activeRouteInput==='from'?"#16a34a":"#334155"}`,
                    borderRadius:10,padding:"11px 44px 11px 14px",color:"#fff",fontSize:16,
                    outline:"none",minHeight:46}}/>
                <button onClick={()=>startVoiceSearch('from')}
                  style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",
                    background:listening?"#16a34a":"transparent",border:"none",
                    borderRadius:6,width:30,height:30,cursor:"pointer",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:16,color:listening?"#fff":"#64748b",padding:0,
                    animation:listening?"gps-pulse 1s ease-out infinite":undefined}}>
                  {listening?"⏹":"🎤"}
                </button>
              </div>
              {/* From öneri listesi – inline (panel overflow'unu aşmaz) */}
              {activeRouteInput==='from'&&fromSearch&&!fromGPS&&(
                <div style={{background:"#1e293b",borderRadius:10,boxShadow:"0 2px 12px rgba(0,0,0,0.5)",
                  maxHeight:160,overflowY:"auto",marginTop:-2}}>
                  {searchLocs(fromSearch,LOCS).slice(0,8).map(({loc,keyword},i,arr)=>(
                    <button key={loc.num} onMouseDown={e=>e.preventDefault()}
                      onClick={()=>{
                        if(to&&loc.num===to.num){setVoiceHint(isEN()?"⚠️ Start and destination are the same!":"⚠️ Başlangıç ve varış noktası aynı olamaz!");setTimeout(()=>setVoiceHint(null),3000);return;}
                        setFrom(loc);setFromGPS(false);setFromSearch(locName(loc));setActiveRouteInput(null);setPanelLoc(loc);
                        if(to){calcRoute(loc.gps[0],loc.gps[1],to);setMode('ready');}}}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                        background:"transparent",border:"none",
                        borderBottom:i<arr.length-1?"1px solid #334155":"none",
                        cursor:"pointer",color:"#fff",textAlign:"left",width:"100%"}}>
                      <span style={{fontSize:15,flexShrink:0}}>{loc.emoji}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13}}>{locName(loc)}</div>
                        {keyword&&<div style={{fontSize:10,color:"#64748b",marginTop:1}}>{isEN()?"Contains:":"İçeriyor:"} {keyword}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* GPS orta satırı */}
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{flex:1,height:1,background:"#1e293b"}}/>
                <button id="from-gps-btn"
                  onMouseDown={e=>{e.preventDefault();setFromGPS(true);setFrom(null);setFromSearch(t('yourLocation'));
                    if(to&&userPos)calcRoute(userPos[0],userPos[1],to);}}
                  style={{...BTN,background:"#0d9488",color:"#fff",fontSize:13,fontWeight:700,
                    padding:"8px 16px",borderRadius:20,gap:5,minHeight:36,whiteSpace:"nowrap"}}>
                  <img src="/location-icon.png" alt="" style={{width:14,height:14,objectFit:"contain"}}/>
                  {t('startFromLocation')}
                </button>
                <div style={{flex:1,height:1,background:"#1e293b"}}/>
                {(from||to)&&(
                  <button onClick={swapFromTo}
                    style={{...BTN,background:"#1e293b",border:"1px solid #334155",
                      borderRadius:8,width:36,height:36,padding:0,flexShrink:0,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      color:"#94a3b8",fontSize:19}}>
                    ⇅
                  </button>
                )}
              </div>

              {/* Varış input */}
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <div style={{flex:1,position:"relative",minWidth:0}}>
                  <input id="to-input" value={toSearch}
                    onChange={e=>{setToSearch(e.target.value);setActiveRouteInput('to');}}
                    onFocus={e=>{setActiveRouteInput('to');window.scrollTo(0,0);document.body.scrollTop=0;setTimeout(()=>e.target.scrollIntoView({behavior:'smooth',block:'nearest'}),300);}}
                    onBlur={()=>setTimeout(()=>setActiveRouteInput(p=>p==='to'?null:p),160)}
                    onKeyDown={e=>{
                      if(e.key!=='Enter')return;
                      const match=searchLocs(toSearch,LOCS)[0]?.loc;
                      if(!match)return;
                      setTo(match);setToSearch(locName(match));setActiveRouteInput(null);
                      if(from||(fromGPS&&userPos)){
                        const fLa=fromGPS&&userPos?userPos[0]:from!.gps[0];
                        const fLo=fromGPS&&userPos?userPos[1]:from!.gps[1];
                        calcRoute(fLa,fLo,match);setMode('ready');
                      } else {setMode('pickFrom');}
                    }}
                    placeholder={t('toPlaceholder')}
                    style={{width:"100%",boxSizing:"border-box",
                      background:"#0f172a",border:`1px solid ${activeRouteInput==='to'?"#ef4444":"#334155"}`,
                      borderRadius:10,padding:"11px 44px 11px 14px",color:"#fff",fontSize:16,
                      outline:"none",minHeight:46}}/>
                  <button onClick={()=>startVoiceSearch('to')}
                    style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",
                      background:listening?"#ef4444":"transparent",border:"none",
                      borderRadius:6,width:30,height:30,cursor:"pointer",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:16,color:listening?"#fff":"#64748b",padding:0}}>
                    {listening?"⏹":"🎤"}
                  </button>
                </div>
              </div>
              {/* To öneri listesi – Entity + POI (inline, panel overflow'unu aşmaz) */}
              {activeRouteInput==='to'&&toSearch&&(()=>{
                const entRes=searchEntities(toSearch);
                const locRes=searchLocs(toSearch,LOCS).slice(0,entRes.length>0?5:8);
                const total=entRes.length+locRes.length;
                if(total===0)return null;
                return(
                  <div style={{background:"#1e293b",borderRadius:10,boxShadow:"0 2px 12px rgba(0,0,0,0.5)",
                    maxHeight:200,overflowY:"auto",marginTop:-2}}>
                    {entRes.slice(0,4).map((ent,i)=>{
                      const parent=LOCS.find(l=>l.num===ent.parentPoiNum);
                      if(!parent)return null;
                      return(
                        <button key={ent.id} onMouseDown={e=>e.preventDefault()}
                          onClick={()=>{
                            setTo(parent);setToSearch(locName(parent));setActiveRouteInput(null);
                            setPanelLoc(parent);setTargetRoom(ent.room??null);
                            if(from||(fromGPS&&userPos)){
                              const fLa=fromGPS&&userPos?userPos[0]:from!.gps[0];
                              const fLo=fromGPS&&userPos?userPos[1]:from!.gps[1];
                              calcRoute(fLa,fLo,parent);setMode('ready');
                            } else {setMode('pickFrom');}}}
                          style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",
                            background:"rgba(99,102,241,0.08)",border:"none",
                            borderBottom:"1px solid #334155",
                            cursor:"pointer",color:"#fff",textAlign:"left",width:"100%"}}>
                          <span style={{fontSize:16,flexShrink:0}}>{ENTITY_ICON[ent.kind]}</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:600}}>{entName(ent)}</div>
                            <div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>
                              {locName(parent)}{ent.room?` · ${isEN()?"Room":"Oda"} ${ent.room}`:""}
                              {entTitle(ent)?` — ${entTitle(ent)}`:""}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {locRes.map(({loc,keyword},i,arr)=>(
                      <button key={loc.num} onMouseDown={e=>e.preventDefault()}
                        onClick={()=>{
                          if(from&&!fromGPS&&loc.num===from.num){setVoiceHint(isEN()?"⚠️ Start and destination are the same!":"⚠️ Başlangıç ve varış noktası aynı olamaz!");setTimeout(()=>setVoiceHint(null),3000);return;}
                          setTo(loc);setToSearch(locName(loc));setActiveRouteInput(null);setPanelLoc(loc);
                          setTargetRoom(null);
                          if(from||(fromGPS&&userPos)){
                            const fLa=fromGPS&&userPos?userPos[0]:from!.gps[0];
                            const fLo=fromGPS&&userPos?userPos[1]:from!.gps[1];
                            calcRoute(fLa,fLo,loc);setMode('ready');
                          } else if(fromGPS&&!userPos){setMode('pickFrom');}}}
                        style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                          background:"transparent",border:"none",
                          borderBottom:i<arr.length-1?"1px solid #334155":"none",
                          cursor:"pointer",color:"#fff",textAlign:"left",width:"100%"}}>
                        <span style={{fontSize:15,flexShrink:0}}>{loc.emoji}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13}}>{locName(loc)}</div>
                          {keyword&&<div style={{fontSize:10,color:"#64748b",marginTop:1}}>{isEN()?"Contains:":"İçeriyor:"} {keyword}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()}

            </div>
          )}

          {/* PICKFROM: Başlangıç noktası arama listesi */}
          {mode==='pickFrom'&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {userPos&&(
                <button onClick={()=>{setFromGPS(true);setFrom(null);setFromSearch(t('yourLocation'));setMode('pickTo');}}
                  style={{...BTN,background:"#0d9488",color:"#fff",fontSize:13,fontWeight:700,
                    padding:"10px 16px",borderRadius:10,width:"100%",gap:6,minHeight:44}}>
                  📍 {t('useMyLocation')}
                </button>
              )}
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder={t('fromPlaceholder')}
                autoFocus
                style={{width:"100%",boxSizing:"border-box",background:"#0f172a",border:"1px solid #16a34a",borderRadius:10,
                  padding:"11px 14px",color:"#fff",fontSize:16,outline:"none",minHeight:44}}/>
              <div style={{maxHeight:180,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}}>
                {visible.slice(0,10).map(loc=>(
                  <button key={loc.num} onClick={()=>{setFrom(loc);setFromGPS(false);setFromSearch(locName(loc));setMode('pickTo');}}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
                      background:"#0f172a",border:"none",borderRadius:8,cursor:"pointer",
                      color:"#fff",textAlign:"left",width:"100%"}}>
                    <span style={{fontSize:18,flexShrink:0}}>{loc.emoji}</span>
                    <span style={{fontSize:14,fontWeight:600,flex:1}}>{locName(loc)}</span>
                    <span style={{color:"#16a34a",fontSize:12,flexShrink:0}}>🟢 {t('btnStartHere').replace('🟢 ','')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PICKTО: Varış noktası arama listesi */}
          {mode==='pickTo'&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>setMode('idle')}
                  style={{...BTN,background:"transparent",color:"#94a3b8",
                    minHeight:32,padding:"0 10px",fontSize:12,borderRadius:6,flexShrink:0,
                    border:"1px solid #334155"}}>
                  ← {isEN()?"Back":"Geri"}
                </button>
                <span style={{color:"#f1f5f9",fontSize:13,fontWeight:600,flex:1}}>
                  🔴 {t('pickToTitle')}
                </span>
              </div>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder={t('searchDestPlaceholder')}
                autoFocus
                style={{width:"100%",boxSizing:"border-box",background:"#0f172a",border:"1px solid #ef4444",borderRadius:10,
                  padding:"11px 14px",color:"#fff",fontSize:16,outline:"none",minHeight:44}}/>
              <div style={{maxHeight:180,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}}>
                {visible.slice(0,10).map(loc=>(
                  <button key={loc.num} onClick={()=>handlePinClick(loc)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
                      background:"#0f172a",border:"none",borderRadius:8,cursor:"pointer",
                      color:"#fff",textAlign:"left",width:"100%"}}>
                    <span style={{fontSize:18,flexShrink:0}}>{loc.emoji}</span>
                    <span style={{fontSize:14,fontWeight:600,flex:1}}>{locName(loc)}</span>
                    <span style={{color:"#ef4444",fontSize:12,flexShrink:0}}>{t('btnGoHereArrow')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* READY / SIM / NAV: Rota bilgisi */}
          {(mode==='ready'||mode==='sim'||mode==='nav')&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {/* Kimden - Kime */}
              <div style={{display:"flex",alignItems:"center",gap:8,background:"#0f172a",borderRadius:10,padding:"10px 12px"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}
                    onClick={()=>{if(mode==='ready'){setFrom(null);setFromGPS(false);setFromSearch("");setMode('idle');setRoute(null);setRouteM(0);setNavSteps([]);}}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:"#16a34a",flexShrink:0}}/>
                    <span style={{fontSize:12,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                      textDecoration:mode==='ready'?"underline dotted":"none",cursor:mode==='ready'?"pointer":"default"}}>
                      {fromGPS?t('yourLocation'):from?locName(from):"—"}
                    </span>
                  </div>
                  {editingTo?(
                    <div style={{position:"relative",marginTop:2}}>
                      <input autoFocus value={editToSearch}
                        onChange={e=>setEditToSearch(e.target.value)}
                        onBlur={()=>setTimeout(()=>setEditingTo(false),160)}
                        placeholder={t('editToPlaceholder')}
                        style={{width:"100%",boxSizing:"border-box",background:"#1e293b",
                          border:"1px solid #ef4444",borderRadius:8,padding:"6px 10px",
                          color:"#fff",fontSize:12,outline:"none"}}/>
                      {editToSearch&&(
                        <div style={{position:"absolute",left:0,right:0,top:"calc(100% + 2px)",zIndex:60,
                          background:"#1e293b",borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,0.7)",maxHeight:160,overflowY:"auto"}}>
                          {LOCS.filter(l=>locName(l).toLocaleLowerCase().includes(editToSearch.toLocaleLowerCase())).slice(0,6).map((loc,i,arr)=>(
                            <button key={loc.num} onMouseDown={e=>e.preventDefault()}
                              onClick={()=>{
                                setTo(loc);setToSearch(locName(loc));setEditingTo(false);setEditToSearch("");setPanelLoc(loc);
                                if(from||(fromGPS&&userPos)){
                                  const fLa=fromGPS&&userPos?userPos[0]:from!.gps[0];
                                  const fLo=fromGPS&&userPos?userPos[1]:from!.gps[1];
                                  calcRoute(fLa,fLo,loc);setMode('ready');
                                }
                              }}
                              style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
                                background:"transparent",border:"none",
                                borderBottom:i<arr.length-1?"1px solid #334155":"none",
                                cursor:"pointer",color:"#fff",textAlign:"left",width:"100%"}}>
                              <span style={{fontSize:14,flexShrink:0}}>{loc.emoji}</span>
                              <span style={{fontSize:12,flex:1}}>{locName(loc)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ):(
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{width:8,height:8,borderRadius:"50%",background:"#ef4444",flexShrink:0}}/>
                      <span style={{fontSize:12,color:"#f1f5f9",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>
                        {to?locName(to):"—"}
                      </span>
                      {mode==='ready'&&(
                        <button onMouseDown={e=>e.preventDefault()}
                          onClick={()=>{setEditToSearch("");setEditingTo(true);}}
                          style={{...BTN,padding:"2px 6px",fontSize:11,background:"#334155",
                            color:"#94a3b8",borderRadius:6,flexShrink:0,minHeight:24}}>{t('btnChange')}</button>
                      )}
                    </div>
                  )}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{color:"#86efac",fontWeight:800,fontSize:14}}>~{mins} {t('minLabel')}</div>
                  <div style={{color:"#64748b",fontSize:11}}>{routeM} m</div>
                </div>
                {mode==='ready'&&(
                  <button onClick={swapFromTo}
                    style={{...BTN,background:"#334155",color:"#94a3b8",minHeight:36,padding:"0 10px",fontSize:18,borderRadius:8}}>⇅</button>
                )}
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
                      <span style={{fontSize:11}}>{t('btnPreview')}</span>
                    </button>
                    {/* Gerçek GPS navigasyon */}
                    {gpsOn&&userPos?(
                      <button onClick={()=>{
                        if(to&&userPos&&hav(userPos[0],userPos[1],to.gps[0],to.gps[1])<ARRIVE_M){
                          setVoiceHint(isEN()?"📍 You're already here!":"📍 Zaten buradasınız!");
                          setTimeout(()=>setVoiceHint(null),3000);
                          setMode('arrived');return;
                        }
                        setFromGPS(true);setMode('nav');}}
                        style={{...BTN,flex:1,background:"#3b82f6",color:"#fff",fontSize:13,
                          padding:"11px 0",borderRadius:10,flexDirection:"column",gap:2,minHeight:48}}>
                        <span style={{fontSize:18}}>🚶</span>
                        <span style={{fontSize:11}}>{t('btnGpsNav')}</span>
                      </button>
                    ):(
                      <button onClick={toggleGPS}
                        style={{...BTN,flex:1,background:"#334155",color:"#94a3b8",fontSize:11,
                          padding:"11px 0",borderRadius:10,flexDirection:"column",gap:2,minHeight:48}}>
                        <span style={{fontSize:18}}>📍</span>
                        <span>{t('btnOpenGps')}</span>
                      </button>
                    )}
                    <button onClick={()=>setShowSteps(p=>!p)}
                      style={{...BTN,background:showSteps?"#3b82f6":"#334155",color:"#fff",
                        fontSize:11,padding:"0 10px",borderRadius:10,flexDirection:"column",gap:2,minHeight:48,minWidth:50}}>
                      <span style={{fontSize:18}}>≡</span>
                      <span>{showSteps?t('btnStepsHide'):t('btnStepsShow')}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Nav/Sim modunda varış fotoğrafı */}
              {(mode==='sim'||mode==='nav')&&to&&(to.photo||to.photos?.length)&&(
                <PhotoGallery loc={to} height={140} mb={0}/>
              )}

              {/* Nav/Sim modunda adım butonu */}
              {(mode==='sim'||mode==='nav')&&(
                <div style={{display:"flex",justifyContent:"flex-end"}}>
                  <button onClick={()=>setShowSteps(p=>!p)}
                    style={{...BTN,background:showSteps?"#3b82f6":"#334155",color:"#fff",
                      fontSize:11,padding:"4px 12px",borderRadius:8,gap:4,minHeight:32}}>
                    <span style={{fontSize:14}}>≡</span>
                    <span>{showSteps?t('btnStepsHide'):t('btnStepsShow')}</span>
                  </button>
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

          {/* Kategori filtreleri – sadece idle modda ve klavye kapalıyken */}
          {mode==='idle'&&!activeRouteInput&&(
            <div id="cat-row" style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:6,paddingBottom:4}}>
              <span style={{color:"#64748b",fontSize:11,whiteSpace:"nowrap",flexShrink:0}}>{t('filterLabel')}</span>
              <button onClick={()=>setCat(null)}
                style={{...BTN,fontSize:12,padding:"0 12px",minHeight:34,borderRadius:20,flexShrink:0,
                  border:"1px solid #475569",background:cat===null?"#3b82f6":"transparent",color:"#fff"}}>{t('catAll')}</button>
              {(Object.entries(CAT) as [keyof typeof CAT_LABELS,{c:string;l:string}][]).map(([k,v])=>(
                <button key={k} onClick={()=>setCat(p=>p===k?null:k)}
                  style={{...BTN,fontSize:12,padding:"0 12px",minHeight:34,borderRadius:20,flexShrink:0,
                    border:`1px solid ${v.c}55`,background:cat===k?v.c:"transparent",color:cat===k?"#fff":v.c}}>
                  {CAT_LABELS[k]}
                </button>
              ))}
            </div>
          )}

          {/* Panel içi bina detay kartı – klavye kapalıyken */}
          {panelLoc&&!activeRouteInput&&(mode==='idle'||mode==='ready'||mode==='pickTo'||mode==='pickFrom')&&(
            <div style={{marginTop:8,borderTop:"1px solid #334155",paddingTop:10}}>
              <PhotoGallery loc={panelLoc} height={110}/>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                {!panelLoc.photo&&<span style={{fontSize:28}}>{panelLoc.emoji}</span>}
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:"#fff",fontSize:15}}>{locName(panelLoc)}</div>
                  {ROOMS[String(panelLoc.num)]&&(
                    <div style={{fontSize:11,color:"#94a3b8"}}>
                      {Object.values(ROOMS[String(panelLoc.num)]).reduce((s:number,a)=>s+(a as RoomEntry[]).length,0)} {t('mahalUnit')}
                    </div>
                  )}
                </div>
                <button onClick={()=>setPanelLoc(null)}
                  style={{...BTN,width:28,height:28,borderRadius:"50%",padding:0,
                    background:"#334155",color:"#fff",fontSize:14,flexShrink:0}}>✕</button>
              </div>
              <p style={{margin:"0 0 8px",fontSize:12,color:"#94a3b8",lineHeight:1.5}}>{locDesc(panelLoc)}</p>
              {ROOMS[String(panelLoc.num)]&&(
                <div style={{maxHeight:130,overflowY:"auto",fontSize:12,marginBottom:10}}>
                  {Object.entries(ROOMS[String(panelLoc.num)]).map(([floor,rooms])=>(
                    <div key={floor} style={{marginBottom:6}}>
                      <div style={{fontWeight:700,color:"#64748b",fontSize:10,
                        background:"#0f172a",padding:"2px 6px",borderRadius:4,marginBottom:3}}>
                        {tFloor(floor)}
                      </div>
                      {(rooms as RoomEntry[]).map((r,i)=>{
                        const rk=`${panelLoc.num}_${floor}_${i}`;
                        return<RoomRow key={rk} r={r} roomKey={rk}
                          expanded={expandedRoomKey===rk} onToggle={toggleRoom} dark
                          highlighted={highlightedRoomKey===rk}/>;
                      })}
                    </div>
                  ))}
                </div>
              )}
              <div style={{display:"flex",gap:8}}>
                {panelLoc?.num!==from?.num&&panelLoc?.num!==to?.num&&(
                  <button onClick={()=>{setPanelLoc(loc=>loc);setFrom(panelLoc);setFromGPS(false);setMode('pickTo');}}
                    style={{...BTN,flex:1,background:"#16a34a",color:"#fff",fontSize:13,padding:"10px 0",borderRadius:10}}>
                    {t('btnStartHere')}
                  </button>
                )}
                {panelLoc?.num!==from?.num&&panelLoc?.num!==to?.num&&(
                  <button onClick={()=>{
                    setPanelLoc(loc=>loc);setTo(panelLoc);
                    if(gpsOn&&userPos){setFromGPS(true);calcRoute(userPos[0],userPos[1],panelLoc);}
                    else if(from){calcRoute(from.gps[0],from.gps[1],panelLoc);}
                    else setMode('pickFrom');}}
                    style={{...BTN,flex:1,background:"#dc2626",color:"#fff",fontSize:13,padding:"10px 0",borderRadius:10}}>
                    {t('btnGoHere')}
                  </button>
                )}
                {(panelLoc?.num===from?.num||panelLoc?.num===to?.num)&&(
                  <div style={{flex:1,textAlign:"center",color:"#64748b",fontSize:12,padding:"10px 0"}}>
                    {panelLoc?.num===from?.num?t('startPointLabel'):t('destPointLabel')}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ─── YENİ MODERN 5 ADIMLI REHBER KARTI (GERİ BUTONLU) ───────────── */}
      {!showWelcome && showTour && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 440,
          background: isDarkTheme ? "#1e293b" : "#ffffff", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          borderRadius: 22, padding: "16px 18px 14px", boxShadow: "0 18px 45px rgba(0, 0, 0, 0.22)",
          border: isDarkTheme ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.08)", zIndex: 9999,
          display: "flex", flexDirection: "column", gap: 12, animation: "fadeInUp 0.3s ease-out"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: isDarkTheme ? "rgba(255,255,255,0.06)" : "#f1f5f9", border: "2px solid #c8102e", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(200, 16, 46, 0.2)" }}>
              <img src="/karpuz-mascot.png" alt="Karpuz" onError={(e)=>{ (e.target as any).src = isEN() ? "/karpuza-sor-en.png" : "/karpuza-sor.png"; }} style={{ width: "92%", height: "92%", objectFit: "contain" }} />
            </div>
            <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.45, fontWeight: 600, color: isDarkTheme ? "#f8fafc" : "#1e293b" }}>
              {tourStep === 0 && (isEN() ? "Ready? Let's explore the campus together." : "Hazır mısın? Kampüsü birlikte keşfedelim.")}
              {tourStep === 1 && (isEN() ? "Type here to search buildings, rooms or units. I also understand room codes like 'E1 203'." : "Bina, oda ya da birim aramak için buraya yaz, 'E1 203' gibi oda numaralarını da anlıyorum.")}
              {tourStep === 2 && (isEN() ? "Filter by categories: Educational, Social, Administrative..." : "Kategorilere göre filtrele: Eğitsel, Sosyal, İdari...")}
              {tourStep === 3 && (isEN() ? "Enable your location so I can show nearby places and guide you live." : "Konumunu aç; sana en yakın yerleri göstereyim ve seni canlı yönlendireyim.")}
              {tourStep === 4 && (isEN() ? "Tap any spot on the map, open its card, and select 'Go here'. Leave the rest to me." : "Haritadaki bir noktaya dokun, kartını aç ve 'Buraya git' de. Gerisini bana bırak.")}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
            <button onClick={() => setShowTour(false)} style={{ background: "none", border: "none", color: isDarkTheme ? "#94a3b8" : "#64748b", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "6px 4px" }}>{isEN() ? "Skip tour" : "Turu atla"}</button>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {[0, 1, 2, 3, 4].map(idx => (
                <div key={idx} style={{ width: tourStep === idx ? 16 : 6, height: 6, borderRadius: 3, background: tourStep === idx ? "#c8102e" : (isDarkTheme ? "rgba(255,255,255,0.2)" : "#cbd5e1"), transition: "all 0.2s ease" }} />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {tourStep > 0 && (
                <button onClick={() => setTourStep(tourStep - 1)} style={{ background: isDarkTheme ? "rgba(255,255,255,0.08)" : "#f1f5f9", border: `1px solid ${isDarkTheme ? "rgba(255,255,255,0.12)" : "#cbd5e1"}`, color: isDarkTheme ? "#e2e8f0" : "#475569", borderRadius: 18, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>← {isEN() ? "Back" : "Geri"}</button>
              )}
              <button onClick={() => { if (tourStep < 4) setTourStep(tourStep + 1); else setShowTour(false); }} style={{ background: "#c8102e", border: "none", color: "#ffffff", borderRadius: 18, padding: "6px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(200, 16, 46, 0.3)", transition: "all 0.15s" }}>{tourStep === 4 ? (isEN() ? "Start" : "Başla") : (isEN() ? "Next →" : "İleri →")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
