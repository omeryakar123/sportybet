# SportyBet — Proje Hafızası

> Bu dosya projenin "beyni". Yeni bir sohbete geçersen Claude'a ilk olarak bu dosyayı ver:
> **"Masaüstündeki sportybet/PROJECT.md dosyasını oku, kaldığımız yerden devam edelim."**
> Her çalışma oturumunun sonunda "Karar Günlüğü" ve "Durum" bölümleri güncellenir.

---

## 1. Amaç

Sıfırdan bir **sportsbook (spor bahis) sitesi**:

- **Backoffice** (ayrı uygulama) — BetConstruct backoffice benzeri: oyuncular, finans, spor bahisleri, bonuslar, promo kodlar, CMS.
- **Site** (ayrı uygulama) — müşteri tarafı. Tasarım, verilen referansın (nolurKi tarzı koyu tema) **1:1 kopyası** olacak.
- İkisi **aynı API ve veritabanına** bağlı.
- **Kural:** Sitedeki her görsel/içeriğin **CMS panelinde bir karşılığı** olmalı (banner slotları, promosyonlar, sayfalar, CSS, logo, menüler).
- Spor verisi (maçlar/oranlar) dış bir **sportsbook API sağlayıcısından** gelecek.

## 2. Mimari

```
sportybet/
├── apps/
│   ├── api/          Node 22 + Fastify + Prisma + PostgreSQL  (port 4000)
│   ├── backoffice/   React + Vite + Tailwind (açık tema, BC benzeri)
│   └── web/          React + Vite + Tailwind (koyu tema, site)
├── docs/references/  Kullanıcının gönderdiği ekran görüntüleri ve HTML referansları
├── docker-compose.yml   Coolify deploy (db + api + web + backoffice)
├── .env.example
└── PROJECT.md        ← bu dosya
```

Akış: **VS Code → git push → GitHub → webhook → Coolify build & deploy → canlı site**

### Domain planı (Coolify'da atanacak — kesinleşmedi)
| Servis | Örnek domain |
|---|---|
| web | sportybet.<domain> |
| backoffice | bo.sportybet.<domain> |
| api | api.sportybet.<domain> |

## 3. Cüzdan Mantığı (kritik)

Her oyuncunun **2 cüzdanı** var (`Wallet` tablosu, `type` alanı):

| Cüzdan | Ne girer | Çekilebilir mi |
|---|---|---|
| **MAIN** — Ana para | Yatırımlar, nakit bahis kazançları, bonus dönüşümü | Evet |
| **BONUS** — Bonus cüzdanı | Verilen bonuslar, bonusla oynanan bahis kazançları | Hayır |

- Bonus verilince tutar **BONUS** cüzdanına yatar, `PlayerBonus` kaydı açılır.
- Çevrim şartı = `bonus tutarı × wageringMultiplier`.
- Bonus kurallarına uyan her sonuçlanan bahis `wagerDone`'a eklenir (`services/bonus.ts → addWagering`).
- `wagerDone ≥ wagerRequired` olunca → BONUS bakiyesi (varsa `maxPayout` sınırıyla) **MAIN'e aktarılır**, bonus `COMPLETED` olur.
- Süresi dolan bonus → BONUS cüzdanı sıfırlanır, `EXPIRED` (5 dakikada bir cron).
- Her hareket `Transaction` tablosuna `balanceAfter` ile yazılır; bakiye eksiye düşemez; satır kilidi (`FOR UPDATE`) kullanılır.

## 4. Backoffice Modülleri (referans: BetConstruct ekran görüntüleri)

| Modül | Durum | Not |
|---|---|---|
| Giriş (admin JWT) | ✅ iskelet | İlk açılışta `ADMIN_USERNAME/ADMIN_PASSWORD` ile süper admin oluşur |
| Dashboard | ✅ iskelet | 24s KPI'lar |
| Oyuncular listesi | ✅ iskelet | arama, iki cüzdan bakiyesi |
| Oyuncu detay → Genel | ✅ iskelet | kişisel / hesap / promosyon bilgileri, engelleme toggle'ları |
| Oyuncu detay → Finansal | ✅ iskelet | 2 cüzdan bakiyesi, işlemler, manuel yatırım/çekim/düzeltme |
| Oyuncu detay → Spor Bahisleri | ✅ iskelet | kupon + seçimler (BC tablosu gibi) |
| Oyuncu detay → Bonuslar | ✅ iskelet | **oyuncuya bonus verme**, çevrim ilerlemesi |
| Tüm spor bahisleri | ✅ iskelet | durum / canlı filtresi |
| Bonuslar (tanım) | ✅ iskelet | 2 adımlı: Kurulum + Spor Kuralları (BC "Add Free Bet Bonus" gibi) |
| Promo kodlar | ✅ iskelet | BC "Add Or Edit Promo Code" alanları |
| CMS → Bannerlar | ✅ iskelet | grup = sitedeki slot |
| CMS → Promosyonlar | ✅ iskelet | HTML içerik + önizleme |
| CMS → Web/Mobil CSS | ✅ iskelet | siteye canlı enjekte edilir |
| Raporlar, KYC, Ödeme sistemleri, Risk, Roller | ⏳ sonra | |

Referans görseller: `docs/references/backoffice/`

## 5. Site

- Şu an: sidebar (sporlar), header (Ana para + Bonus bakiyesi), giriş/kayıt, CMS banner slotları, maç listesi, promosyonlar.
- Tasarım token'ları referans HTML'den çıkarıldı (`apps/web/tailwind.config.js`). Primary yeşil `#00ae61`.
- **Bekleniyor:** kullanıcının göndereceği Tailwind kodları + ekran görüntüleri → 1:1 kopya.
- Referans HTML: `docs/references/site-html/` (home, ozel-oranlar, hesap)

### CMS ↔ Site eşlemesi
| Sitedeki alan | CMS karşılığı |
|---|---|
| Ana sayfa hero slider | Banner grubu `homepage-hero` |
| Ana sayfa sol/sağ banner | `homepage-main-left` / `homepage-main-right` |
| Spor / Canlı üst banner | `sport-top` / `live-top` |
| Promosyonlar sayfası | CMS → Promosyonlar |
| Özel CSS | CMS → CSS (`web_css`, `mobile_css`) |
| Logo, menüler, SEO | ⏳ `CmsSetting` anahtarları ile eklenecek |

## 6. API Uç Noktaları (özet)

- Public: `POST /api/auth/register|login`, `GET /api/me`, `GET /api/sports`, `GET /api/events`, `GET /api/cms/*`
- Admin (`Bearer` token): `/admin/login`, `/admin/dashboard`, `/admin/players[/:id[/transactions|bets|bonuses|adjust|notes]]`, `/admin/bets`, `/admin/bonuses`, `/admin/promo-codes`, `/admin/cms/{banners|promotions|pages|settings/:key}`

## 7. Ortam Değişkenleri

`.env.example` dosyasına bak. Sırlar (token, şifre, API anahtarı) **asla repoya girmez** — Coolify panelinde Environment Variables olarak girilir.

## 8. Lokal Çalıştırma

```bash
cp .env.example .env            # değerleri doldur
docker compose up -d db         # sadece veritabanı
cd apps/api && npm i && npx prisma db push && npm run dev
cd apps/backoffice && npm i && npm run dev   # http://localhost:5174
cd apps/web && npm i && npm run dev          # http://localhost:5173
```

---

## Durum (son güncelleme: 2026-10-20)

- [x] Masaüstünde `sportybet` klasörü
- [x] Monorepo iskeleti (api / backoffice / web), veri modeli, cüzdan + bonus servisleri
- [x] Backoffice ilk sayfalar, site ilk iskelet, docker-compose
- [ ] **GitHub repo** — bekliyor: boş repo `omeryakar123/sportybet` açılıp Claude GitHub App'e erişim verilmeli
- [ ] **Coolify** — bekliyor: Coolify URL + API token, ve Coolify domainine ağ izni
- [ ] **Sportsbook API** — bekliyor: sağlayıcı adı, doküman, anahtar (`SPORTSBOOK_API_URL/KEY`)
- [ ] Site tasarımı 1:1 — bekliyor: Tailwind kodları + ekran görüntüleri
- [ ] Bahis yerleştirme + settlement + bonus çevrim entegrasyonu (sağlayıcı API'sine bağlı)
- [ ] İlk derleme testi (bulut ortamında npm kapalıydı; Coolify build'inde veya lokalde yapılacak)

## Karar Günlüğü

- **2026-10-20** — Proje başlatıldı. Stack: Fastify + Prisma + Postgres, iki ayrı React/Vite uygulaması (backoffice, web). Deploy: GitHub → Coolify (Docker Compose). İki cüzdan modeli (MAIN/BONUS) ve çevrim tamamlanınca bonus→ana para aktarımı kararlaştırıldı. Backoffice BetConstruct referansıyla, site nolurKi referansıyla tasarlanacak. Her site görselinin CMS karşılığı olacak.
- **2026-10-20** — Notlar: bulut ortamında npm registry ve GitHub API engelli; mevcut GitHub token geçersiz; Coolify bilgisi yok. Sportsbook API anahtarı mesajda iletilmedi.
