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
  onboard4: "Yol tarifi almak için\nburaya dokun 🗺",
  onboard5:
    "Herhangi bir konuma dokununca kart açılır.\n'Buradan Başla' ile başlangıç noktanı belirle 🟢\nArdından varış sor: haritada gitmek\nistediğin noktaya dokun ya da aşağıya yaz 🗺",
  onboard6:
    "Biraz tombulum 🐾😅 Simüle ederken\nyavaş yürürüm. Sağ üstteki '1×' butonuna\nbasarak hızlandırabilirsin: 2× → 4× → 1×",
  onboard7: "Hazırım! İyi kampüs gezileri 🍉",

  // Onboarding navigasyon
  onboardTapStart: "Dokun, başla!",
  onboardTapRight: "Sağa dokun →",
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
    "I consent to my information being processed solely to measure usage statistics of the campus navigation application by Istanbul Bilgi University under ",
  kvkkBold: "KVKK",
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
  onboard4: "Tap here to get\ndirections 🗺",
  onboard5:
    "Tap any location to open its card.\nTap 'Start Here' to set your starting point 🟢\nThen ask for directions: tap a point\non the map or type below 🗺",
  onboard6:
    "I'm a bit slow 🐾😅 While simulating\nI walk slowly. Tap the '1×' button\nat the top right to speed up: 2× → 4× → 1×",
  onboard7: "All set! Happy campus exploring 🍉",

  onboardTapStart: "Tap to start!",
  onboardTapRight: "Tap right →",
};

type TKeys = keyof typeof TR;

const lang: { [K in keyof typeof TR]: string } =
  process.env.NEXT_PUBLIC_LANG === "en" ? EN : TR;

/** Type-safe translation lookup */
export const t = (key: TKeys): string => lang[key];

/** True when the app is built in English mode */
export const isEN = process.env.NEXT_PUBLIC_LANG === "en";

/** Personalised greeting, e.g. "Merhaba, Ayşe! 👋" / "Hello, Ayşe! 👋" */
export const greetUser = (firstName: string): string =>
  isEN ? `Hello, ${firstName}! 👋` : `Merhaba, ${firstName}! 👋`;
