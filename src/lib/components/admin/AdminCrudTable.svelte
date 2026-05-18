<!-- AdminCrudTable.svelte — Reusable CRUD table for admin pages -->
<script lang="ts">
	import { formatDate, truncate, statusClass } from '$lib/stores/admin.svelte';

	interface Column {
		key: string;
		label: string;
		type?: 'boolean' | 'status' | 'date' | 'truncate' | 'image';
	}

	interface Props {
		title: string;
		columns: Column[];
		items: Record<string, unknown>[];
		showCreate?: boolean;
		showActions?: boolean;
		showDelete?: boolean;
		oncreate?: () => void;
		onedit?: (item: Record<string, unknown>) => void;
		ondelete?: (item: Record<string, unknown>) => void;
	}

	let {
		title,
		columns,
		items,
		showCreate = false,
		showActions = false,
		showDelete = false,
		oncreate,
		onedit,
		ondelete,
	}: Props = $props();
</script>

<div class="crud-table-wrapper">
	<!-- Header -->
	<div class="crud-header">
		<h2>{title}</h2>
		{#if showCreate}
			<button class="btn-create" onclick={oncreate}>➕ Tạo mới</button>
		{/if}
	</div>

	<!-- Table -->
	<div class="table-scroll">
		<table class="crud-table">
			<thead>
				<tr>
					{#each columns as col}
						<th>{col.label}</th>
					{/each}
					{#if showActions}
						<th class="th-actions">Thao tác</th>
					{/if}
				</tr>
			</thead>
			<tbody>
				{#if items.length === 0}
					<tr>
						<td colspan={columns.length + (showActions ? 1 : 0)} class="empty-row">
							Chưa có dữ liệu
						</td>
					</tr>
				{/if}
				{#each items as item (item.id ?? Math.random())}
					<tr>
						{#each columns as col}
							<td data-label={col.label}>
								{#if col.type === 'boolean'}
									<span class="badge {item[col.key] ? 'badge-green' : 'badge-gray'}">
										{item[col.key] ? '✓' : '✗'}
									</span>
								{:else if col.type === 'status'}
									<span class="badge {statusClass(String(item[col.key] ?? ''))}">
										{item[col.key]}
									</span>
								{:else if col.type === 'date'}
									<span class="cell-date">{formatDate(String(item[col.key] ?? ''))}</span>
								{:else if col.type === 'truncate'}
									<span class="cell-truncate" title={String(item[col.key] ?? '')}>
										{truncate(String(item[col.key] ?? ''), 30)}
									</span>
								{:else if col.type === 'image'}
									{#if item[col.key]}
										<img src={String(item[col.key])} alt="" class="cell-image" />
									{:else}
										<span class="cell-no-image">—</span>
									{/if}
								{:else}
									{item[col.key] ?? '—'}
								{/if}
							</td>
						{/each}
						{#if showActions}
							<td class="td-actions" data-label="Thao tác">
								<button class="btn-edit" onclick={() => onedit?.(item)} title="Chỉnh sửa">✏️</button>
								{#if showDelete}
									<button class="btn-delete" onclick={() => ondelete?.(item)} title="Xóa">🗑️</button>
								{/if}
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.crud-table-wrapper {
		background: var(--color-surface-100);
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.06);
		box-shadow: var(--shadow-card);
	}

	:global(html[data-theme='light']) .crud-table-wrapper {
		background: #fff;
		border-color: rgba(0, 0, 0, 0.06);
		box-shadow: 0 2px 16px rgba(0, 0, 0, 0.06);
	}

	.crud-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem 1.5rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	:global(html[data-theme='light']) .crud-header {
		border-bottom-color: rgba(0, 0, 0, 0.06);
	}

	.crud-header h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text-primary);
	}

	.btn-create {
		padding: 0.5rem 1rem;
		background: linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600));
		color: #fff;
		border: none;
		border-radius: var(--radius-md);
		font-weight: 600;
		font-size: 0.8125rem;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-create:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(12, 113, 61, 0.3);
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
		font-weight: 600;
		color: var(--color-text-muted);
		background: var(--color-surface-200);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		white-space: nowrap;
	}

	:global(html[data-theme='light']) .crud-table th {
		background: #f9fafb;
		color: #666;
	}

	.crud-table td {
		padding: 0.75rem 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.04);
		color: var(--color-text-primary);
	}

	:global(html[data-theme='light']) .crud-table td {
		border-top-color: rgba(0, 0, 0, 0.04);
	}

	.crud-table tr:hover td {
		background: rgba(12, 113, 61, 0.04);
	}

	.empty-row {
		text-align: center;
		color: var(--color-text-muted);
		padding: 3rem 1rem !important;
		font-style: italic;
	}

	/* Badges */
	.badge {
		display: inline-block;
		padding: 0.125rem 0.5rem;
		border-radius: 1rem;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: capitalize;
	}

	:global(.badge-green) { background: rgba(16, 185, 129, 0.15); color: #34d399; }
	:global(.badge-red) { background: rgba(239, 68, 68, 0.15); color: #f87171; }
	:global(.badge-yellow) { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
	:global(.badge-blue) { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
	:global(.badge-gray) { background: rgba(107, 114, 128, 0.15); color: #9ca3af; }
	:global(.badge-purple) { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }

	:global(html[data-theme='light'] .badge-green) { background: rgba(16, 185, 129, 0.1); color: #059669; }
	:global(html[data-theme='light'] .badge-red) { background: rgba(239, 68, 68, 0.1); color: #dc2626; }
	:global(html[data-theme='light'] .badge-yellow) { background: rgba(245, 158, 11, 0.1); color: #d97706; }
	:global(html[data-theme='light'] .badge-blue) { background: rgba(59, 130, 246, 0.1); color: #2563eb; }
	:global(html[data-theme='light'] .badge-gray) { background: rgba(107, 114, 128, 0.1); color: #6b7280; }
	:global(html[data-theme='light'] .badge-purple) { background: rgba(139, 92, 246, 0.1); color: #7c3aed; }

	.cell-date {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.cell-truncate {
		font-size: 0.75rem;
		max-width: 200px;
		display: inline-block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cell-image {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-sm);
		object-fit: cover;
	}

	.cell-no-image {
		color: var(--color-text-muted);
	}

	.th-actions {
		width: 100px;
		text-align: center;
	}

	.td-actions {
		text-align: center;
		white-space: nowrap;
	}

	.btn-edit,
	.btn-delete {
		padding: 0.25rem 0.5rem;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1rem;
		border-radius: var(--radius-sm);
		transition: all 0.2s;
	}

	.btn-delete:hover {
		background: rgba(239, 68, 68, 0.1);
	}

	@media (max-width: 768px) {
		.crud-header {
			flex-direction: column;
			gap: 1rem;
			align-items: flex-start;
		}
		.crud-table thead {
			display: none;
		}
		.crud-table, .crud-table tbody {
			display: block;
			width: 100%;
		}
		.crud-table tr {
			display: flex;
			flex-direction: column;
			margin-bottom: 1rem;
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: var(--radius-md);
			background: var(--color-surface-200);
			padding: 0.5rem;
		}
		:global(html[data-theme='light']) .crud-table tr {
			border-color: rgba(0, 0, 0, 0.1);
			background: #f9fafb;
		}
		.crud-table td {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 0.5rem !important;
			border: none !important;
			border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
		}
		:global(html[data-theme='light']) .crud-table td {
			border-bottom-color: rgba(0, 0, 0, 0.05) !important;
		}
		.crud-table td:last-child {
			border-bottom: none !important;
		}
		.crud-table td::before {
			content: attr(data-label);
			font-weight: 600;
			color: var(--color-text-muted);
			font-size: 0.75rem;
			text-transform: uppercase;
			margin-right: 1rem;
		}
		.td-actions {
			justify-content: flex-end !important;
		}
	}
</style>
