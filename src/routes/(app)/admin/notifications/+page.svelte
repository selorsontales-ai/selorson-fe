<script lang="ts">
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import { adminGet, adminPost, adminPut, adminDelete, adminUpload, toast_success, toast_error } from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';

	interface UserNotification { id: number; title: string; content: string | null; type: string; image_url: string | null; is_active: boolean; options?: { id: number; option_text: string }[]; }

	let loading = $state(true); let saving = $state(false); let showModal = $state(false); let editingId = $state<number | null>(null);
	let uploadingImage = $state(false); let imageInput = $state<HTMLInputElement>();
	let items = $state<UserNotification[]>([]);
	let form = $state({ title: '', content: '', type: 'text', image_url: '', is_active: true, options: [] as string[] });

	async function fetchItems() { loading = true; try { const r = await adminGet<UserNotification[]>('/admin/user-notifications'); if (r.success) items = r.data ?? []; } catch {} finally { loading = false; } }

	function openCreate() { editingId = null; form = { title: '', content: '', type: 'text', image_url: '', is_active: true, options: [] }; showModal = true; }
	function openEdit(item: UserNotification) { editingId = item.id; form = { title: item.title, content: item.content ?? '', type: item.type, image_url: item.image_url ?? '', is_active: item.is_active, options: item.options?.map(o => o.option_text) ?? [] }; showModal = true; }

	async function save() { saving = true; try { const payload = { ...form, image_url: form.image_url || null }; if (editingId) { await adminPut(`/admin/user-notifications/${editingId}`, payload); toast_success('Cập nhật!'); } else { await adminPost('/admin/user-notifications', payload); toast_success('Tạo mới!'); } showModal = false; await fetchItems(); } catch { toast_error('Lỗi'); } finally { saving = false; } }

	async function remove(id: number) { if (!confirm('Xóa?')) return; try { await adminDelete(`/admin/user-notifications/${id}`); toast_success('Đã xóa!'); await fetchItems(); } catch { toast_error('Lỗi'); } }

	async function uploadImage(e: Event) { const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return; uploadingImage = true; try { const fd = new FormData(); fd.append('image', file); fd.append('folder', 'notifications'); const r = await adminUpload<{ url: string }>('/upload/image', fd); if (r.success) { form.image_url = r.data.url; toast_success('Upload OK!'); } } catch { toast_error('Upload thất bại.'); } finally { uploadingImage = false; } }

	onMount(fetchItems);
</script>

<svelte:head><title>Admin - Thông Báo</title></svelte:head>

<div class="admin-page">
	<div class="page-head"><h1>📢 Quản Lý Thông Báo</h1><button class="btn-brand" onclick={openCreate}>+ Thêm mới</button></div>
	{#if loading}<p class="empty-text">Đang tải...</p>
	{:else}
		<div class="items-list">
			{#each items as item (item.id)}
				<div class="item-row">
					{#if item.image_url}<img src={item.image_url} alt="" class="row-thumb" />{:else}<div class="row-thumb-ph">📢</div>{/if}
					<div class="item-info">
						<strong>{item.title}</strong>
						<span class="meta">Type: {item.type} · {item.is_active ? 'Đang bật' : 'Đã tắt'}</span>
						{#if item.content}<p class="desc">{item.content}</p>{/if}
						{#if item.type === 'vote' && item.options?.length}
							<div class="vote-opts">{#each item.options as opt}<span class="opt-badge">{opt.option_text}</span>{/each}</div>
						{/if}
					</div>
					<div class="actions"><button onclick={() => openEdit(item)}>✏️</button><button onclick={() => remove(item.id)}>🗑️</button></div>
				</div>
			{/each}
			{#if !items.length}<p class="empty-text">Chưa có thông báo nào.</p>{/if}
		</div>
	{/if}
</div>

<AdminModal bind:open={showModal} title={editingId ? 'Sửa Thông Báo' : 'Thêm Thông Báo'}>
	<form onsubmit={(e) => { e.preventDefault(); save(); }}>
		<div class="field"><label>Tiêu đề *<input bind:value={form.title} required /></label></div>
		<div class="field"><label>Nội dung<textarea bind:value={form.content} rows="3"></textarea></label></div>
		<div class="field"><label>Loại<select bind:value={form.type}><option value="text">Văn bản</option><option value="vote">Bình chọn</option><option value="announcement">Thông báo lớn</option></select></label></div>
		<div class="field">
			<label>Hình ảnh
			<div class="upload-row">
				<input type="file" bind:this={imageInput} accept="image/*" onchange={uploadImage} style="display:none" />
				<button type="button" class="btn-upload" onclick={() => imageInput?.click()}>{uploadingImage ? '⏳...' : '📤 Upload'}</button>
				<input bind:value={form.image_url} placeholder="URL hình ảnh" />
			</div>
			</label>
			{#if form.image_url}<img src={form.image_url} alt="" class="preview-thumb" />{/if}
		</div>
		{#if form.type === 'vote'}
			<div class="field vote-opts-field">
				<label>Lựa chọn bình chọn
				{#each form.options as _, idx}
					<div class="opt-row"><input bind:value={form.options[idx]} required /><button type="button" onclick={() => { form.options = form.options.filter((_,i)=>i!==idx); }}>✖</button></div>
				{/each}
				<button type="button" class="btn-add-opt" onclick={() => { form.options = [...form.options, '']; }}>+ Thêm</button>
				</label>
			</div>
		{/if}
		<label class="checkbox-label"><input type="checkbox" bind:checked={form.is_active} /> Kích hoạt</label>
		<div class="form-actions"><button type="button" class="btn-cancel" onclick={() => showModal = false}>Hủy</button><button type="submit" class="btn-save" disabled={saving}>{saving ? '...' : 'Lưu'}</button></div>
	</form>
</AdminModal>

<style>
	.admin-page { max-width: 900px; }
	.page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
	.page-head h1 { font-size: 1.5rem; font-weight: 800; margin: 0; }
	.empty-text { text-align: center; padding: 2rem; color: var(--color-text-muted); }
	.items-list { display: flex; flex-direction: column; gap: .75rem; }
	.item-row { display: flex; align-items: center; gap: 1rem; padding: .875rem 1rem; background: var(--color-surface-100); border-radius: var(--radius-lg); border: 1px solid rgba(255,255,255,.04); }
	:global(html[data-theme='light']) .item-row { background: #fff; border-color: rgba(0,0,0,.04); }
	.row-thumb { width: 56px; height: 56px; border-radius: var(--radius-md); object-fit: cover; flex-shrink: 0; }
	.row-thumb-ph { width: 56px; height: 56px; border-radius: var(--radius-md); background: linear-gradient(135deg, var(--color-brand-500), var(--color-brand-300)); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0; }
	.item-info { flex: 1; }
	.item-info strong { display: block; margin-bottom: .25rem; }
	.meta { font-size: .75rem; color: var(--color-brand-400); font-weight: 600; display: block; margin-bottom: .25rem; }
	.desc { font-size: .875rem; color: var(--color-text-secondary); margin: 0; }
	.vote-opts { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: .5rem; }
	.opt-badge { font-size: .75rem; background: var(--color-surface-200); padding: .25rem .5rem; border-radius: .25rem; font-weight: 600; }
	.actions { display: flex; gap: .375rem; }
	.actions button { width: 32px; height: 32px; border: none; border-radius: var(--radius-md); cursor: pointer; font-size: .875rem; background: rgba(255,255,255,.06); }
	:global(html[data-theme='light']) .actions button { background: rgba(0,0,0,.04); }
	.vote-opts-field { background: var(--color-surface-200); padding: 1rem; border-radius: var(--radius-md); border: 1px dashed var(--color-surface-400); }
	.opt-row { display: flex; gap: .5rem; margin-bottom: .5rem; }
	.opt-row button { background: rgba(239,68,68,.1); color: #f87171; border: none; border-radius: var(--radius-md); width: 40px; cursor: pointer; font-weight: bold; }
	.btn-add-opt { background: var(--color-surface-300); border: none; border-radius: var(--radius-md); padding: .5rem; font-size: .75rem; font-weight: 600; cursor: pointer; width: 100%; color: var(--color-text-secondary); }
</style>
