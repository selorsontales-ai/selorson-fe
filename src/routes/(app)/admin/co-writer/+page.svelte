<!-- Co-Writer — AI Story Writing Assistant -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchRuntimeCapabilities } from '$lib/runtime';
	import { adminGet, toast_error, toast_success } from '$lib/stores/admin.svelte';
	import { CoWriterHttp, type CoWriterHooks } from '$lib/co-writer/admin-http.svelte';
	import { WorkshopState } from '$lib/co-writer/workshop.svelte';
	import { ENTITY_TYPES, WorldBibleState, entityIcon } from '$lib/co-writer/world-bible.svelte';
	import { ChronicleState } from '$lib/co-writer/chronicle.svelte';

	// Trang này chỉ còn giữ thứ cả ba tab dùng chung: dự án đang mở, số liệu
	// ở đầu trang, và năng lực runtime. Logic của từng tab sống trong
	// $lib/co-writer/*.svelte.ts — xem CW-450.

	type CoWriterProject = {
		id: string;
		name: string;
		active?: boolean;
		created_at?: string;
		updated_at?: string;
	};

	let activeTab = $state<'workshop' | 'worldbible' | 'chronicle'>('workshop');
	let status = $state<any>(null);
	let runtimeLoadError = $state('');
	let projects = $state<CoWriterProject[]>([]);
	let activeProjectId = $state('');
	let isSwitchingProject = $state(false);

	// Hai ô chọn file ở lại trang vì chúng là DOM ref, không phải trạng thái.
	let importFileInput: HTMLInputElement;
	let entityDetectFileInput: HTMLInputElement;

	const http = new CoWriterHttp();
	const hooks: CoWriterHooks = {
		refreshStatus: () => loadStatus(),
		refreshChapterLogs: () => chronicle.loadChapterLogs()
	};
	const workshop = new WorkshopState(http, hooks);
	const worldBible = new WorldBibleState(http, hooks);
	const chronicle = new ChronicleState(http, hooks);

	onMount(() => {
		void initializeCoWriter();
	});

	async function initializeCoWriter() {
		try {
			const capabilities = await fetchRuntimeCapabilities();
			http.capabilities = capabilities;

			if (!capabilities.co_writer_read) {
				runtimeLoadError = `Target ${capabilities.target} không cho phép đọc Co-Writer.`;
				return;
			}

			await loadProjects();
			await reloadActiveProjectData();
		} catch (error) {
			const message =
				typeof (error as { message?: unknown })?.message === 'string'
					? String((error as { message: string }).message)
					: 'Không đọc được RuntimeCapabilities.';
			runtimeLoadError = message;
			toast_error(message);
		}
	}

	async function loadStatus() {
		const res = await adminGet<any>('/admin/writer/status');
		if (res.success) status = res.data;
	}

	async function loadProjects() {
		const res = await adminGet<{
			projects: CoWriterProject[];
			active_project: CoWriterProject;
		}>('/admin/writer/projects');
		if (res.success && res.data) {
			projects = res.data.projects || [];
			activeProjectId = res.data.active_project?.id || '';
		} else {
			toast_error(res.message || 'Không tải được danh sách dự án Co-Writer');
		}
	}

	async function reloadActiveProjectData() {
		await Promise.all([loadStatus(), workshop.load(), worldBible.load(), chronicle.load()]);
	}

	/** Đổi dự án giữa chừng một tác vụ sẽ trộn dữ liệu hai truyện vào nhau. */
	function projectOperationRunning() {
		return workshop.busy() || worldBible.busy() || chronicle.busy();
	}

	function clearProjectWorkspace() {
		status = null;
		workshop.reset();
		worldBible.reset();
		chronicle.reset();
	}

	async function activateProject(projectId: string) {
		if (!projectId || projectId === activeProjectId) return;
		if (projectOperationRunning()) {
			toast_error('Hãy chờ tác vụ Co-Writer hiện tại hoàn tất trước khi đổi dự án');
			await loadProjects();
			return;
		}

		isSwitchingProject = true;
		const res = await http.put<CoWriterProject>(
			'/admin/writer/projects/active',
			{ project_id: projectId },
			'co_writer_read'
		);
		if (res.success && res.data) {
			clearProjectWorkspace();
			activeProjectId = res.data.id;
			await reloadActiveProjectData();
			await loadProjects();
			toast_success(`Đã chuyển sang dự án “${res.data.name}”`);
		} else {
			toast_error(res.message || 'Không thể đổi dự án Co-Writer');
			await loadProjects();
		}
		isSwitchingProject = false;
	}

	async function switchActiveProject(event: Event) {
		await activateProject((event.currentTarget as HTMLSelectElement).value);
	}

	async function createProject() {
		const name = window.prompt('Tên dự án truyện mới:')?.trim();
		if (!name) return;
		const res = await http.post<CoWriterProject>('/admin/writer/projects', { name });
		if (!res.success || !res.data) {
			toast_error(res.message || 'Không thể tạo dự án Co-Writer');
			return;
		}
		await loadProjects();
		await activateProject(res.data.id);
	}
</script>

<svelte:head>
	<title>✍️ Trợ Lý Sáng Tác — Admin</title>
</svelte:head>

<div class="cw-page">
	<!-- Header -->
	<div class="cw-header">
		<div class="cw-title">
			<h1>✍️ Trợ Lý Sáng Tác</h1>
			<p class="cw-subtitle">AI Co-Writer — Hệ thống hỗ trợ viết truyện</p>
			{#if http.capabilities}
				<p class="cw-subtitle">
					Runtime: {http.capabilities.target} · {http.capabilities.co_writer_write ? 'read/write' : 'read-only'}
				</p>
			{:else if runtimeLoadError}
				<p class="cw-subtitle">Runtime unavailable: {runtimeLoadError}</p>
			{/if}
			{#if projects.length > 0}
				<div class="project-switcher">
					<label for="co-writer-project">Dự án</label>
					<select
						id="co-writer-project"
						value={activeProjectId}
						onchange={switchActiveProject}
						disabled={isSwitchingProject || projectOperationRunning()}
					>
						{#each projects as project}
							<option value={project.id}>{project.name}</option>
						{/each}
					</select>
					{#if http.allows('co_writer_write')}
						<button
							class="btn btn-secondary btn-sm"
							onclick={createProject}
							disabled={isSwitchingProject || projectOperationRunning()}
						>
							+ Dự án mới
						</button>
					{/if}
					{#if isSwitchingProject}<span>Đang chuyển…</span>{/if}
				</div>
			{/if}
		</div>
		{#if status}
			<div class="cw-stats">
				<div class="stat-chip">📄 {status.total_documents} tài liệu</div>
				<div class="stat-chip">🧩 {status.total_chunks} chunks</div>
				<div class="stat-chip">🌍 {status.total_entities} entities</div>
				<div class="stat-chip">📜 {status.total_chapter_logs} chương</div>
				{#if status.data_dir}
					<div class="stat-chip" title="Thư mục dữ liệu backend đang dùng — nếu sai, đặt CO_WRITER_DATA_DIR trong .env backend">
						📁 {status.data_dir}
					</div>
				{/if}
				{#if status.embedding_model}
					<div class="stat-chip" title="Model embedding đã chốt cho toàn kho">
						🧬 {status.embedding_model}@{status.embedding_dim}
					</div>
				{/if}
				{#if status.foreign_embeddings > 0}
					<div class="stat-chip stat-warn" title="Có chunk được embed bằng model cũ — bấm Re-index Toàn Bộ ở tab Biên Niên Sử">
						⚠️ {status.foreign_embeddings} chunk model cũ
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Tabs -->
	<div class="cw-tabs">
		<button class="tab-btn" class:active={activeTab === 'workshop'} onclick={() => activeTab = 'workshop'}>
			✍️ Xưởng Viết
		</button>
		<button class="tab-btn" class:active={activeTab === 'worldbible'} onclick={() => activeTab = 'worldbible'}>
			🌍 Kinh Thánh Thế Giới
		</button>
		<button class="tab-btn" class:active={activeTab === 'chronicle'} onclick={() => activeTab = 'chronicle'}>
			📜 Biên Niên Sử
		</button>
	</div>

	<!-- Tab Content -->
	<div class="cw-content">
		<!-- ═══════════ TAB 1: WORKSHOP ═══════════ -->
		{#if activeTab === 'workshop'}
			<div class="workshop-flow">
				<!-- Brainstorm + Chapter -->
				<div class="card">
					<h3 class="card-title">🧠 Brainstorm Dàn Ý</h3>
					<div class="form-grid-2">
						<div class="form-row">
							<label for="cw-target-chapter">Chương đang viết</label>
							<input id="cw-target-chapter" type="number" bind:value={workshop.targetChapter} min="1" class="input-sm" />
						</div>
					</div>
					<div class="form-row">
						<label for="cw-brainstorm-goal">Định hướng chương mới</label>
						<textarea id="cw-brainstorm-goal" bind:value={workshop.brainstormGoal} placeholder="Ví dụ: Okita gặp kẻ thù cũ tại lễ hội, cuộc đối đầu bất ngờ..." rows="3"></textarea>
					</div>
					<button class="btn btn-primary" onclick={workshop.doBrainstorm} disabled={workshop.isBrainstorming}>
						{workshop.isBrainstorming ? '⏳ Đang suy nghĩ...' : '🧠 AI Brainstorm'}
					</button>
				</div>

				<!-- Beats Editor — Full Width -->
				<div class="card">
					<h3 class="card-title">📝 Dàn Ý Chi Tiết (Beats)</h3>
					<textarea bind:value={workshop.writingBeats} placeholder="AI sẽ điền hoặc bạn tự nhập dàn ý chi tiết cho chương..." rows="12" class="beats-editor"></textarea>
				</div>

				<!-- Settings row -->
				<div class="card card-compact">
					<details>
						<summary class="card-title clickable">⚙️ Cài Đặt Nâng Cao</summary>
						<div class="settings-grid" style="padding-top: 0.75rem;">
							<div class="form-row">
								<label for="cw-custom-summary">Tóm tắt bổ sung</label>
								<textarea id="cw-custom-summary" bind:value={workshop.customSummary} placeholder="Bổ sung ngữ cảnh nếu cần..." rows="2"></textarea>
							</div>
							<div class="form-grid-2">
								<div class="slider-row">
									<label for="cw-mmr-lambda">Ưu tiên liên quan (giảm để nguồn đa dạng hơn): {workshop.mmrLambda.toFixed(2)}</label>
									<input id="cw-mmr-lambda" type="range" min="0" max="1" step="0.05" bind:value={workshop.mmrLambda} />
								</div>
								<div class="slider-row">
									<label for="cw-temporal-lambda">Ưu tiên chương gần (0 = tắt): {workshop.temporalLambda.toFixed(3)}</label>
									<input id="cw-temporal-lambda" type="range" min="0" max="0.02" step="0.001" bind:value={workshop.temporalLambda} />
								</div>
							</div>
							<label class="checkbox-row">
								<input type="checkbox" bind:checked={workshop.promptOnly} />
								Chỉ xuất prompt (không gọi AI viết)
							</label>

							<!-- AI model settings -->
							<div class="ai-settings">
								<h4 class="sources-sub">🤖 Model AI</h4>
								<div class="form-grid-2">
									<div class="form-row">
										<label for="cw-gen-provider">Nhà cung cấp viết chương</label>
										<select id="cw-gen-provider" bind:value={workshop.settings.gen_provider}>
											<option value="">Tự động (theo thứ tự)</option>
											{#each workshop.modelProviders as p}
												<option value={p.id}>{p.name} — {p.key_count} key</option>
											{/each}
										</select>
									</div>
									<div class="form-row">
										<label for="cw-gen-model">Model (trống = mặc định)</label>
										<input id="cw-gen-model" type="text" bind:value={workshop.settings.gen_model}
											placeholder={workshop.modelProviders.find((p) => p.id === workshop.settings.gen_provider)?.default_model || 'mặc định của provider'} />
									</div>
								</div>
								<div class="form-grid-2">
									<div class="form-row">
										<label for="cw-gen-max-tokens">Max tokens viết chương</label>
										<input id="cw-gen-max-tokens" type="number" bind:value={workshop.settings.gen_max_tokens} placeholder="16384" min="1024" step="1024" />
									</div>
									<div class="form-row">
										<label for="cw-worker-model">Model phụ (tóm tắt / chọn nguồn)</label>
										<input id="cw-worker-model" type="text" bind:value={workshop.settings.worker_model}
											placeholder={workshop.settings.default_worker_model || 'gemini-2.5-flash'} />
									</div>
								</div>
								<button class="btn" onclick={workshop.saveSettings} disabled={workshop.isSavingSettings}>
									{workshop.isSavingSettings ? '⏳ Đang lưu...' : '💾 Lưu cài đặt AI'}
								</button>
							</div>
						</div>
					</details>
				</div>

				<button class="btn btn-accent btn-lg" onclick={workshop.doGenerate} disabled={workshop.isGenerating}>
					{workshop.isGenerating
						? (workshop.promptOnly ? '⏳ Đang tổng hợp prompt...' : '⏳ AI đang viết chương...')
						: (workshop.promptOnly ? '📋 Tổng Hợp Prompt (không gọi AI)' : '✍️ AI Viết Chương')}
				</button>

				<!-- Sources Panel — nguồn AI đã đọc (brainstorm + generate) -->
				{#if workshop.treePicks.length > 0 || workshop.ragChunks.length > 0}
					<div class="card">
						<h3 class="card-title">📚 Nguồn AI Đã Đọc</h3>
						<p class="text-muted sources-hint">
							Bỏ chọn nguồn không phù hợp rồi chạy lại — AI sẽ bỏ qua nguồn đó ở lần sau.
						</p>
						{#if workshop.treePicks.length > 0}
							<h4 class="sources-sub">🌲 Chọn theo suy luận trên mục lục</h4>
							{#each workshop.treePicks as pick}
								<label class="source-pick" class:excluded={workshop.excludedNodeIds.has(pick.node_id)}>
									<input type="checkbox"
										checked={!workshop.excludedNodeIds.has(pick.node_id)}
										onchange={() => workshop.toggleExcludedNode(pick.node_id)} />
									<div class="source-pick-info">
										<div class="source-pick-title">
											<strong>{pick.title}</strong>
											<span class="source-pick-file">{pick.source_file}</span>
											<span class="source-pick-badge">~{pick.used_tokens} tokens</span>
										</div>
										{#if pick.reason}
											<p class="source-pick-reason">💭 {pick.reason}</p>
										{/if}
									</div>
								</label>
							{/each}
						{/if}
						{#if workshop.ragChunks.length > 0}
							<h4 class="sources-sub">🎯 Chọn theo độ tương đồng (vector)</h4>
							{#each workshop.ragChunks as chunk}
								<label class="source-pick" class:excluded={workshop.excludedChunkIds.has(chunk.chunk_id)}>
									<input type="checkbox"
										checked={!workshop.excludedChunkIds.has(chunk.chunk_id)}
										onchange={() => workshop.toggleExcludedChunk(chunk.chunk_id)} />
									<div class="source-pick-info">
										<div class="source-pick-title">
											<strong>{chunk.source_file}</strong>
											{#if chunk.heading}<span class="source-pick-file">{chunk.heading}</span>{/if}
											<span class="source-pick-badge">{Math.round((chunk.raw_similarity || 0) * 100)}% khớp</span>
										</div>
									</div>
								</label>
							{/each}
						{/if}
						{#if workshop.excludedNodeIds.size > 0 || workshop.excludedChunkIds.size > 0}
							<button class="btn btn-sm" style="margin-top: 0.5rem;"
								onclick={() => workshop.clearExclusions()}>
								↺ Bỏ loại trừ ({workshop.excludedNodeIds.size + workshop.excludedChunkIds.size})
							</button>
						{/if}
					</div>
				{/if}

				<!-- Output Section -->
				{#if workshop.promptStats || workshop.superPrompt || workshop.generatedText}
					<div class="workshop-output">
						{#if workshop.promptStats}
							<div class="card">
								<h3 class="card-title">📊 Token Budget</h3>
								<div class="budget-bars">
									<div class="budget-item">
										<span>Lịch sử: {workshop.promptStats.history_tokens}/{workshop.promptStats.history_budget}</span>
										<div class="progress-bar">
											<div class="progress-fill" style="width: {Math.min(100, (workshop.promptStats.history_tokens / workshop.promptStats.history_budget) * 100)}%"></div>
										</div>
									</div>
									<div class="budget-item">
										<span>Nhân vật: {workshop.promptStats.characters_tokens}/{workshop.promptStats.characters_budget}</span>
										<div class="progress-bar">
											<div class="progress-fill" style="width: {Math.min(100, (workshop.promptStats.characters_tokens / workshop.promptStats.characters_budget) * 100)}%"></div>
										</div>
									</div>
									<div class="budget-item">
										<span>World Lore: {workshop.promptStats.world_lore_tokens}/{workshop.promptStats.world_lore_budget}</span>
										<div class="progress-bar">
											<div class="progress-fill" style="width: {Math.min(100, (workshop.promptStats.world_lore_tokens / workshop.promptStats.world_lore_budget) * 100)}%"></div>
										</div>
									</div>
									<div class="budget-total">
										Tổng: <strong>{workshop.promptStats.total_tokens}</strong> tokens
									</div>
								</div>
							</div>
						{/if}

						{#if workshop.generatedText}
							<div class="card">
								<h3 class="card-title">📖 Kết Quả AI</h3>
								<div class="output-text">{workshop.generatedText}</div>
								<div class="btn-row">
									<button class="btn btn-sm" onclick={() => navigator.clipboard.writeText(workshop.generatedText)}>
										📋 Copy
									</button>
									<button class="btn btn-sm btn-primary" onclick={workshop.saveAndAnalyze} disabled={workshop.isSavingAnalyze}>
										{workshop.isSavingAnalyze ? '⏳ Đang phân tích...' : `💾 Lưu & Phân Tích Chương ${workshop.targetChapter}`}
									</button>
								</div>
							</div>
						{/if}

						{#if workshop.superPrompt}
							<div class="card">
								<h3 class="card-title">📋 Super Prompt</h3>
								<details>
									<summary>Xem prompt đầy đủ ({workshop.superPrompt.length} ký tự)</summary>
									<pre class="prompt-preview">{workshop.superPrompt}</pre>
								</details>
								<button class="btn btn-sm" onclick={() => navigator.clipboard.writeText(workshop.superPrompt)}>
									📋 Copy Prompt
								</button>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Generation History -->
				<div class="card card-compact">
					<details ontoggle={(e) => {
						if ((e.currentTarget as HTMLDetailsElement).open && !workshop.historyLoaded) workshop.loadGenerations();
					}}>
						<summary class="card-title clickable">🕘 Lịch Sử Sáng Tác</summary>
						<div class="history-list">
							{#if workshop.historyLoaded && workshop.generations.length === 0}
								<p class="text-muted">Chưa có lịch sử — mỗi lần Brainstorm / AI Viết sẽ tự lưu vào đây.</p>
							{/if}
							{#each workshop.generations as gen}
								<div class="history-item">
									<div class="history-info">
										<div class="history-title">
											{gen.kind === 'brainstorm' ? '🧠' : '✍️'}
											<strong>Chương {gen.target_chapter}</strong>
											<span class="source-pick-file">{gen.model}</span>
											<span class="source-pick-badge">{gen.created_at?.split('.')[0]?.replace('T', ' ') || ''}</span>
										</div>
										{#if gen.preview}
											<p class="history-preview">{gen.preview}</p>
										{/if}
									</div>
									<div class="history-actions">
										<button class="btn btn-sm" onclick={() => workshop.loadGenerationInto(gen.id)}>↩ Nạp lại</button>
										<button class="btn-icon btn-danger-icon" onclick={() => workshop.removeGeneration(gen.id)} title="Xóa">🗑️</button>
									</div>
								</div>
							{/each}
						</div>
					</details>
				</div>
			</div>

		<!-- ═══════════ TAB 2: WORLD BIBLE ═══════════ -->
		{:else if activeTab === 'worldbible'}
			<div class="worldbible">
				<!-- Filter + Actions -->
				<div class="wb-toolbar">
					<div class="wb-filters">
						<button class="filter-chip" class:active={worldBible.entityFilter === ''} onclick={() => worldBible.setFilter('')}>
							Tất cả
						</button>
						{#each ENTITY_TYPES as et}
							<button class="filter-chip" class:active={worldBible.entityFilter === et.value} onclick={() => worldBible.setFilter(et.value)}>
								{et.label}
							</button>
						{/each}
					</div>
					<div class="wb-actions">
						<input type="text" class="entity-search" placeholder="🔍 Tìm tên / bí danh / ID..." bind:value={worldBible.entitySearch} />
						<button class="btn" onclick={() => entityDetectFileInput.click()} disabled={worldBible.isDetecting}>
							{worldBible.isDetecting ? '⏳ Đang phát hiện...' : '🔍 Import & Phát Hiện Entity'}
						</button>
						<button class="btn btn-primary" onclick={worldBible.openCreate}>+ Tạo Entity</button>
					</div>
				</div>

				<!-- Entity Table -->
				<div class="entity-grid">
					{#each worldBible.filtered as entity}
						<div class="entity-card">
							<div class="entity-card-header">
								<span class="entity-icon">{entityIcon(entity.entity_type)}</span>
								<span class="entity-id">{entity.id}</span>
								{#if entity.role}
									<span class="entity-role">{entity.role}</span>
								{/if}
							</div>
							<h4 class="entity-name">{entity.name}</h4>
							{#if entity.aliases?.length > 0}
								<p class="entity-aliases">
									{Array.isArray(entity.aliases) ? entity.aliases.join(', ') : ''}
								</p>
							{/if}
							{#if entity.description}
								{#if worldBible.expandedEntityIds.has(entity.id) || entity.description.length <= 120}
									<p class="entity-desc">{entity.description}</p>
								{:else}
									<p class="entity-desc">{entity.description.substring(0, 120)}...</p>
								{/if}
								{#if entity.description.length > 120}
									<button class="entity-desc-toggle" onclick={() => worldBible.toggleExpand(entity.id)}>
										{worldBible.expandedEntityIds.has(entity.id) ? '▲ Thu gọn' : '▼ Xem đầy đủ'}
									</button>
								{/if}
							{/if}
							<div class="entity-actions">
								<button class="btn btn-sm" onclick={() => worldBible.openEdit(entity)}>✏️</button>
								<button class="btn btn-sm btn-danger" onclick={() => worldBible.remove(entity.id)}>🗑️</button>
							</div>
						</div>
					{:else}
						<div class="empty-state full-width">
							<div class="empty-icon">🌍</div>
							<p>Chưa có entity nào. Bấm <strong>+ Tạo Entity</strong> để bắt đầu xây dựng thế giới.</p>
						</div>
					{/each}
				</div>
			</div>

		<!-- ═══════════ TAB 3: CHRONICLE ═══════════ -->
		{:else if activeTab === 'chronicle'}
			<div class="chronicle-layout">
				<!-- Auto Analysis -->
				<div class="card">
					<h3 class="card-title">🤖 AI Phân Tích Chương Tự Động</h3>
					<div class="form-row">
						<label for="cw-auto-log-chapter">Số chương</label>
						<input id="cw-auto-log-chapter" type="number" bind:value={chronicle.autoLogChapter} min="1" class="input-sm" />
					</div>
					<div class="form-row">
						<label for="cw-auto-log-content">Dán nội dung chương</label>
						<textarea id="cw-auto-log-content" bind:value={chronicle.autoLogContent} placeholder="Dán toàn bộ nội dung chương vào đây, hoặc bấm Import File bên dưới..." rows="6"></textarea>
					</div>
					<div class="btn-row">
						<button class="btn" onclick={() => importFileInput.click()}>
							📂 Import File (.md / .txt)
						</button>
						<button class="btn btn-primary" onclick={chronicle.doAutoAnalyze} disabled={chronicle.isAutoAnalyzing}>
							{chronicle.isAutoAnalyzing ? '⏳ Đang phân tích...' : '🤖 AI Phân Tích & Lưu'}
						</button>
					</div>
				</div>

				<!-- Manual Log -->
				<div class="card card-compact">
					<details bind:open={chronicle.manualLogOpen}>
						<summary class="card-title clickable">📝 Lưu Nhật Ký Thủ Công</summary>
						<div class="manual-form">
							<div class="form-row">
								<label for="cw-manual-log-chapter">Chương</label>
								<input id="cw-manual-log-chapter" type="number" bind:value={chronicle.manualLogChapter} min="1" class="input-sm" />
							</div>
							<div class="form-row">
								<label for="cw-manual-log-summary">Tóm tắt</label>
								<textarea id="cw-manual-log-summary" bind:value={chronicle.manualLogSummary} rows="2" placeholder="Tóm tắt ngắn..."></textarea>
							</div>
							<div class="form-row">
								<label for="cw-manual-log-events">Sự kiện chính (mỗi dòng 1 sự kiện)</label>
								<textarea id="cw-manual-log-events" bind:value={chronicle.manualLogEvents} rows="3" placeholder="Sự kiện 1&#10;Sự kiện 2"></textarea>
							</div>
							<div class="form-row">
								<label for="cw-manual-log-seeds">Mầm cốt truyện (mỗi dòng 1 mầm)</label>
								<textarea id="cw-manual-log-seeds" bind:value={chronicle.manualLogSeeds} rows="3" placeholder="Phục bút 1&#10;Phục bút 2"></textarea>
							</div>
							<button class="btn btn-primary" onclick={chronicle.saveManualLog}>💾 Lưu</button>
						</div>
					</details>
				</div>

				<!-- Timeline -->
				{#if chronicle.chapterLogs.length > 0}
					<div class="card">
						<h3 class="card-title">📅 Timeline Cốt Truyện</h3>
						<div class="timeline">
							{#each chronicle.chapterLogs as log}
								<div class="timeline-item">
									<div class="timeline-marker">CH{log.chapter_number}</div>
									<div class="timeline-content">
										<div class="timeline-head">
											<p class="timeline-summary">{log.summary}</p>
											<div class="timeline-actions">
												<button class="btn-icon" onclick={() => chronicle.editChapterLog(log)} title="Sửa">✏️</button>
												<button class="btn-icon btn-danger-icon" onclick={() => chronicle.removeChapterLog(log.chapter_number)} title="Xóa">🗑️</button>
											</div>
										</div>
										{#if log.key_events?.length > 0}
											<div class="timeline-events">
												{#each log.key_events as evt}
													<span class="event-tag">⚡ {evt}</span>
												{/each}
											</div>
										{/if}
										{#if log.plot_seeds?.length > 0}
											<div class="timeline-seeds">
												{#each log.plot_seeds as seed}
													<span class="seed-tag">🌱 {seed}</span>
												{/each}
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Folder Indexing -->
				<div class="card">
					<h3 class="card-title">📂 Nguồn Dữ Liệu & Index</h3>
					<p class="text-muted" style="margin: 0 0 1rem; font-size: 0.8rem;">
						Quản lý các thư mục sẽ được quét để học dữ liệu. Có thể dùng đường dẫn tuyệt đối (ví dụ: <code>E:/MyStory</code>)
						hoặc tương đối so với thư mục gốc (<code>{status?.data_dir || 'co-writer-data'}</code>).
						Thư mục cha sẽ quét luôn tất cả thư mục con.
					</p>

					<!-- Scan Sources List -->
					<div class="sources-list">
						{#each chronicle.scanSources as src}
							<div class="source-item" class:disabled={!src.enabled}>
								<div class="source-info">
									<div class="source-header">
										<span class="source-label">{src.label}</span>
										<span class="category-badge">{src.category}</span>
										{#if src.recursive}
											<span class="badge-recursive" title="Quét đệ quy thư mục con">🔄 Đệ quy</span>
										{:else}
											<span class="badge-flat" title="Chỉ quét thư mục gốc">📁 Gốc</span>
										{/if}
									</div>
									<code class="source-path">{src.folder_path}</code>
								</div>
								<div class="source-actions">
									<label class="toggle-switch" title={src.enabled ? 'Đang bật' : 'Đang tắt'}>
										<input type="checkbox" checked={src.enabled}
											onchange={() => chronicle.toggleSource(src.id, !src.enabled)} />
										<span class="toggle-slider"></span>
									</label>
									<button class="btn-icon btn-danger-icon" onclick={() => chronicle.removeSource(src.id, src.label)} title="Xóa">
										🗑️
									</button>
								</div>
							</div>
						{/each}
						{#if chronicle.scanSources.length === 0}
							<p class="text-muted">Chưa có nguồn quét nào. Thêm thư mục bên dưới.</p>
						{/if}
					</div>

					<!-- Add Source Form -->
					{#if chronicle.showAddSource}
						<div class="add-source-form">
							<div class="form-grid-2">
								<div class="form-row">
									<label for="cw-source-label">Tên hiển thị</label>
									<input id="cw-source-label" type="text" bind:value={chronicle.newSourceLabel} placeholder="VD: 📕 Tập 2 - Biên Niên Sử" />
								</div>
								<div class="form-row">
									<label for="cw-source-category">Danh mục</label>
									<select id="cw-source-category" bind:value={chronicle.newSourceCategory}>
										<option value="manuscripts">📖 Bản thảo (manuscripts)</option>
										<option value="worldbook">🌍 Thế giới quan (worldbook)</option>
										<option value="references">📚 Tham khảo (references)</option>
									</select>
								</div>
							</div>
							<div class="form-row">
								<label for="cw-source-path">Đường dẫn thư mục</label>
								<div class="path-input-row">
									<input id="cw-source-path" type="text" bind:value={chronicle.newSourcePath}
										placeholder="VD: E:/MyStory/TruyenMoi hoặc manuscripts/tap2" />
									<button class="btn" type="button" onclick={chronicle.openFolderBrowser}>📂 Duyệt</button>
								</div>
								<span class="form-hint">Bấm "Duyệt" để chọn thư mục, hoặc gõ đường dẫn trực tiếp.</span>
							</div>
							<div class="form-row-inline">
								<label class="checkbox-label">
									<input type="checkbox" bind:checked={chronicle.newSourceRecursive} />
									Quét đệ quy thư mục con
								</label>
							</div>
							<div class="form-actions">
								<button class="btn" onclick={() => chronicle.showAddSource = false}>Hủy</button>
								<button class="btn btn-primary" onclick={chronicle.addScanSource}>➕ Thêm Nguồn</button>
							</div>
						</div>
					{:else}
						<button class="btn btn-outline" onclick={() => chronicle.showAddSource = true} style="margin-bottom: 1rem;">
							➕ Thêm Thư Mục Quét
						</button>
					{/if}

					<!-- Scan Button -->
					<div class="index-toolbar">
						<button class="btn btn-primary" onclick={chronicle.doScanIndex} disabled={chronicle.isScanning}>
							{chronicle.isScanning ? '⏳ Đang quét...' : '🔄 Scan & Index Tất Cả'}
						</button>
						<button class="btn" onclick={chronicle.doRebuildIndex} disabled={chronicle.isScanning}
							title="Xóa toàn bộ index và embed lại từ đầu (khi đổi model embedding)">
							🧨 Re-index Toàn Bộ
						</button>
						{#if chronicle.scanResult}
							<div class="scan-result">
								<span class="scan-badge new">+{chronicle.scanResult.files_new} mới</span>
								<span class="scan-badge updated">↻{chronicle.scanResult.files_updated} cập nhật</span>
								<span class="scan-badge unchanged">={chronicle.scanResult.files_unchanged} giữ nguyên</span>
								<span class="scan-badge chunks">🧩 {chronicle.scanResult.chunks_created} chunks</span>
								{#if chronicle.scanResult.errors?.length > 0}
									<span class="scan-badge errors">⚠️ {chronicle.scanResult.errors.length} lỗi</span>
								{/if}
							</div>
						{/if}
					</div>
					{#if chronicle.isScanning && chronicle.scanProgress}
						<div class="scan-progress">
							<div class="progress-bar">
								<div class="progress-fill" style="width: {chronicle.scanProgress.files_total ? (chronicle.scanProgress.files_done / chronicle.scanProgress.files_total) * 100 : 0}%"></div>
							</div>
							<span class="scan-progress-text">
								{chronicle.scanProgress.stage} · {chronicle.scanProgress.files_done}/{chronicle.scanProgress.files_total} file
								{#if chronicle.scanProgress.current_file}· <code>{chronicle.scanProgress.current_file}</code>{/if}
								· 🧩 {chronicle.scanProgress.chunks_created} chunks · 📝 {chronicle.scanProgress.summaries_created} tóm tắt
							</span>
						</div>
					{/if}
					{#if chronicle.scanResult?.errors?.length > 0}
						<details class="error-details">
							<summary>⚠️ Chi tiết lỗi ({chronicle.scanResult.errors.length})</summary>
							<ul>
								{#each chronicle.scanResult.errors as err}
									<li><code>{err}</code></li>
								{/each}
							</ul>
						</details>
					{/if}

					{#if chronicle.documents.length > 0}
						<h4 style="margin-top: 1.5rem;">📄 Tài liệu đã index ({chronicle.documents.length})</h4>
						<table class="crud-table">
							<thead>
								<tr>
									<th>File</th>
									<th>Danh mục</th>
									<th>Chunks</th>
									<th>Trạng thái</th>
									<th>Indexed</th>
								</tr>
							</thead>
							<tbody>
								{#each chronicle.documents as doc}
									<tr>
										<td data-label="File">{doc.filename}</td>
										<td data-label="Danh mục">
											<span class="category-badge">{doc.category}</span>
										</td>
										<td data-label="Chunks">{doc.chunk_count}</td>
										<td data-label="Trạng thái">
											<span class="status-badge" class:indexed={doc.status === 'indexed'} class:error={doc.status === 'error'}>
												{doc.status}
											</span>
										</td>
										<td data-label="Indexed">{doc.indexed_at?.split('T')[0] || '—'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{:else}
						<p class="text-muted" style="margin-top: 1rem;">Chưa có tài liệu nào được index. Thêm thư mục rồi bấm <strong>Scan & Index</strong>.</p>
					{/if}
				</div>

				<!-- Knowledge Tree -->
				<div class="card">
					<details ontoggle={(e) => {
						if ((e.currentTarget as HTMLDetailsElement).open && !chronicle.treeLoaded && !chronicle.isLoadingTree) chronicle.loadTree();
					}}>
						<summary class="card-title clickable">🌲 Cây Tri Thức — mục lục AI đọc khi suy luận</summary>
						<div class="tree-browser">
							{#if chronicle.isLoadingTree}
								<p class="text-muted">⏳ Đang tải cây tri thức...</p>
							{:else if chronicle.treeLoaded && chronicle.treeDocs.length === 0}
								<p class="text-muted">Chưa có tài liệu nào. Scan & Index trước đã.</p>
							{:else}
								<div class="tree-toolbar">
									<button class="btn btn-sm" onclick={chronicle.loadTree}>↻ Tải lại</button>
								</div>
								{#each chronicle.treeDocs as doc}
									<details class="tree-doc">
										<summary>
											📄 <strong>{doc.filename}</strong>
											<span class="category-badge">{doc.category}</span>
											<span class="source-pick-badge">{doc.nodes?.length || 0} mục</span>
										</summary>
										{#if doc.description}
											<p class="tree-doc-desc">{doc.description}</p>
										{/if}
										{#each doc.nodes || [] as node}
											<div class="tree-node" style="padding-left: {Math.min(node.level, 4) * 1}rem;">
												<div class="tree-node-title">
													<strong>{node.title}</strong>
													<span class="source-pick-badge">~{node.token_count} tokens</span>
												</div>
												{#if node.summary}
													<p class="tree-node-summary">{node.summary}</p>
												{/if}
											</div>
										{/each}
									</details>
								{/each}
							{/if}
						</div>
					</details>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Entity Modal -->
{#if worldBible.showEntityModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => worldBible.showEntityModal = false}>
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<h3>{worldBible.editingEntity ? `Sửa ${worldBible.editingEntity.id}` : 'Tạo Entity Mới'}</h3>
			<div class="modal-form">
				{#if !worldBible.editingEntity}
					<div class="form-row">
					<label for="cw-entity-type">Loại</label>
					<select id="cw-entity-type" bind:value={worldBible.entityForm.entity_type}>
							{#each ENTITY_TYPES as et}
								<option value={et.value}>{et.label}</option>
							{/each}
						</select>
					</div>
				{/if}
				<div class="form-row">
					<label for="cw-entity-name">Tên</label>
					<input id="cw-entity-name" type="text" bind:value={worldBible.entityForm.name} placeholder="Miyamoto Okita" />
				</div>
				<div class="form-row">
					<label for="cw-entity-aliases">Bí danh (cách nhau bởi dấu phẩy)</label>
					<input id="cw-entity-aliases" type="text" bind:value={worldBible.entityForm.aliases} placeholder="Okita, Kiếm Vương Đỏ" />
				</div>
				{#if worldBible.entityForm.entity_type === 'character'}
					<div class="form-row">
						<label for="cw-entity-role">Vai trò</label>
						<select id="cw-entity-role" bind:value={worldBible.entityForm.role}>
							<option value="">—</option>
							<option value="protagonist">Nhân vật chính</option>
							<option value="supporting">Nhân vật phụ</option>
							<option value="antagonist">Phản diện</option>
						</select>
					</div>
				{/if}
				<div class="form-grid-2">
					<div class="form-row">
						<label for="cw-entity-first-chapter">Chương xuất hiện</label>
						<input id="cw-entity-first-chapter" type="number" bind:value={worldBible.entityForm.first_chapter} min="1" />
					</div>
					<div class="form-row">
						<label for="cw-entity-collision-priority">Ưu tiên va chạm</label>
						<input id="cw-entity-collision-priority" type="number" bind:value={worldBible.entityForm.collision_priority} min="1" />
					</div>
				</div>
				<div class="form-row">
					<label for="cw-entity-description">Mô tả</label>
					<textarea id="cw-entity-description" bind:value={worldBible.entityForm.description} rows="4" placeholder="Mô tả chi tiết..."></textarea>
				</div>
			</div>
			<div class="modal-actions">
				<button class="btn" onclick={() => worldBible.showEntityModal = false}>Hủy</button>
				<button class="btn btn-primary" onclick={worldBible.save}>
					{worldBible.editingEntity ? '💾 Cập Nhật' : '✨ Tạo Mới'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Hidden File Inputs -->
<input type="file" accept=".md,.txt" style="display:none"
	bind:this={importFileInput} onchange={chronicle.handleChapterFileImport} />
<input type="file" accept=".md,.txt" style="display:none"
	bind:this={entityDetectFileInput} onchange={worldBible.handleDetectFile} />

<!-- Entity Detection Modal -->
{#if worldBible.showDetectModal}
<div
	class="modal-overlay"
	role="presentation"
	tabindex="-1"
	onclick={(event) => {
		if (event.target === event.currentTarget) worldBible.showDetectModal = false;
	}}
	onkeydown={(event) => {
		if (event.key === 'Escape') worldBible.showDetectModal = false;
	}}
>
	<div class="modal-content" style="max-width: 680px;" role="dialog" aria-modal="true" aria-labelledby="cw-detect-modal-title">
		<h3 id="cw-detect-modal-title">🔍 Entities AI Phát Hiện</h3>
		<p class="text-muted" style="margin: 0 0 1rem;">
			Chọn các entity mới để thêm vào World Bible. Entity trùng sẽ được đánh dấu.
		</p>
		{#if worldBible.detectedEntities.length === 0}
			<p>Không phát hiện entity nào.</p>
		{:else}
			<div class="detect-list">
				{#each worldBible.detectedEntities as ent, idx}
					<div class="detect-item" class:is-dup={!ent.is_new}>
						<label class="detect-checkbox">
							<input type="checkbox"
								checked={worldBible.detectSelectedIds.has(idx)}
								disabled={!ent.is_new}
								onchange={() => worldBible.toggleDetected(idx)} />
						</label>
						<div class="detect-info">
							<div class="detect-header">
								<span class="entity-icon">{entityIcon(ent.entity_type)}</span>
								<strong>{ent.name}</strong>
								{#if !ent.is_new}
									<span class="badge-flat">🔄 Đã có</span>
								{:else}
									<span class="badge-recursive">✨ Mới</span>
								{/if}
							</div>
							{#if ent.aliases?.length > 0}
								<p class="entity-aliases">{ent.aliases.join(', ')}</p>
							{/if}
							{#if ent.description}
								<p class="entity-desc">{ent.description.substring(0, 150)}</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
		<div class="modal-actions">
			<button class="btn" onclick={() => worldBible.showDetectModal = false}>Hủy</button>
			<button class="btn btn-primary" onclick={worldBible.approveDetected}
				disabled={worldBible.detectSelectedIds.size === 0}>
				✅ Thêm {worldBible.detectSelectedIds.size} Entity Đã Chọn
			</button>
		</div>
	</div>
</div>
{/if}

<!-- Folder Browser Modal -->
{#if chronicle.showFolderBrowser}
<div
	class="modal-overlay"
	role="presentation"
	tabindex="-1"
	onclick={(event) => {
		if (event.target === event.currentTarget) chronicle.showFolderBrowser = false;
	}}
	onkeydown={(event) => {
		if (event.key === 'Escape') chronicle.showFolderBrowser = false;
	}}
>
	<div class="modal-content" style="max-width: 600px; max-height: 80vh;" role="dialog" aria-modal="true" aria-labelledby="cw-folder-modal-title">
		<h3 id="cw-folder-modal-title">📂 Chọn Thư Mục</h3>

		<!-- Breadcrumb -->
		<div class="browse-breadcrumb">
			{#if chronicle.browseCurrentPath}
				{@const parts = chronicle.browseCurrentPath.replace(/\\/g, '/').split('/').filter(Boolean)}
				<button class="breadcrumb-item" onclick={() => chronicle.browseTo('')}>💻 Drives</button>
				{#each parts as part, i}
					<span class="breadcrumb-sep">/</span>
					<button class="breadcrumb-item"
						onclick={() => chronicle.browseTo(parts.slice(0, i + 1).join('/') + '/')}>
						{part}
					</button>
				{/each}
			{:else}
				<span class="breadcrumb-item active">💻 Chọn ổ đĩa</span>
			{/if}
		</div>

		<!-- Directory List -->
		<div class="browse-list">
			{#if chronicle.isBrowsing}
				<div class="empty-state"><p>⏳ Đang tải...</p></div>
			{:else if chronicle.browseCurrentPath && chronicle.browseDirs.length === 0}
				<div class="empty-state"><p>Thư mục trống (không có thư mục con)</p></div>
			{:else}
				{#if !chronicle.browseCurrentPath && chronicle.browseDrives.length > 0}
					{#each chronicle.browseDrives as drive}
						<button class="browse-item" onclick={() => chronicle.browseTo(drive)}>
							💾 {drive}
						</button>
					{/each}
				{/if}
				{#each chronicle.browseDirs as dir}
					<button class="browse-item" onclick={() => chronicle.browseTo(dir)}>
						📁 {dir.replace(/\\/g, '/').split('/').filter(Boolean).pop() || dir}
					</button>
				{/each}
			{/if}
		</div>

		<div class="modal-actions">
			<button class="btn" onclick={() => chronicle.showFolderBrowser = false}>Hủy</button>
			<button class="btn btn-primary" onclick={chronicle.selectBrowsedFolder}
				disabled={!chronicle.browseCurrentPath}>
				✅ Chọn: {chronicle.browseCurrentPath || '...'}
			</button>
		</div>
	</div>
</div>
{/if}

<style>
	/* ═══════════ BASE ═══════════ */
	.cw-page { max-width: 1400px; margin: 0 auto; }

	.cw-header {
		display: flex; justify-content: space-between; align-items: flex-start;
		margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;
	}
	.cw-title h1 { margin: 0; font-size: 1.75rem; }
	.cw-subtitle { margin: 0.25rem 0 0; color: var(--color-text-muted); font-size: 0.875rem; }
	.project-switcher {
		display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
		margin-top: 0.75rem; font-size: 0.8125rem; color: var(--color-text-muted);
	}
	.project-switcher label { font-weight: 600; }
	.project-switcher select {
		min-width: 220px; padding: 0.45rem 0.65rem; border-radius: var(--radius-md);
		border: 1px solid var(--color-surface-300); background: var(--color-surface-200);
		color: var(--color-text-primary);
	}
	.project-switcher select:disabled { opacity: 0.65; cursor: not-allowed; }
	.cw-stats { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.stat-chip {
		padding: 0.375rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
		background: var(--color-surface-200); color: var(--color-text-secondary);
	}

	/* Tabs */
	.cw-tabs {
		display: flex; gap: 0.25rem; margin-bottom: 1.5rem;
		border-bottom: 2px solid var(--color-surface-200); padding-bottom: 0;
	}
	.tab-btn {
		padding: 0.75rem 1.25rem; border: none; background: none; cursor: pointer;
		font-size: 0.875rem; font-weight: 600; color: var(--color-text-muted);
		border-bottom: 3px solid transparent; transition: all 0.2s;
		margin-bottom: -2px;
	}
	.tab-btn:hover { color: var(--color-text-primary); }
	.tab-btn.active {
		color: var(--color-brand-500); border-bottom-color: var(--color-brand-500);
	}

	/* Cards */
	.card {
		background: var(--color-surface-100); border-radius: var(--radius-lg);
		padding: 1.5rem; margin-bottom: 1rem;
		border: 1px solid rgba(255,255,255,0.05);
	}
	.card-compact { padding: 1rem; }
	.card-title { margin: 0 0 1rem; font-size: 1rem; font-weight: 700; }

	/* Form elements */
	.form-row { margin-bottom: 0.75rem; }
	.form-row label { display: block; margin-bottom: 0.25rem; font-size: 0.8125rem; font-weight: 600; color: var(--color-text-muted); }
	.form-row input, .form-row textarea, .form-row select {
		width: 100%; padding: 0.5rem 0.75rem; border-radius: var(--radius-md);
		border: 1px solid var(--color-surface-300); background: var(--color-surface-200);
		color: var(--color-text-primary); font-size: 0.875rem; resize: vertical;
	}
	.form-row input:focus, .form-row textarea:focus, .form-row select:focus {
		outline: none; border-color: var(--color-brand-500);
		box-shadow: 0 0 0 2px rgba(var(--color-brand-500-rgb, 34,197,94), 0.2);
	}
	.input-sm { max-width: 120px; }
	.form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }

	/* Buttons */
	.btn {
		padding: 0.5rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--color-surface-300);
		background: var(--color-surface-200); color: var(--color-text-primary);
		font-size: 0.8125rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
	}
	.btn:hover { background: var(--color-surface-300); }
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn-primary { background: var(--color-brand-500); color: #fff; border-color: var(--color-brand-500); }
	.btn-primary:hover { background: var(--color-brand-600); }
	.btn-accent { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; border: none; }
	.btn-accent:hover { filter: brightness(1.1); }
	.btn-danger { background: #ef4444; color: #fff; border-color: #ef4444; }
	.btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
	.btn-lg { width: 100%; padding: 0.75rem; font-size: 1rem; }

	/* ═══════════ WORKSHOP ═══════════ */
	.workshop-flow { display: flex; flex-direction: column; gap: 1rem; }
	.workshop-output {
		border-top: 2px solid var(--color-surface-300); padding-top: 1.5rem; margin-top: 0.5rem;
		display: flex; flex-direction: column; gap: 1rem;
	}
	.beats-editor { font-family: 'JetBrains Mono', monospace; line-height: 1.6; width: 100%; min-height: 200px; }

	.settings-grid { display: flex; flex-direction: column; gap: 0.5rem; }
	.slider-row { margin-bottom: 0.5rem; }
	.slider-row label { font-size: 0.8125rem; font-weight: 600; color: var(--color-text-muted); }
	.slider-row input[type=range] { width: 100%; margin-top: 0.25rem; }
	.checkbox-row {
		display: flex; align-items: center; gap: 0.5rem;
		font-size: 0.8125rem; cursor: pointer;
	}

	.budget-bars { display: flex; flex-direction: column; gap: 0.75rem; }
	.budget-item span { font-size: 0.75rem; color: var(--color-text-muted); }
	.progress-bar { height: 6px; background: var(--color-surface-300); border-radius: 3px; margin-top: 0.25rem; }
	.progress-fill { height: 100%; background: var(--color-brand-500); border-radius: 3px; transition: width 0.3s; }
	.budget-total { font-size: 0.875rem; padding-top: 0.5rem; border-top: 1px solid var(--color-surface-300); }

	.output-text {
		white-space: pre-wrap; font-size: 0.875rem; line-height: 1.7;
		max-height: 500px; overflow-y: auto; padding: 1rem;
		background: var(--color-surface-200); border-radius: var(--radius-md);
		margin-bottom: 0.75rem;
	}
	.prompt-preview {
		white-space: pre-wrap; font-size: 0.75rem; max-height: 300px; overflow-y: auto;
		background: var(--color-surface-200); padding: 0.75rem; border-radius: var(--radius-md);
		margin-top: 0.5rem;
	}

	/* Button Row & Actions */
	.btn-row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
	.wb-actions { display: flex; gap: 0.5rem; }
	.path-input-row { display: flex; gap: 0.5rem; align-items: center; }
	.path-input-row input { flex: 1; }
	.path-input-row .btn { white-space: nowrap; flex-shrink: 0; }

	.empty-state {
		text-align: center; padding: 3rem 1rem; color: var(--color-text-muted);
	}
	.empty-state.full-width { grid-column: 1 / -1; }
	.empty-icon { font-size: 3rem; margin-bottom: 1rem; opacity: 0.5; }
	.text-muted { color: var(--color-text-muted); font-size: 0.875rem; }

	/* ═══════════ WORLD BIBLE ═══════════ */
	.wb-toolbar {
		display: flex; justify-content: space-between; align-items: center;
		margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.75rem;
	}
	.wb-filters { display: flex; gap: 0.375rem; flex-wrap: wrap; }
	.filter-chip {
		padding: 0.375rem 0.75rem; border-radius: 999px; border: 1px solid var(--color-surface-300);
		background: transparent; color: var(--color-text-muted); font-size: 0.75rem;
		cursor: pointer; transition: all 0.2s;
	}
	.filter-chip:hover { border-color: var(--color-brand-500); }
	.filter-chip.active {
		background: var(--color-brand-500); color: #fff; border-color: var(--color-brand-500);
	}

	.entity-grid {
		display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;
	}
	.entity-card {
		background: var(--color-surface-100); border-radius: var(--radius-lg);
		padding: 1.25rem; border: 1px solid rgba(255,255,255,0.05);
		transition: all 0.2s;
	}
	.entity-card:hover { border-color: var(--color-brand-500); transform: translateY(-2px); }
	.entity-card-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
	.entity-icon { font-size: 1.25rem; }
	.entity-id { font-family: monospace; font-size: 0.75rem; color: var(--color-brand-400); font-weight: 700; }
	.entity-role {
		margin-left: auto; font-size: 0.625rem; padding: 0.125rem 0.5rem;
		border-radius: 999px; background: var(--color-surface-300); text-transform: uppercase;
		letter-spacing: 0.5px; font-weight: 700;
	}
	.entity-name { margin: 0 0 0.25rem; font-size: 1rem; }
	.entity-aliases { font-size: 0.75rem; color: var(--color-text-muted); margin: 0 0 0.375rem; font-style: italic; }
	.entity-desc { font-size: 0.8125rem; color: var(--color-text-secondary); margin: 0 0 0.75rem; line-height: 1.5; }
	.entity-actions { display: flex; gap: 0.375rem; justify-content: flex-end; }

	/* ═══════════ CHRONICLE ═══════════ */
	.chronicle-layout { display: flex; flex-direction: column; gap: 1rem; }

	.manual-form { padding-top: 1rem; }
	.clickable { cursor: pointer; }
	.clickable:hover { color: var(--color-brand-500); }

	.timeline { position: relative; padding-left: 2rem; }
	.timeline::before {
		content: ''; position: absolute; left: 0.75rem; top: 0; bottom: 0;
		width: 2px; background: var(--color-surface-300);
	}
	.timeline-item { position: relative; margin-bottom: 1.5rem; }
	.timeline-marker {
		position: absolute; left: -2rem; top: 0;
		width: 3rem; height: 1.5rem; display: flex; align-items: center; justify-content: center;
		background: var(--color-brand-500); color: #fff; border-radius: var(--radius-md);
		font-size: 0.625rem; font-weight: 800;
	}
	.timeline-content { padding-left: 1.5rem; }
	.timeline-summary { margin: 0 0 0.5rem; font-size: 0.875rem; line-height: 1.5; }
	.timeline-events, .timeline-seeds { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 0.25rem; }
	.event-tag, .seed-tag {
		font-size: 0.6875rem; padding: 0.125rem 0.5rem; border-radius: 999px;
	}
	.event-tag { background: rgba(239,68,68,0.15); color: #f87171; }
	.seed-tag { background: rgba(34,197,94,0.15); color: #4ade80; }

	/* Indexing */
	.index-toolbar { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
	.scan-result { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.scan-badge {
		padding: 0.25rem 0.625rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 700;
	}
	.scan-badge.new { background: rgba(34,197,94,0.15); color: #4ade80; }
	.scan-badge.updated { background: rgba(251,191,36,0.15); color: #fbbf24; }
	.scan-badge.unchanged { background: rgba(148,163,184,0.15); color: #94a3b8; }
	.scan-badge.chunks { background: rgba(99,102,241,0.15); color: #818cf8; }
	.scan-badge.errors { background: rgba(239,68,68,0.15); color: #f87171; }

	/* Scan Sources */
	.sources-list { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
	.source-item {
		display: flex; align-items: center; justify-content: space-between; gap: 1rem;
		padding: 0.75rem 1rem; border-radius: var(--radius-md);
		background: var(--color-surface-200); transition: all 0.2s;
	}
	.source-item.disabled { opacity: 0.5; }
	.source-info { flex: 1; min-width: 0; }
	.source-header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.25rem; }
	.source-label { font-weight: 600; font-size: 0.875rem; }
	.source-path {
		font-size: 0.75rem; color: var(--color-text-muted); display: block;
		overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
		background: none; padding: 0;
	}
	.source-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
	.badge-recursive, .badge-flat {
		font-size: 0.625rem; padding: 0.125rem 0.5rem; border-radius: 999px;
		font-weight: 700;
	}
	.badge-recursive { background: rgba(99,102,241,0.15); color: #818cf8; }
	.badge-flat { background: rgba(148,163,184,0.15); color: #94a3b8; }

	/* Toggle Switch */
	.toggle-switch { position: relative; display: inline-block; width: 36px; height: 20px; cursor: pointer; }
	.toggle-switch input { opacity: 0; width: 0; height: 0; }
	.toggle-slider {
		position: absolute; inset: 0; background: var(--color-surface-400);
		border-radius: 999px; transition: 0.3s;
	}
	.toggle-slider::before {
		content: ''; position: absolute; width: 14px; height: 14px;
		left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: 0.3s;
	}
	.toggle-switch input:checked + .toggle-slider { background: var(--color-brand-500); }
	.toggle-switch input:checked + .toggle-slider::before { transform: translateX(16px); }

	.btn-icon { border: none; background: none; cursor: pointer; padding: 0.25rem; font-size: 1rem; opacity: 0.6; transition: 0.2s; }
	.btn-icon:hover { opacity: 1; }
	.btn-danger-icon:hover { filter: brightness(1.3); }

	/* Add Source Form */
	.add-source-form {
		background: var(--color-surface-200); border-radius: var(--radius-md);
		padding: 1.25rem; margin-bottom: 1rem; border: 1px dashed var(--color-surface-400);
	}
	.form-hint { font-size: 0.6875rem; color: var(--color-text-muted); margin-top: 0.25rem; display: block; }
	.form-row-inline { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
	.checkbox-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; cursor: pointer; }
	.checkbox-label input[type="checkbox"] { accent-color: var(--color-brand-500); }
	.form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
	.btn-outline {
		background: transparent; border: 1px dashed var(--color-surface-400);
		color: var(--color-text-muted); padding: 0.5rem 1rem; border-radius: var(--radius-md);
		cursor: pointer; font-size: 0.8125rem; transition: 0.2s;
	}
	.btn-outline:hover { border-color: var(--color-brand-500); color: var(--color-brand-500); }

	/* Error Details */
	.error-details { margin: 0.75rem 0 1rem; font-size: 0.8125rem; }
	.error-details summary { cursor: pointer; color: #f87171; font-weight: 600; }
	.error-details ul { margin-top: 0.5rem; padding-left: 1.5rem; }
	.error-details code { font-size: 0.75rem; word-break: break-all; }

	.category-badge {
		padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.6875rem;
		background: var(--color-surface-300); font-weight: 600;
	}
	.status-badge {
		padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600;
	}
	.status-badge.indexed { background: rgba(34,197,94,0.15); color: #4ade80; }
	.status-badge.error { background: rgba(239,68,68,0.15); color: #f87171; }

	/* Table */
	.crud-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
	.crud-table th { text-align: left; padding: 0.5rem; color: var(--color-text-muted); font-size: 0.75rem; border-bottom: 1px solid var(--color-surface-300); }
	.crud-table td { padding: 0.5rem; border-bottom: 1px solid var(--color-surface-200); }

	/* Modal */
	.modal-overlay {
		position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100;
		display: flex; align-items: center; justify-content: center;
		backdrop-filter: blur(4px);
	}
	.modal-content {
		background: var(--color-surface-100); border-radius: var(--radius-lg);
		padding: 2rem; width: 90%; max-width: 520px; max-height: 90vh; overflow-y: auto;
		border: 1px solid rgba(255,255,255,0.1);
	}
	.modal-content h3 { margin: 0 0 1.25rem; }
	.modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem; }
	/* Entity Detection */
	.detect-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 400px; overflow-y: auto; }
	.detect-item {
		display: flex; gap: 0.75rem; padding: 0.75rem;
		background: var(--color-surface-200); border-radius: var(--radius-md);
		align-items: flex-start; transition: 0.2s;
	}
	.detect-item.is-dup { opacity: 0.5; }
	.detect-checkbox { flex-shrink: 0; padding-top: 0.25rem; }
	.detect-checkbox input { accent-color: var(--color-brand-500); }
	.detect-info { flex: 1; min-width: 0; }
	.detect-header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.25rem; }

	/* Folder Browser */
	.browse-breadcrumb {
		display: flex; align-items: center; gap: 0.125rem; flex-wrap: wrap;
		padding: 0.5rem 0.75rem; margin-bottom: 0.75rem;
		background: var(--color-surface-200); border-radius: var(--radius-md);
		font-size: 0.8125rem;
	}
	.breadcrumb-item {
		background: none; border: none; cursor: pointer; padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm); color: var(--color-brand-400); font-weight: 600;
		transition: 0.2s;
	}
	.breadcrumb-item:hover { background: var(--color-surface-300); }
	.breadcrumb-item.active { color: var(--color-text-primary); cursor: default; }
	.breadcrumb-sep { color: var(--color-text-muted); font-size: 0.75rem; }
	.browse-list {
		display: flex; flex-direction: column; gap: 0.25rem;
		max-height: 350px; overflow-y: auto; margin-bottom: 0.75rem;
	}
	.browse-item {
		display: block; width: 100%; text-align: left;
		background: none; border: 1px solid transparent;
		padding: 0.5rem 0.75rem; border-radius: var(--radius-md);
		cursor: pointer; font-size: 0.8125rem; transition: 0.2s;
		color: var(--color-text-primary);
	}
	.browse-item:hover { background: var(--color-surface-200); border-color: var(--color-brand-500); }

	/* ═══════════ PHASE E: SETTINGS / HISTORY / PROGRESS ═══════════ */
	.stat-chip.stat-warn { background: rgba(239,68,68,0.15); color: #f87171; }

	.ai-settings {
		margin-top: 0.75rem; padding-top: 0.75rem;
		border-top: 1px dashed var(--color-surface-300);
	}

	.history-list { padding-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
	.history-item {
		display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem;
		padding: 0.625rem 0.75rem; background: var(--color-surface-200);
		border-radius: var(--radius-md);
	}
	.history-info { flex: 1; min-width: 0; }
	.history-title {
		display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
		font-size: 0.8125rem;
	}
	.history-preview {
		margin: 0.25rem 0 0; font-size: 0.75rem; color: var(--color-text-muted);
		line-height: 1.4;
		display: -webkit-box; line-clamp: 2; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
		overflow: hidden;
	}
	.history-actions { display: flex; align-items: center; gap: 0.375rem; flex-shrink: 0; }

	.scan-progress { margin: 0.5rem 0 1rem; }
	.scan-progress .progress-bar { height: 8px; margin-bottom: 0.375rem; }
	.scan-progress-text { font-size: 0.75rem; color: var(--color-text-muted); }
	.scan-progress-text code { font-size: 0.6875rem; word-break: break-all; }

	.timeline-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
	.timeline-head .timeline-summary { flex: 1; }
	.timeline-actions { display: flex; gap: 0.25rem; flex-shrink: 0; opacity: 0.7; }

	.entity-search {
		padding: 0.5rem 0.75rem; border-radius: var(--radius-md);
		border: 1px solid var(--color-surface-300); background: var(--color-surface-200);
		color: var(--color-text-primary); font-size: 0.8125rem; min-width: 200px;
	}
	.entity-search:focus { outline: none; border-color: var(--color-brand-500); }
	.entity-desc-toggle {
		background: none; border: none; cursor: pointer; padding: 0;
		font-size: 0.6875rem; color: var(--color-brand-400); font-weight: 600;
		margin-bottom: 0.75rem;
	}
	.entity-desc-toggle:hover { text-decoration: underline; }

	/* ═══════════ SOURCES PANEL & KNOWLEDGE TREE ═══════════ */
	.sources-hint { margin: 0 0 0.75rem; font-size: 0.8rem; }
	.sources-sub {
		margin: 0.75rem 0 0.375rem; font-size: 0.8125rem; font-weight: 700;
		color: var(--color-text-muted);
	}
	.source-pick {
		display: flex; gap: 0.625rem; align-items: flex-start;
		padding: 0.5rem 0.75rem; margin-bottom: 0.375rem;
		background: var(--color-surface-200); border-radius: var(--radius-md);
		cursor: pointer; transition: opacity 0.2s;
	}
	.source-pick input { margin-top: 0.2rem; accent-color: var(--color-brand-500); flex-shrink: 0; }
	.source-pick.excluded { opacity: 0.45; }
	.source-pick.excluded .source-pick-title strong { text-decoration: line-through; }
	.source-pick-info { flex: 1; min-width: 0; }
	.source-pick-title {
		display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
		font-size: 0.8125rem;
	}
	.source-pick-file { font-size: 0.6875rem; color: var(--color-text-muted); font-family: monospace; }
	.source-pick-badge {
		font-size: 0.625rem; padding: 0.125rem 0.5rem; border-radius: 999px;
		background: rgba(99,102,241,0.15); color: #818cf8; font-weight: 700;
		white-space: nowrap;
	}
	.source-pick-reason {
		margin: 0.25rem 0 0; font-size: 0.75rem; color: var(--color-text-secondary);
		line-height: 1.4; font-style: italic;
	}

	.tree-browser { padding-top: 0.75rem; }
	.tree-toolbar { margin-bottom: 0.75rem; }
	.tree-doc {
		margin-bottom: 0.5rem; padding: 0.5rem 0.75rem;
		background: var(--color-surface-200); border-radius: var(--radius-md);
	}
	.tree-doc summary {
		cursor: pointer; font-size: 0.8125rem;
		display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
	}
	.tree-doc-desc {
		margin: 0.5rem 0; font-size: 0.75rem; color: var(--color-text-secondary);
		font-style: italic; line-height: 1.4;
	}
	.tree-node { margin: 0.5rem 0; }
	.tree-node-title {
		display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
		font-size: 0.8125rem;
	}
	.tree-node-summary {
		margin: 0.125rem 0 0; font-size: 0.75rem; color: var(--color-text-muted);
		line-height: 1.45;
		display: -webkit-box; line-clamp: 2; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Light Theme */
	:global(html[data-theme='light']) .card { background: #fff; border-color: #e5e7eb; }
	:global(html[data-theme='light']) .entity-card { background: #fff; border-color: #e5e7eb; }
	:global(html[data-theme='light']) .entity-card:hover { border-color: var(--color-brand-500); }
	:global(html[data-theme='light']) .modal-content { background: #fff; border-color: #e5e7eb; }
	:global(html[data-theme='light']) .form-row input,
	:global(html[data-theme='light']) .form-row textarea,
	:global(html[data-theme='light']) .form-row select {
		background: #f9fafb; border-color: #d1d5db;
	}
	:global(html[data-theme='light']) .stat-chip { background: #f3f4f6; }
	:global(html[data-theme='light']) .output-text { background: #f9fafb; }
	:global(html[data-theme='light']) .browse-item:hover { background: #f3f4f6; }
	:global(html[data-theme='light']) .detect-item { background: #f3f4f6; }

	/* Responsive */
	@media (max-width: 900px) {
		.entity-grid { grid-template-columns: 1fr; }
	}
</style>
