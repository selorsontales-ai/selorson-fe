<script lang="ts">
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import { adminGet, adminPost, adminPut, adminDelete, adminUpload, toast_success, toast_error } from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';

	interface Milestone { id: number; title: string; date: string; description: string; image_url: string | null; image_ratio: string; display_order: number; }

	let loading = $state(true); let saving = $state(false); let showModal = $state(false); let editingId = $state<number | null>(null);
	let uploadingImage = $state(false); let imageInput = $state<HTMLInputElement>();
	let items = $state<Milestone[]>([]);
	let form = $state({ title: '', date: '', description: '', image_url: '', image_ratio: '16:9', display_order: 0 });

	async function fetchItems() { loading = true; try { const r = await adminGet<Milestone[]>('/admin/milestones'); if (r.success) items = r.data ?? []; } catch {} finally { loading = false; } }
	function openCreate() { editingId = null; form = { title: '', date: '', description: '', image_url: '', image_ratio: '16:9', display_order: items.length }; showModal = true; }
	function openEdit(item: Milestone) { editingId = item.id; form = { title: item.title, date: item.date, description: item.description, image_url: item.image_url ?? '', image_ratio: item.image_ratio || '16:9', display_order: item.display_order }; showModal = true; }

	async function save() { saving = true; try { const p = { ...form, image_url: form.image_url || null }; if (editingId) { await adminPut(`/admin/milestones/${editingId}`, p); toast_success('Cập nhật!'); } else { await adminPost('/admin/milestones', p); toast_success('Tạo mới!'); } showModal = false; await fetchItems(); } catch { toast_error('Lỗi'); } finally { saving = false; } }
	async function remove(id: number) { if (!confirm('Xóa?')) return; try { await adminDelete(`/admin/milestones/${id}`); toast_success('Đã xóa!'); await fetchItems(); } catch { toast_error('Lỗi'); } }
	async function uploadImage(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; uploadingImage = true; try { const fd = new FormData(); fd.append('image', f); fd.append('folder', 'milestones'); const r = await adminUpload<{ url: string }>('/upload/image', fd); if (r.success) { form.image_url = r.data.url; toast_success('Upload OK!'); } } catch { toast_error('Upload lỗi'); } finally { uploadingImage = false; } }
	onMount(fetchItems);
</script>

<svelte:head><title>Admin - Cột Mốc</title></svelte:head>
<div class="admin-page">
	<div class="page-head"><h1>📅 Quản Lý Cột Mốc</h1><button class="btn-brand" onclick={openCreate}>+ Thêm mới</button></div>
	{#if loading}<p class="empty-text">Đang tải...</p>
	{:else}
		<div class="items-list">
			{#each items as item (item.id)}
				<div class="item-row">
					<div class="item-info">
						<span class="item-date">{item.date}</span>
						<strong>{item.title}</strong>
						<p>{item.description}</p>
						{#if item.image_url}<img src={item.image_url} alt="" class="item-thumb" />{/if}
					</div>
					<div class="actions"><button onclick={() => openEdit(item)}>✏️</button><button onclick={() => remove(item.id)}>🗑️</button></div>
				</div>
			{/each}
			{#if !items.length}<p class="empty-text">Chưa có cột mốc nào.</p>{/if}
		</div>
	{/if}
</div>
<AdminModal bind:open={showModal} title={editingId ? 'Sửa Cột Mốc' : 'Thêm Cột Mốc'}>
	<form onsubmit={(e) => { e.preventDefault(); save(); }}>
		<div class="field"><label>Tiêu đề *<input bind:value={form.title} required /></label></div>
		<div class="field"><label>Ngày (VD: Q1 2026) *<input bind:value={form.date} required /></label></div>
		<div class="field"><label>Mô tả *<textarea bind:value={form.description} rows="3" required></textarea></label></div>
		<div class="field"><label>Hình ảnh<div class="upload-row"><input type="file" bind:this={imageInput} accept="image/*" onchange={uploadImage} style="display:none" /><button type="button" class="btn-upload" onclick={() => imageInput?.click()}>{uploadingImage ? '⏳...' : '📤 Upload'}</button><input bind:value={form.image_url} placeholder="URL" /></div></label>{#if form.image_url}<img src={form.image_url} alt="" class="preview-thumb" style="aspect-ratio:{form.image_ratio.replace(':','/')}" />{/if}</div>
		<div class="field"><label>Kích thước<select bind:value={form.image_ratio}><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="4:3">4:3</option><option value="3:4">3:4</option><option value="1:1">1:1</option></select></label></div>
		<div class="field"><label>Thứ tự<input bind:value={form.display_order} type="number" /></label></div>
		<div class="form-actions"><button type="button" class="btn-cancel" onclick={() => showModal = false}>Hủy</button><button type="submit" class="btn-save" disabled={saving}>{saving ? '...' : 'Lưu'}</button></div>
	</form>
</AdminModal>
<style>
	.admin-page { max-width: 900px; }
	.page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
	.page-head h1 { font-size: 1.5rem; font-weight: 800; margin: 0; }
	.empty-text { text-align: center; padding: 2rem; color: var(--color-text-muted); }
	.items-list { display: flex; flex-direction: column; gap: .75rem; }
	.item-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 1rem 1.25rem; background: var(--color-surface-100); border-radius: var(--radius-lg); border: 1px solid rgba(255,255,255,.04); }
	:global(html[data-theme='light']) .item-row { background: #fff; border-color: rgba(0,0,0,.04); }
	.item-info { flex: 1; }
	.item-date { display: inline-block; padding: .125rem .5rem; border-radius: 1rem; background: rgba(12,113,61,.15); color: var(--color-brand-300); font-size: .7rem; font-weight: 700; margin-bottom: .25rem; }
	.item-info strong { display: block; margin-bottom: .25rem; }
	.item-info p { font-size: .8125rem; color: var(--color-text-secondary); margin: .25rem 0 0; }
	.item-thumb { width: 80px; height: 50px; object-fit: cover; border-radius: var(--radius-md); margin-top: .5rem; }
	.actions { display: flex; gap: .375rem; margin-left: 1rem; }
	.actions button { width: 32px; height: 32px; border: none; border-radius: var(--radius-md); cursor: pointer; font-size: .875rem; background: rgba(255,255,255,.06); }
	:global(html[data-theme='light']) .actions button { background: rgba(0,0,0,.04); }
</style>
