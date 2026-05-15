<!-- Admin Future Projects -->
<script lang="ts">
	import AdminCrudTable from '$lib/components/admin/AdminCrudTable.svelte';
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import { adminGet, adminPost, adminPut, adminDelete, toast_success, toast_error } from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';

	let items = $state<Record<string, unknown>[]>([]);
	let showForm = $state(false);
	let editing = $state<Record<string, unknown> | null>(null);
	let form = $state({ name: '', description: '', timeline: '', display_order: 0, is_active: true });

	const columns = [
		{ key: 'id', label: 'ID' },
		{ key: 'name', label: 'Tên' },
		{ key: 'description', label: 'Mô tả', type: 'truncate' as const },
		{ key: 'timeline', label: 'Timeline' },
		{ key: 'display_order', label: 'Thứ tự' },
		{ key: 'is_active', label: 'Kích hoạt', type: 'boolean' as const },
	];

	async function fetchItems() {
		try {
			const res = await adminGet<Record<string, unknown>[]>('/admin/future-projects');
			if (res.success) items = res.data;
		} catch { /* empty */ }
	}

	function openCreate() {
		editing = null;
		form = { name: '', description: '', timeline: '', display_order: 0, is_active: true };
		showForm = true;
	}

	function openEdit(item: Record<string, unknown>) {
		editing = item;
		form = { name: item.name as string ?? '', description: item.description as string ?? '', timeline: item.timeline as string ?? '', display_order: item.display_order as number ?? 0, is_active: item.is_active as boolean ?? true };
		showForm = true;
	}

	async function saveItem() {
		try {
			if (editing) {
				await adminPut(`/admin/future-projects/${editing.id}`, form);
				toast_success('Cập nhật thành công!');
			} else {
				await adminPost('/admin/future-projects', form);
				toast_success('Tạo mới thành công!');
			}
			showForm = false;
			fetchItems();
		} catch { toast_error('Có lỗi xảy ra.'); }
	}

	async function deleteItem(item: Record<string, unknown>) {
		if (!confirm('Bạn chắc chắn muốn xóa?')) return;
		try { await adminDelete(`/admin/future-projects/${item.id}`); toast_success('Đã xóa.'); fetchItems(); }
		catch { toast_error('Không thể xóa.'); }
	}

	onMount(fetchItems);
</script>

<svelte:head><title>Admin - Dự Án</title></svelte:head>

<AdminCrudTable title="🚀 Quản lý Dự Án" {columns} {items} showCreate showActions showDelete oncreate={openCreate} onedit={openEdit} ondelete={deleteItem} />

<AdminModal bind:open={showForm} title={editing ? 'Chỉnh sửa Dự Án' : 'Tạo Dự Án mới'}>
	<form onsubmit={(e) => { e.preventDefault(); saveItem(); }}>
		<input bind:value={form.name} placeholder="Tên dự án" required />
		<textarea bind:value={form.description} placeholder="Mô tả" rows="3"></textarea>
		<input bind:value={form.timeline} placeholder="Timeline (VD: Q3 2026)" />
		<input bind:value={form.display_order} placeholder="Thứ tự" type="number" />
		<label class="checkbox-label"><input type="checkbox" bind:checked={form.is_active} /> Kích hoạt</label>
		<div class="form-actions">
			<button type="button" class="btn-cancel" onclick={() => showForm = false}>Hủy</button>
			<button type="submit" class="btn-save">💾 {editing ? 'Cập nhật' : 'Tạo'}</button>
		</div>
	</form>
</AdminModal>
