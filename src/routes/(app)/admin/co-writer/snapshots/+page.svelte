<!-- Ảnh chụp Co-Writer — tạo, kích hoạt, quay lui (CW-500) -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		allowsCapability,
		fetchRuntimeCapabilities,
		type RuntimeCapabilities
	} from '$lib/runtime';
	import { toast_error, toast_success } from '$lib/stores/admin.svelte';
	import {
		activateSnapshot,
		createSnapshot,
		formatBytes,
		listSnapshots,
		rollbackSnapshot,
		type ActiveSnapshot,
		type SnapshotManifest
	} from '$lib/co-writer/snapshots';

	let capabilities = $state<RuntimeCapabilities | null>(null);
	let snapshots = $state<SnapshotManifest[]>([]);
	let active = $state<ActiveSnapshot | null>(null);
	let root = $state<string | null>(null);
	let label = $state('');
	let loading = $state(false);
	let busy = $state('');

	let canManage = $derived(allowsCapability(capabilities, 'snapshot_create'));
	let activeManifest = $derived(
		snapshots.find((snapshot) => snapshot.version === active?.version) ?? null
	);
	/** Bản mới nhất chưa được kích hoạt — thứ tác giả thường muốn đẩy lên. */
	let newest = $derived(snapshots.length ? snapshots[snapshots.length - 1] : null);

	onMount(async () => {
		try {
			capabilities = await fetchRuntimeCapabilities();
		} catch {
			capabilities = null;
		}
		await load();
	});

	async function load() {
		loading = true;
		const res = await listSnapshots();
		loading = false;
		if (!res.success) {
			toast_error(res.message || 'Không đọc được kho ảnh chụp');
			return;
		}
		snapshots = res.data.snapshots;
		active = res.data.active;
		root = res.data.root;
	}

	async function create() {
		busy = 'create';
		const res = await createSnapshot(label.trim() || undefined);
		busy = '';
		if (!res.success) {
			toast_error(res.message || 'Không chụp được');
			return;
		}
		toast_success(
			`Đã chụp bản ${res.data.snapshot.version} — chưa kích hoạt, website vẫn giữ bản cũ`
		);
		label = '';
		await load();
	}

	async function activate(version: number) {
		busy = `activate-${version}`;
		const res = await activateSnapshot(version);
		busy = '';
		if (!res.success) {
			// Đây là đường thất bại quan trọng nhất: xác minh trượt thì bản đang
			// phục vụ không hề bị chạm tới. Nói thẳng điều đó ra.
			toast_error(`${res.message || 'Không kích hoạt được'} — bản đang chạy giữ nguyên.`);
			await load();
			return;
		}
		toast_success(`Đang phục vụ bản ${res.data.active.version}`);
		await load();
	}

	async function rollback() {
		busy = 'rollback';
		const res = await rollbackSnapshot();
		busy = '';
		if (!res.success) {
			toast_error(`${res.message || 'Không quay lui được'} — bản đang chạy giữ nguyên.`);
			await load();
			return;
		}
		toast_success(`Đã quay về bản ${res.data.active.version}`);
		await load();
	}

	function when(value: string): string {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('vi-VN');
	}
</script>

<svelte:head><title>Ảnh Chụp Co-Writer — Selorson</title></svelte:head>

<div class="snapshots">
	<header class="page-head">
		<div>
			<h2>📦 Ảnh Chụp Co-Writer</h2>
			<p class="text-muted">
				Website chạy trên một bản chụp chỉ đọc. Chụp và kích hoạt là hai việc riêng: chụp thêm một
				bản không đụng tới bản đang phục vụ, và kích hoạt chỉ đổi con trỏ sau khi bản mới đã qua
				kiểm tra băm, tính toàn vẹn và schema.
			</p>
		</div>
		<button class="btn" onclick={load} disabled={loading}>
			{loading ? '⏳' : '↻'} Nạp lại
		</button>
	</header>

	{#if !canManage}
		<div class="banner warn">
			Máy này chạy ở chế độ <strong>{capabilities?.target ?? 'không rõ'}</strong> nên không có quyền
			<code>snapshot_create</code>. Chỉ xem được danh sách.
		</div>
	{/if}

	<section class="card">
		<h3 class="card-title">Đang phục vụ</h3>
		{#if active}
			<div class="active-line">
				<span class="badge">bản {active.version}</span>
				<span class="text-muted">kích hoạt lúc {when(active.activated_at)}</span>
				{#if activeManifest}
					<span class="text-muted">schema {activeManifest.database_schema}</span>
					<span class="text-muted">{formatBytes(activeManifest.byte_size)}</span>
				{/if}
			</div>
			<div class="btn-row">
				{#if active.previous_version !== null}
					<button
						class="btn"
						onclick={rollback}
						disabled={!canManage || busy === 'rollback'}
					>
						{busy === 'rollback' ? '⏳ Đang quay lui...' : `↩ Quay về bản ${active.previous_version}`}
					</button>
					<span class="text-muted">
						Quay lui cũng phải qua đúng các phép kiểm tra — một bản cũ đã hỏng sẽ bị từ chối.
					</span>
				{:else}
					<span class="text-muted">Chưa có bản trước để quay lui.</span>
				{/if}
			</div>
		{:else}
			<p class="text-muted">
				Chưa có bản nào được kích hoạt. Website đang đọc tệp <code>co_writer.db</code> theo cách cũ,
				hoặc chưa có dữ liệu.
			</p>
		{/if}
	</section>

	<section class="card">
		<h3 class="card-title">Chụp bản mới</h3>
		<p class="text-muted">
			Sao lưu an toàn ngay khi cơ sở dữ liệu đang mở, không cần đóng gì cả. Bản mới
			<strong>không</strong> tự kích hoạt.
		</p>
		<div class="form-row">
			<label for="label">Ghi chú (tuỳ chọn)</label>
			<input
				id="label"
				type="text"
				bind:value={label}
				placeholder="ví dụ: xong chương 12"
				maxlength="200"
			/>
		</div>
		<div class="btn-row">
			<button class="btn btn-primary" onclick={create} disabled={!canManage || busy === 'create'}>
				{busy === 'create' ? '⏳ Đang chụp...' : '📸 Chụp bản mới'}
			</button>
			{#if root}<span class="text-muted"><code>{root}</code></span>{/if}
		</div>
	</section>

	<section class="card">
		<h3 class="card-title">Các bản đã chụp</h3>
		{#if snapshots.length}
			<ul class="list">
				{#each [...snapshots].reverse() as snapshot (snapshot.version)}
					<li class:running={snapshot.version === active?.version}>
						<span class="badge">bản {snapshot.version}</span>
						{#if snapshot.version === active?.version}
							<span class="serving">đang phục vụ</span>
						{/if}
						<span class="text-muted">{when(snapshot.created_at)}</span>
						<span class="text-muted">{formatBytes(snapshot.byte_size)}</span>
						<span class="text-muted">schema {snapshot.database_schema}</span>
						{#if snapshot.label}<span class="label-chip">{snapshot.label}</span>{/if}
						<code class="hash">{snapshot.sha256.slice(0, 12)}</code>
						<span class="spacer"></span>
						<button
							class="btn btn-sm"
							onclick={() => activate(snapshot.version)}
							disabled={!canManage ||
								busy === `activate-${snapshot.version}` ||
								snapshot.version === active?.version}
						>
							{busy === `activate-${snapshot.version}` ? '⏳' : 'Kích hoạt'}
						</button>
					</li>
				{/each}
			</ul>

			{#if newest && newest.version !== active?.version}
				<p class="text-muted">
					Bản mới nhất là <strong>{newest.version}</strong> nhưng website đang phục vụ
					{active ? `bản ${active.version}` : 'tệp cũ'}. Kích hoạt bản {newest.version} rồi chạy
					<code>Sync_AI_Len_Mang.bat</code> để đẩy lên Fly.io.
				</p>
			{/if}
		{:else}
			<div class="empty-state">
				<div class="empty-icon">📦</div>
				<p>Chưa có bản chụp nào. Bấm <strong>Chụp bản mới</strong> ở trên.</p>
			</div>
		{/if}
	</section>
</div>

<style>
	.snapshots { display: flex; flex-direction: column; gap: 1rem; padding-bottom: 3rem; }

	.page-head {
		display: flex; justify-content: space-between; align-items: flex-start;
		gap: 1rem; flex-wrap: wrap;
	}
	.page-head h2 { margin: 0 0 0.25rem; font-size: 1.25rem; }
	.page-head p { margin: 0; max-width: 60ch; }

	.card {
		background: var(--color-surface-100); border: 1px solid var(--color-surface-300);
		border-radius: var(--radius-md); padding: 1.25rem;
		display: flex; flex-direction: column; gap: 0.75rem;
	}
	.card-title { margin: 0; font-size: 1rem; font-weight: 700; }

	.banner {
		padding: 0.625rem 0.875rem; border-radius: var(--radius-md); font-size: 0.8125rem;
	}
	.banner.warn { background: rgba(234, 179, 8, 0.12); border: 1px solid rgba(234, 179, 8, 0.35); }

	.form-row { display: flex; flex-direction: column; gap: 0.25rem; }
	.form-row label { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); }
	.form-row input {
		background: var(--color-surface-200); border: 1px solid var(--color-surface-300);
		border-radius: var(--radius-md); padding: 0.5rem 0.625rem;
		color: inherit; font: inherit;
	}

	.btn-row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
	.btn-sm { padding: 0.25rem 0.625rem; font-size: 0.75rem; }

	.active-line { display: flex; gap: 0.625rem; align-items: center; flex-wrap: wrap; }
	.badge {
		background: var(--color-surface-300); border-radius: 999px;
		padding: 0.125rem 0.625rem; font-size: 0.75rem; font-weight: 700;
	}
	.serving { color: #22c55e; font-size: 0.75rem; font-weight: 700; }
	.label-chip {
		background: var(--color-surface-200); border: 1px solid var(--color-surface-300);
		border-radius: var(--radius-md); padding: 0.0625rem 0.5rem; font-size: 0.6875rem;
	}
	.hash { color: var(--color-text-muted); font-size: 0.75rem; }

	.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
	.list li {
		display: flex; gap: 0.625rem; align-items: center; flex-wrap: wrap;
		font-size: 0.75rem; padding: 0.5rem; border-radius: var(--radius-md);
		border: 1px solid transparent;
	}
	.list li.running { background: var(--color-surface-200); border-color: var(--color-surface-300); }
	.list .spacer { flex: 1; }

	.empty-state { text-align: center; padding: 2rem 1rem; color: var(--color-text-muted); }
	.empty-icon { font-size: 2.5rem; margin-bottom: 0.75rem; opacity: 0.5; }
	.text-muted { color: var(--color-text-muted); font-size: 0.8125rem; }
</style>
