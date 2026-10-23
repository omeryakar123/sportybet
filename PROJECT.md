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
- Spor kısmı: **Betco Sportsbook (probetlab)** — iframe + **seamless wallet**. Bakiye bizde, platform bizim cüzdan API'mizi çağırır. Doküman: `docs/integrations/betco-sportsbook.md`.

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

### Coolify
- Panel: `http://131.123.39.95:8000` · proje **sportybet** · uygulama uuid `jyiwgs7yf6tdcocutfidsfki`
- Build pack: **Docker Compose** (`/docker-compose.yml`), branch `main`, repo `omeryakar123/sportybet`
- Ortam değişkenleri Coolify'a girildi (sırlar repoda YOK). `SPORTSBOOK_API_KEY/SECRET` boş — gelince girilecek.
- Otomatik deploy: GitHub repo → Settings → Webhooks → `http://131.123.39.95:8000/webhooks/source/github/events/manual` (secret Coolify'daki "Manual webhook secret")

| Servis | Domain (Coolify'da atanacak) |
|---|---|
| web | https://sportybet.131.123.39.95.sslip.io |
| backoffice | https://bo-sportybet.131.123.39.95.sslip.io |
| api | https://api-sportybet.131.123.39.95.sslip.io (container port 4000) |

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

## 3a. Cüzdanlar AYRI (kullanıcı kararı)
- Oyuncu sitede **hangi cüzdanla oynayacağını seçer**: `Player.activeWallet = MAIN | BONUS` (`PUT /api/me/wallet`).
- Sportsbook `/wallet/balance` sadece seçili cüzdanı döner; `/debit` sadece ondan düşer. Tahminler de aynı.
- Kazanç/iade parayı düştüğü cüzdana döner (bonus tamamlandıysa ana paraya).
- Backoffice'te oyuncu başlığında iki bakiye + oynadığı cüzdan; Ayarlar'dan değiştirilebilir.

## 3b. Betco Sportsbook Entegrasyonu

| Bizim uç | Ne yapar |
|---|---|
| `POST /wallet/balance` | ANA + BONUS toplamını döner |
| `POST /wallet/debit` | Önce ANA, yetmezse BONUS'tan düşer; bölüşümü `WalletRequest`'e yazar; `Bet` kaydı açar |
| `POST /wallet/credit` | Kazancı stake bölüşümüyle orantılı yazar (bonus payı BONUS'a, bonus COMPLETED ise hepsi ANA'ya). Asla reddetmez |
| `POST /wallet/rollback` | Debit'i bir kez iade eder; bilinmeyen debit → `CancelledTransaction` (sonra gelirse 409) |
| `POST /webhooks/sportsbook` | `X-Webhook-Id` ile tekilleştirir; bet_placed → seçimler, bet_settled → durum + **bonus çevrimi**, balance_status_changed → GGR bakiye durumu |
| `GET /api/sportsbook/launch` | Oyuncu JWT ile → imzalı `/api/v1/launch/prepare` → launch_token |

- İmzalar: platform→biz `HMAC_SHA256(wallet_secret, ts + "." + rawBody)` (±300 sn); biz→platform `METHOD\nPATH\nTS\nSHA256(body)` ile `api_secret`.
- Cevap kuralları: iş reddi her zaman 4xx (asla 5xx); her `transaction_id` idempotent (ilk cevap aynen tekrar döner).
- Çevrim kuralı: bonus parasıyla oynanan kupon **won/lost** sonuçlanınca ve bonusun Spor Kurallarına uyuyorsa (bahis tipi, canlı/maç öncesi, min seçim, min seçim oranı, min toplam oran) stake çevrime eklenir.
- Backoffice → **Sportsbook (Betco)**: entegrasyon durumu, platform GGR bakiyesi, bakiye hareketleri (ledger), platform işlemleri (mutabakat), bizim cüzdan çağrı logu, webhook logu.

### Platforma verilecek adresler
| Alan | Değer |
|---|---|
| wallet_base_url | `https://api-sportybet.131.123.39.95.sslip.io/wallet` |
| webhook_url | `https://api-sportybet.131.123.39.95.sslip.io/webhooks/sportsbook` |
| allowed_domains | `sportybet.131.123.39.95.sslip.io` |
| wallet_secret | kullanıcı verdi → Coolify env `SPORTSBOOK_WALLET_SECRET` |

## 4. Backoffice Modülleri (BetConstruct referansı)

Menü yapısı (`apps/backoffice/src/Layout.tsx`), her öğe role göre görünür:

| Grup | Ekranlar |
|---|---|
| Dashboard | Bugün/Dün/Hafta/Ay filtreleri; 12 KPI kartı (yatırım, çekim, giriş, kayıt, oyuncu bakiyesi, kâr, bonus bakiyesi, düzeltmeler); Sportsbook özeti (maç öncesi / canlı / toplam: ciro, kazanç, açık bahis, GGR, kârlılık, bahis sayısı, ort. bahis, oyuncu); Bonus özeti; En çok oynanan 5 spor |
| Oyuncular | Filtreler (arama, ID, durum, kategori, KYC, test, btag, kayıt tarihi, min bakiye), sunucu sayfalama, CSV, oyuncu oluşturma |
| Oyuncu detay | **Genel**: kişisel/iletişim/promosyon/hesap bilgileri + 20 Player KPI + notlar · **Finansal**: 2 cüzdan, yatırım/çekim talepleri, işlemler (tip/cüzdan filtresi), manuel işlem (yatırım, çekim, düzeltme ±) · **Raporlar**: spor bahisleri (seçimler açılır), bonuslar (ver / iptal, çevrim %), girişler · **Ayarlar**: durum, kategori, KYC, spor/casino engeli, bonustan hariç, test, şifre sıfırlama |
| Raporlar | Sportsbook (günlük ciro/GGR/marj), Finans (günlük + ödeme sistemi kırılımı), Bonus (verilen bonuslar, dönüşüm oranı), Oyuncu raporu |
| Finans | Yatırım talepleri, Çekim talepleri (Onayla → Öde / Reddet, 30 sn otomatik yenileme, yeni talepte ses), Tüm işlemler, Ödeme sistemleri |
| Promosyon | Bonuslar (2 adım: Kurulum + Spor Kuralları; verilen/dönüşen istatistiği), Bonus talepleri (onay/red), Promo kodlar (kullananlar listesi) |
| Sportsbook | Spor bahisleri (tarih, durum, canlı, tip, kupon, oyuncu, min stake, bonuslu), Betco entegrasyonu |
| Kullanıcı Yönetimi | Admin kullanıcıları + roller (sadece SUPERADMIN), Audit log |
| CMS | Bannerlar (10 slot), Promosyonlar, Sayfalar (/page/slug), Site ayarları (logo, SEO, sosyal, menüler JSON), Web/Mobil CSS |

### Roller (`apps/api/src/routes/admin.ts → PERMS`)
SUPERADMIN her şey · ADMIN kullanıcı yönetimi hariç · FINANCE ödemeler/raporlar/manuel bakiye · RISK oyuncu kısıtlama, bonus, bahis · SUPPORT görüntüleme + not · CMS içerik + promo kod. Her yazma işlemi `AuditLog`'a düşer.

### Ödeme akışı
- **Çekim**: oyuncu talep → tutar ANA cüzdandan hemen **bloke** → NEW → (Onayla) PENDING → (Öde) PAID. Red/iptal → iade. Aktif bonusu "çekime izin ver" kapalıysa çekim yapılamaz; açık çekim varken ikincisi açılamaz.
- **Yatırım**: oyuncu talep (yatırım bonusu seçebilir) → admin/PSP "Öde" → ANA cüzdana yatar → seçilen yatırım bonusu `yatırım × %` (maks sınırıyla) otomatik verilir.
- Manuel yatırım/çekim de `PaymentRequest` (PAID) kaydı açar → raporlara girer. Düzeltme ± ayrı tiptir.
- Gerçek PSP entegrasyonu (FulgurPay vb.) sonra: PSP callback'i `processPayment(..., "pay")` çağıracak.

### Bonus kuralları
- Oyuncunun aynı anda **tek aktif bonusu** olur (bonus cüzdanı tek havuz).
- Kaynaklar: admin verir · yatırım bonusu · promo kod (anında) · oyuncu talebi (admin onaylar).

### Test oyuncusu
`isTest = true` olan oyuncular dashboard ve raporlara girmez. `test_wallet` (id 1) test oyuncusu olarak işaretli.

## 4b. Site API'si (frontend bunu kullanacak) — `apps/api/src/routes/site.ts`

| Uç | Açıklama |
|---|---|
| `POST /api/auth/register`, `/api/auth/login` | JWT döner (10 hatalı denemede kilit) |
| `GET /api/me`, `PATCH /api/me`, `POST /api/me/password` | profil |
| `GET /api/me/transactions` `bets` `bonuses` `payments` | geçmişler (bonuslarda `progress` %) |
| `GET /api/payment-systems?type=DEPOSIT\|WITHDRAWAL` | yöntemler + istenecek alanlar |
| `POST /api/payments/deposit` `{paymentSystem, amount, bonusId?}` | yatırım talebi |
| `POST /api/payments/withdraw` `{paymentSystem, amount, info}` | çekim talebi |
| `POST /api/payments/:id/cancel` | NEW çekimi iptal |
| `GET /api/bonuses/available`, `POST /api/bonuses/:id/request` | bonus listesi / talep |
| `POST /api/promo/redeem` `{code}` | promo kod |
| `GET /api/sportsbook/launch` | Betco iframe launch token |
| `GET /api/cms/banners?group=&platform=`, `/api/cms/promotions[/:slug]`, `/api/cms/pages/:slug`, `/api/cms/settings/:key` | CMS içerikleri (`site_general`, `seo`, `social`, `menus`, `web_css`, `mobile_css`) |

## 4c. Tahmin Piyasaları (Polymarket tarzı)

Kullanıcının verdiği örnek feed: `apps/api/seed/predictions-sample.json` (20 piyasa; 957 toplam). Sağlayıcı URL/anahtarı henüz yok → kendi motorumuz + feed senkronu.

- **Pay**: sonuç gerçekleşirse 1 ₺ öder. Fiyat 0–1, olasılık = fiyat × 100, oran = 1/fiyat.
- **NO_IMPACT** (sabit oran): fiyatı admin belirler (marjlı, toplam > 1). Pay = tutar / fiyat. Bozdurma = pay × güncel fiyat.
- **AFFECTS_ODDS** (dinamik, FPMM): `fiyat_i ∝ 1/rezerv_i`; alım rezervleri değiştirir. Komisyon % ve başlangıç likiditesi piyasa bazında. (Örnek feed'deki rezerv/fiyat ilişkisi doğrulandı.)
- **Yapılar**: STANDALONE, GROUP_PARENT (maç sayfası) + GROUP_CHILD (alt piyasalar).
- **Durumlar**: draft → active ⇄ locked (sebep sitede görünür) → closed (son tarih geçince otomatik, 1 dk cron) → resolved (kazanan seçilir, otomatik ödeme) | cancelled (tam iade).
- **Bonus**: bonus cüzdanıyla alınan pozisyon sonuçlanınca stake çevrime eklenir.
- **Feed senkronu**: Backoffice → Tahminler → Ayarlar'da URL + anahtar; 5 dk'da bir `?page=&limit=` ile çekilir, dış ID ile eşleşir, fiyatlar feed'den gelir (yerelde NO_IMPACT), sonuçlandırma bizde. JSON yapıştırarak içe aktarma da var.
- **Genel işlem modu**: NORMAL / PAUSED + site duyurusu (`site.tradingMode`, `site.notice` feed formatıyla aynı).

Site uçları: `GET /api/predictions` (feed formatı: success/data/pagination/site), `GET /api/predictions/:slug` (myPositions dahil), `GET /api/prediction-categories`, `GET /api/predictions/leaderboard?days=7`, `POST /api/predictions/:id/buy {outcomeId, amount}`, `GET /api/predictions/positions/:id/quote`, `POST /api/predictions/positions/:id/sell`, `POST /api/predictions/:id/save`, `GET /api/me/predictions`.

Backoffice: Tahmin Piyasaları (KPI, filtre, Al/Sat/★ hızlı aç-kapa, Aç/Kilitle/Sonuçlandır), Detay (risk tablosu: sonuç bazında açık tutar, kazanırsa ödeme, kasa K/Z; fiyat güncelle; pozisyonlar; alt piyasalar; kurallar), Pozisyonlar, Kategoriler, Ayarlar/Feed/İçe aktar.

## 4d. Demo veri
Backoffice → Kullanıcı Yönetimi → Sistem / Demo Veri (SUPERADMIN) veya env `DEMO_SEED=1`. Demo oyuncular btag `DEMO`, şifre `demo123456`. **Canlıdan önce "Demo Veriyi Sil".**

## 5. Site (frontend) — TASARIM UYGULANDI

Kullanıcının verdiği referans (docs/references/site-html/anasayfa-full.html + site-css/tailwind-utilities.css) temel alındı; token'lar birebir `apps/web/tailwind.config.js` içinde (koyu tema #17171a, turuncu primary #ffbe7b, Manrope). Marka: SportyBet (CMS'ten logo/site adı değiştirilebilir).

Sayfalar: Ana sayfa (hero, Spor/Tahminler kartları, arama, CMS hero banner slider, "Tahminlere Göz At" kaydırmalı kartlar, Betco canlı maç widget'ı) · /spor (Betco iframe + üstte Ana/Bonus cüzdan seçici, cüzdan değişince oturum yeniden açılır) · /tahminler (tanıtım şeridi, kategori sekmeleri, arama/sıralama/kaydedilenler, kart grid) · /tahminler/:slug (sonuç seçimi, sağda yapışkan Tahmin Kuponu: tutar + hızlı butonlar + cüzdan seçici + olası kazanç; bozdurma teklifi; kurallar; grup alt piyasaları) · /liderlik · /promosyonlar(+detay, promo kod kutusu) · /page/:slug · /vip (yakında) · /para-yatir (yöntem kartları, yatırım bonusu seçimi, talep listesi) · /para-cek (dinamik alanlar, bloke uyarısı, NEW iptali) · /hesap (profil, tahminlerim+bozdur, işlemler, kuponlarım, bonuslarım+talep+kod, güvenlik). Mobil: alt gezinme + hamburger sidebar.

Eski "## 5. Site" notları:
## 5. Site (eski)

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
- [x] GitHub repo `omeryakar123/sportybet` — kod push'landı
- [x] Coolify: Docker Compose, env, domainler (HTTPS) atandı, deploy başarılı — api/web/backoffice/db çalışıyor
- [x] Betco seamless wallet + webhook + launch + backoffice Sportsbook ekranı yazıldı
- [x] Betco api_key/secret Coolify'da; `/api/v1/me` ve `/billing` 200. Partner slug `oy`, allowed_domains + webhook_url doğru
- [x] Cüzdan testleri canlıda geçti (checklist 1,5,6,7,13,14,15 + imza reddi); launch→consume→iframe sitede açıldı
- [ ] GitHub → Coolify otomatik deploy webhook'u (kullanıcı GitHub repo ayarlarından ekleyecek); şimdilik deploy Coolify API ile tetikleniyor
- [x] Backoffice tam modül seti (bkz. bölüm 4) canlıda
- [x] Ödeme akışı canlıda test edildi: çekim bloke/red-iade, açık çekim engeli, yatırım + %50 yatırım bonusu, aktif bonusla çekim engeli, bonus iptali
- [ ] Gerçek bahisle test: webhook bet_placed/bet_settled (checklist 9–12, 16–19)
- [ ] Gerçek PSP entegrasyonu (callback → processPayment)
- [ ] Site frontend (sıradaki adım)
- [ ] Test oyuncusu `test_wallet` (id 1, 2075 ₺ test bakiyesi) canlıya geçmeden silinmeli/kapatılmalı
- [ ] Site tasarımı 1:1 — bekliyor: Tailwind kodları + ekran görüntüleri
- [ ] Uçtan uca test (doküman "Test checklist" 1–19)
- [ ] İlk derleme testi (bulut ortamında npm kapalıydı; Coolify build'inde veya lokalde yapılacak)

## Karar Günlüğü

- **2026-10-20** — Proje başlatıldı. Stack: Fastify + Prisma + Postgres, iki ayrı React/Vite uygulaması (backoffice, web). Deploy: GitHub → Coolify (Docker Compose). İki cüzdan modeli (MAIN/BONUS) ve çevrim tamamlanınca bonus→ana para aktarımı kararlaştırıldı. Backoffice BetConstruct referansıyla, site nolurKi referansıyla tasarlanacak. Her site görselinin CMS karşılığı olacak.
- **2026-10-20** — Notlar: bulut ortamında npm registry ve GitHub API engelli; mevcut GitHub token geçersiz; Coolify bilgisi yok. Sportsbook API anahtarı mesajda iletilmedi.
- **2026-10-20** — Spor sağlayıcısı: Betco Sportsbook (probetlab), iframe + seamless wallet. Kararlar: /balance = ANA+BONUS; debit önce ANA sonra BONUS; credit stake oranıyla geri; çevrim bonuslu kupon won/lost + kural uyumu ile. Kullanıcı: "şimdilik backoffice + spor, site tasarımı sonra". Coolify'daki mevcut uygulama (railpack) Docker Compose'a çevrildi.
- **2026-10-20** — İlk canlı deploy. Coolify deploy: `POST /api/v1/deploy?uuid=jyiwgs7yf6tdcocutfidsfki`. Backoffice admin kullanıcısı `admin` (şifre Coolify env `ADMIN_PASSWORD`).
- **2026-10-20** — Backoffice tamamlandı (BC referansıyla tüm menü). Kararlar: tek aktif bonus; çekim talepte bloke; manuel yatırım/çekim raporlara PaymentRequest ile girer; test oyuncuları raporlardan hariç; roller URL önekine göre (PERMS).
- **2026-10-20** — Tahmin piyasaları eklendi (motor + API + backoffice). Cüzdanlar ayrıldı: oyuncu aktif cüzdan seçer. Backoffice görünümü BC'ye yaklaştırıldı. Demo veri araçları.
- **2026-10-20** — Site frontend'i kullanıcı tasarımıyla (nolurKi referansı) yeniden yazıldı; SportyBet markası. VITE_API_URL boşsa `api-<host>` tahmini. Betco live-games widget ucu eklendi (`GET /api/sportsbook/widgets/live-games`).


## Çoklu Site (Multi-tenant) — 2026-10-20
- **Site** modeli: code (benzersiz), name, domain (benzersiz), isActive, not + site bazlı Betco kimliği (sbApiUrl/sbApiKey/sbApiSecret/sbWalletSecret; boşsa env varsayılanı).
- Site bazlı veriler: Player (username site içinde benzersiz), Bonus, PromoCode, PaymentSystem (+config Json: kripto için depositAddress/network/requireTxid), CmsBanner/CmsPromotion/CmsPage, CmsSetting (@@id [siteId,key]). **Tahmin piyasaları GLOBAL** (tüm siteler aynı piyasaları görür; prediction_* ayarları siteId=1'de).
- Site çözümü (oyuncu API): X-Site başlığı (kod) → Origin/Referer domaini → varsayılan site 1. Web build'ine VITE_SITE_CODE verilirse hep o kod gönderilir.
- Backoffice: üst barda **Site seçici** (localStorage bo_site → tüm /admin isteklerine X-Site); **Kullanıcı Yönetimi → Siteler** sayfasından site oluştur/düzenle (SUPERADMIN yazar, ADMIN görür). Yeni site açılınca ödeme sistemleri + site_general CMS ayarı otomatik kurulur (seedSiteDefaults).
- Tüm admin listeleri/raporlar/dashboard seçili siteye göre süzülür (reports.ts fonksiyonları siteId parametresi aldı).
- Betco: launch/widget oyuncunun sitesinin kimliğiyle (sbClient(sbCreds(site))); wallet/webhook imzası env + tüm sitelerin wallet secret'ları denenerek doğrulanır (verifyPlatformSignature multi-secret). Cüzdan/webhook URL'leri tüm siteler için ortak.
- Açılışta varsayılan Site id=1 seed edilir (DEFAULT_SITE_CODE/NAME/DOMAIN env). PUBLIC_API_URL env → Siteler sayfasında wallet/webhook URL gösterimi.
- **Kripto yatırım akışı**: PaymentSystem.config.depositAddress varsa sitede adres + kopyala + ağ uyarısı + (requireTxid ise) zorunlu TXID alanı; TXID info.txid olarak talebe yazılır ve backoffice Finans ekranında görünür. CryptoUSDT (site 1) açılışta config ile dolduruldu.
- Spor Bahisleri (BO) 15 sn'de bir otomatik yenilenir (kapatılabilir).

## Kendi Sportsbook Motoru (API-Football) — 2026-10-23
- **Betco kaldırıldı**: routes/sportsbook.ts, services/seamless.ts, services/sportsbook.ts silindi; site Sport iframe'i ve BO "Betco Entegrasyonu" sayfası değiştirildi.
- **Feed**: services/feed.ts — API-Football (api-sports.io) adapter, feed-agnostik. Env: APISPORTS_KEY, APISPORTS_URL (v3.football.api-sports.io). Ücretsiz plan 100 istek/gün → kota-dostu senkron.
- **Motor**: services/sb.ts — marj (withMargin), syncFixtures (30dk), syncOdds (3sa, max 15 maç), syncResults (5dk, sadece başlamış maç varsa, tek çağrı/20 maç), settleEvent (FT+skor → otomatik kazandı/kaybetti/iade), placeBet (kombine/tekli, cüzdan debit, limitler). Config CmsSetting key `sportsbook_config` (siteId=1): enabled, marginPct(6), leagues[], maxStake, maxWin, maxSelections, syncDays.
- **Modeller**: SbEvent (fixtureId unique, status, skor, isOpen, featured), SbMarket (key: 1x2/ou25/btts), SbSelection (baseOdds, odds=marjlı, result). BetSelection.sbSelectionId → settlement eşleşmesi. Bet/wallet.move yeniden kullanıldı.
- **API**: site /api/sb/leagues, /sb/events, /sb/event/:id, /sb/bet, /sb/my-bets. Admin /admin/sb/status|config|events|events/:id/toggle|featured|settle, /markets/:id/toggle, /sync, /sync-results.
- **Frontend**: web Sport.tsx (lig filtresi + maç listesi 1X2/KG + çalışan kupon, kombine/tekli, mobil alt kupon çubuğu); Home "Günün Maçları" teaser. BO Trading.tsx (maçlar: aç/kapa + manuel settle + sync; ayarlar: marj/lig/limit + feed durumu).
- **Doğrulandı**: key çalışıyor (Ömer Yakar, Free), bugün 441 maç + gerçek oranlar (Alanyaspor 1.95/3.10/3.90). Cloud/cihaz VM api-sports.io'ya çıkamıyor (egress) — motor Coolify sunucusunda çalışır.
- Not: APISPORTS_KEY compose'da default; Coolify env'ine taşınıp rotate edilmeli. Canlı/in-play faz 2 (feed 15sn gecikmeli, prematch için ideal).
