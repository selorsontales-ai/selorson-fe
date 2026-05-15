<script lang="ts">
	import AdminCrudTable from '$lib/components/admin/AdminCrudTable.svelte';
	import { adminGet, adminDelete, toast_success, toast_error } from '$lib/stores/admin.svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let items = $state<Record<string, unknown>[]>([]);
	const columns = [{ key: 'id', label: 'ID' }, { key: 'chapter_number', label: 'Số' }, { key: 'title', label: 'Tiêu đề' }, { key: 'status', label: 'Trạng thái', type: 'status' as const }, { key: 'created_at', label: 'Ngày tạo', type: 'date' as const }];

	async function fetchItems() { try { const r = await adminGet<Record<string, unknown>[]>('/admin/chapters'); if (r.success) items = r.data; } catch {} }
	function goToEditor(item: Record<string, unknown>) { goto(`/admin/chapters/${item.id}`); }
	function goToCreate() { goto('/admin/chapters/new'); }
	async function deleteItem(item: Record<string, unknown>) { if (!confirm('Xóa?')) return; try { await adminDelete(`/admin/chapters/${item.id}`); toast_success('Đã xóa.'); fetchItems(); } catch { toast_error('Lỗi'); } }
	onMount(fetchItems);
</script>
<svelte:head><title>Admin - Chapters</title></svelte:head>
<AdminCrudTable title="📖 Quản lý Chapters" {columns} {items} showCreate showActions showDelete oncreate={goToCreate} onedit={goToEditor} ondelete={deleteItem} />
