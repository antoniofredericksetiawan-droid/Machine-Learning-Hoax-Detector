"""Bangun model/model-data.js dari model/model.onnx dan model/vectorizer.json.

Halaman ini bisa dibuka langsung dari file (file://), dan browser melarang fetch() dari file://.
Jadi model ditanam sebagai data di script biasa. Jalankan ulang skrip ini setiap kali model.onnx
atau vectorizer.json diganti:

    python tools/build-data.py
"""
import base64, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
model = open(os.path.join(ROOT, 'model', 'model.onnx'), 'rb').read()
vec = json.load(open(os.path.join(ROOT, 'model', 'vectorizer.json'), encoding='utf-8'))

out = os.path.join(ROOT, 'model', 'model-data.js')
with open(out, 'w', encoding='utf-8', newline='\n') as f:
    f.write('// Dibuat oleh tools/build-data.py, jangan disunting manual.\n')
    f.write('window.__DETEKTOR = {\n')
    f.write('  modelB64: "' + base64.b64encode(model).decode('ascii') + '",\n')
    f.write('  vectorizer: ' + json.dumps(vec, ensure_ascii=False, separators=(',', ':')) + '\n')
    f.write('};\n')
print('ditulis', out, round(os.path.getsize(out) / 1e6, 2), 'MB')
