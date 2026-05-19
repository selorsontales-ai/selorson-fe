<script lang="ts">
	import AdminCrudTable from '$lib/components/admin/AdminCrudTable.svelte';
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import { adminGet, adminPost, adminPut, adminDelete, toast_success, toast_error } from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';

	let items = $state<Record<string, unknown>[]>([]);
	let showForm = $state(false);
	let editing = $state<Record<string, unknown> | null>(null);

	let form = $state({
		video_name: '',
		video_path: '',
		description: '',
		thumbnail_path: '',
		video_type: 'main' as 'main' | 'side' | 'filler',
		episode_number: null as number | null,
		is_featured: false,
		display_order: 0,
	});

	// Auto-detect YouTube/Vimeo from video_path
	let detectedSource = $derived.by(() => {
		const p = form.video_path;
		if (!p) return '';
		if (/(?:youtube\.com|youtu\.be)/i.test(p)) return 'youtube';
		if (/vimeo\.com/i.test(p)) return 'vimeo';
		return p ? 'unknown' : '';
	});

	const columns = [
		{ key: 'id', label: 'ID' },
		{ key: 'video_name', label: 'Tên Video' },
		{ key: 'video_type', label: 'Loại' },
		{ key: 'episode_number', label: 'Tập' },
		{ key: 'is_featured', label: 'Nổi bật', type: 'boolean' as const },
		{ key: 'display_order', label: 'Thứ tự' },
	];

	async function fetchItems() {
		try {
			const r = await adminGet<Record<string, unknown>[]>('/admin/videos');
			if (r.success) items = r.data;
		} catch { /* empty */ }
	}

	function openCreate() {
		editing = null;
		form = {
			video_name: '', video_path: '', description: '', thumbnail_path: '',
			video_type: 'main', episode_number: null,
			is_featured: false, display_order: 0,
		};
		showForm = true;
	}

	function openEdit(item: Record<string, unknown>) {
		editing = item;
		form = {
			video_name: (item.video_name as string) ?? '',
			video_path: (item.video_path as string) ?? '',
			description: (item.description as string) ?? '',
			thumbnail_path: (item.thumbnail_path as string) ?? '',
			video_type: (item.video_type as 'main' | 'side' | 'filler') ?? 'main',
			episode_number: (item.episode_number as number) ?? null,
			is_featured: !!(item.is_featured),
			display_order: (item.display_order as number) ?? 0,
		};
		showForm = true;
	}

	async function saveItem() {
		try {
			if (editing) {
				await adminPut(`/admin/videos/${editing.id}`, form);
				toast_success('Cập nhật thành công!');
			} else {
				await adminPost('/admin/videos', form);
				toast_success('Tạo mới thành công!');
			}
			showForm = false;
			fetchItems();
		} catch { toast_error('Có lỗi xảy ra.'); }
	}

	async function deleteItem(item: Record<string, unknown>) {
		if (!confirm('Bạn chắc chắn muốn xóa video này?')) return;
		try {
			await adminDelete(`/admin/videos/${item.id}`);
			toast_success('Đã xóa.');
			fetchItems();
		} catch { toast_error('Không thể xóa.'); }
	}

	onMount(fetchItems);
</script>

<svelte:head><title>Admin - Videos</title></svelte:head>

<AdminCrudTable title="🎬 Quản lý Videos" {columns} {items} showCreate showActions showDelete oncreate={openCreate} onedit={openEdit} ondelete={deleteItem} />

<AdminModal bind:open={showForm} title={editing ? 'Chỉnh sửa Video' : 'Tạo Video mới'}>
	<form onsubmit={(e) => { e.preventDefault(); saveItem(); }} class="video-form">
		<input bind:value={form.video_name} placeholder="Tên Video" required />

		<input bind:value={form.video_path} placeholder="URL Video (YouTube / Vimeo / trực tiếp)" required />
		{#if detectedSource}
			<p class="source-hint">
				{detectedSource === 'youtube' ? '▶ YouTube — Thumbnail sẽ được tự động lấy' : detectedSource === 'vimeo' ? '▶ Vimeo' : '⚠ Không nhận diện nguồn'}
			</p>
		{/if}

		<input bind:value={form.thumbnail_path} placeholder="URL Thumbnail (bỏ trống = tự lấy từ YouTube)" />

		<textarea bind:value={form.description} placeholder="Mô tả" rows="3"></textarea>

		<div class="form-row-2">
			<div class="form-group">
				<label class="form-label">Loại video</label>
				<select bind:value={form.video_type}>
					<option value="main">📺 Chính</option>
					<option value="side">📘 Ngoại truyện</option>
					<option value="filler">🎭 Filler</option>
				</select>
			</div>
			<div class="form-group">
				<label class="form-label">Số tập</label>
				<input bind:value={form.episode_number} placeholder="VD: 1, 2, 3..." type="number" min="0" />
			</div>
		</div>

		<div class="form-row-2">
			<label class="checkbox-label">
				<input type="checkbox" bind:checked={form.is_featured} />
				<span>⭐ Nổi bật (hiển thị trang chủ)</span>
			</label>
			<div class="form-group">
				<label class="form-label">Thứ tự hiển thị</label>
				<input bind:value={form.display_order} type="number" />
			</div>
		</div>

		{#if form.is_featured}
			<div class="featured-warning">
				⚠ Chỉ có 1 video nổi bật. Video nổi bật cũ sẽ tự động bị gỡ.
			</div>
		{/if}

		<div class="form-actions">
			<button type="button" class="btn-cancel" onclick={() => showForm = false}>Hủy</button>
			<button type="submit" class="btn-save">💾 {editing ? 'Cập nhật' : 'Tạo'}</button>
		</div>
	</form>
</AdminModal>

<style>
	.video-form { display: flex; flex-direction: column; gap: 0.75rem; }
	.video-form input, .video-form textarea, .video-form select {
		padding: 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-md);
		font-size: 0.875rem; font-family: inherit; background: var(--color-surface-200); color: var(--color-text-primary);
		width: 100%; box-sizing: border-box;
	}
	.video-form input:focus, .video-form textarea:focus, .video-form select:focus { outline: none; border-color: var(--color-brand-500); }

	.form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; align-items: start; }
	.form-group { display: flex; flex-direction: column; gap: 0.25rem; }
	.form-label { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); }

	.checkbox-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--color-text-primary); cursor: pointer; }
	.checkbox-label input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--color-brand-500); }

	.source-hint {
		margin: -0.25rem 0 0; padding: 0.375rem 0.75rem;
		background: rgba(12,113,61,0.08); border-radius: var(--radius-sm);
		font-size: 0.75rem; font-weight: 600; color: var(--color-brand-500);
	}

	.featured-warning {
		padding: 0.5rem 0.75rem; background: rgba(245,158,11,0.08);
		border: 1px solid rgba(245,158,11,0.2); border-radius: var(--radius-md);
		font-size: 0.8125rem; color: #b45309;
	}

	.form-actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 0.5rem; }
	.btn-cancel { padding: 0.625rem 1.25rem; background: var(--color-surface-200); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-weight: 600; cursor: pointer; }
	.btn-cancel:hover { background: var(--color-surface-300); }
	.btn-save { padding: 0.625rem 1.25rem; background: linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600)); color: #fff; border: none; border-radius: var(--radius-md); font-weight: 600; cursor: pointer; transition: all 0.2s; }
	.btn-save:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(12,113,61,0.3); }

	@media (max-width: 768px) {
		.form-row-2 { grid-template-columns: 1fr; }
	}
</style>
