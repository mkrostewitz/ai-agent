export const dynamic = "force-dynamic";

export function GET(request) {
  const next = new URL(request.url).searchParams.get("next");
  const location = next ? `/admin?next=${encodeURIComponent(next)}` : "/admin";

  return new Response(null, {status: 307, headers: {Location: location}});
}
