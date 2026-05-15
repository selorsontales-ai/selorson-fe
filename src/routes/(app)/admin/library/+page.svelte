<script lang="ts">
	import AdminCrudTable from '$lib/components/admin/AdminCrudTable.svelte';
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import { adminGet, adminPost, adminPut, adminDelete, adminUpload, toast_success, toast_error } from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';

	let items = $state<Record<string, unknown>[]>([]); let showForm = $state(false); let editing = $state<Record<string, unknown> | null>(null);
	let uploadingImage = $state(false); let imageInput = $state<HTMLInputElement>();
	let form = $state({ name: '', category: 'character', description: '', image_url: '', image_ratio: '1:1', display_order: 0, is_active: true });
	const columns = [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Tên' }, { key: 'category', label: 'Danh mục', type: 'status' as const }, { key: 'description', label: 'Mô tả', type: 'truncate' as const }, { key: 'is_active', label: 'Active', type: 'boolean' as const }];

	async function fetchItems() { try { const r = await adminGet<Record<string, unknown>[]>('/admin/library'); if (r.success) items = r.data; } catch {} }
	function openCreate() { editing = null; form = { name: '', category: 'character', description: '', image_url: '', image_ratio: '1:1', display_order: 0, is_active: true }; showForm = true; }
	function openEdit(item: Record<string, unknown>) { editing = item; form = { name: item.name as string ?? '', category: item.category as string ?? 'character', description: item.description as string ?? '', image_url: item.image_url as string ?? '', image_ratio: item.image_ratio as string ?? '1:1', display_order: item.display_order as number ?? 0, is_active: item.is_active as boolean ?? true }; showForm = true; }
	async function saveItem() { try { if (editing) { await adminPut(`/admin/library/${editing.id}`, form); toast_success('Cập nhật!'); } else { await adminPost('/admin/library', form); toast_success('Tạo mới!'); } showForm = false; fetchItems(); } catch { toast_error('Lỗi'); } }
	async function deleteItem(item: Record<string, unknown>) { if (!confirm('Xóa?')) return; try { await adminDelete(`/admin/library/${item.id}`); toast_success('Đã xóa.'); fetchItems(); } catch { toast_error('Lỗi'); } }
	async function uploadImage(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; uploadingImage = true; try { const fd = new FormData(); fd.append('image', f); fd.append('folder', 'library'); const r = await adminUpload<{ url: string }>('/upload/image', fd); if (r.success) { form.image_url = r.data.url; toast_success('Upload OK!'); } } catch { toast_error('Upload lỗi'); } finally { uploadingImage = false; } }
	onMount(fetchItems);
</script>
<svelte:head><title>Admin - Library</title></svelte:head>
<AdminCrudTable title="📚 Quản lý Library" {columns} {items} showCreate showActions showDelete oncreate={openCreate} onedit={openEdit} ondelete={deleteItem} />
<AdminModal bind:open={showForm} title={editing ? 'Sửa Item' : 'Tạo Item'} size="lg">
	<form onsubmit={(e) => { e.preventDefault(); saveItem(); }}>
		<input bind:value={form.name} placeholder="Tên" required />
		<div class="field"><label>Danh mục<select bind:value={form.category}><option value="character">Character</option><option value="location">Location</option><option value="item">Item</option><option value="lore">Lore</option><option value="faction">Faction</option></select></label></div>
		<textarea bind:value={form.description} placeholder="Mô tả" rows="4"></textarea>
		<div class="field"><label>Hình ảnh<div class="upload-row"><input type="file" bind:this={imageInput} accept="image/*" onchange={uploadImage} style="display:none" /><button type="button" class="btn-upload" onclick={() => imageInput?.click()}>{uploadingImage ? '⏳' : '📤 Upload'}</button><input bind:value={form.image_url} placeholder="URL" /></div></label>{#if form.image_url}<img src={form.image_url} alt="" class="preview-thumb" />{/if}</div>
		<div class="field"><label>Tỉ lệ hình<select bind:value={form.image_ratio}><option value="1:1">1:1</option><option value="3:4">3:4</option><option value="4:3">4:3</option><option value="16:9">16:9</option></select></label></div>
		<input bind:value={form.display_order} type="number" placeholder="Thứ tự" />
		<label class="checkbox-label"><input type="checkbox" bind:checked={form.is_active} /> Kích hoạt</label>
		<div class="form-actions"><button type="button" class="btn-cancel" onclick={() => showForm = false}>Hủy</button><button type="submit" class="btn-save">{editing ? 'Cập nhật' : 'Tạo'}</button></div>
	</form>
</AdminModal>
