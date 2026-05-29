<!-- Admin Claude Chat — Claude account pool management ported from NeuroForge -->
<script lang="ts">
	import { adminGet, adminPut, adminDelete, toast_success, toast_error } from '$lib/stores/admin.svelte';
	import { isDesktop, isWeb } from '$lib/platform';
	import { onMount } from 'svelte';

	interface ClaudeAccount {
		id: number;
		label: string;
		note: string | null;
		is_active: boolean;
		color: string | null;
		emoji: string | null;
		limit_reset_date: string | null;
		created_at: string;
		updated_at: string;
	}

	let accounts = $state<ClaudeAccount[]>([]);
	let loading = $state(true);
	let showAddModal = $state(false);
	let editingAccount = $state<ClaudeAccount | null>(null);

	// Add form
	let newLabel = $state('');
	let newNote = $state('');
	let newColor = $state('#f97316');
	let newEmoji = $state('🤖');

	// Edit form
	let editLabel = $state('');
	let editNote = $state('');
	let editColor = $state('#f97316');
	let editEmoji = $state('🤖');
	let editLimitHours = $state('');

	const emojiOptions = ['🤖', '🧠', '⚡', '🎯', '💎', '🔥', '🌟', '🚀', '🎨', '💡', '🦾', '🌈'];
	const colorOptions = ['#f97316', '#ef4444', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16', '#6366f1'];

	async function loadAccounts() {
		loading = true;
		try {
			const res = await adminGet<ClaudeAccount[]>('/admin/claude/accounts');
			if (res.success) accounts = res.data ?? [];
		} catch { /* ignore */ }
		finally { loading = false; }
	}

	async function createAccount() {
		if (!newLabel.trim()) { toast_error('Label không được để trống'); return; }
		try {
			const res = await adminPost<ClaudeAccount>('/admin/claude/accounts', {
				label: newLabel.trim(),
				note: newNote.trim() || null,
				color: newColor,
				emoji: newEmoji,
			});
			if (res.success) {
				toast_success('Đã tạo tài khoản');
				newLabel = ''; newNote = ''; newColor = '#f97316'; newEmoji = '🤖';
				showAddModal = false;
				await loadAccounts();
			}
		} catch (e: any) {
			toast_error(e.message || 'Lỗi tạo tài khoản');
		}
	}

	function startEdit(acc: ClaudeAccount) {
		editingAccount = acc;
		editLabel = acc.label;
		editNote = acc.note ?? '';
		editColor = acc.color ?? '#f97316';
		editEmoji = acc.emoji ?? '🤖';
		editLimitHours = '';
	}

	async function saveEdit() {
		if (!editingAccount) return;
		const payload: any = {
			label: editLabel.trim(),
			note: editNote.trim() || null,
			color: editColor,
			emoji: editEmoji,
		};

		if (editLimitHours) {
			const hours = parseFloat(editLimitHours);
			if (!isNaN(hours) && hours > 0) {
				const resetDate = new Date(Date.now() + hours * 3600 * 1000);
				payload.limit_reset_date = resetDate.toISOString();
			}
		}

		try {
			const res = await adminPut<ClaudeAccount>(`/admin/claude/accounts/${editingAccount.id}`, payload);
			if (res.success) {
				toast_success('Đã cập nhật');
				editingAccount = null;
				await loadAccounts();
			}
		} catch (e: any) {
			toast_error(e.message || 'Lỗi cập nhật');
		}
	}

	async function clearLimit(acc: ClaudeAccount) {
		try {
			const res = await adminPut<ClaudeAccount>(`/admin/claude/accounts/${acc.id}`, {
				limit_reset_date: '',
				is_active: true,
			});
			if (res.success) {
				toast_success('Đã xóa giới hạn');
				await loadAccounts();
			}
		} catch (e: any) {
			toast_error(e.message || 'Lỗi xóa giới hạn');
		}
	}

	async function deleteAccount(id: number) {
		if (!confirm('Bạn có chắc muốn xóa tài khoản này?')) return;
		try {
			const res = await adminDelete(`/admin/claude/accounts/${id}`);
			if (res.success) {
				toast_success('Đã xóa');
				await loadAccounts();
			}
		} catch (e: any) {
			toast_error(e.message || 'Lỗi xóa tài khoản');
		}
	}

	async function openClaudeWindow(acc?: ClaudeAccount) {
		if (!acc) {
			window.open('https://claude.ai', '_blank');
			return;
		}

		if (isDesktop) {
			// Desktop (Tauri): open an isolated native window with custom title & separate cookie profile
			try {
				toast_success(`Đang mở ${acc.label}...`);
				const { invoke } = await import('@tauri-apps/api/core');
				await invoke('open_claude_window', { accountId: acc.id, accountName: acc.label });
			} catch (err: any) {
				toast_error(err?.message || 'Lỗi mở cửa sổ Claude');
			}
		} else if (isWeb) {
			// Web: simply open Claude in a new browser tab
			window.open('https://claude.ai', '_blank');
			toast_success(`Mở Claude.ai cho ${acc.label} — hãy đăng nhập đúng tài khoản`);
		} else {
			// Mobile: feature not applicable
			toast_error('Tính năng mở phiên Claude riêng chỉ hỗ trợ trên bản Desktop');
		}
	}

	function formatTimeRemaining(dateStr: string | null): string {
		if (!dateStr) return '';
		const diff = new Date(dateStr).getTime() - Date.now();
		if (diff <= 0) return 'Đã hết hạn';
		const hours = Math.floor(diff / 3600000);
		const mins = Math.floor((diff % 3600000) / 60000);
		if (hours > 0) return `${hours}h ${mins}m`;
		return `${mins} phút`;
	}

	function isLimited(acc: ClaudeAccount): boolean {
		if (!acc.limit_reset_date) return false;
		return new Date(acc.limit_reset_date).getTime() > Date.now();
	}

	// Auto-clean expired limits every 30s
	let cleanupInterval: ReturnType<typeof setInterval>;
	onMount(() => {
		loadAccounts();
		cleanupInterval = setInterval(async () => {
			const expired = accounts.filter(a => a.limit_reset_date && new Date(a.limit_reset_date).getTime() <= Date.now() && !a.is_active);
			for (const acc of expired) {
				await adminPut(`/admin/claude/accounts/${acc.id}`, { limit_reset_date: '', is_active: true });
			}
			if (expired.length > 0) await loadAccounts();
		}, 30000);
		return () => clearInterval(cleanupInterval);
	});
</script>

<svelte:head><title>Claude Chat — Admin Selorson</title></svelte:head>

<div class="claude-page">
	<div class="page-header">
		<div>
			<h1 class="page-title">💬 Claude Chat Manager</h1>
			<p class="page-subtitle">Quản lý pool tài khoản Claude — xoay vòng khi bị limit</p>
		</div>
		<div class="header-actions">
			<button class="btn btn-outline" onclick={openClaudeWindow}>🌐 Mở Claude.ai</button>
			<button class="btn btn-primary" onclick={() => showAddModal = true}>+ Thêm Tài Khoản</button>
		</div>
	</div>

	{#if loading}
		<div class="loading">Đang tải danh sách tài khoản...</div>
	{:else if accounts.length === 0}
		<div class="empty-state">
			<span class="empty-icon">💬</span>
			<p>Chưa có tài khoản Claude nào.</p>
			<button class="btn btn-primary" onclick={() => showAddModal = true}>Thêm tài khoản đầu tiên</button>
		</div>
	{:else}
		<!-- Summary -->
		<div class="summary-bar">
			<div class="summary-item">
				<span class="summary-value">{accounts.length}</span>
				<span class="summary-label">Tổng</span>
			</div>
			<div class="summary-item good">
				<span class="summary-value">{accounts.filter(a => a.is_active && !isLimited(a)).length}</span>
				<span class="summary-label">Sẵn sàng</span>
			</div>
			<div class="summary-item warn">
				<span class="summary-value">{accounts.filter(a => isLimited(a)).length}</span>
				<span class="summary-label">Bị giới hạn</span>
			</div>
		</div>

		<!-- Account Grid -->
		<div class="accounts-grid">
			{#each accounts as acc (acc.id)}
				{@const limited = isLimited(acc)}
				<div class="account-card" class:limited style="--accent: {acc.color ?? '#f97316'}">
					<div class="card-header">
						<span class="card-emoji" style="background: {acc.color ?? '#f97316'}">{acc.emoji ?? '🤖'}</span>
						<div class="card-title">
							<span class="card-label">{acc.label}</span>
							{#if acc.note}
								<span class="card-note">{acc.note}</span>
							{/if}
						</div>
						<div class="card-status">
							{#if limited}
								<span class="status-badge limited">⏳ {formatTimeRemaining(acc.limit_reset_date)}</span>
							{:else if acc.is_active}
								<span class="status-badge active">🟢 Sẵn sàng</span>
							{:else}
								<span class="status-badge inactive">🔴 Tắt</span>
							{/if}
						</div>
					</div>
					<div class="card-actions">
						<button class="btn btn-xs btn-primary" onclick={() => openClaudeWindow(acc)}>🚀 Mở</button>
						{#if limited}
							<button class="btn btn-xs btn-outline" onclick={() => clearLimit(acc)}>🔓 Mở khóa</button>
						{/if}
						<button class="btn btn-xs btn-outline" onclick={() => startEdit(acc)}>✏️ Sửa</button>
						<button class="btn btn-xs btn-danger" onclick={() => deleteAccount(acc.id)}>🗑️</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Add Account Modal -->
{#if showAddModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => showAddModal = false}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<h3>➕ Thêm Tài Khoản Claude</h3>
			<div class="form-group">
				<label>Tên / Nhãn</label>
				<input type="text" bind:value={newLabel} placeholder="Ví dụ: Gmail chính" />
			</div>
			<div class="form-group">
				<label>Ghi chú</label>
				<input type="text" bind:value={newNote} placeholder="Email hoặc ghi chú" />
			</div>
			<div class="form-group">
				<label>Emoji</label>
				<div class="picker-row">
					{#each emojiOptions as em}
						<button class="picker-btn" class:selected={newEmoji === em} onclick={() => newEmoji = em}>{em}</button>
					{/each}
				</div>
			</div>
			<div class="form-group">
				<label>Màu</label>
				<div class="picker-row">
					{#each colorOptions as col}
						<button class="picker-btn color-btn" class:selected={newColor === col} style="background: {col}" onclick={() => newColor = col}></button>
					{/each}
				</div>
			</div>
			<div class="modal-actions">
				<button class="btn btn-outline" onclick={() => showAddModal = false}>Hủy</button>
				<button class="btn btn-primary" onclick={createAccount}>Tạo</button>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Account Modal -->
{#if editingAccount}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => editingAccount = null}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<h3>✏️ Sửa Tài Khoản</h3>
			<div class="form-group">
				<label>Tên / Nhãn</label>
				<input type="text" bind:value={editLabel} />
			</div>
			<div class="form-group">
				<label>Ghi chú</label>
				<input type="text" bind:value={editNote} />
			</div>
			<div class="form-group">
				<label>Emoji</label>
				<div class="picker-row">
					{#each emojiOptions as em}
						<button class="picker-btn" class:selected={editEmoji === em} onclick={() => editEmoji = em}>{em}</button>
					{/each}
				</div>
			</div>
			<div class="form-group">
				<label>Màu</label>
				<div class="picker-row">
					{#each colorOptions as col}
						<button class="picker-btn color-btn" class:selected={editColor === col} style="background: {col}" onclick={() => editColor = col}></button>
					{/each}
				</div>
			</div>
			<div class="form-group">
				<label>⏳ Đặt giới hạn (số giờ từ bây giờ)</label>
				<input type="number" bind:value={editLimitHours} placeholder="Ví dụ: 5 (= 5 giờ)" min="0" step="0.5" />
			</div>
			<div class="modal-actions">
				<button class="btn btn-outline" onclick={() => editingAccount = null}>Hủy</button>
				<button class="btn btn-primary" onclick={saveEdit}>Lưu</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.claude-page { max-width: 1200px; }

	.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
	.page-title { font-size: 1.75rem; font-weight: 800; color: var(--color-text-primary); margin: 0; }
	.page-subtitle { color: var(--color-text-muted); font-size: 0.875rem; margin: 0.25rem 0 0; }
	.header-actions { display: flex; gap: 0.5rem; }

	.loading { text-align: center; padding: 3rem; color: var(--color-text-muted); }

	.empty-state {
		text-align: center; padding: 4rem 2rem;
		background: var(--color-surface-100); border-radius: var(--radius-lg);
		border: 1px dashed rgba(255,255,255,0.1);
	}
	:global(html[data-theme='light']) .empty-state { border-color: rgba(0,0,0,0.1); background: #fff; }
	.empty-icon { font-size: 3rem; display: block; margin-bottom: 1rem; }
	.empty-state p { color: var(--color-text-muted); margin: 0 0 1rem; }

	/* Summary */
	.summary-bar {
		display: flex; gap: 1rem; margin-bottom: 1.5rem;
	}
	.summary-item {
		flex: 1; background: var(--color-surface-100); border-radius: var(--radius-lg);
		padding: 1rem 1.25rem; display: flex; flex-direction: column; align-items: center;
		border: 1px solid rgba(255,255,255,0.06);
	}
	:global(html[data-theme='light']) .summary-item { background: #fff; border-color: rgba(0,0,0,0.04); }
	.summary-value { font-size: 2rem; font-weight: 800; color: var(--color-text-primary); }
	.summary-item.good .summary-value { color: #10b981; }
	.summary-item.warn .summary-value { color: #f59e0b; }
	.summary-label { font-size: 0.6875rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }

	/* Account Grid */
	.accounts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
	.account-card {
		background: var(--color-surface-100); border-radius: var(--radius-lg);
		padding: 1.25rem; border: 1px solid rgba(255,255,255,0.06);
		border-left: 4px solid var(--accent); transition: all 0.3s;
	}
	:global(html[data-theme='light']) .account-card { background: #fff; border-color: rgba(0,0,0,0.04); border-left-color: var(--accent); }
	.account-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
	.account-card.limited { opacity: 0.7; }

	.card-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
	.card-emoji {
		width: 40px; height: 40px; border-radius: var(--radius-md);
		display: flex; align-items: center; justify-content: center;
		font-size: 1.25rem; flex-shrink: 0;
	}
	.card-title { flex: 1; min-width: 0; }
	.card-label { font-weight: 700; font-size: 0.9rem; color: var(--color-text-primary); display: block; }
	.card-note { font-size: 0.75rem; color: var(--color-text-muted); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.card-status { flex-shrink: 0; }

	.status-badge {
		font-size: 0.6875rem; font-weight: 600; padding: 0.25rem 0.5rem;
		border-radius: 1rem; white-space: nowrap;
	}
	.status-badge.active { background: rgba(16, 185, 129, 0.15); color: #10b981; }
	.status-badge.limited { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
	.status-badge.inactive { background: rgba(239, 68, 68, 0.15); color: #ef4444; }

	.card-actions { display: flex; gap: 0.375rem; justify-content: flex-end; }

	/* Modal */
	.modal-overlay {
		position: fixed; inset: 0; background: rgba(0,0,0,0.7);
		display: flex; align-items: center; justify-content: center;
		z-index: 100; backdrop-filter: blur(4px);
	}
	.modal {
		background: var(--color-surface-100); border-radius: var(--radius-lg);
		padding: 1.5rem; width: 90%; max-width: 480px;
		border: 1px solid rgba(255,255,255,0.1);
	}
	:global(html[data-theme='light']) .modal { background: #fff; border-color: rgba(0,0,0,0.1); }
	.modal h3 { margin: 0 0 1rem; font-size: 1.125rem; color: var(--color-text-primary); }
	.modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }

	.form-group { margin-bottom: 0.75rem; }
	.form-group label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); margin-bottom: 0.25rem; text-transform: uppercase; }
	.form-group input, .form-group select {
		width: 100%; padding: 0.5rem 0.75rem; font-size: 0.875rem;
		background: var(--color-surface-200); border: 1px solid rgba(255,255,255,0.1);
		border-radius: var(--radius-md); color: var(--color-text-primary);
	}
	:global(html[data-theme='light']) .form-group input { background: #f3f4f6; border-color: rgba(0,0,0,0.1); }

	/* Picker */
	.picker-row { display: flex; gap: 0.375rem; flex-wrap: wrap; }
	.picker-btn {
		width: 36px; height: 36px; border-radius: var(--radius-md);
		border: 2px solid transparent; cursor: pointer; font-size: 1.125rem;
		background: var(--color-surface-200); display: flex; align-items: center;
		justify-content: center; transition: all 0.2s;
	}
	:global(html[data-theme='light']) .picker-btn { background: #f3f4f6; }
	.picker-btn.selected { border-color: var(--color-brand-400); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3); }
	.color-btn { border-radius: 50%; width: 32px; height: 32px; }

	/* Buttons */
	.btn {
		display: inline-flex; align-items: center; gap: 0.375rem;
		padding: 0.5rem 1rem; border-radius: var(--radius-md); font-weight: 600;
		font-size: 0.8125rem; cursor: pointer; transition: all 0.2s; border: none;
	}
	.btn-xs { padding: 0.25rem 0.5rem; font-size: 0.6875rem; }
	.btn-primary { background: var(--color-brand-500); color: #fff; }
	.btn-primary:hover { background: var(--color-brand-600); }
	.btn-outline { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: var(--color-text-secondary); }
	:global(html[data-theme='light']) .btn-outline { border-color: rgba(0,0,0,0.15); }
	.btn-outline:hover { background: rgba(255,255,255,0.05); }
	.btn-danger { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); }
	.btn-danger:hover { background: rgba(239, 68, 68, 0.25); }

	@media (max-width: 768px) {
		.page-header { flex-direction: column; }
		.summary-bar { flex-direction: column; }
		.accounts-grid { grid-template-columns: 1fr; }
	}
</style>
