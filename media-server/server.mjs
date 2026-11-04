import http from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(resolve(__dirname, "../web/.env")); } catch {}

const PORT = Number(process.env.MEDIA_SERVER_PORT) || 4000;
const BASE = (process.env.MEDIA_BASE_URL || "").replace(/\/+$/, "");
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
const CACHE_DIR = resolve(__dirname, ".subcache");

const TEXT_SUBS = ["subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "text"];

if (!BASE) {
  console.error("MEDIA_BASE_URL is missing in web/.env");
  process.exit(1);
}

// Collect raw bytes first, decode once: keeps Hindi/Bangla text intact.
function run(cmd, args) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args);
    const out = [];
    const err = [];
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => err.push(d));
    p.on("error", fail);
    p.on("close", (code) => {
      if (code === 0) ok(Buffer.concat(out).toString("utf8"));
      else fail(new Error(Buffer.concat(err).toString("utf8").slice(-300) || `exit ${code}`));
    });
  });
}

const probeCache = new Map();

async function probe(src) {
  if (probeCache.has(src)) return probeCache.get(src);
  const out = await run(FFPROBE, [
    "-v", "error", "-print_format", "json", "-show_format", "-show_streams", src,
  ]);
  const j = JSON.parse(out);
  const streams = j.streams || [];
  const v = streams.find((s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1);
  const audio = streams
    .filter((s) => s.codec_type === "audio")
    .map((s, i) => ({
      index: i,
      codec: s.codec_name,
      channels: s.channels || null,
      lang: s.tags?.language || null,
      title: s.tags?.title || null,
    }));
  // index = position among ALL subtitle streams (what ffmpeg's 0:s:N means)
  const subs = streams
    .filter((s) => s.codec_type === "subtitle")
    .map((s, i) => ({
      index: i,
      codec: s.codec_name,
      lang: s.tags?.language || null,
      title: s.tags?.title || null,
      text: TEXT_SUBS.includes(s.codec_name),
    }))
    .filter((s) => s.text);
  const ext = src.split("?")[0].split(".").pop().toLowerCase();
  const video = v
    ? { codec: v.codec_name, pixFmt: v.pix_fmt || "", width: v.width, height: v.height }
    : null;
  const copyable = Boolean(video) && video.codec === "h264" && !video.pixFmt.includes("10");
  const info = {
    duration: Number(j.format?.duration) || 0,
    video,
    audio,
    subs,
    copyable,
    directPlay:
      ["mp4", "m4v"].includes(ext) &&
      copyable &&
      audio.length <= 1 &&
      (audio.length === 0 || ["aac", "mp3"].includes(audio[0].codec)),
  };
  probeCache.set(src, info);
  return info;
}

// Subtitles -> WebVTT. Cached on disk so a big MKV is only read once.
const subJobs = new Map();

async function getSubtitle(src, index, external) {
  const key = createHash("sha1").update(`${src}|${external ? "x" : index}`).digest("hex");
  const file = resolve(CACHE_DIR, `${key}.vtt`);
  try {
    return await readFile(file, "utf8");
  } catch {}
  if (subJobs.has(key)) return subJobs.get(key);

  const job = (async () => {
    const args = ["-hide_banner", "-loglevel", "error", "-i", src];
    if (!external) args.push("-map", `0:s:${index}`);
    args.push("-f", "webvtt", "pipe:1");
    const vtt = await run(FFMPEG, args);
    if (!vtt.includes("-->")) throw new Error("This subtitle track is empty");
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, vtt);
    return vtt;
  })().finally(() => subJobs.delete(key));

  subJobs.set(key, job);
  return job;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function stream(req, res, url, src) {
  const info = await probe(src);
  const audio = Math.max(0, Number(url.searchParams.get("audio")) || 0);
  const start = Math.max(0, Number(url.searchParams.get("start")) || 0);
  const forceTranscode = url.searchParams.get("mode") === "transcode";
  const copy = info.copyable && !forceTranscode;

  const args = ["-hide_banner", "-loglevel", "error", "-fflags", "+genpts"];
  if (start > 0) args.push("-ss", String(start));
  args.push("-i", src, "-map", "0:v:0", "-map", `0:a:${audio}?`, "-sn", "-dn");

  if (copy) {
    args.push("-c:v", "copy");
  } else {
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p");
  }

  args.push(
    "-c:a", "aac", "-b:a", "192k", "-ac", "2",
    "-avoid_negative_ts", "make_zero",
    "-max_muxing_queue_size", "1024",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4", "pipe:1"
  );

  const p = spawn(FFMPEG, args);
  const errChunks = [];
  p.stderr.on("data", (d) => errChunks.push(d));
  const errText = () => Buffer.concat(errChunks).toString("utf8").slice(-300);

  p.on("error", (e) => {
    if (!res.headersSent) sendJson(res, 500, { error: `ffmpeg failed to start: ${e.message}` });
    else res.end();
  });

  p.stdout.on("data", (chunk) => {
    if (!res.headersSent) {
      res.writeHead(200, { "Content-Type": "video/mp4", "Cache-Control": "no-store" });
    }
    if (!res.write(chunk)) {
      p.stdout.pause();
      res.once("drain", () => p.stdout.resume());
    }
  });

  p.on("close", (code) => {
    if (!res.headersSent) sendJson(res, 502, { error: errText() || `ffmpeg exit ${code}` });
    else res.end();
  });

  res.on("close", () => p.kill("SIGKILL"));
  console.log(`[stream] ${copy ? "copy" : "transcode"} audio=${audio} start=${start}s  ${decodeURIComponent(src.split("/").pop())}`);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Range");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/health") return sendJson(res, 200, { ok: true });

  const src = url.searchParams.get("src") || "";
  if (!src.startsWith(`${BASE}/`)) return sendJson(res, 403, { error: "Source not allowed" });

  try {
    if (url.pathname === "/info") return sendJson(res, 200, await probe(src));
    if (url.pathname === "/stream") return await stream(req, res, url, src);
    if (url.pathname === "/sub") {
      const external = url.searchParams.get("external") === "1";
      const index = Math.max(0, Number(url.searchParams.get("index")) || 0);
      console.log(`[sub] ${external ? "external" : `embedded #${index}`}  ${decodeURIComponent(src.split("/").pop())}`);
      const vtt = await getSubtitle(src, index, external);
      res.writeHead(200, {
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      });
      return res.end(vtt);
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (e) {
    console.warn(`[error] ${e.message}`);
    if (!res.headersSent) sendJson(res, 502, { error: e.message });
    else res.end();
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Media server running on http://localhost:${PORT}`);
  console.log(`Allowed source: ${BASE}`);
});