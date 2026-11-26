<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import {
		normalizeBlocks,
		resolveAspect,
		rotatedFrame
	} from '$lib/story/story-blocks.js';
	
	let {
		blocks = null,
		contentHtml = '',
		content = '',
		emptyText = '',
		loreItems = [],
		enableLoreHighlight = true,
		onSelectLore,
		activeBlockIndex = null,
		spotlightProgress = 0,
		spotlightDimInactive = false,
		onSelectBlock
	} = $props<{
		/** `content_blocks` từ API — nguồn ưu tiên, giữ được bố cục và góc xoay. */
		blocks?: unknown;
		/** HTML cũ đã qua `ammonia::clean` phía backend, dùng khi chương chưa có block. */
		contentHtml?: string;
		/** Văn bản thuần, chốt chặn cuối. */
		content?: string;
		emptyText?: string;
		/** Danh sách thực thể (`libraryTags`) xuất hiện trong chương để gạch chân tra cứu nhanh. */
		loreItems?: any[];
		/** Bật/tắt gạch chân thực thể trực tiếp trong dòng văn. */
		enableLoreHighlight?: boolean;
		/** Callback khi độc giả bấm vào tên thực thể gạch chân trong câu văn. */
		onSelectLore?: (item: any) => void;
		/** Chỉ số khối đang đọc trong chế độ Nhịp Đoạn Văn (Spotlight). */
		activeBlockIndex?: number | null;
		/** Tiến độ (0..100) của khối đang đọc trong chế độ Nhịp Đoạn Văn. */
		spotlightProgress?: number;
		/** Làm dịu nhẹ các đoạn xung quanh khi đang bật Nhịp Đoạn Văn. */
		spotlightDimInactive?: boolean;
		/** Callback khi độc giả bấm vào một đoạn văn để nhảy điểm đọc tới đoạn đó. */
		onSelectBlock?: (index: number) => void;
	}>();

	let rendered = $derived(normalizeBlocks(blocks));

	/**
	 * Tỉ lệ đo được lúc ảnh load xong, chỉ dùng cho asset cũ thiếu width/height
	 * trong DB. Có giá trị này thì khung xoay mới tính đúng được hộp bao.
	 */
	let measured = $state<Record<string, number>>({});

	function measure(url: string, node: HTMLImageElement) {
		if (measured[url] || !node.naturalWidth || !node.naturalHeight) return;
		measured = { ...measured, [url]: node.naturalWidth / node.naturalHeight };
	}

	function frameStyle(layout: string, rotation: number, image: { url: string; width?: number; height?: number }) {
		const frame = rotatedFrame(resolveAspect(layout, image, measured[image.url]), rotation);
		return `--frame-ar:${frame.frameAspect};--img-ar:${frame.aspect};--img-w:${frame.imageWidthPct}%;--rot:${frame.deg}deg;`;
	}

	function isSectionHeading(html: string): boolean {
		const trimmed = (html ?? '').trim();
		if (!trimmed) return false;
		const plain = trimmed.replace(/<[^>]*>/g, '').trim();
		if (/^(?:[IVXLCDM]{1,6})(?:\s*[-—:.]\s*.{1,60})?$/.test(plain)) return true;
		if (
			/^(?:Phần|Hồi|Cảnh|Màn|Chương|Part|Act|Scene|Chapter|Book)\s+[0-9IVXLCDM]+(?:\s*[-—:.]\s*.{1,60})?$/i.test(
				plain
			)
		)
			return true;
		if (/^(?:Prologue|Epilogue)(?:\s+[0-9IVXLCDM]+)?(?:\s*[-—:.]\s*.{1,60})?$/i.test(plain))
			return true;
		if (/^<(?:b|strong)>[^<]{1,50}<\/(?:b|strong)>$/i.test(trimmed)) return true;
		return false;
	}

	function isAppendixHeading(html: string): boolean {
		const plain = (html ?? '')
			.replace(/<[^>]*>/g, '')
			.replace(/&amp;/gi, '&')
			.trim();
		return /^(?:Điển\s+Tích|Chú\s+Thích|Phụ\s+Lục|Historical\s*(?:&|and)\s*Philosophical\s+Notes?|Lore\s+Notes?|Author'?s?\s+Notes?|Notes|Appendix|Glossary)/i.test(
			plain
		);
	}

	function isAppendixItem(html: string): boolean {
		return (html ?? '').trim().startsWith('• ');
	}

	function countWordsInHtml(html: string): number {
		const plain = (html ?? '').replace(/<[^>]*>/g, ' ').trim();
		if (!plain) return 0;
		return plain.split(/\s+/).length;
	}

	function escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	function escapeAttr(str: string): string {
		return str
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	interface LoreMatcher {
		id: number;
		name: string;
		term: string;
		regex: RegExp;
	}

	let loreMatchers = $derived.by<LoreMatcher[]>(() => {
		if (!enableLoreHighlight || !Array.isArray(loreItems) || loreItems.length === 0) {
			return [];
		}
		const entries: { id: number; name: string; term: string }[] = [];
		const seenTerms = new Set<string>();

		for (const item of loreItems) {
			if (!item || typeof item.id !== 'number' || typeof item.name !== 'string') continue;
			const rawTerms: string[] = [item.name];
			if (Array.isArray(item.extra_data?.aliases)) {
				for (const alias of item.extra_data.aliases) {
					if (typeof alias === 'string') rawTerms.push(alias);
				}
			}
			for (const raw of rawTerms) {
				const clean = raw.trim();
				if (clean.length < 2) continue;
				const key = clean.toLowerCase();
				if (seenTerms.has(key)) continue;
				seenTerms.add(key);
				entries.push({ id: item.id, name: item.name, term: clean });
			}
		}

		// Ưu tiên khớp cụm từ dài trước (ví dụ "Dona Heracles" trước "Dona")
		entries.sort((a, b) => b.term.length - a.term.length);

		return entries.map((entry) => ({
			...entry,
			regex: new RegExp(`(?<![\\p{L}\\p{N}])(${escapeRegex(entry.term)})(?![\\p{L}\\p{N}])`, 'iu')
		}));
	});

	/**
	 * Gắn thẻ `.inline-lore-term` cho lần xuất hiện đầu tiên của mỗi thực thể trong đoạn văn,
	 * chỉ thay thế trên phần text nằm ngoài thẻ HTML.
	 */
	function decorateParagraphHtml(html: string): string {
		if (!html || loreMatchers.length === 0 || isSectionHeading(html)) return html;

		const matchedIdsInPara = new Set<number>();
		let currentHtml = html;

		for (const matcher of loreMatchers) {
			if (matchedIdsInPara.has(matcher.id)) continue;

			const parts = currentHtml.split(/(<[^>]+>)/g);
			let replaced = false;
			let insideLoreSpan = 0;

			for (let i = 0; i < parts.length; i++) {
				const segment = parts[i];
				if (!segment) continue;
				if (segment.startsWith('<')) {
					if (/^<span\b[^>]*\binline-lore-term\b/i.test(segment)) {
						insideLoreSpan++;
					} else if (insideLoreSpan > 0 && /^<\/span>/i.test(segment)) {
						insideLoreSpan--;
					}
					continue;
				}
				if (insideLoreSpan > 0) continue;
				if (matcher.regex.test(segment)) {
					parts[i] = segment.replace(
						matcher.regex,
						`<span class="inline-lore-term" role="button" tabindex="0" data-lore-id="${matcher.id}" title="${m.story_cnt_click_to_view_dossier()} ${escapeAttr(matcher.name)}">$1</span>`
					);
					replaced = true;
					matchedIdsInPara.add(matcher.id);
					break;
				}
			}

			if (replaced) {
				currentHtml = parts.join('');
			}
		}

		return currentHtml;
	}

	function handleBodyClick(e: MouseEvent) {
		const target = e.target as HTMLElement | null;
		if (!target) return;

		const loreEl = target.closest('.inline-lore-term') as HTMLElement | null;
		if (loreEl && onSelectLore) {
			const idNum = Number(loreEl.getAttribute('data-lore-id'));
			const found = loreItems.find((it: any) => Number(it.id) === idNum);
			if (found) {
				e.stopPropagation();
				onSelectLore(found);
				return;
			}
		}

		if (activeBlockIndex !== null && onSelectBlock) {
			const stepEl = target.closest('[data-step-index]') as HTMLElement | null;
			if (stepEl) {
				const idx = Number(stepEl.getAttribute('data-step-index'));
				if (Number.isFinite(idx)) {
					onSelectBlock(idx);
				}
			}
		}
	}

	function handleBodyKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		const target = e.target as HTMLElement | null;
		if (!target) return;
		const loreEl = target.closest('.inline-lore-term') as HTMLElement | null;
		if (loreEl && onSelectLore) {
			const idNum = Number(loreEl.getAttribute('data-lore-id'));
			const found = loreItems.find((it: any) => Number(it.id) === idNum);
			if (found) {
				e.preventDefault();
				e.stopPropagation();
				onSelectLore(found);
			}
		}
	}

	function escapeHtml(str: string): string {
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	let fallbackParagraphs = $derived.by(() => {
		if (rendered.length > 0 || contentHtml || !content) return [];
		return content
			.split('\n')
			.map((p: string) => p.trim())
			.filter(Boolean)
			.map((p: string) => escapeHtml(p));
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="story-body"
	class:spotlight-mode={activeBlockIndex !== null}
	class:spotlight-dim={activeBlockIndex !== null && spotlightDimInactive}
	onclick={handleBodyClick}
	onkeydown={handleBodyKeydown}
>
	{#if rendered.length > 0}
		{#each rendered as block, idx (block.key)}
			{#if block.type === 'paragraph'}
				<p
					data-step-index={idx}
					data-word-count={countWordsInHtml(block.html)}
					class:section-heading={isSectionHeading(block.html)}
					class:appendix-heading={isAppendixHeading(block.html)}
					class:appendix-item={isAppendixItem(block.html)}
					class:spotlight-active={activeBlockIndex === idx}
					style={activeBlockIndex === idx ? `--spot-scale:${Math.max(0, Math.min(1, spotlightProgress / 100)).toFixed(3)}` : undefined}
				>{@html decorateParagraphHtml(block.html)}</p>
			{:else}
				<figure
					data-step-index={idx}
					data-word-count="18"
					class="story-image {block.layout}"
					class:tilted={block.rotation !== 0}
					class:spotlight-active={activeBlockIndex === idx}
					style={activeBlockIndex === idx ? `--spot-scale:${Math.max(0, Math.min(1, spotlightProgress / 100)).toFixed(3)}` : undefined}
				>
					<div class="image-container">
						<!-- Khoá theo vị trí: một khối hoàn toàn có thể dùng lại cùng một ảnh. -->
						{#each block.images as image, index (`${block.key}#${index}`)}
							<div class="img-frame" style={frameStyle(block.layout, block.rotation, image)}>
								<img
									src={image.url}
									alt={image.alt}
									loading="lazy"
									decoding="async"
									onload={(e) => measure(image.url, e.currentTarget as HTMLImageElement)}
								/>
							</div>
						{/each}
					</div>
					{#if block.caption}
						<figcaption>{block.caption}</figcaption>
					{/if}
				</figure>
			{/if}
		{/each}
	{:else if contentHtml}
		<!-- Chương lưu trước bản vá này: HTML đã bị ammonia lột hết class/style. -->
		<div class="legacy-html">{@html contentHtml}</div>
	{:else if fallbackParagraphs.length > 0}
		{#each fallbackParagraphs as para, idx}
			<p
				data-step-index={idx}
				data-word-count={countWordsInHtml(para)}
				class:section-heading={isSectionHeading(para)}
				class:spotlight-active={activeBlockIndex === idx}
				style={activeBlockIndex === idx ? `--spot-scale:${Math.max(0, Math.min(1, spotlightProgress / 100)).toFixed(3)}` : undefined}
			>{@html decorateParagraphHtml(para)}</p>
		{/each}
	{:else if emptyText}
		<p class="story-empty">{emptyText}</p>
	{/if}
</div>

<style>
	.story-body {
		position: relative;
	}

	/* ─── Chế độ Nhịp Đoạn Văn (Spotlight Pacing) ─── */
	.story-body.spotlight-mode :global([data-step-index]) {
		position: relative;
		transition: opacity 0.28s ease, background-color 0.28s ease, transform 0.25s ease;
		border-radius: 0.5rem;
		cursor: pointer;
	}

	.story-body.spotlight-dim :global([data-step-index]:not(.spotlight-active)) {
		opacity: 0.42;
	}

	.story-body.spotlight-mode :global(.spotlight-active) {
		opacity: 1 !important;
		background: rgba(16, 185, 129, 0.07);
		box-shadow: -10px 0 0 0 rgba(16, 185, 129, 0.07), 10px 0 0 0 rgba(16, 185, 129, 0.07);
	}

	.story-body.spotlight-mode :global(.spotlight-active)::before {
		content: '';
		position: absolute;
		left: -14px;
		top: 0.15em;
		bottom: 0.15em;
		width: 3.5px;
		border-radius: 99px;
		background: rgba(16, 185, 129, 0.22);
		overflow: hidden;
	}

	.story-body.spotlight-mode :global(.spotlight-active)::after {
		content: '';
		position: absolute;
		left: -14px;
		top: 0.15em;
		bottom: 0.15em;
		width: 3.5px;
		border-radius: 99px;
		background: linear-gradient(180deg, #10b981, #06b6d4);
		transform-origin: top;
		transform: scaleY(var(--spot-scale, 0));
		transition: transform 0.08s linear;
	}

	/* ─── Chú thích Thực thể trực tiếp (Inline Lore Term) ─── */
	.story-body :global(.inline-lore-term) {
		border-bottom: 1.5px dotted rgba(52, 211, 153, 0.72);
		color: inherit;
		cursor: pointer;
		padding-bottom: 1px;
		transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
		border-radius: 0.2rem;
	}

	.story-body :global(.inline-lore-term:hover),
	.story-body :global(.inline-lore-term:focus-visible) {
		color: #34d399;
		background: rgba(16, 185, 129, 0.14);
		border-bottom-style: solid;
		border-bottom-color: #10b981;
		outline: none;
	}

	.story-image {
		margin: 2rem 0;
		text-align: center;
	}

	.image-container {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		gap: 0.75rem;
	}

	/*
	 * Khung chiếm đúng hộp bao của ảnh sau khi xoay (xem `rotatedFrame`), nên
	 * ảnh nghiêng không bao giờ tràn ra đè lên chữ. Ảnh được đặt tuyệt đối vào
	 * giữa khung và thu theo `--img-w` để hộp bao vừa khít.
	 */
	.img-frame {
		position: relative;
		width: 100%;
		aspect-ratio: var(--frame-ar);
		flex: 0 1 auto;
	}

	.img-frame > img {
		position: absolute;
		left: 50%;
		top: 50%;
		display: block;
		width: var(--img-w);
		height: auto;
		max-width: none;
		/* Margin phải bằng 0: ảnh định vị tuyệt đối, margin dọc sẽ phá lệch tâm. */
		margin: 0;
		aspect-ratio: var(--img-ar);
		object-fit: cover;
		border-radius: 0.75rem;
		transform: translate(-50%, -50%) rotate(var(--rot));
	}

	/* Ảnh nghiêng cần thêm khoảng thở để góc nhọn không chạm dòng chữ kế bên. */
	.story-image.tilted {
		margin: 2.5rem 0;
	}

	figcaption {
		font-size: 0.85em;
		color: var(--color-text-muted);
		margin-top: 0.5rem;
		font-style: italic;
	}

	/* `!important` để thắng quy tắc canh chữ của trang chứa (thụt đầu dòng, canh đều). */
	.story-empty {
		color: var(--color-text-muted);
		font-style: italic;
		text-align: center !important;
		text-indent: 0 !important;
	}

	p.section-heading {
		text-align: center !important;
		text-indent: 0 !important;
		font-weight: 700;
		font-size: 1.1em;
		letter-spacing: 0.1em;
		margin: 1.8em 0 1.1em !important;
	}

	p.appendix-heading {
		border-top: 1px solid rgba(180, 150, 100, 0.35);
		padding-top: 1.8em;
		margin-top: 2.6em !important;
		font-size: 1.02em;
		letter-spacing: 0.08em;
	}

	p.appendix-item {
		text-indent: 0 !important;
		font-size: 0.94em;
		line-height: 1.72;
		opacity: 0.92;
		margin: 0.55em 0 !important;
	}

	/* Nội dung cũ chỉ còn figure/img trần — vẫn phải hiển thị tử tế. */
	.legacy-html :global(figure) {
		margin: 2rem 0;
		text-align: center;
	}
	.legacy-html :global(img) {
		max-width: 100%;
		height: auto;
		display: block;
		margin: 1.5em auto;
		border-radius: 0.75rem;
	}
	.legacy-html :global(figcaption) {
		font-size: 0.85em;
		color: var(--color-text-muted);
		margin-top: 0.5rem;
		font-style: italic;
	}

	/* Bố cục một hình: khung rộng bằng cột chữ, chặn trên theo dạng ảnh. */
	.single-1-1 .img-frame {
		max-width: 400px;
	}
	.single-9-16 .img-frame {
		max-width: 320px;
	}

	/* Bố cục ghép: các khung chia đều bề ngang cột chữ. */
	.combo-2 .img-frame {
		width: 48%;
	}
	.combo-3 .img-frame {
		width: 32%;
	}
	.combo-3 .image-container {
		gap: 0.5rem;
	}

	.combo-2-overlap .image-container {
		gap: 0;
	}
	.combo-2-overlap .img-frame {
		width: 55%;
		z-index: 1;
	}
	.combo-2-overlap .img-frame:nth-child(2) {
		margin-left: -15%;
		margin-top: 8%;
		z-index: 2;
	}

	@media (max-width: 768px) {
		.combo-2 .image-container,
		.combo-3 .image-container,
		.combo-2-overlap .image-container {
			flex-direction: column;
			align-items: center;
		}
		.combo-2 .img-frame,
		.combo-3 .img-frame {
			width: 100%;
			max-width: 400px;
		}
		.combo-2-overlap .img-frame {
			width: 85%;
		}
		.combo-2-overlap .img-frame:nth-child(2) {
			margin-left: 0;
			margin-top: -10%;
		}
	}
</style>
