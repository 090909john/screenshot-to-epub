"use strict";

/* 頁冊 Pagebound — 把截圖裝訂成 EPUB。全部在瀏覽器本機處理。 */

const $ = (id) => document.getElementById(id);

const els = {
  modeImage: $("modeImage"), modeText: $("modeText"), ocrCard: $("ocrCard"),
  uploadBtn: $("uploadBtn"), fileInput: $("fileInput"), coverInput: $("coverInput"),
  thumbGrid: $("thumbGrid"), emptyHint: $("emptyHint"), itemCount: $("itemCount"),
  bookTitle: $("bookTitle"), bookAuthor: $("bookAuthor"),
  coverChip: $("coverChip"), coverLabel: $("coverLabel"), coverBtn: $("coverBtn"),
  ocrLang: $("ocrLang"), proofToggle: $("proofToggle"), chapToggle: $("chapToggle"),
  barIdle: $("barIdle"), barConverting: $("barConverting"), barDone: $("barDone"),
  barTitle: $("barTitle"), barCount: $("barCount"), barMode: $("barMode"),
  convertBtn: $("convertBtn"), barPct: $("barPct"), barFill: $("barFill"), barStage: $("barStage"),
  doneTitle: $("doneTitle"), doneCount: $("doneCount"),
  resetBtn: $("resetBtn"), openBookBtn: $("openBookBtn"), downloadBtn: $("downloadBtn"),
  previewModal: $("previewModal"), previewImg: $("previewImg"), previewName: $("previewName"),
  readerModal: $("readerModal"), readerTitle: $("readerTitle"), readerBody: $("readerBody"), readerClose: $("readerClose"),
  proofModal: $("proofModal"), proofBody: $("proofBody"),
  proofCancel: $("proofCancel"), proofCancel2: $("proofCancel2"), proofConfirm: $("proofConfirm"),
};

const state = {
  mode: "image",          // 'image' | 'text'
  items: [],              // {id, file, url, name, width, height}
  cover: null,            // {file, url} 自訂封面;null = 用第一張截圖
  proofread: true,
  chapters: true,
  status: "idle",         // 'idle' | 'converting' | 'done'
  book: null,             // 產生完成的 Blob
  ocrTexts: null,         // text 模式辨識結果 [string]
};

let uid = 0;

// ---------- 模式切換 ----------

els.modeImage.addEventListener("click", () => setMode("image"));
els.modeText.addEventListener("click", () => setMode("text"));

function setMode(mode) {
  state.mode = mode;
  els.modeImage.classList.toggle("active", mode === "image");
  els.modeText.classList.toggle("active", mode === "text");
  els.ocrCard.hidden = mode !== "text";
  backToIdle();
}

// ---------- 上傳 ----------

els.uploadBtn.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", () => {
  addFiles(els.fileInput.files);
  els.fileInput.value = "";
});

["dragover", "dragenter"].forEach((t) =>
  els.uploadBtn.addEventListener(t, (e) => {
    e.preventDefault();
    els.uploadBtn.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((t) =>
  els.uploadBtn.addEventListener(t, (e) => {
    e.preventDefault();
    els.uploadBtn.classList.remove("dragover");
  })
);
els.uploadBtn.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

async function addFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
  for (const file of files) {
    const url = URL.createObjectURL(file);
    try {
      const { width, height } = await imageSize(url);
      state.items.push({
        id: "u" + ++uid,
        file, url, width, height,
        name: file.name.replace(/\.[^.]+$/, ""),
      });
    } catch {
      URL.revokeObjectURL(url);
    }
  }
  backToIdle();
  renderItems();
}

function imageSize(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}

// ---------- 縮圖清單 ----------

let dragFrom = null;

function renderItems() {
  els.thumbGrid.innerHTML = "";
  state.items.forEach((it, i) => {
    const fig = document.createElement("figure");
    fig.className = "thumb";
    fig.draggable = true;

    const num = document.createElement("div");
    num.className = "thumb-num";
    num.textContent = String(i + 1).padStart(2, "0");

    const box = document.createElement("div");
    box.className = "thumb-imgbox";
    const img = document.createElement("img");
    img.src = it.url;
    img.alt = it.name;
    box.appendChild(img);

    const cap = document.createElement("figcaption");
    cap.className = "thumb-caption";
    const up = capBtn("←", "往前", () => move(i, -1));
    const down = capBtn("→", "往後", () => move(i, 1));
    const pv = capBtn("👁", "預覽", () => openPreview(it));
    pv.classList.add("pv");
    const rm = capBtn("✕", "刪除", () => removeItem(i));
    rm.classList.add("rm");
    cap.append(up, down, pv, rm);

    fig.append(num, box, cap);

    // 拖曳排序
    fig.addEventListener("dragstart", () => { dragFrom = i; fig.classList.add("dragging"); });
    fig.addEventListener("dragend", () => { dragFrom = null; fig.classList.remove("dragging"); });
    fig.addEventListener("dragover", (e) => { e.preventDefault(); fig.classList.add("drag-over"); });
    fig.addEventListener("dragleave", () => fig.classList.remove("drag-over"));
    fig.addEventListener("drop", (e) => {
      e.preventDefault();
      fig.classList.remove("drag-over");
      if (dragFrom === null || dragFrom === i) return;
      const [moved] = state.items.splice(dragFrom, 1);
      state.items.splice(i, 0, moved);
      backToIdle();
      renderItems();
    });

    els.thumbGrid.appendChild(fig);
  });

  const n = state.items.length;
  els.thumbGrid.hidden = n === 0;
  els.emptyHint.hidden = n > 0;
  els.itemCount.textContent = n;
  updateBar();
  updateCoverChip();
}

function capBtn(label, title, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

function move(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= state.items.length) return;
  [state.items[i], state.items[j]] = [state.items[j], state.items[i]];
  backToIdle();
  renderItems();
}

function removeItem(i) {
  URL.revokeObjectURL(state.items[i].url);
  state.items.splice(i, 1);
  backToIdle();
  renderItems();
}

// ---------- 書籍資訊、封面 ----------

els.bookTitle.addEventListener("input", () => { backToIdle(); updateBar(); updateCoverChip(); });
els.bookAuthor.addEventListener("input", backToIdle);

els.coverBtn.addEventListener("click", () => els.coverInput.click());
els.coverInput.addEventListener("change", () => {
  const f = els.coverInput.files[0];
  els.coverInput.value = "";
  if (!f || !f.type.startsWith("image/")) return;
  if (state.cover) URL.revokeObjectURL(state.cover.url);
  state.cover = { file: f, url: URL.createObjectURL(f) };
  backToIdle();
  updateCoverChip();
});

function bookTitle() { return els.bookTitle.value.trim() || "未命名書冊"; }

function updateCoverChip() {
  els.coverChip.innerHTML = "";
  const src = state.cover ? state.cover.url : state.items[0] ? state.items[0].url : null;
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "封面";
    els.coverChip.appendChild(img);
  } else {
    const span = document.createElement("span");
    span.textContent = bookTitle();
    els.coverChip.appendChild(span);
  }
}

// ---------- 開關 ----------

function wireToggle(btn, key) {
  btn.addEventListener("click", () => {
    state[key] = !state[key];
    btn.querySelector(".knob-track").classList.toggle("on", state[key]);
    btn.setAttribute("aria-pressed", state[key]);
    backToIdle();
  });
}
wireToggle(els.proofToggle, "proofread");
wireToggle(els.chapToggle, "chapters");

// ---------- 操作列 ----------

function updateBar() {
  els.barIdle.classList.toggle("active", state.status === "idle");
  els.barConverting.classList.toggle("active", state.status === "converting");
  els.barDone.classList.toggle("active", state.status === "done");
  els.barTitle.textContent = bookTitle();
  els.barCount.textContent = state.items.length;
  els.barMode.textContent = state.mode === "image" ? "圖片直排" : "OCR 文字";
  els.convertBtn.disabled = state.items.length === 0;
  els.doneTitle.textContent = bookTitle();
  els.doneCount.textContent = state.items.length;
}

function setProgress(pct, stage) {
  els.barPct.textContent = Math.round(pct) + "%";
  els.barFill.style.width = pct + "%";
  els.barStage.textContent =
    stage ||
    (pct < 40
      ? state.mode === "text" ? "辨識文字中…" : "處理圖片中…"
      : pct < 80 ? "產生章節結構…" : "打包 EPUB…");
}

function backToIdle() {
  if (state.status === "done") {
    state.status = "idle";
    state.book = null;
    state.ocrTexts = null;
    updateBar();
  }
}

els.resetBtn.addEventListener("click", () => {
  state.status = "idle";
  state.book = null;
  state.ocrTexts = null;
  updateBar();
});

// ---------- 轉換主流程 ----------

els.convertBtn.addEventListener("click", async () => {
  if (!state.items.length || state.status === "converting") return;
  state.status = "converting";
  setProgress(0);
  updateBar();
  try {
    if (state.mode === "text") {
      const texts = await runOcr((p) => setProgress(p * 75));
      if (state.proofread) {
        const edited = await proofread(texts);
        if (!edited) { state.status = "idle"; updateBar(); return; }
        state.ocrTexts = edited;
      } else {
        state.ocrTexts = texts;
      }
      setProgress(80);
      state.book = await buildTextEpub(state.ocrTexts, (p) => setProgress(80 + p * 20));
    } else {
      state.book = await buildImageEpub((p) => setProgress(p * 100));
    }
    setProgress(100);
    state.status = "done";
  } catch (err) {
    console.error(err);
    alert("產生 EPUB 失敗:" + (err && err.message ? err.message : err));
    state.status = "idle";
  }
  updateBar();
});

els.downloadBtn.addEventListener("click", () => {
  if (!state.book) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(state.book);
  a.download = bookTitle().replace(/[\\/:*?"<>|]/g, "_") + ".epub";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
});

// ---------- OCR(Tesseract.js,按需載入) ----------

const OCR_LANGS = { "zh-TW": "chi_tra", "zh-CN": "chi_sim", en: "eng", ja: "jpn", mix: "chi_tra+eng" };

let tesseractReady = null;

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (!tesseractReady) {
    tesseractReady = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js";
      s.onload = resolve;
      s.onerror = () => { tesseractReady = null; reject(new Error("無法載入 OCR 引擎,請檢查網路連線")); };
      document.head.appendChild(s);
    });
  }
  return tesseractReady;
}

async function runOcr(onProgress) {
  await loadTesseract();
  const lang = OCR_LANGS[els.ocrLang.value] || "chi_tra";
  const n = state.items.length;
  let current = 0;
  const worker = await Tesseract.createWorker(lang, 1, {
    logger: (m) => {
      if (m.status === "recognizing text") onProgress((current + m.progress) / n);
    },
  });
  try {
    const texts = [];
    for (current = 0; current < n; current++) {
      const { data } = await worker.recognize(state.items[current].url);
      texts.push(cleanOcrText(data.text || ""));
      onProgress((current + 1) / n);
    }
    return texts;
  } finally {
    await worker.terminate();
  }
}

function cleanOcrText(text) {
  return text
    .replace(/(?<=[　-鿿＀-￯])[ \t]+(?=[　-鿿＀-￯])/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------- 校對 modal ----------

let proofResolve = null;

function proofread(texts) {
  els.proofBody.innerHTML = "";
  texts.forEach((t, i) => {
    const wrap = document.createElement("div");
    wrap.className = "proof-item";
    const label = document.createElement("div");
    label.className = "proof-label";
    label.textContent = String(i + 1).padStart(2, "0") + " · " + state.items[i].name;
    const ta = document.createElement("textarea");
    ta.value = t;
    wrap.append(label, ta);
    els.proofBody.appendChild(wrap);
  });
  els.proofModal.hidden = false;
  return new Promise((resolve) => { proofResolve = resolve; });
}

function closeProof(confirmed) {
  els.proofModal.hidden = true;
  if (!proofResolve) return;
  const resolve = proofResolve;
  proofResolve = null;
  resolve(confirmed ? Array.from(els.proofBody.querySelectorAll("textarea")).map((t) => t.value) : null);
}

els.proofConfirm.addEventListener("click", () => closeProof(true));
els.proofCancel.addEventListener("click", () => closeProof(false));
els.proofCancel2.addEventListener("click", () => closeProof(false));

// ---------- 預覽 modal ----------

function openPreview(it) {
  els.previewImg.src = it.url;
  els.previewImg.alt = it.name;
  els.previewName.textContent = it.name;
  els.previewModal.hidden = false;
}

els.previewModal.addEventListener("click", () => { els.previewModal.hidden = true; });

// ---------- 成書預覽 modal ----------

els.openBookBtn.addEventListener("click", () => {
  els.readerTitle.textContent = bookTitle();
  els.readerBody.innerHTML = "";
  if (state.mode === "image") {
    const stack = document.createElement("div");
    stack.className = "reader-images";
    state.items.forEach((it) => {
      const img = document.createElement("img");
      img.src = it.url;
      img.alt = it.name;
      stack.appendChild(img);
    });
    els.readerBody.appendChild(stack);
  } else {
    const wrap = document.createElement("div");
    wrap.className = "reader-text";
    const h2 = document.createElement("h2");
    h2.textContent = bookTitle();
    const author = document.createElement("div");
    author.className = "reader-author";
    author.textContent = els.bookAuthor.value.trim();
    const body = document.createElement("div");
    body.className = "body";
    body.textContent = (state.ocrTexts || []).join("\n\n");
    wrap.append(h2, author, body);
    els.readerBody.appendChild(wrap);
  }
  els.readerModal.hidden = false;
});

els.readerModal.addEventListener("click", (e) => {
  if (e.target === els.readerModal) els.readerModal.hidden = true;
});
els.readerClose.addEventListener("click", () => { els.readerModal.hidden = true; });

// ---------- EPUB 打包 ----------

function epubShell(zip) {
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );
}

function opf({ title, author, lang, prePaginated, manifest, spine }) {
  const uuid = "urn:uuid:" + crypto.randomUUID();
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const rendition = prePaginated
    ? `\n    <meta property="rendition:layout">pre-paginated</meta>\n    <meta property="rendition:spread">auto</meta>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${uuid}</dc:identifier>
    <dc:title>${escXml(title)}</dc:title>
    <dc:creator>${escXml(author)}</dc:creator>
    <dc:language>${lang}</dc:language>
    <meta property="dcterms:modified">${modified}</meta>${rendition}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifest.map((m) => "    " + m).join("\n")}
  </manifest>
  <spine>
${spine.map((s) => "    " + s).join("\n")}
  </spine>
</package>`;
}

function navDoc(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-Hant">
<head><title>目錄</title></head>
<body>
  <nav epub:type="toc">
    <h1>目錄</h1>
    <ol>
${entries.map((e) => `      <li><a href="${e.href}">${escXml(e.label)}</a></li>`).join("\n")}
    </ol>
  </nav>
</body>
</html>`;
}

async function buildImageEpub(onProgress) {
  const title = bookTitle();
  const author = els.bookAuthor.value.trim() || "佚名";
  const zip = new JSZip();
  epubShell(zip);

  const manifest = [];
  const spine = [];
  const navEntries = [];
  const n = state.items.length;

  // 自訂封面時額外加一頁;否則第一張截圖就是封面
  let coverDone = false;
  if (state.cover) {
    const cov = await normalizeImage(state.cover.file, state.cover.url);
    zip.file("OEBPS/images/cover." + cov.ext, cov.data);
    zip.file("OEBPS/pages/cover.xhtml", pageXhtml("封面", "../images/cover." + cov.ext, cov.width, cov.height));
    manifest.push(`<item id="cover-img" href="images/cover.${cov.ext}" media-type="${cov.mime}" properties="cover-image"/>`);
    manifest.push(`<item id="cover-page" href="pages/cover.xhtml" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="cover-page"/>`);
    coverDone = true;
  }

  for (let i = 0; i < n; i++) {
    const it = state.items[i];
    const nn = String(i + 1).padStart(3, "0");
    const img = await normalizeImage(it.file, it.url);
    const imgPath = `images/img-${nn}.${img.ext}`;
    const pagePath = `pages/page-${nn}.xhtml`;
    const label = state.chapters ? it.name : `第 ${i + 1} 頁`;

    zip.file("OEBPS/" + imgPath, img.data);
    zip.file("OEBPS/" + pagePath, pageXhtml(label, "../" + imgPath, img.width, img.height));

    const coverProp = !coverDone && i === 0 ? ' properties="cover-image"' : "";
    manifest.push(`<item id="img-${nn}" href="${imgPath}" media-type="${img.mime}"${coverProp}/>`);
    manifest.push(`<item id="page-${nn}" href="${pagePath}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="page-${nn}"/>`);
    if (state.chapters || i === 0) navEntries.push({ href: pagePath, label });
    onProgress(((i + 1) / n) * 0.8);
  }

  if (!state.chapters) navEntries[0].label = title;

  zip.file("OEBPS/nav.xhtml", navDoc(navEntries));
  zip.file("OEBPS/content.opf", opf({ title, author, lang: "zh-Hant", prePaginated: true, manifest, spine }));

  return zip.generateAsync(
    { type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE" },
    (meta) => onProgress(0.8 + (meta.percent / 100) * 0.2)
  );
}

async function buildTextEpub(texts, onProgress) {
  const title = bookTitle();
  const author = els.bookAuthor.value.trim() || "佚名";
  const langSel = els.ocrLang.value;
  const lang = langSel === "zh-CN" ? "zh-Hans" : langSel === "en" ? "en" : langSel === "ja" ? "ja" : "zh-Hant";
  const zip = new JSZip();
  epubShell(zip);

  const manifest = [];
  const spine = [];
  const navEntries = [];

  zip.file(
    "OEBPS/css/style.css",
    `body { font-family: serif; line-height: 1.85; margin: 5% 6%; }
h1, h2 { font-weight: 600; line-height: 1.4; }
p { margin: 0 0 1em; text-indent: 0; }`
  );
  manifest.push(`<item id="css" href="css/style.css" media-type="text/css"/>`);

  // 封面:自訂 > 第一張截圖
  const coverSrc = state.cover || state.items[0];
  const cov = await normalizeImage(coverSrc.file, coverSrc.url);
  zip.file("OEBPS/images/cover." + cov.ext, cov.data);
  manifest.push(`<item id="cover-img" href="images/cover.${cov.ext}" media-type="${cov.mime}" properties="cover-image"/>`);

  // 書名頁
  zip.file(
    "OEBPS/pages/title.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}">
<head><title>${escXml(title)}</title><link rel="stylesheet" type="text/css" href="../css/style.css"/></head>
<body>
  <h1>${escXml(title)}</h1>
  <p>${escXml(author)}</p>
</body>
</html>`
  );
  manifest.push(`<item id="title-page" href="pages/title.xhtml" media-type="application/xhtml+xml"/>`);
  spine.push(`<itemref idref="title-page"/>`);
  navEntries.push({ href: "pages/title.xhtml", label: title });

  const chapters = state.chapters
    ? texts.map((t, i) => ({ label: state.items[i].name, text: t }))
    : [{ label: "內文", text: texts.join("\n\n") }];

  chapters.forEach((ch, i) => {
    const nn = String(i + 1).padStart(3, "0");
    const paras = ch.text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `  <p>${escXml(p).replace(/\n/g, "<br/>")}</p>`)
      .join("\n");
    zip.file(
      `OEBPS/pages/ch-${nn}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}">
<head><title>${escXml(ch.label)}</title><link rel="stylesheet" type="text/css" href="../css/style.css"/></head>
<body>
  <h2>${escXml(ch.label)}</h2>
${paras || "  <p>(這一頁沒有辨識到文字)</p>"}
</body>
</html>`
    );
    manifest.push(`<item id="ch-${nn}" href="pages/ch-${nn}.xhtml" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="ch-${nn}"/>`);
    navEntries.push({ href: `pages/ch-${nn}.xhtml`, label: ch.label });
  });

  zip.file("OEBPS/nav.xhtml", navDoc(navEntries));
  zip.file("OEBPS/content.opf", opf({ title, author, lang, prePaginated: false, manifest, spine }));

  return zip.generateAsync(
    { type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE" },
    (meta) => onProgress(meta.percent / 100)
  );
}

function pageXhtml(label, src, w, h) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-Hant">
<head>
  <title>${escXml(label)}</title>
  <meta name="viewport" content="width=${w}, height=${h}"/>
  <style>body{margin:0;padding:0;}img{width:${w}px;height:${h}px;display:block;}</style>
</head>
<body>
  <img src="${src}" alt="${escXml(label)}"/>
</body>
</html>`;
}

/* EPUB 核心圖片格式只有 PNG / JPEG / GIF / SVG,其他(如 WebP)轉成 PNG */
async function normalizeImage(file, url) {
  const type = file.type;
  const { width, height } = await imageSize(url);
  if (type === "image/png" || type === "image/jpeg" || type === "image/gif") {
    return {
      data: await file.arrayBuffer(),
      ext: type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "gif",
      mime: type, width, height,
    };
  }
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0);
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("圖片轉檔失敗"))), "image/png")
  );
  return { data: await blob.arrayBuffer(), ext: "png", mime: "image/png", width, height };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("圖片載入失敗"));
    img.src = url;
  });
}

function escXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

// ---------- 初始化 ----------

renderItems();
