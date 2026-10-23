export interface MangaPanelMeta {
	speaker?: string;
	dialogue?: string;
	caption?: string;
}

export interface MangaPageItem {
	id?: number;
	page_number: number;
	cloudinary_url: string;
	cloudinary_public_id?: string;
	filename?: string;
	width?: number;
	height?: number;
	caption?: string;
	panels?: MangaPanelMeta[];
}

export interface MangaConfigBlock {
	id: string;
	type: 'manga_config';
	manga_status: 'draft' | 'published';
	reading_mode: 'vertical' | 'paged';
	aspect_ratio: string;
	style: string;
	pages: MangaPageItem[];
	color_pages: MangaPageItem[];
	bw_pages: MangaPageItem[];
}

function parseMangaPageList(rawList: unknown): MangaPageItem[] {
	if (!Array.isArray(rawList)) return [];
	return rawList
		.filter((p) => {
			if (!p || typeof p !== 'object') return false;
			const url = p.cloudinary_url || p.image_url || p.url;
			return typeof url === 'string' && url.trim().length > 0;
		})
		.map((p, idx) => {
			const url = String(p.cloudinary_url || p.image_url || p.url);
			return {
				id: typeof p.id === 'number' ? p.id : undefined,
				page_number: Number(p.page_number) || idx + 1,
				cloudinary_url: url,
				cloudinary_public_id: typeof p.cloudinary_public_id === 'string' ? p.cloudinary_public_id : '',
				filename: typeof p.filename === 'string' ? p.filename : `Trang ${idx + 1}`,
				width: Number(p.width) || undefined,
				height: Number(p.height) || undefined,
				caption: typeof p.caption === 'string' ? p.caption : '',
				panels: Array.isArray(p.panels) ? p.panels : []
			};
		});
}

export function extractMangaConfig(blocks: unknown): MangaConfigBlock | null {
	if (!Array.isArray(blocks)) return null;
	const found = blocks.find(
		(b) => b && typeof b === 'object' && (b as Record<string, unknown>).type === 'manga_config'
	) as Record<string, unknown> | undefined;
	if (!found) return null;

	const style = typeof found.style === 'string' ? found.style : '';
	const legacyPages = parseMangaPageList(found.pages);
	let colorPages = parseMangaPageList(found.color_pages);
	let bwPages = parseMangaPageList(found.bw_pages);

	if (colorPages.length === 0 && bwPages.length === 0 && legacyPages.length > 0) {
		if (style.toLowerCase().includes('bw')) {
			bwPages = legacyPages;
		} else {
			colorPages = legacyPages;
		}
	}

	const primaryPages = colorPages.length > 0 ? colorPages : bwPages.length > 0 ? bwPages : legacyPages;

	return {
		id: typeof found.id === 'string' ? found.id : 'manga-cfg',
		type: 'manga_config',
		manga_status: found.manga_status === 'published' ? 'published' : 'draft',
		reading_mode: found.reading_mode === 'paged' ? 'paged' : 'vertical',
		aspect_ratio: typeof found.aspect_ratio === 'string' ? found.aspect_ratio : '2:3',
		style,
		pages: primaryPages,
		color_pages: colorPages,
		bw_pages: bwPages
	};
}
