"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-rotate";
import ROOMS_RAW from "../public/rooms.json";

type RoomEntry={oda:string;label:string;cat:string;floor:string;cap?:number;unit?:string};
type RoomsData=Record<string,Record<string,RoomEntry[]>>;
const ROOMS=ROOMS_RAW as RoomsData;

// ── Sabitler ─────────────────────────────────────────────────────────────────
const CAMPUS_CENTER: [number, number] = [41.0673, 28.9490];
const CAMPUS_BOUNDS: [[number,number],[number,number]] = [[41.063, 28.941], [41.071, 28.957]];
const ARRIVE_M = 40; // metre – bu kadar yaklaşınca "ulaştınız" (GPS sapması için toleranslı)

interface OnboardStep{text:string;target:string|null;}
const ONBOARD_STEPS:OnboardStep[]=[
  {text:"Merhaba! Ben Karpuz 🐾\nSana kampüsü tanıtayım!",target:null},
  {text:"Konumunu açmak için\nbu düğmeye dokun 📍",target:"gps-btn"},
  {text:"Gitmek istediğin binayı\nburaya yaz 🔍",target:"search-input"},
  {text:"Kategoriye göre filtrele:\nSosyal, Eğitsel, İdari...",target:"cat-row"},
  {text:"Yol tarifi almak için\nburaya dokun 🗺",target:"route-btn"},
  {text:"Herhangi bir binaya dokununca kart açılır.\n'Buradan Başla' → oradan yola çık 🟢\n'Buraya Git' → oraya git 🔴",target:null},
  {text:"Biraz tombulum 🐾😅 Simüle ederken\nyavaş yürürüm. Sağ üstteki '1×' butonuna\nbasarak hızlandırabilirsin: 2× → 4× → 1×",target:null},
  {text:"Hazırım! İyi kampüs gezileri 🍉",target:null},
];

// Google Sheets Web App URL
const SHEET_URL = "https://script.google.com/macros/s/AKfycbx-wzOfRVu_1CIQZzde3r8f1wdsHpSE1MIkxT-PxR3UVLl758OySrZO_P7ZBrlUGFFd/exec";
const SHEET_TOKEN = "ks_bilgi_2526";

type UserRole = "Öğrenci"|"Öğretmen"|"Personel"|"Misafir";
interface UserProfile {
  name:string; role:UserRole;
  email?:string;       // Öğrenci/Öğretmen/Personel
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
function MapFollower({pos,active}:{pos:[number,number]|null;active:boolean}){
  const m=useMap();
  useEffect(()=>{
    if(!active||!pos)return;
    m.panTo(pos,{animate:true,duration:0.5});
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
interface Loc{num:number;name:string;gps:[number,number];cats:string[];desc:string;emoji:string;photo?:string;hidden?:boolean;logo?:string;logoSize?:number;}
const CAT:Record<string,{c:string;l:string}>={
  eğitsel:{c:"#3b82f6",l:"Eğitsel"},sosyal:{c:"#f59e0b",l:"Sosyal"},
  idari:{c:"#8b5cf6",l:"İdari"},işlevsel:{c:"#10b981",l:"İşlevsel"},
  otopark:{c:"#6b7280",l:"Otopark"},giriş:{c:"#ef4444",l:"Giriş"},
};
const LOCS:Loc[]=[
  // ── Girişler ──────────────────────────────────────────────────────────────
  {num:1, name:"Cami Tarafı Giriş",  gps:[41.06855,28.94406],cats:["giriş"],   emoji:"🚪",desc:"Cami tarafındaki kampüs batı ana giriş kapısı.",photo:"/buildings/cami-giris.jpg"},
  {num:25,name:"Misafir Girişi",      gps:[41.06668,28.94535],cats:["giriş"],   emoji:"🚪",desc:"Ana misafir ve öğrenci güney girişi."},
  {num:33,name:"Tarihi Giriş",       gps:[41.06568,28.94669],cats:["giriş"],   emoji:"🏛️",desc:"Tarihi güç santrali ana giriş kapısı.",photo:"/buildings/tarihi-giris.jpg"},
  // ── Eğitsel ───────────────────────────────────────────────────────────────
  {num:2, name:"E1",                 gps:[41.06884,28.94474],cats:["eğitsel"],  emoji:"🏭",desc:"E1 mühendislik ve enerji binası.",photo:"/buildings/e1.jpg"},
  {num:3, name:"E2",                 gps:[41.06959,28.94568],cats:["eğitsel"],  emoji:"🏭",desc:"E2 mühendislik binası.",photo:"/buildings/e2.jpg"},
  {num:7, name:"L1",                 gps:[41.06909,28.94553],cats:["eğitsel"],  emoji:"🏭",desc:"L1 Enerji binası – tarihi kazan dairesi.",photo:"/buildings/l1.jpg"},
  {num:8, name:"L2",                 gps:[41.06861,28.94553],cats:["eğitsel","idari"],emoji:"🏭",desc:"L2 binası.",photo:"/buildings/l2.jpg"},
  {num:9, name:"L3",                 gps:[41.06906,28.94581],cats:["eğitsel"],  emoji:"🏭",desc:"L3 Enerji binası.",photo:"/buildings/l3.jpg"},
  {num:11,name:"E3",                 gps:[41.06807,28.94656],cats:["eğitsel"],  emoji:"🏢",desc:"E3 akademik binası.",photo:"/buildings/e3.jpg"},
  {num:12,name:"E4",                 gps:[41.06729,28.94669],cats:["eğitsel"],  emoji:"🏢",desc:"E4 akademik binası.",photo:"/buildings/e4.jpg"},
  {num:13,name:"ÇSM Sınıflar",       gps:[41.06692,28.94621],cats:["eğitsel"],  emoji:"🎓",desc:"ÇSM alt kat – derslikler ve çalışma sınıfları.",photo:"/buildings/csm-siniflar.jpg"},
  {num:18,name:"E5",                 gps:[41.06610,28.94660],cats:["eğitsel"],  emoji:"🏢",desc:"E5 akademik binası.",photo:"/buildings/e5.jpg"},
  {num:19,name:"E6",                 gps:[41.06606,28.94619],cats:["eğitsel"],  emoji:"🏢",desc:"E6 akademik binası.",photo:"/buildings/e6.jpg"},
  {num:16,name:"KD4 Mimarlık",       gps:[41.06630,28.94616],cats:["eğitsel"],  emoji:"📐",desc:"Mimarlık dijital fabrikasyon stüdyosu.",photo:"/buildings/mimarlik-kd4.jpg"},
  {num:17,name:"Seyfi Arıkan",       gps:[41.06689,28.94692],cats:["eğitsel"],  emoji:"🎤",desc:"Seyfi Arkan konferans salonu.",photo:"/buildings/seyfi-arikan.jpg"},
  {num:20,name:"Kütüphane",          gps:[41.06635,28.94598],cats:["eğitsel","sosyal"],emoji:"📚",desc:"Mehmet Kenan Tekdağ Kütüphanesi.",photo:"/buildings/kutuphane.jpg"},
  {num:22,name:"MIDL",               gps:[41.06726,28.94597],cats:["sosyal"],   emoji:"🎬",desc:"Medya ve İletişim Tasarım Laboratuvarı.",photo:"/buildings/midl.jpg"},
  {num:31,name:"Gastronomi Mutfak",  gps:[41.06603,28.94565],cats:["eğitsel"],  emoji:"👨‍🍳",desc:"Gastronomi ve mutfak sanatları laboratuvarı.",photo:"/buildings/gastronomi.jpg"},
  {num:37,name:"Blab",               gps:[41.06753,28.94561],cats:["eğitsel"],  emoji:"🔬",desc:"BLab – öğrenci proje ve maker alanı.",photo:"/buildings/blab.jpg"},
  // ── İdari ─────────────────────────────────────────────────────────────────
  {num:10,name:"Rektörlük",          gps:[41.06833,28.94617],cats:["idari"],    emoji:"🏛️",desc:"Rektörlük idari ofisleri."},
  {num:14,name:"ÇSM Ofisler",        gps:[41.06725,28.94627],cats:["idari"],    emoji:"🏢",desc:"ÇSM üst kat – öğrenci kulüp ve ofisleri.",photo:"/buildings/csm-ofisler.jpg"},
  {num:36,name:"Öğrenci İşleri",     gps:[41.06709,28.94646],cats:["idari"],    emoji:"📋",desc:"Öğrenci İşleri Direktörlüğü – ÇSM Ofisler yanı, üst kat.",photo:"/buildings/ogrenci-isleri.jpg"},
  {num:45,name:"Uluslararası Merkez",gps:[41.06769,28.94670],cats:["idari"],    emoji:"🌍",desc:"Uluslararası Öğrenci Merkezi.",photo:"/buildings/uluslararasi.jpg"},
  {num:21,name:"EN-1",               gps:[41.06757,28.94543],cats:["idari"],    emoji:"🏢",desc:"EN-1 idari ve ofis binası."},
  {num:30,name:"ÖDM",                gps:[41.06536,28.94620],cats:["idari"],    emoji:"🤝",desc:"Öğrenci Destek Merkezi (ÖDM) – danışmanlık ve kariyer.",photo:"/buildings/odm.jpg"},
  {num:32,name:"BT",                 gps:[41.06589,28.94637],cats:["idari"],    emoji:"💻",desc:"Bilişim Teknolojileri birimi.",photo:"/buildings/bt.jpg"},
  {num:40,name:"Yapı Kredi",         gps:[41.06746,28.94560],cats:["işlevsel"], emoji:"🏦",desc:"Yapı Kredi bankacılık şubesi."},
  {num:46,name:"Yapı Kredi ATM",     gps:[41.06828,28.94469],cats:["işlevsel"], emoji:"🏧",desc:"Yapı Kredi ATM – kafeterya yanı.",photo:"/buildings/yapikredi-atm.jpg"},
  {num:47,name:"VakıfBank ATM",      gps:[41.06702,28.94539],cats:["işlevsel"], emoji:"🏧",desc:"VakıfBank ATM – güney kampüs.",photo:"/buildings/vakifbank-atm.jpg"},
  // ── Sosyal ────────────────────────────────────────────────────────────────
  {num:4, name:"Yemekhane",          gps:[41.06814,28.94451],cats:["sosyal"],   emoji:"🍽️",desc:"Kampüs ana yemekhanesi.",photo:"/buildings/yemekhane.jpg"},
  {num:5, name:"Nero",               gps:[41.06809,28.94477],cats:["sosyal"],   emoji:"☕",desc:"Caffè Nero kahve.",logo:"/buildings/nero-logo.png",photo:"/buildings/nero.jpg"},
  {num:38,name:"Starbucks",          gps:[41.06815,28.94466],cats:["sosyal"],   emoji:"☕",desc:"Starbucks Coffee – kampüs şubesi.",logo:"/buildings/starbucks-logo.png",logoSize:20,photo:"/buildings/starbucks.jpg"},
  {num:23,name:"Lokanta",            gps:[41.06701,28.94566],cats:["sosyal"],   emoji:"🍜",desc:"Sosyal Lokanta – Lokma."},
  {num:24,name:"Espressolab",        gps:[41.06692,28.94569],cats:["sosyal"],   emoji:"☕",desc:"Espressolab kahve.",photo:"/buildings/espressolab.jpg"},
  {num:39,name:"Sunpeak",            gps:[41.06807,28.94463],cats:["sosyal"],   emoji:"🌞",desc:"Sunpeak Coffee – kampüs yeni binası.",photo:"/buildings/sunpeak.jpg",logo:"/buildings/sunpeak-logo.png"},
  {num:15,name:"Enerji Müzesi",      gps:[41.06659,28.94666],cats:["sosyal"],   emoji:"⚡",desc:"santralistanbul Enerji Müzesi – halka açık.",photo:"/buildings/enerji-muzesi.jpg"},
  {num:27,name:"Etkinlik Çadırı",    gps:[41.06562,28.94564],cats:["sosyal"],   emoji:"⛺",desc:"Açık hava etkinlik çadırı alanı.",photo:"/buildings/etkinlik-cadiri.jpg"},
  {num:35,name:"Amfi",               gps:[41.06380,28.94560],cats:["sosyal"],   emoji:"🎭",desc:"Açık hava amfi tiyatrosu.",photo:"/buildings/amfi.jpg"},
  // ── İşlevsel ──────────────────────────────────────────────────────────────
  {num:28,name:"Kuluçka",            gps:[41.06501,28.94550],cats:["işlevsel"], emoji:"💡",desc:"BİLGİ Sosyal Kuluçka Merkezi – CARE konteyner.",photo:"/buildings/kulucka.jpg"},
  {num:29,name:"Revir",              gps:[41.06548,28.94629],cats:["işlevsel"], emoji:"🏥",desc:"Kampüs sağlık birimi.",photo:"/buildings/revir.jpg"},
  {num:42,name:"Kuaför",             gps:[41.06820,28.94466],cats:["işlevsel"], emoji:"✂️",desc:"Kampüs kuaför ve berber salonu – HairCraft.",logo:"/buildings/haircraft-logo.png",photo:"/buildings/haircraft.jpg"},
  {num:43,name:"Çalışma Alanı",      gps:[41.06809,28.94445],cats:["işlevsel"], emoji:"📖",desc:"Yemekhane arkasındaki öğrenci çalışma salonu.",photo:"/buildings/calisma-salonu.jpg"},
  // ── Otopark ───────────────────────────────────────────────────────────────
  {num:26,name:"Otopark",            gps:[41.06587,28.94494],cats:["otopark"],  emoji:"🅿️",desc:"Kampüs ana araç otoparkı – güney."},
  {num:34,name:"Otopark Girişi",     gps:[41.06471,28.94660],cats:["otopark"],  emoji:"🚗",desc:"Otopark araç giriş/çıkış noktası."},
  {num:44,name:"Arka Otopark",       gps:[41.06930,28.94449],cats:["otopark"],  emoji:"🅿️",desc:"Kampüs arka otopark – kuzey taraf."},
];

// ── İkonlar ───────────────────────────────────────────────────────────────────
function mkIcon(loc:Loc,isF:boolean,isT:boolean,showLabel:boolean):L.DivIcon{
  const col=isF?"#16a34a":isT?"#ef4444":(CAT[loc.cats[0]]?.c??"#3b82f6");
  if(!showLabel&&!loc.logo){
    return L.divIcon({
      html:`<div style="width:13px;height:13px;border-radius:50%;background:${col};border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.6);"></div>`,
      className:"",iconSize:[13,13],iconAnchor:[6,6],
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
  const bg=isF?"rgba(22,163,74,0.95)":isT?"rgba(239,68,68,0.95)":"rgba(15,23,42,0.88)";
  return L.divIcon({
    html:`<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="background:${bg};color:#fff;font-size:10px;font-weight:700;padding:3px 7px;border-radius:5px;white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px;box-shadow:0 2px 6px rgba(0,0,0,0.5);">${loc.name}</div>
      <div style="width:13px;height:13px;border-radius:50%;background:${col};border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.6);"></div>
    </div>`,
    className:"",iconSize:[90,32],iconAnchor:[45,30],
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
  const[showLabels,setShowLabels]=useState(true); // başlangıç zoom 17 >= 17

  // GPS
  const[userPos,setUserPos]=useState<[number,number]|null>(null);
  const[gpsOn,setGpsOn]=useState(false);
  const watchRef=useRef<number|null>(null);
  const[splash,setSplash]=useState<"visible"|"fading"|"hidden">("visible");
  const[userProfile,setUserProfile]=useState<UserProfile|null>(null);
  const[showWelcome,setShowWelcome]=useState(false);
  const[selectedLoc,setSelectedLoc]=useState<Loc|null>(null);
  const[wRole,setWRole]=useState<UserRole|null>(null);
  const[wName,setWName]=useState("");
  const[wEmail,setWEmail]=useState("");
  const[wExtra,setWExtra]=useState(""); // Öğretmen→fakülte, Personel→görev
  const[wKvkk,setWKvkk]=useState(false);
  const[heading,setHeading]=useState<number|null>(null);
  const prevPosRef=useRef<[number,number]|null>(null);
  const[onboardStep,setOnboardStep]=useState<number|null>(null);
  const[hlRect,setHlRect]=useState<DOMRect|null>(null);
  const[simSpeed,setSimSpeed]=useState(1);
  const simSpeedRef=useRef(1);
  const longPressTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const[gpsError,setGpsError]=useState<string|null>(null);

  // Onboarding: aktif adımın hedef elemanını bul, highlight rect hesapla
  useEffect(()=>{
    if(onboardStep===null){setHlRect(null);return;}
    const t=ONBOARD_STEPS[onboardStep].target;
    if(!t){setHlRect(null);return;}
    const el=document.getElementById(t);
    if(el)setHlRect(el.getBoundingClientRect());
    else setHlRect(null);
  },[onboardStep]);

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
    setSheetTranslate(0); // alt panel açık kalsın
  },[]);

  // Splash ekranı: 1.8s görünür, sonra fade-out; kapanınca kullanıcı kaydı kontrol edilir
  useEffect(()=>{
    const t1=setTimeout(()=>setSplash("fading"),2800);
    const t2=setTimeout(()=>{
      setSplash("hidden");
      const stored=localStorage.getItem("karpuza_user");
      if(stored){
        const p:UserProfile=JSON.parse(stored);
        // Eski profilde e-posta yoksa yeniden bilgi al
        if(p.role!=="Misafir"&&!p.email){
          setWRole(p.role);setWName(p.name);setShowWelcome(true);
        } else {
          setUserProfile(p);
          // Her oturumda ziyaret kaydı gönder
          if(SHEET_URL){
            fetch(SHEET_URL,{method:"POST",mode:"no-cors",
              headers:{"Content-Type":"application/json"},
              body:JSON.stringify({type:"ziyaret",ts:new Date().toLocaleString("tr-TR"),
                name:p.name,role:p.role,email:p.email||"-",token:SHEET_TOKEN})
            }).catch(()=>{});
          }
        }
      } else {setShowWelcome(true);}
    },3700);
    return()=>{clearTimeout(t1);clearTimeout(t2);};
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
      setGpsOn(false);setUserPos(null);setGpsError(null);
    } else {
      if(!navigator.geolocation){setGpsError("Bu tarayıcı konum desteklemiyor.");return;}
      setGpsOn(true);setGpsError(null);
      watchRef.current=navigator.geolocation.watchPosition(
        p=>{setUserPos([p.coords.latitude,p.coords.longitude]);setGpsError(null);},
        (err)=>{
          setGpsOn(false);
          if(err.code===1)
            setGpsError("Konum izni verilmedi. iPhone'da: Ayarlar → Safari → Konum → İzin Ver");
          else if(err.code===2)
            setGpsError("Konum alınamadı. Açık alanda tekrar deneyin.");
          else
            setGpsError("Konum zaman aşımına uğradı. Tekrar deneyin.");
        },
        {enableHighAccuracy:true,maximumAge:5000,timeout:15000}
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
    const TICK=50;
    let trav=0;
    setSimSpeed(1);simSpeedRef.current=1;
    setSimPos(r[0]);setSimPct(0);setMode('sim');
    simRef.current=setInterval(()=>{
      const step=(83/60)*(TICK/1000)*8*simSpeedRef.current;
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
  const submitWelcome=useCallback(()=>{
    if(!wRole||!wName.trim()||!wEmail.trim()||!wKvkk)return;
    const profile:UserProfile={
      name:wName.trim(), role:wRole,
      email: wEmail.trim().toLowerCase()||"-",
      faculty:  wRole==="Öğretmen"&&wExtra.trim() ? wExtra.trim() : undefined,
      position: wRole==="Personel"&&wExtra.trim() ? wExtra.trim() : undefined,
      ts:Date.now()
    };
    localStorage.setItem("karpuza_user",JSON.stringify(profile));
    setUserProfile(profile); setShowWelcome(false);
    if(!localStorage.getItem("karpuza_onboard"))setOnboardStep(0);
    if(SHEET_URL){
      fetch(SHEET_URL,{method:"POST",mode:"no-cors",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({type:"kayıt",ts:new Date(profile.ts).toLocaleString("tr-TR"),
          name:profile.name,role:profile.role,email:profile.email||"-",
          extra:wExtra.trim()||"-",token:SHEET_TOKEN})
      }).catch(()=>{});
    }
  },[wRole,wName,wEmail,wExtra,wKvkk]);

  const handlePinClick=useCallback((loc:Loc)=>{
    if(mode==='pickFrom'){setFrom(loc);setFromGPS(false);setMode('pickTo');return;}
    if(mode==='pickTo'){
      setTo(loc);
      const fLa=fromGPS&&userPos?userPos[0]:from?.gps[0]??0;
      const fLo=fromGPS&&userPos?userPos[1]:from?.gps[1]??0;
      calcRoute(fLa,fLo,loc);
      return;
    }
    // Diğer tüm modlarda (idle, ready, sim, nav, arrived) bina modalı aç
    setSelectedLoc(loc);
  },[mode,from,fromGPS,userPos,calcRoute]);

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
    (!search||l.name.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR")))&&
    (!cat||l.cats.includes(cat))
  ),[search,cat]);
  const mapVisible=useMemo(()=>visible.filter(l=>!l.hidden),[visible]);

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


      {/* ─── Splash ekranı ─────────────────────────────────────────────── */}
      {splash!=="hidden"&&(
        <div style={{position:"fixed",inset:0,zIndex:9999,
          background:"#0c1828",
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          opacity:splash==="fading"?0:1,
          transition:"opacity 0.75s ease",
          pointerEvents:splash==="fading"?"none":"auto"}}>
          <img src="/karpuza-sor.png" alt="Karpuza Sor"
            style={{height:"50vh",width:"auto",maxWidth:"82vw",
              objectFit:"contain",borderRadius:24,
              boxShadow:"0 12px 48px rgba(0,0,0,0.7)"}}/>
          <div style={{marginTop:28,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <img src="/bilgi-logotype.png" alt="İstanbul Bilgi Üniversitesi"
              style={{height:36,width:"auto",maxWidth:"72vw",objectFit:"contain",opacity:.95}}/>
            <div style={{color:"rgba(255,255,255,0.50)",fontSize:12,letterSpacing:.6}}>
              santralistanbul Kampüsü
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

      {/* ─── Kayıt ekranı – tek sayfa ──────────────────────────────────── */}
      {showWelcome&&(
        <div style={{position:"fixed",inset:0,zIndex:9998,background:"#0c1828",
          overflowY:"auto",display:"flex",flexDirection:"column",alignItems:"center",
          padding:"32px 24px 40px"}}>

          {/* Karpuz logosu – büyük */}
          <img src="/karpuza-sor.png" alt="Karpuza Sor"
            style={{height:160,width:"auto",objectFit:"contain",borderRadius:20,
              boxShadow:"0 12px 40px rgba(0,0,0,0.7)",marginBottom:16}}/>

          {/* Karpuz tanıtımı */}
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{color:"#fff",fontWeight:800,fontSize:20,marginBottom:6}}>
              Merhaba! Ben Karpuz 🐾
            </div>
            <div style={{color:"rgba(255,255,255,0.6)",fontSize:13,lineHeight:1.6,maxWidth:300}}>
              santralistanbul'da doğru yeri bulman için buradayım.
              Birkaç bilgi gir, hemen başlayalım!
            </div>
          </div>

          <div style={{width:"100%",maxWidth:340,display:"flex",flexDirection:"column",gap:10}}>

            {/* Ad Soyad */}
            <input value={wName} onChange={e=>setWName(e.target.value)}
              placeholder="Adınız Soyadınız"
              style={{width:"100%",padding:"13px 16px",borderRadius:12,boxSizing:"border-box",
                border:"1.5px solid rgba(255,255,255,0.2)",
                background:"rgba(255,255,255,0.08)",color:"#fff",fontSize:15,outline:"none"}}/>

            {/* E-posta (opsiyonel) */}
            <input value={wEmail} onChange={e=>setWEmail(e.target.value)}
              placeholder="E-posta adresiniz (zorunlu)"
              type="email" inputMode="email" autoCapitalize="none"
              style={{width:"100%",padding:"13px 16px",borderRadius:12,boxSizing:"border-box",
                border:"1.5px solid rgba(255,255,255,0.2)",
                background:"rgba(255,255,255,0.08)",color:"#fff",fontSize:15,outline:"none"}}/>

            {/* Rol seçimi – aynı ekranda kalır */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:2}}>
              {(["Öğrenci","Öğretmen","Personel","Misafir"] as UserRole[]).map(r=>(
                <button key={r} onClick={()=>{setWRole(r);setWExtra("");}}
                  style={{padding:"12px 8px",borderRadius:12,
                    border:`2px solid ${wRole===r?"#3b82f6":"rgba(255,255,255,0.12)"}`,
                    background:wRole===r?"rgba(59,130,246,0.2)":"rgba(255,255,255,0.06)",
                    color:wRole===r?"#93c5fd":"rgba(255,255,255,0.7)",
                    fontSize:14,fontWeight:wRole===r?700:500,cursor:"pointer"}}>
                  {r==="Öğrenci"?"🎓 Öğrenci":r==="Öğretmen"?"👨‍🏫 Öğretmen":r==="Personel"?"🏢 Personel":"🙋 Misafir"}
                </button>
              ))}
            </div>

            {/* Ek bilgi – rol seçilince belirir */}
            {wRole==="Öğretmen"&&(
              <input value={wExtra} onChange={e=>setWExtra(e.target.value)}
                placeholder="Fakülteniz (örn: Mühendislik)"
                style={{width:"100%",padding:"13px 16px",borderRadius:12,boxSizing:"border-box",
                  border:"1.5px solid rgba(255,255,255,0.2)",
                  background:"rgba(255,255,255,0.08)",color:"#fff",fontSize:15,outline:"none"}}/>
            )}
            {wRole==="Personel"&&(
              <input value={wExtra} onChange={e=>setWExtra(e.target.value)}
                placeholder="Göreviniz (örn: Uzman, Sekreter)"
                style={{width:"100%",padding:"13px 16px",borderRadius:12,boxSizing:"border-box",
                  border:"1.5px solid rgba(255,255,255,0.2)",
                  background:"rgba(255,255,255,0.08)",color:"#fff",fontSize:15,outline:"none"}}/>
            )}

            {/* KVKK – inline, modal yok */}
            <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",marginTop:4}}>
              <input type="checkbox" checked={wKvkk} onChange={e=>setWKvkk(e.target.checked)}
                style={{marginTop:3,width:16,height:16,accentColor:"#3b82f6",flexShrink:0,cursor:"pointer"}}/>
              <span style={{color:"rgba(255,255,255,0.5)",fontSize:10,lineHeight:1.6}}>
                Girdiğim bilgilerin yalnızca kampüs navigasyon uygulamasının kullanım
                istatistiklerini ölçmek amacıyla İstanbul Bilgi Üniversitesi tarafından
                işlenmesine <strong style={{color:"rgba(255,255,255,0.7)"}}>KVKK</strong> kapsamında onay veriyorum.
              </span>
            </label>

            {/* Giriş butonu */}
            {(()=>{const ok=!!(wName.trim()&&wEmail.trim()&&wRole&&wKvkk);return(
              <button onClick={submitWelcome} disabled={!ok}
                style={{padding:"15px",borderRadius:14,border:"none",marginTop:4,
                  background:ok?"linear-gradient(135deg,#1d4ed8,#2563eb)":"rgba(255,255,255,0.08)",
                  color:ok?"#fff":"rgba(255,255,255,0.25)",
                  fontSize:16,fontWeight:700,cursor:ok?"pointer":"default",
                  boxShadow:ok?"0 4px 20px rgba(37,99,235,0.4)":"none"}}>
                Haritaya Gir →
              </button>
            );})()}
          </div>

          {/* BİLGİ logotype alt */}
          <div style={{marginTop:28,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <img src="/bilgi-logotype.png" alt="BİLGİ"
              style={{height:22,width:"auto",maxWidth:"60vw",objectFit:"contain",opacity:.5}}/>
            <div style={{color:"rgba(255,255,255,0.25)",fontSize:10,letterSpacing:.4}}>
              santralistanbul Kampüsü
            </div>
          </div>
        </div>
      )}

      {/* ─── Harita ─────────────────────────────────────────────────────── */}
      <div style={{position:"absolute",inset:0,zIndex:1}}>
        <MapContainer center={CAMPUS_CENTER} zoom={17}
          style={{height:"100%",width:"100%"}} minZoom={13} maxZoom={19}
          zoomControl={false}
          {...({rotate:true,touchRotate:true} as object)}>
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
          {/* Gerçek GPS – simülasyonda gizle */}
          {userPos&&mode!=='sim'&&<Marker position={userPos} icon={PERSON} zIndexOffset={2900}/>}
          {mapVisible.map(loc=>{
            const iF=fromGPS?false:from?.num===loc.num,iT=to?.num===loc.num;
            const showLabel=showLabels||iF||iT;
            return(
              <Marker key={loc.num} position={loc.gps} icon={mkIcon(loc,iF,iT,showLabel)}
                zIndexOffset={(iF||iT)?1000:0}
                eventHandlers={{click:()=>handlePinClick(loc)}}>
              </Marker>
            );
          })}
          <FitMap/>
          <FitOnCat cat={cat} locs={LOCS}/>
          <ZoomCtrl/>
          <ZoomWatcher setShowLabels={setShowLabels}/>
          <CenterCtrl userPos={userPos}/>
          <MapFollower pos={mode==='nav'?userPos:mode==='sim'?simPos:null} active={mode==='nav'||mode==='sim'}/>
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
            {selectedLoc.photo?(
              <div style={{position:"relative",borderRadius:"20px 20px 0 0",overflow:"hidden"}}>
                <img src={selectedLoc.photo} alt={selectedLoc.name}
                  style={{width:"100%",height:170,objectFit:"cover",display:"block"}}/>
                <div style={{position:"absolute",bottom:0,left:0,right:0,
                  background:"linear-gradient(transparent,rgba(0,0,0,0.75))",
                  padding:"24px 16px 14px"}}>
                  <div style={{fontWeight:800,fontSize:18,color:"#fff"}}>{selectedLoc.name}</div>
                  {ROOMS[String(selectedLoc.num)]&&(
                    <div style={{fontSize:11,color:"rgba(255,255,255,0.75)",marginTop:2}}>
                      {Object.values(ROOMS[String(selectedLoc.num)]).reduce((s,a)=>s+a.length,0)} mahal
                    </div>
                  )}
                </div>
                <button onClick={()=>setSelectedLoc(null)}
                  style={{position:"absolute",top:10,right:10,width:32,height:32,
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
                  <div style={{fontWeight:800,fontSize:18,color:"#fff"}}>{selectedLoc.name}</div>
                  {ROOMS[String(selectedLoc.num)]&&(
                    <div style={{fontSize:11,color:"rgba(255,255,255,0.75)",marginTop:2}}>
                      {Object.values(ROOMS[String(selectedLoc.num)]).reduce((s,a)=>s+a.length,0)} mahal
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
                {selectedLoc.desc}
              </p>

              {/* Mahal listesi */}
              {ROOMS[String(selectedLoc.num)]&&(
                <div style={{borderTop:"1px solid #e2e8f0",paddingTop:12,marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",
                    letterSpacing:"0.06em",marginBottom:8}}>MAHAL LİSTESİ</div>
                  <div style={{maxHeight:180,overflowY:"auto",fontSize:12,lineHeight:1.5}}>
                    {Object.entries(ROOMS[String(selectedLoc.num)]).map(([floor,rooms])=>(
                      <div key={floor} style={{marginBottom:10}}>
                        <div style={{fontWeight:700,color:"#1e293b",fontSize:11,
                          background:"#f1f5f9",padding:"3px 8px",borderRadius:6,marginBottom:4}}>
                          {floor}
                        </div>
                        {(rooms as RoomEntry[]).map((r,i)=>(
                          <div key={i} style={{display:"flex",gap:6,alignItems:"baseline",
                            padding:"3px 6px",borderBottom:"1px solid #f8fafc"}}>
                            <span style={{color:"#1e293b",fontWeight:700,minWidth:48,flexShrink:0,fontSize:12}}>{r.oda}</span>
                            <span style={{color:"#475569",flex:1,overflow:"hidden",
                              textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12}}>{r.label}</span>
                            {r.cap&&<span style={{color:"#94a3b8",flexShrink:0,fontSize:11}}>{r.cap}👤</span>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Aksiyon butonları */}
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>{stopSim();setFrom(selectedLoc);setFromGPS(false);setMode('pickTo');setSelectedLoc(null);}}
                  style={{...BTN,flex:1,background:"#16a34a",color:"#fff",
                    fontSize:14,padding:"12px 0",borderRadius:12}}>
                  🟢 Buradan Başla
                </button>
                <button onClick={()=>{stopSim();setTo(selectedLoc);
                  if(gpsOn&&userPos){setFromGPS(true);calcRoute(userPos[0],userPos[1],selectedLoc);}
                  else{setFrom(null);setFromGPS(false);setMode('pickFrom');}
                  setSelectedLoc(null);}}
                  style={{...BTN,flex:1,background:"#ef4444",color:"#fff",
                    fontSize:14,padding:"12px 0",borderRadius:12}}>
                  🔴 Buraya Git
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Seçim modu – merkezi yüzen kart ───────────────────────────── */}
      {(mode==='pickFrom'||mode==='pickTo')&&(
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
          zIndex:20,display:"flex",alignItems:"center",gap:8,
          background:mode==='pickFrom'?"#16a34a":"#ef4444",
          borderRadius:50,padding:"10px 14px 10px 16px",
          boxShadow:"0 6px 24px rgba(0,0,0,0.45)",
          whiteSpace:"nowrap",animation:"onboard-fadein 0.25s ease"}}>
          <span style={{fontSize:18}}>{mode==='pickFrom'?"🟢":"🔴"}</span>
          <span style={{color:"#fff",fontWeight:700,fontSize:14}}>
            {mode==='pickFrom'?"Başlangıç noktasını seç":"Varış noktasını seç"}
          </span>
          {mode==='pickFrom'&&gpsOn&&userPos&&(
            <button onClick={()=>{setFromGPS(true);setMode('pickTo');}}
              style={{...BTN,background:"rgba(255,255,255,0.25)",color:"#fff",
                fontSize:12,padding:"4px 12px",minHeight:30,borderRadius:30}}>
              📍 GPS
            </button>
          )}
          <button onClick={reset}
            style={{...BTN,background:"rgba(0,0,0,0.18)",color:"#fff",
              minHeight:30,width:30,borderRadius:"50%",fontSize:16,padding:0,flexShrink:0}}>
            ✕
          </button>
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
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <button onClick={()=>{const n=simSpeed===1?2:simSpeed===2?4:1;setSimSpeed(n);simSpeedRef.current=n;}}
                  style={{...BTN,background:"rgba(0,0,0,0.3)",color:"#fff",
                    minHeight:36,padding:"0 11px",borderRadius:8,fontSize:13,fontWeight:800}}>
                  {simSpeed}×
                </button>
                <button onClick={()=>{stopSim();setMode('ready');}}
                  style={{...BTN,background:"rgba(0,0,0,0.25)",color:"#fff",
                    minHeight:40,width:40,borderRadius:"50%",fontSize:18,padding:0}}>■</button>
              </div>
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
            {nearbyBldg.photo?(
              <img src={nearbyBldg.photo} alt={nearbyBldg.name}
                style={{width:42,height:42,borderRadius:8,objectFit:"cover",flexShrink:0}}/>
            ):(
              <span style={{fontSize:22}}>{nearbyBldg.emoji}</span>
            )}
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
          background:"linear-gradient(135deg,#154360,#1a6fa8)",
          padding:"7px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",
          boxShadow:"0 2px 12px rgba(0,0,0,0.5)"}}>
          {/* Sol: BİLGİ logotype + kullanıcı selamı – tıklayınca yenile */}
          <div onClick={()=>window.location.reload()}
            style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:3,flexShrink:0,cursor:"pointer"}}>
            <img src="/bilgi-logotype.png" alt="İstanbul Bilgi Üniversitesi"
              style={{height:30,width:"auto",maxWidth:140,objectFit:"contain",opacity:1}}/>
            <div style={{color:"rgba(255,255,255,0.75)",fontSize:9.5,letterSpacing:.4,lineHeight:1,paddingLeft:2}}>
              {userProfile?`Merhaba, ${userProfile.name.split(" ")[0]}! 👋`:"santralistanbul Kampüsü"}
            </div>
          </div>
          {/* Orta: Karpuza logo ortalı — uzun basış turu yeniden başlatır */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <img src="/karpuza-sor.png" alt="Karpuza Sor"
              style={{height:58,width:"auto",objectFit:"contain",borderRadius:8,
                boxShadow:"0 2px 10px rgba(0,0,0,0.45)"}}
              onTouchStart={handleLogoPress}
              onTouchEnd={handleLogoRelease}
              onMouseDown={handleLogoPress}
              onMouseUp={handleLogoRelease}
              onContextMenu={e=>e.preventDefault()}
              draggable={false}/>
          </div>
          {/* Sağ: Konum butonu */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
            <button id="gps-btn" onClick={toggleGPS} style={{...BTN,
              background:gpsError?"rgba(239,68,68,0.35)":gpsOn?"rgba(59,130,246,0.35)":"rgba(255,255,255,0.15)",
              border:`1px solid ${gpsError?"#ef4444":gpsOn?"#3b82f6":"rgba(255,255,255,0.3)"}`,
              color:"#fff",minHeight:36,padding:"0 12px",fontSize:12,borderRadius:8,gap:4}}>
              {gpsError?"⚠️ Hata":gpsOn?"📍 Aktif":"📍 Konum"}
            </button>
            {gpsError&&(
              <div style={{background:"rgba(239,68,68,0.92)",color:"#fff",fontSize:10,
                padding:"5px 8px",borderRadius:6,maxWidth:180,lineHeight:1.4,textAlign:"right",
                boxShadow:"0 2px 8px rgba(0,0,0,0.4)"}}
                onClick={()=>setGpsError(null)}>
                {gpsError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Sağ araç çubuğu: zoom + pusula + konuma git ──────────────────── */}
      <div style={{position:"absolute",right:12,top:82,zIndex:10,display:"flex",flexDirection:"column",gap:4}}>
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
        onTouchStart={e=>{if(onboardStep!==null)return;touchStartY.current=e.touches[0].clientY;}}
        onTouchMove={e=>{
          if(onboardStep!==null)return;
          const dy=e.touches[0].clientY-touchStartY.current;
          if(dy>0)setSheetTranslate(dy);
        }}
        onTouchEnd={()=>{
          if(onboardStep!==null)return;
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
              <input id="search-input" value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Bina ara…"
                style={{flex:1,background:"#0f172a",border:"1px solid #334155",borderRadius:10,
                  padding:"11px 14px",color:"#fff",fontSize:14,outline:"none",minHeight:44}}/>
              <button id="route-btn" onClick={()=>{
                (document.activeElement as HTMLElement)?.blur();
                if(gpsOn&&userPos){setFromGPS(true);setMode('pickTo');}
                else setMode('pickFrom');
              }}
                style={{...BTN,background:"#16a34a",color:"#fff",padding:"0 16px",fontSize:13,borderRadius:10}}>
                🗺 Yol Tarifi
              </button>
            </div>
          )}

          {/* PICKTО: Varış noktası arama listesi */}
          {mode==='pickTo'&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Nereye gitmek istiyorsun?"
                autoFocus
                style={{flex:1,background:"#0f172a",border:"1px solid #ef4444",borderRadius:10,
                  padding:"11px 14px",color:"#fff",fontSize:14,outline:"none",minHeight:44}}/>
              <div style={{maxHeight:180,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}}>
                {visible.slice(0,10).map(loc=>(
                  <button key={loc.num} onClick={()=>handlePinClick(loc)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
                      background:"#0f172a",border:"none",borderRadius:8,cursor:"pointer",
                      color:"#fff",textAlign:"left",width:"100%"}}>
                    <span style={{fontSize:18,flexShrink:0}}>{loc.emoji}</span>
                    <span style={{fontSize:14,fontWeight:600,flex:1}}>{loc.name}</span>
                    <span style={{color:"#ef4444",fontSize:12,flexShrink:0}}>Buraya Git →</span>
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
            <div id="cat-row" style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4} as React.CSSProperties}>
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

      {/* ─── Onboarding turu ─────────────────────────────────────────────── */}
      {onboardStep!==null&&(
        <>
          {/* Highlight halkası */}
          {hlRect&&(
            <div style={{position:"fixed",
              left:hlRect.left-8,top:hlRect.top-8,
              width:hlRect.width+16,height:hlRect.height+16,
              borderRadius:14,border:"3px solid #f97316",
              animation:"onboard-glow 1.4s ease-in-out infinite",
              zIndex:9991,pointerEvents:"none"}}/>
          )}
          {/* Konuşma balonu – alt panel elemanlarında üste çık */}
          {(()=>{
            const bottomTargets=["search-input","cat-row","route-btn"];
            const atTop=onboardStep!==null&&ONBOARD_STEPS[onboardStep].target!==null&&bottomTargets.includes(ONBOARD_STEPS[onboardStep].target!);
            return(
          <div style={{position:"fixed",...(atTop?{top:64,bottom:"auto",borderRadius:"0 0 20px 20px",boxShadow:"0 4px 32px rgba(0,0,0,0.7)"}:{bottom:0,borderRadius:"20px 20px 0 0",boxShadow:"0 -4px 32px rgba(0,0,0,0.7)"}),
            left:0,right:0,zIndex:9992,
            background:"#0c1828",
            padding:"16px 18px 24px",
            display:"flex",gap:14,alignItems:"flex-start",
            animation:"onboard-fadein 0.3s ease"}}>
            <img src="/karpuza-sor.png" alt="Karpuza"
              style={{width:58,height:58,borderRadius:10,objectFit:"cover",flexShrink:0,
                boxShadow:"0 2px 8px rgba(0,0,0,0.5)"}}/>
            <div style={{flex:1}}>
              <div style={{color:"#fff",fontSize:15,fontWeight:600,lineHeight:1.55,
                marginBottom:14,whiteSpace:"pre-line"}}>
                {ONBOARD_STEPS[onboardStep].text}
              </div>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <button onClick={advanceOnboard}
                  style={{background:"#c41230",color:"#fff",border:"none",
                    borderRadius:10,padding:"10px 22px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                  {onboardStep===ONBOARD_STEPS.length-1?"Haydi Başla! 🍉":"İleri →"}
                </button>
                {onboardStep<ONBOARD_STEPS.length-1&&(
                  <button onClick={()=>{localStorage.setItem("karpuza_onboard","1");setOnboardStep(null);}}
                    style={{background:"transparent",color:"rgba(255,255,255,0.38)",border:"none",
                      fontSize:13,cursor:"pointer",padding:"10px 0"}}>Atla</button>
                )}
                <div style={{marginLeft:"auto",color:"rgba(255,255,255,0.25)",fontSize:12}}>
                  {onboardStep+1}/{ONBOARD_STEPS.length}
                </div>
              </div>
            </div>
          </div>
          );})()}
        </>
      )}
    </div>
  );
}
