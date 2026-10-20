Genel bakış
Betco Sportbook, partner sitelerine iframe ile gömülebilen bir sportsbook platformudur. Bakiye partner tarafında tutulur (seamless wallet); platform bahis kabul eder, sonuçlandırır ve partner wallet API'sine debit/credit çağrısı yapar.

Entegrasyon özeti
Admin panelden partner oluştur → api_key + api_secret
Partner wallet API implement et (/balance, /debit, /credit, /rollback) — cevap kurallarına mutlaka uy
Backend'den launch token veya iframe URL al
Frontend'de iframe göster
Webhook URL ayarla → bahis olaylarını dinle; mutabakat için sorgulama API'sini kullan
open_bet_history / deposit event'lerini dinle → kendi UI'ını göster
Platform bakiyeni takip et: GGR komisyonu bakiyeden düşer, bakiye bitince bahis alınmaz (GGR ve bakiye)
Base URL	https://sportbook.probetlab.com
Partner API prefix	/api/v1/*
Admin API prefix	/api/admin/* (sadece platform yöneticisi)
SDK	/sdk/sportsbook-sdk.js
Content-Type	application/json
Mimari
Partner Backend                    Sportsbook Platform                 Partner Wallet
      │                                    │                                  │
      │ POST /api/v1/launch/prepare         │                                  │
      ├───────────────────────────────────►│                                  │
      │◄────────── launch_token ───────────┤                                  │
      │                                    │                                  │
Partner Frontend                           │                                  │
      │ POST /api/v1/launch/consume         │                                  │
      ├───────────────────────────────────►│                                  │
      │◄────────── iframe_url ─────────────┤                                  │
      │ iframe → Sportsbook UI             │                                  │
      │                                    │ POST /balance, /debit, /credit   │
      │                                    ├─────────────────────────────────►│
      │◄──────── webhook (bet_placed/won) ─┤                                  │
Partner onboarding
Platform yöneticisi admin panel (/admin) veya admin API ile partner oluşturur.

Admin: Partner oluştur
POST /api/admin/tenants

Header: X-Admin-Key: <ADMIN_KEY>

Alan	Tip	Zorunlu	Açıklama
name	string	Evet	Partner görünen adı
slug	string	Evet	Benzersiz slug (a-z0-9-)
wallet_base_url	URL	Evet	Partner wallet API base URL
wallet_secret	string	Evet	Min 16 karakter, wallet + webhook imzası
allowed_domains	string[]	Evet	iframe consume için izinli domainler
swarm_site_id	number	Hayır	BetConstruct site ID (varsayılan: DEFAULT_SITE_ID)
swarm_socket_url	URL	Hayır	Swarm WSS URL (varsayılan: DEFAULT_SWARM_URL)
webhook_url	URL	Hayır	Bahis olay bildirimleri
{
  "name": "Acme Bahis",
  "slug": "acme-bahis",
  "wallet_base_url": "https://partner.com/wallet",
  "wallet_secret": "partner-wallet-secret-min-16-chars",
  "allowed_domains": ["partner.com", "www.partner.com"],
  "swarm_site_id": 1872355,
  "swarm_socket_url": "wss://eu-swarm-ws-re.betcoswarm.com/",
  "webhook_url": "https://partner.com/webhooks/sportsbook"
}
Response (201):

{
  "success": true,
  "data": {
    "tenant_id": "cuid...",
    "slug": "acme-bahis",
    "api_key": "sb_a1b2c3...",
    "api_secret": "64char_hex_secret_shown_once",
    "launch_endpoint": "https://.../api/v1/launch",
    "launch_prepare_endpoint": "https://.../api/v1/launch/prepare",
    "note": "api_secret is shown only once. Store it securely."
  }
}
⚠️ api_secret yalnızca bir kez gösterilir. Partner backend'de güvenli saklanmalı; asla frontend'e konmamalı.
Partner API imzası
Tüm /api/v1/* endpoint'leri (consume hariç) aşağıdaki header'ları gerektirir:

Header	Açıklama
X-Api-Key	Partner API key (sb_...)
X-Timestamp	Unix timestamp (saniye). ±300 sn tolerans.
X-Signature	HMAC-SHA256 hex imza
Content-Type	application/json (body gönderilen isteklerde)
İmza algoritması
body_hash = SHA256(raw_request_body)   // body yoksa "{}"
canonical = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + body_hash
signature = HMAC_SHA256(api_secret, canonical)  // lowercase hex output
Parametre	Değer
METHOD	Büyük harf: GET, POST
PATH	Path + query string, istekte gönderildiği haliyle: /api/v1/launch, /api/v1/bets?external_user_id=12345&limit=50
TIMESTAMP	X-Timestamp header ile aynı string
body_hash	Raw JSON body'nin SHA256 hex hash'i
GET isteklerinde body yoksa imza hesabında body olarak {} kullanın.
Wallet imzası (Partner implement eder)
Platform partner wallet API'sine istek atarken farklı bir imza şeması kullanır:

signature = HMAC_SHA256(wallet_secret, timestamp + "." + raw_json_body)
Header	Açıklama
X-Timestamp	Unix timestamp (saniye)
X-Signature	HMAC-SHA256 hex
X-Tenant-Id	Partner slug
Webhook imzası (Partner doğrular)
Platform partner webhook URL'sine POST atarken wallet ile aynı şemayı kullanır:

signature = HMAC_SHA256(wallet_secret, timestamp + "." + raw_json_body)
Header	Açıklama
X-Tenant-Id	Partner slug
X-Webhook-Id	Teslimat ID'si. Aynı olayın tekrar denemelerinde değişmez — tekilleştirme (dedupe) için kullanın
X-Webhook-Event	BET_PLACED, BET_WON, BET_SETTLED, BALANCE_STATUS_CHANGED
X-Timestamp	Unix timestamp
X-Signature	HMAC-SHA256 hex
Proxy flow (önerilen)
Production'da api_secret yalnızca partner backend'de kalır. Frontend tek kullanımlık launch_token ile iframe açar.

Adım 1 — Backend: Prepare
POST /api/v1/launch/prepare · İmzalı · TTL: 120 sn

Alan	Tip	Zorunlu	Açıklama
external_user_id	string	Evet	Partner sistemindeki kullanıcı ID
username	string	Hayır	Görünen kullanıcı adı
currency	string(3)	Hayır	ISO 4217. Yeni oyuncu için varsayılan TRY; gönderilmezse oyuncunun mevcut para birimi korunur. Oyuncunun açık kuponu varken değiştirilemez (409 CURRENCY_CHANGE_NOT_ALLOWED). Bkz. limitler
language	string	Hayır	UI dili, default: tur
return_url	URL	Hayır	Reserved — gelecek sürüm
{
  "success": true,
  "data": {
    "launch_token": "base64url_token...",
    "expires_at": "2026-08-17T14:02:00.000Z",
    "consume_endpoint": "/api/v1/launch/consume",
    "note": "Pass launch_token to your frontend. Frontend calls consume without API secret."
  }
}
Adım 2 — Frontend: Consume
POST /api/v1/launch/consume · İmza gerekmez · Tek kullanımlık

{ "launch_token": "base64url_token..." }
{
  "success": true,
  "data": {
    "iframe_url": "https://.../tr/sports/pre-match/event-view?integrationMode=1&session_token=...",
    "embed_url": "https://.../embed/sports?...",
    "ui_url": "https://.../tr/sports/pre-match/event-view?...",
    "expires_at": "2026-08-17T15:00:00.000Z"
  }
}
Production'da Origin / Referer header'ı partner allowed_domains listesinde olmalı. Token tek kullanımlıktır: aynı anda birden fazla consume gelse bile yalnızca biri başarılı olur, diğerleri 401 INVALID_LAUNCH_TOKEN alır.
Partner backend proxy örneği
// Partner: GET /api/sportsbook/launch?userId=12345
// Backend prepare yapar, launch_token döner (secret frontend'e gitmez)

app.get('/api/sportsbook/launch', authMiddleware, async (req, res) => {
  const { data } = await signedPost('/api/v1/launch/prepare', {
    external_user_id: req.user.id,
    username: req.user.name,
    currency: 'TRY',
    language: 'tur',
  });
  res.json({ launch_token: data.launch_token, expires_at: data.expires_at });
});
Direct launch
Backend doğrudan iframe URL alır. Secret kesinlikle frontend'e verilmemeli.

POST /api/v1/launch · Alias: /api/v1/embed/session

Request body prepare ile aynı. Response'ta ek olarak session_token döner.

Launch endpoint referansı
GET /api/v1/me
API key doğrulama ve partner bilgisi.

{
  "success": true,
  "data": {
    "tenant_id": "cuid...",
    "name": "Acme Bahis",
    "slug": "acme-bahis",
    "swarm_site_id": 1872355,
    "allowed_domains": ["partner.com"],
    "webhook_url": "https://partner.com/webhooks/sportsbook"
  }
}
Endpoint	Method	Auth	Açıklama
/api/v1/me	GET	Partner imza	Partner bilgisi
/api/v1/launch/prepare	POST	Partner imza	Launch token üret
/api/v1/launch/consume	POST	Token only	iframe URL al
/api/v1/launch	POST	Partner imza	Direct iframe URL
/api/v1/embed/session	POST	Partner imza	/launch alias
Seamless wallet
Bakiye partner sisteminde tutulur. Platform her bahis ve settlement'ta partner wallet API'sini çağırır.

Özellik	Detay
Transfer wallet	Hayır — ön yatırım gerekmez
Idempotency	transaction_id ile tekrarlayan istekler aynı sonucu döndürmeli (ikinci kez para hareketi yapılmamalı)
Timeout	Platform 15 sn bekler; cevap gelmezse sonucu belirsiz sayar (aşağıya bakın)
Tutar	Decimal, 2 hane (ör. 100.50), her zaman oyuncunun para biriminde
İmza	Wallet imzası — her istekte doğrulayın
Cevap kuralları (önemli)
Platform, cüzdanınızın cevabına göre parayı ya kesin kabul eder, ya kesin reddedilmiş sayar, ya da belirsiz sayıp iade (rollback) gönderir. Bu ayrım oyuncunun parasının kaybolmaması için kritiktir:

Sizin cevabınız	Platformun yorumu	Sonra ne olur
HTTP 2xx ve "success": true	İşlem yapıldı	Kupon aktif olur / ödeme tamamlanır
HTTP 2xx ve "success": false, veya HTTP 4xx	Kesin ret — para hareket etmedi	Debit: kupon iptal edilir, oyuncuya hata gösterilir, rollback gönderilmez. Credit ve rollback: reddedilmez, tekrar denenir
HTTP 5xx, 15 sn içinde cevap yok, bağlantı hatası, geçersiz JSON	Belirsiz — para hareket etmiş olabilir	Debit için hemen /rollback gönderilir (cevap alınana kadar arka planda tekrar denenir). Credit için aynı transaction_id ile tekrar denenir
İş kuralı gereği reddettiğiniz işlemlerde (yetersiz bakiye, limit, blokeli hesap…) asla 5xx dönmeyin; 4xx veya success:false dönün. Parayı düştükten sonra 5xx dönerseniz platform iade gönderir ve kupon iptal edilir.
Debit: Aynı transaction_id ikinci kez gelirse ilk sonucu tekrar döndürün, bakiyeyi yeniden düşmeyin.
Credit: Ödemeler kalıcıdır ve başarılı olana kadar aynı transaction_id ile tekrar gönderilir (artan bekleme ile). Daha önce işlenmiş bir credit için tekrar success:true dönün. Credit'i reddetmeyin; oyuncu kazancını almamış olur ve platform yöneticisinin panelinde "ödenemeyen kazanç" olarak görünür.
Rollback: /rollback kurallarına bakın — özellikle "bilinmeyen debit" durumu.
POST /balance
Platform kullanıcı bakiyesini sorgular (UI gösterimi + bahis öncesi kontrol).

Request
Alan	Tip	Zorunlu
user_id	string	Evet
currency	string(3)	Evet
{ "user_id": "12345", "currency": "TRY" }
Response (200)
{ "success": true, "balance": 1500.00, "currency": "TRY" }
POST /debit
Bahis tutarı düşülür. Yetersiz bakiyede 400 + INSUFFICIENT_BALANCE. Daha önce rollback ile iptal edilmiş bir transaction_id gelirse (geç ulaşan debit) 409 + TRANSACTION_CANCELLED dönün ve bakiyeyi düşmeyin.

Alan	Tip	Zorunlu	Açıklama
transaction_id	string	Evet	Benzersiz, idempotent
user_id	string	Evet	Partner user ID
amount	number	Evet	Stake tutarı (> 0)
currency	string(3)	Evet	Para birimi
bet_id	string	Evet	Platform internal bet ID
coupon_id	string	Evet	Kupon / barcode numarası
metadata	object	Hayır	selections, total_odds vb.
{
  "transaction_id": "debit_bet_abc123",
  "user_id": "12345",
  "amount": 100.00,
  "currency": "TRY",
  "bet_id": "cuid_bet_id",
  "coupon_id": "869636835428651",
  "metadata": { "selections": 1, "total_odds": 1.75 }
}
{
  "success": true,
  "transaction_id": "debit_bet_abc123",
  "balance_after": 1400.00
}
POST /credit
Kazanç veya iade eklenir. Settlement sonrası çağrılır.

Alan	Tip	Açıklama
transaction_id	string	Benzersiz
user_id	string	Partner user ID
amount	number	Credit tutarı
currency	string(3)	Para birimi
bet_id	string	Platform bet ID
coupon_id	string	Kupon numarası
reason	enum	win (kazanç) | cashout (erken ödeme) | rollback (iade edilen / void kupon, tutar = yatırılan)
metadata	object	Opsiyonel. Kısmi erken ödemede {"partial": true, "remaining_stake": 40}
transaction_id biçimi: kupon sonucu için credit_{bet_id}_final (kupon başına tek), kısmi erken ödeme için cashout_{coupon_id}_{anahtar}. Cevap: {"success": true, "transaction_id": "...", "balance_after": 1575.00}

POST /rollback
Sonucu belirsiz kalan bir debit'in iptalidir: debit isteğimiz 5xx/timeout/bağlantı hatası aldığında veya sunucu debit sırasında durduğunda gönderilir. transaction_id = rollback_{original_transaction_id}, reason = debit_not_confirmed.

Rollback kuralları
Rollback transaction_id ile idempotenttir; aynı rollback tekrar gelirse yeniden iade yapmadan success:true dönün.
Orijinal debit (original_transaction_id) sizde işlenmişse: tutarı oyuncuya bir kez iade edin.
Orijinal debit sizde hiç yoksa (henüz ulaşmamış olabilir): iade yapmayın, o original_transaction_id'yi "iptal edildi" olarak kaydedin ve success:true dönün. Bu ID ile daha sonra bir debit gelirse 409 TRANSACTION_CANCELLED ile reddedin.
Rollback'i reddetmeyin (4xx/5xx); cevap alınamazsa platform tekrar dener, denemeler tükenirse platform yöneticisine "belirsiz bahis tutarı" olarak düşer.
Referans uygulama: examples/partner-wallet-server.ts.

Alan	Tip	Açıklama
transaction_id	string	Yeni rollback tx ID
original_transaction_id	string	İptal edilen debit tx ID
user_id	string	Partner user ID
amount	number	İade tutarı
currency	string(3)	Para birimi
bet_id	string	Platform bet ID
coupon_id	string	Kupon numarası
reason	string	İptal sebebi
Webhook genel
Partner admin'den webhook_url ayarlanır. Platform olayları POST eder. HTTP 2xx dışındaki her cevap (veya 10 sn içinde cevap gelmemesi) başarısız sayılır ve giderek artan aralıklarla (1, 2, 3… dakika, en fazla 15 dakika) yeniden denenir; varsayılan en fazla 5 deneme (WEBHOOK_MAX_RETRIES).

Teslimat en az bir kez garantilidir: ağ hatalarında aynı olay birden fazla gelebilir. X-Webhook-Id header'ını saklayıp tekrar gelenleri yok sayın. Kesin durum için sorgulama API'si kaynak kabul edilmelidir.
Envelope (tüm olaylar)
{
  "event": "bet_placed",
  "tenant_id": "cuid...",
  "tenant_slug": "acme-bahis",
  "timestamp": "2026-08-17T12:00:00.000Z",
  "data": { /* olay-spesifik */ }
}
Partner herhangi bir 2xx (tercihen 200 OK + {"success": true}) döndürmelidir. Uzun işleri cevaptan sonra yapın.

Webhook olay tipleri
bet_placed
Bahis başarıyla yerleştirildi ve wallet debit tamamlandı.

{
  "event": "bet_placed",
  "data": {
    "bet_id": "cuid...",
    "coupon_id": "869636835428651",
    "external_user_id": "12345",
    "username": "kagan",
    "currency": "TRY",
    "stake": 100,
    "total_odds": 1.75,
    "potential_win": 175,
    "bet_type": 1,
    "selections_count": 1,
    "selections": [{
      "selection_id": "7032449538",
      "game_id": 30598301,
      "market_name": "Maç Handikapı",
      "pick": "Jinan Cyclones",
      "price": 1.75,
      "is_live": false
    }]
  }
}
bet_won
Bahis kazanıldı; wallet credit yapıldı.

{
  "event": "bet_won",
  "data": {
    "bet_id": "cuid...",
    "coupon_id": "869636835428651",
    "external_user_id": "12345",
    "stake": 100,
    "payout": 175,
    "potential_win": 175,
    "total_odds": 1.75
  }
}
bet_settled
Bahis sonuçlandı (won, lost, returned, cashout).

{
  "event": "bet_settled",
  "data": {
    "bet_id": "cuid...",
    "coupon_id": "869636835428651",
    "external_user_id": "12345",
    "outcome": "won",
    "stake": 100,
    "payout": 175,
    "potential_win": 175
  }
}
outcome	Açıklama	payout
won	Tüm selection kazandı	potential_win
lost	En az bir selection kaybetti	0
returned	Void / iade	stake
cashout	Erken cashout	cashout tutarı
balance_status_changed
Platformdaki bakiyenizin durumu değişti (ok → low → exhausted veya geri). Bkz. GGR ve bakiye.

{
  "event": "balance_status_changed",
  "data": {
    "status": "exhausted",
    "previous_status": "low",
    "balance": 120.0,
    "reserved": 120.0,
    "available": 0.0,
    "billing_currency": "TRY",
    "ggr_rate": 10,
    "credit_limit": 0,
    "low_balance_threshold": 500
  }
}
Webhook doğrulama (Partner)
function verifyWebhook(rawBody, signature, timestamp, walletSecret) {
  const crypto = require('crypto');
  const expected = crypto
    .createHmac('sha256', walletSecret)
    .update(timestamp + '.' + rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected,'hex'), Buffer.from(signature,'hex'));
}
Kupon sorgulama
Mutabakat, destek ve partner tarafı bahis geçmişi için. Tüm uçlar partner imzası ister (query string imzaya dahildir) ve yalnızca kendi oyuncularınızın verisini döner. Listeler en yeniden eskiye sıralıdır; sonraki sayfa için bir önceki cevabın next_cursor değerini cursor olarak gönderin (null ise son sayfa).

GET /api/v1/bets
Parametre	Açıklama
external_user_id	Tek oyuncunun kuponları
status	Virgülle birden fazla: active, won, lost, returned, cashout, cancelled, pending
from, to	Kupon oluşturma zamanı aralığı: ISO tarih veya unix zaman (sn/ms)
limit	1–200, varsayılan 50
cursor	Önceki sayfanın next_cursor değeri
GET /api/v1/bets?external_user_id=12345&status=active,won&limit=2

{
  "success": true,
  "data": [{
    "id": "cmujp8ubi001wxylmrmlkngpo",
    "bet_id": "cmujp8ubi001wxylmrmlkngpo",
    "coupon_id": "905063404752658",
    "external_user_id": "12345",
    "username": "kagan",
    "status": "active",
    "type": "single",
    "currency": "TRY",
    "stake": 10,
    "total_odds": 1.5,
    "potential_win": 15,
    "payout": null,
    "created_at": "2026-09-27T09:55:04.752Z",
    "settled_at": null,
    "selections": [{
      "selection_id": "7242914427",
      "game_id": "31033052",
      "market_id": "1650184541",
      "match": "Almanya U19 - Ukrayna U19",
      "market": "Maç Sonucu",
      "pick": "W1",
      "price": 1.5,
      "is_live": false,
      "status": "active"
    }]
  }],
  "next_cursor": "cmujp8u4s001rxylmop0peywm"
}
status değerleri: pending (ödeme onayı bekleniyor, birkaç saniye sürer), active, won, lost, returned, cashout, cancelled (debit reddedildi veya iade edildi — oyuncudan para alınmamış sayılır). type: single, multiple.

GET /api/v1/bets/{id}
{id}: bet_id (cüzdan çağrıları ve webhooklardaki) veya coupon_id (oyuncunun gördüğü). Cevap, kuponun yanında o kupona ait tüm cüzdan hareketlerini (transactions) de içerir. Bulunamazsa 404 BET_NOT_FOUND.

Cüzdan hareketleri
GET /api/v1/transactions
Platformun cüzdanınıza gönderdiği tüm debit/credit/rollback çağrıları ve son durumları. Kendi kayıtlarınızla günlük mutabakat için kullanın.

Parametre	Açıklama
type	debit, credit, rollback (virgülle birden fazla)
status	pending, success, failed
external_user_id, bet_id	Oyuncu veya kupon (bet_id ya da coupon_id) filtresi
from, to, limit, cursor	Kuponlarla aynı
{
  "success": true,
  "data": [{
    "id": "cmujoxfpq000rxyy8…",
    "transaction_id": "rollback_debit_bet_cmujoxfpo000pxyy8i2lyytpp_1790506316378",
    "wallet_transaction_id": "rollback_debit_bet_cmujoxfpo000pxyy8i2lyytpp_1790506316378",
    "type": "rollback",
    "status": "success",
    "amount": 10,
    "currency": "TRY",
    "bet_id": "cmujoxfpo000pxyy8i2lyytpp",
    "coupon_id": "905063164981190",
    "external_user_id": "12345",
    "error": null,
    "created_at": "2026-09-27T09:51:56.378Z",
    "updated_at": "2026-09-27T09:51:56.401Z"
  }],
  "next_cursor": null
}
transaction_id bizim size gönderdiğimiz ID, wallet_transaction_id cüzdanınızın cevapta döndürdüğü ID'dir. pending bir debit birkaç dakika içinde ya success olur ya da iade edilir; failed bir credit, ödemenin henüz yapılamadığını gösterir (platform tekrar dener).

GGR ve bakiye nasıl çalışır
Platform, sizinle anlaşılan GGR oranı üzerinden komisyon alır. Komisyon, platformdaki ön ödemeli bakiyenizden kupon sonuçlandıkça düşer.

GGR       = kupona yatırılan − kupon için ödenen (kazanç, iade, tam/kısmi erken ödeme)
Komisyon  = GGR × GGR oranı × kur (kupon para birimi → fatura para biriminiz)
Bakiye   −= Komisyon            (kupon sonuçlandığı anda, kupon başına bir kez)
Kupon	Yatırılan	Ödenen	GGR	%10 oranla bakiyeye etkisi
Kaybetti	100	0	100	−10
Kazandı (2.50)	100	250	−150	+15
İade	100	100	0	0
80 ile erken ödeme	100	80	20	−2
Negatif GGR: Oyuncu kazandığında komisyon bakiyenize geri eklenir. Bu, negatif GGR'ın sonraki dönemlere devretmesiyle (carry-over) aynı sonucu verir; bakiye nakit iade edilmez, gelecekteki komisyonlara sayılır.
İptal edilen kuponlar (bahis tutarı çekilemedi veya iade edildi) GGR'a girmez.
Oran ve kur: Kuponun sonuçlandığı andaki değerler kullanılır ve her kayıtta saklanır.
Ayrılan tutar: Açık kuponların kaybetmesi hâlinde kesilecek komisyon (yatırılan × oran) bakiyenizden ayrılır. Kullanılabilir bakiye = bakiye − ayrılan.
Bakiye yetmezse: Yeni kuponun ayrılacak komisyonunu karşılayamayan bahis reddedilir; oyuncu PARTNER_BALANCE_EXHAUSTED hatası alır. Açık kuponlar sonuçlanmaya ve ödenmeye devam eder. Bakiye yüklendiği anda bahisler açılır.
Para birimi: Fatura para biriminizden farklı bir para biriminde bahis alınabilmesi için platformda o para biriminin kuru tanımlı olmalıdır; değilse CURRENCY_NOT_SUPPORTED.
Bakiyeniz azalınca ve bittiğinde balance_status_changed webhook'u gelir. Bunu operasyon ekibinize iletmenizi öneririz.
Bakiye API
İmzalı, salt-okunur uçlar. Query string imzaya dahildir.

GET /api/v1/billing
Bakiye, oran, durum ve bir dönemin GGR özeti. from / to (ISO tarih veya unix zaman) verilmezse bu ay. Kuponlar sonuçlandıkları tarihe göre döneme girer.

{
  "success": true,
  "data": {
    "billing_currency": "TRY",
    "ggr_rate": 10,
    "balance": 4400.0,
    "reserved": 800.0,
    "available": 3600.0,
    "credit_limit": 0,
    "low_balance_threshold": 500,
    "status": "ok",
    "period": {
      "from": "2026-10-01T00:00:00.000Z",
      "to": "2026-10-06T14:00:00.000Z",
      "billing_currency": "TRY",
      "bets": 812,
      "by_currency": [
        { "currency": "TRY", "bets": 800, "stake": 20000, "payout": 14000, "ggr": 6000, "commission": 600 },
        { "currency": "USD", "bets": 12, "stake": 100, "payout": 0, "ggr": 100, "commission": 410 }
      ],
      "commission": 1010,
      "topups": 5000,
      "adjustments": 100
    }
  }
}
status	Anlamı
ok	Normal
low	Kullanılabilir bakiye uyarı eşiğinin altında
exhausted	Kullanılabilir bakiye yeni kuponları karşılamıyor; bahis alınmıyor
credit_limit: kullanılabilir bakiyenin sıfırın altına inebileceği tutar; null ise bahis bakiye yüzünden hiç durdurulmaz (sonradan faturalı).

GET /api/v1/billing/ledger
Bakiye hareketleri, yeniden eskiye: yüklemeler, düzeltmeler ve her sonuçlanan kuponun komisyonu. Parametreler: type (topup, adjustment, ggr; virgülle birden fazla), from, to, limit (1–200), cursor.

{
  "success": true,
  "data": [{
    "id": "cmv...",
    "type": "ggr",
    "amount": -30,
    "balance_after": 970,
    "currency": "TRY",
    "note": null,
    "bet_id": "cmujp8ubi001wxylmrmlkngpo",
    "coupon_id": "905063404752658",
    "bet_currency": "TRY",
    "stake": 300,
    "payout": 0,
    "ggr": 300,
    "ggr_rate": 10,
    "fx_rate": 1,
    "occurred_at": "2026-10-06T13:43:12.000Z",
    "created_at": "2026-10-06T13:43:12.140Z"
  }],
  "next_cursor": null
}
amount bakiyenize etkidir: eksi komisyon kesildi, artı yükleme ya da geri eklenen komisyon. balance_after o kayıttan sonraki bakiyedir. Her kupon için en fazla bir ggr kaydı vardır; kupon ve cüzdan kayıtlarınızla bet_id üzerinden eşleştirebilirsiniz.

JavaScript SDK
<script src="{BASE_URL}/sdk/sportsbook-sdk.js"></script>

Method	Açıklama
new SportsbookSDK({ apiKey, apiSecret, baseUrl, container })	SDK instance
prepareLaunch({ externalUserId, username, currency, language })	Backend'de kullan — launch token
launch({ externalUserId, ... })	Direct launch + iframe aç
launchWithToken(launchToken)	Frontend — consume + iframe
consumeLaunchToken(token)	Sadece consume API çağrısı
on('app_ready', fn)	UI hazır eventi
on('connection_lost', fn)	Bağlantı koptu
on('deposit', fn)	Kullanıcı para yatırma istedi — kendi deposit sayfanı aç
on('open_bet_history', fn)	Kullanıcı bahis geçmişi istedi — kendi dialog/sayfanı aç
on('open_link', fn)	Widget içinden link tıklandı — tam sportsbook aç
launchMatchAnimationWidget(params)	Wadua canlı maç animasyonu (top/olaylar)
launchLiveGamesWidget(params)	Canlı maç listesi widget iframe'i aç
launchWidget(params)	Genel widget launch (widget: 'live_games')
destroy()	iframe temizle
Önerilen production kullanım
// Backend endpoint'in launch_token döndürür
const res = await fetch('/api/sportsbook/launch');
const { launch_token } = await res.json();

const sb = new SportsbookSDK({
  baseUrl: 'https://sportsbook.example.com',
  container: '#sportsbook',
});
await sb.launchWithToken(launch_token);
Embed event'leri (postMessage)
integrationMode=1 ile açılan iframe, standalone sitedeki gibi profil / para yatırma / bahis geçmişi dialoglarını içeride açmaz. Bunun yerine parent window'a postMessage gönderir; partner kendi sitesinde ilgili sayfa veya modal'ı göstermelidir.

Bu davranış launch URL'sine otomatik eklenen integrationMode=1 parametresi ile aktif olur. Ekstra konfigürasyon gerekmez.
Event formatı
Tüm event'ler aynı yapıdadır:

{
  "type": "open_bet_history",
  "value": {
    "source": "open_bets",
    "page": "bets"
  }
}
Alan	Tip	Açıklama
type	string	Event adı (aşağıdaki tablo)
value	object	Event'e özel payload (bazı event'lerde boş olabilir)
Desteklenen event'ler
type	Ne zaman tetiklenir	value	Partner aksiyonu
app_ready	Sportsbook UI yüklendi	{}	Opsiyonel: loading spinner kapat
open_bet_history	Kullanıcı bahis geçmişi istedi	{ source, page }	Kendi bahis geçmişi modal/sayfanı aç
deposit	Para yatır butonu tıklandı	{}	Kendi deposit sayfanı aç
connection_lost	Swarm bağlantısı koptu	disconnect detayı	Kullanıcıya uyarı göster / yeniden bağlan
route_update	iframe içi route değişti	{ route, ... }	Opsiyonel: analytics
login / register	Auth popup gerekti (nadir embed'de)	{}	Partner login akışına yönlendir
SDK ile dinleme
const sb = new SportsbookSDK({
  baseUrl: 'https://sportsbook.example.com',
  container: '#sportsbook',
});

sb.on('open_bet_history', (value) => {
  console.log('Kaynak:', value.source); // open_bets | navigation | deep_link
  console.log('Sayfa:', value.page);     // bets | open-bets | won | lost ...
  openPartnerBetHistoryModal();
});

sb.on('deposit', () => {
  window.location.href = '/deposit';
});

await sb.launchWithToken(launchToken);
SDK olmadan dinleme
window.addEventListener('message', (event) => {
  // Production'da origin doğrulaması yapın:
  // if (event.origin !== 'https://sportsbook.example.com') return;

  const { type, value } = event.data || {};
  if (type === 'open_bet_history') {
    openPartnerBetHistoryModal(value);
  }
  if (type === 'deposit') {
    openPartnerDepositPage();
  }
});
⚠️ postMessage listener'da mutlaka event.origin kontrolü yapın. Demo'da * kullanılır; production'da sportsbook domain'inizi whitelist'leyin.
Bahis geçmişi — partner UI
Embed modunda kupon panelindeki "Bahis geçmişine git" (.open-bets-bet-history-btn) butonuna basıldığında iframe içindeki BetConstruct profil dialogu açılmaz. Platform parent siteye open_bet_history event'i gönderir.

Akış
Kullanıcı → "Bahis geçmişine git" (iframe içi)
         ↓
Platform → iframe dialog AÇMAZ
         ↓
postMessage → parent: { type: "open_bet_history", value: { source, page } }
         ↓
Partner  → Kendi modal / sayfa / drawer açar
         ↓
Partner  → Bahis listesini kendi DB'sinden veya webhook verisinden gösterir
open_bet_history payload
Alan	Değerler	Açıklama
value.source	open_bets	Açık kuponlar sekmesindeki "Bahis geçmişine git" butonu
navigation	iframe içi URL navigasyonu engellendi (history.pushState)
deep_link	Sayfa ?section=history ile açılmaya çalışıldı, engellendi
value.page	bets, open-bets, won, lost …	Hangi alt sekme istendiği (partner UI'da filtre olarak kullanılabilir)
Partner bahis geçmişi verisini nereden alır?
Yöntem 1 — Webhook (önerilen, production)
Partner kendi veritabanında bahisleri webhook ile tutar. open_bet_history event'i geldiğinde bu veriyi gösterir.

bet_placed → yeni bahis kaydı oluştur
bet_settled / bet_won → durumu ve payout güncelle
// Partner DB'den listele
app.get('/api/my-bets', authMiddleware, async (req, res) => {
  const bets = await db.bets.findMany({
    where: { user_id: req.user.id },
    orderBy: { created_at: 'desc' },
  });
  res.json({ bets });
});

// Frontend modal
sb.on('open_bet_history', async () => {
  const res = await fetch('/api/my-bets');
  const { bets } = await res.json();
  showBetHistoryModal(bets);
});
Yöntem 2 — Kupon sorgulama API (önerilen)
Partner backend, imzalı GET /api/v1/bets?external_user_id=… ile oyuncunun kuponlarını doğrudan platformdan çeker. Oturum token'ı gerekmez, süre sınırı yoktur.

app.get('/api/my-bets', authMiddleware, async (req, res) => {
  const path = '/api/v1/bets?external_user_id=' + encodeURIComponent(req.user.id) + '&limit=50';
  const response = await signedGet(path); // imza PATH'e query string dahil
  res.json(await response.json());
});
Yöntem 3 — Platform internal API (direct launch + session_token)
POST /api/v1/launch (direct) response'unda session_token döner. Partner backend bu token ile platforma proxy yapabilir. Proxy flow (consume) session_token döndürmez — bu tasarım gereği.

POST /bet_history.php · Auth: Authorization: Bearer {session_token}

// Request (BetConstruct UI formatı)
{
  "params": {
    "where": {
      "from_date": 1704067200,
      "to_date": 1735689600,
      "outcome": 0,
      "bet_id": "869636835428651"
    }
  },
  "rid": "optional-request-id"
}
where alanı	Tip	Açıklama
from_date	number	Unix timestamp (saniye veya ms)
to_date	number	Unix timestamp
outcome	number	0=açık, 1=kaybetti, 3=kazandı, 2=iade (UI enum)
bet_id	string	Kupon ID ile filtre
only_counts	boolean	Sadece adet döner
// Response
{
  "code": 0,
  "data": {
    "bets": [{
      "id": "869636835428651",
      "amount": 100,
      "possible_win": 175,
      "outcome": 0,
      "type": 1,
      "events": [{ "game_name": "...", "market_name": "...", "pick": "...", "price": 1.75 }]
    }]
  },
  "bets": [ /* aynı liste */ ],
  "rid": "..."
}
// Partner backend proxy örneği (direct launch session_token ile)
app.get('/api/sportsbook/bet-history', authMiddleware, async (req, res) => {
  const sessionToken = req.session.sportsbook_token; // launch'tan saklanmış
  const response = await fetch('https://sportsbook.example.com/bet_history.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + sessionToken,
    },
    body: JSON.stringify({
      params: { where: { from_date: req.query.from, to_date: req.query.to } },
    }),
  });
  res.json(await response.json());
});
⚠️ session_token kullanıldıkça uzar ama en fazla 24 saat geçerlidir; oyuncu çıkış yapınca hemen biter. Bu yöntem yerine Yöntem 1 veya 2'yi tercih edin.
Örnek partner modal (vanilla JS)
function showBetHistoryModal(bets) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#1a2332;border-radius:12px;padding:24px;max-width:640px;width:90%;max-height:80vh;overflow:auto;">
      <h2 style="margin:0 0 16px;color:#fff;">Bahis Geçmişim</h2>
      <div id="bet-list"></div>
      <button onclick="this.closest('[style*=fixed]').remove()" style="margin-top:16px;">Kapat</button>
    </div>`;
  document.body.appendChild(overlay);

  const list = overlay.querySelector('#bet-list');
  bets.forEach(b => {
    const row = document.createElement('div');
    row.style.cssText = 'padding:12px;border-bottom:1px solid #2d3a4d;color:#e7ecf3;';
    row.textContent = `#${b.coupon_id} · ${b.stake} TRY · ${b.status}`;
    list.appendChild(row);
  });
}

sb.on('open_bet_history', async () => {
  const res = await fetch('/api/my-bets');
  const { bets } = await res.json();
  showBetHistoryModal(bets);
});
Engellenen iframe davranışları (embed modu)
Standalone sitede	Embed modunda (integrationMode=1)
Profil / bahis geçmişi dialogu açılır	Dialog açılmaz → open_bet_history event
Para yatır sayfasına yönlendirilir	Yönlendirme yok → deposit event
Header / navigasyon görünür	Header gizli (embed-overrides.css)
Logout partner'e bildirilmez	Logout iframe içinde kalır
Canli mac animasyonu (Wadua)
Tek bir canli mac icin top hareketi, gol, korner, kart gibi olaylarin gosterildigi waduaAnimationIframe widget'i. Mac detay sayfasindaki animasyon sekmesiyle ayni icerik.

Endpoint	Method	Aciklama
/api/v1/widget/match-animation/launch	POST	Mac animasyon URL (gameId + takim adlari gerekli)
const sb = new SportsbookSDK({
  baseUrl: 'https://sportsbook.example.com',
  container: '#match-animation',
});

await sb.launchMatchAnimationWidget({
  gameId: '12345678',
  team1: 'Galatasaray',
  team2: 'Fenerbahce',
  sportAlias: 'Soccer',
  statistic: true,
  header: true,
  timer: true,
  minHeight: 360,
});
Demo: /widget-demo · Direct embed: /embed/match-animation

Canli mac listesi (LiveGamesWidget)
Partner ana sayfasina gomulebilir kompakt canli mac listesi. Tam sportsbook yerine sadece canli maclari ve oranlari gosterir.

Endpoint	Method	Aciklama
/api/v1/widget/live-games/launch	POST	Canli mac widget URL (shortcut)
/api/v1/widget/launch	POST	Genel widget launch (widget: "live_games")
/api/v1/widgets	GET	Desteklenen widget listesi
const sb = new SportsbookSDK({
  baseUrl: 'https://sportsbook.example.com',
  container: '#live-games',
});

sb.on('open_link', (path) => {
  // Kullanici "Daha fazla" veya mac linkine tikladi
  openFullSportsbook(path);
});

await sb.launchLiveGamesWidget({
  externalUserId: 'user_123',
  username: 'player',
  currency: 'TRY',
  minHeight: 480,
  settings: {
    sportsLimit: 3,
    gamesLimit: 5,
    numberOfExpandedSports: 3,
  },
});
Demo animasyon: /widget-demo · Demo mac listesi: /embed/live-games

Iframe entegrasyonu
<div id="sportsbook" style="width:100%;height:100vh;"></div>

<iframe
  src="IFRAME_URL_FROM_API"
  style="width:100%;height:100vh;border:none;"
  allow="fullscreen"
></iframe>
URL parametreleri (platform otomatik ekler):

Param	Açıklama
integrationMode=1	Embed modu — header gizli
session_token	Oturum token (Bearer alternatifi)
lang	UI dili (tur, eng)
siteId	Swarm site ID
Session & oturum
Tip	TTL	Kullanım
launch_token	120 sn, tek kullanımlık	Prepare → consume arası
session_token	Her istekte 3600 sn uzar (SESSION_TTL_SECONDS), en fazla 24 saat (SESSION_MAX_AGE_SECONDS)	UI oturumu, bahis/bakiye API
Oyuncu sportsbook içinden çıkış yaptığında oturum kalıcı olarak kapanır. Partner askıya alınırsa açık oturumlar en geç 30 sn içinde bahis yapamaz hale gelir. Bu yüzden oyuncu her girişte yeni bir launch yapılmalıdır.

Session token ile UI şu internal endpoint'leri çağırır. Partner doğrudan kullanmak yerine çoğunlukla webhook + kendi API'sini tercih eder; direct launch senaryosunda backend proxy mümkündür.

Endpoint	Açıklama	Partner erişimi
POST /get_balance.php	Bakiye (wallet proxy)	iframe içi otomatik
POST /create_bet.php	Bahis yerleştir	iframe içi otomatik
POST /bet_history.php	Bahis geçmişi listesi	Backend proxy (direct launch token) veya webhook DB — bkz. Bahis geçmişi
Auth: Authorization: Bearer {session_token} veya body/query session_token

Hata kodları
Partner API
error_code	HTTP	Açıklama
UNAUTHORIZED	401	Header eksik
REQUEST_EXPIRED	401	Timestamp ±300 sn dışında
INVALID_API_KEY	401	Geçersiz veya inactive partner
INVALID_SIGNATURE	401	İmza hatalı
VALIDATION_ERROR	400	Body validation hatası
INVALID_LAUNCH_TOKEN	401	Token geçersiz veya süresi dolmuş
PARTNER_INACTIVE	403	Partner SUSPENDED
ORIGIN_NOT_ALLOWED	403	Domain izin listesinde değil
CURRENCY_CHANGE_NOT_ALLOWED	409	Oyuncunun açık kuponu varken farklı para birimiyle launch
BET_NOT_FOUND	404	Kupon bulunamadı (sorgulama API)
NOT_FOUND	404	Böyle bir uç yok
RATE_LIMITED	429	Çok fazla istek (IP başına dakikada 500)
INTERNAL_ERROR	500	Beklenmeyen hata; tekrar deneyin
Bahis sırasında oyuncuya gösterilen hatalar
Kod	Açıklama
INSUFFICIENT_BALANCE	Bakiye yetersiz (bizim ön kontrolümüz veya cüzdanınızın reddi)
MIN_STAKE / MAX_STAKE / MAX_PAYOUT	Partner limitlerinin dışında
CURRENCY_NOT_SUPPORTED	Oyuncunun para birimi için limit ya da fatura para biriminize kur tanımlı değil
PARTNER_BALANCE_EXHAUSTED	Platformdaki bakiyeniz yeni kuponun komisyonunu karşılamıyor (GGR ve bakiye)
PAYMENT_NOT_CONFIRMED	Cüzdanınız cevap vermedi / 5xx döndü; debit iade edildi, kupon alınmadı
PARTNER_INACTIVE	Partner askıda
ODDS_CHANGED	Oran değişti; oyuncu yeni oranı onaylamalı
Wallet (partner döndürür)
error_code	HTTP	Açıklama
INSUFFICIENT_BALANCE	400	Yetersiz bakiye
INVALID_SIGNATURE	401	Wallet imza hatalı
TRANSACTION_CANCELLED	409	Debit daha önce rollback ile iptal edilmiş (geç gelen debit)
Wallet hatalarında HTTP kodunun anlamı için cevap kurallarına bakın.

Genel response formatı (hata)
{
  "success": false,
  "error_code": "VALIDATION_ERROR",
  "error_message": "external_user_id: Required",
  "details": { "formErrors": [], "fieldErrors": { "external_user_id": ["Required"] } }
}
/api altındaki tüm uçlar bu biçimi kullanır: error_code programatik kontrol için sabittir, error_message her zaman okunabilir bir metindir, details yalnızca bazı hatalarda gelir.

Tipler & enumlar
Currency
ISO 4217, 3 harf. Bahis alınabilmesi için para biriminin limitleri tanımlı olmalıdır — bkz. Para birimi & limitler.

Language
Değer	UI
tur	Türkçe (default)
eng	İngilizce
Bet type (UI)
Type	Açıklama
1	Tekli
2	Kombine
Bet status (platform internal)
Status	Açıklama
PENDING	Debit onayı bekleniyor (saniyeler)
ACTIVE	Açık bahis
WON	Kazanıldı
LOST	Kaybedildi
RETURNED	İade
CASHOUT	Cashout
CANCELLED	İptal: debit reddedildi veya iade edildi
Para birimi & limitler
Her oyuncunun tek bir para birimi vardır; ilk launch'ta belirlenir (varsayılan TRY). Kupon, alındığı para biriminde sonuçlanır ve ödenir.
Bahis limitleri (en az bahis, en çok bahis, en fazla ödeme) para birimi başına ayrı tanımlanır ve platform yöneticisi tarafından partner bazında ayarlanır.
Partner için tanımlı olmayan bir para biriminde bahis alınmaz (CURRENCY_NOT_SUPPORTED). Platform varsayılan limitleri yalnızca LIMITS_CURRENCY (varsayılan TRY) için geçerlidir.
Açık kuponu olan oyuncunun para birimi değiştirilemez; launch'ta currency gönderilmezse mevcut para birimi kullanılır.
Kod örnekleri
Node.js — imza helper
const crypto = require('crypto');

function signRequest(apiSecret, method, path, bodyObj) {
  const body = bodyObj ? JSON.stringify(bodyObj) : '{}';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const canonical = [method.toUpperCase(), path, timestamp, bodyHash].join('\n');
  const signature = crypto.createHmac('sha256', apiSecret).update(canonical).digest('hex');
  return { body, timestamp, signature };
}

// GET (sorgulama API): PATH query string ile birlikte imzalanır, body "{}" sayılır.
async function signedGet(path) {
  const { timestamp, signature } = signRequest(process.env.API_SECRET, 'GET', path);
  return fetch('https://sportbook.probetlab.com' + path, {
    headers: { 'X-Api-Key': process.env.API_KEY, 'X-Timestamp': timestamp, 'X-Signature': signature },
  });
}
// const res = await signedGet('/api/v1/bets?external_user_id=12345&limit=50');
Node.js — proxy flow (tam akış)
// 1) Backend: prepare
const path = '/api/v1/launch/prepare';
const payload = { external_user_id: '12345', username: 'kagan', currency: 'TRY', language: 'tur' };
const { body, timestamp, signature } = signRequest(process.env.API_SECRET, 'POST', path, payload);

const prepareRes = await fetch('https://sportbook.probetlab.com' + path, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': process.env.API_KEY,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
  },
  body,
});
const { data: prep } = await prepareRes.json();

// 2) Frontend'e launch_token ver
// res.json({ launch_token: prep.launch_token });

// 3) Frontend: consume (secret yok)
const consumeRes = await fetch('https://sportbook.probetlab.com/api/v1/launch/consume', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ launch_token: prep.launch_token }),
});
const { data: launch } = await consumeRes.json();
// launch.iframe_url → iframe src
PHP — launch + iframe
function sign($secret, $method, $path, $timestamp, $body) {
    $bodyHash = hash('sha256', $body ?: '{}');
    $canonical = strtoupper($method) . "\n" . $path . "\n" . $timestamp . "\n" . $bodyHash;
    return hash_hmac('sha256', $canonical, $secret);
}

function launchSportsbook($apiKey, $apiSecret, $userId) {
    $path = '/api/v1/launch/prepare';
    $body = json_encode([
        'external_user_id' => $userId,
        'username' => 'player',
        'currency' => 'TRY',
        'language' => 'tur',
    ]);
    $timestamp = (string) time();
    $signature = sign($apiSecret, 'POST', $path, $timestamp, $body);

    $ch = curl_init('https://sportbook.probetlab.com' . $path);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-Api-Key: ' . $apiKey,
            'X-Timestamp: ' . $timestamp,
            'X-Signature: ' . $signature,
        ],
    ]);
    $response = json_decode(curl_exec($ch), true);
    return $response['data']['launch_token'];
}
Python — launch
import hashlib, hmac, time, json, requests

def sign(secret, method, path, body_str):
    ts = str(int(time.time()))
    body_hash = hashlib.sha256(body_str.encode()).hexdigest()
    canonical = f"{method.upper()}\n{path}\n{ts}\n{body_hash}"
    sig = hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    return ts, sig

path = '/api/v1/launch'
body = json.dumps({'external_user_id': '12345', 'currency': 'TRY', 'language': 'tur'})
ts, sig = sign(API_SECRET, 'POST', path, body)
r = requests.post(f'https://sportbook.probetlab.com{path}', data=body, headers={
    'Content-Type': 'application/json',
    'X-Api-Key': API_KEY,
    'X-Timestamp': ts,
    'X-Signature': sig,
})
print(r.json()['data']['iframe_url'])
PHP — webhook receiver
// Partner webhook endpoint
$rawBody = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_SIGNATURE'] ?? '';
$timestamp = $_SERVER['HTTP_X_TIMESTAMP'] ?? '';
$event = $_SERVER['HTTP_X_WEBHOOK_EVENT'] ?? '';

$expected = hash_hmac('sha256', $timestamp . '.' . $rawBody, WALLET_SECRET);
if (!hash_equals($expected, $signature)) {
    http_response_code(401);
    exit(json_encode(['success' => false]));
}

$payload = json_decode($rawBody, true);
// $payload['event']: bet_placed | bet_won | bet_settled
// $payload['data']: olay detayları

http_response_code(200);
echo json_encode(['success' => true]);
JavaScript — bahis geçmişi delegasyonu
// Partner frontend — SDK ile bahis geçmişi delegasyonu
const sb = new SportsbookSDK({
  baseUrl: 'https://sportbook.probetlab.com',
  container: '#sportsbook',
});

// Event geldiğinde kendi modalını aç (iframe dialogu açılmaz)
sb.on('open_bet_history', async (value) => {
  console.log('Bet history requested:', value);
  // source: "open_bets" | "navigation" | "deep_link"
  // page: "bets" | "open-bets" | "won" | "lost" ...

  const res = await fetch('/api/my-bets'); // partner kendi API'si (webhook DB)
  const { bets } = await res.json();
  openMyBetHistoryModal(bets, value.page);
});

sb.on('deposit', () => {
  window.location.href = '/deposit';
});

// Launch (proxy flow)
const { launch_token } = await fetch('/api/sportsbook/launch').then(r => r.json());
await sb.launchWithToken(launch_token);

// --- SDK kullanmıyorsan ---
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://sportbook.probetlab.com') return;
  if (event.data?.type === 'open_bet_history') {
    openMyBetHistoryModal([], event.data.value);
  }
});
Güvenlik
api_secret yalnızca partner backend'de — asla browser/frontend/mobile app
Production'da proxy flow (prepare + consume) kullanın
allowed_domains partner domain'lerini kapsamalı
Webhook imzasını her istekte doğrulayın (timingSafeEqual)
Wallet endpoint'lerinde idempotency (transaction_id) zorunlu
HTTPS zorunlu (production)
Timestamp replay koruması: ±300 saniye
Webhookları X-Webhook-Id ile tekilleştirin; wallet rollback'te "bilinmeyen debit" kaydını tutun
Oturum ve launch token'larını loglamayın; platform da loglarında maskeler
Test checklist
#	Test	Beklenen
1	GET /api/v1/me imzalı	200 + partner bilgisi
2	POST /launch/prepare	launch_token döner
3	POST /launch/consume	iframe_url döner
4	iframe açılır, bakiye görünür	wallet /balance OK
5	Bahis oyna	wallet /debit + webhook bet_placed
6	Maç bitince settlement	webhook bet_won/bet_settled + wallet /credit
7	Yetersiz bakiye	INSUFFICIENT_BALANCE, bahis reddedilir
8	Expired launch_token	INVALID_LAUNCH_TOKEN
9	Admin test webhook	Partner webhook URL 200 döner
10	Açık kupon → "Bahis geçmişine git"	iframe dialog açılmaz; parent'ta open_bet_history event
11	Partner modal açılır	Webhook DB veya proxy API'den liste gösterilir
12	Deposit butonu (varsa)	deposit event → partner deposit sayfası
13	Debit'te 5xx dönün (veya 15 sn bekletin)	Bahis reddedilir (PAYMENT_NOT_CONFIRMED), /rollback gelir, bakiye değişmez
14	Rollback'ten sonra aynı debit tekrar gelsin	Cüzdan 409 TRANSACTION_CANCELLED döner, bakiye düşmez
15	Aynı credit iki kez gelsin	İkincisinde bakiye değişmez, success:true
16	Aynı webhook iki kez gelsin	X-Webhook-Id ile ikincisi yok sayılır
17	GET /api/v1/transactions ile günlük mutabakat	Kendi kayıtlarınızla birebir eşleşir
18	GET /api/v1/billing	Bakiye, oran ve bu ayın GGR'ı görünür
19	Webhook ucunuz balance_status_changed olayını işler	Ekibinize uyarı gider
Referans implementasyon
Wallet: examples/partner-wallet-server.ts · Demo: /partner-demo · Admin: /admin