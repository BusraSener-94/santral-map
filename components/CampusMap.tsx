"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Category = "academic" | "social" | "sport" | "service" | "museum" | "parking";

interface Building {
  id: string;
  name: string;
  x: number;
  y: number;
  cat: Category;
  emoji: string;
  desc: string;
  map: "m1" | "m2";
}

const CAT: Record<Category, { color: string; light: string; emoji: string; label: string }> = {
  academic: { color: "#2563eb", light: "#dbeafe", emoji: "🎓", label: "Akademik" },
  social:   { color: "#d97706", light: "#fef3c7", emoji: "☕", label: "Sosyal" },
  sport:    { color: "#059669", light: "#d1fae5", emoji: "⚽", label: "Spor" },
  service:  { color: "#7c3aed", light: "#ede9fe", emoji: "🏢", label: "Hizmet" },
  museum:   { color: "#dc2626", light: "#fee2e2", emoji: "🏛️", label: "Müze" },
  parking:  { color: "#475569", light: "#f1f5f9", emoji: "🅿️", label: "Otopark" },
};

const BUILDINGS: Building[] = [
  // MAP-1 — Sanayi Alanı
  { id: "enerji_muzesi",        name: "Enerji Müzesi",          x: 25.9, y: 56.3, cat: "museum",   emoji: "⚡", desc: "Santralistanbul'un kalbindeki tarihi enerji tesisi. Sürekli değişen sergilerle teknolojinin tarihini keşfedin.", map: "m1" },
  { id: "e5",                   name: "E-5",                    x: 34.2, y: 47.7, cat: "academic", emoji: "🎓", desc: "Mühendislik Fakültesi E-5 binası. Derslikler, laboratuvarlar ve öğrenci çalışma alanları.", map: "m1" },
  { id: "mimarlik",             name: "Mimarlık / Kütüphane",   x: 34.1, y: 58.6, cat: "academic", emoji: "📚", desc: "Mimarlık Fakültesi (E-6) ve Ana Kütüphane. Tasarım stüdyoları ile zengin kitap koleksiyonu.", map: "m1" },
  { id: "gastronomi",           name: "Gastronomi Mutfak",      x: 40.2, y: 63.8, cat: "academic", emoji: "👨‍🍳", desc: "Gastronomi bölümü mutfak laboratuvarları. Yaratıcı mutfak denemeleri burada gerçekleşir!", map: "m1" },
  { id: "revir_cdm",            name: "Revir / ÇDM",            x: 51.4, y: 46.4, cat: "service",  emoji: "🏥", desc: "Revir ve Çoğul Danışmanlık Merkezi. Sağlık ve psikolojik destek hizmetleri.", map: "m1" },
  { id: "kulucka",              name: "Kuluçka Merkezi",        x: 60.4, y: 48.2, cat: "service",  emoji: "💡", desc: "Girişimcilik projelerine ev sahipliği yapan Kuluçka Merkezi. İnce uzun bina.", map: "m1" },
  { id: "etkinlik_cadiri",      name: "Etkinlik Çadırı",        x: 45.8, y: 66.9, cat: "social",   emoji: "🎪", desc: "Konserler, festivaller ve özel kampüs etkinlikleri burada düzenlenir.", map: "m1" },
  { id: "kampus_otopark_giris", name: "Kampüs Otopark Girişi",  x: 55.3, y: 60.2, cat: "parking",  emoji: "🅿️", desc: "Büyük otoparkın kuzey girişi. Araç girişi bu noktadan yapılır.", map: "m1" },
  { id: "seyfi_arikan",        name: "Seyfi Arıkan",           x: 14.8, y: 52.6, cat: "sport",    emoji: "🏋️", desc: "Seyfi Arıkan Spor Salonu. Fitness merkezi, basketbol ve voleybol kortları.", map: "m1" },
  { id: "e4",                   name: "E-4",                    x:  9.8, y: 58.9, cat: "academic", emoji: "🎓", desc: "E-4 Fakülte Binası. Sosyal bilimler ve iletişim bölümleri.", map: "m1" },
  { id: "csm",                  name: "ÇSM Ofisler / Derslikler", x: 15.1, y: 69.3, cat: "academic", emoji: "🏫", desc: "L-şekilli ÇSM kompleksi. İç avlulu geniş derslik ve ofis yapısı.", map: "m1" },
  { id: "mdl",                  name: "MDL",                    x: 14.3, y: 79.3, cat: "academic", emoji: "💻", desc: "Media ve Dijital Lab. Kırmızı çatılı küçük yapı, ÇSM'nin hemen güneyinde.", map: "m1" },
  { id: "blab_banka",           name: "Blab / Banka / EN-1",    x:  3.3, y: 88.9, cat: "service",  emoji: "🏦", desc: "Nehir büküşündeki hizmet alanları. Blab kafe, banka şubesi ve EN-1 binası.", map: "m1" },
  { id: "restoran",             name: "Restoran / Espresso",    x: 23.3, y: 77.7, cat: "social",   emoji: "🍽️", desc: "Ana yürüyüş aksındaki restoran ve espresso bar. Kampüsün merkezi buluşma noktası.", map: "m1" },
  { id: "bt",                   name: "BT Destek",              x: 40.5, y: 46.9, cat: "service",  emoji: "🖥️", desc: "Bilgi Teknolojileri Destek Birimi. Teknik altyapı ve yardım masası.", map: "m1" },
  { id: "amfi_tiyatro",         name: "Amfi Tiyatro",           x: 80.8, y: 26.0, cat: "sport",    emoji: "🏟️", desc: "Açık hava amfi tiyatro ve atletizm pisti. Büyük etkinlikler ve spor organizasyonları.", map: "m1" },
  { id: "otopark",              name: "Otopark",                x: 55.5, y: 69.4, cat: "parking",  emoji: "🚗", desc: "Ana Otopark. Nehre paralel uzanan geniş araç park alanı.", map: "m1" },
  { id: "teias_trafo",          name: "TEİAŞ Trafo",            x: 58.7, y: 32.7, cat: "service",  emoji: "🔌", desc: "TEİAŞ Trafo İstasyonu. Kampüsün elektrik altyapısının kalbi.", map: "m1" },

  // MAP-2 — Akademik Bölge
  { id: "e3",           name: "E-3",                   x: 38.6, y:  8.1, cat: "academic", emoji: "🎓", desc: "E-3 binası. Anayola paralel uzun gri çatılı yapı, kampüsün kuzey sınırında.", map: "m2" },
  { id: "rektorluk",    name: "Rektörlük",             x: 57.9, y: 22.7, cat: "service",  emoji: "🏛️", desc: "Rektörlük Binası. Üniversite yönetiminin merkezi, yeşil alan başlangıcında.", map: "m2" },
  { id: "l3",           name: "L-3",                   x: 23.1, y: 35.1, cat: "academic", emoji: "🎓", desc: "L-3 — Üç paralel binanın en küçüğü ve en batısındaki.", map: "m2" },
  { id: "l1",           name: "L-1",                   x: 36.2, y: 42.4, cat: "academic", emoji: "🎓", desc: "L-1 — Orta büyüklükteki L binası. Derslikler ve akademik ofisler.", map: "m2" },
  { id: "l2",           name: "L-2",                   x: 50.2, y: 45.9, cat: "academic", emoji: "🎓", desc: "L-2 — Üç L binasının en doğusundaki ve en büyüğü.", map: "m2" },
  { id: "e2_yasar",     name: "E-2 Yaşar Kemal",       x: 12.5, y: 79.6, cat: "academic", emoji: "📖", desc: "E-2 Yaşar Kemal Binası. Alibey Deresi'nin hemen kuzeyinde, nehre paralel uzun gri blok.", map: "m2" },
  { id: "e1",           name: "E-1",                   x: 40.6, y: 79.6, cat: "academic", emoji: "🎓", desc: "E-1 Binası. E-2'nin hemen doğusunda, aynı mimaride nehre paralel.", map: "m2" },
  { id: "yemekhane",    name: "Yemekhane",             x: 73.1, y: 75.0, cat: "social",   emoji: "🍽️", desc: "Merkezi Yemekhane. Geniş L-şekilli sosyal kompleks, öğrencilerin buluşma noktası.", map: "m2" },
  { id: "calisma_alani",name: "Çalışma Alanı",         x: 81.0, y: 72.9, cat: "social",   emoji: "📝", desc: "Açık çalışma alanı. Yemekhane kompleksinin doğu uzantısı.", map: "m2" },
  { id: "nero",         name: "Nero",                  x: 84.8, y: 59.6, cat: "social",   emoji: "☕", desc: "Caffè Nero. 4 kafeterya sırasının en üstündeki.", map: "m2" },
  { id: "starbucks",    name: "Starbucks",             x: 87.9, y: 65.1, cat: "social",   emoji: "🌟", desc: "Starbucks — kampüsün ikonik kahve durağı. GPS referans noktası!", map: "m2" },
  { id: "kuafor",       name: "Kuaför",                x: 84.8, y: 67.4, cat: "service",  emoji: "✂️", desc: "Kampüs Kuaförü. Starbucks'ın hemen yanında, 4 hizmet binasının ortasında.", map: "m2" },
  { id: "atm",          name: "ATM",                   x: 84.4, y: 69.7, cat: "service",  emoji: "💳", desc: "Bankamatik. Hizmet binalarının en altındaki.", map: "m2" },
  { id: "sunpeak",      name: "Sunpeak",               x: 93.0, y: 59.6, cat: "social",   emoji: "☀️", desc: "Sunpeak kafeterya. 4 hizmet binasının doğusunda, yeşil alanla sınır oluşturur.", map: "m2" },
  { id: "cami_giris",   name: "Cami Girişi",           x: 95.5, y: 83.0, cat: "service",  emoji: "🕌", desc: "Cami Girişi. Yemekhane kompleksinin doğu ucunda, nehir üzerindeki köprüye yakın.", map: "m2" },
];

const CHAR_ROUTES = {
  m1: [
    { x: 23.3, y: 77.7 },
    { x: 25.9, y: 56.3 },
    { x: 34.2, y: 47.7 },
    { x: 40.5, y: 46.9 },
    { x: 51.4, y: 46.4 },
    { x: 60.4, y: 48.2 },
    { x: 55.5, y: 69.4 },
    { x: 45.8, y: 66.9 },
    { x: 14.8, y: 52.6 },
    { x: 15.1, y: 69.3 },
  ],
  m2: [
    { x: 23.1, y: 35.1 },
    { x: 38.6, y:  8.1 },
    { x: 57.9, y: 22.7 },
    { x: 50.2, y: 45.9 },
    { x: 73.1, y: 75.0 },
    { x: 84.8, y: 59.6 },
    { x: 87.9, y: 65.1 },
    { x: 40.6, y: 79.6 },
    { x: 12.5, y: 79.6 },
  ],
};

// MAP-1: 1353×1067 → 78.86%  |  MAP-2: 1037×1099 → 105.98%
const ASPECT: Record<"m1" | "m2", string> = { m1: "78.86", m2: "105.98" };

const ALL_CATS: Array<"all" | Category> = ["all", "academic", "social", "sport", "service", "museum", "parking"];

export default function CampusMap() {
  const [mapView, setMapView]       = useState<"m1" | "m2">("m1");
  const [night, setNight]           = useState(false);
  const [sel, setSel]               = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  const [catFilter, setCatFilter]   = useState<"all" | Category>("all");
  const [discovered, setDiscovered] = useState<Set<string>>(new Set());
  const [charIdx, setCharIdx]       = useState(0);

  const route = CHAR_ROUTES[mapView];

  useEffect(() => {
    const t = setInterval(() => setCharIdx(i => (i + 1) % route.length), 2500);
    return () => clearInterval(t);
  }, [route.length]);

  const charPos = route[charIdx];

  const mapBuildings = BUILDINGS.filter(b => b.map === mapView);
  const visible = mapBuildings.filter(b => {
    const matchSearch = search === "" || b.name.toLowerCase().includes(search.toLowerCase());
    const matchCat    = catFilter === "all" || b.cat === catFilter;
    return matchSearch && matchCat;
  });

  const selBuilding = sel ? BUILDINGS.find(b => b.id === sel) ?? null : null;
  const xp    = discovered.size;
  const maxXP = BUILDINGS.length;

  function handleBuildingClick(id: string) {
    setSel(prev => prev === id ? null : id);
    setDiscovered(prev => new Set([...prev, id]));
  }

  function switchMap(v: "m1" | "m2") {
    setMapView(v);
    setSel(null);
    setCharIdx(0);
  }

  // Theme
  const bg        = night ? "#1a1a2e" : "#fef9ef";
  const cardBg    = night ? "#16213e" : "#ffffff";
  const text      = night ? "#e2e8f0" : "#1c1917";
  const subtext   = night ? "#94a3b8" : "#6b7280";
  const borderCol = night ? "#2d3748" : "#e5e7eb";
  const headerBg  = night ? "#0f0f23" : "#7c2d12";
  const tabBg     = night ? "#1a1a2e" : "#fef3c7";
  const tabActive = night ? "#1e3a5f" : "#7c2d12";
  const imgFilter = night ? "brightness(0.45) saturate(0.85)" : "none";
  const gridLine  = night ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";

  return (
    <div style={{
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      background: bg,
      maxWidth: 460, margin: "0 auto",
      display: "flex", flexDirection: "column",
      color: text, position: "relative",
    }}>

      {/* ── Header ── */}
      <div style={{ background: headerBg, color: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: 0.5 }}>🗺️ SANTRAL KAMPÜS</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>İstanbul Bilgi Üniversitesi</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* XP bar */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
            <span style={{ fontSize: 10, opacity: 0.85 }}>Keşif {xp}/{maxXP}</span>
            <div style={{ width: 56, height: 5, background: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden" }}>
              <motion.div
                animate={{ width: `${xp / maxXP * 100}%` }}
                transition={{ duration: 0.5 }}
                style={{ height: "100%", background: "#fbbf24", borderRadius: 3 }}
              />
            </div>
          </div>
          {/* Day / Night */}
          <button
            onClick={() => setNight(n => !n)}
            style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 20, padding: "6px 11px", cursor: "pointer", fontSize: 15, color: "#fff", lineHeight: 1 }}
          >
            {night ? "☀️" : "🌙"}
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div style={{ padding: "10px 14px", background: cardBg, borderBottom: `1px solid ${borderCol}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: night ? "#2d3748" : "#f3f4f6", borderRadius: 24, padding: "7px 14px" }}>
          <span style={{ fontSize: 14 }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Bina ara…"
            style={{ border: "none", background: "transparent", flex: 1, color: text, fontSize: 14, outline: "none" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ border: "none", background: "transparent", cursor: "pointer", color: subtext, fontSize: 14, lineHeight: 1, padding: 0 }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Map tabs ── */}
      <div style={{ display: "flex", background: tabBg, borderBottom: `1px solid ${borderCol}` }}>
        {([["m1", "🏭 Sanayi"], ["m2", "🎓 Akademik"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => switchMap(id)}
            style={{
              flex: 1, padding: "10px 0", border: "none", cursor: "pointer",
              background: mapView === id ? tabActive : "transparent",
              color: mapView === id ? "#fff" : subtext,
              fontWeight: mapView === id ? 700 : 400,
              fontSize: 14, transition: "all 0.2s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Map area ── */}
      <div style={{ position: "relative", width: "100%", paddingBottom: `${ASPECT[mapView]}%`, overflow: "hidden", flexShrink: 0 }}>
        {/* Satellite image */}
        <div
          style={{
            position: "absolute", inset: 0,
            backgroundImage: `url('/${mapView === "m1" ? "MAP-1" : "MAP-2"}.jpg')`,
            backgroundSize: "100% 100%",
            filter: imgFilter,
            transition: "filter 0.5s",
          }}
        />

        {/* Subtle game grid */}
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: `linear-gradient(${gridLine} 1px, transparent 1px), linear-gradient(90deg, ${gridLine} 1px, transparent 1px)`,
            backgroundSize: "5% 5%",
          }}
        />

        {/* Moving character */}
        <motion.div
          animate={{ left: `${charPos.x}%`, top: `${charPos.y}%` }}
          transition={{ duration: 2.2, ease: "easeInOut" }}
          style={{ position: "absolute", zIndex: 10, pointerEvents: "none" }}
        >
          <div style={{ transform: "translate(-50%, -50%)", position: "relative", width: 26, height: 26 }}>
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{
                position: "absolute", inset: -7, borderRadius: "50%",
                border: "2px solid rgba(251,191,36,0.8)",
                background: "rgba(251,191,36,0.15)",
              }}
            />
            <span style={{ fontSize: 18, lineHeight: "26px", display: "block", textAlign: "center", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))" }}>
              🚶
            </span>
          </div>
        </motion.div>

        {/* Building markers */}
        {visible.map(b => {
          const isSel  = sel === b.id;
          const isDone = discovered.has(b.id);
          const c      = CAT[b.cat];
          return (
            <motion.button
              key={b.id}
              onClick={() => handleBuildingClick(b.id)}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 280, damping: 20 }}
              style={{
                position: "absolute",
                left: `${b.x}%`, top: `${b.y}%`,
                transform: "translate(-50%, -50%)",
                zIndex: isSel ? 20 : 5,
                background: "none", border: "none", cursor: "pointer", padding: 0,
              }}
            >
              {/* Animated pulse ring when selected */}
              {isSel && (
                <motion.div
                  animate={{ scale: [1, 2.4, 1], opacity: [0.55, 0, 0.55] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  style={{
                    position: "absolute", inset: 0, borderRadius: "50%",
                    background: c.color, zIndex: -1,
                  }}
                />
              )}
              {/* Icon circle */}
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background: isDone ? c.color : (night ? "#1e293b" : "#fff"),
                border: `2px solid ${c.color}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12,
                boxShadow: isSel
                  ? `0 0 0 3px ${c.color}55, 0 4px 14px rgba(0,0,0,0.4)`
                  : "0 2px 8px rgba(0,0,0,0.3)",
                transition: "all 0.2s",
                color: isDone ? "#fff" : c.color,
              }}>
                {b.emoji}
              </div>
              {/* Label — shown while searching or when selected */}
              {(isSel || search !== "") && (
                <div style={{
                  position: "absolute", top: "100%", left: "50%",
                  transform: "translateX(-50%)",
                  marginTop: 3,
                  background: night ? "#1e293b" : "#fff",
                  padding: "2px 6px", borderRadius: 6,
                  fontSize: 9, fontWeight: 700,
                  whiteSpace: "nowrap", color: c.color,
                  border: `1px solid ${c.color}40`,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  pointerEvents: "none",
                }}>
                  {b.name}
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* ── Category filter ── */}
      <div style={{ padding: "8px 12px", background: cardBg, display: "flex", gap: 6, overflowX: "auto", borderBottom: `1px solid ${borderCol}`, flexShrink: 0 }}>
        {ALL_CATS.map(cat => {
          const isActive = catFilter === cat;
          const c = cat === "all" ? null : CAT[cat];
          return (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              style={{
                flexShrink: 0, padding: "4px 10px", borderRadius: 20,
                border: `1px solid ${isActive ? (c?.color ?? "#7c2d12") : borderCol}`,
                background: isActive ? (c?.color ?? "#7c2d12") : "transparent",
                color: isActive ? "#fff" : subtext,
                fontSize: 12, cursor: "pointer",
                fontWeight: isActive ? 700 : 400,
                transition: "all 0.15s", lineHeight: 1.6,
              }}
            >
              {cat === "all" ? "Tümü" : `${c!.emoji} ${c!.label}`}
            </button>
          );
        })}
      </div>

      {/* Building count status */}
      <div style={{ padding: "5px 16px", fontSize: 12, color: subtext, background: cardBg, borderBottom: `1px solid ${borderCol}`, flexShrink: 0 }}>
        {visible.length} bina gösteriliyor · {xp} keşfedildi
      </div>


      {/* ── Building info card ── */}
      <AnimatePresence>
        {selBuilding && (
          <motion.div
            key={selBuilding.id}
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            style={{
              position: "fixed", bottom: 0, left: "50%",
              width: "min(100vw, 460px)", transform: "translateX(-50%)",
              background: cardBg, borderRadius: "20px 20px 0 0",
              padding: "16px 20px 30px",
              zIndex: 100,
              boxShadow: "0 -8px 32px rgba(0,0,0,0.22)",
              borderTop: `3px solid ${CAT[selBuilding.cat].color}`,
            }}
          >
            {/* Drag handle */}
            <div style={{ width: 36, height: 4, background: borderCol, borderRadius: 2, margin: "0 auto 14px" }} />

            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 50, height: 50, borderRadius: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: CAT[selBuilding.cat].light,
                fontSize: 26, flexShrink: 0,
              }}>
                {selBuilding.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, color: text }}>
                  {selBuilding.name}
                </div>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "3px 9px", borderRadius: 10,
                  background: CAT[selBuilding.cat].light,
                  color: CAT[selBuilding.cat].color,
                  fontSize: 11, fontWeight: 600,
                }}>
                  {CAT[selBuilding.cat].emoji} {CAT[selBuilding.cat].label}
                </span>
              </div>
              <button
                onClick={() => setSel(null)}
                style={{
                  background: night ? "#2d3748" : "#f3f4f6",
                  border: "none", borderRadius: "50%",
                  width: 30, height: 30, cursor: "pointer",
                  color: subtext, fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 14, color: subtext, lineHeight: 1.65, margin: "0 0 12px" }}>
              {selBuilding.desc}
            </p>

            <div style={{
              padding: "8px 12px", borderRadius: 10, fontSize: 12,
              background: night ? "#1e3a1e" : "#f0fdf4",
              color: night ? "#86efac" : "#166534",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              ✅ {discovered.has(selBuilding.id) ? "Keşfedildi! +1 XP kazandın 🎉" : "Keşfediliyor…"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
