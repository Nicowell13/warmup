export type Wa12Preset = {
  oldSessionNames: string[];
  newSessionNames: string[];
  oldScriptLineParity: 'odd' | 'even' | 'all';
  newScriptLineParity: 'odd' | 'even' | 'all';
  scriptText: string;
  automationDefaults: {
    timezone: string;
    windowStart: string;
    windowEnd: string;
    day1MessagesPerNew: number;
    day2MessagesPerNew: number;
    day3MessagesPerNew: number;
  };
};

export const WA12_PRESET: Wa12Preset = {
  oldSessionNames: ['old-1', 'old-2', 'old-3'],
  newSessionNames: ['new-1', 'new-2', 'new-3', 'new-4', 'new-5', 'new-6', 'new-7', 'new-8', 'new-9'],
  // Untuk percakapan 2 arah:
  // - OLD kirim baris 1,3,5,...
  // - NEW balas baris 2,4,6,...
  oldScriptLineParity: 'odd',
  newScriptLineParity: 'even',
  scriptText: `Hei, kamu udah nonton serial baru yang lagi rame dibahas orang-orang?
Iya, aku malah ngebut nontonnya pas jam istirahat. Nagih banget!
Aku rencana mulai nonton weekend ini. Ceritanya soal apa sih?
Ceritanya tegang, karakternya kuat, dan plot twist-nya nggak ketebak.
Wah, kedengerannya gokil! Jadi makin pengin nonton sekarang.
Percaya deh, nggak bakal nyesel. Visualnya juga cakep parah.
Katanya aktingnya juga keren banget ya?
Banget. Cast-nya totalitas, karakternya kerasa hidup.
Aku penasaran banget gimana ceritanya bakal lanjut.
Serius, ini tipe serial yang bikin susah berhenti nonton.
Enak juga ya sekarang ada tontonan baru buat dibahas pas makan siang.
Iya, asik punya selera tontonan yang sama.
Menurut kamu ada makna atau pesan dalemnya nggak?
Ada sih, bikin mikir tapi tetap fun.
Fix, aku nggak sabar mulai nonton.
Nanti kamu bakal bilang “untung nonton”. Enjoy binge-watching!
Siap. Thanks rekomendasinya ya.
Santai! Nanti kita bahas abis kamu tamat.
Gas, pasti rame obrolannya.

Eh, kamu udah lihat mobil ramah lingkungan yang baru itu belum?
Udah, gila sih, teknologi hijau sekarang makin canggih.
Desainnya juga keliatan modern dan clean.
Setuju, enak dilihat.
Dalemnya keliatan lega dan nyaman.
Cocok banget buat road trip.
Aku suka fitur keamanannya, lengkap banget.
Nyetir jadi lebih tenang.
Irit bensinnya juga katanya gokil.
Ramah lingkungan plus hemat duit.
Aku kepikiran buat ganti mobil lama ke ini.
Layak banget sih buat dicek.
Apalagi mereknya terkenal awet.
Itu poin plus besar.
Katanya nyetirnya halus dan nyaman.
Penting sih biar perjalanan nggak capek.
Fitur teknologinya juga keren.
Nyetir jadi praktis dan serba terkoneksi.
Aku pengin cepet-cepet test drive.
Nanti kabarin ya hasilnya.
Penasaran sama pendapatmu.
Pasti aku ceritain.
Kayaknya ini mobil pas buat zaman sekarang.
Fix setuju! Nggak sabar pengin pindah.
Semoga lancar belinya.
Thanks! Nanti aku update.
Siap, ditunggu.
Thanks juga buat saran-sarannya.
Anytime! Selamat cari mobil baru.

Ngomong-ngomong, kamu udah lihat iPhone terbaru belum?
Udah, keliatannya cakep banget.
Desainnya makin tipis dan modern.
Aku suka pilihan warnanya.
Upgrade kameranya mantep.
Hasil fotonya keliatan bening.
Baterainya juga katanya lebih awet.
Pas banget buat aktivitas seharian.
OS barunya juga kerasa smooth.
Performanya jelas naik.
Fitur health sama fitness-nya lumayan kepake.
Bikin makin niat hidup sehat.
Aku lagi mikir buat upgrade dari HP lama.
Worth it sih liat fiturnya.
Brand-nya juga udah terkenal kualitasnya.
Jadi makin yakin.
Katanya FaceTime sekarang makin jernih.
Enak buat VC sama keluarga dan temen.
Udah support 5G juga.
Internet ngebut selalu enak.
Aku penasaran aksesoris barunya.
Katanya casing sama wireless charger-nya keren.
Aku rencana ke store weekend ini.
Nanti share ya kesannya.
Siap, aku excited nyobain fitur barunya.
Selalu seru kalau punya gadget baru.
Aku suka mereka konsisten inovasi.
Jarang gagal sih.
Fitur privasinya juga makin aman.
Penting banget jaga data pribadi.
Kayaknya bakal pre-order deh.
Enjoy HP barumu nanti.
Thanks ya!
Sama-sama.
Kayaknya investasi yang oke.
Aku nggak sabar nyobain semua kemampuannya.
Same!
Nanti kita sharing pendapat.
Gas, pasti seru.
Have fun eksplor HP barumu.

Eh, kamu udah cobain restoran Michelin Star yang baru itu?
Udah, aku ke sana minggu lalu.
Gimana overall pengalamannya?
Gokil, dari awal sampe akhir.
Katanya ambience-nya keren?
Asli, interiornya cakep banget.
Pelayanannya gimana?
Ramah, sigap, profesional.
Chef-nya katanya legend.
Bener, makanannya enak parah.
Menu apa aja yang kamu coba?
Appetizer khas sama main course-nya.
Penyajiannya gimana?
Cantik, niat, estetik.
Aku kepikiran dateng buat event spesial.
Cocok banget sih.
Dessert-nya juga katanya juara.
Aku juga mikir ngajak tim makan di sana.
Pas buat bonding.
Aku pengin cepet reservasi.
Nanti ceritain ya hasilnya.
Siap, aku tunggu momennya.
Restonya emang reputasinya bagus.
Chef-nya juga aktif kegiatan sosial.
Keren sih, peduli sekitar.
Aku penasaran private dining-nya.
Kayaknya bakal jadi pengalaman kuliner seru.
Tenang, aku bakal nikmatin tiap suapan.
Fix, nggak bakal mengecewakan.
Nanti aku share ceritanya.
Gas, nggak sabar dengernya.
Thanks udah sharing dan nyemangatin.
Sama-sama! Wajib coba.
Aku bakal foto-foto buat tim.
Sekalian nanya rekomendasi menu lain.
Siapa tau ada menu rahasia.
Siap, dicatet.
Thanks buat obrolannya.
Enjoy petualangan kulinermu!

Eh, kamu pernah ikut desert safari belum?
Pernah, parah seru banget.
Full adrenalin.
Katanya dune bashing paling epic?
Bener, nggak terlupakan.
Camp gurunnya gimana?
Cakep, cozy, vibes-nya dapet.
BBQ-nya enak ya?
Enak banget, pilihannya banyak.
Aku kepikiran ikut trip berikutnya.
Katanya juga support bisnis lokal.
Itu keren sih.
Aku pengin banget lihat sunset di gurun.
Asli, view-nya cakep parah.
Guide-nya oke?
Iya, informatif dan ramah.
Aku juga pengin naik unta.
Seru dan unik.
Fix bakal bawa kamera.
Spot fotonya banyak.
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
};
