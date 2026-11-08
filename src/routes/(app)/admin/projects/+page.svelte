<!-- Admin Future Projects -->
<script lang="ts">
	import AdminCrudTable from '$lib/components/admin/AdminCrudTable.svelte';
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import CmsEnTranslationFields from '$lib/components/admin/CmsEnTranslationFields.svelte';
	import {
		adminGet,
		adminPost,
		adminPut,
		adminDelete,
		extractCmsLocaleFields,
		saveCmsLocaleFields,
		toast_success,
		toast_error
	} from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';

	const EN_SPECS = [
		{ key: 'name', label: 'Tên dự án (EN)', placeholder: 'English project name...' },
		{ key: 'timeline', label: 'Timeline (EN)', placeholder: 'e.g. Q3 2026' },
		{ key: 'description', label: 'Mô tả (EN)', placeholder: 'English project description...', multiline: true, rows: 3 }
	];

	let items = $state<Record<string, unknown>[]>([]);
	let showForm = $state(false);
	let editing = $state<Record<string, unknown> | null>(null);
	let form = $state({ name: '', description: '', timeline: '', display_order: 0, is_active: true });
	let enFields = $state<Record<string, string>>({ name: '', timeline: '', description: '' });
	let hadExistingEn = $state(false);

	const columns = [
		{ key: 'id', label: 'ID' },
		{ key: 'name', label: 'Tên' },
		{ key: 'en_badge', label: 'Bản EN' },
		{ key: 'description', label: 'Mô tả', type: 'truncate' as const },
		{ key: 'timeline', label: 'Timeline' },
		{ key: 'display_order', label: 'Thứ tự' },
		{ key: 'is_active', label: 'Kích hoạt', type: 'boolean' as const }
	];

	async function fetchItems() {
		try {
			const res = await adminGet<Record<string, unknown>[]>('/admin/future-projects');
			if (res.success && Array.isArray(res.data)) {
				items = res.data.map((row) => {
					const hasEn = extractCmsLocaleFields(row, ['name', 'timeline', 'description']).hasExisting;
					return { ...row, en_badge: hasEn ? '🇬🇧 Có EN' : '—' };
				});
			}
		} catch {
			/* empty */
		}
	}

	function openCreate() {
		editing = null;
		form = { name: '', description: '', timeline: '', display_order: 0, is_active: true };
		enFields = { name: '', timeline: '', description: '' };
		hadExistingEn = false;
		showForm = true;
	}

	function openEdit(item: Record<string, unknown>) {
		editing = item;
		form = {
			name: (item.name as string) ?? '',
			description: (item.description as string) ?? '',
			timeline: (item.timeline as string) ?? '',
			display_order: (item.display_order as number) ?? 0,
			is_active: (item.is_active as boolean) ?? true
		};
		const extracted = extractCmsLocaleFields(item, ['name', 'timeline', 'description']);
		enFields = extracted.values;
		hadExistingEn = extracted.hasExisting;
		showForm = true;
	}

	async function saveItem() {
		try {
			if (editing) {
				const r = await adminPut<any>(`/admin/future-projects/${editing.id}`, form);
				if (!r.success) return;
				await saveCmsLocaleFields('future_project', Number(editing.id), enFields, hadExistingEn);
				toast_success('Cập nhật thành công!');
			} else {
				const r = await adminPost<any>('/admin/future-projects', form);
				if (!r.success) return;
				await saveCmsLocaleFields('future_project', Number(r.data?.id), enFields, false);
				toast_success('Tạo mới thành công!');
			}
			showForm = false;
			fetchItems();
		} catch {
			toast_error('Có lỗi xảy ra.');
		}
	}

	async function deleteItem(item: Record<string, unknown>) {
		if (!confirm('Bạn chắc chắn muốn xóa?')) return;
		try {
			await adminDelete(`/admin/future-projects/${item.id}`);
			toast_success('Đã xóa.');
			fetchItems();
		} catch {
			toast_error('Không thể xóa.');
		}
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
		<CmsEnTranslationFields bind:fields={enFields} specs={EN_SPECS} />
		<div class="form-actions">
			<button type="button" class="btn-cancel" onclick={() => showForm = false}>Hủy</button>
			<button type="submit" class="btn-save">💾 {editing ? 'Cập nhật' : 'Tạo'}</button>
		</div>
	</form>
</AdminModal>
