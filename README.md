# FOOTBALLGRID — Futbol Bilginle Meydan Oku

Hesapsız, oda kodlu, 2-4 kişilik çok oyunculu futbol bilgi ızgarası.
E-posta yok, şifre yok, Google/Apple girişi yok, telefon yok — sadece bir takma ad.

## Hızlı başlangıç

```bash
npm install          # tek bağımlılık: ws
npm start            # http://localhost:3000
```

- **Bu bilgisayar:** http://localhost:3000
- **Aynı Wi-Fi'deki telefonlar:** terminalde yazan `http://192.168.x.x:3000` adresi ya da lobideki QR kod
- **İnternetteki arkadaşlar:** `npm run public` → ilk seferde `cloudflared` indirilir (hesap gerekmez),
  `https://….trycloudflare.com` adresi verilir; lobideki davet linki ve QR otomatik bu adresi kullanır.
- Windows'ta çift tıkla: `baslat.cmd` (yerel + Wi-Fi) · `herkese-ac.cmd` (internet)

Gereken: Node.js 20+ (bu makinede 24 ile denendi).

## Oyun

Her hücre, satırındaki ve sütunundaki iki şartın kesişimidir: **Galatasaray × Brezilya** →
Galatasaray'da oynamış Brezilyalı bir futbolcu. Sıran gelince hücre seç, adı yaz, listeden seç.
Doğruysa hücre senin rengine boyanır; yanlışsa, pas geçersen ya da süre dolarsa sıra geçer.
Bir futbolcu bir maçta yalnızca bir kez kullanılır. Yanlış cevapta hangi şartın tutmadığı yazılır.

| | Izgara | Kazanan | Hamle sınırı |
|---|---|---|---|
| 2 kişi | 3×3 | yan yana 3 hücre (yoksa en çok hücre) | 16 |
| 3 kişi | 4×4 | **3'leme** (varsayılan): yan yana 3 hücre · ya da "en çok hücre" | 27 |
| 4 kişi | 4×4 | en çok hücre (varsayılan) · ya da 3'leme | 28 |
| Hızlı mod | her zaman 3×3 | aynı kurallar | 10 / 9 / 12 |

"Yan yana" yatay, dikey ve iki çapraz yönü kapsar; 4×4'te 24 farklı üçlü vardır. Kazanma şekli oda
kurulurken seçilir; hızlı maçta 3 kişilik 3'leme, 4 kişilik en çok hücre oynanır.

**Başlık türleri:** kulüp · ülke (uyruk) · lig · **kupa** (Şampiyonlar Ligi, Avrupa Ligi/UEFA Kupası,
Dünya Kupası, EURO, Süper Lig / Premier Lig / La Liga / Serie A / Bundesliga / Ligue 1 şampiyonluğu) ·
**menajer** ("Mourinho ile çalışmış": kulüpte ya da milli takımda aynı dönemde) · **joker** (Ballon d'Or,
Dünya Kupası'nda oynamış, 2000 sonrası / 1980 öncesi doğumlu, 8+ takım, sonradan teknik direktör) · mevki (Uzman).

- **Klasik:** herkesin bildiği kulüpler + ülke, lig, kupa, menajer ve joker karışımı. Her ızgarada en az
  bir Türk büyüğü bulunur; Fenerbahçe ve Beşiktaş öne çıkar.
- **Hızlı:** Klasik başlıklar, 3×3, az hamle.
- **Uzman:** 104 kulübün tamamı, mevkiler ve daha az bilinen hocalar; bir satır ülke/lig/kupa olabilir;
  rakibin hücresini başka bir futbolcuyla **çalabilirsin** (çalınan hücre kilitlenir).
- Tur süresi: 15 / 30 / 45 / 60 sn. Hızlı maç (eşleştirme) Klasik + 30 sn.
- Bariz hücreler üretilmez (Galatasaray × Türkiye, Galatasaray × Süper Lig). Her hücrenin moda
  uygun sayıda tanınmış cevabı olduğu garanti edilir. Maç sonunda hücrelere dokununca diğer olası
  cevaplar ve toplam cevap sayısı görünür.

## Hesapsız kimlik (madde 6)

- İlk bağlantıda sunucu geçici bir **playerId (uuid)** ve gizli bir **jeton** üretir; istemci ikisini
  `localStorage`'da tutar. Sunucu jetonun yalnızca SHA-256 özetini saklar, sabit zamanlı karşılaştırır.
- Diğer oyunculara playerId gitmez; odada kısa, herkese açık bir `pid` görünür.
- Sayfa yenilenince aynı oturumla **aynı odaya/kuyruğa geri bağlanır**.
- Aynı tarayıcıda ikinci sekme açılırsa eski sekme "başka sekmede açık" der — aynı oyuncu bir odada
  iki koltuk alamaz. (Tek bilgisayarda birden çok oyuncu denemek için adrese `?p=2`, `?p=3` ekle.)
- İstatistikler (maç, galibiyet, mağlubiyet, doğru, yanlış, ELO) yalnızca cihazda: `public/js/store.js`.

## Oda kuralları (madde 2-5, 8-11)

- Kod 5 karakter (çakışma sürerse 6); alfabe `A-Z 2-9`, karışan `0/O`, `1/I` ve Türkçe harf yok.
  Büyük/küçük harf fark etmez; Türkçe klavyedeki `ı/i/İ` doğru eşlenir; davet linki de yapıştırılabilir.
- Hatalar: **"Bu oda bulunamadı."** · **"Bu oda dolu."** · **"Bu maç zaten başladı."** · "Bu oda kapatıldı."
- Aynı ad: **"Eren" zaten kullanılıyor. "Eren123" deneyebilirsin.** (tıklayınca o adla katılır)
- Davet linki `/oda/KOD` → doğrudan "Takma adını gir" ekranı → otomatik katılım. QR kod lobide.
- Host ayrılırsa yetki en eski oyuncuya geçer (👑). Host 15 sn bağlantısız kalırsa da devredilir.
- Bağlantısı kopan oyuncu lobide 45 sn, maçta 90 sn bekletilir; maçta sırası 5 sn'de geçer.
- Odada hiç insan kalmayınca oda kapanır; kod 2 saat "kapatıldı" olarak hatırlanır.
- Host oda dolmadan da başlatabilir (en az 2 oyuncu) ve boş koltuğa bot ekleyebilir.

## Takma ad (madde 7)

3-16 karakter, Türkçe harfler serbest (`Şahin`, `Çağrı`, `Işıl`). Süzgeçler: küfür (Türkçe + İngilizce,
leetspeak ve araya nokta koyma dahil; "Işık", "Götze", "Sikkim" gibi masum adlar geçer), spam (sadece
rakam, aynı harfin tekrarı, bağlantılar), ayrılmış adlar (admin, host…) ve odada aynı ad kontrolü.
Eşleştirmede aynı adlı iki kişi buluşursa ikincisi otomatik `Arda2` olur.

## Eşleştirme (madde 13-14)

2 / 3 / 4 kişilik kuyruklar. Ekranda bekleyen oyuncu sayısı, ortalama bekleme (gerçek bekleme
sürelerinin üstel ortalaması) ve geçen süre. Kuyruk dolunca oda kendiliğinden kurulur, 3 sn geri
sayımla maç başlar. 45 sn'de rakip çıkmazsa **Botlarla başla** seçeneği gelir (o anda kuyruktaki
diğer insanlar önce alınır).

## Güvenlik

CSP (`default-src 'self'`), `nosniff`, çerçeveleme yasak · klasör dışına çıkma engeli · WebSocket
mesajı en fazla 4 KB · bağlantı başına jeton kovası (sn'de 20 mesaj) · IP başına dakikada 20 oda
katılma/sorgulama (kod tahminine karşı) · IP başına 40 bağlantı · kullanıcı metinleri her yerde
`textContent` ile basılır (innerHTML yok) · sunucu tüm oyun kurallarının tek hakemi.

## Veri

Şu anki derleme (2026-09-15): **49.988 futbolcu** (12.440'ı tanınmış, en az 15 Wikipedia maddesi),
104 kulüp, 70 milli takım, 10 lig. Her modda 150 denemede 150 ızgara üretiliyor (~1 ms).

Futbolcu veritabanı **Wikidata**'dan (CC0) derlenir: kulüp üyeliği (P54, tüm kariyer), uyruk
(P27 + P1532 + milli takımda oynamak), mevki (P413), lig (kulübün lig üyeliği P118 + lig sezonlarının
katılımcıları P3450/P1923).

```bash
npm run data:resolve   # katalog adları → Wikidata kimlikleri (tools/resolved.json)
npm run data:build     # SPARQL → server/data/db.json   (yanıtlar tools/.cache'e yazılır)
npm run data:enrich    # kariyer tarihleri, kupalar, menajerler, jokerler, 2026-27 kadroları
```

`data:enrich` tabanı `db.base.json` olarak saklar ve üstüne şunları ekler:
- **Kariyer tarihleri** (P54 başlangıç/bitiş). Bitişi eksik dönem bir sonraki kulübün başladığı yerde kapanır.
- **Kupalar:** sezon kazananı (P1346) kulüpte, final tarihinde kadrodaysa kazanmış sayılır. Wikidata'da kazananı
  boş olan son sezonlar (ör. 2019-20 → 2025-26 Süper Lig) Wikipedia sezon sayfasının bilgi kutusundan tamamlanır.
  Milli takım kupalarında turnuvaya katılım (P1344) + o milli takımda oynamak aranır.
- **Menajerler:** kulüp ve milli takımların baş antrenör dönemleri (P286) ile oyuncunun dönemi en az ~2 ay çakışmalı.
  Türk büyüklerini ya da milli takımı çalıştırmış hocalar her zaman listede.
- **Güncel transferler:** `../futbol-sim-2627` içindeki elle doğrulanmış 2026-27 kadroları (Türk kulüpleri + Avrupa'nın
  16 devi) isim + doğum yılıyla eşlenir; Wikidata'da henüz işlenmemiş transferler de oyuna girer.

Katalog (kulüpler, renkler, bayraklar, ligler): `tools/catalog.mjs`. Yanlış eşleşen bir kaydı
`resolved.json`'da düzeltip `"manual": true` eklersen korunur.

Bilinen sınırlar: Wikidata'da eksik kariyer kaydı olan futbolcu reddedilebilir. "Lig" şartı, o ligde yer
almış bir kulüpte oynamak demektir (kulübün o sırada hangi ligde olduğuna bakılmaz). Çifte
vatandaşlık sayılır. Birleşik Krallık vatandaşı, İskoçya/Galler/K. İrlanda işareti yoksa İngiltere sayılır.

## Testler

```bash
npm test                         # birim + sunucu entegrasyonu (sentetik veri, internet gerekmez)
node tools/ui-check.mjs          # headless Chrome'da 3 ayrı oyuncuyla uçtan uca tur → _shots/
node tools/grid-stats.mjs        # gerçek verinin sağlık raporu ve örnek ızgaralar
```

## Dosyalar

```
server/
  index.js        HTTP (statik + /oda/KOD) ve WebSocket protokolü, sınırlar, LAN adresi
  sessions.js     hesapsız kimlik: playerId + jeton özeti, herkese açık pid
  rooms.js        oda kodu, katılma kuralları, host devri, kopma/yeniden bağlanma, maç yaşam döngüsü
  matchmaking.js  2/3/4 kuyrukları, ortalama bekleme, botla doldurma
  game.js         maç motoru (sıra, süre, cevap doğrulama, üçlü dizi, hücre çalma, sonuç)
  grid.js         mod başına çözülebilir ızgara üretici
  db.js           futbolcu veritabanı, bit kümeleriyle hücre sayımı, Türkçe katlamalı arama
  bots.js         botlar (kazan/blokla stratejisi, moda göre isabet)
  nickname.js     takma ad kuralları ve küfür süzgeci
  codes.js        oda kodu üretimi ve normalleştirme
public/           istemci (derleme adımı yok): app.js ekranlar, gameview.js maç, net.js bağlantı,
                  store.js cihaz verisi, ui.js çizimler (arma, bayrak, forma, QR)
tools/            veri derleyici, tünel, UI turu, sağlık raporu
```

WebSocket protokolü (`/ws`, JSON): `hello` · `nick/check` · `room/create|peek|join|leave|start|addBot|removeBot`
· `queue/join|leave|bots|counts` · `game/select|answer|pass` · `search`. Sunucudan: `room` (tam anlık görüntü),
`queue`, `event` (katıldı/ayrıldı/host/log…), `replaced`.

## Hesap sistemine geçiş (ileride)

Oda ve maç kodu oyuncuyu yalnızca `pid` ile bilir. Hesap eklemek için `Session`'a `accountId` bağlanır
(`server/sessions.js`), istatistik arayüzü (`store.stats / record / forfeit`) uzak bir depoya taşınır.
Oyun akışında değişiklik gerekmez.

## Kalıcı yayın (isteğe bağlı)

`render.yaml` hazır: repoyu Render'a bağlamak yeterli. Ücretsiz katman 15 dk boşta kalınca uyur;
odalar bellekte tutulduğu için uyuyunca açık odalar kapanır. GitHub Pages yetmez (sunucu gerekiyor).
