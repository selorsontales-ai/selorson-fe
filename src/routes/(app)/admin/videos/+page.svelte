<script lang="ts">
	import AdminCrudTable from '$lib/components/admin/AdminCrudTable.svelte';
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import { adminGet, adminPost, adminPut, adminDelete, toast_success, toast_error } from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';

	let items = $state<Record<string, unknown>[]>([]); let showForm = $state(false); let editing = $state<Record<string, unknown> | null>(null);
	let form = $state({ title: '', youtube_id: '', description: '', thumbnail_url: '', is_featured: false, display_order: 0 });
	const columns = [{ key: 'id', label: 'ID' }, { key: 'title', label: 'Tiêu đề' }, { key: 'youtube_id', label: 'YouTube ID' }, { key: 'is_featured', label: 'Nổi bật', type: 'boolean' as const }, { key: 'display_order', label: 'Thứ tự' }];

	async function fetchItems() { try { const r = await adminGet<Record<string, unknown>[]>('/admin/videos'); if (r.success) items = r.data; } catch {} }
	function openCreate() { editing = null; form = { title: '', youtube_id: '', description: '', thumbnail_url: '', is_featured: false, display_order: 0 }; showForm = true; }
	function openEdit(item: Record<string, unknown>) { editing = item; form = { title: item.title as string ?? '', youtube_id: item.youtube_id as string ?? '', description: item.description as string ?? '', thumbnail_url: item.thumbnail_url as string ?? '', is_featured: item.is_featured as boolean ?? false, display_order: item.display_order as number ?? 0 }; showForm = true; }
	async function saveItem() { try { if (editing) { await adminPut(`/admin/videos/${editing.id}`, form); toast_success('Cập nhật!'); } else { await adminPost('/admin/videos', form); toast_success('Tạo mới!'); } showForm = false; fetchItems(); } catch { toast_error('Lỗi'); } }
	async function deleteItem(item: Record<string, unknown>) { if (!confirm('Xóa?')) return; try { await adminDelete(`/admin/videos/${item.id}`); toast_success('Đã xóa.'); fetchItems(); } catch { toast_error('Lỗi'); } }
	onMount(fetchItems);
</script>
<svelte:head><title>Admin - Videos</title></svelte:head>
<AdminCrudTable title="🎬 Quản lý Videos" {columns} {items} showCreate showActions showDelete oncreate={openCreate} onedit={openEdit} ondelete={deleteItem} />
<AdminModal bind:open={showForm} title={editing ? 'Chỉnh sửa Video' : 'Tạo Video mới'}>
	<form onsubmit={(e) => { e.preventDefault(); saveItem(); }}>
		<input bind:value={form.title} placeholder="Tiêu đề" required />
		<input bind:value={form.youtube_id} placeholder="YouTube ID" required />
		<textarea bind:value={form.description} placeholder="Mô tả" rows="3"></textarea>
		<input bind:value={form.thumbnail_url} placeholder="Thumbnail URL" />
		<input bind:value={form.display_order} type="number" placeholder="Thứ tự" />
		<label class="checkbox-label"><input type="checkbox" bind:checked={form.is_featured} /> Nổi bật</label>
		<div class="form-actions"><button type="button" class="btn-cancel" onclick={() => showForm = false}>Hủy</button><button type="submit" class="btn-save">{editing ? 'Cập nhật' : 'Tạo'}</button></div>
	</form>
</AdminModal>
