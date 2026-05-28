<!-- Admin LLM Gateway — AI Gateway management ported from NeuroForge -->
<script lang="ts">
	import { adminGet, adminPost, adminPut, adminDelete, showToast, toast_success, toast_error } from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';

	// --- Types ---
	interface Provider {
		id: string;
		name: string;
		base_url: string | null;
		default_model: string;
		format: string;
		needs_key: boolean;
		signup_url: string | null;
		free_tier: string;
		key_hint: string | null;
	}

	interface LlmKey {
		id: number;
		provider: string;
		label: string;
		enabled: boolean;
		created_at: string;
	}

	interface ProviderStatus {
		name: string;
		status: 'ready' | 'no_key' | 'cooldown';
		keys_count: number;
		cooldown_keys: number;
	}

	interface RouterStatus {
		enabled: boolean;
		ready_providers: number;
		total_providers: number;
		providers: Record<string, ProviderStatus>;
		fallback_order: string[];
	}

	interface KeyExport {
		provider: string;
		label: string;
		raw_key: string;
	}

	interface TokenStats {
		today_used: number; today_saved: number;
		week_used: number; week_saved: number;
		month_used: number; month_saved: number;
		year_used: number; year_saved: number;
	}

	// --- State ---
	let isGatewayEnabled = $state(false);
	let providers = $state<Provider[]>([]);
	let keys = $state<LlmKey[]>([]);
	let routerStatus = $state<RouterStatus | null>(null);
	let fallbackOrder = $state<string[]>([]);
	let tokenStats = $state<TokenStats | null>(null);
	let showAllKeys = $state(false);

	let loadingStatus = $state(true);
	let showAddKeyModal = $state(false);
	let showBackupModal = $state(false);
	let testingKeyId = $state<number | null>(null);
	let keyTestResults = $state<Record<number, string>>({});

	let newKeyProvider = $state('');
	let newKeyLabel = $state('');
	let newKeyRawVal = $state('');
	let backupJsonString = $state('');

	// Drag & Drop
	let dragIdx = $state(-1);
	let dragOverIdx = $state(-1);

	// Chat Playground
	let adminPrompt = $state('');
	let adminResponse = $state('');
	let isAdminLoading = $state(false);
	let useRtk = $state(true);
	let rtkStats = $state<{enabled: boolean; original_chars: number; compressed_chars: number; saved_chars: number} | null>(null);

	const suggestedQuestions = [
		'Tóm tắt tình hình AI hiện tại',
		'Gợi ý chiến lược content cho tháng này',
		'So sánh các model AI phổ biến',
	];

	// --- API Calls ---
	async function loadAll() {
		loadingStatus = true;
		try {
			const [pRes, kRes, sRes, cRes, tRes] = await Promise.all([
				adminGet<Provider[]>('/admin/llm/providers'),
				adminGet<LlmKey[]>('/admin/llm/keys'),
				adminGet<RouterStatus>('/admin/llm/status'),
				adminGet<{ enabled: boolean; rtk_enabled: boolean; fallback_order: string[] }>('/admin/llm/config'),
				adminGet<TokenStats>('/admin/llm/token-stats'),
			]);
			if (pRes.success) providers = pRes.data ?? [];
			if (kRes.success) keys = kRes.data ?? [];
			if (sRes.success) routerStatus = sRes.data ?? null;
			if (cRes.success) {
				isGatewayEnabled = cRes.data?.enabled ?? false;
				useRtk = cRes.data?.rtk_enabled ?? true;
				fallbackOrder = cRes.data?.fallback_order ?? [];
			}
			if (tRes.success) tokenStats = tRes.data ?? null;
		} catch { /* ignore */ }
		finally { loadingStatus = false; }
	}

	async function toggleGateway() {
		isGatewayEnabled = !isGatewayEnabled;
		await adminPut('/admin/llm/config', { enabled: isGatewayEnabled });
		toast_success(isGatewayEnabled ? 'Cổng AI đã bật' : 'Cổng AI đã tắt');
	}

	async function toggleRtk() {
		useRtk = !useRtk;
		await adminPut('/admin/llm/config', { rtk_enabled: useRtk });
		toast_success(useRtk ? 'RTK Filter đã bật' : 'RTK Filter đã tắt');
	}

	async function addKey() {
		if (!newKeyProvider || !newKeyRawVal.trim()) {
			toast_error('Chọn provider và nhập key');
			return;
		}
		const res = await adminPost<LlmKey>('/admin/llm/keys', {
			provider: newKeyProvider,
			raw_key: newKeyRawVal.trim(),
			label: newKeyLabel.trim() || null,
		});
		if (res.success) {
			toast_success('Thêm key thành công!');
			newKeyProvider = ''; newKeyLabel = ''; newKeyRawVal = '';
			showAddKeyModal = false;
			await loadAll();
		} else {
			toast_error(res.message || 'Lỗi khi thêm key');
		}
	}

	async function deleteKey(id: number) {
		if (!confirm('Xóa key này?')) return;
		await adminDelete(`/admin/llm/keys/${id}`);
		toast_success('Đã xóa key');
		await loadAll();
	}

	async function testKey(id: number) {
		testingKeyId = id;
		keyTestResults = { ...keyTestResults, [id]: '⏳ Đang test...' };
		try {
			const res = await adminPost<any>(`/admin/llm/keys/${id}/test`);
			keyTestResults = { ...keyTestResults, [id]: res.message || '✅ OK' };
		} catch (err: any) {
			keyTestResults = { ...keyTestResults, [id]: err?.message || '❌ Lỗi không xác định' };
		}
		testingKeyId = null;
	}

	async function exportKeys() {
		const res = await adminPost<KeyExport[]>('/admin/llm/keys/export');
		if (res.success && res.data) {
			backupJsonString = JSON.stringify(res.data, null, 2);
			showBackupModal = true;
		}
	}

	async function importKeys() {
		try {
			const parsed = JSON.parse(backupJsonString);
			const res = await adminPost<{ imported: number }>('/admin/llm/keys/import', parsed);
			if (res.success) {
				toast_success(`Đã import ${res.data?.imported ?? 0} keys`);
				showBackupModal = false;
				await loadAll();
			} else {
				toast_error(res.message || 'Lỗi khi import key');
			}
		} catch {
			toast_error('Mã JSON không hợp lệ');
		}
	}

	// --- File-based Import / Export ---
	let fileInputEl: HTMLInputElement;

	function triggerFileImport() {
		fileInputEl?.click();
	}

	async function handleFileImport(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = async (ev) => {
			try {
				const content = ev.target?.result as string;
				backupJsonString = content;
				await importKeys();
			} catch (err) {
				toast_error(`Lỗi đọc file: ${err}`);
			}
			input.value = '';
		};
		reader.readAsText(file);
	}

	function downloadKeys() {
		if (!backupJsonString.trim()) {
			toast_error('Không có dữ liệu để export');
			return;
		}
		try {
			const blob = new Blob([backupJsonString], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			const dateStr = new Date().toISOString().split('T')[0];
			a.download = `selorson_ai_keys_${dateStr}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (err) {
			toast_error('Lỗi khi tải file xuống');
		}
	}

	async function updateFallbackOrder() {
		await adminPut('/admin/llm/config', { fallback_order: fallbackOrder });
		toast_success('Đã cập nhật thứ tự fallback');
	}

	async function updateProviderModel(providerId: string, newModel: string) {
		await adminPut(`/admin/llm/providers/${providerId}`, { new_model: newModel });
		toast_success('Đã cập nhật model');
	}

	async function sendAdminChat() {
		if (!adminPrompt.trim() || isAdminLoading) return;
		isAdminLoading = true;
		adminResponse = '';
		rtkStats = null;
		try {
			const res = await adminPost<any>('/admin/llm/chat', {
				prompt: adminPrompt,
				max_tokens: 2048,
			});
			if (res.success) {
				adminResponse = (res as any).result || res.data?.result || 'Không có phản hồi';
				const rtk = (res as any).rtk || res.data?.rtk;
				if (rtk) rtkStats = rtk;
			} else {
				adminResponse = `❌ ${res.message || 'Lỗi không xác định'}`;
			}
		} catch (e: any) {
			adminResponse = `❌ ${e.message}`;
		}
		isAdminLoading = false;
	}

	// Drag & Drop handlers
	function handleDragStart(idx: number) { dragIdx = idx; }
	function handleDragOver(idx: number) { dragOverIdx = idx; }
	function handleDrop(idx: number) {
		if (dragIdx >= 0 && dragIdx !== idx) {
			const order = [...fallbackOrder];
			const [moved] = order.splice(dragIdx, 1);
			order.splice(idx, 0, moved);
			fallbackOrder = order;
			updateFallbackOrder();
		}
		dragIdx = -1;
		dragOverIdx = -1;
	}

	function formatChars(chars: number): string {
		if (chars >= 1_000_000) return `${(chars / 1_000_000).toFixed(1)}M`;
		if (chars >= 1_000) return `${(chars / 1_000).toFixed(1)}K`;
		return String(chars);
	}

	function getStatusEmoji(status: string): string {
		if (status === 'ready') return '🟢';
		if (status === 'cooldown') return '🟡';
		return '🔴';
	}

	onMount(loadAll);
</script>

<svelte:head><title>Cổng AI — Admin Selorson</title></svelte:head>

<div class="llm-page">
	<div class="page-header">
		<div>
			<h1 class="page-title">🤖 Cổng AI Gateway</h1>
			<p class="page-subtitle">Quản lý API keys, routing và sử dụng AI</p>
		</div>
		<div class="header-toggles">
			<button class="toggle-switch" class:active={useRtk} onclick={toggleRtk}>
				<span class="toggle-track">
					<span class="toggle-thumb"></span>
				</span>
				<span>{useRtk ? '⚡ RTK BẬT' : '⚡ RTK TẮT'}</span>
			</button>
			<button class="toggle-switch" class:active={isGatewayEnabled} onclick={toggleGateway}>
				<span class="toggle-track">
					<span class="toggle-thumb"></span>
				</span>
				<span>{isGatewayEnabled ? 'Cổng AI BẬT' : 'Cổng AI TẮT'}</span>
			</button>
		</div>
	</div>

	{#if loadingStatus}
		<div class="loading">Đang tải cấu hình AI Gateway...</div>
	{:else}
		<!-- Token Stats -->
		<div class="section">
			<h2 class="section-title">📊 Thống Kê Token</h2>
			<div class="token-grid">
				<div class="token-card">
					<span class="token-label">Hôm nay</span>
					<span class="token-value">{formatChars(tokenStats?.today_used ?? 0)}</span>
					<span class="token-saved">tiết kiệm {formatChars(tokenStats?.today_saved ?? 0)}</span>
				</div>
				<div class="token-card">
					<span class="token-label">Tuần này</span>
					<span class="token-value">{formatChars(tokenStats?.week_used ?? 0)}</span>
					<span class="token-saved">tiết kiệm {formatChars(tokenStats?.week_saved ?? 0)}</span>
				</div>
				<div class="token-card">
					<span class="token-label">Tháng này</span>
					<span class="token-value">{formatChars(tokenStats?.month_used ?? 0)}</span>
					<span class="token-saved">tiết kiệm {formatChars(tokenStats?.month_saved ?? 0)}</span>
				</div>
				<div class="token-card">
					<span class="token-label">Năm nay</span>
					<span class="token-value">{formatChars(tokenStats?.year_used ?? 0)}</span>
					<span class="token-saved">tiết kiệm {formatChars(tokenStats?.year_saved ?? 0)}</span>
				</div>
			</div>
		</div>

		<!-- Providers Status -->
		<div class="section">
			<h2 class="section-title">
				⚡ Trạng Thái Providers
				<span class="status-badge">{routerStatus?.ready_providers ?? 0}/{routerStatus?.total_providers ?? 0} sẵn sàng</span>
			</h2>

			<!-- Fallback Order (Drag & Drop) -->
			<div class="fallback-order">
				{#each fallbackOrder as pid, idx}
					{@const status = routerStatus?.providers?.[pid]}
					{@const prov = providers.find(p => p.id === pid)}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="fallback-item"
						class:drag-over={dragOverIdx === idx}
						draggable="true"
						ondragstart={() => handleDragStart(idx)}
						ondragover={(e) => { e.preventDefault(); handleDragOver(idx); }}
						ondrop={(e) => { e.preventDefault(); handleDrop(idx); }}
						ondragend={() => { dragIdx = -1; dragOverIdx = -1; }}
					>
						<span class="fallback-grip">⠿</span>
						<span class="fallback-emoji">{getStatusEmoji(status?.status ?? 'no_key')}</span>
						<span class="fallback-name">{prov?.name ?? pid}</span>
						<span class="fallback-info">{status?.keys_count ?? 0} keys</span>
						<span class="fallback-tier">{prov?.free_tier ?? ''}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- API Keys Management -->
		<div class="section">
			<div class="section-header">
				<h2 class="section-title">🔑 API Keys ({keys.length})</h2>
				<div class="section-actions">
					<button class="btn btn-sm btn-outline" onclick={exportKeys}>📤 Export</button>
					<button class="btn btn-sm btn-outline" onclick={() => { backupJsonString = ''; showBackupModal = true; }}>📥 Import</button>
					<button class="btn btn-sm btn-primary" onclick={() => { showAddKeyModal = true; }}>+ Thêm Key</button>
				</div>
			</div>

			{#if keys.length === 0}
				<div class="empty-state">Chưa có API key nào. Nhấn "Thêm Key" để bắt đầu.</div>
			{:else}
				<div class="keys-list">
					{#each (showAllKeys ? keys : keys.slice(0, 10)) as key (key.id)}
						{@const prov = providers.find(p => p.id === key.provider)}
						<div class="key-item">
							<div class="key-info">
								<span class="key-provider">{prov?.name ?? key.provider}</span>
								<span class="key-label">{key.label}</span>
								<span class="key-date">{key.created_at}</span>
							</div>
							<div class="key-actions">
								{#if keyTestResults[key.id]}
									<span class="key-test-result">{keyTestResults[key.id]}</span>
								{/if}
								<button class="btn btn-xs btn-outline" onclick={() => testKey(key.id)}
									disabled={testingKeyId === key.id}>
									{testingKeyId === key.id ? '⏳' : '🧪'} Test
								</button>
								<button class="btn btn-xs btn-danger" onclick={() => deleteKey(key.id)}>🗑️</button>
							</div>
						</div>
					{/each}
					{#if keys.length > 10}
						<button class="btn btn-sm btn-outline show-more" onclick={() => showAllKeys = !showAllKeys}>
							{showAllKeys ? '▲ Thu gọn' : `▼ Xem thêm (${keys.length - 10} keys)`}
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Provider Models -->
		<div class="section">
			<h2 class="section-title">🧠 Model Mặc Định</h2>
			<div class="models-grid">
				{#each providers as prov}
					<div class="model-card">
						<div class="model-header">
							<div class="model-icon">
								{#if prov.id === 'google'}⚡
								{:else if prov.id === 'groq'}🚀
								{:else if prov.id === 'openrouter'}🌐
								{:else if prov.id === 'github'}🐙
								{:else if prov.id === 'cloudflare'}☁️
								{:else if prov.id === 'mistral'}🌪️
								{:else}🧠{/if}
							</div>
							<span class="model-name">{prov.name}</span>
						</div>
						<div class="model-body">
							<label class="model-label">Model ID</label>
							<input
								type="text"
								class="model-input"
								value={prov.default_model}
								onchange={(e) => updateProviderModel(prov.id, (e.target as HTMLInputElement).value)}
								placeholder="VD: llama-3-8b-instruct"
								spellcheck="false"
							/>
						</div>
						<div class="model-footer">
							{#if prov.signup_url}
								<a href={prov.signup_url} target="_blank" rel="noopener" class="model-link">
									<span>🔗 Nhận API Key</span>
								</a>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Chat Playground -->
		<div class="section">
			<h2 class="section-title">💬 Trợ Lý AI Quản Trị</h2>
			<div class="chat-playground">
				<div class="chat-toolbar">
					<div class="suggestions">
						{#each suggestedQuestions as q}
							<button class="suggestion-chip" onclick={() => { adminPrompt = q; sendAdminChat(); }}>{q}</button>
						{/each}
					</div>
				</div>
				<div class="chat-input-row">
					<textarea
						class="chat-input"
						bind:value={adminPrompt}
						placeholder="Nhập câu hỏi cho AI..."
						rows="2"
						onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAdminChat(); } }}
					></textarea>
					<button class="btn btn-primary chat-send" onclick={sendAdminChat} disabled={isAdminLoading || !adminPrompt.trim()}>
						{isAdminLoading ? '⏳' : '🚀'} Gửi
					</button>
				</div>
				{#if adminResponse}
					<div class="chat-response">
						<pre>{adminResponse}</pre>
					</div>
					{#if rtkStats && rtkStats.enabled}
						<div class="rtk-stats">
							⚡ RTK: {formatChars(rtkStats.original_chars)} → {formatChars(rtkStats.compressed_chars)}
							<span class="rtk-saved">(tiết kiệm {formatChars(rtkStats.saved_chars)} ký tự, {rtkStats.original_chars > 0 ? Math.round(rtkStats.saved_chars / rtkStats.original_chars * 100) : 0}%)</span>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Add Key Modal -->
{#if showAddKeyModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => showAddKeyModal = false}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<h3>➕ Thêm API Key</h3>
			<div class="form-group">
				<label>Provider</label>
				<select bind:value={newKeyProvider}>
					<option value="">— Chọn —</option>
					{#each providers.filter(p => p.needs_key) as p}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</div>
			{#if newKeyProvider}
				{@const hint = providers.find(p => p.id === newKeyProvider)?.key_hint}
				{#if hint}
					<p class="hint">💡 {hint}</p>
				{/if}
			{/if}
			<div class="form-group">
				<label>API Key</label>
				<input type="password" bind:value={newKeyRawVal} placeholder="sk-..." />
			</div>
			<div class="form-group">
				<label>Nhãn (tùy chọn)</label>
				<input type="text" bind:value={newKeyLabel} placeholder="Ví dụ: Key chính" />
			</div>
			<div class="modal-actions">
				<button class="btn btn-outline" onclick={() => showAddKeyModal = false}>Hủy</button>
				<button class="btn btn-primary" onclick={addKey}>Lưu</button>
			</div>
		</div>
	</div>
{/if}

<!-- Backup/Import Modal -->
{#if showBackupModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => showBackupModal = false}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal modal-lg" onclick={(e) => e.stopPropagation()}>
			<h3>💾 Backup / Import Keys</h3>
			<textarea class="backup-textarea" bind:value={backupJsonString} rows="12" placeholder={`[{"provider":"groq","label":"...","raw_key":"gsk_..."}]`}></textarea>
			<div class="modal-actions">
				<input type="file" accept=".json" bind:this={fileInputEl} onchange={handleFileImport} style="display: none;" />
				<button class="btn btn-outline" onclick={() => showBackupModal = false}>Đóng</button>
				<button class="btn btn-outline" onclick={downloadKeys}>💾 Lưu ra File</button>
				<button class="btn btn-primary" onclick={triggerFileImport}>📁 Chọn File Import</button>
				<button class="btn btn-primary" onclick={importKeys}>📥 Import trực tiếp (từ text)</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.llm-page { max-width: 1200px; }

	.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
	.page-title { font-size: 1.75rem; font-weight: 800; color: var(--color-text-primary); margin: 0; }
	.page-subtitle { color: var(--color-text-muted); font-size: 0.875rem; margin: 0.25rem 0 0; }

	.header-toggles { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }

	.toggle-switch {
		display: flex; align-items: center; gap: 0.75rem;
		background: var(--color-surface-200); border: 1px solid rgba(255,255,255,0.1);
		border-radius: var(--radius-lg); padding: 0.625rem 1.25rem;
		color: var(--color-text-secondary); font-size: 0.875rem; font-weight: 600;
		cursor: pointer; transition: all 0.3s;
	}
	.toggle-switch.active { background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.3); color: #10b981; }
	:global(html[data-theme='light']) .toggle-switch { background: #f3f4f6; border-color: rgba(0,0,0,0.1); }
	:global(html[data-theme='light']) .toggle-switch.active { background: rgba(16, 185, 129, 0.1); }

	.toggle-track {
		width: 44px; height: 24px; border-radius: 12px;
		background: var(--color-surface-300); position: relative;
		transition: background 0.3s;
	}
	.toggle-switch.active .toggle-track { background: #10b981; }
	.toggle-thumb {
		position: absolute; top: 3px; left: 3px;
		width: 18px; height: 18px; border-radius: 50%;
		background: #fff; transition: transform 0.3s;
	}
	.toggle-switch.active .toggle-thumb { transform: translateX(20px); }

	.loading { text-align: center; padding: 3rem; color: var(--color-text-muted); }

	.section { margin-bottom: 2rem; }
	.section-title {
		font-size: 1.125rem; font-weight: 700; color: var(--color-text-primary);
		margin: 0 0 1rem; display: flex; align-items: center; gap: 0.5rem;
	}
	.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem; }
	.section-actions { display: flex; gap: 0.5rem; }

	.status-badge {
		font-size: 0.6875rem; font-weight: 600; padding: 0.25rem 0.5rem;
		background: rgba(16, 185, 129, 0.15); color: #10b981; border-radius: 1rem;
	}

	/* Token Stats */
	.token-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
	.token-card {
		background: var(--color-surface-100); border-radius: var(--radius-lg);
		padding: 1rem 1.25rem; border: 1px solid rgba(255,255,255,0.06);
		display: flex; flex-direction: column; gap: 0.25rem;
	}
	:global(html[data-theme='light']) .token-card { background: #fff; border-color: rgba(0,0,0,0.04); }
	.token-label { font-size: 0.6875rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
	.token-value { font-size: 1.75rem; font-weight: 800; color: var(--color-brand-300); }
	:global(html[data-theme='light']) .token-value { color: var(--color-brand-500); }
	.token-saved { font-size: 0.6875rem; color: #34d399; }

	/* Fallback Order */
	.fallback-order { display: flex; flex-direction: column; gap: 0.375rem; }
	.fallback-item {
		display: flex; align-items: center; gap: 0.75rem;
		background: var(--color-surface-100); border-radius: var(--radius-md);
		padding: 0.625rem 1rem; border: 1px solid rgba(255,255,255,0.06);
		cursor: grab; transition: all 0.2s; font-size: 0.8125rem;
	}
	:global(html[data-theme='light']) .fallback-item { background: #fff; border-color: rgba(0,0,0,0.06); }
	.fallback-item:hover { background: var(--color-surface-200); }
	.fallback-item.drag-over { border-color: var(--color-brand-400); background: rgba(59, 130, 246, 0.1); }
	.fallback-grip { color: var(--color-text-muted); font-size: 1rem; cursor: grab; }
	.fallback-emoji { font-size: 1rem; }
	.fallback-name { font-weight: 600; color: var(--color-text-primary); min-width: 120px; }
	.fallback-info { font-size: 0.75rem; color: var(--color-text-muted); min-width: 60px; }
	.fallback-tier { font-size: 0.6875rem; color: var(--color-text-muted); margin-left: auto; }

	/* Keys List */
	.keys-list { display: flex; flex-direction: column; gap: 0.375rem; }
	.key-item {
		display: flex; align-items: center; justify-content: space-between;
		background: var(--color-surface-100); border-radius: var(--radius-md);
		padding: 0.75rem 1rem; border: 1px solid rgba(255,255,255,0.06);
		flex-wrap: wrap; gap: 0.5rem;
	}
	:global(html[data-theme='light']) .key-item { background: #fff; border-color: rgba(0,0,0,0.04); }
	.key-info { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.key-provider { font-weight: 700; font-size: 0.8125rem; color: var(--color-brand-400); }
	.key-label { font-size: 0.8125rem; color: var(--color-text-secondary); }
	.key-date { font-size: 0.6875rem; color: var(--color-text-muted); }
	.key-actions { display: flex; align-items: center; gap: 0.5rem; }
	.key-test-result { font-size: 0.6875rem; color: var(--color-text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.show-more { width: 100%; margin-top: 0.5rem; }
	.empty-state { text-align: center; padding: 2rem; color: var(--color-text-muted); font-size: 0.875rem; }

	/* Models */
	/* Models */
	.models-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.25rem; }
	.model-card {
		background: linear-gradient(145deg, var(--color-surface-100), var(--color-surface-200));
		border-radius: var(--radius-xl);
		padding: 1.25rem;
		border: 1px solid rgba(255,255,255,0.05);
		display: flex; flex-direction: column; gap: 1rem;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
	}
	:global(html[data-theme='light']) .model-card {
		background: linear-gradient(145deg, #ffffff, #f9fafb);
		border-color: rgba(0,0,0,0.05);
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
	}
	.model-card:hover { transform: translateY(-4px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); border-color: rgba(16, 185, 129, 0.2); }
	
	.model-header { display: flex; align-items: center; gap: 0.75rem; }
	.model-icon { font-size: 1.125rem; background: rgba(16, 185, 129, 0.1); color: var(--color-text-primary); width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 10px; }
	:global(html[data-theme='light']) .model-icon { background: rgba(16, 185, 129, 0.15); }
	.model-name { font-weight: 800; font-size: 1rem; color: var(--color-text-primary); letter-spacing: -0.01em; }
	
	.model-body { display: flex; flex-direction: column; gap: 0.375rem; }
	.model-label { font-size: 0.6875rem; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
	.model-input {
		background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08);
		border-radius: var(--radius-md); padding: 0.625rem 0.75rem;
		color: var(--color-brand-400); font-size: 0.8125rem; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-weight: 600;
		transition: all 0.2s; width: 100%; box-sizing: border-box;
	}
	.model-input:focus { outline: none; border-color: var(--color-brand-500); background: rgba(0,0,0,0.3); box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.1); }
	:global(html[data-theme='light']) .model-input { background: #f3f4f6; border-color: rgba(0,0,0,0.1); color: var(--color-brand-600); }
	:global(html[data-theme='light']) .model-input:focus { background: #fff; box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2); }
	
	.model-footer { margin-top: auto; padding-top: 0.5rem; }
	.model-link { 
		display: inline-flex; align-items: center; gap: 0.375rem;
		font-size: 0.75rem; font-weight: 600; color: var(--color-text-secondary); text-decoration: none;
		background: var(--color-surface-300); padding: 0.375rem 0.875rem; border-radius: 9999px;
		transition: all 0.2s;
	}
	:global(html[data-theme='light']) .model-link { background: #e5e7eb; color: #4b5563; }
	.model-link:hover { background: var(--color-brand-500); color: #fff; }
	:global(html[data-theme='light']) .model-link:hover { background: var(--color-brand-500); color: #fff; }

	/* Chat Playground */
	.chat-playground { background: var(--color-surface-100); border-radius: var(--radius-lg); padding: 1.25rem; border: 1px solid rgba(255,255,255,0.06); }
	:global(html[data-theme='light']) .chat-playground { background: #fff; border-color: rgba(0,0,0,0.04); }
	.chat-toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
	.suggestions { display: flex; gap: 0.5rem; flex-wrap: wrap; flex: 1; }
	.suggestion-chip {
		background: var(--color-surface-200); border: 1px solid rgba(255,255,255,0.1);
		border-radius: 1rem; padding: 0.375rem 0.75rem; font-size: 0.75rem;
		color: var(--color-text-secondary); cursor: pointer; transition: all 0.2s;
	}
	:global(html[data-theme='light']) .suggestion-chip { background: #f3f4f6; border-color: rgba(0,0,0,0.1); }
	.suggestion-chip:hover { background: var(--color-brand-500); color: #fff; border-color: var(--color-brand-500); }
	.chat-input-row { display: flex; gap: 0.75rem; }
	.chat-input {
		flex: 1; background: var(--color-surface-200); border: 1px solid rgba(255,255,255,0.1);
		border-radius: var(--radius-md); padding: 0.75rem; color: var(--color-text-primary);
		font-size: 0.875rem; resize: vertical; min-height: 60px;
	}
	:global(html[data-theme='light']) .chat-input { background: #f9fafb; border-color: rgba(0,0,0,0.1); }
	.chat-send { align-self: flex-end; min-width: 80px; }
	.chat-response { margin-top: 1rem; background: var(--color-surface-200); border-radius: var(--radius-md); padding: 1rem; max-height: 400px; overflow-y: auto; }
	:global(html[data-theme='light']) .chat-response { background: #f9fafb; }
	.chat-response pre { margin: 0; white-space: pre-wrap; word-wrap: break-word; font-size: 0.8125rem; color: var(--color-text-primary); line-height: 1.6; }

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
	.modal.modal-lg { max-width: 640px; }
	.modal h3 { margin: 0 0 1rem; font-size: 1.125rem; color: var(--color-text-primary); }
	.modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }

	.form-group { margin-bottom: 0.75rem; }
	.form-group label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); margin-bottom: 0.25rem; text-transform: uppercase; }
	.form-group input, .form-group select {
		width: 100%; padding: 0.5rem 0.75rem; font-size: 0.875rem;
		background: var(--color-surface-200); border: 1px solid rgba(255,255,255,0.1);
		border-radius: var(--radius-md); color: var(--color-text-primary);
	}
	:global(html[data-theme='light']) .form-group input, :global(html[data-theme='light']) .form-group select { background: #f3f4f6; border-color: rgba(0,0,0,0.1); }
	.hint { font-size: 0.75rem; color: #fbbf24; margin: 0 0 0.5rem; }

	.backup-textarea {
		width: 100%; padding: 0.75rem; font-family: monospace; font-size: 0.75rem;
		background: var(--color-surface-200); border: 1px solid rgba(255,255,255,0.1);
		border-radius: var(--radius-md); color: var(--color-text-primary); resize: vertical;
	}
	:global(html[data-theme='light']) .backup-textarea { background: #f3f4f6; border-color: rgba(0,0,0,0.1); }

	/* Buttons */
	.btn {
		display: inline-flex; align-items: center; gap: 0.375rem;
		padding: 0.5rem 1rem; border-radius: var(--radius-md); font-weight: 600;
		font-size: 0.8125rem; cursor: pointer; transition: all 0.2s; border: none;
	}
	.btn-sm { padding: 0.375rem 0.75rem; font-size: 0.75rem; }
	.btn-xs { padding: 0.25rem 0.5rem; font-size: 0.6875rem; }
	.btn-primary { background: var(--color-brand-500); color: #fff; }
	.btn-primary:hover { background: var(--color-brand-600); }
	.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn-outline { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: var(--color-text-secondary); }
	:global(html[data-theme='light']) .btn-outline { border-color: rgba(0,0,0,0.15); }
	.btn-outline:hover { background: rgba(255,255,255,0.05); }
	.btn-danger { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); }
	.btn-danger:hover { background: rgba(239, 68, 68, 0.25); }

	/* RTK */
	.rtk-stats {
		margin-top: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.75rem; font-weight: 600;
		background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2);
		border-radius: var(--radius-md); color: #f59e0b;
	}
	.rtk-saved { color: #34d399; }

	@media (max-width: 768px) {
		.page-header { flex-direction: column; }
		.section-header { flex-direction: column; align-items: flex-start; }
		.key-item { flex-direction: column; align-items: flex-start; }
		.chat-input-row { flex-direction: column; }
		.fallback-tier { display: none; }
	}
</style>
