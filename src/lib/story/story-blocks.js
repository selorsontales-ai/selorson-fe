/**
 * Chuẩn hoá và tính hình học cho `content_blocks` của chương truyện.
 *
 * Trình đọc và ô "Xem thử" trong trình soạn thảo đều render từ đây, nên mọi
 * quy tắc về bố cục, góc xoay và định dạng inline chỉ tồn tại ở một chỗ.
 *
 * Về góc xoay: `transform: rotate()` không đổi hộp bố cục của ảnh, nên ảnh
 * nghiêng sẽ tràn ra ngoài và đè lên chữ xung quanh. Cách xử lý ở đây là dựng
 * một khung (frame) có đúng kích thước hộp bao của ảnh sau khi xoay, rồi đặt
 * ảnh vào giữa khung. Khung mới là thứ chiếm chỗ trong dòng chảy trang, nên
 * không còn gì đè lên chữ, và ảnh cũng không bị cắt.
 */

/** Tỉ lệ khung hình mặc định khi không biết kích thước thật của ảnh. */
export const DEFAULT_ASPECT = 3 / 2;

export const DEFAULT_LAYOUT = 'single-16-9';

export const IMAGE_LAYOUTS = [
	'single-1-1',
	'single-16-9',
	'single-9-16',
	'combo-2',
	'combo-2-overlap',
	'combo-3'
];

/**
 * Bố cục một hình ép ảnh về đúng tỉ lệ này (`object-fit: cover`).
 * Các bố cục combo giữ tỉ lệ gốc của từng ảnh.
 *
 * @type {Record<string, number | undefined>}
 */
const LAYOUT_ASPECT = {
	'single-1-1': 1,
	'single-16-9': 16 / 9,
	'single-9-16': 9 / 16
};

/** Thẻ inline được giữ lại trong nội dung đoạn văn. Phải khớp với danh sách ở `backend-v3/src/services/content_blocks.rs`. */
const INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'mark', 'sub', 'sup', 'br']);

const PAIRED_HOSTILE = /<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi;
const COMMENT = /<!--[\s\S]*?-->/g;
const DECLARATION = /<[!?][\s\S]*?>/g;
const TAG = /<(\/)?([a-zA-Z][a-zA-Z0-9]*)\b[^<>]*>/g;

/**
 * Giữ lại đúng các thẻ inline định dạng, escape mọi thứ còn lại.
 *
 * `&` được để nguyên: nguồn dữ liệu (innerHTML của contenteditable, và output
 * của ammonia phía backend) đều đã mã hoá sẵn, escape thêm lần nữa sẽ ra
 * `&amp;amp;` trên màn hình.
 *
 * @param {string} html
 * @returns {string}
 */
export function sanitizeInlineHtml(html) {
	if (typeof html !== 'string' || html === '') return '';

	const source = html.replace(PAIRED_HOSTILE, '').replace(COMMENT, '').replace(DECLARATION, '');

	let out = '';
	let cursor = 0;
	TAG.lastIndex = 0;

	/** @type {RegExpExecArray | null} */
	let match;
	while ((match = TAG.exec(source)) !== null) {
		out += escapeAngles(source.slice(cursor, match.index));
		cursor = TAG.lastIndex;

		const name = match[2].toLowerCase();
		if (!INLINE_TAGS.has(name)) continue; // thẻ lạ: bỏ thẻ, giữ nội dung bên trong
		if (name === 'br') {
			out += '<br />';
		} else {
			out += match[1] ? `</${name}>` : `<${name}>`;
		}
	}
	out += escapeAngles(source.slice(cursor));
	return out;
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeAngles(text) {
	return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * @param {unknown} value
 * @returns {number} góc xoay trong [0, 360)
 */
export function normalizeRotation(value) {
	const deg = Number(value);
	if (!Number.isFinite(deg)) return 0;
	return ((deg % 360) + 360) % 360;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeLayout(value) {
	return typeof value === 'string' && IMAGE_LAYOUTS.includes(value) ? value : DEFAULT_LAYOUT;
}

/**
 * Tỉ lệ khung hình mà ảnh thực sự hiển thị.
 *
 * @param {string} layout
 * @param {{ width?: number, height?: number }} image
 * @param {number} [measured] tỉ lệ đo được lúc ảnh load xong, dùng cho asset cũ thiếu kích thước
 * @returns {number}
 */
export function resolveAspect(layout, image, measured) {
	const forced = LAYOUT_ASPECT[normalizeLayout(layout)];
	if (forced) return forced;
	if (Number.isFinite(measured) && Number(measured) > 0) return Number(measured);

	const w = Number(image?.width);
	const h = Number(image?.height);
	if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return w / h;
	return DEFAULT_ASPECT;
}

/**
 * @param {number} value
 * @returns {number}
 */
function round(value) {
	return Math.round(value * 10000) / 10000;
}

/**
 * Kích thước khung bao quanh một ảnh đã xoay.
 *
 * Lấy ảnh chưa xoay làm đơn vị: bề rộng 1, chiều cao `1 / aspect`. Xoay góc θ
 * thì hộp bao có bề rộng `|cosθ| + |sinθ|/a` và chiều cao `|sinθ| + |cosθ|/a`.
 * Khung được đặt rộng bằng cột chữ, còn ảnh bên trong được thu theo tỉ lệ
 * `1 / bề rộng hộp bao` để hộp bao vừa khít khung — không tràn, không cắt.
 *
 * Khi góc xoay bằng 0 thì `frameAspect === aspect` và `imageWidthPct === 100`,
 * tức là kết quả trùng khớp với cách hiển thị cũ.
 *
 * @param {number} aspect
 * @param {unknown} rotation
 * @returns {{ deg: number, aspect: number, frameAspect: number, imageWidthPct: number }}
 */
export function rotatedFrame(aspect, rotation) {
	const a = Number.isFinite(aspect) && Number(aspect) > 0 ? Number(aspect) : DEFAULT_ASPECT;
	const deg = normalizeRotation(rotation);
	const rad = (deg * Math.PI) / 180;
	const cos = Math.abs(Math.cos(rad));
	const sin = Math.abs(Math.sin(rad));

	const boxWidth = cos + sin / a;
	const boxHeight = sin + cos / a;

	return {
		deg: round(deg),
		aspect: round(a),
		frameAspect: round(boxWidth / boxHeight),
		imageWidthPct: round(100 / boxWidth)
	};
}

/**
 * Hệ số thu nhỏ để ảnh đã xoay nằm gọn trong một ô có sẵn tỉ lệ cố định.
 *
 * Dùng cho lưới thumbnail trong trình soạn thảo, nơi ô giữ nguyên tỉ lệ theo
 * bố cục nên không thể co giãn theo góc xoay như khung của trình đọc.
 *
 * @param {number} tileAspect tỉ lệ của ô chứa
 * @param {unknown} rotation
 * @returns {number} hệ số scale trong (0, 1]
 */
export function fitScaleInTile(tileAspect, rotation) {
	const t = Number.isFinite(tileAspect) && Number(tileAspect) > 0 ? Number(tileAspect) : DEFAULT_ASPECT;
	const rad = (normalizeRotation(rotation) * Math.PI) / 180;
	const cos = Math.abs(Math.cos(rad));
	const sin = Math.abs(Math.sin(rad));

	const boxWidth = cos + sin / t;
	const boxHeight = sin + cos / t;
	return round(Math.min(1, 1 / boxWidth, 1 / t / boxHeight));
}

/**
 * @typedef {{ url: string, alt: string, width?: number, height?: number }} StoryImage
 * @typedef {{ key: string, type: 'paragraph', html: string }} ParagraphBlock
 * @typedef {{ key: string, type: 'image', layout: string, rotation: number, caption: string, images: StoryImage[] }} ImageBlock
 */

/**
 * Ép mảng block thô từ API về đúng cấu trúc mà `StoryContent.svelte` render.
 *
 * Backend đã làm sạch từ lúc ghi, nhưng chương lưu trước bản vá này thì chưa,
 * nên bước làm sạch được lặp lại ở client trước khi đưa vào `{@html}`.
 *
 * @param {unknown} raw
 * @returns {(ParagraphBlock | ImageBlock)[]}
 */
export function normalizeBlocks(raw) {
	if (!Array.isArray(raw)) return [];

	/** @type {(ParagraphBlock | ImageBlock)[]} */
	const blocks = [];

	raw.forEach((item, index) => {
		if (!item || typeof item !== 'object') return;
		const key = typeof item.id === 'string' || typeof item.id === 'number' ? String(item.id) : `b${index}`;

		if (item.type === 'image') {
			const images = Array.isArray(item.images)
				? item.images
						.filter(
							/** @param {any} img */
							(img) => img && typeof img.cloudinary_url === 'string' && img.cloudinary_url !== ''
						)
						.map(
							/** @param {any} img */
							(img) => ({
								url: img.cloudinary_url,
								alt: typeof img.filename === 'string' ? img.filename : '',
								width: Number(img.width) || undefined,
								height: Number(img.height) || undefined
							})
						)
				: [];
			if (images.length === 0) return; // khối hình rỗng thì không chiếm chỗ trong trang đọc

			blocks.push({
				key,
				type: 'image',
				layout: normalizeLayout(item.layout),
				rotation: normalizeRotation(item.rotation),
				caption: typeof item.caption === 'string' ? item.caption : '',
				images
			});
			return;
		}

		// Loại block lạ thì bỏ hẳn, giống cách backend xử lý.
		if (item.type !== undefined && item.type !== 'paragraph') return;

		// Đoạn trống được giữ nguyên: nhiều chương dùng nó làm khoảng ngắt cảnh.
		const rawContent = typeof item.content === 'string' ? item.content : '';
		const trimmed = rawContent.trim();
		if (/^(?:\*\s*\*\s*\*+|-\s*-\s*-+|_\s*_\s*_+)\s*$/.test(trimmed)) return;
		let mdCleaned = rawContent;
		const hMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
		if (hMatch) {
			const hText = hMatch[2].replace(/\*\*/g, '').replace(/\*/g, '').trim();
			if (hMatch[1].length === 1 || !hText) return;
			mdCleaned = `<b>${hText}</b>`;
		} else if (trimmed) {
			mdCleaned = trimmed
				.replace(/^>\s*/gm, '')
				.replace(/\*\*\*([^*]+?)\*\*\*/g, '<i>$1</i>')
				.replace(/\*\*([^*]+?)\*\*/g, '$1')
				.replace(/__([^_]+?)__/g, '$1')
				.replace(/\*([^*\n]+?)\*/g, '<i>$1</i>')
				.replace(/~~([^~\n]+?)~~/g, '<s>$1</s>')
				.replace(/\*\*/g, '');
		}
		const html = sanitizeInlineHtml(mdCleaned);
		blocks.push({ key, type: 'paragraph', html });
	});

	return blocks;
}
