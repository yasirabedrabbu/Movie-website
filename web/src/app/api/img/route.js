import { NextResponse } from "next/server";

// Only these hosts can be proxied (prevents SSRF). Comma-separated env override.
const ALLOWED = (process.env.IMG_ALLOW_HOSTS || "172.16.50.14")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function GET(req) {
  const raw = new URL(req.url).searchParams.get("u");
  let target;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("Bad url", { status: 400 });
  }
  if (!["http:", "https:"].includes(target.protocol) || !ALLOWED.includes(target.hostname)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const r = await fetch(target, { signal: AbortSignal.timeout(8000) });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.startsWith("image/")) {
      return new NextResponse("Not found", { status: 404 });
    }
    return new NextResponse(r.body, {
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse("Upstream error", { status: 502 });
  }
}