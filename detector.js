// Detektor Hoaks: praproses + vektorisasi + penjelasan, semuanya di browser.
// Meniru persis pipeline lesson book-56:
//   clean_text  -> buang selain huruf, huruf kecil, buang stop words Indonesia
//   CountVectorizer -> hitung kemunculan tiap kata yang ada di vocabulary
// Lalu model.onnx (Logistic Regression) menghitung probabilitas ASLI / HOAKS.

(function () {
'use strict';

const LETTER_RUN = /[A-Za-z]+/g; // setara re.sub('[^a-zA-Z]', ' ', text) lalu split
const MIN_WORDS_TRUSTED = 15;    // hoaks <15 kata dibuang dari data latih
const UNSURE_BELOW = 0.65;       // di bawah ini vonis dianggap ragu-ragu

function percentile(sortedAsc, p) {
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.floor(sortedAsc.length * p))];
}

function createDetector({ vec, session, ort }) {
  if (vec.type !== 'count' || !vec.coef) throw new Error('Vectorizer harus tipe count dengan bobot kata (coef).');
  const stop = new Set(vec.stopWords);
  const terms = new Map(Object.entries(vec.terms));
  const termByIndex = new Array(vec.size);
  for (const [term, index] of terms) termByIndex[index] = term;

  // Ambang sorotan: hanya kata dengan bobot besar yang disorot, supaya teks tidak ramai.
  const absSorted = vec.coef.map(Math.abs).sort((a, b) => a - b);
  const mid = percentile(absSorted, 0.9);
  const strong = percentile(absSorted, 0.97);
  const level = (w) => (Math.abs(w) >= strong ? 2 : Math.abs(w) >= mid ? 1 : 0);

  /** Pecah teks asli menjadi potongan: kata yang dikenal model (dengan bobotnya) dan sisanya. */
  function segments(text) {
    const out = [];
    let last = 0;
    for (const m of text.matchAll(LETTER_RUN)) {
      const key = m[0].toLowerCase();
      const index = terms.get(key);
      if (index === undefined) continue;
      if (m.index > last) out.push({ text: text.slice(last, m.index) });
      const weight = vec.coef[index];
      out.push({ text: m[0], key, weight, level: level(weight) });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
  }

  function vectorize(text) {
    const features = new Float32Array(vec.size);
    let usable = 0; // kata (bukan stop word, >= 2 huruf) yang masuk hitungan model
    let known = 0;  // dari itu, yang ada di vocabulary
    for (const m of text.matchAll(LETTER_RUN)) {
      const key = m[0].toLowerCase();
      if (key.length < 2 || stop.has(key)) continue;
      usable += 1;
      const index = terms.get(key);
      if (index === undefined) continue;
      features[index] += 1;
      known += 1;
    }
    return { features, usable, known };
  }

  /** Kata yang paling mendorong vonis ke arah HOAKS atau ASLI (jumlah kemunculan x bobot). */
  function topWords(features, limit = 5) {
    const hoax = [];
    const real = [];
    for (let i = 0; i < features.length; i += 1) {
      if (!features[i]) continue;
      const score = features[i] * vec.coef[i];
      (score > 0 ? hoax : real).push({ word: termByIndex[i], count: features[i], score });
    }
    hoax.sort((a, b) => b.score - a.score);
    real.sort((a, b) => a.score - b.score);
    return { hoax: hoax.slice(0, limit), real: real.slice(0, limit) };
  }

  async function analyze(text) {
    const { features, usable, known } = vectorize(text);
    const input = new ort.Tensor('float32', features, [1, vec.size]);
    const out = await session.run({ [session.inputNames[0]]: input });
    const probs = out[session.outputNames.find((n) => /prob/i.test(n))].data;
    const pHoax = Number(probs[1]);
    const pReal = Number(probs[0]);
    const wordCount = (text.trim().match(/\S+/g) || []).length;
    const confidence = Math.max(pHoax, pReal);
    // Tanpa satu kata pun yang dikenal, angka hanya berasal dari intersep model, bukan dari bukti.
    const verdict = known === 0 || confidence < UNSURE_BELOW ? 'unsure' : pHoax > pReal ? 'hoax' : 'real';
    return {
      verdict, pHoax, pReal, confidence, wordCount, usable, known,
      tooShort: wordCount < MIN_WORDS_TRUSTED,
      mostlyUnknown: usable > 0 && known / usable < 0.5,
      nothingKnown: known === 0,
      segments: segments(text),
      top: topWords(features),
      // jalur kedua untuk uji silang: logit dari bobot kata harus sama dengan keluaran ONNX
      logit: features.reduce((s, c, i) => (c ? s + c * vec.coef[i] : s), vec.intercept),
    };
  }

  return { analyze, MIN_WORDS_TRUSTED, UNSURE_BELOW, vocabSize: vec.size, info: vec.trainedWith };
}

window.createDetector = createDetector;
})();
