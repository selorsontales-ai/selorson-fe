import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { summarizeStudioSyncIssues } from '../src/lib/world/studio-sync-report.ts';

test('summarizeStudioSyncIssues: gom lỗi và cảnh báo thành dòng đọc được', () => {
	const r = summarizeStudioSyncIssues({
		errors: [{ kind: 'location', item: 'Eryndor', asset: 'desktop_pack', message: 'ngoài vùng' }],
		warnings: [{ kind: 'chunk', item: 'c1', asset: 'preview_gallery', message: 'không tìm thấy' }]
	});
	assert.deepEqual(r.errors, ['location Eryndor · desktop_pack: ngoài vùng']);
	assert.deepEqual(r.warnings, ['chunk c1 · preview_gallery: không tìm thấy']);
});

test('summarizeStudioSyncIssues: dữ liệu thiếu/sai kiểu không làm vỡ', () => {
	assert.deepEqual(summarizeStudioSyncIssues(undefined), { errors: [], warnings: [] });
	assert.deepEqual(summarizeStudioSyncIssues({ errors: 'x', warnings: [null, 1] }), { errors: [], warnings: [] });
});

test('trang admin/world đọc báo cáo và hiện lỗi/cảnh báo', () => {
	const src = fs.readFileSync(new URL('../src/routes/(app)/admin/world/+page.svelte', import.meta.url), 'utf8');
	assert.match(src, /summarizeStudioSyncIssues\(/);
	assert.match(src, /syncReport/);
});
