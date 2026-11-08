<script lang="ts">
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import { adminGet, adminPost, adminPut, adminDelete, toast_success, toast_error } from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';

	interface VoteOption { id: number; choice_id: number; icon: string; label: string; display_order: number; is_active: boolean; }

	let loading = $state(true);
	let saving = $state(false);
	let showModal = $state(false);
	let editingId = $state<number | null>(null);
	let items = $state<VoteOption[]>([]);
	let stats = $state<Record<string, number> | null>(null);
	let totalVotes = $state(0);
	let form = $state({ choice_id: 0, icon: '', label: '', display_order: 0, is_active: true });

	async function fetchItems() {
		loading = true;
		try { const res = await adminGet<VoteOption[]>('/admin/vote-options'); if (res.success) items = res.data ?? []; }
		catch {} finally { loading = false; }
	}

	async function fetchStats() {
		try {
			const res = await adminGet<{ stats: Record<string, number>; total: number }>('/public/votes/stats');
			if (res.success) { const d: any = res.data; stats = d.stats ?? {}; totalVotes = d.total ?? 0; }
		} catch {}
	}

	function getPercent(cid: number) { return (!stats || totalVotes === 0) ? 0 : Math.round(((stats[cid] || 0) / totalVotes) * 100); }

	function openCreate() {
		editingId = null;
		const next = items.length ? Math.max(...items.map(i => i.choice_id)) + 1 : 1;
		form = { choice_id: next, icon: '', label: '', display_order: items.length, is_active: true };
		showModal = true;
	}

	function openEdit(item: VoteOption) {
		editingId = item.id;
		form = { choice_id: item.choice_id, icon: item.icon, label: item.label, display_order: item.display_order, is_active: item.is_active };
		showModal = true;
	}

	async function save() {
		saving = true;
		try {
			if (editingId) { await adminPut(`/admin/vote-options/${editingId}`, form); toast_success('Cập nhật!'); }
			else { await adminPost('/admin/vote-options', form); toast_success('Tạo mới!'); }
			showModal = false; await fetchItems();
		} catch { toast_error('Lỗi'); } finally { saving = false; }
	}

	async function remove(id: number) {
		if (!confirm('Xóa?')) return;
		try { await adminDelete(`/admin/vote-options/${id}`); toast_success('Đã xóa!'); await fetchItems(); }
		catch { toast_error('Lỗi'); }
	}

	onMount(() => { fetchItems(); fetchStats(); });
</script>

<svelte:head><title>Admin - Bình Chọn</title></svelte:head>

<div class="admin-page">
	<div class="page-head">
		<h1>🗳️ Quản Lý Bình Chọn</h1>
		<button class="btn-brand" onclick={openCreate}>+ Thêm mới</button>
	</div>

	{#if loading}<p class="loading-text">Đang tải...</p>
	{:else}
		<div class="items-list">
			{#each items as item (item.id)}
				<div class="item-row">
					<span class="vote-icon">{item.icon}</span>
					<div class="item-detail">
						<strong>{item.label}</strong>
						<span class="meta">ID: {item.choice_id} · Thứ tự: {item.display_order}</span>
						{#if !item.is_active}<span class="badge-off">Ẩn</span>{/if}
					</div>
					<div class="actions">
						<button onclick={() => openEdit(item)}>✏️</button>
						<button onclick={() => remove(item.id)}>🗑️</button>
					</div>
				</div>
			{/each}
			{#if !items.length}<p class="loading-text">Chưa có tùy chọn nào.</p>{/if}
		</div>

		{#if stats}
			<div class="stats-section">
				<h2>📊 Thống Kê</h2>
				{#each items as item}
					<div class="stat-row">
						<span class="slabel">{item.icon} {item.label}</span>
						<div class="bar-bg"><div class="bar-fill" style="width:{getPercent(item.choice_id)}%"></div></div>
						<span class="scount">{stats[item.choice_id]||0} ({getPercent(item.choice_id)}%)</span>
					</div>
				{/each}
				<p class="stotal">Tổng: <strong>{totalVotes}</strong></p>
			</div>
		{/if}
	{/if}
</div>

<AdminModal bind:open={showModal} title={editingId ? 'Sửa' : 'Thêm'}>
	<form onsubmit={(e) => { e.preventDefault(); save(); }}>
		<div class="field"><label>Choice ID *<input bind:value={form.choice_id} type="number" required disabled={!!editingId} /></label></div>
		<div class="field"><label>Icon *<input bind:value={form.icon} required maxlength="10" placeholder="📱" /></label></div>
		<div class="field"><label>Nhãn *<input bind:value={form.label} required /></label></div>
		<div class="field"><label>Thứ tự<input bind:value={form.display_order} type="number" /></label></div>
		<label class="checkbox-label"><input type="checkbox" bind:checked={form.is_active} /> Hiển thị</label>
		<div class="form-actions">
			<button type="button" class="btn-cancel" onclick={() => showModal = false}>Hủy</button>
			<button type="submit" class="btn-save" disabled={saving}>{saving ? '...' : 'Lưu'}</button>
		</div>
	</form>
</AdminModal>

<style>
	.admin-page { max-width: 900px; }
	.page-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.5rem; }
	.page-head h1 { font-size: 1.5rem; font-weight: 800; margin: 0; }
	.loading-text { text-align: center; padding: 2rem; color: var(--color-text-muted); }
	.items-list { display: flex; flex-direction: column; gap: .75rem; }
	.item-row { display: flex; align-items: center; gap: .75rem; padding: 1rem 1.25rem; background: var(--color-surface-100); border-radius: var(--radius-lg); border: 1px solid rgba(255,255,255,.04); }
	:global(html[data-theme='light']) .item-row { background: #fff; border-color: rgba(0,0,0,.04); }
	.vote-icon { font-size: 1.75rem; }
	.item-detail { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.item-detail strong { font-size: .9375rem; }
	.meta { font-size: .75rem; color: var(--color-text-muted); }
	.badge-off { display: inline-block; padding: .125rem .5rem; border-radius: 1rem; background: rgba(239,68,68,.1); color: #f87171; font-size: .6875rem; font-weight: 700; margin-top: .25rem; width: fit-content; }
	.actions { display: flex; gap: .375rem; }
	.actions button { width: 32px; height: 32px; border: none; border-radius: var(--radius-md); cursor: pointer; font-size: .875rem; background: rgba(255,255,255,.06); }
	:global(html[data-theme='light']) .actions button { background: rgba(0,0,0,.04); }
	.stats-section { margin-top: 2.5rem; }
	.stats-section h2 { font-size: 1.25rem; font-weight: 700; margin: 0 0 1rem; }
	.stat-row { display: flex; align-items: center; gap: .75rem; margin-bottom: .75rem; }
	.slabel { min-width: 160px; font-size: .8125rem; font-weight: 600; }
	.bar-bg { flex: 1; min-width: 80px; height: 10px; background: var(--color-surface-300); border-radius: 5px; overflow: hidden; }
	.bar-fill { height: 100%; background: linear-gradient(90deg, var(--color-brand-500), var(--color-brand-300)); border-radius: 5px; transition: width .5s; }
	.scount { min-width: 80px; text-align: right; font-size: .75rem; color: var(--color-text-muted); font-weight: 600; }
	.stotal { text-align: right; font-size: .8125rem; color: var(--color-text-muted); margin: .75rem 0 0; }
	@media (max-width: 520px) {
		.stat-row { flex-wrap: wrap; gap: 0.35rem; }
		.slabel { min-width: 0; flex: 1; }
		.bar-bg { flex-basis: 100%; order: 3; }
	}
</style>
