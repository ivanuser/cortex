export function buildControlUiCspHeader(): string {
  // Cortex UI (SvelteKit): needs inline scripts for hydration,
  // external fonts (Google Fonts), and flexible connectivity.
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' ws: wss: https:",
  ].join("; ");
}
