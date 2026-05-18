// Mobile (Capacitor): SPA mode — no server available
// Web (Cloudflare): SSR mode — server-side rendering
const isMobile = import.meta.env.VITE_BUILD_TARGET === 'mobile';

export const prerender = false;
export const ssr = !isMobile;
