/**
 * Vercel Edge Middleware — canonical host redirect.
 *
 * Single source of truth: the CANONICAL_HOST environment variable.
 * If the incoming hostname does not match CANONICAL_HOST, the request is
 * 308-redirected to the canonical origin, preserving path and query string.
 *
 * This replaces the static "redirects" block that was previously in
 * vercel.json and eliminates the possibility of a redirect loop caused by
 * conflicting Vercel Domain settings and vercel.json rules.
 *
 * Setup:
 *   1. Set CANONICAL_HOST in Vercel Dashboard → Settings → Environment Variables
 *      Example: CANONICAL_HOST=www.hauntedx.trade
 *   2. Make sure the same domain is set as "Primary Domain" in Vercel Domains.
 *   3. (Optional) Set ORIGIN_HOST to the reverse-proxy origin hostname
 *      (e.g. origin.hauntedx.trade for bunny.net CDN). Requests arriving on
 *      this host will NOT be redirected, preventing redirect loops.
 */

export default function middleware(request) {
  const canonicalHost = process.env.CANONICAL_HOST;

  // If CANONICAL_HOST is not configured, skip redirect logic entirely
  if (!canonicalHost) {
    return;
  }

  const url = new URL(request.url);

  // Never redirect API routes (safety net in case matcher doesn't catch all)
  if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
    return;
  }

  // Never redirect local development
  if (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname.endsWith(".localhost")
  ) {
    return;
  }

  // Never redirect Vercel preview deployments (must be exact *.vercel.app, not subdomain spoofing)
  if (url.hostname === "vercel.app" || (url.hostname.endsWith(".vercel.app") && !url.hostname.includes(".vercel.app."))) {
    return;
  }

  // Never redirect the reverse-proxy origin host (e.g. bunny.net CDN upstream).
  // Without this exception, requests from the CDN to origin.hauntedx.trade
  // would be 308-redirected to the canonical host, causing a redirect loop.
  const originHost = process.env.ORIGIN_HOST;
  if (originHost && url.hostname === originHost) {
    return;
  }

  // Redirect only when hostname differs from the canonical one
  if (url.hostname !== canonicalHost) {
    url.hostname = canonicalHost;
    return Response.redirect(url.toString(), 308);
  }
}

export const config = {
  // Only run on page routes — exclude API, static assets, and internal Next.js routes
  matcher: [
    "/((?!api|_next/static|_next/image|_next/data|favicon\\.ico|assets|manifest\\.json|robots\\.txt|sitemap\\.xml).*)",
  ],
};
