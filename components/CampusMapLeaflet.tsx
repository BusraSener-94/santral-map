"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  MapContainer, TileLayer, Marker, Popup, Polyline, useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ── Kampüs sabitleri ──────────────────────────────────────────────────────────
const CAMPUS_CENTER: [number, number] = [41.0673, 28.9455];
const CAMPUS_BOUNDS: [[number,number],[number,number]] = [[41.062, 28.936], [41.073, 28.952]];
const SIM_SPEED = 8;

// ── Yardımcı matematik ────────────────────────────────────────────────────────
function hav(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function distM(pts: [number,number][]): number {
  let d=0;for(let i=1;i<pts.length;i++) d+=hav(pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1]);return Math.round(d);
}
function brng(lat1:number,lon1:number,lat2:number,lon2:number):number{
  const dLon=(lon2-lon1)*Math.PI/180;
  const y=Math.sin(dLon)*Math.cos(lat2*Math.PI/180);
  const x=Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180)-Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos(dLon);
  return(Math.atan2(y,x)*180/Math.PI+360)%360;
}
function brngArrow(b:number):string{
  return["↑","↗","→","↘","↓","↙","←","↖"][Math.round(b/45)%8];
}

// RDP yol basitleştirme
function perpDist(pt:[number,number],a:[number,number],b:[number,number]):number{
  const mx=(lat:number,lon:number)=>[lon*111000*Math.cos(lat*Math.PI/180),lat*111000] as [number,number];
  const[px,py]=mx(pt[0],pt[1]),[ax,ay]=mx(a[0],a[1]),[bx,by]=mx(b[0],b[1]);
  const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy;
  if(len2===0)return Math.sqrt((px-ax)**2+(py-ay)**2);
  const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len2));
  return Math.sqrt((px-(ax+t*dx))**2+(py-(ay+t*dy))**2);
}
function rdp(pts:[number,number][],eps:number):[number,number][]{
  if(pts.length<=2)return pts;
  let maxD=0,maxI=0;
  for(let i=1;i<pts.length-1;i++){const d=perpDist(pts[i],pts[0],pts[pts.length-1]);if(d>maxD){maxD=d;maxI=i;}}
  if(maxD>eps){const l=rdp(pts.slice(0,maxI+1),eps),r=rdp(pts.slice(maxI),eps);return[...l.slice(0,-1),...r];}
  return[pts[0],pts[pts.length-1]];
}

// Adım adım tarif
interface Step{text:string;arrow:string;dist:number;}
function generateSteps(route:[number,number][]):Step[]{
  const s=rdp(route,8);if(s.length<2)return[];
  const steps:Step[]=[];
  const b0=brng(s[0][0],s[0][1],s[1][0],s[1][1]);
  const dirs=["Kuzeye","Kuzeydoğuya","Doğuya","Güneydoğuya","Güneye","Güneybatıya","Batıya","Kuzeybatıya"];
  steps.push({text:`${dirs[Math.round(b0/45)%8]} doğru yürüyün`,arrow:brngArrow(b0),dist:0});
  let prevB=b0;
  for(let i=1;i<s.length-1;i++){
    const d=Math.round(hav(s[i-1][0],s[i-1][1],s[i][0],s[i][1]));
    const newB=brng(s[i][0],s[i][1],s[i+1][0],s[i+1][1]);
    let diff=newB-prevB;while(diff>180)diff-=360;while(diff<-180)diff+=360;
    if(Math.abs(diff)>35){
      steps.push({text:`${d}m sonra ${diff<0?"sola dön":"sağa dön"}`,arrow:diff<0?"↰":"↱",dist:d});
      prevB=newB;
    }
  }
  steps.push({text:"Hedefe ulaştınız",arrow:"📍",dist:Math.round(hav(s[s.length-2][0],s[s.length-2][1],s[s.length-1][0],s[s.length-1][1]))});
  return steps;
}

// ── Graf ─────────────────────────────────────────────────────────────────────
interface GraphData{nodes:[number,number][];edges:[number,number][];}
function buildAdj(g:GraphData):[number,number][][]{
  const N=g.nodes.length,adj:[number,number][][]=Array.from({length:N},()=>[]);
  for(const[a,b]of g.edges){const w=hav(g.nodes[a][0],g.nodes[a][1],g.nodes[b][0],g.nodes[b][1]);adj[a].push([b,w]);adj[b].push([a,w]);}
  return adj;
}
function dijkstra(g:GraphData,adj:[number,number][][],fLat:number,fLng:number,tLat:number,tLng:number):[number,number][]{
  const{nodes}=g,N=nodes.length;
  let fI=0,tI=0,fD=Infinity,tD=Infinity;
  for(let i=0;i<N;i++){
    const fd=hav(fLat,fLng,nodes[i][0],nodes[i][1]),td=hav(tLat,tLng,nodes[i][0],nodes[i][1]);
    if(fd<fD){fD=fd;fI=i;}if(td<tD){tD=td;tI=i;}
  }
  const dist=new Float64Array(N).fill(Infinity),prev=new Int32Array(N).fill(-1),inQ=new Uint8Array(N).fill(1);
  dist[fI]=0;
  while(true){
    let u=-1,uD=Infinity;for(let i=0;i<N;i++)if(inQ[i]&&dist[i]<uD){uD=dist[i];u=i;}
    if(u===-1||dist[u]===Infinity||u===tI)break;inQ[u]=0;
    for(const[v,w]of adj[u]){if(!inQ[v])continue;const nd=dist[u]+w;if(nd<dist[v]){dist[v]=nd;prev[v]=u;}}
  }
  const path:number[]=[]; let c=tI;
  while(c!==-1&&path.length<=N){path.unshift(c);if(c===fI)break;c=prev[c];}
  if(path.length>=2&&path[0]===fI)
    return[[fLat,fLng],...path.map(i=>nodes[i] as[number,number]),[tLat,tLng]];
  return[[fLat,fLng],[tLat,tLng]];
}

function FitMap(){const map=useMap();useEffect(()=>{map.fitBounds(CAMPUS_BOUNDS,{padding:[20,20],animate:false});},[map]);return null;}

// ── Veri tipleri ─────────────────────────────────────────────────────────────
interface Loc{num:number;name:string;gps:[number,number];cats:string[];desc:string;}
const CAT:Record<string,{color:string;label:string}>={
  eğitsel:{color:"#3b82f6",label:"Eğitsel"},sosyal:{color:"#f59e0b",label:"Sosyal"},
  idari:{color:"#8b5cf6",label:"İdari"},işlevsel:{color:"#10b981",label:"İşlevsel"},
  otopark:{color:"#6b7280",label:"Otopark"},giriş:{color:"#ef4444",label:"Giriş"},
};
const LOCS:Loc[]=[
  {num:1,  name:"Cami Tarafı Giriş",  gps:[41.06930,28.94418],cats:["giriş"],          desc:"Cami tarafındaki kampüs kuzey giriş kapısı."},
  {num:2,  name:"E1",                 gps:[41.06884,28.94474],cats:["eğitsel"],         desc:"E1 mühendislik ve enerji binası."},
  {num:3,  name:"E2",                 gps:[41.06959,28.94568],cats:["eğitsel"],         desc:"E2 mühendislik binası."},
  {num:4,  name:"Yemekhane",          gps:[41.06823,28.94445],cats:["sosyal"],          desc:"Kampüs ana yemekhanesi."},
  {num:5,  name:"Nero",               gps:[41.06812,28.94473],cats:["sosyal"],          desc:"Caffè Nero kahve."},
  {num:6,  name:"Kafeler Alanı",      gps:[41.06818,28.94455],cats:["sosyal"],          desc:"Çeşitli kafeler ve sosyal alan."},
  {num:7,  name:"L1",                 gps:[41.06909,28.94553],cats:["eğitsel"],         desc:"L1 Enerji binası."},
  {num:8,  name:"L2",                 gps:[41.06861,28.94553],cats:["eğitsel","idari"], desc:"L2 binası."},
  {num:9,  name:"L3",                 gps:[41.06906,28.94581],cats:["eğitsel"],         desc:"L3 Enerji binası."},
  {num:10, name:"Rektörlük",          gps:[41.06833,28.94617],cats:["idari"],           desc:"Rektörlük binası."},
  {num:11, name:"E3",                 gps:[41.06807,28.94656],cats:["eğitsel"],         desc:"E3 akademik binası."},
  {num:12, name:"E4",                 gps:[41.06729,28.94669],cats:["eğitsel"],         desc:"E4 akademik binası."},
  {num:13, name:"ÇSM Ofisler",        gps:[41.06769,28.94671],cats:["idari"],           desc:"Çalışma ve Sosyal Merkezi ofisleri."},
  {num:14, name:"ÇSM Sınıflar",       gps:[41.06750,28.94655],cats:["eğitsel"],         desc:"ÇSM sınıfları."},
  {num:15, name:"Enerji Müzesi",      gps:[41.06659,28.94666],cats:["sosyal"],          desc:"santralistanbul Enerji Müzesi."},
  {num:16, name:"KD4 Mimarlık",       gps:[41.06630,28.94616],cats:["eğitsel"],         desc:"Mimarlık dijital fabrikasyon stüdyosu."},
  {num:17, name:"Seyfi Arıkan",       gps:[41.06689,28.94692],cats:["eğitsel"],         desc:"Seyfi Arkan konferans salonu."},
  {num:18, name:"E5",                 gps:[41.06610,28.94660],cats:["eğitsel"],         desc:"E5 akademik binası."},
  {num:19, name:"E6",                 gps:[41.06600,28.94680],cats:["eğitsel"],         desc:"E6 akademik binası."},
  {num:20, name:"Kütüphane",          gps:[41.06629,28.94618],cats:["eğitsel","sosyal"],desc:"Mehmet Kenan Tekdağ Kütüphanesi."},
  {num:21, name:"EN-1",               gps:[41.06720,28.94548],cats:["idari"],           desc:"EN-1 idari ve ofis binası."},
  {num:22, name:"MIDL",               gps:[41.06740,28.94640],cats:["sosyal"],          desc:"Medya ve İletişim Tasarım Lab."},
  {num:23, name:"Lokma",              gps:[41.06701,28.94566],cats:["sosyal"],          desc:"Sosyal Lokanta – Lokma."},
  {num:24, name:"Espressolab",        gps:[41.06692,28.94569],cats:["sosyal"],          desc:"Espressolab kahve."},
  {num:25, name:"Ziyaretçi Girişi",   gps:[41.06668,28.94535],cats:["giriş"],          desc:"Ana ziyaretçi ve öğrenci girişi."},
  {num:26, name:"Otopark",            gps:[41.06650,28.94180],cats:["otopark"],         desc:"Kampüs araç otoparkı."},
  {num:27, name:"Etkinlik Çadırı",    gps:[41.06561,28.94565],cats:["sosyal"],          desc:"Açık hava etkinlik çadırı."},
  {num:28, name:"Kuluçka",            gps:[41.06505,28.94554],cats:["işlevsel"],        desc:"BİLGİ Sosyal Kuluçka Merkezi."},
  {num:29, name:"Revir",              gps:[41.06549,28.94630],cats:["işlevsel"],        desc:"Kampüs sağlık birimi."},
  {num:30, name:"Öğrenci Destek",     gps:[41.06539,28.94622],cats:["idari"],           desc:"ÖDM – Öğrenci Danışmanlık Merkezi."},
  {num:31, name:"Gastronomi",         gps:[41.06607,28.94565],cats:["eğitsel"],         desc:"Gastronomi ve mutfak sanatları."},
  {num:32, name:"BT",                 gps:[41.06589,28.94637],cats:["idari"],           desc:"Bilişim Teknolojileri birimi."},
  {num:33, name:"Tarihi Kapı",        gps:[41.06680,28.94730],cats:["giriş"],          desc:"Tarihi fabrika giriş kapısı."},
  {num:34, name:"Otopark Girişi",     gps:[41.06620,28.94200],cats:["otopark"],         desc:"Otopark giriş kapısı."},
  {num:35, name:"Amfi",               gps:[41.06440,28.94520],cats:["sosyal"],          desc:"Açık hava amfi tiyatrosu."},
];

// ── İkonlar ───────────────────────────────────────────────────────────────────
function makeIcon(loc:Loc,isFrom:boolean,isTo:boolean):L.DivIcon{
  const color=isFrom?"#16a34a":isTo?"#ef4444":(CAT[loc.cats[0]]?.color??"#3b82f6");
  const bg=isFrom?"rgba(22,163,74,0.92)":isTo?"rgba(239,68,68,0.92)":"rgba(15,23,42,0.82)";
  return L.divIcon({
    html:`<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="background:${bg};color:#fff;font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:4px;white-space:nowrap;max-width:100px;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px;box-shadow:0 1px 4px rgba(0,0,0,0.4);">${loc.name}</div>
      <div style="width:12px;height:12px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.6);"></div>
    </div>`,
    className:"",iconSize:[100,30],iconAnchor:[50,28],
  });
}
const PERSON_ICON=L.divIcon({
  html:`<div style="width:20px;height:20px;background:#f97316;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 4px rgba(249,115,22,0.3),0 2px 8px rgba(0,0,0,0.45);"></div>`,
  className:"",iconSize:[20,20],iconAnchor:[10,10],
});
const USER_ICON=L.divIcon({
  html:`<div style="position:relative;width:20px;height:20px;">
    <div style="position:absolute;inset:0;background:rgba(59,130,246,0.4);border-radius:50%;animation:gps-pulse 2s ease-out infinite;"></div>
    <div style="position:absolute;width:12px;height:12px;top:4px;left:4px;background:#3b82f6;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>
  </div>`,
  className:"",iconSize:[20,20],iconAnchor:[10,10],
});

// ── Ana bileşen ───────────────────────────────────────────────────────────────
export default function CampusMapLeaflet(){
  const[from,setFrom]=useState<Loc|null>(null);
  const[to,setTo]=useState<Loc|null>(null);
  const[route,setRoute]=useState<[number,number][]|null>(null);
  const[routeMeters,setRouteMeters]=useState(0);
  const[catFilter,setCatFilter]=useState<string|null>(null);
  const[search,setSearch]=useState("");
  const[navMode,setNavMode]=useState(false);
  const[graphData,setGraphData]=useState<GraphData|null>(null);
  const[steps,setSteps]=useState<Step[]>([]);
  const[showSteps,setShowSteps]=useState(false);
  const[panelExpanded,setPanelExpanded]=useState(false);

  // GPS
  const[userPos,setUserPos]=useState<[number,number]|null>(null);
  const[gpsStatus,setGpsStatus]=useState<"idle"|"tracking"|"error">("idle");
  const watchRef=useRef<number|null>(null);

  // Simülasyon
  const[simulating,setSimulating]=useState(false);
  const[simPos,setSimPos]=useState<[number,number]|null>(null);
  const[simTraveled,setSimTraveled]=useState(0);
  const simIvRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const cumDistRef=useRef<number[]>([]);
  const stopSimRef=useRef(()=>{});

  useEffect(()=>{
    fetch("/campus_graph.json").then(r=>r.json()).then((d:GraphData)=>setGraphData(d)).catch(()=>{});
  },[]);

  const adjList=useMemo(()=>graphData?buildAdj(graphData):null,[graphData]);

  const startGPS=useCallback(()=>{
    if(!navigator.geolocation){setGpsStatus("error");return;}
    setGpsStatus("tracking");
    if(watchRef.current!=null)navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current=navigator.geolocation.watchPosition(
      pos=>{setUserPos([pos.coords.latitude,pos.coords.longitude]);setGpsStatus("tracking");},
      ()=>setGpsStatus("error"),
      {enableHighAccuracy:true,maximumAge:3000}
    );
  },[]);
  useEffect(()=>()=>{if(watchRef.current!=null)navigator.geolocation.clearWatch(watchRef.current);},[]);

  const stopSim=useCallback(()=>{
    if(simIvRef.current){clearInterval(simIvRef.current);simIvRef.current=null;}
    setSimulating(false);setSimPos(null);setSimTraveled(0);
  },[]);
  useEffect(()=>{stopSimRef.current=stopSim;},[stopSim]);

  const doRoute=useCallback((fLat:number,fLng:number,fName:string,t:Loc)=>{
    const[tLat,tLng]=t.gps;
    let pts:[number,number][];
    if(graphData&&adjList)pts=dijkstra(graphData,adjList,fLat,fLng,tLat,tLng);
    else pts=[[fLat,fLng],[tLat,tLng]];
    setRoute(pts);setRouteMeters(distM(pts));
    const s=generateSteps(pts);setSteps(s);setShowSteps(true);
    stopSimRef.current();
    const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+hav(pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1]));
    cumDistRef.current=cum;
    setPanelExpanded(true);
  },[graphData,adjList]);

  useEffect(()=>{
    if(from&&from.num!==0&&to)doRoute(from.gps[0],from.gps[1],from.name,to);
    else if(!from&&!to){setRoute(null);setRouteMeters(0);setSteps([]);stopSimRef.current();}
  },[from,to,doRoute]);

  const resetNav=useCallback(()=>{
    setFrom(null);setTo(null);setRoute(null);setRouteMeters(0);
    setNavMode(false);setSteps([]);setShowSteps(false);setPanelExpanded(false);stopSim();
  },[stopSim]);

  const startSim=useCallback(()=>{
    if(!route||route.length<2)return;
    stopSim();
    const cum=cumDistRef.current,r=route,total=cum[cum.length-1]??0;
    const TICK=50,stepM=(83/60)*(TICK/1000)*SIM_SPEED;
    let traveled=0;
    setSimulating(true);setSimTraveled(0);setSimPos(r[0]);
    simIvRef.current=setInterval(()=>{
      traveled+=stepM;
      if(traveled>=total){
        clearInterval(simIvRef.current!);simIvRef.current=null;
        setSimulating(false);setSimPos(null);setSimTraveled(total);return;
      }
      setSimTraveled(traveled);
      for(let i=1;i<cum.length;i++){
        if(cum[i]>=traveled){
          const t=(traveled-cum[i-1])/(cum[i]-cum[i-1]);
          setSimPos([r[i-1][0]+t*(r[i][0]-r[i-1][0]),r[i-1][1]+t*(r[i][1]-r[i-1][1])]);break;
        }
      }
    },TICK);
  },[route,stopSim]);
  useEffect(()=>()=>{if(simIvRef.current)clearInterval(simIvRef.current);},[]);

  const visible=useMemo(()=>LOCS.filter(l=>
    (!search||l.name.toLowerCase().includes(search.toLowerCase()))&&
    (!catFilter||l.cats.includes(catFilter))
  ),[search,catFilter]);

  const mins=Math.max(1,Math.round(routeMeters/83));
  const simPct=routeMeters>0?Math.min(100,Math.round((simTraveled/routeMeters)*100)):0;
  const simRemM=Math.max(0,Math.round(routeMeters-simTraveled));
  const simRemMin=Math.max(0,Math.round(simRemM/83));

  let dirArrow="↑";
  if(simPos&&route&&route.length>1){
    const cum=cumDistRef.current;let seg=0;
    for(let i=1;i<cum.length;i++){if(cum[i]>=simTraveled){seg=i;break;}}
    if(seg<route.length)dirArrow=brngArrow(brng(route[Math.max(0,seg-1)][0],route[Math.max(0,seg-1)][1],route[seg][0],route[seg][1]));
  }

  // Aktif adım indeksi
  const activeStepIdx=useMemo(()=>{
    if(!simulating||!steps.length)return 0;
    let cum=0;for(let i=0;i<steps.length;i++){cum+=steps[i].dist;if(cum>=simTraveled)return i;}
    return steps.length-1;
  },[simulating,steps,simTraveled]);

  const BTN:React.CSSProperties={
    border:"none",borderRadius:8,cursor:"pointer",
    minHeight:44,display:"flex",alignItems:"center",justifyContent:"center",
    fontFamily:"inherit",fontWeight:700,fontSize:13,touchAction:"manipulation",
  };

  return(
    <div style={{position:"relative",height:"100dvh",width:"100%",overflow:"hidden",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>

      {/* ── Tam ekran harita ── */}
      <div style={{position:"absolute",inset:0,zIndex:1}}>
        <MapContainer
          center={CAMPUS_CENTER} zoom={17}
          style={{height:"100%",width:"100%"}}
          minZoom={15} maxZoom={19}
          maxBounds={[[41.055,28.925],[41.085,28.965]]}
          maxBoundsViscosity={0.8}
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={19}
          />
          {route&&(
            <>
              <Polyline positions={route} pathOptions={{color:"#000",weight:8,opacity:0.12}}/>
              <Polyline positions={route} pathOptions={{color:"#3b82f6",weight:5,opacity:0.95,lineCap:"round",lineJoin:"round"}}/>
            </>
          )}
          {simPos&&<Marker position={simPos} icon={PERSON_ICON} zIndexOffset={3000}/>}
          {userPos&&<Marker position={userPos} icon={USER_ICON} zIndexOffset={2500}/>}
          {visible.map(loc=>{
            const isFrom=from?.num===loc.num,isTo=to?.num===loc.num;
            return(
              <Marker key={loc.num} position={loc.gps} icon={makeIcon(loc,isFrom,isTo)} zIndexOffset={isFrom||isTo?1000:0}
                eventHandlers={{click:()=>{
                  if(navMode){if(!from)setFrom(loc);else if(!to&&from.num!==loc.num)setTo(loc);}
                }}}>
                <Popup maxWidth={220} minWidth={180}>
                  <div style={{fontFamily:"'Segoe UI',sans-serif",padding:2}}>
                    <div style={{fontWeight:700,fontSize:15,color:"#0f172a",marginBottom:4}}>{loc.name}</div>
                    <div style={{fontSize:12,color:"#475569",marginBottom:12,lineHeight:1.5}}>{loc.desc}</div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>{setFrom(loc);setNavMode(true);setPanelExpanded(true);}}
                        style={{...BTN,flex:1,background:"#16a34a",color:"#fff",fontSize:12}}>
                        Buradan Başla
                      </button>
                      <button onClick={()=>{setTo(loc);setNavMode(true);setPanelExpanded(true);}}
                        style={{...BTN,flex:1,background:"#ef4444",color:"#fff",fontSize:12}}>
                        Buraya Git
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
          <FitMap/>
          <ZoomButtons/>
        </MapContainer>
      </div>

      {/* ── Üst header şerit ── */}
      <div style={{
        position:"absolute",top:0,left:0,right:0,zIndex:10,
        background:"linear-gradient(135deg,#7c2d12,#92400e)",
        padding:"10px 14px",display:"flex",alignItems:"center",gap:10,
        boxShadow:"0 2px 12px rgba(0,0,0,0.5)",
      }}>
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:15,letterSpacing:0.5,color:"#fff",textTransform:"uppercase"}}>Santral Kampüs</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.7)"}}>İstanbul Bilgi Üniversitesi</div>
        </div>
        {!graphData&&<div style={{fontSize:10,color:"#fde68a"}}>yollar…</div>}
        <button onClick={startGPS} style={{
          ...BTN,
          background:gpsStatus==="tracking"?"rgba(59,130,246,0.3)":"rgba(255,255,255,0.15)",
          border:"1px solid rgba(255,255,255,0.3)",color:"#fff",
          minHeight:36,padding:"0 12px",fontSize:12,borderRadius:8,gap:4,
        }}>
          {gpsStatus==="tracking"?"📍":"📍"}{gpsStatus==="tracking"?" Aktif":" Konumum"}
        </button>
      </div>

      {/* ── Alt panel (mobil bottom sheet) ── */}
      <div style={{
        position:"absolute",bottom:0,left:0,right:0,zIndex:10,
        background:"#1e293b",
        borderRadius:"16px 16px 0 0",
        boxShadow:"0 -4px 24px rgba(0,0,0,0.5)",
        transition:"max-height 0.3s ease",
        maxHeight: panelExpanded ? "70dvh" : (navMode||routeMeters>0 ? "auto" : "auto"),
        display:"flex",flexDirection:"column",
      }}>
        {/* Drag handle */}
        <div style={{display:"flex",justifyContent:"center",padding:"8px 0 4px",cursor:"pointer"}}
          onClick={()=>setPanelExpanded(p=>!p)}>
          <div style={{width:36,height:4,background:"#475569",borderRadius:2}}/>
        </div>

        {/* Arama / navigasyon */}
        <div style={{padding:"0 12px 8px",display:"flex",flexDirection:"column",gap:8}}>
          {!navMode?(
            <div style={{display:"flex",gap:8}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Bina ara…"
                style={{
                  flex:1,background:"#0f172a",border:"1px solid #334155",borderRadius:10,
                  padding:"10px 14px",color:"#fff",fontSize:14,outline:"none",minHeight:44,
                }}/>
              <button onClick={()=>{setNavMode(true);setPanelExpanded(true);}}
                style={{...BTN,background:"#16a34a",color:"#fff",padding:"0 16px",borderRadius:10}}>
                Yol Tarifi
              </button>
            </div>
          ):(
            <>
              {/* Nereden */}
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <div style={{
                  flex:1,background:"#0f172a",borderRadius:10,padding:"10px 14px",
                  display:"flex",alignItems:"center",gap:10,minHeight:44,
                }}>
                  <span style={{width:10,height:10,borderRadius:"50%",background:"#16a34a",flexShrink:0}}/>
                  <span style={{fontSize:13,color:from?"#f1f5f9":"#64748b",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {from?from.name:"Nereden? — pin'e tıkla"}
                  </span>
                </div>
                {userPos&&(
                  <button onClick={()=>{
                    const fake:Loc={num:0,name:"Konumunuz",gps:userPos,cats:[],desc:""};
                    setFrom(fake);if(to)doRoute(userPos[0],userPos[1],"Konumunuz",to);
                  }} style={{...BTN,background:"#3b82f6",color:"#fff",minHeight:44,padding:"0 12px",fontSize:12,borderRadius:10}}>
                    📍 Ben
                  </button>
                )}
                {from&&<button onClick={()=>{setFrom(null);setRoute(null);setRouteMeters(0);setSteps([]);stopSim();}}
                  style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:24,lineHeight:1,padding:"0 4px",touchAction:"manipulation"}}>×</button>}
              </div>
              {/* Nereye */}
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <div style={{
                  flex:1,background:"#0f172a",borderRadius:10,padding:"10px 14px",
                  display:"flex",alignItems:"center",gap:10,minHeight:44,
                }}>
                  <span style={{width:10,height:10,borderRadius:"50%",background:"#ef4444",flexShrink:0}}/>
                  <span style={{fontSize:13,color:to?"#f1f5f9":"#64748b",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {to?to.name:"Nereye? — pin'e tıkla"}
                  </span>
                </div>
                {to&&<button onClick={()=>{setTo(null);setRoute(null);setRouteMeters(0);setSteps([]);stopSim();}}
                  style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:24,lineHeight:1,padding:"0 4px",touchAction:"manipulation"}}>×</button>}
              </div>

              {/* Rota özeti + simülasyon */}
              {route&&routeMeters>0&&(
                <div style={{background:"#0f172a",borderRadius:10,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
                  {!simulating?(
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                      <div style={{display:"flex",flexDirection:"column"}}>
                        <span style={{color:"#86efac",fontSize:14,fontWeight:800}}>~{mins} dakika · {routeMeters} m</span>
                        <span style={{color:"#64748b",fontSize:11}}>yürüyerek</span>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        {steps.length>1&&(
                          <button onClick={()=>setShowSteps(p=>!p)}
                            style={{...BTN,background:"#334155",color:"#94a3b8",minHeight:36,padding:"0 12px",fontSize:12}}>
                            {showSteps?"Gizle":"Adımlar"}
                          </button>
                        )}
                        <button onClick={startSim}
                          style={{...BTN,background:"#f97316",color:"#fff",minHeight:36,padding:"0 14px",fontSize:13}}>
                          ▶ Simüle Et
                        </button>
                      </div>
                    </div>
                  ):(
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:28,color:"#f97316",fontWeight:700,minWidth:36,textAlign:"center"}}>{dirArrow}</span>
                      <div style={{flex:1}}>
                        <div style={{height:6,background:"#1e293b",borderRadius:3,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${simPct}%`,background:"linear-gradient(90deg,#f97316,#fb923c)",borderRadius:3,transition:"width 0.05s linear"}}/>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
                          <span style={{fontSize:11,color:"#94a3b8"}}>{simPct}%</span>
                          <span style={{fontSize:11,color:"#86efac"}}>{simRemM}m · ~{simRemMin}dk kaldı</span>
                        </div>
                        {simulating&&steps[activeStepIdx]&&(
                          <div style={{marginTop:4,fontSize:12,color:"#f1f5f9",fontWeight:600}}>
                            {steps[activeStepIdx].arrow} {steps[activeStepIdx].text}
                          </div>
                        )}
                      </div>
                      <button onClick={stopSim}
                        style={{...BTN,background:"#475569",color:"#fff",minHeight:36,padding:"0 12px",fontSize:13}}>
                        ■
                      </button>
                    </div>
                  )}

                  {/* Adım adım tarif listesi */}
                  {showSteps&&!simulating&&(
                    <div style={{maxHeight:180,overflowY:"auto",display:"flex",flexDirection:"column",gap:2,
                      borderTop:"1px solid #1e293b",paddingTop:8}}>
                      {steps.map((s,i)=>(
                        <div key={i} style={{
                          display:"flex",alignItems:"center",gap:10,padding:"6px 0",
                          opacity:i<activeStepIdx?0.4:1,
                          borderBottom:i<steps.length-1?"1px solid #1e293b":"none",
                        }}>
                          <span style={{fontSize:18,minWidth:28,textAlign:"center",
                            color:i===activeStepIdx?"#f97316":"#94a3b8"}}>{s.arrow}</span>
                          <span style={{fontSize:13,color:i===activeStepIdx?"#f1f5f9":"#94a3b8",flex:1,lineHeight:1.4}}>{s.text}</span>
                          {s.dist>0&&<span style={{fontSize:11,color:"#475569",flexShrink:0}}>{s.dist}m</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button onClick={resetNav}
                style={{...BTN,background:"#334155",color:"#cbd5e1",width:"100%",minHeight:40,fontSize:13}}>
                Navigasyonu Sıfırla
              </button>
            </>
          )}

          {/* Kategori filtreleri */}
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,WebkitOverflowScrolling:"touch"} as React.CSSProperties}>
            <button onClick={()=>setCatFilter(null)}
              style={{...BTN,fontSize:12,padding:"0 12px",minHeight:34,borderRadius:20,
                border:"1px solid #475569",background:catFilter===null?"#3b82f6":"transparent",
                color:"#fff",flexShrink:0}}>
              Tümü
            </button>
            {Object.entries(CAT).map(([k,v])=>(
              <button key={k} onClick={()=>setCatFilter(p=>p===k?null:k)}
                style={{...BTN,fontSize:12,padding:"0 12px",minHeight:34,borderRadius:20,
                  border:`1px solid ${v.color}55`,
                  background:catFilter===k?v.color:"transparent",
                  color:catFilter===k?"#fff":v.color,flexShrink:0}}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Zoom butonları (harita üzerinde) ── */}
      <div style={{
        position:"absolute",right:14,top:80,zIndex:10,
        display:"flex",flexDirection:"column",gap:4,
      }}>
        {[["zoom-in","+"],["zoom-out","−"]].map(([id,label])=>(
          <button key={id} id={id}
            style={{...BTN,width:40,height:40,background:"#1e293b",color:"#fff",
              border:"1px solid #334155",borderRadius:10,minHeight:40,boxShadow:"0 2px 8px rgba(0,0,0,0.3)"}}>
            {label}
          </button>
        ))}
      </div>

    </div>
  );
}

// Zoom butonlarını haritaya bağla
function ZoomButtons(){
  const map=useMap();
  useEffect(()=>{
    const zi=document.getElementById("zoom-in"),zo=document.getElementById("zoom-out");
    if(zi)zi.onclick=()=>map.zoomIn();
    if(zo)zo.onclick=()=>map.zoomOut();
  },[map]);
  return null;
}
