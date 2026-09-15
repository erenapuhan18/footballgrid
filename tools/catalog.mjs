/* FOOTBALLGRID kataloğu — ızgara başlıklarında kullanılabilecek her kategori.
   Wikidata kimlikleri `build-data.mjs --resolve` ile arama API'sinden bulunur ve
   tools/resolved.json'a yazılır; oradaki eşleşmeyi gözle kontrol et.

   tier: 'k' = Klasik/Hızlı havuzu (herkesin bildiği), 'u' = yalnızca Uzman. */

// [key, arama, ad, kısa, renk1, renk2, ülke(nation key), lig(league key), tier, açıklama regex'i?]
export const CLUBS = [
  // ── Türkiye
  ['gs', 'Galatasaray S.K.', 'Galatasaray', 'GS', '#a90432', '#fbb800', 'tr', 'tr1', 'k'],
  ['fb', 'Fenerbahçe S.K.', 'Fenerbahçe', 'FB', '#1c3f94', '#ffed00', 'tr', 'tr1', 'k'],
  ['bjk', 'Beşiktaş J.K.', 'Beşiktaş', 'BJK', '#111111', '#f2f2f2', 'tr', 'tr1', 'k'],
  ['ts', 'Trabzonspor', 'Trabzonspor', 'TS', '#69140e', '#8ec5e6', 'tr', 'tr1', 'k'],
  ['ibfk', 'İstanbul Başakşehir F.K.', 'Başakşehir', 'İBFK', '#f47b20', '#1b3b6f', 'tr', 'tr1', 'u'],
  ['bursa', 'Bursaspor', 'Bursaspor', 'BUR', '#00a650', '#ffffff', 'tr', 'tr1', 'u'],
  ['goz', 'Göztepe S.K.', 'Göztepe', 'GÖZ', '#fcd116', '#e30613', 'tr', 'tr1', 'u'],
  ['ant', 'Antalyaspor', 'Antalyaspor', 'ANT', '#e30613', '#ffffff', 'tr', 'tr1', 'u'],
  ['kon', 'Konyaspor', 'Konyaspor', 'KON', '#00843d', '#ffffff', 'tr', 'tr1', 'u'],
  ['kay', 'Kayserispor', 'Kayserispor', 'KAY', '#fcd116', '#e30613', 'tr', 'tr1', 'u'],
  ['siv', 'Sivasspor', 'Sivasspor', 'SİV', '#e30613', '#ffffff', 'tr', 'tr1', 'u'],
  ['gb', 'Gençlerbirliği S.K.', 'Gençlerbirliği', 'GB', '#e30613', '#111111', 'tr', 'tr1', 'u'],
  ['agu', 'MKE Ankaragücü', 'Ankaragücü', 'AGÜ', '#0b3d91', '#fcd116', 'tr', 'tr1', 'u'],
  ['sam', 'Samsunspor', 'Samsunspor', 'SAM', '#e30613', '#ffffff', 'tr', 'tr1', 'u'],
  ['kas', 'Kasımpaşa S.K.', 'Kasımpaşa', 'KSP', '#1b4f9c', '#ffffff', 'tr', 'tr1', 'u'],
  ['es', 'Eskişehirspor', 'Eskişehirspor', 'ES', '#e30613', '#111111', 'tr', 'tr1', 'u'],
  // ── İngiltere
  ['mun', 'Manchester United F.C.', 'Manchester United', 'MUN', '#da291c', '#fbe122', 'en', 'eng', 'k'],
  ['mci', 'Manchester City F.C.', 'Manchester City', 'MCI', '#6cabdd', '#1c2c5b', 'en', 'eng', 'k'],
  ['liv', 'Liverpool F.C.', 'Liverpool', 'LIV', '#c8102e', '#f6eb61', 'en', 'eng', 'k'],
  ['che', 'Chelsea F.C.', 'Chelsea', 'CHE', '#034694', '#ffffff', 'en', 'eng', 'k'],
  ['ars', 'Arsenal F.C.', 'Arsenal', 'ARS', '#ef0107', '#ffffff', 'en', 'eng', 'k'],
  ['tot', 'Tottenham Hotspur F.C.', 'Tottenham', 'TOT', '#132257', '#ffffff', 'en', 'eng', 'k'],
  ['eve', 'Everton F.C.', 'Everton', 'EVE', '#003399', '#ffffff', 'en', 'eng', 'u'],
  ['new', 'Newcastle United F.C.', 'Newcastle', 'NEW', '#241f20', '#ffffff', 'en', 'eng', 'u'],
  ['avl', 'Aston Villa F.C.', 'Aston Villa', 'AVL', '#670e36', '#95bfe5', 'en', 'eng', 'u'],
  ['whu', 'West Ham United F.C.', 'West Ham', 'WHU', '#7a263a', '#1bb1e7', 'en', 'eng', 'u'],
  ['lei', 'Leicester City F.C.', 'Leicester', 'LEI', '#003090', '#fdbe11', 'en', 'eng', 'u'],
  ['lee', 'Leeds United F.C.', 'Leeds United', 'LEE', '#ffffff', '#1d428a', 'en', 'eng', 'u'],
  ['sou', 'Southampton F.C.', 'Southampton', 'SOU', '#d71920', '#ffffff', 'en', 'eng', 'u'],
  // ── İspanya
  ['rma', 'Real Madrid CF', 'Real Madrid', 'RMA', '#ffffff', '#febe10', 'es', 'esp', 'k'],
  ['bar', 'FC Barcelona', 'Barcelona', 'BAR', '#a50044', '#004d98', 'es', 'esp', 'k'],
  ['atm', 'Atlético Madrid', 'Atlético Madrid', 'ATM', '#cb3524', '#ffffff', 'es', 'esp', 'k'],
  ['sev', 'Sevilla FC', 'Sevilla', 'SEV', '#ffffff', '#d40026', 'es', 'esp', 'k'],
  ['val', 'Valencia CF', 'Valencia', 'VAL', '#ffffff', '#ee3524', 'es', 'esp', 'k'],
  ['vil', 'Villarreal CF', 'Villarreal', 'VIL', '#ffe667', '#005187', 'es', 'esp', 'u'],
  ['bet', 'Real Betis', 'Real Betis', 'BET', '#00954c', '#ffffff', 'es', 'esp', 'u'],
  ['ath', 'Athletic Bilbao', 'Athletic Bilbao', 'ATH', '#ee2523', '#ffffff', 'es', 'esp', 'u'],
  ['rso', 'Real Sociedad', 'Real Sociedad', 'RSO', '#0067b1', '#ffffff', 'es', 'esp', 'u'],
  ['dep', 'Deportivo de La Coruña', 'Deportivo', 'DEP', '#0067b1', '#ffffff', 'es', 'esp', 'u'],
  ['rcde', 'RCD Espanyol', 'Espanyol', 'ESP', '#007fc8', '#ffffff', 'es', 'esp', 'u'],
  // ── İtalya
  ['juv', 'Juventus FC', 'Juventus', 'JUV', '#111111', '#ffffff', 'it', 'ita', 'k'],
  ['mil', 'AC Milan', 'Milan', 'MIL', '#fb090b', '#111111', 'it', 'ita', 'k'],
  ['int', 'Inter Milan', 'Inter', 'INT', '#0068a8', '#111111', 'it', 'ita', 'k'],
  ['rom', 'AS Roma', 'Roma', 'ROM', '#8e1f2f', '#f0bc42', 'it', 'ita', 'k'],
  ['nap', 'SSC Napoli', 'Napoli', 'NAP', '#12a0d7', '#ffffff', 'it', 'ita', 'k'],
  ['laz', 'SS Lazio', 'Lazio', 'LAZ', '#87d8f7', '#ffffff', 'it', 'ita', 'k'],
  ['fio', 'ACF Fiorentina', 'Fiorentina', 'FIO', '#592c82', '#ffffff', 'it', 'ita', 'u'],
  ['ata', 'Atalanta BC', 'Atalanta', 'ATA', '#1e71b8', '#111111', 'it', 'ita', 'u'],
  ['prm', 'Parma Calcio 1913', 'Parma', 'PAR', '#fdd835', '#0b3d91', 'it', 'ita', 'u'],
  ['samp', 'UC Sampdoria', 'Sampdoria', 'SAMP', '#1b5497', '#ffffff', 'it', 'ita', 'u'],
  ['udi', 'Udinese Calcio', 'Udinese', 'UDI', '#111111', '#ffffff', 'it', 'ita', 'u'],
  ['tor', 'Torino FC', 'Torino', 'TOR', '#8b1a1a', '#ffffff', 'it', 'ita', 'u'],
  // ── Almanya
  ['bay', 'FC Bayern Munich', 'Bayern München', 'FCB', '#dc052d', '#ffffff', 'de', 'ger', 'k'],
  ['bvb', 'Borussia Dortmund', 'Dortmund', 'BVB', '#fde100', '#111111', 'de', 'ger', 'k'],
  ['b04', 'Bayer 04 Leverkusen', 'Leverkusen', 'B04', '#e32221', '#111111', 'de', 'ger', 'k'],
  ['s04', 'FC Schalke 04', 'Schalke 04', 'S04', '#004d9d', '#ffffff', 'de', 'ger', 'k'],
  ['wob', 'VfL Wolfsburg', 'Wolfsburg', 'WOB', '#65b32e', '#ffffff', 'de', 'ger', 'u'],
  ['vfb', 'VfB Stuttgart', 'Stuttgart', 'VFB', '#ffffff', '#e32219', 'de', 'ger', 'u'],
  ['hsv', 'Hamburger SV', 'Hamburg', 'HSV', '#0b3d91', '#ffffff', 'de', 'ger', 'u'],
  ['svw', 'SV Werder Bremen', 'Werder Bremen', 'SVW', '#1d9053', '#ffffff', 'de', 'ger', 'u'],
  ['sge', 'Eintracht Frankfurt', 'Frankfurt', 'SGE', '#111111', '#e1000f', 'de', 'ger', 'u'],
  ['bmg', 'Borussia Mönchengladbach', "M'gladbach", 'BMG', '#ffffff', '#111111', 'de', 'ger', 'u'],
  ['rbl', 'RB Leipzig', 'Leipzig', 'RBL', '#dd0741', '#ffffff', 'de', 'ger', 'u'],
  ['bsc', 'Hertha BSC', 'Hertha', 'BSC', '#005ca9', '#ffffff', 'de', 'ger', 'u'],
  // ── Fransa
  ['psg', 'Paris Saint-Germain F.C.', 'PSG', 'PSG', '#004170', '#da291c', 'fr', 'fra', 'k'],
  ['om', 'Olympique de Marseille', 'Marsilya', 'OM', '#2faee0', '#ffffff', 'fr', 'fra', 'k'],
  ['ol', 'Olympique Lyonnais', 'Lyon', 'OL', '#ffffff', '#da291c', 'fr', 'fra', 'k'],
  ['asm', 'AS Monaco FC', 'Monaco', 'ASM', '#e63946', '#ffffff', 'fr', 'fra', 'k'],
  ['losc', 'Lille OSC', 'Lille', 'LIL', '#e01e13', '#0b3d91', 'fr', 'fra', 'u'],
  ['fcgb', 'FC Girondins de Bordeaux', 'Bordeaux', 'BOR', '#0b1f45', '#ffffff', 'fr', 'fra', 'u'],
  ['srfc', 'Stade Rennais F.C.', 'Rennes', 'REN', '#e2001a', '#111111', 'fr', 'fra', 'u'],
  ['asse', 'AS Saint-Étienne', 'Saint-Étienne', 'ASSE', '#00843d', '#ffffff', 'fr', 'fra', 'u'],
  ['ogcn', 'OGC Nice', 'Nice', 'NIC', '#e2001a', '#111111', 'fr', 'fra', 'u'],
  // ── Portekiz · Hollanda
  ['slb', 'S.L. Benfica', 'Benfica', 'SLB', '#e20e0e', '#ffffff', 'pt', 'por', 'k'],
  ['fcp', 'FC Porto', 'Porto', 'FCP', '#003893', '#ffffff', 'pt', 'por', 'k'],
  ['scp', 'Sporting CP', 'Sporting', 'SCP', '#008057', '#ffffff', 'pt', 'por', 'k'],
  ['scb', 'S.C. Braga', 'Braga', 'SCB', '#e30613', '#ffffff', 'pt', 'por', 'u'],
  ['aja', 'AFC Ajax', 'Ajax', 'AJA', '#d2122e', '#ffffff', 'nl', 'ned', 'k'],
  ['psv', 'PSV Eindhoven', 'PSV', 'PSV', '#ed1c24', '#ffffff', 'nl', 'ned', 'k'],
  ['fey', 'Feyenoord', 'Feyenoord', 'FEY', '#e30613', '#111111', 'nl', 'ned', 'u'],
  // ── Diğer
  ['cel', 'Celtic F.C.', 'Celtic', 'CEL', '#018749', '#ffffff', 'sc', null, 'u'],
  ['ran', 'Rangers F.C.', 'Rangers', 'RAN', '#1b458f', '#ffffff', 'sc', null, 'u'],
  ['rsca', 'R.S.C. Anderlecht', 'Anderlecht', 'AND', '#5c2d91', '#ffffff', 'be', null, 'u'],
  ['brg', 'Club Brugge KV', 'Club Brugge', 'BRU', '#0077c8', '#111111', 'be', null, 'u'],
  ['oly', 'Olympiacos F.C.', 'Olympiakos', 'OLY', '#e30613', '#ffffff', 'gr', null, 'u'],
  ['pao', 'Panathinaikos F.C.', 'Panathinaikos', 'PAO', '#007a33', '#ffffff', 'gr', null, 'u'],
  ['shk', 'FC Shakhtar Donetsk', 'Şahtar Donetsk', 'SHA', '#f58220', '#111111', 'ua', null, 'u'],
  ['dyn', 'FC Dynamo Kyiv', 'Dinamo Kiev', 'DYN', '#ffffff', '#0b3d91', 'ua', null, 'u'],
  ['zen', 'FC Zenit Saint Petersburg', 'Zenit', 'ZEN', '#0099ff', '#ffffff', 'ru', null, 'u'],
  ['nas', 'Al-Nassr FC', 'Al-Nassr', 'NAS', '#fcd116', '#0b3d91', null, 'ksa', 'u'],
  ['hil', 'Al-Hilal SFC', 'Al-Hilal', 'HIL', '#0b3d91', '#ffffff', null, 'ksa', 'u'],
  ['itt', 'Al-Ittihad Club', 'Al-Ittihad', 'ITT', '#fcd116', '#111111', null, 'ksa', 'u', /saudi|jeddah/i],
  ['mia', 'Inter Miami CF', 'Inter Miami', 'MIA', '#f7b5cd', '#231f20', 'us', 'mls', 'u'],
  ['lag', 'LA Galaxy', 'LA Galaxy', 'LAG', '#00245d', '#ffd200', 'us', 'mls', 'u'],
  ['boca', 'Boca Juniors', 'Boca Juniors', 'BOC', '#0b3d91', '#fcd116', 'ar', null, 'u'],
  ['riv', 'Club Atlético River Plate', 'River Plate', 'RIV', '#ffffff', '#e30613', 'ar', null, 'u'],
  ['fla', 'CR Flamengo', 'Flamengo', 'FLA', '#e30613', '#111111', 'br', null, 'u'],
  ['sfc', 'Santos FC', 'Santos', 'SAN', '#ffffff', '#111111', 'br', null, 'u'],
  ['spfc', 'São Paulo FC', 'São Paulo', 'SPFC', '#ffffff', '#e30613', 'br', null, 'u'],
  ['sccp', 'Sport Club Corinthians Paulista', 'Corinthians', 'COR', '#ffffff', '#111111', 'br', null, 'u'],
  ['sep', 'Sociedade Esportiva Palmeiras', 'Palmeiras', 'PAL', '#006437', '#ffffff', 'br', null, 'u'],
  ['rbs', 'FC Red Bull Salzburg', 'Salzburg', 'RBS', '#dd0741', '#ffffff', 'at', null, 'u'],
  ['dzg', 'GNK Dinamo Zagreb', 'Dinamo Zagreb', 'DZG', '#0b3d91', '#ffffff', 'hr', null, 'u'],
  ['czv', 'Red Star Belgrade', 'Kızılyıldız', 'CZV', '#e30613', '#ffffff', 'rs', null, 'u'],
];

/* Milli takımlar / uyruk.
   [key, ad, Wikidata ülke QID'leri (vatandaşlık/sportif uyruk), milli takım araması, bayrak, tier]
   Bayrak mini-dili (istemci çizer): "h:renk,renk" yatay şerit, "v:" dikey, "renk:2" ağırlık;
   "|" ile katman: dot, star, cross, saltire, nordic, canton, crescent, rhombus, swiss, diag */
export const NATIONS = [
  ['tr', 'Türkiye', ['Q43', 'Q12560'], 'Turkey national football team', 'bg:#e30a17|crescent:#ffffff', 'k'],
  ['br', 'Brezilya', ['Q155'], 'Brazil national football team', 'bg:#009c3b|rhombus:#ffdf00|dot:#002776', 'k'],
  ['ar', 'Arjantin', ['Q414'], 'Argentina national football team', 'h:#74acdf,#ffffff,#74acdf|dot:#f6b40e', 'k'],
  ['fr', 'Fransa', ['Q142'], 'France national football team', 'v:#0055a4,#ffffff,#ef4135', 'k'],
  ['es', 'İspanya', ['Q29'], 'Spain national football team', 'h:#aa151b:1,#f1bf00:2,#aa151b:1', 'k'],
  ['de', 'Almanya', ['Q183', 'Q713750', 'Q43287', 'Q41304', 'Q7318'], 'Germany national football team', 'h:#111111,#dd0000,#ffce00', 'k'],
  ['it', 'İtalya', ['Q38', 'Q172579'], 'Italy national football team', 'v:#009246,#ffffff,#ce2b37', 'k'],
  ['pt', 'Portekiz', ['Q45'], 'Portugal national football team', 'v:#046a38:2,#da291c:3|dot:#ffe900', 'k'],
  ['nl', 'Hollanda', ['Q55', 'Q29999'], 'Netherlands national football team', 'h:#ae1c28,#ffffff,#21468b', 'k'],
  ['en', 'İngiltere', ['Q21'], 'England national football team', 'bg:#ffffff|cross:#ce1124', 'k'],
  ['be', 'Belçika', ['Q31'], 'Belgium national football team', 'v:#111111,#fdda24,#ef3340', 'k'],
  ['uy', 'Uruguay', ['Q77'], 'Uruguay national football team', 'h:#ffffff,#0038a8,#ffffff,#0038a8,#ffffff|canton:#ffffff|cdot:#fcd116', 'k'],
  ['co', 'Kolombiya', ['Q739'], 'Colombia national football team', 'h:#fcd116:2,#003893:1,#ce1126:1', 'k'],
  ['hr', 'Hırvatistan', ['Q224'], 'Croatia national football team', 'h:#ff0000,#ffffff,#171796|dot:#ff0000', 'k'],
  ['rs', 'Sırbistan', ['Q403'], 'Serbia national football team', 'h:#c6363c,#0c4076,#ffffff', 'k'],
  ['sn', 'Senegal', ['Q1041'], 'Senegal national football team', 'v:#00853f,#fdef42,#e31b23|star:#00853f', 'k'],
  ['ng', 'Nijerya', ['Q1033'], 'Nigeria national football team', 'v:#008751,#ffffff,#008751', 'k'],
  ['ci', 'Fildişi Sahili', ['Q1008'], "Ivory Coast national football team", 'v:#f77f00,#ffffff,#009e60', 'k'],
  ['cm', 'Kamerun', ['Q1009'], 'Cameroon national football team', 'v:#007a5e,#ce1126,#fcd116|star:#fcd116', 'k'],
  ['ma', 'Fas', ['Q1028'], 'Morocco national football team', 'bg:#c1272d|star:#006233', 'k'],
  ['dk', 'Danimarka', ['Q35'], 'Denmark national football team', 'bg:#c8102e|nordic:#ffffff', 'k'],
  ['se', 'İsveç', ['Q34'], 'Sweden national football team', 'bg:#006aa7|nordic:#fecc00', 'k'],
  ['pl', 'Polonya', ['Q36'], 'Poland national football team', 'h:#ffffff,#dc143c', 'k'],
  ['cz', 'Çekya', ['Q213'], 'Czech Republic national football team', 'h:#ffffff,#d7141a|tri:#11457e', 'k'],
  ['gr', 'Yunanistan', ['Q41'], 'Greece national football team', 'h:#0d5eaf,#ffffff,#0d5eaf,#ffffff,#0d5eaf,#ffffff,#0d5eaf,#ffffff,#0d5eaf|canton:#0d5eaf|ccross:#ffffff', 'k'],
  ['gh', 'Gana', ['Q117'], 'Ghana national football team', 'h:#ce1126,#fcd116,#006b3f|star:#111111', 'u'],
  ['eg', 'Mısır', ['Q79'], 'Egypt national football team', 'h:#ce1126,#ffffff,#111111', 'u'],
  ['dz', 'Cezayir', ['Q262'], 'Algeria national football team', 'v:#006233,#ffffff|crescent:#d21034', 'u'],
  ['mx', 'Meksika', ['Q96'], 'Mexico national football team', 'v:#006847,#ffffff,#ce1126|dot:#8c5a2b', 'u'],
  ['us', 'ABD', ['Q30'], "United States men's national soccer team", 'h:#b22234,#ffffff,#b22234,#ffffff,#b22234,#ffffff,#b22234|canton:#3c3b6e', 'u'],
  ['jp', 'Japonya', ['Q17'], 'Japan national football team', 'bg:#ffffff|bigdot:#bc002d', 'u'],
  ['kr', 'Güney Kore', ['Q884'], 'South Korea national football team', 'bg:#ffffff|yinyang:#cd2e3a,#0047a0', 'u'],
  ['no', 'Norveç', ['Q20'], 'Norway national football team', 'bg:#ba0c2f|nordic2:#ffffff,#00205b', 'u'],
  ['at', 'Avusturya', ['Q40'], 'Austria national football team', 'h:#ed2939,#ffffff,#ed2939', 'u'],
  ['ch', 'İsviçre', ['Q39'], 'Switzerland national football team', 'bg:#d52b1e|swiss:#ffffff', 'u'],
  ['ru', 'Rusya', ['Q159'], 'Russia national football team', 'h:#ffffff,#0039a6,#d52b1e', 'u'],
  ['ua', 'Ukrayna', ['Q212'], 'Ukraine national football team', 'h:#0057b7,#ffd700', 'u'],
  ['cl', 'Şili', ['Q298'], 'Chile national football team', 'h:#ffffff,#d52b1e|canton:#0039a6|cstar:#ffffff', 'u'],
  ['py', 'Paraguay', ['Q733'], 'Paraguay national football team', 'h:#d52b1e,#ffffff,#0038a8', 'u'],
  ['pe', 'Peru', ['Q419'], 'Peru national football team', 'v:#d91023,#ffffff,#d91023', 'u'],
  ['ec', 'Ekvador', ['Q736'], 'Ecuador national football team', 'h:#ffd100:2,#0072ce:1,#ef3340:1', 'u'],
  ['ie', 'İrlanda', ['Q27'], 'Republic of Ireland national football team', 'v:#169b62,#ffffff,#ff883e', 'u'],
  ['sc', 'İskoçya', ['Q22'], 'Scotland national football team', 'bg:#0065bd|saltire:#ffffff', 'u'],
  ['wa', 'Galler', ['Q25'], 'Wales national football team', 'h:#ffffff,#00b140|dot:#c8102e', 'u'],
  ['ba', 'Bosna-Hersek', ['Q225'], 'Bosnia and Herzegovina national football team', 'bg:#002395|diag:#fecb00', 'u'],
  ['ge', 'Gürcistan', ['Q230'], 'Georgia national football team', 'bg:#ffffff|cross:#ff0000', 'u'],
  ['ir', 'İran', ['Q794'], 'Iran national football team', 'h:#239f40,#ffffff,#da0000', 'u'],
  ['ml', 'Mali', ['Q912'], 'Mali national football team', 'v:#14b53a,#fcd116,#ce1126', 'u'],
  ['au', 'Avustralya', ['Q408'], 'Australia national soccer team', 'bg:#012169|canton:#012169|cstar:#ffffff|star:#ffffff', 'u'],
  ['hu', 'Macaristan', ['Q28'], 'Hungary national football team', 'h:#ce2939,#ffffff,#477050', 'u'],
  ['ro', 'Romanya', ['Q218'], 'Romania national football team', 'v:#002b7f,#fcd116,#ce1126', 'u'],
  ['bg', 'Bulgaristan', ['Q219'], 'Bulgaria national football team', 'h:#ffffff,#00966e,#d62612', 'u'],
  ['sk', 'Slovakya', ['Q214'], 'Slovakia national football team', 'h:#ffffff,#0b4ea2,#ee1c25', 'u'],
  ['si', 'Slovenya', ['Q215'], 'Slovenia national football team', 'h:#ffffff,#005da4,#ed1c24', 'u'],
  ['al', 'Arnavutluk', ['Q222'], 'Albania national football team', 'bg:#e41e20|dot:#111111', 'u'],
  ['tn', 'Tunus', ['Q948'], 'Tunisia national football team', 'bg:#e70013|dot:#ffffff', 'u'],
  ['ca', 'Kanada', ['Q16'], 'Canada men\'s national soccer team', 'v:#d52b1e:1,#ffffff:2,#d52b1e:1|dot:#d52b1e', 'u'],
  ['is', 'İzlanda', ['Q189'], 'Iceland national football team', 'bg:#02529c|nordic2:#ffffff,#dc1e35', 'u'],
  ['fi', 'Finlandiya', ['Q33'], 'Finland national football team', 'bg:#ffffff|nordic:#002f6c', 'u'],
  ['ve', 'Venezuela', ['Q717'], 'Venezuela national football team', 'h:#ffcc00,#00247d,#cf142b', 'u'],
  ['ga', 'Gabon', ['Q1000'], 'Gabon national football team', 'h:#009e60,#fcd116,#3a75c4', 'u'],
  ['cd', 'DR Kongo', ['Q974'], 'DR Congo national football team', 'bg:#007fff|diag:#ce1021', 'u'],
  ['gn', 'Gine', ['Q1006'], 'Guinea national football team', 'v:#ce1126,#fcd116,#009460', 'u'],
  ['me', 'Karadağ', ['Q236'], 'Montenegro national football team', 'bg:#c40308|dot:#d4af3a', 'u'],
  ['mk', 'K. Makedonya', ['Q221'], 'North Macedonia national football team', 'bg:#d20000|dot:#ffe600', 'u'],
  ['xk', 'Kosova', ['Q1246'], 'Kosovo national football team', 'bg:#244aa5|dot:#d0a650', 'u'],
  ['az', 'Azerbaycan', ['Q227'], 'Azerbaijan national football team', 'h:#00b5e2,#ef3340,#509e2f', 'u'],
  ['jm', 'Jamaika', ['Q766'], 'Jamaica national football team', 'bg:#009b3a|saltire:#fed100', 'u'],
  ['cr', 'Kosta Rika', ['Q800'], 'Costa Rica national football team', 'h:#002b7f:1,#ffffff:1,#ce1126:2,#ffffff:1,#002b7f:1', 'u'],
];

/* İngiltere/İskoçya/Galler vatandaşlıkta "Birleşik Krallık" (Q145) olarak geçer.
   Sportif uyruk (P1532) ya da milli takım yoksa Birleşik Krallık vatandaşı İngiltere sayılır;
   Kuzey İrlanda milli takımı yalnızca bu varsayımı engellemek için çözümlenir. */
export const UK = 'Q145';
export const UK_BLOCKERS = [['nir', 'Northern Ireland national football team']];

// [key, arama, ad, kısa, açıklama regex'i]
export const LEAGUES = [
  ['tr1', 'Süper Lig', 'Süper Lig', 'SL', /turk/i],
  ['eng', 'Premier League', 'Premier Lig', 'PL', /engl/i],
  ['esp', 'La Liga', 'La Liga', 'LL', /spa/i],
  ['ita', 'Serie A', 'Serie A', 'SA', /ital/i],
  ['ger', 'Bundesliga', 'Bundesliga', 'BL', /germ/i],
  ['fra', 'Ligue 1', 'Ligue 1', 'L1', /fren|franc/i],
  ['por', 'Primeira Liga', 'Liga Portugal', 'LP', /portug/i],
  ['ned', 'Eredivisie', 'Eredivisie', 'ED', /dutch|nether/i],
  ['ksa', 'Saudi Pro League', 'Suudi Pro Lig', 'SPL', /saudi/i],
  ['mls', 'Major League Soccer', 'MLS', 'MLS', /soccer|united states|north america/i],
];

/* Kupalar. [key, başlık, kısa, Wikidata yarışması (ya da lig:anahtar), tür, tier, olumlu, olumsuz]
   tür 'club': sezon kazananı kulüpte, finalin olduğu tarihte kadrodaysa kazanmış sayılır.
   tür 'nt'  : turnuvaya katılmış (P1344) ve kazanan milli takımın oyuncusuysa kazanmış sayılır. */
export const COMPETITIONS = [
  ['ucl', 'Şampiyonlar Ligi', 'ŞL', 'Q18756', 'club', 'k', 'Şampiyonlar Ligi kazanmış', 'Şampiyonlar Ligi kazanmadı'],
  ['uel', 'Avrupa Ligi / UEFA Kupası', 'UEL', 'Q18760', 'club', 'k', 'Avrupa Ligi (UEFA Kupası) kazanmış', 'Avrupa Ligi kazanmadı'],
  ['wc', 'Dünya Kupası', 'DK', 'Q19317', 'nt', 'k', 'Dünya Kupası kazanmış', 'Dünya Kupası kazanmadı'],
  ['euro', 'Avrupa Şampiyonası', 'EURO', 'Q260858', 'nt', 'k', 'Avrupa Şampiyonası (EURO) kazanmış', 'EURO kazanmadı'],
  ['tr1', 'Süper Lig şampiyonu', 'SL', 'lg:tr1', 'club', 'k', 'Süper Lig şampiyonu olmuş', 'Süper Lig şampiyonu olmadı'],
  ['eng', 'Premier Lig şampiyonu', 'PL', 'lg:eng', 'club', 'k', 'Premier Lig şampiyonu olmuş', 'Premier Lig şampiyonu olmadı'],
  ['esp', 'La Liga şampiyonu', 'LL', 'lg:esp', 'club', 'k', 'La Liga şampiyonu olmuş', 'La Liga şampiyonu olmadı'],
  ['ita', 'Serie A şampiyonu', 'SA', 'lg:ita', 'club', 'k', 'Serie A şampiyonu olmuş', 'Serie A şampiyonu olmadı'],
  ['ger', 'Bundesliga şampiyonu', 'BL', 'lg:ger', 'club', 'k', 'Bundesliga şampiyonu olmuş', 'Bundesliga şampiyonu olmadı'],
  ['fra', 'Ligue 1 şampiyonu', 'L1', 'lg:fra', 'club', 'u', 'Ligue 1 şampiyonu olmuş', 'Ligue 1 şampiyonu olmadı'],
];

/* Jokerler (wildcard). [key, başlık, olumlu, olumsuz, tier] — hesaplaması tools/enrich.mjs'te. */
export const WILDCARDS = [
  ['ballon', "Ballon d'Or", "Ballon d'Or kazanmış", "Ballon d'Or kazanmadı", 'k'],
  ['wcplay', "Dünya Kupası'nda oynadı", "Dünya Kupası'nda oynamış", "Dünya Kupası'nda oynamadı", 'k'],
  ['y2000', '2000 sonrası doğumlu', '2000 ya da sonrasında doğmuş', '2000 öncesi doğmuş', 'k'],
  ['pre1980', '1980 öncesi doğumlu', '1980 öncesi doğmuş', '1980 öncesi doğmamış', 'k'],
  ['clubs8', '8+ takımda oynadı', 'En az 8 farklı takımda oynamış (kiralık ve altyapı dahil)', '8 farklı takıma ulaşmamış', 'u'],
  ['coach', 'Teknik direktör oldu', 'Sonradan teknik direktörlük de yapmış', 'teknik direktörlük yapmamış', 'k'],
];

/* futbol-sim-2627'nin elle doğrulanmış 2026-27 kadroları → güncel transferler.
   sim kulüp anahtarı → katalog anahtarı; uyruk ve mevki kodları. */
export const SIM_CLUBS = {
  gs: 'gs', fb: 'fb', bjk: 'bjk', ts: 'ts', ibfk: 'ibfk', sam: 'sam', goz: 'goz', kon: 'kon', ant: 'ant',
  kay: 'kay', kas: 'kas', gen: 'gb', rma: 'rma', bar: 'bar', mci: 'mci', liv: 'liv', ars: 'ars', che: 'che',
  mun: 'mun', tot: 'tot', bay: 'bay', bvb: 'bvb', psg: 'psg', int: 'int', mil: 'mil', juv: 'juv', nap: 'nap', atm: 'atm',
};
export const SIM_NATIONS = {
  TUR: 'tr', BRA: 'br', ARG: 'ar', FRA: 'fr', ESP: 'es', GER: 'de', ITA: 'it', POR: 'pt', NED: 'nl', ENG: 'en',
  BEL: 'be', URU: 'uy', COL: 'co', CRO: 'hr', SRB: 'rs', SEN: 'sn', NGA: 'ng', CIV: 'ci', CMR: 'cm', MAR: 'ma',
  DEN: 'dk', SWE: 'se', POL: 'pl', CZE: 'cz', GRE: 'gr', GHA: 'gh', EGY: 'eg', ALG: 'dz', MEX: 'mx', USA: 'us',
  JPN: 'jp', KOR: 'kr', NOR: 'no', AUT: 'at', SUI: 'ch', RUS: 'ru', UKR: 'ua', CHI: 'cl', PAR: 'py', PER: 'pe',
  ECU: 'ec', IRL: 'ie', SCO: 'sc', WAL: 'wa', BIH: 'ba', GEO: 'ge', IRN: 'ir', MLI: 'ml', AUS: 'au', HUN: 'hu',
  ROU: 'ro', BUL: 'bg', SVK: 'sk', SVN: 'si', ALB: 'al', TUN: 'tn', CAN: 'ca', ISL: 'is', FIN: 'fi', VEN: 've',
  GAB: 'ga', COD: 'cd', GUI: 'gn', MNE: 'me', MKD: 'mk', KVX: 'xk', AZE: 'az', JAM: 'jm', CRC: 'cr',
};
// bit: kaleci 1, defans 2, orta saha 4, forvet 8
export const SIM_POS = { GK: 1, CB: 2, LB: 2, RB: 2, LWB: 2, RWB: 2, CDM: 4, CM: 4, CAM: 4, LM: 4, RM: 4, LW: 12, RW: 12, ST: 8, CF: 8, SS: 8 };

export const POSITIONS = [
  ['gk', 'Kaleci', /goal ?keeper|goalie/i],
  ['df', 'Defans', /back|defender|sweeper|libero|stopper/i],
  ['mf', 'Orta saha', /midfield|playmaker|winger|wing-half|half-back/i],
  ['fw', 'Forvet', /forward|striker|winger|attacker|inside/i],
];
