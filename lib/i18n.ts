// ── Çeviriler ─────────────────────────────────────────────────────────────────
// NEXT_PUBLIC_LANG=en → İngilizce  |  set edilmezse → Türkçe (varsayılan)
// Bu değişken build-time'da sabitlenir; runtime'da değişmez.

const TR = {
  // Input placeholder'lar
  fromPlaceholder: "Başlangıç Noktası Yazın",
  toPlaceholder: "Varış Noktası Yazın",
  searchDestPlaceholder: "Nereye gitmek istiyorsun?",
  editToPlaceholder: "Varış noktası ara...",
  namePlaceholder: "Adınız Soyadınız",
  facultyPlaceholder: "Fakülteniz (opsiyonel)",

  // GPS buton durumları
  gpsError: "⚠️ Hata",
  gpsActive: "📍 Aktif",
  gpsOff: "📍 Konum",

  // GPS hata mesajları
  gpsNotSupported: "Bu tarayıcı konum desteklemiyor.",
  gpsDenied: "Konum izni verilmedi. iPhone'da: Ayarlar → Safari → Konum → İzin Ver",
  gpsUnavailable: "Konum alınamadı. Açık alanda tekrar deneyin.",
  gpsTimeout: "Konum zaman aşımına uğradı. Tekrar deneyin.",

  // Konum gösterimi
  yourLocation: "📍 Konumunuz",
  startFromLocation: "Konumunuzdan Başlatın",
  useMyLocation: "📍 Mevcut Konumumu Kullan",

  // Butonlar
  btnRoute: "🗺 Yol Tarifi",
  btnPreview: "Önizle",
  btnGpsNav: "Git (GPS)",
  btnOpenGps: "Konum Aç",
  btnStepsShow: "Adım",
  btnStepsHide: "Gizle",
  btnShareLocation: "Paylaş",
  shareLocationCopied: "🔗 Link kopyalandı!",
  friendPin: "Arkadaşınızın konumu",
  btnStartHere: "🟢 Buradan Başla",
  btnGoHere: "🔴 Buraya Git",
  btnGoHereArrow: "Buraya Git →",
  btnChange: "✏️ Değiştir",
  btnEnterMap: "Haritaya Gir →",
  btnOk: "Tamam",
  btnSkip: "Atla",

  // Mod talimat kartları
  pickFromTitle: "Başlangıç noktasını seç",
  pickToTitle: "Varış noktasını seç",
  pickFromDesc: "Haritada başlangıç noktasını işaretle\nya da aşağıda listeden seç",
  pickToDesc: "Haritada bir noktayı işaretle\nya da aşağıda nereye gitmek istediğini yaz",

  // Alt panel etiketleri
  filterLabel: "Binaları Filtreleyin:",
  catAll: "Tümü",
  catEgitsel: "Eğitsel",
  catSosyal: "Sosyal",
  catIdari: "İdari",
  catIslevsel: "İşlevsel",
  catOtopark: "Otopark",
  catGiris: "Giriş",
  roomListTitle: "MAHAL LİSTESİ",
  mahalUnit: "mahal",

  // Rota paneli
  startPointLabel: "🟢 Başlangıç noktanız",
  destPointLabel: "🔴 Varış noktanız",
  minLabel: "dk",
  minRemaining: "dk kaldı",
  thenLabel: "Ardından",

  // Navigasyon adım metinleri
  stepWalk: "yürüyün",
  stepTurnLeft: "sola dön",
  stepTurnRight: "sağa dön",
  stepAfter: "sonra",
  stepArrived: "Hedefe ulaştınız",

  // Yön adları (navigasyon adımları için)
  dirNorth: "Kuzeye",
  dirNE: "KD'ya",
  dirEast: "Doğuya",
  dirSE: "GD'ye",
  dirSouth: "Güneye",
  dirSW: "GB'ye",
  dirWest: "Batıya",
  dirNW: "KB'ye",

  // Varış bildirimi
  arrivedMsg: "Hedefe ulaştınız!",

  // Hoşgeldin ekranı
  welcomeTitle: "Merhaba! Ben Karpuz 🐾",
  welcomeDesc:
    "santralistanbul'da doğru yeri bulman için buradayım.\nBirkaç bilgi gir, hemen başlayalım!",
  kvkkText:
    "Girdiğim bilgilerin yalnızca kampüs navigasyon uygulamasının kullanım istatistiklerini ölçmek amacıyla İstanbul Bilgi Üniversitesi tarafından işlenmesine ",
  kvkkBold: "KVKK",
  kvkkTextEnd: " kapsamında onay veriyorum.",

  // Kullanıcı rolleri
  roleStudent: "🎓 Öğrenci",
  roleTeacher: "👨‍🏫 Öğretmen",
  roleStaff: "🏢 Personel",
  roleGuest: "🙋 Misafir",

  // Karpuz tanıtım kartı
  karpuzIntroText:
    "Merhaba ben Karpuz. Kampüsün maskotlarından biriyim. Başlangıç noktanızı ve gitmek istediğiniz yeri yazarsanız size yol gösterebilirim. İsterseniz bulunduğunuz konumdan da başlayabilirsiniz.",

  // Kampüs adı
  campusName: "santralistanbul Kampüsü",

  // Onboarding adımları
  onboard0: "Hazır mısın? 🐾\nKampüsü birlikte keşfedelim!",
  onboard1: "Konumunu açmak için\nbu düğmeye dokun 📍",
  onboard2: "Gitmek istediğin binayı\nburaya yaz 🔍",
  onboard3: "Kategoriye göre filtrele:\nSosyal, Eğitsel, İdari...",
  onboard4: "Kampüsü keşfetmek için doğrudan\n'Konumunuzdan Başlatın' butonuna\ndokunun 🟢",
  onboard5:
    "Herhangi bir konuma dokununca kart açılır.\n'Buradan Başla' ile başlangıç noktanı belirle 🟢\nArdından varış sor: haritada gitmek\nistediğin noktaya dokun ya da aşağıya yaz 🗺",
  onboard6:
    "Biraz tombulum 🐾😅 Simüle ederken\nyavaş yürürüm. Sağ üstteki '1×' butonuna\nbasarak hızlandırabilirsin: 2× → 4× → 1×",
  onboard7: "Hazırım! İyi kampüs gezileri 🍉",

  // Onboarding navigasyon
  onboardTapStart: "Dokun, başla!",
  onboardTapRight: "Sağa dokun →",
  onboardBack: "← Geri",

  // Yeni: Favoriler, Son Gezilenler, Yakındakiler
  catFavorites: "Favoriler",
  catRecents: "Son Gezilenler",
  catNearby: "Yakındakiler",
  noFavoritesYet: "Henüz favori eklemediniz. Binalardaki yıldız simgesine dokunarak ekleyebilirsiniz. ⭐",
  noRecentsYet: "Henüz gezilen bir yer yok.",
  noNearbyFound: "Yakında bina bulunamadı (Konumunuzu açın).",
  btnFavorite: "Favori",
  btnFavorited: "Favorilerde",
  btnShare: "Paylaş",
  shareCopied: "Bağlantı kopyalandı!",

  // Yeni: Geri Bildirim Formu
  feedbackTitle: "Karpuz'a Yaz / Hata Bildir",
  feedbackDesc: "Bir hata gördün ya da önerin mi var? Karpuz dinliyor.",
  feedbackTypeBug: "Hata",
  feedbackTypeInfo: "Yanlış Bilgi",
  feedbackTypeSuggest: "Öneri",
  feedbackTypeOther: "Diğer",
  feedbackMsgPlaceholder: "Mesajınızı buraya yazın...",
  feedbackContactPlaceholder: "E-posta veya telefon (isteğe bağlı)",
  feedbackSend: "Gönder",
  feedbackSent: "Teşekkürler! Mesajın iletildi 🍉",
  feedbackSending: "Gönderiliyor...",
  feedbackClose: "Kapat",

  // Tema
  themeLight: "Açık",
  themeDark: "Koyu",

  // Sesli Navigasyon & Simülasyon
  voiceOn: "Sesli yönlendirme açık",
  voiceOff: "Sesli yönlendirme kapalı",
  simPause: "Duraklat",
  simResume: "Devam Et",
  simSpeedLabel: "Hız",
  simEnd: "Rotayı Bitir",
  stepJumpHint: "Adıma git",

  // AR Navigasyon
  arView: "AR Görünümü",
  arFind: "Kamera ile Bul",
  arHint: "Telefonunu kaldır ve oku takip et",
  arNoCamera: "Kameraya ulaşılamadı. Tarayıcı izinlerini kontrol edin.",
  arNoCompass: "Pusula kalibrasyonu için telefonu 8 çizerek sallayın.",
  arNoGps: "AR navigasyon için konum servislerini açın.",
  arNextTurn: "Sonraki dönüş",
  arDestination: "Hedef",
  arClose: "Haritaya Dön",

  // 3D & Harita Kontrolleri
  view3D: "3D Görünüm",
  view2D: "2D Görünüm",
  resetNorth: "Kuzeye Dön",
  campusOverview: "Tüm Kampüs",
} as const;

const EN: { [K in keyof typeof TR]: string } = {
  fromPlaceholder: "Enter Starting Point",
  toPlaceholder: "Enter Destination",
  searchDestPlaceholder: "Where do you want to go?",
  editToPlaceholder: "Search destination...",
  namePlaceholder: "Your Full Name",
  facultyPlaceholder: "Your Faculty (optional)",

  gpsError: "⚠️ Error",
  gpsActive: "📍 Active",
  gpsOff: "📍 Location",

  gpsNotSupported: "This browser does not support geolocation.",
  gpsDenied: "Location permission denied. On iPhone: Settings → Safari → Location → Allow",
  gpsUnavailable: "Location unavailable. Please try in an open area.",
  gpsTimeout: "Location timed out. Please try again.",

  yourLocation: "📍 Your Location",
  startFromLocation: "Start from My Location",
  useMyLocation: "📍 Use My Current Location",

  btnRoute: "🗺 Directions",
  btnPreview: "Preview",
  btnGpsNav: "Go (GPS)",
  btnOpenGps: "Enable GPS",
  btnStepsShow: "Steps",
  btnStepsHide: "Hide",
  btnShareLocation: "Share",
  shareLocationCopied: "🔗 Link copied!",
  friendPin: "Friend's location",
  btnStartHere: "🟢 Start Here",
  btnGoHere: "🔴 Go Here",
  btnGoHereArrow: "Go Here →",
  btnChange: "✏️ Change",
  btnEnterMap: "Enter Map →",
  btnOk: "OK",
  btnSkip: "Skip",

  pickFromTitle: "Select starting point",
  pickToTitle: "Select destination",
  pickFromDesc: "Tap a point on the map\nor select from the list below",
  pickToDesc: "Tap a point on the map\nor type where you want to go below",

  filterLabel: "Filter Buildings:",
  catAll: "All",
  catEgitsel: "Academic",
  catSosyal: "Social",
  catIdari: "Admin",
  catIslevsel: "Facilities",
  catOtopark: "Parking",
  catGiris: "Entrance",
  roomListTitle: "ROOM LIST",
  mahalUnit: "spaces",

  startPointLabel: "🟢 Your starting point",
  destPointLabel: "🔴 Your destination",
  minLabel: "min",
  minRemaining: "min left",
  thenLabel: "Then",

  stepWalk: "walk",
  stepTurnLeft: "turn left",
  stepTurnRight: "turn right",
  stepAfter: "after",
  stepArrived: "You have arrived",

  dirNorth: "North",
  dirNE: "NE",
  dirEast: "East",
  dirSE: "SE",
  dirSouth: "South",
  dirSW: "SW",
  dirWest: "West",
  dirNW: "NW",

  arrivedMsg: "You have arrived!",

  welcomeTitle: "Hello! I'm Karpuz 🐾",
  welcomeDesc:
    "I'm here to help you navigate santralistanbul.\nEnter a few details and let's get started!",
  kvkkText:
    "I consent to my information being processed solely to measure campus navigation app usage statistics by Istanbul Bilgi University under Turkey's ",
  kvkkBold: "Personal Data Protection Law (KVKK)",
  kvkkTextEnd: ".",

  roleStudent: "🎓 Student",
  roleTeacher: "👨‍🏫 Faculty",
  roleStaff: "🏢 Staff",
  roleGuest: "🙋 Guest",

  karpuzIntroText:
    "Hi, I'm Karpuz, one of the campus mascots. If you enter your starting point and destination, I can guide you. You can also start from your current location.",

  campusName: "santralistanbul Campus",

  onboard0: "Ready? 🐾\nLet's explore the campus together!",
  onboard1: "Tap this button\nto enable your location 📍",
  onboard2: "Type the building\nyou want to find here 🔍",
  onboard3: "Filter by category:\nSocial, Academic, Admin...",
  onboard4: "Tap the 'Start from My Location'\nbutton to start exploring\nthe campus 🟢",
  onboard5:
    "Tap any location to open its card.\nTap 'Start Here' to set your starting point 🟢\nThen ask for directions: tap a point\non the map or type below 🗺",
  onboard6:
    "I'm a bit slow 🐾😅 While simulating\nI walk slowly. Tap the '1×' button\nat the top right to speed up: 2× → 4× → 1×",
  onboard7: "All set! Happy campus exploring 🍉",

  onboardTapStart: "Tap to start!",
  onboardTapRight: "Tap right →",
  onboardBack: "← Back",

  // New: Favorites, Recents, Nearby
  catFavorites: "Favorites",
  catRecents: "Recents",
  catNearby: "Nearby",
  noFavoritesYet: "No favorites yet. Tap the star icon on any building to add. ⭐",
  noRecentsYet: "No recently viewed places yet.",
  noNearbyFound: "No nearby buildings found (Enable location).",
  btnFavorite: "Favorite",
  btnFavorited: "Favorited",
  btnShare: "Share",
  shareCopied: "Link copied!",

  // New: Feedback Form
  feedbackTitle: "Feedback / Report Issue",
  feedbackDesc: "Spotted an issue or have a suggestion? Karpuz is listening.",
  feedbackTypeBug: "Bug",
  feedbackTypeInfo: "Wrong Info",
  feedbackTypeSuggest: "Suggestion",
  feedbackTypeOther: "Other",
  feedbackMsgPlaceholder: "Type your message here...",
  feedbackContactPlaceholder: "Email or phone (optional)",
  feedbackSend: "Send",
  feedbackSent: "Thank you! Your message was sent 🍉",
  feedbackSending: "Sending...",
  feedbackClose: "Close",

  // Theme
  themeLight: "Light",
  themeDark: "Dark",

  // Voice Navigation & Simulation
  voiceOn: "Voice guidance on",
  voiceOff: "Voice guidance off",
  simPause: "Pause",
  simResume: "Resume",
  simSpeedLabel: "Speed",
  simEnd: "End Route",
  stepJumpHint: "Jump to step",

  // AR Navigation
  arView: "AR View",
  arFind: "Find with Camera",
  arHint: "Raise your phone and follow the arrow",
  arNoCamera: "Camera unavailable. Check browser permissions.",
  arNoCompass: "Wave the phone in a figure 8 to calibrate compass.",
  arNoGps: "Enable location to use AR navigation.",
  arNextTurn: "Next turn",
  arDestination: "Destination",
  arClose: "Back to Map",

  // 3D & Map Controls
  view3D: "3D View",
  view2D: "2D View",
  resetNorth: "Reset North",
  campusOverview: "Campus Overview",
};

type TKeys = keyof typeof TR;

const LANG_KEY = "karpuz_lang";

/** Runtime language: localStorage overrides build-time env var */
const getLang = (): "tr" | "en" => {
  if (typeof window !== "undefined") {
    const s = localStorage.getItem(LANG_KEY);
    if (s === "en" || s === "tr") return s;
  }
  return process.env.NEXT_PUBLIC_LANG === "en" ? "en" : "tr";
};

/** Type-safe translation lookup (runtime-aware) */
export const t = (key: TKeys): string =>
  getLang() === "en" ? EN[key] : (TR as Record<string, string>)[key];

/** True when the current language is English */
export const isEN = (): boolean => getLang() === "en";

/** Switch language and reload */
export const setLang = (l: "tr" | "en"): void => {
  localStorage.setItem(LANG_KEY, l);
  window.location.reload();
};

/** Personalised greeting, e.g. "Merhaba, Ayşe! 👋" / "Hello, Ayşe! 👋" */
export const greetUser = (firstName: string): string =>
  isEN() ? `Hello, ${firstName}! 👋` : `Merhaba, ${firstName}! 👋`;

const FLOOR_EN: Record<string, string> = {
  "ZEMİN KAT": "Ground Floor",
  "ALT KAT": "Basement",
  "ASMA KAT": "Mezzanine",
  "ÜST KAT": "Top Floor",
  "1. KAT": "1st Floor",
  "2. KAT": "2nd Floor",
  "2.KAT": "2nd Floor",
  "3. KAT": "3rd Floor",
  "4. KAT": "4th Floor",
  "5. KAT": "5th Floor",
};

const CAT_EN: Record<string, string> = {
  "DERSLİK": "Classroom",
  "LAB": "Lab",
  "LAB.": "Lab",
  "ATÖLYE": "Workshop",
  "AKADEMİK OFİS": "Academic Office",
  "İDARİ OFİS": "Administrative Office",
  "TOPLANTI ODASI": "Meeting Room",
  "KONFERANS SALONU": "Conference Hall",
  "OKUMA SALONU": "Reading Room",
  "KÜTÜPHANE": "Library",
  "KİTAP EVİ": "Bookstore",
  "KAFETERYA İÇ MEKAN": "Cafeteria",
  "DİĞER SOSYAL ALAN": "Social Area",
  "REVİR": "Health Center",
  "WC": "WC",
};

/** Translate a floor label from Turkish data */
export const tFloor = (floor: string): string =>
  isEN() ? (FLOOR_EN[floor] ?? floor) : floor;

/** Translate a room category from Turkish data */
export const tCat = (cat: string): string =>
  isEN() ? (CAT_EN[cat] ?? cat) : cat;
