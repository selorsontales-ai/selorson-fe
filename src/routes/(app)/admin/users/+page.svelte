<script lang="ts">
	import AdminCrudTable from '$lib/components/admin/AdminCrudTable.svelte';
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import { adminGet, adminPut, adminPost, toast_success, toast_error } from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';

	let users = $state<Record<string, unknown>[]>([]); let showForm = $state(false); let showBanModal = $state(false);
	let editingId = $state<number | null>(null); let banTarget = $state<Record<string, unknown> | null>(null);
	let form = $state({ role: 'user', status: 'active' });
	let banForm = $state({ ban_reason: '', ban_days: 7 as number | null });
	const columns = [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Tên' }, { key: 'username', label: 'Username' }, { key: 'email', label: 'Email' }, { key: 'role', label: 'Role', type: 'status' as const }, { key: 'status', label: 'Status', type: 'status' as const }, { key: 'created_at', label: 'Ngày tạo', type: 'date' as const }];

	$effect(() => { /* keep banExpiryDate reactive */ });
	function banExpiryDate() { if (!banForm.ban_days) return ''; const d = new Date(); d.setDate(d.getDate() + banForm.ban_days); return d.toLocaleDateString('vi-VN'); }

	async function fetchUsers() { try { const r = await adminGet<{ data: Record<string, unknown>[] }>('/admin/users'); if (r.success) users = (r.data as any).data ?? []; } catch { toast_error('Không thể tải.'); } }
	function openEdit(user: Record<string, unknown>) { editingId = user.id as number; form = { role: user.role as string ?? 'user', status: user.status as string ?? 'active' }; showForm = true; }
	function openBan(user: Record<string, unknown>) { banTarget = user; banForm = { ban_reason: '', ban_days: 7 }; showBanModal = true; }
	async function saveUser() { if (!editingId) return; try { await adminPut(`/admin/users/${editingId}`, form); toast_success('Cập nhật!'); showForm = false; fetchUsers(); } catch { toast_error('Lỗi'); } }
	async function submitBan() { if (!banTarget) return; try { await adminPost(`/admin/users/${banTarget.id}/ban`, banForm); toast_success(`Đã ban ${banTarget.name}.`); showBanModal = false; fetchUsers(); } catch { toast_error('Lỗi'); } }
	async function unbanUser(user: Record<string, unknown>) { if (!confirm(`Gỡ ban "${user.name}"?`)) return; try { await adminPost(`/admin/users/${user.id}/unban`); toast_success(`Đã gỡ ban.`); fetchUsers(); } catch { toast_error('Lỗi'); } }
	onMount(fetchUsers);
</script>
<svelte:head><title>Admin - Users</title></svelte:head>
<div class="crud-table-wrapper">
	<div class="crud-header"><h2>👥 Quản lý Users</h2></div>
	<div class="table-scroll">
		<table class="crud-table">
			<thead><tr>{#each columns as col}<th>{col.label}</th>{/each}<th class="th-actions">Thao tác</th></tr></thead>
			<tbody>
				{#if !users.length}<tr><td colspan={columns.length + 1} class="empty-row">Chưa có dữ liệu</td></tr>{/if}
				{#each users as user (user.id)}
					<tr>
						{#each columns as col}
							<td data-label={col.label}>
								{#if col.type === 'status'}<span class="badge {user[col.key] === 'admin' ? 'bg-green' : user[col.key] === 'blacklisted' ? 'bg-red' : 'bg-blue'}">{user[col.key]}</span>
								{:else if col.type === 'date'}<span class="cell-date">{new Date(String(user[col.key])).toLocaleDateString('vi-VN')}</span>
								{:else}{user[col.key] ?? '—'}{/if}
							</td>
						{/each}
						<td class="td-actions" data-label="Thao tác">
							<button class="act-btn" onclick={() => openEdit(user)}>✏️</button>
							{#if user.status !== 'blacklisted' && user.status !== 'suspended'}
								<button class="act-btn ban" onclick={() => openBan(user)}>🚫</button>
							{:else}
								<button class="act-btn unban" onclick={() => unbanUser(user)}>✅</button>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
<!-- Edit Modal -->
<AdminModal bind:open={showForm} title="Chỉnh sửa User" size="sm">
	<form onsubmit={(e) => { e.preventDefault(); saveUser(); }}>
		<div class="field"><label>Role<select bind:value={form.role}><option value="user">User</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label></div>
		<div class="field"><label>Status<select bind:value={form.status}><option value="active">Active</option><option value="suspended">Suspended</option><option value="restricted">Restricted</option><option value="blacklisted">Blacklisted</option><option value="unverified">Unverified</option></select></label></div>
		<div class="form-actions"><button type="button" class="btn-cancel" onclick={() => showForm = false}>Hủy</button><button type="submit" class="btn-save">💾 Lưu</button></div>
	</form>
</AdminModal>
<!-- Ban Modal -->
<AdminModal bind:open={showBanModal} title="🚫 Ban User: {banTarget?.name ?? ''}" size="sm">
	<form onsubmit={(e) => { e.preventDefault(); submitBan(); }}>
		<div class="field"><label>Lý do ban *<textarea bind:value={banForm.ban_reason} rows="3" required></textarea></label></div>
		<div class="field"><label>Thời hạn<select bind:value={banForm.ban_days}><option value={1}>1 ngày</option><option value={3}>3 ngày</option><option value={7}>7 ngày</option><option value={14}>14 ngày</option><option value={30}>30 ngày</option><option value={90}>90 ngày</option><option value={null}>♾️ Vĩnh viễn</option></select></label></div>
		{#if banForm.ban_days}<p class="ban-preview">⏳ Unban vào <strong>{banExpiryDate()}</strong></p>{:else}<p class="ban-preview ban-perm">⚠️ Ban vĩnh viễn</p>{/if}
		<div class="form-actions"><button type="button" class="btn-cancel" onclick={() => showBanModal = false}>Hủy</button><button type="submit" class="btn-save" style="background:#dc2626">🚫 Xác nhận</button></div>
	</form>
</AdminModal>
<style>
	.crud-table-wrapper { background: var(--color-surface-100); border-radius: var(--radius-lg); overflow: hidden; border: 1px solid rgba(255,255,255,.06); }
	:global(html[data-theme='light']) .crud-table-wrapper { background: #fff; border-color: rgba(0,0,0,.06); }
	.crud-header { display: flex; padding: 1.5rem 1.5rem 1rem; border-bottom: 1px solid rgba(255,255,255,.06); }
	.crud-header h2 { margin: 0; font-size: 1.25rem; font-weight: 700; }
	.table-scroll { overflow-x: auto; }
	.crud-table { width: 100%; border-collapse: collapse; font-size: .8125rem; }
	.crud-table th { padding: .75rem 1rem; text-align: left; background: var(--color-surface-200); color: var(--color-text-muted); font-size: .75rem; text-transform: uppercase; }
	.crud-table td { padding: .75rem 1rem; border-top: 1px solid rgba(255,255,255,.04); }
	.empty-row { text-align: center; color: var(--color-text-muted); padding: 3rem !important; }
	.badge { padding: .125rem .5rem; border-radius: 1rem; font-size: .6875rem; font-weight: 600; }
	.bg-green { background: rgba(16,185,129,.15); color: #34d399; }
	.bg-red { background: rgba(239,68,68,.15); color: #f87171; }
	.bg-blue { background: rgba(59,130,246,.15); color: #60a5fa; }
	.cell-date { font-size: .75rem; color: var(--color-text-muted); }
	.th-actions { width: 100px; text-align: center; }
	.td-actions { text-align: center; white-space: nowrap; }
	.act-btn { padding: .25rem .5rem; background: none; border: none; cursor: pointer; font-size: 1rem; border-radius: var(--radius-sm); transition: all .2s; }
	.act-btn:hover { background: rgba(12,113,61,.1); }
	.act-btn.ban:hover { background: rgba(239,68,68,.1); }
	.act-btn.unban:hover { background: rgba(16,185,129,.1); }
	.ban-preview { padding: .75rem; background: rgba(59,130,246,.1); border-radius: var(--radius-md); font-size: .8125rem; color: #60a5fa; border: 1px solid rgba(59,130,246,.15); }
	.ban-perm { background: rgba(239,68,68,.1); color: #f87171; border-color: rgba(239,68,68,.15); }
</style>
