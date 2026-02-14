export type Wa12Preset = {
  oldSessionNames: string[];
  newSessionNames: string[];
  oldScriptLineParity: 'odd' | 'even' | 'all';
  newScriptLineParity: 'odd' | 'even' | 'all';
  scriptText: string;
  // Mapping session name ke starting line untuk sistem auto pesan
  // Old sessions mulai di kelipatan 24 (1, 24, 48, 72, 96)
  // Setiap Old punya 2 pasangan New di line berikutnya
  sessionStartingLines: Record<string, number>;
  automationDefaults: {
    timezone: string;
    windowStart: string;
    windowEnd: string;
    day1MessagesPerNew: number;
    day2MessagesPerNew: number;
    day3MessagesPerNew: number;
  };
  scripts?: Record<string, string>;
};

export const WA12_PRESET: Wa12Preset = {
  oldSessionNames: ['old-1', 'old-2', 'old-3', 'old-4', 'old-5'],
  newSessionNames: ['new-1', 'new-2', 'new-3', 'new-4', 'new-5', 'new-6', 'new-7', 'new-8', 'new-9', 'new-10'],
  // Untuk percakapan 2 arah:
  // - OLD kirim baris ganjil dari starting line masing-masing
  // - NEW balas baris genap dari starting line masing-masing
  oldScriptLineParity: 'odd',
  newScriptLineParity: 'even',
  // Mapping session ke starting line:
  // Old sessions HARUS mulai di baris GANJIL (odd), New bisa ganjil atau genap
  // Old 1 mulai di line 1 dengan pasangan New 1 (line 2) dan New 2 (line 3)
  // Old 2 mulai di line 25 dengan pasangan New 3 (line 26) dan New 4 (line 27)
  // Old 3 mulai di line 49 dengan pasangan New 5 (line 50) dan New 6 (line 51)
  // Old 4 mulai di line 73 dengan pasangan New 7 (line 74) dan New 8 (line 75)
  // Old 5 mulai di line 97 dengan pasangan New 9 (line 98) dan New 10 (line 99)
  // Pola: Old n → 1 + ((n-1) × 24), diubah jadi 1 + ((n-1) × 25) agar selalu ganjil
  sessionStartingLines: {
    'old-1': 1,
    'new-1': 2,
    'new-2': 2,
    'old-2': 25,
    'new-3': 26,
    'new-4': 26,
    'old-3': 49,
    'new-5': 50,
    'new-6': 50,
    'old-4': 73,
    'new-7': 74,
    'new-8': 74,
    'old-5': 97,
    'new-9': 98,
    'new-10': 98,
  },
  scriptText: `Eh, kamu akhir-akhir ini sibuk nggak?
Lumayan, tapi masih bisa santai.
Kerjaannya lagi banyak?
Iya, tapi pelan-pelan dikejar.
Yang penting nggak stres ya.
Betul, jaga ritme.
Kamu biasanya ngilangin capek gimana?
Denger musik atau jalan sebentar.
Musik genre apa?
Pop santai atau acoustic.
Aku juga suka yang begitu.
Bikin pikiran adem.
Kadang playlist bisa ngaruh banget.
Iya, mood langsung naik.
Kalau pagi kamu lebih suka hening atau musik?
Lebih ke hening dulu.
Biar fokus ya.
Iya, baru nyala pelan.
Ngomong-ngomong sarapan tadi apa?
Roti sama kopi.
Simple tapi cukup.
Yang penting ngisi energi.
Kamu?
Nasi dan telur.
Klasik tapi aman.
Hehe betul.
Siang nanti rencana makan apa?
Belum tau, lihat nanti.
Kadang spontan lebih enak.
Setuju sih.
Eh, kamu lebih suka kerja pagi atau malam?
Pagi.
Aku justru malam.
Menarik juga bedanya.
Yang penting produktif.
Benar.
Kalau weekend biasanya ngapain?
Istirahat dan beberes.
Aku juga gitu.
Kadang cuma di rumah.
Itu juga recharge.
Setuju.
Eh, kamu suka nonton film atau series?
Lebih sering series.
Kenapa?
Lebih nyantol ceritanya.
Aku juga ngerasa gitu.
Bisa lebih kenal karakter.
Genre favorit apa?
Drama ringan.
Kalau aku komedi.
Biar nggak berat.
Iya, buat hiburan.
Kadang ketawa kecil udah cukup.
Bener.
Kamu nonton sendirian atau bareng?
Biasanya sendirian.
Aku kadang bareng temen.
Seru juga ya.
Iya, bisa diskusi.
Ngomong-ngomong, kamu suka kopi atau teh?
Kopi.
Hitam atau susu?
Kadang hitam, kadang susu.
Fleksibel ya.
Iya tergantung mood.
Kalau aku teh.
Teh hangat enak sih.
Apalagi sore hari.
Setuju.
Eh, kamu tipe orang yang teratur atau santai?
Lebih ke teratur.
Aku agak santai.
Saling melengkapi sih.
Hehe bisa jadi.
Kalau rencana biasanya detail?
Lumayan.
Aku lebih garis besar.
Yang penting jalan.
Betul.
Kamu suka nulis catatan?
Kadang.
Pakai apa?
Notes di HP.
Praktis ya.
Iya.
Aku juga begitu.
Lebih gampang.
Eh, kamu sering olahraga nggak?
Nggak rutin.
Aku juga sama.
Tapi pengin mulai.
Pelan-pelan aja.
Iya, jangan dipaksa.
Jalan pagi oke sih.
Setuju.
Kalau hujan biasanya ngapain?
Di rumah aja.
Nonton atau baca.
Aku juga.
Hujan bikin mager.
Tapi adem.
Iya enak.
Eh, kamu lebih suka chatting atau telepon?
Chatting.
Aku juga.
Lebih fleksibel.
Nggak harus langsung respon.
Betul.
Kadang bisa mikir dulu.
Iya.
Ngomong-ngomong, kamu suka masak?
Kadang.
Masak apa biasanya?
Yang simpel.
Sama.
Asal bisa dimakan.
Hehe iya.
Masak sendiri ada kepuasan.
Betul.
Kalau gagal gimana?
Anggap belajar.
Setuju.
Eh, kamu suka foto-foto?
Lumayan.
Objek apa?
Pemandangan.
Aku juga suka langit.
Langit sore bagus.
Iya apalagi senja.
Bikin tenang.
Setuju banget.
Kamu sering edit foto?
Sedikit.
Biar lebih rapi ya.
Iya.
Kalau traveling kamu tipe ribet nggak?
Nggak terlalu.
Aku juga.
Yang penting nyaman.
Betul.
Eh, kamu suka denger cerita orang?
Suka.
Kadang dapet perspektif baru.
Iya.
Bikin lebih empati.
Setuju.
Kamu orangnya gampang adaptasi?
Lumayan.
Aku juga berusaha.
Namanya juga proses.
Betul.
Yang penting mau belajar.
Iya.
Eh, kamu suka suasana ramai atau sepi?
Tergantung.
Aku lebih sering sepi.
Sepi bikin fokus.
Iya.
Tapi ramai kadang seru.
Balance ya.
Setuju.
Kalau lagi capek mental biasanya ngapain?
Diam sebentar.
Aku juga.
Kadang butuh jeda.
Betul.
Nggak apa-apa kok.
Iya.
Eh, kamu percaya istirahat itu produktif?
Percaya.
Aku juga.
Kalau dipaksa malah nggak jalan.
Setuju.
Semua ada waktunya.
Iya.
Ngobrol kayak gini juga enak ya.
Santai.
Nggak berat.
Iya ngalir aja.
Semoga hari kamu lancar ya.
Kamu juga.
Thanks udah ngobrol.
Sama-sama.
Nanti lanjut lagi.
Siap.
Aku mau booking terus ngajak temen.
Operatornya katanya eco-friendly.
Iya, mereka peduli lingkungan.
Aku mau cek paket-paketnya.
Banyak opsi sesuai budget.
Sekalian nanya diskon.
Siapa tau dapet promo.
Aku bakal share pengalaman di medsos.
Biar makin banyak yang tau.
Pasti aku rekomendasiin ke temen dan keluarga.
Review positif pasti ngaruh.
Aku catet bawa camilan.
Biar nggak drop.
Botol minum juga wajib.
Hydration itu penting di gurun.
Thanks udah sharing pengalaman.
Sama-sama! Jangan sampe nggak coba.
Aku bakal foto-foto buat tim.
Sekalian nanya rekomendasi trip selanjutnya.
Enjoy desert safari-nya, pasti nagih!`,
  automationDefaults: {
    timezone: 'Asia/Jakarta',
    windowStart: '08:00',
    windowEnd: '22:00',
    day1MessagesPerNew: 24,
    day2MessagesPerNew: 36,
    day3MessagesPerNew: 42,
  },
  scripts: {
    'old-1': `Eh, kamu akhir-akhir ini sibuk nggak?
Lumayan, tapi masih bisa santai.
Kerjaannya lagi banyak?
Iya, tapi pelan-pelan dikejar.
Yang penting nggak stres ya.
Betul, jaga ritme.
Kamu biasanya ngilangin capek gimana?
Denger musik atau jalan sebentar.
Musik genre apa?
Pop santai atau acoustic.
Aku juga suka yang begitu.
Bikin pikiran adem.
Kadang playlist bisa ngaruh banget.
Iya, mood langsung naik.
Kalau pagi kamu lebih suka hening atau musik?
Lebih ke hening dulu.
Biar fokus ya.
Iya, baru nyala pelan.
Ngomong-ngomong sarapan tadi apa?
Roti sama kopi.
Simple tapi cukup.
Yang penting ngisi energi.
Kamu?
Nasi dan telur.
Klasik tapi aman.
Hehe betul.
Siang nanti rencana makan apa?
Belum tau, lihat nanti.
Kadang spontan lebih enak.
Setuju sih.
Eh, kamu lebih suka kerja pagi atau malam?
Pagi.
Aku justru malam.
Menarik juga bedanya.
Yang penting produktif.
Benar.
Kalau weekend biasanya ngapain?
Istirahat dan beberes.
Aku juga gitu.
Kadang cuma di rumah.
Itu juga recharge.
Setuju.
Eh, kamu suka nonton film atau series?
Lebih sering series.
Kenapa?
Lebih nyantol ceritanya.
Aku juga ngerasa gitu.
Bisa lebih kenal karakter.
Genre favorit apa?
Drama ringan.
Kalau aku komedi.
Biar nggak berat.
Iya, buat hiburan.
Kadang ketawa kecil udah cukup.
Bener.
Kamu nonton sendirian atau bareng?
Biasanya sendirian.
Aku kadang bareng temen.
Seru juga ya.
Iya, bisa diskusi.
Ngomong-ngomong, kamu suka kopi atau teh?
Kopi.
Hitam atau susu?
Kadang hitam, kadang susu.
Fleksibel ya.
Iya tergantung mood.
Kalau aku teh.
Teh hangat enak sih.
Apalagi sore hari.
Setuju.
Eh, kamu tipe orang yang teratur atau santai?
Lebih ke teratur.
Aku agak santai.
Saling melengkapi sih.
Hehe bisa jadi.
Kalau rencana biasanya detail?
Lumayan.
Aku lebih garis besar.
Yang penting jalan.
Betul.
Kamu suka nulis catatan?
Kadang.
Pakai apa?
Notes di HP.
Praktis ya.
Iya.
Aku juga begitu.
Lebih gampang.
Eh, kamu sering olahraga nggak?
Nggak rutin.
Aku juga sama.
Tapi pengin mulai.
Pelan-pelan aja.
Iya, jangan dipaksa.
jalan pagi oke sih.
Setuju.
Kalau hujan biasanya ngapain?
Di rumah aja.
Nonton atau baca.
Aku juga.
Hujan bikin mager.
Tapi adem.
Iya enak.
Eh, kamu lebih suka chatting atau telepon?
Chatting.
Aku juga.
Lebih fleksibel.
Nggak harus langsung respon.
Betul.
Kadang bisa mikir dulu.
Iya.
Ngomong-ngomong, kamu suka masak?
Kadang.
Masak apa biasanya?
Yang simpel.
Sama.
Asal bisa dimakan.
Hehe iya.
Masak sendiri ada kepuasan.
Betul.
Kalau gagal gimana?
Anggap belajar.
Setuju.
Eh, kamu suka foto-foto?
Lumayan.
Objek apa?
Pemandangan.
Aku juga suka langit.
Langit sore bagus.
Iya apalagi senja.
Bikin tenang.
Setuju banget.
Kamu sering edit foto?
Sedikit.
Biar lebih rapi ya.
Iya.
Kalau traveling kamu tipe ribet nggak?
Nggak terlalu.
Aku juga.
Yang penting nyaman.
Betul.
Eh, kamu suka denger cerita orang?
Suka.
Kadang dapet perspektif baru.
Iya.
Bikin lebih empati.
Setuju.
Kamu orangnya gampang adaptasi?
Lumayan.
Aku juga berusaha.
Namanya juga proses.
Betul.
Yang penting mau belajar.
Iya.
Eh, kamu suka suasana ramai atau sepi?
Tergantung.
Aku lebih sering sepi.
Sepi bikin fokus.
Iya.
Tapi ramai kadang seru.
Balance ya.
Setuju.
Kalau lagi capek mental biasanya ngapain?
Diam sebentar.
Aku juga.
Kadang butuh jeda.
Betul.
Nggak apa-apa kok.
Iya.
Eh, kamu percaya istirahat itu produktif?
Percaya.
Aku juga.
Kalau dipaksa malah nggak jalan.
Setuju.
Semua ada waktunya.
Iya.
Ngobrol kayak gini juga enak ya.
Santai.
Nggak berat.
Iya ngalir aja.
Semoga hari kamu lancar ya.
Kamu juga.
Thanks udah ngobrol.
Sama-sama.
Nanti lanjut lagi.
Siap.`,
    'old-2': `Eh, liburan akhir tahun ada rencana ke mana?
Belum tahu nih, masih nabung.
Sama, pengennya sih ke pantai.
Pantai mana yang asik?
Bali atau Lombok kayaknya seru.
Lombok lebih tenang sih.
Iya bener, Bali udah terlalu rame.
Kalau ke gunung gimana?
Asik juga buat healing.
Tapi butuh fisik kuat.
Haha iya bener.
Kamu suka camping?
Suka banget, suasananya beda.
Apalagi pas malem liat bintang.
Wah itu momen terbaik.
Kapan-kapan camping bareng yuk.
Boleh banget, atur aja.
Nanti ajak temen-temen juga.
Sip, makin rame makin seru.
Eh, kamu lebih suka travel sendirian atau rame-rame?
Rame-rame sih biasanya.
Biar ada temen ngobrol ya?
Iya, sama bisa patungan biaya haha.
Bener juga tuh.
Tapi solo traveling juga menantang lho.
Belum berani coba sih aku.
Cobain deh sekali-kali.
Nanti deh kalau udah siap mental.
Kamu pernah ke luar negeri?
Belum, masih muter-muter indo aja.
Indonesia juga luas banget kok.
Iya, banyak yang belum diexplore.
Destinasi impian kamu mana?
Raja Ampat sih pengen banget.
Wah itu surga banget katanya.
Iya, nabung dulu yang banyak.
Semoga kesampaian ya.
Amin. Kamu?
Pengen ke Jepang sih.
Wah seru, kulineran ya?
Iya, sama foto-foto.
Musim semi pas sakura bagus tuh.
Iya itu targetnya.
Eh, kalau jalan-jalan suka bawa banyak barang gak?
Standard aja sih, backpacker style.
Enak tuh ringkes.
Iya, biar gak ribet di jalan.
Setuju.`,
    'old-3': `Laptop kamu merek apa sekarang?
Masih pake yang lama, Asus.
Awet juga ya.
Lumayan sih buat kerjaan ringan.
Sekarang teknologi cepet banget ganti.
Iya, tiap bulan ada aja yang baru.
Sampe bingung mau upgrade.
Mending upgrade sesuai kebutuhan aja.
Setuju, jangan laper mata.
Kerjaan di kantor aman?
Aman, cuma lagi banyak deadline.
Biasalah akhir bulan.
Yang penting kesehatan dijaga.
Bener, jangan sampe drop.
Sering lembur?
Jarang sih, untungnya.
Bagus deh, work life balance.
Eh, kamu pake HP apa?
Android sih, lebih fleksibel.
Aku juga tim Android.
Banyak pilihan aplikasinya.
Iya, kustomisasinya juga enak.
Tapi iPhone kameranya bagus sih.
Iya itu poin plusnya.
Tergantung prioritas aja.
Bener.
Kamu suka main game di HP?
Kadang kalau lagi nunggu.
Game apa?
Yang santai aja puzzle gitu.
Sama, buat buang waktu.
Kalau game berat kasihan baterainya.
Iya cepet panas.
Eh, di kantor kamu pake tools apa buat komunikasi?
Slack sama Zoom biasanya.
Standar ya sekarang.
Iya, semenjak WFH jadi wajib.
Tapi kadang capek meeting online terus.
Zoom fatigue itu nyata.
Haha iya bener.
Enakan ketemu langsung kadang.
Bisa ngopi bareng kawan kantor.
Iya, interaksinya beda.
Kamu lebih suka WFH atau WFO?
Hybrid sih paling ideal.
Setuju, ada waktu di rumah ada waktu di kantor.
Biar gak bosen.
Iya bener banget.`,
    'old-4': `Kamu suka masak sendiri atau beli?
Lebih sering beli sih, praktis.
Kadang masak kalau lagi mood.
Masakan andalan apa?
Nasi goreng paling gampang.
Klasik tapi enak.
Kalau kamu?
Aku suka bikin pasta.
Wah, kayak chef dong.
Belajar dari YouTube aja.
Sekarang resep gampang dicari.
Iya tinggal ikutin langkahnya.
Kapan-kapan masakin dong.
Siap, nanti pas kumpul.
Jangan lupa dessert-nya.
Tenang, ada puding spesial.
Eh, suka makanan pedas gak?
Suka banget!
Sama, rasanya kurang kalau gak pedas.
Tapi jangan keseringan, kasihan perut.
Haha iya bener, secukupnya aja.
Ada rekomendasi tempat makan enak?
Ada tuh soto ayam di ujung jalan.
Wah boleh dicoba.
Murah meriah porsinya banyak.
Favorit anak kos banget.
Iya bener.
Kamu suka nyoba makanan aneh-aneh gak?
Nggak terlalu sih, cari aman aja.
Aku kadang penasaran.
Pernah makan apa yang paling aneh?
Sate kelinci mungkin?
Rasanya gimana?
Mirip ayam sih katanya, tapi aku agak geli.
Loh katanya pernah?
Cuma icip dikit haha.
Oh kirain abis setusuk.
Nggak lah.
Minuman favorit kamu apa?
Jus alpukat.
Wah enak tuh, kental manis coklatnya banyakin.
Nah itu kuncinya.
Jadi pengen beli nih.
Yuk cari.`,
    'old-5': `Udah nonton film terbaru belum?
Belum sempet ke bioskop.
Katanya bagus banget ratingnya.
Genre action ya?
Iya, efek visualnya keren.
Nanti weekend deh coba nonton.
Ajak temen-temen biar seru.
Tiket sekarang mahal gak sih?
Lumayan, tapi worth it kok.
Selain nonton hobi apa?
Baca novel fiksi.
Seru tuh imajinasi jalan.
Iya, bisa lupa waktu.
Penulis favorit siapa?
Tere Liye lumayan suka.
Karya-karyanya emang bagus.
Punya koleksi bukunya?
Ada beberapa di rak.
Pinjem dong kapan-kapan.
Boleh, main aja ke rumah.
Siap.
Eh, kamu suka denger podcast gak?
Suka, pas lagi di jalan.
Topik apa biasanya?
Comedy atau interview inspiratif.
Enak ya buat nemenin macet.
Banget, jadi gak kerasa.
Ada rekomendasi channel?
Coba dengerin yang lokal aja, banyak yang lucu.
Oke nanti dicari.
Kalau musik suka streaming di mana?
Spotify dong.
Premium gak?
Iya, biar bebas iklan.
Penting itu, iklan kadang ganggu mood.
Bener banget pas lagi asik nyanyi eh iklan.
Haha iya.
Kamu suka karaoke?
Suka tapi malu-malu.
Ah santai aja, yang penting hepi.
Iya sih, lepaskan beban.
Kapan-kapan karaokean yuk.
Gasss!`,
  },
};
