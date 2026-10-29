import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// 1. PNG ICON GENERATOR (192x192, 512x512, maskable 512x512, 180x180)
// ---------------------------------------------------------------------------

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(typeStr, dataBuf) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dataBuf.length, 0);
  const type = Buffer.from(typeStr, 'ascii');
  const crcInput = Buffer.concat([type, dataBuf]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, type, dataBuf, crc]);
}

function generateBrandPng(width, height, maskable = false) {
  const rawRows = [];
  const cx = width / 2;
  const cy = height / 2;
  const scale = maskable ? 0.76 : 0.92;
  const radius = (width / 2) * scale;

  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const idx = 1 + x * 4;
      // Rich indigo-to-slate gradient background
      const gx = x / width;
      const gy = y / height;
      let r = Math.round(49 * (1 - gx) + 79 * gx * (1 - gy) + 15 * gy);
      let g = Math.round(46 * (1 - gx) + 70 * gx * (1 - gy) + 23 * gy);
      let b = Math.round(129 * (1 - gx) + 229 * gx * (1 - gy) + 42 * gy);

      // Normalize coordinates to [-1, 1] inside the safe zone
      const nx = (x - cx) / radius;
      const ny = (y - cy) / radius;
      const dist = Math.sqrt(nx * nx + ny * ny);

      // Subtle glowing ring inside safe zone
      if (Math.abs(dist - 0.78) < 0.035) {
        r = Math.min(255, r + 65);
        g = Math.min(255, g + 80);
        b = Math.min(255, b + 110);
      }

      // Stylized "V" pulse icon in white & cyan
      const inLeftStroke =
        nx >= -0.45 &&
        nx <= -0.04 &&
        ny >= -0.38 &&
        ny <= 0.38 &&
        Math.abs(nx - (-0.42 + (ny + 0.38) * 0.48)) < 0.11;
      const inRightStroke =
        nx >= -0.08 &&
        nx <= 0.45 &&
        ny >= -0.38 &&
        ny <= 0.38 &&
        Math.abs(nx - (-0.05 + (0.38 - ny) * 0.58)) < 0.11;

      if (inLeftStroke || inRightStroke) {
        r = 255;
        g = 255;
        b = 255;
      }

      // Cyan pulse dot at top-right of V
      const dotDist = Math.sqrt((nx - 0.4) ** 2 + (ny - -0.36) ** 2);
      if (dotDist < 0.12) {
        r = 56;
        g = 189;
        b = 248;
      }

      row[idx] = r;
      row[idx + 1] = g;
      row[idx + 2] = b;
      row[idx + 3] = 255;
    }
    rawRows.push(row);
  }

  const rawData = Buffer.concat(rawRows);
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// 2. BINARY ANDROID MANIFEST (AXML) GENERATOR
// ---------------------------------------------------------------------------

function buildBinaryAndroidManifest() {
  // Resource IDs for Android attributes (must be sorted at the start of string pool)
  const attrStrings = [
    'versionCode',           // 0: 0x0101021b
    'versionName',           // 1: 0x0101021c
    'minSdkVersion',         // 2: 0x0101020c
    'targetSdkVersion',      // 3: 0x01010270
    'name',                  // 4: 0x01010003
    'label',                 // 5: 0x01010001
    'exported',              // 6: 0x01010010
    'configChanges',         // 7: 0x0101001f
    'usesCleartextTraffic',  // 8: 0x010104ec
  ];
  const resourceIds = [
    0x0101021b,
    0x0101021c,
    0x0101020c,
    0x01010270,
    0x01010003,
    0x01010001,
    0x01010010,
    0x0101001f,
    0x010104ec,
  ];

  const otherStrings = [
    'android',                                        // 9
    'http://schemas.android.com/apk/res/android',     // 10
    '',                                               // 11
    'manifest',                                       // 12
    'package',                                        // 13
    'io.velopulse.enterprise',                        // 14
    '1.0.0',                                          // 15
    'uses-sdk',                                       // 16
    'uses-permission',                                // 17
    'android.permission.INTERNET',                    // 18
    'android.permission.RECORD_AUDIO',                // 19
    'application',                                    // 20
    'VeloPulse Enterprise',                           // 21
    'activity',                                       // 22
    'io.velopulse.enterprise.MainActivity',           // 23
    'intent-filter',                                  // 24
    'action',                                         // 25
    'android.intent.action.MAIN',                     // 26
    'category',                                       // 27
    'android.intent.category.LAUNCHER',               // 28
  ];

  const allStrings = [...attrStrings, ...otherStrings];
  const idx = (s) => allStrings.indexOf(s);

  // Encode UTF-16LE String Pool Chunk (RES_STRING_POOL_TYPE = 0x0001)
  const encodedStrings = allStrings.map((str) => {
    const u16 = Buffer.from(str, 'utf16le');
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16LE(str.length, 0);
    const nullTerm = Buffer.alloc(2, 0);
    return Buffer.concat([lenBuf, u16, nullTerm]);
  });

  const offsets = [];
  let curOffset = 0;
  for (const b of encodedStrings) {
    offsets.push(curOffset);
    curOffset += b.length;
  }

  let stringsData = Buffer.concat(encodedStrings);
  const padLen = (4 - (stringsData.length % 4)) % 4;
  if (padLen > 0) {
    stringsData = Buffer.concat([stringsData, Buffer.alloc(padLen, 0)]);
  }

  const stringPoolHeaderSize = 28;
  const offsetsBuf = Buffer.alloc(allStrings.length * 4);
  offsets.forEach((off, i) => offsetsBuf.writeUInt32LE(off, i * 4));
  const stringsStart = stringPoolHeaderSize + offsetsBuf.length;
  const stringPoolChunkSize = stringsStart + stringsData.length;

  const spHeader = Buffer.alloc(stringPoolHeaderSize);
  spHeader.writeUInt16LE(0x0001, 0); // RES_STRING_POOL_TYPE
  spHeader.writeUInt16LE(stringPoolHeaderSize, 2);
  spHeader.writeUInt32LE(stringPoolChunkSize, 4);
  spHeader.writeUInt32LE(allStrings.length, 8);
  spHeader.writeUInt32LE(0, 12); // styleCount
  spHeader.writeUInt32LE(0, 16); // flags (UTF-16)
  spHeader.writeUInt32LE(stringsStart, 20);
  spHeader.writeUInt32LE(0, 24); // stylesStart

  const stringPoolChunk = Buffer.concat([spHeader, offsetsBuf, stringsData]);

  // Resource Map Chunk (RES_XML_RESOURCE_MAP_TYPE = 0x0180)
  const resMapChunkSize = 8 + resourceIds.length * 4;
  const resMapChunk = Buffer.alloc(resMapChunkSize);
  resMapChunk.writeUInt16LE(0x0180, 0);
  resMapChunk.writeUInt16LE(8, 2);
  resMapChunk.writeUInt32LE(resMapChunkSize, 4);
  resourceIds.forEach((id, i) => resMapChunk.writeUInt32LE(id, 8 + i * 4));

  const makeNamespaceChunk = (isStart, prefixIdx, uriIdx, line) => {
    const b = Buffer.alloc(24);
    b.writeUInt16LE(isStart ? 0x0100 : 0x0101, 0);
    b.writeUInt16LE(16, 2);
    b.writeUInt32LE(24, 4);
    b.writeUInt32LE(line, 8);
    b.writeUInt32LE(0xffffffff, 12);
    b.writeUInt32LE(prefixIdx, 16);
    b.writeUInt32LE(uriIdx, 20);
    return b;
  };

  const makeStartElement = (nsIdx, nameIdx, line, attrs) => {
    const chunkSize = 36 + attrs.length * 20;
    const b = Buffer.alloc(chunkSize);
    b.writeUInt16LE(0x0102, 0); // RES_XML_START_ELEMENT_TYPE
    b.writeUInt16LE(16, 2);
    b.writeUInt32LE(chunkSize, 4);
    b.writeUInt32LE(line, 8);
    b.writeUInt32LE(0xffffffff, 12);
    b.writeUInt32LE(nsIdx, 16);
    b.writeUInt32LE(nameIdx, 20);
    b.writeUInt16LE(20, 24); // attributeStart
    b.writeUInt16LE(20, 26); // attributeSize
    b.writeUInt16LE(attrs.length, 28); // attributeCount
    b.writeUInt16LE(0, 30);
    b.writeUInt16LE(0, 32);
    b.writeUInt16LE(0, 34);

    attrs.forEach((attr, i) => {
      const off = 36 + i * 20;
      b.writeUInt32LE(attr.ns, off);
      b.writeUInt32LE(attr.name, off + 4);
      b.writeUInt32LE(attr.rawValue, off + 8);
      b.writeUInt16LE(8, off + 12); // typedValue size
      b.writeUInt8(0, off + 14);
      b.writeUInt8(attr.type, off + 15);
      b.writeUInt32LE(attr.data >>> 0, off + 16);
    });
    return b;
  };

  const makeEndElement = (nsIdx, nameIdx, line) => {
    const b = Buffer.alloc(24);
    b.writeUInt16LE(0x0103, 0); // RES_XML_END_ELEMENT_TYPE
    b.writeUInt16LE(16, 2);
    b.writeUInt32LE(24, 4);
    b.writeUInt32LE(line, 8);
    b.writeUInt32LE(0xffffffff, 12);
    b.writeUInt32LE(nsIdx, 16);
    b.writeUInt32LE(nameIdx, 20);
    return b;
  };

  const NO_NS = 0xffffffff;
  const ANDROID_NS = idx('http://schemas.android.com/apk/res/android');
  const TYPE_STRING = 0x03;
  const TYPE_INT_DEC = 0x10;
  const TYPE_INT_HEX = 0x11;
  const TYPE_INT_BOOL = 0x12;

  const xmlNodes = [
    makeNamespaceChunk(true, idx('android'), ANDROID_NS, 2),
    // <manifest package="io.velopulse.enterprise" android:versionCode="1" android:versionName="1.0.0">
    makeStartElement(NO_NS, idx('manifest'), 2, [
      {
        ns: ANDROID_NS,
        name: idx('versionCode'),
        rawValue: NO_NS,
        type: TYPE_INT_DEC,
        data: 1,
      },
      {
        ns: ANDROID_NS,
        name: idx('versionName'),
        rawValue: idx('1.0.0'),
        type: TYPE_STRING,
        data: idx('1.0.0'),
      },
      {
        ns: NO_NS,
        name: idx('package'),
        rawValue: idx('io.velopulse.enterprise'),
        type: TYPE_STRING,
        data: idx('io.velopulse.enterprise'),
      },
    ]),
    // <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="29" />
    makeStartElement(NO_NS, idx('uses-sdk'), 3, [
      {
        ns: ANDROID_NS,
        name: idx('minSdkVersion'),
        rawValue: NO_NS,
        type: TYPE_INT_DEC,
        data: 21,
      },
      {
        ns: ANDROID_NS,
        name: idx('targetSdkVersion'),
        rawValue: NO_NS,
        type: TYPE_INT_DEC,
        data: 29,
      },
    ]),
    makeEndElement(NO_NS, idx('uses-sdk'), 3),
    // <uses-permission android:name="android.permission.INTERNET" />
    makeStartElement(NO_NS, idx('uses-permission'), 4, [
      {
        ns: ANDROID_NS,
        name: idx('name'),
        rawValue: idx('android.permission.INTERNET'),
        type: TYPE_STRING,
        data: idx('android.permission.INTERNET'),
      },
    ]),
    makeEndElement(NO_NS, idx('uses-permission'), 4),
    // <uses-permission android:name="android.permission.RECORD_AUDIO" />
    makeStartElement(NO_NS, idx('uses-permission'), 5, [
      {
        ns: ANDROID_NS,
        name: idx('name'),
        rawValue: idx('android.permission.RECORD_AUDIO'),
        type: TYPE_STRING,
        data: idx('android.permission.RECORD_AUDIO'),
      },
    ]),
    makeEndElement(NO_NS, idx('uses-permission'), 5),
    // <application android:label="VeloPulse Enterprise" android:usesCleartextTraffic="true">
    makeStartElement(NO_NS, idx('application'), 6, [
      {
        ns: ANDROID_NS,
        name: idx('label'),
        rawValue: idx('VeloPulse Enterprise'),
        type: TYPE_STRING,
        data: idx('VeloPulse Enterprise'),
      },
      {
        ns: ANDROID_NS,
        name: idx('usesCleartextTraffic'),
        rawValue: NO_NS,
        type: TYPE_INT_BOOL,
        data: 0xffffffff,
      },
    ]),
    // <activity android:name="io.velopulse.enterprise.MainActivity" android:label="VeloPulse Enterprise" android:exported="true" android:configChanges="0x04a0">
    makeStartElement(NO_NS, idx('activity'), 7, [
      {
        ns: ANDROID_NS,
        name: idx('label'),
        rawValue: idx('VeloPulse Enterprise'),
        type: TYPE_STRING,
        data: idx('VeloPulse Enterprise'),
      },
      {
        ns: ANDROID_NS,
        name: idx('name'),
        rawValue: idx('io.velopulse.enterprise.MainActivity'),
        type: TYPE_STRING,
        data: idx('io.velopulse.enterprise.MainActivity'),
      },
      {
        ns: ANDROID_NS,
        name: idx('exported'),
        rawValue: NO_NS,
        type: TYPE_INT_BOOL,
        data: 0xffffffff,
      },
      {
        ns: ANDROID_NS,
        name: idx('configChanges'),
        rawValue: NO_NS,
        type: TYPE_INT_HEX,
        data: 0x04a0,
      },
    ]),
    // <intent-filter>
    makeStartElement(NO_NS, idx('intent-filter'), 8, []),
    makeStartElement(NO_NS, idx('action'), 9, [
      {
        ns: ANDROID_NS,
        name: idx('name'),
        rawValue: idx('android.intent.action.MAIN'),
        type: TYPE_STRING,
        data: idx('android.intent.action.MAIN'),
      },
    ]),
    makeEndElement(NO_NS, idx('action'), 9),
    makeStartElement(NO_NS, idx('category'), 10, [
      {
        ns: ANDROID_NS,
        name: idx('name'),
        rawValue: idx('android.intent.category.LAUNCHER'),
        type: TYPE_STRING,
        data: idx('android.intent.category.LAUNCHER'),
      },
    ]),
    makeEndElement(NO_NS, idx('category'), 10),
    makeEndElement(NO_NS, idx('intent-filter'), 11),
    makeEndElement(NO_NS, idx('activity'), 12),
    makeEndElement(NO_NS, idx('application'), 13),
    makeEndElement(NO_NS, idx('manifest'), 14),
    makeNamespaceChunk(false, idx('android'), ANDROID_NS, 14),
  ];

  const body = Buffer.concat([stringPoolChunk, resMapChunk, ...xmlNodes]);
  const xmlHeader = Buffer.alloc(8);
  xmlHeader.writeUInt16LE(0x0003, 0); // RES_XML_TYPE
  xmlHeader.writeUInt16LE(8, 2);
  xmlHeader.writeUInt32LE(8 + body.length, 4);

  return Buffer.concat([xmlHeader, body]);
}

// ---------------------------------------------------------------------------
// 3. DALVIK EXECUTABLE (classes.dex) COMPILER FOR MainActivity + WebView
// ---------------------------------------------------------------------------

function uleb128(val) {
  const bytes = [];
  do {
    let b = val & 0x7f;
    val >>>= 7;
    if (val !== 0) b |= 0x80;
    bytes.push(b);
  } while (val !== 0);
  return Buffer.from(bytes);
}

function adler32(buf) {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

function buildValidClassesDex() {
  // Strings MUST be sorted lexicographically in DEX format!
  const strings = [
    '<init>',                                           // 0
    'I',                                                // 1
    'L',                                                // 2
    'Landroid/app/Activity;',                           // 3
    'Landroid/content/Context;',                        // 4
    'Landroid/os/Bundle;',                              // 5
    'Landroid/view/View;',                              // 6
    'Landroid/webkit/WebSettings;',                     // 7
    'Landroid/webkit/WebView;',                         // 8
    'Landroid/webkit/WebViewClient;',                   // 9
    'Lio/velopulse/enterprise/MainActivity;',           // 10
    'Ljava/lang/String;',                               // 11
    'V',                                                // 12
    'VL',                                               // 13
    'VZ',                                               // 14
    'Z',                                                // 15
    'file:///android_asset/public/index.html',          // 16
    'getSettings',                                      // 17
    'loadUrl',                                          // 18
    'onCreate',                                         // 19
    'requestWindowFeature',                             // 20
    'setAllowFileAccess',                               // 21
    'setAllowUniversalAccessFromFileURLs',              // 22
    'setContentView',                                   // 23
    'setDomStorageEnabled',                             // 24
    'setJavaScriptEnabled',                             // 25
    'setWebViewClient',                                 // 26
  ];

  // Verify lexicographical sort
  for (let i = 1; i < strings.length; i++) {
    if (strings[i - 1] >= strings[i]) {
      throw new Error(`DEX strings out of order: ${strings[i - 1]} vs ${strings[i]}`);
    }
  }
  const sIdx = (s) => strings.indexOf(s);

  // Types (sorted by string_idx)
  const typeStrings = [
    'I',                                        // 0
    'Landroid/app/Activity;',                   // 1
    'Landroid/content/Context;',                // 2
    'Landroid/os/Bundle;',                      // 3
    'Landroid/view/View;',                      // 4
    'Landroid/webkit/WebSettings;',             // 5
    'Landroid/webkit/WebView;',                 // 6
    'Landroid/webkit/WebViewClient;',           // 7
    'Lio/velopulse/enterprise/MainActivity;',   // 8
    'Ljava/lang/String;',                       // 9
    'V',                                        // 10
    'Z',                                        // 11
  ];
  const tIdx = (t) => typeStrings.indexOf(t);

  // Protos (sorted by return_type_idx, then parameters)
  // 0: (I)Z  -> shorty 'ZI', return 'Z' (11), param ['I' (0)] -> wait: let's sort by return_type_idx!
  // Return types:
  // 'Landroid/webkit/WebSettings;' = 5 -> ()Landroid/webkit/WebSettings;
  // 'V' = 10 ->
  //    ()V (no params)
  //    (Landroid/content/Context;)V (param 2)
  //    (Landroid/os/Bundle;)V (param 3)
  //    (Landroid/view/View;)V (param 4)
  //    (Landroid/webkit/WebViewClient;)V (param 7)
  //    (Ljava/lang/String;)V (param 9)
  //    (Z)V (param 11)
  const protos = [
    { shorty: 'L', ret: tIdx('Landroid/webkit/WebSettings;'), params: [] },               // 0
    { shorty: 'V', ret: tIdx('V'), params: [] },                                          // 1
    { shorty: 'VL', ret: tIdx('V'), params: [tIdx('Landroid/content/Context;')] },        // 2
    { shorty: 'VL', ret: tIdx('V'), params: [tIdx('Landroid/os/Bundle;')] },              // 3
    { shorty: 'VL', ret: tIdx('V'), params: [tIdx('Landroid/view/View;')] },              // 4
    { shorty: 'VL', ret: tIdx('V'), params: [tIdx('Landroid/webkit/WebViewClient;')] },   // 5
    { shorty: 'VL', ret: tIdx('V'), params: [tIdx('Ljava/lang/String;')] },               // 6
    { shorty: 'VZ', ret: tIdx('V'), params: [tIdx('Z')] },                                // 7
  ];

  // Methods (sorted by class_idx, then name_idx, then proto_idx)
  const methods = [
    // class 1: Landroid/app/Activity;
    { cls: tIdx('Landroid/app/Activity;'), proto: 1, name: sIdx('<init>') },              // 0: Activity.<init>()V
    { cls: tIdx('Landroid/app/Activity;'), proto: 3, name: sIdx('onCreate') },            // 1: Activity.onCreate(Bundle)V
    { cls: tIdx('Landroid/app/Activity;'), proto: 4, name: sIdx('setContentView') },      // 2: Activity.setContentView(View)V
    // class 5: Landroid/webkit/WebSettings;
    { cls: tIdx('Landroid/webkit/WebSettings;'), proto: 7, name: sIdx('setAllowFileAccess') },                  // 3
    { cls: tIdx('Landroid/webkit/WebSettings;'), proto: 7, name: sIdx('setAllowUniversalAccessFromFileURLs') }, // 4
    { cls: tIdx('Landroid/webkit/WebSettings;'), proto: 7, name: sIdx('setDomStorageEnabled') },                // 5
    { cls: tIdx('Landroid/webkit/WebSettings;'), proto: 7, name: sIdx('setJavaScriptEnabled') },                // 6
    // class 6: Landroid/webkit/WebView;
    { cls: tIdx('Landroid/webkit/WebView;'), proto: 2, name: sIdx('<init>') },            // 7: WebView.<init>(Context)V
    { cls: tIdx('Landroid/webkit/WebView;'), proto: 0, name: sIdx('getSettings') },       // 8: WebView.getSettings()WebSettings
    { cls: tIdx('Landroid/webkit/WebView;'), proto: 6, name: sIdx('loadUrl') },           // 9: WebView.loadUrl(String)V
    { cls: tIdx('Landroid/webkit/WebView;'), proto: 5, name: sIdx('setWebViewClient') },  // 10: WebView.setWebViewClient(WebViewClient)V
    // class 7: Landroid/webkit/WebViewClient;
    { cls: tIdx('Landroid/webkit/WebViewClient;'), proto: 1, name: sIdx('<init>') },      // 11: WebViewClient.<init>()V
    // class 8: Lio/velopulse/enterprise/MainActivity;
    { cls: tIdx('Lio/velopulse/enterprise/MainActivity;'), proto: 1, name: sIdx('<init>') },   // 12: MainActivity.<init>()V
    { cls: tIdx('Lio/velopulse/enterprise/MainActivity;'), proto: 3, name: sIdx('onCreate') }, // 13: MainActivity.onCreate(Bundle)V
  ];

  // Method 12 code (<init>()V):
  // registers_size = 1, ins_size = 1, outs_size = 1, tries_size = 0
  // invoke-direct {v0}, Landroid/app/Activity;-><init>()V (method 0) -> 70 10 00 00 00 00
  // return-void -> 0e 00
  const initInsns = Buffer.from([
    0x70, 0x10, 0x00, 0x00, 0x00, 0x00,
    0x0e, 0x00,
  ]);
  const initCodeItem = Buffer.alloc(16 + initInsns.length);
  initCodeItem.writeUInt16LE(1, 0); // registers_size
  initCodeItem.writeUInt16LE(1, 2); // ins_size
  initCodeItem.writeUInt16LE(1, 4); // outs_size
  initCodeItem.writeUInt16LE(0, 6); // tries_size
  initCodeItem.writeUInt32LE(0, 8); // debug_info_off
  initCodeItem.writeUInt32LE(initInsns.length / 2, 12); // insns_size in 16-bit units
  initInsns.copy(initCodeItem, 16);

  // Method 13 code (onCreate(Bundle)V):
  // registers_size = 5 (v0, v1, v2, v3=this, v4=savedInstanceState), ins_size = 2, outs_size = 2
  // 1. invoke-super {v3, v4}, Activity.onCreate(Bundle)V (method 1): 6f 20 01 00 43 00
  // 2. new-instance v0, Landroid/webkit/WebView; (type 6): 22 00 06 00
  // 3. invoke-direct {v0, v3}, WebView.<init>(Context)V (method 7): 70 20 07 00 30 00
  // 4. invoke-virtual {v0}, WebView.getSettings()WebSettings (method 8): 6e 10 08 00 00 00
  // 5. move-result-object v1: 0c 01
  // 6. const/4 v2, #1: 12 12
  // 7. invoke-virtual {v1, v2}, WebSettings.setJavaScriptEnabled(Z)V (method 6): 6e 20 06 00 21 00
  // 8. invoke-virtual {v1, v2}, WebSettings.setDomStorageEnabled(Z)V (method 5): 6e 20 05 00 21 00
  // 9. invoke-virtual {v1, v2}, WebSettings.setAllowFileAccess(Z)V (method 3): 6e 20 03 00 21 00
  // 10. invoke-virtual {v1, v2}, WebSettings.setAllowUniversalAccessFromFileURLs(Z)V (method 4): 6e 20 04 00 21 00
  // 11. new-instance v1, Landroid/webkit/WebViewClient; (type 7): 22 01 07 00
  // 12. invoke-direct {v1}, WebViewClient.<init>()V (method 11): 70 10 0b 00 01 00
  // 13. invoke-virtual {v0, v1}, WebView.setWebViewClient(WebViewClient)V (method 10): 6e 20 0a 00 10 00
  // 14. invoke-virtual {v3, v0}, Activity.setContentView(View)V (method 2): 6e 20 02 00 03 00
  // 15. const-string v1, "file:///android_asset/public/index.html" (string 16 = 0x10): 1a 01 10 00
  // 16. invoke-virtual {v0, v1}, WebView.loadUrl(String)V (method 9): 6e 20 09 00 10 00
  // 17. return-void: 0e 00
  const onCreateInsns = Buffer.from([
    0x6f, 0x20, 0x01, 0x00, 0x43, 0x00,
    0x22, 0x00, 0x06, 0x00,
    0x70, 0x20, 0x07, 0x00, 0x30, 0x00,
    0x6e, 0x10, 0x08, 0x00, 0x00, 0x00,
    0x0c, 0x01,
    0x12, 0x12,
    0x6e, 0x20, 0x06, 0x00, 0x21, 0x00,
    0x6e, 0x20, 0x05, 0x00, 0x21, 0x00,
    0x6e, 0x20, 0x03, 0x00, 0x21, 0x00,
    0x6e, 0x20, 0x04, 0x00, 0x21, 0x00,
    0x22, 0x01, 0x07, 0x00,
    0x70, 0x10, 0x0b, 0x00, 0x01, 0x00,
    0x6e, 0x20, 0x0a, 0x00, 0x10, 0x00,
    0x6e, 0x20, 0x02, 0x00, 0x03, 0x00,
    0x1a, 0x01, 0x10, 0x00,
    0x6e, 0x20, 0x09, 0x00, 0x10, 0x00,
    0x0e, 0x00,
  ]);
  const onCreateCodeItem = Buffer.alloc(16 + onCreateInsns.length);
  onCreateCodeItem.writeUInt16LE(5, 0); // registers_size
  onCreateCodeItem.writeUInt16LE(2, 2); // ins_size
  onCreateCodeItem.writeUInt16LE(2, 4); // outs_size
  onCreateCodeItem.writeUInt16LE(0, 6); // tries_size
  onCreateCodeItem.writeUInt32LE(0, 8); // debug_info_off
  onCreateCodeItem.writeUInt32LE(onCreateInsns.length / 2, 12);
  onCreateInsns.copy(onCreateCodeItem, 16);

  // Layout DEX sections:
  // Header: 0x70 (112 bytes)
  // String IDs: strings.length * 4
  // Type IDs: typeStrings.length * 4
  // Proto IDs: protos.length * 12
  // Method IDs: methods.length * 8
  // Class Defs: 1 * 32
  // Data section starts right after Class Defs (aligned to 4 bytes)
  const headerSize = 0x70;
  const stringIdsOff = headerSize;
  const typeIdsOff = stringIdsOff + strings.length * 4;
  const protoIdsOff = typeIdsOff + typeStrings.length * 4;
  const methodIdsOff = protoIdsOff + protos.length * 12;
  const classDefsOff = methodIdsOff + methods.length * 8;
  const dataOff = classDefsOff + 32;

  let curDataOff = dataOff;
  const align4 = () => {
    const pad = (4 - (curDataOff % 4)) % 4;
    curDataOff += pad;
    return Buffer.alloc(pad, 0);
  };

  const dataChunks = [];

  // 1. Type Lists for Protos that have parameters (protos 2..7)
  const protoParamOffs = [];
  for (const p of protos) {
    if (p.params.length === 0) {
      protoParamOffs.push(0);
    } else {
      dataChunks.push(align4());
      protoParamOffs.push(curDataOff);
      const tl = Buffer.alloc(4 + p.params.length * 2);
      tl.writeUInt32LE(p.params.length, 0);
      p.params.forEach((t, idx) => tl.writeUInt16LE(t, 4 + idx * 2));
      dataChunks.push(tl);
      curDataOff += tl.length;
    }
  }

  // 2. Code items (4-byte aligned)
  dataChunks.push(align4());
  const initCodeOff = curDataOff;
  dataChunks.push(initCodeItem);
  curDataOff += initCodeItem.length;

  dataChunks.push(align4());
  const onCreateCodeOff = curDataOff;
  dataChunks.push(onCreateCodeItem);
  curDataOff += onCreateCodeItem.length;

  // 3. String Data items
  const stringDataOffs = [];
  for (const s of strings) {
    stringDataOffs.push(curDataOff);
    const utf8 = Buffer.from(s, 'utf8');
    const item = Buffer.concat([uleb128(s.length), utf8, Buffer.from([0])]);
    dataChunks.push(item);
    curDataOff += item.length;
  }

  // 4. Class Data Item for MainActivity
  const classDataOff = curDataOff;
  const classDataItem = Buffer.concat([
    uleb128(0), // static_fields_size
    uleb128(0), // instance_fields_size
    uleb128(1), // direct_methods_size (<init>)
    uleb128(1), // virtual_methods_size (onCreate)
    // direct method 0: method_idx_diff = 12, access_flags = ACC_PUBLIC | ACC_CONSTRUCTOR (0x10001), code_off
    uleb128(12),
    uleb128(0x10001),
    uleb128(initCodeOff),
    // virtual method 0: method_idx_diff = 13, access_flags = ACC_PUBLIC (0x0001), code_off
    uleb128(13),
    uleb128(0x0001),
    uleb128(onCreateCodeOff),
  ]);
  dataChunks.push(classDataItem);
  curDataOff += classDataItem.length;

  // 5. Map List (4-byte aligned at end of data section)
  dataChunks.push(align4());
  const mapOff = curDataOff;
  const mapItems = [
    { type: 0x0000, size: 1, off: 0 },
    { type: 0x0001, size: strings.length, off: stringIdsOff },
    { type: 0x0002, size: typeStrings.length, off: typeIdsOff },
    { type: 0x0003, size: protos.length, off: protoIdsOff },
    { type: 0x0005, size: methods.length, off: methodIdsOff },
    { type: 0x0006, size: 1, off: classDefsOff },
    { type: 0x1001, size: 6, off: protoParamOffs.find((o) => o > 0) },
    { type: 0x2001, size: 2, off: initCodeOff },
    { type: 0x2002, size: strings.length, off: stringDataOffs[0] },
    { type: 0x2000, size: 1, off: classDataOff },
    { type: 0x1000, size: 1, off: mapOff },
  ];
  const mapBuf = Buffer.alloc(4 + mapItems.length * 12);
  mapBuf.writeUInt32LE(mapItems.length, 0);
  mapItems.forEach((m, i) => {
    const base = 4 + i * 12;
    mapBuf.writeUInt16LE(m.type, base);
    mapBuf.writeUInt16LE(0, base + 2);
    mapBuf.writeUInt32LE(m.size, base + 4);
    mapBuf.writeUInt32LE(m.off, base + 8);
  });
  dataChunks.push(mapBuf);
  curDataOff += mapBuf.length;

  const fileSize = curDataOff;
  const dataSize = fileSize - dataOff;

  // Build ID tables
  const stringIdsBuf = Buffer.alloc(strings.length * 4);
  stringDataOffs.forEach((off, i) => stringIdsBuf.writeUInt32LE(off, i * 4));

  const typeIdsBuf = Buffer.alloc(typeStrings.length * 4);
  typeStrings.forEach((ts, i) => typeIdsBuf.writeUInt32LE(sIdx(ts), i * 4));

  const protoIdsBuf = Buffer.alloc(protos.length * 12);
  protos.forEach((p, i) => {
    protoIdsBuf.writeUInt32LE(sIdx(p.shorty), i * 12);
    protoIdsBuf.writeUInt32LE(p.ret, i * 12 + 4);
    protoIdsBuf.writeUInt32LE(protoParamOffs[i], i * 12 + 8);
  });

  const methodIdsBuf = Buffer.alloc(methods.length * 8);
  methods.forEach((m, i) => {
    methodIdsBuf.writeUInt16LE(m.cls, i * 8);
    methodIdsBuf.writeUInt16LE(m.proto, i * 8 + 2);
    methodIdsBuf.writeUInt32LE(m.name, i * 8 + 4);
  });

  const classDefsBuf = Buffer.alloc(32);
  classDefsBuf.writeUInt32LE(tIdx('Lio/velopulse/enterprise/MainActivity;'), 0); // class_idx
  classDefsBuf.writeUInt32LE(0x0001, 4); // ACC_PUBLIC
  classDefsBuf.writeUInt32LE(tIdx('Landroid/app/Activity;'), 8); // superclass_idx
  classDefsBuf.writeUInt32LE(0, 12); // interfaces_off
  classDefsBuf.writeUInt32LE(0xffffffff, 16); // source_file_idx
  classDefsBuf.writeUInt32LE(0, 20); // annotations_off
  classDefsBuf.writeUInt32LE(classDataOff, 24); // class_data_off
  classDefsBuf.writeUInt32LE(0, 28); // static_values_off

  const headerBuf = Buffer.alloc(headerSize);
  Buffer.from('dex\n035\0', 'ascii').copy(headerBuf, 0);
  headerBuf.writeUInt32LE(fileSize, 32);
  headerBuf.writeUInt32LE(headerSize, 36);
  headerBuf.writeUInt32LE(0x12345678, 40); // endian_tag
  headerBuf.writeUInt32LE(0, 44); // link_size
  headerBuf.writeUInt32LE(0, 48); // link_off
  headerBuf.writeUInt32LE(mapOff, 52); // map_off
  headerBuf.writeUInt32LE(strings.length, 56);
  headerBuf.writeUInt32LE(stringIdsOff, 60);
  headerBuf.writeUInt32LE(typeStrings.length, 64);
  headerBuf.writeUInt32LE(typeIdsOff, 68);
  headerBuf.writeUInt32LE(protos.length, 72);
  headerBuf.writeUInt32LE(protoIdsOff, 76);
  headerBuf.writeUInt32LE(0, 80); // field_ids_size
  headerBuf.writeUInt32LE(0, 84); // field_ids_off
  headerBuf.writeUInt32LE(methods.length, 88);
  headerBuf.writeUInt32LE(methodIdsOff, 92);
  headerBuf.writeUInt32LE(1, 96); // class_defs_size
  headerBuf.writeUInt32LE(classDefsOff, 100);
  headerBuf.writeUInt32LE(dataSize, 104);
  headerBuf.writeUInt32LE(dataOff, 108);

  const fullDex = Buffer.concat([
    headerBuf,
    stringIdsBuf,
    typeIdsBuf,
    protoIdsBuf,
    methodIdsBuf,
    classDefsBuf,
    ...dataChunks,
  ]);

  // Compute SHA-1 signature (bytes 32..end) and store at offset 12..32
  const sha1 = crypto.createHash('sha1').update(fullDex.subarray(32)).digest();
  sha1.copy(fullDex, 12);

  // Compute Adler32 checksum (bytes 12..end) and store at offset 8..12
  const checksum = adler32(fullDex.subarray(12));
  fullDex.writeUInt32LE(checksum, 8);

  return fullDex;
}

// ---------------------------------------------------------------------------
// 4. ZIP / APK BUILDER WITH JAR v1 (META-INF) SIGNING
// ---------------------------------------------------------------------------

function createZipArchive(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const rawData = entry.data;
    const compress = entry.compress !== false;
    const compressedData = compress
      ? zlib.deflateRawSync(rawData, { level: 9 })
      : rawData;
    const method = compress ? 8 : 0;
    const crc = crc32(rawData);

    // 4-byte alignment for uncompressed entries (zipalign)
    let extraField = Buffer.alloc(0);
    if (!compress) {
      const headerLen = 30 + nameBuf.length;
      const pad = (4 - ((offset + headerLen) % 4)) % 4;
      if (pad > 0) {
        extraField = Buffer.alloc(pad, 0);
      }
    }

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6);  // flags
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x555d, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedData.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(extraField.length, 28);

    const localRecord = Buffer.concat([
      localHeader,
      nameBuf,
      extraField,
      compressedData,
    ]);
    localParts.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x555d, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedData.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(Buffer.concat([centralHeader, nameBuf]));
    offset += localRecord.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

function collectFilesRecursively(dir, prefix = '') {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const relPath = prefix ? `${prefix}/${item}` : item;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (item === 'downloads') continue; // Do not recursively embed downloads folder inside APK
      results.push(...collectFilesRecursively(fullPath, relPath));
    } else {
      results.push({ relPath, fullPath, data: fs.readFileSync(fullPath) });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 5. MAIN BUILD PIPELINE
// ---------------------------------------------------------------------------

async function main() {
  console.log('1. Generating PNG icons for PWA & Android APK...');
  const publicDir = path.join(ROOT_DIR, 'public');
  fs.mkdirSync(publicDir, { recursive: true });

  const icon192 = generateBrandPng(192, 192, false);
  const icon512 = generateBrandPng(512, 512, false);
  const iconMaskable512 = generateBrandPng(512, 512, true);
  const icon180 = generateBrandPng(180, 180, false);

  fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), icon192);
  fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), icon512);
  fs.writeFileSync(
    path.join(publicDir, 'pwa-maskable-512x512.png'),
    iconMaskable512
  );
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), icon180);

  console.log('2. Building Vite production bundle...');
  execSync('npx vite build', { cwd: ROOT_DIR, stdio: 'inherit' });

  const distDir = path.join(ROOT_DIR, 'dist');
  const downloadsPublicDir = path.join(publicDir, 'downloads');
  const downloadsDistDir = path.join(distDir, 'downloads');
  fs.mkdirSync(downloadsPublicDir, { recursive: true });
  fs.mkdirSync(downloadsDistDir, { recursive: true });

  console.log('3. Compiling Android APK binary (AndroidManifest.xml, classes.dex, assets)...');
  const manifestXmlBin = buildBinaryAndroidManifest();
  const classesDexBin = buildValidClassesDex();

  // Gather all built dist/ files into assets/public/
  const distFiles = collectFilesRecursively(distDir);
  const apkPayloadEntries = [
    { name: 'AndroidManifest.xml', data: manifestXmlBin, compress: true },
    { name: 'classes.dex', data: classesDexBin, compress: true },
    { name: 'res/drawable/ic_launcher.png', data: icon192, compress: false },
  ];

  for (const f of distFiles) {
    let fileBuf = f.data;
    if (f.relPath === 'index.html') {
      // Rewrite root-relative paths (/assets/...) to relative (./assets/...) for file:///android_asset/public/index.html
      let html = fileBuf.toString('utf8');
      html = html.replace(/(src|href)="\/assets\//g, '$1="./assets/');
      html = html.replace(/(href)="\/(icon\.svg|apple-touch-icon\.png|manifest\.webmanifest)"/g, '$1="./$2"');
      fileBuf = Buffer.from(html, 'utf8');
    }
    apkPayloadEntries.push({
      name: `assets/public/${f.relPath}`,
      data: fileBuf,
      compress: !f.relPath.endsWith('.png'),
    });
  }

  // Embed Supabase & Backend configuration metadata inside APK assets
  const backendConfigJson = JSON.stringify(
    {
      appName: 'VeloPulse Enterprise',
      packageName: 'io.velopulse.enterprise',
      version: '1.0.0',
      cloudBackendUrl:
        'https://ais-pre-6koxp5cugo7zbxeupl33g2-886551457424.europe-west2.run.app',
      supabasePooler: {
        host: 'aws-0-eu-west-1.pooler.supabase.com',
        port: 6543,
        database: 'postgres',
        projectRef: 'glxpoccrjdkcqejifvct',
        ssl: true,
      },
      builtAt: new Date().toISOString(),
    },
    null,
    2
  );
  apkPayloadEntries.push({
    name: 'assets/public/supabase-backend.json',
    data: Buffer.from(backendConfigJson, 'utf8'),
    compress: true,
  });

  // Generate JAR v1 Signature (META-INF/MANIFEST.MF, META-INF/CERT.SF, META-INF/CERT.RSA)
  const mfLines = [
    'Manifest-Version: 1.0',
    'Built-By: VeloPulse Android Builder',
    'Created-By: VeloPulse Enterprise APK Compiler',
    '',
  ];
  const sfEntries = [];

  for (const entry of apkPayloadEntries) {
    const sha256B64 = crypto
      .createHash('sha256')
      .update(entry.data)
      .digest('base64');
    const entryBlock = `Name: ${entry.name}\r\nSHA-256-Digest: ${sha256B64}\r\n\r\n`;
    mfLines.push(`Name: ${entry.name}`);
    mfLines.push(`SHA-256-Digest: ${sha256B64}`);
    mfLines.push('');

    const blockDigest = crypto
      .createHash('sha256')
      .update(Buffer.from(entryBlock, 'utf8'))
      .digest('base64');
    sfEntries.push(`Name: ${entry.name}\r\nSHA-256-Digest: ${blockDigest}\r\n`);
  }

  const manifestMfBuf = Buffer.from(mfLines.join('\r\n'), 'utf8');
  const manifestDigestB64 = crypto
    .createHash('sha256')
    .update(manifestMfBuf)
    .digest('base64');

  const certSfContent =
    [
      'Signature-Version: 1.0',
      'Created-By: 1.0 (Android)',
      `SHA-256-Digest-Manifest: ${manifestDigestB64}`,
      '',
    ].join('\r\n') +
    '\r\n' +
    sfEntries.join('\r\n');
  const certSfBuf = Buffer.from(certSfContent, 'utf8');

  // Sign CERT.SF using OpenSSL RSA-2048 PKCS#7 DER detached signature
  const tmpDir = '/tmp/velopulse-apk-sign';
  fs.mkdirSync(tmpDir, { recursive: true });
  const keyFile = path.join(tmpDir, 'release.key');
  const certFile = path.join(tmpDir, 'release.crt');
  const sfFile = path.join(tmpDir, 'CERT.SF');
  const rsaFile = path.join(tmpDir, 'CERT.RSA');

  execSync(
    `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${keyFile}" -out "${certFile}" -days 10000 -subj "/CN=VeloPulse Enterprise/OU=Mobile/O=VeloPulse/L=Cairo/C=EG" 2>/dev/null`
  );
  fs.writeFileSync(sfFile, certSfBuf);
  execSync(
    `openssl cms -sign -binary -noattr -in "${sfFile}" -signer "${certFile}" -inkey "${keyFile}" -outform DER -out "${rsaFile}" -md sha256 2>/dev/null`
  );
  const certRsaBuf = fs.readFileSync(rsaFile);

  const signedApkEntries = [
    { name: 'META-INF/MANIFEST.MF', data: manifestMfBuf, compress: true },
    { name: 'META-INF/CERT.SF', data: certSfBuf, compress: true },
    { name: 'META-INF/CERT.RSA', data: certRsaBuf, compress: true },
    ...apkPayloadEntries,
  ];

  const finalApkBuffer = createZipArchive(signedApkEntries);
  const apkFileName = 'VeloPulse-Enterprise-v1.0.0.apk';
  fs.writeFileSync(path.join(downloadsPublicDir, apkFileName), finalApkBuffer);
  fs.writeFileSync(path.join(downloadsDistDir, apkFileName), finalApkBuffer);

  console.log('4. Generating Android Studio / Capacitor project archive...');
  const androidProjectEntries = [
    {
      name: 'VeloPulse-Android/capacitor.config.json',
      data: Buffer.from(
        JSON.stringify(
          {
            appId: 'io.velopulse.enterprise',
            appName: 'VeloPulse Enterprise',
            webDir: 'dist',
            server: {
              url: 'https://ais-pre-6koxp5cugo7zbxeupl33g2-886551457424.europe-west2.run.app',
              cleartext: true,
            },
          },
          null,
          2
        ),
        'utf8'
      ),
    },
    {
      name: 'VeloPulse-Android/android/app/src/main/AndroidManifest.xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="io.velopulse.enterprise"
    android:versionCode="1"
    android:versionName="1.0.0">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />

    <application
        android:allowBackup="true"
        android:label="VeloPulse Enterprise"
        android:usesCleartextTraffic="true">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`,
        'utf8'
      ),
    },
    {
      name: 'VeloPulse-Android/android/app/src/main/java/io/velopulse/enterprise/MainActivity.java',
      data: Buffer.from(
        `package io.velopulse.enterprise;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        webView.setWebViewClient(new WebViewClient());
        setContentView(webView);
        webView.loadUrl("file:///android_asset/public/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
`,
        'utf8'
      ),
    },
    {
      name: 'VeloPulse-Android/android/app/build.gradle',
      data: Buffer.from(
        `plugins {
    id 'com.android.application'
}

android {
    namespace 'io.velopulse.enterprise'
    compileSdk 34

    defaultConfig {
        applicationId "io.velopulse.enterprise"
        minSdk 21
        targetSdk 34
        versionCode 1
        versionName "1.0.0"
    }
}
`,
        'utf8'
      ),
    },
    {
      name: 'VeloPulse-Android/supabase-backend.env',
      data: Buffer.from(
        `DATABASE_URL="postgresql://postgres.glxpoccrjdkcqejifvct:Mido40363881@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
SUPABASE_DB_URL="postgresql://postgres.glxpoccrjdkcqejifvct:Mido40363881@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
APP_URL="https://ais-pre-6koxp5cugo7zbxeupl33g2-886551457424.europe-west2.run.app"
`,
        'utf8'
      ),
    },
    {
      name: 'VeloPulse-Android/supabase-schema.sql',
      data: fs.readFileSync(path.join(ROOT_DIR, 'supabase-schema.sql')),
    },
  ];

  for (const f of distFiles) {
    androidProjectEntries.push({
      name: `VeloPulse-Android/android/app/src/main/assets/public/${f.relPath}`,
      data: f.data,
    });
  }

  const projectZipBuffer = createZipArchive(androidProjectEntries);
  const projectZipName = 'VeloPulse-Android-Studio-Project.zip';
  fs.writeFileSync(
    path.join(downloadsPublicDir, projectZipName),
    projectZipBuffer
  );
  fs.writeFileSync(
    path.join(downloadsDistDir, projectZipName),
    projectZipBuffer
  );

  // Clean up temporary signing files
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(
    `✅ Built signed Android APK: ${apkFileName} (${(
      finalApkBuffer.length / 1024
    ).toFixed(1)} KB)`
  );
  console.log(
    `✅ Built Android Studio project ZIP: ${projectZipName} (${(
      projectZipBuffer.length / 1024
    ).toFixed(1)} KB)`
  );
}

main().catch((err) => {
  console.error('APK Build Error:', err);
  process.exit(1);
});
