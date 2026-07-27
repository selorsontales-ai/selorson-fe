<!-- Cổng Duyệt Chương — ba cổng của tác giả (CW-420) -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		allowsCapability,
		fetchRuntimeCapabilities,
		type RuntimeCapabilities
	} from '$lib/runtime';
	import { toast_error, toast_success } from '$lib/stores/admin.svelte';
	import {
		acceptCanon,
		approveBlueprint,
		approveResearch,
		buildResearch,
		getWorkflow,
		getWriterPack,
		importBlueprint,
		importDraft,
		applyDelta,
		listProjectionRuns,
		listProjections,
		rebuildProjections,
		parseStored,
		STAGE_LABEL,
		STAGE_ORDER,
		stageIndex,
		startWorkflow,
		type CanonCommit,
		type ChapterStage,
		type ChapterWorkflow,
		type ContextBlock,
		type ProjectionRun,
		type ResearchPack,
		type StoryProjection
	} from '$lib/co-writer/workflow';
	import {
		previewCmsDraft,
		publishChapter,
		pushCmsDraft,
		unpublishChapter,
		type DraftPreview
	} from '$lib/co-writer/cms';

	// ═══════════════ TRẠNG THÁI ═══════════════
	let capabilities = $state<RuntimeCapabilities | null>(null);
	let chapter = $state(1);
	let workflow = $state<ChapterWorkflow | null>(null);
	let canonCommits = $state<CanonCommit[]>([]);
	let loading = $state(false);
	let busy = $state('');

	// Ý đồ chương
	let premise = $state('');
	let goals = $state('');
	let mustInclude = $state('');
	let mustAvoid = $state('');
	let pov = $state('');
	let tense = $state('quá khứ');
	let language = $state('vi');
	let targetWords = $state(2500);
	let voiceNotes = $state('');

	// Cổng 1
	let extraQuery = $state('');
	let maxBlocks = $state(12);
	let budgetTokens = $state(4000);
	let pinned = $state<Set<number>>(new Set());
	let vetoed = $state<Set<number>>(new Set());

	// Cổng 2 và 3
	let blueprintText = $state('');
	let draftText = $state('');
	let canonText = $state('');
	let expandedBlocks = $state<Set<number>>(new Set());

	// Phóng chiếu (CW-430)
	let runs = $state<ProjectionRun[]>([]);
	let projections = $state<StoryProjection[]>([]);
	let deltaText = $state('');
	let selectedRun = $state('');

	// Gửi sang CMS (CW-510)
	let cmsPreview = $state<DraftPreview | null>(null);
	let confirmUnpublish = $state(false);

	let writable = $derived(allowsCapability(capabilities, 'co_writer_write'));
	let canPushCms = $derived(allowsCapability(capabilities, 'cms_draft_push'));
	let canPublish = $derived(allowsCapability(capabilities, 'cms_publish'));
	let stage = $derived<ChapterStage | null>(workflow?.stage ?? null);
	let researchPack = $derived(parseStored<ResearchPack>(workflow?.research_pack_json ?? null));
	let blueprint = $derived(
		parseStored<Record<string, any>>(workflow?.blueprint_json ?? null)
	);
	let draft = $derived(parseStored<Record<string, any>>(workflow?.draft_json ?? null));
	let blocks = $derived<ContextBlock[]>(researchPack?.blocks ?? []);

	onMount(async () => {
		try {
			capabilities = await fetchRuntimeCapabilities();
		} catch {
			capabilities = null;
		}
		await load();
	});

	// ═══════════════ NẠP ═══════════════

	async function load() {
		loading = true;
		const res = await getWorkflow(chapter);
		loading = false;
		if (!res.success) {
			toast_error(res.message || 'Không nạp được workflow');
			return;
		}
		workflow = res.data.workflow;
		canonCommits = res.data.canon_commits ?? [];
		syncFormFromWorkflow();
		await loadProjections();
		await loadCmsPreview();
	}

	/**
	 * Không có canon thì không có gì để gửi, nên xem trước cũng không có
	 * nghĩa — backend sẽ trả lỗi và toast sẽ nổ mỗi lần đổi chương.
	 */
	async function loadCmsPreview() {
		confirmUnpublish = false;
		if (!canonCommits.length) {
			cmsPreview = null;
			return;
		}
		const res = await previewCmsDraft(chapter);
		cmsPreview = res.success ? res.data : null;
	}

	async function loadProjections() {
		const [runList, projectionList] = await Promise.all([
			listProjectionRuns(chapter),
			listProjections(true)
		]);
		runs = runList.success ? runList.data.runs : [];
		projections = projectionList.success ? projectionList.data.projections : [];
		// Run chưa xong đầu tiên là cái tác giả sẽ áp delta vào; chọn sẵn để
		// họ không phải dán id bằng tay.
		selectedRun = runs.find((run) => run.status !== 'succeeded')?.id ?? runs[0]?.id ?? '';
	}

	/**
	 * Đổ ý đồ đã lưu ngược lại form.
	 *
	 * Không làm bước này thì mỗi lần đổi chương form vẫn giữ chữ của chương
	 * cũ, và một cú bấm Lưu sẽ ghi ý đồ chương này đè lên chương kia.
	 */
	function syncFormFromWorkflow() {
		pinned = new Set();
		vetoed = new Set();
		blueprintText = '';
		draftText = '';
		if (!workflow) {
			premise = '';
			goals = '';
			mustInclude = '';
			mustAvoid = '';
			canonText = '';
			return;
		}
		const intent = parseStored<Record<string, any>>(workflow.intent_json) ?? {};
		const contract = parseStored<Record<string, any>>(workflow.chapter_contract_json) ?? {};
		premise = intent.premise ?? '';
		goals = (intent.goals ?? []).join('\n');
		mustInclude = (intent.must_include ?? []).join('\n');
		mustAvoid = (intent.must_avoid ?? []).join('\n');
		pov = contract.pov ?? '';
		tense = contract.tense ?? 'quá khứ';
		language = contract.language ?? 'vi';
		targetWords = contract.target_words ?? 2500;
		voiceNotes = contract.style?.voice_notes ?? '';

		const stored = parseStored<ResearchPack>(workflow.research_pack_json);
		for (const block of stored?.blocks ?? []) {
			if (block.pinned) pinned.add(block.chunk_id);
			if (block.vetoed) vetoed.add(block.chunk_id);
		}
		pinned = new Set(pinned);
		vetoed = new Set(vetoed);
		canonText = parseStored<Record<string, any>>(workflow.draft_json)?.text ?? '';
	}

	const lines = (value: string) =>
		value
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);

	// ═══════════════ Ý ĐỒ CHƯƠNG ═══════════════

	async function saveIntent(rewrite: boolean) {
		if (!premise.trim()) {
			toast_error('Cần viết tiền đề chương trước.');
			return;
		}
		busy = 'intent';
		const res = await startWorkflow(
			chapter,
			{
				premise: premise.trim(),
				goals: lines(goals),
				must_include: lines(mustInclude),
				must_avoid: lines(mustAvoid)
			},
			{
				pov: pov.trim(),
				tense,
				language,
				target_words: targetWords,
				style: { voice_notes: voiceNotes.trim() }
			},
			rewrite ? (workflow?.revision ?? undefined) : undefined
		);
		busy = '';
		if (!res.success) {
			toast_error(res.message || 'Không lưu được ý đồ chương');
			return;
		}
		toast_success(rewrite ? 'Đã viết lại ý đồ chương' : 'Đã lưu ý đồ chương');
		await load();
	}

	// ═══════════════ CỔNG 1 — TƯ LIỆU ═══════════════

	async function runResearch() {
		busy = 'research';
		const res = await buildResearch(chapter, {
			query: extraQuery.trim() || undefined,
			max_blocks: maxBlocks,
			budget_tokens: budgetTokens,
			pinned_chunk_ids: [...pinned],
			vetoed_chunk_ids: [...vetoed]
		});
		busy = '';
		if (!res.success) {
			toast_error(res.message || 'Không dựng được Research Pack');
			return;
		}
		toast_success(`Đã dựng tư liệu — ${res.data.research_pack.blocks.length} đoạn`);
		await load();
	}

	async function gateResearch() {
		if (!workflow) return;
		busy = 'approve-research';
		const res = await approveResearch(chapter, workflow.revision);
		busy = '';
		if (!res.success) {
			toast_error(res.message || 'Không duyệt được tư liệu');
			return;
		}
		toast_success('Tư liệu đã duyệt — giờ dựng dàn ý trong Kiến Trúc Sư Cốt Truyện');
		await load();
	}

	function togglePin(chunkId: number) {
		pinned.has(chunkId) ? pinned.delete(chunkId) : pinned.add(chunkId);
		vetoed.delete(chunkId);
		pinned = new Set(pinned);
		vetoed = new Set(vetoed);
	}

	function toggleVeto(chunkId: number) {
		vetoed.has(chunkId) ? vetoed.delete(chunkId) : vetoed.add(chunkId);
		pinned.delete(chunkId);
		pinned = new Set(pinned);
		vetoed = new Set(vetoed);
	}

	function toggleExpand(chunkId: number) {
		expandedBlocks.has(chunkId) ? expandedBlocks.delete(chunkId) : expandedBlocks.add(chunkId);
		expandedBlocks = new Set(expandedBlocks);
	}

	// ═══════════════ CỔNG 2 — DÀN Ý ═══════════════

	async function saveBlueprint() {
		if (!workflow) return;
		const envelope = parseStored<unknown>(blueprintText);
		if (!envelope) {
			toast_error('Dán JSON Blueprint hợp lệ (xuất từ Kiến Trúc Sư Cốt Truyện).');
			return;
		}
		busy = 'blueprint';
		const res = await importBlueprint(chapter, workflow.revision, envelope);
		busy = '';
		if (!res.success) {
			toast_error(res.message || 'Blueprint bị từ chối');
			return;
		}
		toast_success('Đã nhận dàn ý');
		blueprintText = '';
		await load();
	}

	async function gateBlueprint() {
		if (!workflow) return;
		busy = 'approve-blueprint';
		const res = await approveBlueprint(chapter, workflow.revision);
		busy = '';
		if (!res.success) {
			toast_error(res.message || 'Không duyệt được dàn ý');
			return;
		}
		toast_success('Dàn ý đã duyệt — tải gói viết rồi chạy Người Viết Chương');
		await load();
	}

	// ═══════════════ CỔNG 3 — BẢN THẢO VÀ CANON ═══════════════

	async function saveDraft() {
		if (!workflow) return;
		const envelope = parseStored<Record<string, any>>(draftText);
		if (!envelope) {
			toast_error('Dán JSON bản thảo hợp lệ (xuất từ Người Viết Chương).');
			return;
		}
		busy = 'draft';
		const res = await importDraft(chapter, workflow.revision, envelope);
		busy = '';
		if (!res.success) {
			toast_error(res.message || 'Bản thảo bị từ chối');
			return;
		}
		toast_success('Đã nhận bản thảo');
		draftText = '';
		await load();
	}

	async function gateCanon() {
		if (!workflow) return;
		if (!canonText.trim()) {
			toast_error('Văn bản canon không được rỗng.');
			return;
		}
		busy = 'canon';
		const res = await acceptCanon(chapter, workflow.revision, canonText);
		busy = '';
		if (!res.success) {
			toast_error(res.message || 'Không nhận được canon');
			return;
		}
		if (res.data.index_error) {
			toast_error(`Đã nhận canon nhưng lập chỉ mục lỗi: ${res.data.index_error}`);
		} else {
			const indexed = res.data.indexed;
			toast_success(
				`Đã nhập canon — ${indexed?.chunks ?? 0} đoạn vào kho truy xuất${indexed?.replaced ? ' (thay bản cũ)' : ''}`
			);
		}
		await load();
	}

	// ═══════════════ PHÓNG CHIẾU ═══════════════

	async function saveDelta() {
		if (!selectedRun) {
			toast_error('Chưa có projection run nào để áp.');
			return;
		}
		const envelope = parseStored<unknown>(deltaText);
		if (!envelope) {
			toast_error('Dán JSON ChapterCommitDeltaV1 hợp lệ (xuất từ hành động Phân tích canon).');
			return;
		}
		busy = 'delta';
		const res = await applyDelta(selectedRun, envelope);
		busy = '';
		if (!res.success) {
			toast_error(res.message || 'Delta bị từ chối');
			return;
		}
		const report = res.data;
		toast_success(
			`Đã áp: ${report.applied} phóng chiếu, ${report.conflicts} mâu thuẫn, ${report.superseded} bản cũ bị thay`
		);
		deltaText = '';
		await loadProjections();
	}

	async function runRebuild() {
		busy = 'rebuild';
		const res = await rebuildProjections();
		busy = '';
		if (!res.success) {
			toast_error(res.message || 'Không dựng lại được bản đồ');
			return;
		}
		const report = res.data;
		toast_success(
			`Bản đồ: ${report.active} đang hoạt động · ${report.stale_commit} thuộc bản chương cũ · ${report.superseded} bị chương sau thay`
		);
		await loadProjections();
	}

	// ═══════════════ GỬI SANG CMS ═══════════════

	async function pushToCms() {
		busy = 'cms';
		const res = await pushCmsDraft(chapter, confirmUnpublish);
		busy = '';
		if (!res.success) {
			toast_error(res.message || 'Không gửi được sang CMS');
			return;
		}
		const labels = {
			create: 'Đã tạo bản nháp CMS',
			update: 'Đã cập nhật bản nháp CMS',
			unchanged: 'Bản nháp CMS đã khớp canon — không ghi gì'
		};
		toast_success(`${labels[res.data.action]} (chương #${res.data.chapter_id})`);
		await loadCmsPreview();
	}

	/**
	 * Xuất bản là hành động riêng (CW-520) và chỉ deploy có quyền.
	 *
	 * Máy soạn thảo chỉ tạo bản nháp; đưa chương ra trước người đọc là một
	 * cú bấm khác, trên trang quản trị của website đang chạy.
	 */
	async function setPublished(publish: boolean) {
		busy = publish ? 'publish' : 'unpublish';
		const res = await (publish ? publishChapter(chapter) : unpublishChapter(chapter));
		busy = '';
		if (!res.success) {
			toast_error(res.message || 'Không đổi được trạng thái xuất bản');
			return;
		}
		const labels = {
			published: 'Đã xuất bản — chương đang hiển thị trên website',
			unpublished: 'Đã gỡ khỏi website — chương trở về bản nháp',
			unchanged: 'Trạng thái đã đúng — không đổi gì'
		};
		toast_success(labels[res.data.action]);
		await loadCmsPreview();
	}

	// ═══════════════ XUẤT GÓI CHO ARTIFACT ═══════════════

	function download(content: string, name: string) {
		const blob = new Blob([content], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = Object.assign(document.createElement('a'), { href: url, download: name });
		document.body.appendChild(anchor);
		anchor.click();
		setTimeout(() => {
			URL.revokeObjectURL(url);
			anchor.remove();
		}, 200);
	}

	function exportResearch() {
		if (!researchPack) return;
		download(JSON.stringify(researchPack, null, 2), `research-pack-ch${chapter}.json`);
	}

	async function exportWriterPack() {
		busy = 'writer-pack';
		const res = await getWriterPack(chapter);
		busy = '';
		if (!res.success) {
			toast_error(res.message || 'Chưa dựng được gói viết');
			return;
		}
		download(JSON.stringify(res.data.writer_pack, null, 2), `writer-pack-ch${chapter}.json`);
		toast_success('Đã tải gói viết — nạp vào Người Viết Chương');
	}

	async function readFile(event: Event, apply: (text: string) => void) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		apply(await file.text());
		input.value = '';
	}
</script>

<svelte:head><title>Cổng Duyệt Chương — Selorson</title></svelte:head>

<div class="gates">
	<header class="page-head">
		<div>
			<h2>🚦 Cổng Duyệt Chương</h2>
			<p class="text-muted">
				Tư liệu, dàn ý và bản thảo đều là đề xuất cho tới khi bạn duyệt. Chỉ chương đã nhập canon
				mới đi vào kho truy xuất.
			</p>
		</div>
		<div class="chapter-pick">
			<label for="chapter">Chương</label>
			<input id="chapter" type="number" min="1" bind:value={chapter} class="input-sm" />
			<button class="btn" onclick={load} disabled={loading}>{loading ? '⏳' : 'Mở'}</button>
		</div>
	</header>

	{#if capabilities && !writable}
		<div class="banner warn">
			Máy này chạy ở chế độ <strong>{capabilities.target}</strong> nên không sửa được canon. Hãy
			thao tác trên máy Local rồi đồng bộ.
		</div>
	{/if}

	<!-- Thanh giai đoạn -->
	<ol class="stepper">
		{#each STAGE_ORDER as step}
			{@const reached = stageIndex(stage ?? undefined) >= stageIndex(step)}
			<li class:done={reached} class:current={stage === step}>
				<span class="dot"></span>
				{STAGE_LABEL[step]}
			</li>
		{/each}
	</ol>

	<!-- ═══════════ BƯỚC 0 — Ý ĐỒ CHƯƠNG ═══════════ -->
	<section class="card">
		<h3 class="card-title">① Ý đồ chương</h3>
		<p class="text-muted">
			Đây là câu hỏi mà cả truy xuất lẫn dàn ý sẽ trả lời. Viết lại ý đồ sẽ xoá tư liệu, dàn ý và
			bản thảo dựng từ ý đồ cũ.
		</p>
		<div class="form-row">
			<label for="premise">Tiền đề</label>
			<textarea id="premise" rows="2" bind:value={premise} placeholder="Chương này làm gì cho câu chuyện?"></textarea>
		</div>
		<div class="form-grid-2">
			<div class="form-row">
				<label for="goals">Mục tiêu (mỗi dòng một mục)</label>
				<textarea id="goals" rows="3" bind:value={goals}></textarea>
			</div>
			<div class="form-row">
				<label for="must-include">Bắt buộc có</label>
				<textarea id="must-include" rows="3" bind:value={mustInclude}></textarea>
			</div>
		</div>
		<div class="form-grid-2">
			<div class="form-row">
				<label for="must-avoid">Bắt buộc tránh</label>
				<textarea id="must-avoid" rows="3" bind:value={mustAvoid}></textarea>
			</div>
			<div class="form-row">
				<label for="voice">Ghi chú giọng văn</label>
				<textarea id="voice" rows="3" bind:value={voiceNotes} placeholder="Đi thẳng vào gói viết của Người Viết Chương."></textarea>
			</div>
		</div>
		<div class="contract-row">
			<div class="form-row"><label for="pov">Ngôi kể</label><input id="pov" bind:value={pov} /></div>
			<div class="form-row"><label for="tense">Thì</label><input id="tense" bind:value={tense} /></div>
			<div class="form-row"><label for="lang">Ngôn ngữ</label><input id="lang" bind:value={language} /></div>
			<div class="form-row">
				<label for="words">Mục tiêu từ</label>
				<input id="words" type="number" min="0" bind:value={targetWords} />
			</div>
		</div>
		<div class="btn-row">
			<button class="btn btn-primary" onclick={() => saveIntent(false)} disabled={!writable || busy === 'intent'}>
				{workflow ? 'Lưu (nếu chưa có)' : 'Mở workflow chương'}
			</button>
			{#if workflow}
				<button class="btn btn-danger" onclick={() => saveIntent(true)} disabled={!writable || busy === 'intent'}>
					Viết lại ý đồ — xoá tư liệu, dàn ý, bản thảo
				</button>
				<span class="text-muted">revision {workflow.revision}</span>
			{/if}
		</div>
	</section>

	{#if workflow}
		<!-- ═══════════ CỔNG 1 — TƯ LIỆU ═══════════ -->
		<section class="card">
			<h3 class="card-title">② Cổng tư liệu</h3>
			<p class="text-muted">
				Truy xuất chạy không cần API key. Ghim đoạn để nó luôn có mặt ở lần dựng sau; phủ quyết để
				nó biến mất kèm lý do trong dấu vết.
			</p>
			<div class="contract-row">
				<div class="form-row">
					<label for="query">Câu hỏi thêm</label>
					<input id="query" bind:value={extraQuery} placeholder="nối vào truy vấn dựng từ ý đồ" />
				</div>
				<div class="form-row">
					<label for="max-blocks">Số đoạn tối đa</label>
					<input id="max-blocks" type="number" min="1" max="64" bind:value={maxBlocks} />
				</div>
				<div class="form-row">
					<label for="budget">Ngân sách token</label>
					<input id="budget" type="number" min="500" step="500" bind:value={budgetTokens} />
				</div>
			</div>
			<div class="btn-row">
				<button class="btn btn-primary" onclick={runResearch} disabled={!writable || busy === 'research'}>
					{busy === 'research' ? '⏳ Đang dựng...' : researchPack ? 'Dựng lại tư liệu' : 'Dựng tư liệu'}
				</button>
				{#if researchPack}
					<button class="btn" onclick={exportResearch}>⬇ Tải Research Pack</button>
					<button
						class="btn btn-accent"
						onclick={gateResearch}
						disabled={!writable || stage !== 'research_ready' || busy === 'approve-research'}
					>
						✔ Duyệt tư liệu
					</button>
				{/if}
			</div>

			{#if researchPack}
				<div class="trace">
					<span>{blocks.length} đoạn</span>
					<span>từ khoá: {researchPack.trace.terms.slice(0, 8).join(', ') || '—'}</span>
					{#each Object.entries(researchPack.trace.channel_counts ?? {}) as [channel, count]}
						<span>{channel}: {count}</span>
					{/each}
					<span>{researchPack.trace.dropped?.length ?? 0} bị loại</span>
				</div>
				{#each researchPack.warnings ?? [] as warning}
					<div class="banner warn">{warning}</div>
				{/each}

				<div class="blocks">
					{#each blocks as block (block.chunk_id)}
						<article class="block" class:pinned={pinned.has(block.chunk_id)} class:vetoed={vetoed.has(block.chunk_id)}>
							<header>
								<code>#{block.chunk_id}</code>
								<strong>{block.source_file}</strong>
								{#if block.heading}<span class="text-muted">› {block.heading}</span>{/if}
								<span class="spacer"></span>
								<span class="text-muted">{block.channels.join(', ')}</span>
								<button class="btn btn-sm" onclick={() => togglePin(block.chunk_id)}>
									{pinned.has(block.chunk_id) ? '📌 Bỏ ghim' : '📌 Ghim'}
								</button>
								<button class="btn btn-sm btn-danger" onclick={() => toggleVeto(block.chunk_id)}>
									{vetoed.has(block.chunk_id) ? '↩ Bỏ phủ quyết' : '✕ Phủ quyết'}
								</button>
							</header>
							<p class="reason">{block.reason}</p>
							<p class="body">
								{expandedBlocks.has(block.chunk_id) || block.text.length <= 260
									? block.text
									: block.text.slice(0, 260) + '…'}
							</p>
							{#if block.text.length > 260}
								<button class="link" onclick={() => toggleExpand(block.chunk_id)}>
									{expandedBlocks.has(block.chunk_id) ? '▲ Thu gọn' : '▼ Xem đầy đủ'}
								</button>
							{/if}
						</article>
					{:else}
						<div class="empty-state">Chưa có đoạn nào. Quét nguồn tư liệu rồi dựng lại.</div>
					{/each}
				</div>
				{#if pinned.size || vetoed.size}
					<p class="text-muted">
						Đã đánh dấu {pinned.size} ghim và {vetoed.size} phủ quyết — bấm <strong>Dựng lại tư liệu</strong> để áp dụng.
					</p>
				{/if}
			{/if}
		</section>

		<!-- ═══════════ CỔNG 2 — DÀN Ý ═══════════ -->
		<section class="card" class:locked={stageIndex(stage ?? undefined) < stageIndex('research_approved')}>
			<h3 class="card-title">③ Cổng dàn ý</h3>
			{#if stageIndex(stage ?? undefined) < stageIndex('research_approved')}
				<p class="text-muted">Duyệt tư liệu trước đã.</p>
			{:else}
				<p class="text-muted">
					Chạy Kiến Trúc Sư Cốt Truyện với Research Pack ở trên, rồi dán JSON Blueprint nó xuất ra.
				</p>
				<div class="form-row">
					<label for="bp">Blueprint JSON</label>
					<textarea id="bp" rows="4" bind:value={blueprintText} placeholder="Dán ChapterBlueprintV1 vào đây"></textarea>
				</div>
				<div class="btn-row">
					<input type="file" accept=".json" id="bp-file" hidden onchange={(e) => readFile(e, (text) => (blueprintText = text))} />
					<button class="btn" onclick={() => document.getElementById('bp-file')?.click()}>📂 Chọn file</button>
					<button class="btn btn-primary" onclick={saveBlueprint} disabled={!writable || busy === 'blueprint'}>
						Nhận dàn ý
					</button>
					{#if blueprint}
						<button
							class="btn btn-accent"
							onclick={gateBlueprint}
							disabled={!writable || stage !== 'blueprint_ready' || busy === 'approve-blueprint'}
						>
							✔ Duyệt dàn ý
						</button>
					{/if}
				</div>

				{#if blueprint}
					<div class="trace">
						<strong>{blueprint.title ?? '—'}</strong>
						<span>{blueprint.scenes?.length ?? 0} cảnh</span>
						<span>{blueprint.target_words ?? '?'} từ mục tiêu</span>
						{#if blueprint.continuity?.contradictions?.length}
							<span class="danger">{blueprint.continuity.contradictions.length} mâu thuẫn</span>
						{/if}
					</div>
					<ol class="scenes">
						{#each blueprint.scenes ?? [] as scene}
							<li>
								<strong>{scene.purpose || scene.id}</strong>
								<span class="text-muted"> · {scene.target_words ?? 0} từ</span>
								<ul>
									{#each scene.beats ?? [] as beat}<li>{beat}</li>{/each}
								</ul>
							</li>
						{/each}
					</ol>
				{/if}
			{/if}
		</section>

		<!-- ═══════════ CỔNG 3 — BẢN THẢO VÀ CANON ═══════════ -->
		<section class="card" class:locked={stageIndex(stage ?? undefined) < stageIndex('blueprint_approved')}>
			<h3 class="card-title">④ Cổng canon</h3>
			{#if stageIndex(stage ?? undefined) < stageIndex('blueprint_approved')}
				<p class="text-muted">Duyệt dàn ý trước đã.</p>
			{:else}
				<div class="btn-row">
					<button class="btn" onclick={exportWriterPack} disabled={busy === 'writer-pack'}>
						⬇ Tải gói viết (WriterPackV1)
					</button>
					<span class="text-muted">Nạp gói này vào Người Viết Chương.</span>
				</div>
				<div class="form-row">
					<label for="draft">Bản thảo JSON</label>
					<textarea id="draft" rows="4" bind:value={draftText} placeholder="Dán ChapterDraftEnvelopeV1 vào đây"></textarea>
				</div>
				<div class="btn-row">
					<input type="file" accept=".json" id="draft-file" hidden onchange={(e) => readFile(e, (text) => (draftText = text))} />
					<button class="btn" onclick={() => document.getElementById('draft-file')?.click()}>📂 Chọn file</button>
					<button class="btn btn-primary" onclick={saveDraft} disabled={!writable || busy === 'draft'}>
						Nhận bản thảo
					</button>
				</div>

				{#if draft}
					<div class="trace">
						<span>{draft.word_count ?? 0} từ</span>
						<span>tự kiểm: {draft.self_check?.status ?? 'not_run'}</span>
						{#if draft.truncated}<span class="danger">chưa viết xong</span>{/if}
						{#each draft.self_check?.checks ?? [] as check}
							<span class:danger={check.status === 'fail'}>{check.label}: {check.status}</span>
						{/each}
					</div>
					<div class="form-row">
						<label for="canon">Văn bản sẽ nhập canon — sửa tay thoải mái</label>
						<textarea id="canon" rows="14" class="canon-editor" bind:value={canonText}></textarea>
					</div>
					<div class="btn-row">
						<button
							class="btn btn-accent"
							onclick={gateCanon}
							disabled={!writable || stage !== 'draft_ready' || busy === 'canon'}
						>
							{busy === 'canon' ? '⏳ Đang nhận...' : '✔ Nhận vào canon và lập chỉ mục'}
						</button>
						<span class="text-muted">Đây là cửa duy nhất vào kho truy xuất.</span>
					</div>
				{/if}

				{#if canonCommits.length}
					<h4>Lịch sử canon</h4>
					<ul class="commits">
						{#each canonCommits as commit}
							<li>
								<code>rev {commit.revision}</code>
								<span class="text-muted">{commit.accepted_at}</span>
								<span class="text-muted">{commit.content.length.toLocaleString()} ký tự</span>
								<code class="hash">{commit.content_hash.slice(0, 12)}</code>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</section>

		<!-- ═══════════ PHÓNG CHIẾU ═══════════ -->
		{#if runs.length}
			<section class="card">
				<h3 class="card-title">⑤ Bản đồ truyện</h3>
				<p class="text-muted">
					Nhận canon xếp hàng một run cho mỗi chương từ chương đó trở đi. Chạy hành động
					<strong>Phân tích canon</strong> trong Kiến Trúc Sư Cốt Truyện rồi dán delta nó xuất ra.
				</p>

				<ul class="runs">
					{#each runs as run}
						<li class:active={selectedRun === run.id}>
							<input type="radio" name="run" value={run.id} bind:group={selectedRun} disabled={run.status === 'stale'} />
							<code>ch {run.source_chapter_number}</code>
							<span class="status status-{run.status}">{run.status}</span>
							<span class="text-muted">{run.extractor_version}</span>
							{#if run.error}<span class="danger">{run.error}</span>{/if}
						</li>
					{/each}
				</ul>

				<div class="form-row">
					<label for="delta">Commit delta JSON</label>
					<textarea id="delta" rows="4" bind:value={deltaText} placeholder="Dán ChapterCommitDeltaV1 vào đây"></textarea>
				</div>
				<div class="btn-row">
					<input type="file" accept=".json" id="delta-file" hidden onchange={(e) => readFile(e, (text) => (deltaText = text))} />
					<button class="btn" onclick={() => document.getElementById('delta-file')?.click()}>📂 Chọn file</button>
					<button class="btn btn-primary" onclick={saveDelta} disabled={!writable || busy === 'delta'}>
						{busy === 'delta' ? '⏳ Đang áp...' : 'Áp delta'}
					</button>
					<button class="btn" onclick={runRebuild} disabled={!writable || busy === 'rebuild'}>
						{busy === 'rebuild' ? '⏳ Đang dựng...' : '↻ Dựng lại bản đồ'}
					</button>
					<span class="text-muted">Bấm sau khi sửa một chương đã nhập canon.</span>
				</div>

				{#if projections.length}
					<div class="trace">
						<span>{projections.length} phóng chiếu đang hoạt động</span>
						{#each [...new Set(projections.map((p) => p.projection_type))] as type}
							<span>{type}: {projections.filter((p) => p.projection_type === type).length}</span>
						{/each}
					</div>
					<ul class="projections">
						{#each projections as projection}
							<li class:conflict={projection.apply_status === 'conflict'}>
								<code>ch {projection.source_chapter_number}</code>
								<span class="ptype">{projection.projection_type}</span>
								<strong>{projection.subject_key}</strong>
								<span class="text-muted">{projection.confidence.toFixed(2)}</span>
								{#if projection.apply_status !== 'applied'}
									<span class="danger">{projection.apply_status}</span>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<!-- ═══════════ GỬI SANG CMS (CW-510) ═══════════ -->
		{#if cmsPreview}
			<section class="card">
				<h3 class="card-title">⑥ Gửi sang CMS</h3>
				<p class="text-muted">
					Đẩy bản canon hiện hành vào bảng chương của website, luôn dưới dạng
					<strong>bản nháp</strong>. Xuất bản là hành động riêng — nhận canon không bao giờ tự
					đưa chương lên website.
				</p>

				<div class="trace">
					<span>
						{cmsPreview.action === 'create'
							? 'sẽ tạo hàng CMS mới'
							: cmsPreview.action === 'update'
								? 'sẽ cập nhật hàng CMS'
								: 'đã khớp — không ghi gì'}
					</span>
					<span>canon rev {cmsPreview.target.revision}</span>
					<code class="hash">{cmsPreview.target.content_hash.slice(0, 12)}</code>
					{#if cmsPreview.existing}
						<span>CMS #{cmsPreview.existing.id}</span>
						<span class:danger={cmsPreview.existing.status === 'published'}>
							{cmsPreview.existing.status}
						</span>
					{:else}
						<span class="text-muted">chưa có trong CMS</span>
					{/if}
					{#if cmsPreview.in_sync}<span>khớp canon</span>{/if}
				</div>

				<dl class="cms-fields">
					<dt>Tiêu đề</dt>
					<dd>{cmsPreview.target.title}</dd>
					<dt>Sẽ ghi</dt>
					<dd>
						{#if cmsPreview.changed_fields.length}
							{#each cmsPreview.changed_fields as field}<code>{field}</code>{/each}
						{:else}
							<span class="text-muted">không cột nào</span>
						{/if}
					</dd>
				</dl>

				{#each cmsPreview.warnings as warning}
					<div class="banner warn">{warning}</div>
				{/each}

				{#if cmsPreview.diff}
					<h4>
						Khác biệt nội dung — {cmsPreview.diff.removed_lines} dòng bỏ,
						{cmsPreview.diff.added_lines} dòng thêm
						<span class="text-muted">
							(giữ nguyên {cmsPreview.diff.unchanged_prefix_lines} dòng đầu,
							{cmsPreview.diff.unchanged_suffix_lines} dòng cuối)
						</span>
					</h4>
					<div class="diff">
						{#each cmsPreview.diff.removed as line}
							<div class="diff-line removed">− {line}</div>
						{/each}
						{#each cmsPreview.diff.added as line}
							<div class="diff-line added">+ {line}</div>
						{/each}
						{#if cmsPreview.diff.truncated}
							<div class="diff-line text-muted">… đã cắt bớt để xem trước</div>
						{/if}
					</div>
				{/if}

				{#if cmsPreview.would_unpublish}
					<label class="confirm">
						<input type="checkbox" bind:checked={confirmUnpublish} />
						Tôi biết chương này đang xuất bản và đồng ý đưa nó về bản nháp.
					</label>
				{/if}

				<div class="btn-row">
					<button
						class="btn btn-primary"
						onclick={pushToCms}
						disabled={!canPushCms ||
							busy === 'cms' ||
							(cmsPreview.would_unpublish && !confirmUnpublish)}
					>
						{busy === 'cms' ? '⏳ Đang gửi...' : '→ Gửi bản nháp sang CMS'}
					</button>
					<button class="btn" onclick={loadCmsPreview}>↻ Xem lại</button>
					{#if !canPushCms}
						<span class="text-muted">Máy này không có quyền <code>cms_draft_push</code>.</span>
					{/if}
				</div>

				{#if cmsPreview.existing}
					<h4>Xuất bản</h4>
					<p class="text-muted">
						Hành động riêng, không đọc canon. Nhận canon và gửi bản nháp đều không đưa chương ra
						trước người đọc — chỉ nút này làm việc đó.
					</p>
					<div class="btn-row">
						<button
							class="btn btn-accent"
							onclick={() => setPublished(true)}
							disabled={!canPublish ||
								busy === 'publish' ||
								cmsPreview.existing.status === 'published'}
						>
							{busy === 'publish' ? '⏳ Đang xuất bản...' : '🌐 Xuất bản lên website'}
						</button>
						<button
							class="btn"
							onclick={() => setPublished(false)}
							disabled={!canPublish ||
								busy === 'unpublish' ||
								cmsPreview.existing.status !== 'published'}
						>
							{busy === 'unpublish' ? '⏳ Đang gỡ...' : 'Gỡ khỏi website'}
						</button>
						{#if !canPublish}
							<span class="text-muted">
								Máy này không có quyền <code>cms_publish</code>. Xuất bản từ trang quản trị của
								website đang chạy.
							</span>
						{/if}
					</div>
				{/if}
			</section>
		{/if}
	{:else if !loading}
		<div class="empty-state">
			<div class="empty-icon">🚦</div>
			<p>Chương {chapter} chưa có workflow. Điền ý đồ chương ở trên rồi bấm <strong>Mở workflow chương</strong>.</p>
		</div>
	{/if}
</div>

<style>
	.gates { display: flex; flex-direction: column; gap: 1rem; padding-bottom: 3rem; }

	.page-head {
		display: flex; justify-content: space-between; align-items: flex-start;
		gap: 1rem; flex-wrap: wrap;
	}
	.page-head h2 { margin: 0 0 0.25rem; font-size: 1.25rem; }
	.chapter-pick { display: flex; align-items: center; gap: 0.5rem; }
	.chapter-pick label { font-size: 0.8125rem; font-weight: 600; color: var(--color-text-muted); }

	.card {
		background: var(--color-surface-100); border: 1px solid var(--color-surface-300);
		border-radius: var(--radius-md); padding: 1.25rem;
		display: flex; flex-direction: column; gap: 0.75rem;
	}
	.card.locked { opacity: 0.6; }
	.card-title { margin: 0; font-size: 1rem; font-weight: 700; }

	.stepper { display: flex; flex-wrap: wrap; gap: 0.75rem; list-style: none; margin: 0; padding: 0; }
	.stepper li {
		display: flex; align-items: center; gap: 0.375rem;
		font-size: 0.75rem; color: var(--color-text-muted);
	}
	.stepper .dot {
		width: 9px; height: 9px; border-radius: 50%;
		background: var(--color-surface-300);
	}
	.stepper li.done { color: var(--color-text-primary); }
	.stepper li.done .dot { background: var(--color-brand-500); }
	.stepper li.current { font-weight: 700; }

	.form-row { display: flex; flex-direction: column; gap: 0.25rem; }
	.form-row label { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); }
	.form-row input, .form-row textarea {
		width: 100%; padding: 0.5rem 0.625rem; font-size: 0.875rem; font-family: inherit;
		background: var(--color-surface-200); color: var(--color-text-primary);
		border: 1px solid var(--color-surface-300); border-radius: var(--radius-md);
		box-sizing: border-box; resize: vertical;
	}
	.form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
	.contract-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; }
	.input-sm { max-width: 90px; padding: 0.375rem 0.5rem; background: var(--color-surface-200);
		color: var(--color-text-primary); border: 1px solid var(--color-surface-300);
		border-radius: var(--radius-md); }
	.canon-editor { font-size: 0.9375rem; line-height: 1.8; min-height: 280px; }

	.btn {
		padding: 0.5rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--color-surface-300);
		background: var(--color-surface-200); color: var(--color-text-primary);
		font-size: 0.8125rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
	}
	.btn:hover { background: var(--color-surface-300); }
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn-primary { background: var(--color-brand-500); color: #fff; border-color: var(--color-brand-500); }
	.btn-accent { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; border: none; }
	.btn-danger { background: #ef4444; color: #fff; border-color: #ef4444; }
	.btn-sm { padding: 0.25rem 0.5rem; font-size: 0.6875rem; }
	.btn-row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
	.link {
		background: none; border: none; padding: 0; cursor: pointer;
		color: var(--color-brand-500); font-size: 0.75rem; font-weight: 600;
	}

	.banner {
		padding: 0.625rem 0.875rem; border-radius: var(--radius-md); font-size: 0.8125rem;
	}
	.banner.warn { background: rgba(234, 179, 8, 0.12); border: 1px solid rgba(234, 179, 8, 0.35); }

	.trace {
		display: flex; flex-wrap: wrap; gap: 0.75rem; font-size: 0.75rem;
		color: var(--color-text-muted); padding: 0.5rem 0;
		border-top: 1px solid var(--color-surface-300);
	}
	.danger { color: #ef4444; font-weight: 700; }

	.blocks { display: flex; flex-direction: column; gap: 0.625rem; }
	.block {
		border: 1px solid var(--color-surface-300); border-left: 3px solid var(--color-surface-300);
		border-radius: var(--radius-md); padding: 0.75rem; background: var(--color-surface-200);
	}
	.block.pinned { border-left-color: var(--color-brand-500); }
	.block.vetoed { border-left-color: #ef4444; opacity: 0.55; }
	.block header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; font-size: 0.75rem; }
	.block .spacer { flex: 1; }
	.block .reason { margin: 0.375rem 0 0.25rem; font-size: 0.75rem; color: var(--color-text-muted); font-style: italic; }
	.block .body { margin: 0; font-size: 0.8125rem; line-height: 1.65; white-space: pre-wrap; }

	.scenes { font-size: 0.8125rem; line-height: 1.6; padding-left: 1.25rem; margin: 0; }
	.scenes ul { margin: 0.25rem 0 0.5rem; color: var(--color-text-muted); }

	.runs, .projections {
		list-style: none; padding: 0; margin: 0;
		display: flex; flex-direction: column; gap: 0.25rem;
	}
	.runs li, .projections li {
		display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;
		font-size: 0.75rem; padding: 0.375rem 0.5rem; border-radius: var(--radius-md);
	}
	.runs li.active { background: var(--color-surface-200); }
	.projections li.conflict { background: rgba(239, 68, 68, 0.1); }
	.status { font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
	.status-succeeded { color: #22c55e; }
	.status-failed { color: #ef4444; }
	.status-stale { color: var(--color-text-muted); text-decoration: line-through; }
	.ptype {
		background: var(--color-surface-300); border-radius: 999px;
		padding: 0.0625rem 0.5rem; font-size: 0.6875rem;
	}

	.commits { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.375rem; }
	.commits li { display: flex; gap: 0.625rem; align-items: center; font-size: 0.75rem; flex-wrap: wrap; }
	.hash { color: var(--color-text-muted); }

	.cms-fields {
		display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.75rem;
		margin: 0; font-size: 0.8125rem;
	}
	.cms-fields dt { font-weight: 600; color: var(--color-text-muted); }
	.cms-fields dd { margin: 0; display: flex; gap: 0.375rem; flex-wrap: wrap; }

	.diff {
		border: 1px solid var(--color-surface-300); border-radius: var(--radius-md);
		background: var(--color-surface-200); padding: 0.5rem;
		max-height: 22rem; overflow: auto;
	}
	.diff-line {
		font-family: var(--font-mono, monospace); font-size: 0.75rem; line-height: 1.6;
		white-space: pre-wrap; padding: 0 0.25rem; border-radius: 2px;
	}
	.diff-line.removed { background: rgba(239, 68, 68, 0.12); }
	.diff-line.added { background: rgba(34, 197, 94, 0.12); }

	.confirm {
		display: flex; align-items: center; gap: 0.5rem;
		font-size: 0.8125rem; font-weight: 600;
	}

	.empty-state { text-align: center; padding: 2.5rem 1rem; color: var(--color-text-muted); }
	.empty-icon { font-size: 2.5rem; margin-bottom: 0.75rem; opacity: 0.5; }
	.text-muted { color: var(--color-text-muted); font-size: 0.8125rem; }

	@media (max-width: 720px) {
		.form-grid-2 { grid-template-columns: 1fr; }
	}
</style>
