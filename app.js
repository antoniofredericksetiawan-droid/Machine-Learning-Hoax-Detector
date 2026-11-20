// Halaman ini jalan dari file:// maupun http://. Browser melarang module script dan fetch() dari file://,
// jadi semua dipasang sebagai script biasa dan model + runtime ONNX dibaca dari data yang tertanam.
(function () {
'use strict';

const ort = window.ort;
const createDetector = window.createDetector;

const EXAMPLES = window.__CONTOH || []; // lihat examples.js: 10 asli + 10 hoaks, lengkap dengan kunci jawaban

const $ = (id) => document.getElementById(id);
const el = {
  status: $('status'), form: $('form'), text: $('text'), count: $('count'), go: $('go'), clear: $('clear'),
  examplesReal: $('examples-real'), examplesHoax: $('examples-hoax'), key: $('key'), result: $('result'), stamp: $('stamp'), stampWord: $('stamp-word'),
  headline: $('headline'), detail: $('detail'), meter: $('meter'), pin: $('pin'), marked: $('marked'),
  hoaxList: $('hoax-list'), realList: $('real-list'), caveats: $('caveats'), loadError: $('load-error'),
  about: $('about'),
};

const pct = (p) => `${Math.round(p * 100)}%`;
const words = (n) => `${n} kata`;
let detector = null;

function setStatus(kind, message) {
  el.status.dataset.state = kind;
  el.status.textContent = message;
}

function wordCount(text) {
  return (text.trim().match(/\S+/g) || []).length;
}

function updateForm() {
  el.count.textContent = words(wordCount(el.text.value));
  el.go.disabled = !detector || !el.text.value.trim();
}

let lastExample = null; // contoh yang terakhir diklik, untuk menampilkan kunci jawaban

function renderExamples() {
  for (const ex of EXAMPLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = ex.label;
    b.addEventListener('click', () => {
      el.text.value = ex.text;
      lastExample = ex;
      updateForm();
      run();
    });
    (ex.kind === 'hoax' ? el.examplesHoax : el.examplesReal).append(b);
  }
}

function renderWordList(ul, items, emptyText) {
  ul.replaceChildren();
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'none';
    li.textContent = emptyText;
    ul.append(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    const w = document.createElement('span');
    w.className = 'word';
    w.textContent = item.word;
    li.append(w);
    if (item.count > 1) {
      const c = document.createElement('span');
      c.className = 'times';
      c.textContent = `muncul ${item.count} kali`;
      li.append(c);
    }
    ul.append(li);
  }
}

function renderMarked(segments) {
  el.marked.replaceChildren();
  for (const seg of segments) {
    if (!seg.level) {
      el.marked.append(document.createTextNode(seg.text));
      continue;
    }
    const m = document.createElement('mark');
    m.className = `w ${seg.weight > 0 ? 'to-hoax' : 'to-real'} lv${seg.level}`;
    m.title = seg.weight > 0 ? 'Condong ke hoaks' : 'Condong ke asli';
    m.textContent = seg.text;
    el.marked.append(m);
  }
}

function caveatsFor(r) {
  const list = [];
  if (r.nothingKnown) {
    list.push('Model tidak mengenali satu kata pun di tulisan ini. Hasilnya tidak bisa dipercaya.');
  } else if (r.mostlyUnknown) {
    list.push(`Model baru mengenali ${r.known} dari ${r.usable} kata penting. Model hanya belajar dari berita politik, jadi topik lain mudah salah.`);
  }
  if (r.tooShort) {
    list.push(`Tulisan ini hanya ${words(r.wordCount)}. Model belajar dari berita yang panjangnya minimal ${r.MIN} kata, jadi tebakan untuk judul atau pesan pendek kurang bisa dipercaya.`);
  }
  return list;
}

const VERDICTS = {
  hoax: { word: 'HOAKS', headline: (r) => `Kemungkinan hoaks ${pct(r.pHoax)}`, tone: 'hoax',
    detail: 'Pola kata di tulisan ini mirip hoaks yang dipelajari model.' },
  real: { word: 'ASLI', headline: (r) => `Kemungkinan berita asli ${pct(r.pReal)}`, tone: 'real',
    detail: 'Pola kata di tulisan ini mirip berita asli yang dipelajari model.' },
  unsure: { word: 'RAGU', tone: 'unsure',
    headline: (r) => (r.nothingKnown ? 'Model tidak bisa menilai' : 'Model ragu-ragu'),
    detail: (r) => (r.nothingKnown
      ? 'Tidak ada kata yang dikenal model, jadi tidak ada petunjuk untuk dinilai.'
      : 'Peluangnya hampir sama. Jangan jadikan ini dasar untuk percaya atau menyebarkan.') },
};

const text = (value, r) => (typeof value === 'function' ? value(r) : value);

const KIND_WORD = { real: 'ASLI', hoax: 'HOAKS' };

function renderKey(r) {
  const ex = lastExample && lastExample.text === el.text.value ? lastExample : null; // hanya bila teks belum diubah
  el.key.hidden = !ex;
  if (!ex) return;
  const truth = KIND_WORD[ex.kind];
  const ok = r.verdict === ex.kind;
  let msg = `Jawaban sebenarnya: ${truth}. `;
  if (ok) msg += 'Model menjawab benar.';
  else if (r.verdict === 'unsure') msg += 'Model ragu-ragu, jadi belum bisa dihitung benar.';
  else msg += ex.kind === 'real'
    ? 'Model keliru. Ingat, model hanya belajar dari berita politik, jadi berita dengan topik lain mudah dikira hoaks.'
    : 'Model keliru. Model bisa salah, jadi selalu cek ke sumber resmi.';
  el.key.textContent = msg;
  el.key.dataset.result = ok ? 'ok' : r.verdict === 'unsure' ? 'unsure' : 'wrong';
}

async function run() {
  if (!detector || !el.text.value.trim()) return;
  el.go.disabled = true;
  let r;
  try {
    r = await detector.analyze(el.text.value);
  } catch (err) {
    console.error(err);
    el.result.hidden = false;
    el.headline.textContent = 'Pemeriksaan gagal';
    el.detail.textContent = 'Muat ulang halaman, lalu coba lagi.';
    return;
  } finally {
    updateForm();
  }
  r.MIN = detector.MIN_WORDS_TRUSTED;
  const v = VERDICTS[r.verdict];

  el.result.hidden = false;
  el.stamp.dataset.tone = v.tone;
  el.stampWord.textContent = v.word;
  el.headline.textContent = text(v.headline, r);
  el.detail.textContent = text(v.detail, r);
  renderKey(r);
  el.meter.setAttribute('aria-label', `Peluang hoaks ${pct(r.pHoax)}, peluang asli ${pct(r.pReal)}`);
  el.pin.style.setProperty('--at', `${(r.pHoax * 100).toFixed(1)}%`);
  el.meter.hidden = r.nothingKnown; // tanpa kata dikenal, angkanya bukan bukti
  renderMarked(r.segments);
  const highlighted = r.segments.some((s) => s.level);
  $('marked-empty').hidden = highlighted;
  renderWordList(el.hoaxList, r.top.hoax, 'Tidak ada kata yang condong ke hoaks.');
  renderWordList(el.realList, r.top.real, 'Tidak ada kata yang condong ke asli.');

  const caveats = caveatsFor(r);
  el.caveats.replaceChildren();
  for (const c of caveats) {
    const li = document.createElement('li');
    li.textContent = c;
    el.caveats.append(li);
  }
  el.caveats.hidden = caveats.length === 0;

  // Hentak cap sekali per pemeriksaan (animasi mati otomatis bila pengguna memilih reduced motion).
  el.stamp.classList.remove('hit');
  void el.stamp.offsetWidth;
  el.stamp.classList.add('hit');
  el.result.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
}

async function bytesFromBase64(b64) {
  // fetch() ke data: URL boleh walau halaman dibuka dari file://
  const res = await fetch(`data:application/octet-stream;base64,${b64}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function setupRuntime() {
  const rt = window.__ORT_RUNTIME;
  const glue = URL.createObjectURL(new Blob([rt.glue], { type: 'text/javascript' }));
  const wasm = URL.createObjectURL(new Blob([await bytesFromBase64(rt.wasmB64)], { type: 'application/wasm' }));
  ort.env.wasm.wasmPaths = { mjs: glue, wasm };
  ort.env.wasm.numThreads = 1; // satu thread: tidak butuh SharedArrayBuffer atau header khusus
}

async function load() {
  try {
    if (!ort || !window.__ORT_RUNTIME || !window.__DETEKTOR) throw new Error('berkas data belum termuat');
    await setupRuntime();
    const { vectorizer: vec, modelB64 } = window.__DETEKTOR;
    const session = await ort.InferenceSession.create(await bytesFromBase64(modelB64), { executionProviders: ['wasm'] });
    detector = createDetector({ vec, session, ort });
    window.__detector = detector; // untuk uji otomatis
    const t = vec.trainedWith;
    el.about.textContent = `${t.model} + ${t.vectorizer === 'Count' ? 'CountVectorizer' : t.vectorizer}, ${vec.size.toLocaleString('id-ID')} kata dikenal, akurasi ${(t.accuracy * 100).toFixed(1).replace('.', ',')}% pada ${t.testSize.toLocaleString('id-ID')} berita uji.`;
    setStatus('ready', 'Model siap');
  } catch (err) {
    console.error(err);
    setStatus('error', 'Model gagal dimuat');
    el.loadError.hidden = false;
  }
  updateForm();
}

el.form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
el.text.addEventListener('input', () => { if (lastExample && lastExample.text !== el.text.value) el.key.hidden = true; updateForm(); });
el.text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } });
el.clear.addEventListener('click', () => {
  el.text.value = '';
  el.result.hidden = true;
  updateForm();
  el.text.focus();
});

renderExamples();
updateForm();
setStatus('loading', 'Memuat model…');
load();
})();
