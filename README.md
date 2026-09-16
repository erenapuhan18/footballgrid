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
**menajer** ("Mourinho ile çalışmış": kulüpte ya da milli takımda aynı dönemde) · **takım arkadaşı**
("Hagi ile oynadı": aynı kulüpte, aynı dönemde) · **joker** · mevki (Uzman).

Başlıklar dengeli dağılır: bir ızgaranın 2×3 (ya da 2×4) başlığının yarısından azı kulüptür, geri kalanı
farklı türlerden birer tane — ızgara "full takım" olmaz.

**Jokerler:** Ballon d'Or · Dünya Kupası'nda oynamış · 2+ ve 3+ Şampiyonlar Ligi · ŞL finali oynamış ·
2 farklı takımla ŞL kazanmış · 3+ kez Süper Lig / Premier Lig / La Liga / Serie A / Bundesliga şampiyonu ·
5 büyük ligin 2+'sinde şampiyon · 5 büyük ligin 3+'ünde ve 4+'ünde oynamış · treble kazanmış ·
tek kulüpte 300+ ve 500+ lig maçı · kariyeri tek kulüpte geçmiş · 100+ lig golü · milli takımda 100+ maç ve
30+ gol · lig gol kralı olmuş · 35 yaşından sonra oynamış · hâlâ oynuyor · 1970'lerde / 80'lerde / 90'larda /
2000 sonrası doğumlu · 8+ takım · sonradan teknik direktör · GS-FB-BJK'den en az ikisi · Süper Lig'de oynamış
yabancı · yurt dışında oynamış Türk. Her jokerin ızgarada kendi kısa işareti var (2×, PL, 500, 35 …).

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
- Host oda dolmadan da başlatabilir (en az 2 oyuncu) ve boş koltuğa **Kolay / Orta / Zor** seviyede bot ekleyebilir.
- Oda doluysa ya da maç başladıysa **İZLE** ile izleyici olarak girilir: ızgarayı ve skoru canlı görürsün, cevap veremezsin.

## Takma ad (madde 7)

3-16 karakter, Türkçe harfler serbest (`Şahin`, `Çağrı`, `Işıl`). Süzgeçler: küfür (Türkçe + İngilizce,
leetspeak ve araya nokta koyma dahil; "Işık", "Götze", "Sikkim" gibi masum adlar geçer), spam (sadece
rakam, aynı harfin tekrarı, bağlantılar), ayrılmış adlar (admin, host…) ve odada aynı ad kontrolü.
Eşleştirmede aynı adlı iki kişi buluşursa ikincisi otomatik `Arda2` olur.

## Eşleştirme (madde 13-14)

2 / 3 / 4 kişilik kuyruklar. Ekranda bekleyen oyuncu sayısı, ortalama bekleme (gerçek bekleme
sürelerinin üstel ortalaması) ve geçen süre. Kuyruk dolunca oda kendiliğinden kurulur, 3 sn geri
sayımla maç başlar. 45 sn'de rakip çıkmazsa **Botlarla başla** seçeneği gelir (seviyesini sen seçersin; o anda kuyruktaki
diğer insanlar önce alınır).

## Güvenlik

CSP (`default-src 'self'`), `nosniff`, çerçeveleme yasak · klasör dışına çıkma engeli · WebSocket
mesajı en fazla 4 KB · bağlantı başına jeton kovası (sn'de 20 mesaj) · IP başına dakikada 20 oda
katılma/sorgulama (kod tahminine karşı) · IP başına 40 bağlantı · kullanıcı metinleri her yerde
`textContent` ile basılır (innerHTML yok) · sunucu tüm oyun kurallarının tek hakemi.

## Veri

Şu anki derleme (2026-09-16): **50.141 futbolcu** (12.439'u tanınmış, en az 15 Wikipedia maddesi),
104 kulüp, 69 milli takım, 10 lig, 133 menajer, 59 takım arkadaşı başlığı, 31 joker (+3 Türkiye jokeri).
Her modda 150 denemede 150 ızgara üretiliyor (~1,5 ms).

Futbolcu veritabanı **Wikidata**'dan (CC0) derlenir, **İngilizce Wikipedia** bilgi kutularıyla (CC BY-SA) düzeltilir:
kulüp kariyeri, uyruk (temsil ettiği milli takım), mevki (P413), doğum yılı, lig (sezon sezon).

```bash
npm run data:resolve   # katalog adları → Wikidata kimlikleri (tools/resolved.json)
npm run data:build     # SPARQL → server/data/db.json   (yanıtlar tools/.cache'e yazılır)
npm run data:enrich    # Wikipedia kariyerleri, lig sezonları, kupalar, menajerler, jokerler, 2026-27 kadroları
node tools/facts.mjs   # bilinen kariyer gerçekleri (5 büyük lig + Süper Lig): ✓/✗
node tools/audit.mjs   # db.json ↔ Wikipedia bilgi kutuları fark raporu → tools/audit.txt
```

`data:enrich` tabanı `db.base.json` olarak saklar ve üstüne şunları ekler:
- **A takım kariyeri (Wikipedia bilgi kutusu):** Wikidata P54 altyapı ve B takımı dönemlerini de ana kulübe yazabiliyor,
  yeni transferlerde de geride kalıyor. Bilgi kutusunun satırlarının çoğu Wikidata'ya eşlenebiliyorsa kulüpler, yıllar
  ve kiralıklar ondan alınır; yalnız altyapısında bulunulan kulüp sayılmaz. Kutu yoksa P54 başlangıç/bitişi kullanılır
  (bitişi eksik dönem bir sonraki kulübün başladığı yerde kapanır).
- **Lig, sezon sezon:** oyuncu oradayken kulüp o ligde miydi? Katılımcılar Wikidata P1923 + sezon maddesinin puan
  tablosu. Premier Lig kurulmadan (1992) önce oynayan ya da kulübün alt lig yıllarında oynayan "o ligde oynadı" sayılmaz.
- **Uyruk:** temsil ettiği A milli takım(lar)ı; A takımda oynamadıysa altyapı milli takımı; o da yoksa vatandaşlık
  (Messi yalnız Arjantin, Özil yalnız Almanya, Çalhanoğlu yalnız Türkiye).
- **Doğum yılı:** Wikidata'da yoksa, akla yatmıyorsa ya da bilgi kutusundan farklıysa bilgi kutusundaki yıl.
- **Kupalar:** sezon kazananı (P1346) kulüpte, final tarihinde kadrodaysa kazanmış sayılır; o sırada başka kulüpte
  kiralıksa sayılmaz. Wikidata'da kazananı boş olan son sezonlar (ör. 2019-20 → 2025-26 Süper Lig) Wikipedia sezon
  sayfasının bilgi kutusundan tamamlanır. Milli takım kupalarında turnuvaya katılım (P1344) + o milli takımda oynamak aranır.
- **Menajerler:** kulüp ve milli takımların baş antrenör dönemleri (P286) ile oyuncunun dönemi (başka kulüpteki kiralık
  süresi düşülerek) en az ~2 ay çakışmalı. Türk büyüklerini ya da milli takımı çalıştırmış hocalar her zaman listede.
- **Güncel transferler:** `../futbol-sim-2627` içindeki elle doğrulanmış 2026-27 kadroları (Türk kulüpleri + Avrupa'nın
  16 devi) isim + doğum yılıyla eşlenir. Yazım farkı (Mohamed/Muhammed Salah, Eljif/Elif Elmas) soyad + doğum yılı +
  uyruk + benzer ilk adla yakalanır; oyuncu iki kez eklenmez, kadrodaki yazım arama adı olur.

Katalog (kulüpler, renkler, bayraklar, ligler): `tools/catalog.mjs`. Yanlış eşleşen bir kaydı
`resolved.json`'da düzeltip `"manual": true` eklersen korunur.

Bilinen sınırlar: Wikipedia maddesi ya da bilgi kutusu olmayan futbolcuda Wikidata kaydı olduğu gibi kullanılır; tarihsiz
dönemde lig doğrulanamaz, eski kayıt kalır. Yalnız katalog dışı bir milli takımda (Yugoslavya, Yeşil Burun …) oynamış
futbolcunun vatandaşlığı sayılır. Birleşik Krallık vatandaşı, İskoçya/Galler/K. İrlanda işareti yoksa İngiltere sayılır.

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
  bots.js         botlar: Kolay/Orta/Zor (isabet, liste derinliği, düşünme süresi, kazan/blokla)
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

## Oda ayarları

Oda kurarken seçilir; host lobide **AYARLAR** ile maçtan önce (ve rövanştan önce) değiştirebilir.

| Ayar | Seçenekler |
|---|---|
| Oyuncu sayısı | 2 · 3 · 4 |
| Oyun modu | Klasik · Hızlı · Uzman |
| Oyun tarzı | **Sırayla** (tur süresi 15/30/45/60 sn) · **Aynı anda** (sıra yok, ilk doğru bilen kapar, yanlış cevaba 3 sn ceza; maç süresi 1/2/3/5 dk) |
| Kazanma şekli | **3'leme** (üçleyen yoksa berabere) · **En çok hücre** (3-4 kişide) · **Nadirlik puanı** (az bilinen doğru cevap çok puan: 10-100) |
| Maç sayısı | Tek maç · 3 maçlık seri · 5 maçlık seri (turnuva: en çok maçı kazanan şampiyon) |
| İpucu | Açık: maç başına 1 (yakın dönemden olası bir cevabın uyruğu, mevkisi, yaşı) · Kapalı |
| Aynı futbolcu | Bir kez · Tekrar olur |

Derbi ve Türkiye jokerleri: "GS · FB · BJK en az ikisinde oynadı", "Süper Lig'de oynamış yabancı", "Yurt dışında
oynamış Türk". Maç bitince hücreye dokun: **oyuncu kartı** (oyundaki kulüpleri yıllarıyla, kupaları, çalıştığı hocalar,
özellikleri) ve diğer olası cevaplar (onların kartları da açılır). Kartlar maç sırasında açılmaz.

## Telefondan oynamak (bilgisayar açık olmadan)

**Canlı adres: https://footballgrid.onrender.com** — telefonda aç → tarayıcı menüsünden **Ana ekrana ekle**: uygulama gibi
tam ekran açılır. Kodu güncelledikten sonra Render panelinde **Manual Deploy → Deploy latest commit** (push kendiliğinden
dağıtım tetiklemiyor; Render GitHub uygulaması depoya kurulursa otomatik olur).

GitHub Pages bu oyunu çalıştıramaz; odalar için sürekli açık bir sunucu gerekir. Kendi kopyanı kurmak istersen:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/erenapuhan18/footballgrid)

1. Düğmeye bas → **GitHub ile giriş yap** (kredi kartı istemez).
2. `render.yaml` okunur (Frankfurt, ücretsiz plan) → **Deploy Blueprint / Apply**.
3. 2-3 dk sonra `https://<ad>.onrender.com` hazır.

Ücretsiz planda 15 dk kimse girmezse sunucu uyur; ilk açılış ~30-60 sn sürer. Odalar bellekte tutulur, sunucu uyuyunca
açık odalar kapanır. Sunucu ~170 MB bellek kullanır (sınır 512 MB).
