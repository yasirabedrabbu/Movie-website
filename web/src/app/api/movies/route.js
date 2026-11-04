import { NextResponse } from "next/server";
import { listMovies } from "@/lib/movies";

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  try {
    const result = await listMovies({
      category: params.get("category") || "All",
      query: (params.get("q") || "").slice(0, 100),
      page: Number(params.get("page")) || 1,
      sort: params.get("sort") || "default",
      quality: params.get("quality") || "All",
      lang: params.get("lang") || "All",
      decade: params.get("decade") || "All",
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Movie data is unavailable" }, { status: 500 });
  }
}