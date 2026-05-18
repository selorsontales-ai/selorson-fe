<script lang="ts">
	import {
		adminGet,
		adminPost,
		adminPut,
		adminDelete,
		toast_success,
		toast_error,
		formatDateTime,
	} from "$lib/stores/admin.svelte";
	import { onMount } from "svelte";

	let items = $state<Record<string, any>[]>([]);
	let managers = $state<Record<string, any>[]>([]);
	let selectedIds = $state<number[]>([]);
	let selectedManager = $state<number | null>(null);
	let viewingItem = $state<Record<string, any> | null>(null);
	let replyingItem = $state<Record<string, any> | null>(null);
	let replyText = $state("");
	let sending = $state(false);

	async function fetchItems() {
		try {
			const r = await adminGet<any>("/admin/contacts");
			if (r.success) items = (r.data as any).data ?? [];
		} catch {}
	}
	async function fetchManagers() {
		try {
			const r = await adminGet<any>("/admin/users");
			if (r.success)
				managers = ((r.data as any).data ?? []).filter(
					(u: any) => u.role === "manager" || u.role === "admin",
				);
		} catch {}
	}

	function toggleAll(e: Event) {
		const c = (e.target as HTMLInputElement).checked;
		selectedIds = c
			? items
					.filter((i) => !i.dispatched_at && i.status !== "replied")
					.map((i) => i.id)
			: [];
	}

	async function bulkDelete() {
		if (
			!selectedIds.length ||
			!confirm(`Xóa ${selectedIds.length} Liên lạc?`)
		)
			return;
		try {
			await adminPost("/admin/contacts/bulk-delete", {
				ids: selectedIds,
			});
			toast_success("Đã xóa!");
			selectedIds = [];
			fetchItems();
		} catch {
			toast_error("Lỗi");
		}
	}
	async function dispatchSelected() {
		try {
			await adminPost("/admin/contacts/dispatch", {
				contact_ids: selectedIds,
				manager_id: selectedManager,
			});
			toast_success("Đã chuyển tiếp!");
			selectedIds = [];
			fetchItems();
		} catch {
			toast_error("Lỗi");
		}
	}

	async function submitReply() {
		if (!replyText || !replyingItem) return;
		sending = true;
		try {
			await adminPost(`/admin/contacts/${replyingItem.id}/reply`, {
				reply_message: replyText,
			});
			toast_success("Đã gửi!");
			replyingItem = null;
			fetchItems();
		} catch {
			toast_error("Lỗi");
		} finally {
			sending = false;
		}
	}
	async function archive(item: Record<string, any>) {
		try {
			await adminPut(`/admin/contacts/${item.id}`, {
				status: "archived",
			});
			toast_success("Đã lưu trữ.");
			fetchItems();
		} catch {
			toast_error("Lỗi");
		}
	}
	async function deleteItem(item: Record<string, any>) {
		if (!confirm("Xóa thư này?")) return;
		try {
			await adminDelete(`/admin/contacts/${item.id}`);
			toast_success("Đã xóa!");
			fetchItems();
		} catch {
			toast_error("Lỗi");
		}
	}

	function statusCls(v: string) {
		return v === "replied"
			? "badge-green"
			: v === "archived"
				? "badge-gray"
				: "badge-yellow";
	}

	onMount(() => {
		fetchItems();
		fetchManagers();
	});
</script>

<svelte:head><title>Admin - Contacts</title></svelte:head>

<div class="contacts-card">
	<div class="header-actions">
		<h2>✉️ Quản lý Contacts</h2>
		{#if selectedIds.length > 0}
			<div class="dispatch-actions">
				<select bind:value={selectedManager}
					><option value={null}>-- Giao TẤT CẢ --</option
					>{#each managers as m}<option value={m.id}>{m.name}</option
						>{/each}</select
				>
				<button class="btn-dispatch" onclick={dispatchSelected}
					>Chuyển tiếp {selectedIds.length}</button
				>
				<button class="btn-dispatch btn-danger" onclick={bulkDelete}
					>🗑 Xóa {selectedIds.length}</button
				>
			</div>
		{/if}
	</div>

	<div class="table-scroll">
		<table class="crud-table">
			<thead
				><tr
					><th
						><input
							type="checkbox"
							onchange={toggleAll}
							checked={selectedIds.length === items.length &&
								items.length > 0}
						/></th
					><th>ID</th><th>Tên / Email</th><th>Chủ đề</th><th
						>Trạng thái</th
					><th>Assignee</th><th>Ngày</th><th>Thao tác</th></tr
				></thead
			>
			<tbody>
				{#if !items.length}<tr
						><td colspan="8" class="empty-row">Chưa có dữ liệu</td
						></tr
					>{/if}
				{#each items as item (item.id)}
					<tr>
						<td data-label="Chọn"
							><input
								type="checkbox"
								value={item.id}
								bind:group={selectedIds}
							/></td
						>
						<td data-label="ID">#{item.id}</td>
						<td data-label="Tên / Email"
							><strong>{item.name}</strong><br /><span class="sub"
								>{item.email}</span
							></td
						>
						<td data-label="Chủ đề">{item.subject}</td>
						<td data-label="Trạng thái"
							><span class="badge {statusCls(item.status)}"
								>{item.status}</span
							>{#if item.dispatched_at}<span
									class="badge badge-purple"
									style="margin-left:4px">Dispatched</span
								>{/if}</td
						>
						<td data-label="Assignee" class="sub"
							>{#if item.assignee}{item.assignee
									.name}{/if}{#if item.replier}<br />Replier: {item
									.replier.name}{/if}</td
						>
						<td data-label="Ngày" class="sub"
							>{formatDateTime(item.created_at)}</td
						>
						<td data-label="Thao tác" class="action-cell">
							<button
								class="btn-sm"
								onclick={() => (viewingItem = item)}>Xem</button
							>
							{#if item.status !== "replied"}<button
									class="btn-sm"
									onclick={() => {
										replyingItem = item;
										replyText = "";
									}}>Trả lời</button
								>{/if}
							{#if item.status !== "archived"}<button
									class="btn-sm btn-gray"
									onclick={() => archive(item)}
									>Lưu trữ</button
								>{/if}
							<button
								class="btn-sm btn-red"
								onclick={() => deleteItem(item)}>Xóa</button
							>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<!-- View Modal -->
{#if viewingItem}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-overlay"
		onmousedown={(e) => {
			if (e.target === e.currentTarget) viewingItem = null;
		}}
	>
		<div class="modal-content">
			<div class="modal-top">
				<h3>Chi tiết #{viewingItem.id}</h3>
				<button onclick={() => (viewingItem = null)}>✕</button>
			</div>
			<p>
				<strong>Người gửi:</strong>
				{viewingItem.name} ({viewingItem.email})
			</p>
			<p>
				<strong>Ngày:</strong>
				{formatDateTime(viewingItem.created_at)}
			</p>
			<p><strong>Chủ đề:</strong> {viewingItem.subject ?? "Không có"}</p>
			<div class="msg-box">
				<strong>Nội dung:</strong>
				<p style="white-space:pre-wrap;margin-top:.5rem">
					{viewingItem.message}
				</p>
			</div>
			{#if viewingItem.status === "replied"}
				<div class="msg-box reply-box">
					<strong style="color:#34d399"
						>Phản hồi ({viewingItem.replier?.name ??
							"Admin"}):</strong
					>
					<p style="white-space:pre-wrap;margin-top:.5rem">
						{viewingItem.reply_message}
					</p>
				</div>
			{/if}
			<div class="form-actions">
				<button class="btn-cancel" onclick={() => (viewingItem = null)}
					>Đóng</button
				>
			</div>
		</div>
	</div>
{/if}

<!-- Reply Modal -->
{#if replyingItem}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-overlay"
		onmousedown={(e) => {
			if (e.target === e.currentTarget) replyingItem = null;
		}}
	>
		<div class="modal-content">
			<h3>Trả lời: {replyingItem.name}</h3>
			<div class="msg-box">
				<strong>Nội dung khách:</strong>
				<p>{replyingItem.message}</p>
			</div>
			<textarea
				bind:value={replyText}
				rows="6"
				placeholder="Nhập phản hồi..."
			></textarea>
			<div class="form-actions">
				<button class="btn-cancel" onclick={() => (replyingItem = null)}
					>Hủy</button
				>
				<button
					class="btn-save"
					onclick={submitReply}
					disabled={sending}>{sending ? "Đang gửi..." : "Gửi"}</button
				>
			</div>
		</div>
	</div>
{/if}

<style>
	.contacts-card {
		background: var(--color-surface-100);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		border: 1px solid rgba(255, 255, 255, 0.04);
	}
	:global(html[data-theme="light"]) .contacts-card {
		background: #fff;
		border-color: rgba(0, 0, 0, 0.04);
	}
	.header-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.header-actions h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
	}
	.dispatch-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.dispatch-actions select {
		padding: 0.5rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-surface-400);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
	}
	.btn-dispatch {
		padding: 0.5rem 1rem;
		background: #3b82f6;
		color: #fff;
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		font-weight: 600;
		font-size: 0.8125rem;
	}
	.btn-danger {
		background: #ef4444;
		margin-left: 4px;
	}
	.table-scroll {
		overflow-x: auto;
	}
	.crud-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
	}
	.crud-table th {
		padding: 0.75rem 1rem;
		text-align: left;
		background: var(--color-surface-200);
		color: var(--color-text-muted);
		font-size: 0.75rem;
		text-transform: uppercase;
	}
	:global(html[data-theme="light"]) .crud-table th {
		background: #f9fafb;
		color: #666;
	}
	.crud-table td {
		padding: 0.75rem 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.04);
	}
	:global(html[data-theme="light"]) .crud-table td {
		border-top-color: rgba(0, 0, 0, 0.04);
	}
	.empty-row {
		text-align: center;
		color: var(--color-text-muted);
		padding: 3rem 1rem !important;
		font-style: italic;
	}
	.sub {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}
	.badge {
		padding: 0.25rem 0.5rem;
		border-radius: 1rem;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: capitalize;
		display: inline-block;
	}
	.action-cell {
		white-space: nowrap;
	}
	.btn-sm {
		padding: 0.25rem 0.5rem;
		background: var(--color-brand-500);
		color: #fff;
		border: none;
		border-radius: 0.25rem;
		cursor: pointer;
		margin-right: 0.25rem;
		font-size: 0.75rem;
	}
	.btn-gray {
		background: var(--color-surface-400);
	}
	.btn-red {
		background: transparent;
		color: #f87171;
	}
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 99999;
		backdrop-filter: blur(4px);
	}
	.modal-content {
		background: var(--color-surface-100);
		padding: 1.5rem;
		border-radius: var(--radius-lg);
		width: 100%;
		max-width: 500px;
		max-height: 85vh;
		overflow-y: auto;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}
	:global(html[data-theme="light"]) .modal-content {
		background: #fff;
		border-color: rgba(0, 0, 0, 0.08);
	}
	.modal-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		padding-bottom: 0.75rem;
		margin-bottom: 1rem;
	}
	.modal-top h3 {
		margin: 0;
	}
	.modal-top button {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: var(--color-text-muted);
	}
	.msg-box {
		background: var(--color-surface-200);
		padding: 1rem;
		border-radius: var(--radius-md);
		margin-bottom: 1rem;
		font-size: 0.875rem;
	}
	.reply-box {
		border-left: 4px solid #34d399;
	}
	textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--color-surface-400);
		border-radius: var(--radius-md);
		margin-bottom: 1rem;
		font-family: inherit;
		background: var(--color-surface-200);
		color: var(--color-text-primary);
	}
</style>
