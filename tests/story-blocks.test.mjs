import assert from 'node:assert/strict';
import test from 'node:test';

import {
	fitScaleInTile,
	normalizeBlocks,
	normalizeLayout,
	normalizeRotation,
	resolveAspect,
	rotatedFrame,
	sanitizeInlineHtml
} from '../src/lib/story/story-blocks.js';

test('khung không xoay giữ nguyên cách hiển thị cũ', () => {
	const frame = rotatedFrame(16 / 9, 0);
	assert.equal(frame.deg, 0);
	assert.equal(frame.frameAspect, 1.7778);
	assert.equal(frame.imageWidthPct, 100);
});

test('khung xoay bao trọn hộp bao của ảnh, không tràn không cắt', () => {
	for (const aspect of [1, 16 / 9, 9 / 16, 3 / 2]) {
		for (const deg of [7, 15, 45, 90, 137, 210, 359]) {
			const frame = rotatedFrame(aspect, deg);
			const rad = (deg * Math.PI) / 180;
			const cos = Math.abs(Math.cos(rad));
			const sin = Math.abs(Math.sin(rad));

			// Lấy bề rộng khung = 1. Ảnh rộng imageWidthPct/100, cao thêm 1/aspect.
			const imageWidth = frame.imageWidthPct / 100;
			const imageHeight = imageWidth / aspect;
			const boxWidth = imageWidth * cos + imageHeight * sin;
			const boxHeight = imageWidth * sin + imageHeight * cos;
			const frameHeight = 1 / frame.frameAspect;

			assert.ok(Math.abs(boxWidth - 1) < 1e-3, `bề rộng lệch ở ${aspect} / ${deg}°`);
			assert.ok(Math.abs(boxHeight - frameHeight) < 1e-3, `chiều cao lệch ở ${aspect} / ${deg}°`);
		}
	}
});

test('ảnh vuông xoay 45 độ cho khung vuông và thu về 1/căn 2', () => {
	const frame = rotatedFrame(1, 45);
	assert.equal(frame.frameAspect, 1);
	assert.ok(Math.abs(frame.imageWidthPct - 70.7107) < 0.01);
});

test('góc xoay được đưa về khoảng [0, 360)', () => {
	assert.equal(normalizeRotation(-45), 315);
	assert.equal(normalizeRotation(360), 0);
	assert.equal(normalizeRotation(725), 5);
	assert.equal(normalizeRotation('không phải số'), 0);
	assert.equal(normalizeRotation(undefined), 0);
});

test('bố cục lạ rơi về mặc định', () => {
	assert.equal(normalizeLayout('combo-3'), 'combo-3');
	assert.equal(normalizeLayout('bố-cục-tự-chế'), 'single-16-9');
	assert.equal(normalizeLayout(undefined), 'single-16-9');
});

test('bố cục một hình ép tỉ lệ, bố cục ghép giữ tỉ lệ gốc của ảnh', () => {
	assert.equal(resolveAspect('single-1-1', { width: 1600, height: 900 }), 1);
	assert.equal(resolveAspect('combo-2', { width: 1600, height: 900 }), 1600 / 900);
	assert.equal(resolveAspect('combo-2', {}, 2), 2);
	assert.equal(resolveAspect('combo-2', {}), 1.5);
});

test('ảnh xoay trong ô thumbnail luôn nằm gọn trong ô', () => {
	assert.equal(fitScaleInTile(16 / 9, 0), 1);
	for (const deg of [10, 45, 90, 180, 270]) {
		const scale = fitScaleInTile(16 / 9, deg);
		assert.ok(scale > 0 && scale <= 1, `scale ngoài phạm vi ở ${deg}°`);
	}
	assert.ok(fitScaleInTile(1, 45) < fitScaleInTile(1, 5));
});

test('chỉ giữ thẻ định dạng inline, escape phần còn lại', () => {
	assert.equal(sanitizeInlineHtml('Xin <b>chào</b> <i>bạn</i>'), 'Xin <b>chào</b> <i>bạn</i>');
	assert.equal(sanitizeInlineHtml('<b onclick="x()">đậm</b>'), '<b>đậm</b>');
	assert.equal(sanitizeInlineHtml('<div>chữ</div>'), 'chữ');
	assert.equal(sanitizeInlineHtml('dòng<br/>mới'), 'dòng<br />mới');
});

test('không để lọt thẻ nguy hiểm, kể cả thẻ hở', () => {
	assert.equal(sanitizeInlineHtml('<script>alert(1)</script>an toàn'), 'an toàn');
	assert.equal(sanitizeInlineHtml('<img src=x onerror=alert(1)>'), '');
	// Thẻ không đóng thì phần còn lại phải bị escape, không được thành thẻ mới.
	assert.equal(sanitizeInlineHtml('<img src=x onerror=alert(1)'), '&lt;img src=x onerror=alert(1)');
	assert.equal(sanitizeInlineHtml('<!-- ghi chú -->chữ'), 'chữ');
});

test('không escape lại thực thể HTML có sẵn', () => {
	assert.equal(sanitizeInlineHtml('R&#7891;ng &amp; Thi&#7871;u n&#7919;'), 'R&#7891;ng &amp; Thi&#7871;u n&#7919;');
});

test('normalizeBlocks giữ góc xoay, giữ đoạn trống, bỏ khối hình rỗng', () => {
	const blocks = normalizeBlocks([
		{ id: 'p1', type: 'paragraph', content: 'Một đoạn' },
		{ id: 'p2', type: 'paragraph', content: '' },
		{ id: 'i1', type: 'image', layout: 'combo-2', rotation: -12, images: [] },
		{
			id: 'i2',
			type: 'image',
			layout: 'single-16-9',
			rotation: -12,
			caption: 'Dragon Girl',
			images: [{ cloudinary_url: 'https://cdn/a.png', filename: 'a.png', width: 1600, height: 900 }]
		},
		{ id: 'x', type: 'video', src: 'https://cdn/a.mp4' }
	]);

	assert.deepEqual(
		blocks.map((b) => b.key),
		['p1', 'p2', 'i2']
	);
	assert.equal(blocks[1].html, '');
	assert.equal(blocks[2].rotation, 348);
	assert.equal(blocks[2].caption, 'Dragon Girl');
	assert.equal(blocks[2].images[0].url, 'https://cdn/a.png');
});

test('normalizeBlocks chịu được đầu vào rác', () => {
	assert.deepEqual(normalizeBlocks(null), []);
	assert.deepEqual(normalizeBlocks('không phải mảng'), []);
	assert.deepEqual(normalizeBlocks([null, undefined, 42]), []);
});
