<script lang="ts">
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import {
		adminGet,
		adminPost,
		adminPut,
		adminDelete,
		adminUpload,
		toast_success,
		toast_error,
	} from "$lib/stores/admin.svelte";
	import { onMount } from "svelte";
	import AdminChapterEditor from "$lib/components/admin/AdminChapterEditor.svelte";
	import StoryContent from "$lib/components/story/StoryContent.svelte";

	let chapterId = $derived(page.params.id || "new");
	let isEdit = $derived(chapterId !== "new");

	let loading = $state(true);
	let chapterData = $state<any>(null);

	// ── Language Tab & English Translation Editor State ──
	let activeLangTab = $state<"vi" | "en">("vi");
	let enTitle = $state("");
	let enMarkdown = $state("");
	let enAuthorNote = $state("");
	let enStatus = $state<"draft" | "published">("draft");
	let enViewMode = $state<"edit" | "preview" | "split">("split");
	let savingEn = $state(false);
	let deletingEn = $state(false);
	let hasSavedEn = $state(false);
	let enSavedBlocks = $state<any[] | null>(null);
	let enDirtyMarkdown = $state(false);

	function decodeHtmlEntities(str: string): string {
		return str
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&#x27;/gi, "'")
			.replace(/&amp;/g, "&");
	}

	function blocksToEditableMarkdown(blocks: unknown, fallbackPlain?: string | null): string {
		if (Array.isArray(blocks) && blocks.length > 0) {
			const lines: string[] = [];
			for (const b of blocks) {
				if (!b || typeof b !== "object") continue;
				const rec = b as Record<string, unknown>;
				if (rec.type !== "paragraph") continue;
				let html = String(rec.content ?? "").trim();
				if (!html) continue;
				// Convert simple inline HTML back to clean Markdown for editing
				if (/^<(?:b|strong)>([^<]+)<\/(?:b|strong)>$/i.test(html)) {
					const m = html.match(/^<(?:b|strong)>([^<]+)<\/(?:b|strong)>$/i);
					if (m) {
						lines.push(`### ${decodeHtmlEntities(m[1].trim())}`);
						continue;
					}
				}
				html = html
					.replace(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/gi, "**$1**")
					.replace(/<(?:i|em)>([\s\S]*?)<\/(?:i|em)>/gi, "*$1*")
					.replace(/<br\s*\/?>/gi, "\n")
					.replace(/<[^>]+>/g, "");
				lines.push(decodeHtmlEntities(html).trim());
			}
			if (lines.length > 0) return lines.join("\n\n");
		}
		return (fallbackPlain ?? "").trim();
	}

	function hydrateEnFromData(data: any) {
		const en = data?.translations?.en;
		if (en) {
			hasSavedEn = true;
			enTitle = en.title || "";
			enStatus = en.status === "published" ? "published" : "draft";
			enAuthorNote = en.author_note || "";
			enSavedBlocks = Array.isArray(en.content_blocks) ? en.content_blocks : null;
			enMarkdown = blocksToEditableMarkdown(en.content_blocks, en.content);
			enDirtyMarkdown = false;
		} else {
			hasSavedEn = false;
			enTitle = "";
			enStatus = "draft";
			enAuthorNote = "";
			enSavedBlocks = null;
			enMarkdown = "";
			enDirtyMarkdown = false;
		}
	}

	let previewEnBlocks = $derived.by(() => {
		if (!enDirtyMarkdown && enSavedBlocks && enSavedBlocks.length > 0) {
			return enSavedBlocks;
		}
		const normalized = enMarkdown.replace(/\r\n/g, "\n");
		const expandedLines: string[] = [];
		for (const line of normalized.split("\n")) {
			const t = line.trim();
			if (
				t.startsWith("#") ||
				/^(?:\*\s*\*\s*\*+|-\s*-\s*-+|_\s*_\s*_+)$/.test(t) ||
				t.startsWith("- **") ||
				t.startsWith("• **")
			) {
				expandedLines.push("", t, "");
			} else {
				expandedLines.push(line);
			}
		}
		const paras = expandedLines
			.join("\n")
			.split(/\n{2,}/)
			.map((p) => p.trim())
			.filter(Boolean)
			.filter(
				(p) =>
					!/^#\s+/.test(p) &&
					!/^(?:\*\s*\*\s*\*+|-\s*-\s*-+|_\s*_\s*_+)$/.test(p),
			);
		return paras.map((raw, idx) => {
			if (/^#{2,6}\s+(.+)$/.test(raw)) {
				const h = raw
					.replace(/^#{2,6}\s+/, "")
					.replace(/\*\*/g, "")
					.replace(/\*/g, "")
					.trim();
				return {
					id: `preview-en-${idx + 1}`,
					type: "paragraph",
					content: `<b>${h}</b>`,
				};
			}
			let html = raw
				.replace(/^(?:[-*•])\s+\*\*((?:[^*\n]|\*[^*\n])+?)\*\*/gm, "• <b>$1</b>")
				.replace(/`([^`\n]+?)`/g, "<i>$1</i>")
				.replace(/\*\*\*([^*]+?)\*\*\*/g, "<i>$1</i>")
				.replace(/\*\*([^*]+?)\*\*/g, "$1")
				.replace(/\*([^*\n]+?)\*/g, "<i>$1</i>");
			return {
				id: `preview-en-${idx + 1}`,
				type: "paragraph",
				content: html,
			};
		});
	});

	let enWordCount = $derived.by(() => {
		const txt = enMarkdown.replace(/[#*_`~>-]/g, " ").trim();
		if (!txt) return 0;
		return txt.split(/\s+/).filter(Boolean).length;
	});

	onMount(async () => {
		if (page.url.searchParams.get("lang") === "en") {
			activeLangTab = "en";
		}
		if (isEdit) {
			try {
				const r = await adminGet<any>(`/admin/chapters/${chapterId}/edit`);
				if (r.success) {
					chapterData = r.data;
					hydrateEnFromData(r.data);
				} else {
					toast_error("Không tìm thấy chương");
					goto("/admin/chapters");
				}
			} catch {
				toast_error("Lỗi khi tải dữ liệu");
				goto("/admin/chapters");
			}
		}
		loading = false;
	});

	async function saveEnTranslation(overrideStatus?: "draft" | "published") {
		if (!enTitle.trim()) {
			toast_error("Vui lòng nhập Tiêu đề chương Tiếng Anh (EN)");
			return;
		}
		if (!enMarkdown.trim()) {
			toast_error("Vui lòng nhập hoặc dán nội dung bản dịch Tiếng Anh");
			return;
		}
		savingEn = true;
		try {
			const targetStatus = overrideStatus ?? enStatus;
			const payload: Record<string, unknown> = {
				title: enTitle.trim(),
				markdown_prose: enMarkdown,
				author_note: enAuthorNote.trim() || null,
				status: targetStatus,
			};
			const res = await adminPut<any>(
				`/admin/chapters/${chapterId}/translations/en`,
				payload,
			);
			if (res.success && res.data) {
				enStatus = targetStatus;
				hasSavedEn = true;
				enSavedBlocks = Array.isArray(res.data.content_blocks)
					? res.data.content_blocks
					: null;
				enDirtyMarkdown = false;
				if (chapterData) {
					chapterData.translations = {
						...(chapterData.translations || {}),
						en: res.data,
					};
				}
				toast_success(
					targetStatus === "published"
						? "Đã lưu & xuất bản công khai bản dịch Tiếng Anh (EN)!"
						: "Đã lưu bản dịch Tiếng Anh (EN) ở chế độ Nháp!",
				);
			}
		} finally {
			savingEn = false;
		}
	}

	async function removeEnTranslation() {
		if (!hasSavedEn || deletingEn) return;
		if (
			!confirm(
				"Xóa bản dịch Tiếng Anh (EN) của chương này khỏi cơ sở dữ liệu? (Bản gốc Tiếng Việt không bị ảnh hưởng)",
			)
		)
			return;
		deletingEn = true;
		try {
			const res = await adminDelete(
				`/admin/chapters/${chapterId}/translations/en`,
			);
			if (res.success) {
				if (chapterData?.translations) {
					delete chapterData.translations.en;
				}
				hydrateEnFromData(chapterData);
				toast_success("Đã xóa bản dịch Tiếng Anh (EN).");
			}
		} finally {
			deletingEn = false;
		}
	}

	function downloadEnMarkdownBackup() {
		const chNum = String(chapterData?.chapter?.chapter_number ?? chapterId).padStart(2, "0");
		const header = `# Chapter ${chapterData?.chapter?.chapter_number ?? ""}: ${enTitle || "Untitled"}\n\n`;
		const footer = enAuthorNote.trim() ? `\n\n---\n\n### Author's Note\n\n${enAuthorNote.trim()}\n` : "\n";
		const blob = new Blob([header + enMarkdown.trim() + footer], {
			type: "text/markdown;charset=utf-8",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `chapter-${chNum}-en.md`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleImportEnMdFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const raw = await file.text();
		const lines = raw.split(/\r?\n/);
		if (lines[0]?.startsWith("# ")) {
			const heading = lines[0]
				.replace(/^#\s*(?:Chapter\s+\d+\s*[:—.-]\s*)?/i, "")
				.trim();
			if (heading && !enTitle.trim()) {
				enTitle = heading;
			}
			enMarkdown = lines.slice(1).join("\n").trim();
		} else {
			enMarkdown = raw.trim();
		}
		enDirtyMarkdown = true;
		input.value = "";
		toast_success(`Đã nạp nội dung từ ${file.name}! Nhấn Lưu để ghi vào Beta DB.`);
	}

	async function saveChapter(payload: any) {
		try {
			// 1. Process Pending Local Uploads FIRST
			if (
				payload.assets &&
				payload.assets.length > 0 &&
				payload.pendingUploads
			) {
				const pendingMap: Map<string, File> = payload.pendingUploads;
				let contentBlocksStr = JSON.stringify(payload.content_blocks);
				let contentHtmlStr = payload.content_html || "";

				for (let i = 0; i < payload.assets.length; i++) {
					const asset = payload.assets[i];
					if (asset.id < 0) {
						const blobUrl = asset.cloudinary_url;
						const file = pendingMap.get(blobUrl);
						if (file) {
							const formData = new FormData();
							formData.append("file", file);
							formData.append("folder", "chapters");
							const uploadRes = await adminUpload<any>(
								"/upload/image",
								formData,
							);

							if (uploadRes.success && uploadRes.data) {
								const realUrl = uploadRes.data.url;
								payload.assets[i].cloudinary_url = realUrl;
								payload.assets[i].cloudinary_public_id =
									uploadRes.data.public_id;
								payload.assets[i].width =
									uploadRes.data.width || 0;
								payload.assets[i].height =
									uploadRes.data.height || 0;

								contentBlocksStr = contentBlocksStr
									.split(blobUrl)
									.join(realUrl);
								contentHtmlStr = contentHtmlStr
									.split(blobUrl)
									.join(realUrl);
							}
						}
					}
				}

				payload.content_blocks = JSON.parse(contentBlocksStr);
				payload.content_html = contentHtmlStr;
				delete payload.pendingUploads;
			}

			// 2. Save Chapter
			let idToSync = chapterId;
			if (isEdit) {
				const res = await adminPut<any>(
					`/admin/chapters/${chapterId}`,
					payload,
				);
				if (!res.success) {
					toast_error(
						`Lưu chương thất bại: ${res.message || "Không rõ nguyên nhân"}`,
					);
					return;
				}
			} else {
				const res = await adminPost<any>("/admin/chapters", payload);
				if (!res.success || !res.data?.id) {
					toast_error(
						`Tạo chương thất bại: ${res.message || "Không rõ nguyên nhân"}`,
					);
					return;
				}
				idToSync = res.data.id.toString();
			}

			// 3. Sync Tags, Links, and Assets
			if (idToSync !== "new") {
				if (payload.tags) {
					const tagPayload = payload.tags.map((t: any) => ({
						library_item_id: t.library_item_id,
						role: t.role,
					}));
					await adminPost(
						`/admin/chapters/${idToSync}/tags`,
						tagPayload,
					);
				}
				if (payload.links) {
					const linkPayload = payload.links.map((l: any) => ({
						linked_chapter_id: l.linked_chapter_id,
						link_type: l.link_type,
					}));
					await adminPost(
						`/admin/chapters/${idToSync}/links`,
						linkPayload,
					);
				}

				if (payload.assets) {
					for (const asset of payload.assets) {
						if (asset.id < 0) {
							const assetPayload = {
								cloudinary_url: asset.cloudinary_url,
								cloudinary_public_id:
									asset.cloudinary_public_id,
								filename: asset.filename,
								size: asset.size,
								width: asset.width || 0,
								height: asset.height || 0,
								mime_type: asset.mime_type,
							};
							const res = await adminPost<any>(
								`/admin/chapters/${idToSync}/assets`,
								assetPayload,
							);
							if (!res.success)
								toast_error(
									`Lỗi lưu hình: ${res.message || "Không xác định"}`,
								);
						}
					}

					const existingUrls = payload.assets
						.filter((a: any) => a.id > 0)
						.map((a: any) => a.cloudinary_url);
					const newlyAddedUrls = payload.assets
						.filter((a: any) => a.id < 0)
						.map((a: any) => a.cloudinary_url);
					const allKnownUrls = new Set([
						...existingUrls,
						...newlyAddedUrls,
					]);

					for (const block of payload.content_blocks || []) {
						if (block.type === "image" && block.images) {
							for (const img of block.images) {
								if (
									img.cloudinary_url &&
									img.cloudinary_url.startsWith("http") &&
									!allKnownUrls.has(img.cloudinary_url)
								) {
									const ghostPayload = {
										cloudinary_url: img.cloudinary_url,
										cloudinary_public_id:
											img.cloudinary_public_id ||
											"recovered",
										filename:
											img.filename ||
											"recovered-image.jpg",
										size: img.size || 0,
										width: img.width || 0,
										height: img.height || 0,
										mime_type:
											img.mime_type || "image/jpeg",
									};
									const res = await adminPost<any>(
										`/admin/chapters/${idToSync}/assets`,
										ghostPayload,
									);
									if (res.success)
										allKnownUrls.add(img.cloudinary_url);
								}
							}
						}
					}
				}
			}

			toast_success(
				isEdit ? "Đã cập nhật chương!" : "Đã tạo chương mới!",
			);
			setTimeout(() => {
				goto("/admin/chapters");
			}, 1500);
		} catch {
			toast_error("Lỗi khi lưu chương");
		}
	}
</script>

<svelte:head>
	<title>{isEdit ? "Sửa Chương" : "Tạo Chương Mới"} — Admin</title>
</svelte:head>

{#if loading}
	<div class="editor-loading">
		<div class="spinner"></div>
		<p>Đang tải dữ liệu chương...</p>
	</div>
{:else if isEdit && chapterData}
	<!-- Thanh chuyển Ngôn ngữ Biên tập: Bản gốc VI vs. Bản dịch EN -->
	<div class="lang-mode-bar">
		<div class="lang-tabs">
			<button
				type="button"
				class="lang-tab"
				class:active={activeLangTab === "vi"}
				onclick={() => (activeLangTab = "vi")}
			>
				🇻🇳 Bản gốc Tiếng Việt (Ch.{chapterData.chapter.chapter_number})
			</button>
			<button
				type="button"
				class="lang-tab"
				class:active={activeLangTab === "en"}
				onclick={() => (activeLangTab = "en")}
			>
				🇬🇧 Bản dịch Tiếng Anh (EN)
				{#if hasSavedEn}
					<span
						class="en-status-pill"
						class:published={enStatus === "published"}
					>
						{enStatus === "published" ? "Đã XB" : "Nháp"}
					</span>
				{:else}
					<span class="en-status-pill empty">Chưa dịch</span>
				{/if}
			</button>
		</div>

		<a href="/admin/chapters" class="back-chapters-link">← Danh sách chương</a>
	</div>

	{#if activeLangTab === "vi"}
		<AdminChapterEditor
			{chapterId}
			initialTitle={chapterData.chapter.title}
			initialContent={chapterData.chapter.content}
			initialBlocks={chapterData.chapter.content_blocks}
			initialStatus={chapterData.chapter.status}
			initialChapterNumber={chapterData.chapter.chapter_number}
			initialAuthorNote={chapterData.chapter.author_note}
			initialAssets={chapterData.assets}
			initialTags={chapterData.library_tags}
			initialLinks={chapterData.links}
			onsave={saveChapter}
		/>
	{:else}
		<div class="en-editor-shell">
			<div class="en-editor-head">
				<div>
					<h2>
						🇬🇧 Bản Dịch Tiếng Anh — Chương {chapterData.chapter.chapter_number}
					</h2>
					<p class="en-sub">
						Bản gốc VI: <strong>{chapterData.chapter.title}</strong> · Dán văn bản Markdown tiếng Anh (tự động chuyển định dạng in nghiêng/tiêu đề mục và tự động chèn lại các khung hình minh họa inline từ bản gốc VI).
					</p>
				</div>

				<div class="en-head-actions">
					<label class="btn-md-tool" title="Nạp từ file Markdown (.md) trong _translations/en/chapters">
						📂 Nạp file .md
						<input
							type="file"
							accept=".md,.txt"
							style="display:none"
							onchange={handleImportEnMdFile}
						/>
					</label>
					{#if enMarkdown.trim()}
						<button
							type="button"
							class="btn-md-tool"
							onclick={downloadEnMarkdownBackup}
						>
							📥 Xuất .md backup
						</button>
					{/if}
					{#if hasSavedEn}
						<button
							type="button"
							class="btn-del-en"
							disabled={deletingEn}
							onclick={removeEnTranslation}
						>
							{deletingEn ? "⏳..." : "🗑️ Xóa bản EN"}
						</button>
					{/if}
				</div>
			</div>

			<div class="en-meta-grid">
				<div class="en-field">
					<label>
						<span>Tiêu đề chương Tiếng Anh (EN) *</span>
						<input
							type="text"
							bind:value={enTitle}
							placeholder="VD: The Primordial Wave..."
						/>
					</label>
				</div>

				<div class="en-field status-col">
					<label>
						<span>Trạng thái xuất bản (Bản EN)</span>
						<select bind:value={enStatus}>
							<option value="draft">⏳ Nháp (Chờ kiểm duyệt)</option>
							<option value="published">✅ Đã xuất bản công khai</option>
						</select>
					</label>
				</div>
			</div>

			<div class="en-toolbar-row">
				<div class="en-view-modes">
					<button
						type="button"
						class:active={enViewMode === "edit"}
						onclick={() => (enViewMode = "edit")}
					>
						📝 Soạn thảo Markdown
					</button>
					<button
						type="button"
						class:active={enViewMode === "split"}
						onclick={() => (enViewMode = "split")}
					>
						🪟 Song song (Soạn + Sách in)
					</button>
					<button
						type="button"
						class:active={enViewMode === "preview"}
						onclick={() => (enViewMode = "preview")}
					>
						👁️ Xem trước Sách in
					</button>
				</div>

				<span class="en-word-counter">
					📊 {enWordCount.toLocaleString("vi-VN")} từ (~{Math.max(1, Math.round(enWordCount / 220))} phút đọc)
				</span>
			</div>

			<div class="en-workspace" class:split={enViewMode === "split"}>
				{#if enViewMode === "edit" || enViewMode === "split"}
					<div class="en-pane">
						<textarea
							class="en-markdown-Area"
							bind:value={enMarkdown}
							oninput={() => (enDirtyMarkdown = true)}
							rows="22"
							placeholder={"Dán bản dịch Tiếng Anh vào đây...\n\n### I\n\nThe monsoon rain drummed upon the ancient dipterocarp canopy...\n\n*\"Listen closely,\"* the old man whispered."}
						></textarea>
					</div>
				{/if}

				{#if enViewMode === "preview" || enViewMode === "split"}
					<div class="en-pane preview-pane">
						<div class="preview-book">
							<span class="preview-ch-label">
								Chapter {chapterData.chapter.chapter_number}
							</span>
							<h3>{enTitle || "Untitled Chapter"}</h3>
							<StoryContent
								blocks={previewEnBlocks}
								emptyText="Chưa có nội dung bản dịch để xem trước."
								enableLoreHighlight={false}
							/>
						</div>
					</div>
				{/if}
			</div>

			<div class="en-field" style="margin-top: 0.9rem;">
				<label>
					<span>Ghi chú tác giả cuối chương (Author's Note — EN, tùy chọn)</span>
					<textarea
						rows="3"
						bind:value={enAuthorNote}
						placeholder="Optional author's note displayed at the end of the English chapter..."
					></textarea>
				</label>
			</div>

			<div class="en-save-bar">
				<button
					type="button"
					class="btn-save-draft"
					disabled={savingEn}
					onclick={() => saveEnTranslation("draft")}
				>
					{savingEn ? "⏳ Đang lưu..." : "💾 Lưu Nháp Bản EN"}
				</button>
				<button
					type="button"
					class="btn-save-pub"
					disabled={savingEn}
					onclick={() => saveEnTranslation("published")}
				>
					{savingEn ? "⏳ Đang xuất bản..." : "🚀 Lưu & Xuất Bản Bản EN"}
				</button>
			</div>
		</div>
	{/if}
{:else if !isEdit}
	<AdminChapterEditor chapterId="new" onsave={saveChapter} />
{/if}

<style>
	.editor-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 60vh;
		color: var(--color-text-muted);
		gap: 1rem;
	}
	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid var(--color-surface-200);
		border-top-color: var(--color-brand-500);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.lang-mode-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
		padding: 0.55rem 0.75rem;
		background: var(--color-surface-100);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.75rem;
	}
	.lang-tabs {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.lang-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.95rem;
		border-radius: 0.55rem;
		border: 1px solid transparent;
		background: transparent;
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.18s;
	}
	.lang-tab.active {
		background: rgba(12, 113, 61, 0.18);
		border-color: rgba(12, 113, 61, 0.45);
		color: var(--color-text-primary);
	}
	.en-status-pill {
		font-size: 0.68rem;
		padding: 0.12rem 0.45rem;
		border-radius: 999px;
		background: rgba(245, 158, 11, 0.18);
		color: #fbbf24;
	}
	.en-status-pill.published {
		background: rgba(34, 197, 94, 0.18);
		color: #4ade80;
	}
	.en-status-pill.empty {
		background: rgba(148, 163, 184, 0.16);
		color: var(--color-text-muted);
	}
	.back-chapters-link {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-decoration: none;
	}
	.back-chapters-link:hover {
		color: var(--color-text-primary);
	}

	.en-editor-shell {
		background: var(--color-surface-100);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.9rem;
		padding: 1.25rem;
	}
	.en-editor-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}
	.en-editor-head h2 {
		margin: 0;
		font-size: 1.2rem;
	}
	.en-sub {
		margin: 0.25rem 0 0;
		font-size: 0.82rem;
		color: var(--color-text-muted);
		max-width: 720px;
	}
	.en-head-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.btn-md-tool {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.45rem 0.8rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-del-en {
		padding: 0.45rem 0.8rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(239, 68, 68, 0.35);
		background: rgba(239, 68, 68, 0.12);
		color: #f87171;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}

	.en-meta-grid {
		display: grid;
		grid-template-columns: 1fr 260px;
		gap: 0.9rem;
		margin-bottom: 0.9rem;
	}
	.en-field label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}
	.en-field input,
	.en-field select,
	.en-field textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 0.65rem 0.8rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.9rem;
		font-family: inherit;
	}

	.en-toolbar-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 0.7rem;
	}
	.en-view-modes {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.en-view-modes button {
		padding: 0.38rem 0.75rem;
		border-radius: 0.45rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-surface-200);
		color: var(--color-text-muted);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}
	.en-view-modes button.active {
		background: var(--color-brand-500);
		border-color: var(--color-brand-500);
		color: #fff;
	}
	.en-word-counter {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		font-weight: 600;
	}

	.en-workspace {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
	}
	.en-workspace.split {
		grid-template-columns: 1fr 1fr;
	}
	.en-markdown-Area {
		width: 100%;
		min-height: 520px;
		box-sizing: border-box;
		padding: 1rem;
		border-radius: 0.65rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-family: "Palatino Linotype", Georgia, serif;
		font-size: 0.96rem;
		line-height: 1.72;
		resize: vertical;
	}
	.preview-pane {
		max-height: 620px;
		overflow-y: auto;
		border-radius: 0.65rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(15, 23, 42, 0.45);
		padding: 1.25rem 1.4rem;
	}
	.preview-ch-label {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-brand-300);
		font-weight: 700;
	}
	.preview-book h3 {
		margin: 0.25rem 0 1rem;
		font-size: 1.3rem;
	}

	.en-save-bar {
		display: flex;
		justify-content: flex-end;
		gap: 0.65rem;
		margin-top: 1.15rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
	.btn-save-draft {
		padding: 0.65rem 1.2rem;
		border-radius: 0.55rem;
		border: 1px solid rgba(245, 158, 11, 0.4);
		background: rgba(245, 158, 11, 0.14);
		color: #fbbf24;
		font-weight: 700;
		cursor: pointer;
	}
	.btn-save-pub {
		padding: 0.65rem 1.35rem;
		border-radius: 0.55rem;
		border: none;
		background: linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600));
		color: #fff;
		font-weight: 700;
		cursor: pointer;
	}

	@media (max-width: 960px) {
		.en-meta-grid,
		.en-workspace.split {
			grid-template-columns: 1fr;
		}
	}
</style>
