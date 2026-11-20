# Detektor Hoaks

Tempel berita atau pesan berantai, lalu lihat apakah model machine learning menganggapnya hoaks.
Model dari lesson book-56 (Logistic Regression + CountVectorizer, akurasi 96,3%) berjalan di browser lewat ONNX.
Tulisanmu tidak dikirim ke mana pun.

## Jalankan

Klik dua kali `index.html`. Tidak perlu server, Python, atau internet untuk modelnya
(internet hanya dipakai untuk font Google; tanpa itu tampilan memakai font sistem).

Diuji di Chromium (Chrome dan Edge), baik dibuka dari `file://` maupun dari `http://`.
Halaman pertama kali butuh ±1 sampai 2 detik untuk menyiapkan model; status di pojok kanan atas berubah jadi "Model siap".

## Isi folder

| Path | Fungsi |
|---|---|
| `index.html`, `style.css` | halaman dan tampilan |
| `app.js` | tombol, contoh, dan tampilan hasil |
| `examples.js`, `contoh-berita.md` | 10 contoh berita asli + 10 hoaks buatan (fiktif) dengan kunci jawaban; yang kedua versi mudah dibaca |
| `detector.js` | praproses teks, penghitung kata, penjelasan per kata (meniru `clean_text` + `CountVectorizer` di lesson) |
| `model/model.onnx`, `model/vectorizer.json` | model ONNX (0,2 MB) dan kamus 20.084 kata beserta bobotnya (sumber asli) |
| `model/model-data.js` | dua file di atas ditanam sebagai data, dibuat oleh `tools/build-data.py`; ini yang dibaca halaman |
| `vendor/ort.wasm.min.js`, `vendor/ort-runtime.js` | `onnxruntime-web` 1.30.0 (WASM, satu thread), runtime-nya ditanam sebagai data (19 MB) |
| `tools/build-data.py` | membangun ulang `model/model-data.js` |

Kenapa ditanam sebagai data: browser melarang `fetch()` dan module script dari `file://`, jadi model dan runtime
tidak bisa dimuat sebagai file terpisah kalau halaman dibuka dengan klik dua kali.

## Mengganti model

Model dibuat oleh `tmp/detektor-hoaks/tools/train_export_onnx.py` di repo timedoor-hi. Skrip itu menulis
`model.onnx` dan `vectorizer.json` ke `tmp/detektor-hoaks/web/model/`.

1. Salin kedua file itu ke `model/` di folder ini.
2. Jalankan `python tools/build-data.py`.

Kalau `clean_text` atau vectorizer di lesson berubah, ubah juga `detector.js`.
