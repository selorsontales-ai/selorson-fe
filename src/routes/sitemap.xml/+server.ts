import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const baseUrl = 'https://selorson.com';

	const pages = [
		{ url: '/', priority: 1.0 },
		{ url: '/stories', priority: 0.9 },
		{ url: '/videos', priority: 0.8 },
		{ url: '/music', priority: 0.8 },
		{ url: '/library', priority: 0.7 },
		{ url: '/about', priority: 0.6 },
	];

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
	.map(
		(p) => `  <url>
    <loc>${baseUrl}${p.url}</loc>
    <changefreq>weekly</changefreq>
    <priority>${p.priority}</priority>
  </url>`
	)
	.join('\n')}
</urlset>`;

	return new Response(sitemap.trim(), {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=3600',
		},
	});
};
