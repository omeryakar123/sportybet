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
| Tüm spor bahisleri | ✅ | durum / canlı / kupon / oyuncu / bonuslu filtresi, GGR toplamı |
| Sportsbook (Betco) | ✅ | durum, GGR bakiye, ledger, mutabakat, cüzdan & webhook logları |
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
- [x] GitHub repo `omeryakar123/sportybet` oluşturuldu (kullanıcı) — **push bekliyor**: Claude GitHub App bu repoya kurulmalı
- [x] Coolify: uygulama Docker Compose'a çevrildi, env değişkenleri girildi — **domain ataması ilk push'tan sonra**
- [x] Betco seamless wallet + webhook + launch + backoffice Sportsbook ekranı yazıldı
- [ ] Betco `api_key` + `api_secret` (partner oluşturulunca verilir) → Coolify env
- [ ] Betco tarafında partner'a wallet_base_url / webhook_url / allowed_domains girilmesi
- [ ] Site tasarımı 1:1 — bekliyor: Tailwind kodları + ekran görüntüleri
- [ ] Uçtan uca test (doküman "Test checklist" 1–19)
- [ ] İlk derleme testi (bulut ortamında npm kapalıydı; Coolify build'inde veya lokalde yapılacak)

## Karar Günlüğü

- **2026-10-20** — Proje başlatıldı. Stack: Fastify + Prisma + Postgres, iki ayrı React/Vite uygulaması (backoffice, web). Deploy: GitHub → Coolify (Docker Compose). İki cüzdan modeli (MAIN/BONUS) ve çevrim tamamlanınca bonus→ana para aktarımı kararlaştırıldı. Backoffice BetConstruct referansıyla, site nolurKi referansıyla tasarlanacak. Her site görselinin CMS karşılığı olacak.
- **2026-10-20** — Notlar: bulut ortamında npm registry ve GitHub API engelli; mevcut GitHub token geçersiz; Coolify bilgisi yok. Sportsbook API anahtarı mesajda iletilmedi.
- **2026-10-20** — Spor sağlayıcısı: Betco Sportsbook (probetlab), iframe + seamless wallet. Kararlar: /balance = ANA+BONUS; debit önce ANA sonra BONUS; credit stake oranıyla geri; çevrim bonuslu kupon won/lost + kural uyumu ile. Kullanıcı: "şimdilik backoffice + spor, site tasarımı sonra". Coolify'daki mevcut uygulama (railpack) Docker Compose'a çevrildi.
