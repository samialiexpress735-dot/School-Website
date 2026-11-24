// Step 7A: the blank report card form as page images. A PDF (one or two pages) or a scan/photo is turned into
// JPEG page images in the browser, so no server and no extra service is needed. The images are kept in the
// PRIVATE storage bucket report-forms and opened through short-lived signed links.
import { supabase } from "./supabase.js";
import { fitWidth } from "./reportTemplate.js";

export const BUCKET = "report-forms";
const MAX_FILE = 15 * 1024 * 1024; // the file the person chooses
const MAX_PAGE = 3 * 1024 * 1024;  // one page image, same limit as the bucket
const WIDTH = 1654;                // A4 at about 200 dpi: sharp enough to align on, small enough to load fast

export class FormError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const toJpeg = (canvas) => new Promise((resolve) => {
  // Try a few qualities so the page stays under the bucket limit
  const tries = [0.85, 0.7, 0.55];
  const next = (i) => canvas.toBlob((b) => {
    if (b && (b.size <= MAX_PAGE || i === tries.length - 1)) resolve(b);
    else next(i + 1);
  }, "image/jpeg", tries[i]);
  next(0);
});

function newCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; // JPEG has no transparency
  ctx.fillRect(0, 0, w, h);
  return { c, ctx };
}

async function imagePages(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new FormError("unreadable")); i.src = url; });
    const { w, h } = fitWidth(img.naturalWidth, img.naturalHeight, WIDTH);
    if (!w) throw new FormError("unreadable");
    const { c, ctx } = newCanvas(w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return [{ blob: await toJpeg(c), w, h }];
  } finally { URL.revokeObjectURL(url); }
}

async function pdfPages(file) {
  const pdfjs = await import("pdfjs-dist/build/pdf.min.mjs");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  let doc;
  try { doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; } catch { throw new FormError("unreadable"); }
  if (doc.numPages > 2) throw new FormError("tooMany");
  const pages = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = WIDTH / base.width;
    const vp = page.getViewport({ scale });
    const w = Math.round(vp.width), h = Math.round(vp.height);
    const { c, ctx } = newCanvas(w, h);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    pages.push({ blob: await toJpeg(c), w, h });
  }
  return pages;
}

// File -> [{ blob, w, h }] (one or two pages). Throws FormError with a code the screen turns into a message.
export async function fileToPages(file) {
  if (!file) throw new FormError("unreadable");
  if (file.size > MAX_FILE) throw new FormError("tooBig");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isImage = /^image\/(jpeg|png)$/.test(file.type) || /\.(jpe?g|png)$/i.test(file.name);
  if (!isPdf && !isImage) throw new FormError("unreadable");
  const pages = isPdf ? await pdfPages(file) : await imagePages(file);
  if (pages.some((p) => p.blob.size > MAX_PAGE)) throw new FormError("imageTooBig");
  return pages;
}

// Uploads the page images under this template's own folder. Returns the layout's pages: [{ path, w, h }].
export async function uploadPages(templateId, pages) {
  const stamp = Math.random().toString(36).slice(2, 8);
  const out = [];
  for (let i = 0; i < pages.length; i += 1) {
    const path = `${templateId}/${stamp}-p${i + 1}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, pages[i].blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw new FormError("upload");
    out.push({ path, w: pages[i].w, h: pages[i].h });
  }
  return out;
}

// Short-lived links to the page images: Map(path -> url). The bucket is private, so a link only works for a signed-in user.
export async function signedUrls(paths) {
  const unique = [...new Set(paths)];
  if (!unique.length) return new Map();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unique, 3600);
  if (error || !data) throw new FormError("signed");
  return new Map(data.map((d) => [d.path, d.signedUrl]));
}

// Waits until every page image is really loaded (printing before that gives a blank background).
export function imagesReady(container) {
  const imgs = [...(container?.querySelectorAll("img") ?? [])];
  return Promise.all(imgs.map((i) => (i.complete && i.naturalWidth ? Promise.resolve() : new Promise((res) => { i.onload = res; i.onerror = res; }))));
}
