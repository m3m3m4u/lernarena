import path from "path";
import fs from "fs/promises";

// Serve files from the local `isostadt` folder via /arena/isostadt/static/**
// This keeps the game isolated to the Arena area without copying assets to /public.

export const runtime = "nodejs";
const ROOT = path.resolve(process.cwd(), "isostadt");

const contentTypeByExt: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function withinRoot(p: string) {
  const rel = path.relative(ROOT, p);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function readFileSafe(filePath: string) {
  try {
    return await fs.readFile(filePath);
  } catch (e: any) {
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) return null;
    throw e;
  }
}

function injectBaseAndCss(html: string, basePath: string) {
  // Inject <base> for relative asset URLs
  let out = html;
  if (!/\<base\s+/i.test(out)) {
    out = out.replace(
      /<head(\s[^>]*)?>/i,
      (m) => `${m}\n<base href="${basePath}/">`
    );
  }
  // Inject CSS to disable scrolling inside the iframe
  const css = `
    <style id="arena-isostadt-overrides">
      html, body { height: 100%; overflow: hidden; }
      #main { height: 100%; }
      #area { overflow: hidden !important; }
    </style>`;
  if (!/id=["']arena-isostadt-overrides["']/.test(out)) {
    out = out.replace(
      /<head(\s[^>]*)?>/i,
      (m) => `${m}\n${css}`
    );
  }
  return out;
}

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { slug?: string[] } }) {
  const slugArr = ctx.params.slug ?? [];
  const relPath = slugArr.length === 0 ? "index.html" : slugArr.join("/");
  const absPath = path.resolve(ROOT, relPath);

  if (!withinRoot(absPath)) {
    return new Response("Forbidden", { status: 403 });
  }

  const data = await readFileSafe(absPath);
  if (!data) return new Response("Not Found", { status: 404 });

  const ext = path.extname(absPath).toLowerCase();
  let body: BodyInit;
  let type = contentTypeByExt[ext] || "application/octet-stream";

  if (ext === ".html") {
    const html = data.toString("utf-8");
    body = injectBaseAndCss(html, "/arena/isostadt/static");
    type = contentTypeByExt[".html"];
  } else {
    // Convert Buffer slice to a clean ArrayBuffer for Response
    const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    body = ab as ArrayBuffer;
  }

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": type, "Cache-Control": "no-store" },
  });
}
