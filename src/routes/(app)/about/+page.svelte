<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';

	interface MilestoneItem {
		id?: number; date: string; title: string; description: string; image_url?: string | null; image_ratio?: string;
	}

	const fallbackMilestones: MilestoneItem[] = [
		{ date: 'Q1 2026', title: 'Ý tưởng ra đời', description: 'Selorson được hình thành từ ý tưởng tạo một nền tảng nội dung đa phương tiện cho cộng đồng Việt.' },
		{ date: 'Q2 2026', title: 'Phát triển V2', description: 'Xây dựng lại toàn bộ hệ thống với công nghệ hiện đại — Laravel 11, Nuxt 3, TypeScript.' },
		{ date: 'Q3 2026', title: 'Ra mắt V3', description: 'Chuyển đổi toàn bộ sang Rust + Svelte, tối ưu hiệu năng và trải nghiệm.' },
		{ date: 'Q4 2026', title: 'AI & Cộng đồng', description: 'Tích hợp AI để đề xuất nội dung cá nhân hóa. Mở rộng tính năng cộng đồng.' },
	];

	let milestones = $state<MilestoneItem[]>(fallbackMilestones);
	let milestoneModal = $state<MilestoneItem | null>(null);
	let loading = $state(true);

	const values = [
		{ icon: '🎯', title: 'Sứ Mệnh', desc: 'Mang đến trải nghiệm giải trí chất lượng cao với nội dung sáng tạo và đa dạng cho cộng đồng Việt Nam.' },
		{ icon: '💡', title: 'Tầm Nhìn', desc: 'Trở thành nền tảng nội dung đa phương tiện hàng đầu — nơi mỗi câu chuyện đều có giá trị.' },
		{ icon: '❤️', title: 'Giá Trị', desc: 'Chất lượng, sáng tạo, cộng đồng. Nghệ thuật có sức mạnh kết nối con người và truyền cảm hứng.' },
	];

	const techStack = [
		{ icon: '🦀', name: 'Rust / Axum', role: 'Backend API' },
		{ icon: '🔥', name: 'Svelte 5', role: 'Frontend SPA' },
		{ icon: '📘', name: 'TypeScript', role: 'Type Safety' },
		{ icon: '🗃️', name: 'PostgreSQL', role: 'Database' },
		{ icon: '☁️', name: 'Cloudinary', role: 'Media CDN' },
		{ icon: '🔐', name: 'JWT', role: 'Authentication' },
	];

	const poemStanzas = [
		['Mây trôi nhẹ gió đưa hồn lữ thứ', 'Chân vội vàng cố níu giữ thời gian', 'Đêm dịu dàng lòng quạnh hiu xa xứ', 'Người lữ hành bước đi trong gian nan.'],
		['Bóng dáng ai bên thềm trăng soi tỏ', 'Đêm thanh tĩnh phiêu du khúc không lời', 'Từ rừng xanh hành trình qua sóng gió', 'Phiêu lưu ký mở cõi bát ngát trời.'],
		['Vẫn lặng lẽ vầng nguyệt dương lang thang', 'Phiêu lưu cùng những giấc mộng đêm về', 'Màn đêm tối thì thầm những lời thề', 'Bình minh lên chạy đua với thời gian.'],
		['Vũ trụ rộng sao lấp lánh đêm đông', 'Ngân hà xa tỏa sắc màu huyền diệu', 'Hành tinh kia thương nhớ biết bao nhiêu', 'Ta lặng im ngắm trái đất quay vòng.'],
		['Rồi một ngày trời chợt đổ mưa dông', 'Gió lay động ma thuật xưa lại sống', 'Ta nhặt nhạnh từng sức mạnh tổ tông', 'Thất sắc đạo suối nguồn thác đổ dòng.'],
		['Màu trắng tinh băng giá phủ lên đỉnh', 'Bạch quang sắc sao băng rơi không ngừng', 'Chắp tay lại nguyện cầu với thần linh', 'Phép thuật xưa trỗi dậy như đã từng.'],
		['Màu đỏ thắm thanh gươm lòng dũng cảm', 'Chém ác long hỏa chiến công lẫy lừng', 'Đầy kiêu ngạo rảy sạch máu quay lưng', 'Đời kiếm sĩ đời lãng du phiêu lãng!'],
		['Chàng và nàng giữa bao la sơn hải', 'Cùng nhau vẽ hạnh phúc của hai ta', 'Nàng đi mất tương lai không lời giải', 'Ôi chiến tranh tàn phá đi tất cả!'],
		['Ta vì nàng vì mảnh đất quê hương', 'Với khoa học hành trang là lý tưởng', 'Sự tham lam âm thanh cam bất bại', 'Vượt thời gian tìm kiếm những anh tài.'],
		['Bởi đất đá tấm khiên vàng vững chắc', 'Cứ tiến lên tin tưởng ở hậu phương', 'Từ Văn Lang gọi tôi hoàng kim sắc', 'Chút sắc dục chút quá khứ bi thương.'],
		['Từ rừng xanh đến kỉ nguyên thần thánh', 'Mang trọng trách một người bạn đồng hành', 'Không cá tính sức mạnh cũng mỏng manh', 'Yêu thiên nhiên yêu không khí trong lành.'],
		['Xanh như nước sắc xảo như mây trời', 'Mái tóc đen mềm mại như làn sương', 'Học cấm thư gương mặt em sáng ngời', 'Lam thuật sư cô gái vạn người thương.'],
		['Ánh sáng xanh em giúp tôi chữa lành', 'Vết thương nào rồi cũng sẽ qua nhanh', 'Bao khó khăn có phàm ăn giúp sức', 'Cuộc chiến nào rồi cũng chấm dứt thôi.'],
		['Indigo ngọn lôi thương thức giấc', 'Celtic xưa đố kỵ bị hóa mèo', 'Thầy tài giỏi học trò thêm xuất sắc', 'Ngày nằm ngủ đêm càng đánh càng keo.'],
		['Thời thần thánh cuộc chiến dài bất tận', 'Bao sinh linh kẻ nước mất nhà tan', 'Cung và nước sắc tím đánh cả Thần!', 'Tội làm biếng em hóa làm mỹ nhân.'],
		['Đen huyền bí tài năng và bản lĩnh', 'Đầy mạnh mẽ tự tin ở chính mình', 'Thật thông minh tự khám phá tất cả', 'Kiếm sĩ đen tự Darkin Tenka.'],
		['Mỗi màu sắc mỗi một cuộc hành trình', 'Đỏ kiếm sĩ thật thà hơi nóng tính', 'Cam cầu toàn khoa học gia chăm chỉ', 'Vàng đầu bếp vững vàng chẳng ngại gì.'],
		['Lục quân sư yêu thích những bài văn', 'Lam thuật sĩ triết lý đầy sâu lắng', 'Chàm mèo tộc giấc mộng thênh thang trôi', 'Tím cung bạc tên xuyên phá không thời.'],
		['Đen huyền bí hay ác quỷ giấu mình', 'Trắng tinh khôi thiên thần áo trắng tinh', 'Phiêu lưu mãi chẳng tính điểm dừng chân', 'Bảy màu sắc chuyện đổi thay muôn phần.'],
		['Vượt không thời đánh với hắc kiếm sư', 'Những trận đánh đã đi vào lịch sử', 'Thất sắc đạo chi thất sắc hành ca', 'Càn khôn đạo phi thường đạo hành ca.'],
	];

	function truncate(str: string | null | undefined, len: number) {
		if (!str) return '';
		return str.length > len ? str.slice(0, len) + '…' : str;
	}

	onMount(async () => {
		try {
			const res = await api<any>('/homepage');
			if (res.data?.milestones?.length) milestones = res.data.milestones;
		} catch {}
		loading = false;
	});
	
	let avatarError = $state(false);
</script>

<svelte:head>
	<title>Giới thiệu — Selorson</title>
	<meta name="description" content="Tìm hiểu về Selorson - Nền tảng nội dung đa phương tiện với truyện, video, nhạc." />
</svelte:head>

<div class="about-page">
	<!-- Hero -->
	<section class="page-hero">
		<div class="hero-content">
			<span class="hero-badge">EST. 2026</span>
			<h1>Selorson</h1>
			<p class="hero-tagline">Chút sắc màu cuộc sống</p>
			<p class="hero-desc">Nền tảng nội dung đa phương tiện — Truyện, Video, Nhạc — được xây dựng với tình yêu và đam mê sáng tạo.</p>
		</div>
		<div class="hero-glow"></div>
	</section>

	<!-- Author -->
	<section class="author-section">
		<div class="author-card glass-card">
			<div class="author-avatar-wrapper">
				{#if !avatarError}
					<img src="/images/about/avatar.webp" alt="Redfox" class="author-avatar" onerror={() => avatarError = true} />
				{:else}
					<div class="author-avatar-ph">R</div>
				{/if}
			</div>
			<div class="author-info">
				<h3 class="author-name">Redfox</h3>
				<span class="author-title">Founder & Creator</span>
				<blockquote class="author-slogan">
					<span class="quote-mark">"</span>
					Thú vị vì những cái vô vị<br />
					vô vị trước những cái thú vị
					<span class="quote-mark">"</span>
				</blockquote>
			</div>
		</div>
	</section>

	<!-- Two-column layout: Left sidebar + Right content -->
	<div class="about-layout">
		<!-- LEFT SIDEBAR: Poem + Illustration -->
		<aside class="about-sidebar">
			<div class="poem-scroll">
				<h4 class="poem-scroll-title">🎭 Thất Sắc Hành Ca</h4>
				<div class="poem-stanzas">
					{#each poemStanzas as stanza}
						<div class="poem-stanza">
							{#each stanza as line}
								<p>{line}</p>
							{/each}
						</div>
					{/each}
				</div>
				<p class="poem-author">— Redfox —</p>
			</div>

			<div class="poem-illustration">
				<img src="/images/about/poem-illustration.webp" alt="Thất Sắc Hành Ca minh họa" />
				<div class="illustration-overlay"></div>
			</div>
		</aside>

		<!-- RIGHT CONTENT -->
		<div class="about-main">
			<!-- Timeline Milestones -->
			<section class="timeline-section">
				<h2 class="section-title">📅 Hành Trình Phát Triển</h2>
				<div class="timeline">
					{#each milestones as event, i}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="timeline-item" class:right={i % 2 === 1} onclick={() => milestoneModal = event} onkeydown={(e) => { if (e.key === 'Enter') milestoneModal = event; }} role="button" tabindex="0">
							<div class="timeline-dot"></div>
							<div class="timeline-card glass-card">
								{#if event.image_url}
									<div class="timeline-thumb-wrap">
										<img src={event.image_url} alt={event.title} loading="lazy" />
									</div>
								{/if}
								<span class="timeline-date">{event.date}</span>
								<h4>{event.title}</h4>
								<p>{truncate(event.description, 100)}</p>
								<span class="timeline-view-hint">👁️ Xem chi tiết</span>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- Values -->
			<section class="values-section">
				<h2 class="section-title">✨ Giá Trị Cốt Lõi</h2>
				<div class="values-grid">
					{#each values as item, i}
						<div class="value-card glass-card" style="animation-delay: {0.1 + i * 0.15}s">
							<div class="value-icon-wrapper"><span class="value-icon">{item.icon}</span></div>
							<h3>{item.title}</h3>
							<p>{item.desc}</p>
						</div>
					{/each}
				</div>
			</section>

			<!-- Tech Stack -->
			<section class="tech-section">
				<h2 class="section-title">🛠️ Công Nghệ Sử Dụng</h2>
				<div class="tech-grid">
					{#each techStack as tech}
						<div class="tech-card glass-card">
							<span class="tech-icon">{tech.icon}</span>
							<span class="tech-name">{tech.name}</span>
							<span class="tech-role">{tech.role}</span>
						</div>
					{/each}
				</div>
			</section>
		</div>
	</div>
</div>

<!-- Milestone Modal — Split Pane (matching V2) -->
{#if milestoneModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="milestone-overlay" onclick={() => milestoneModal = null} onkeydown={(e) => { if (e.key === 'Escape') milestoneModal = null; }} role="dialog" aria-modal="true" tabindex="-1">
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="milestone-modal" onclick={(e) => e.stopPropagation()} role="document">
			<button class="modal-close" onclick={() => milestoneModal = null}>✕</button>
			<div class="milestone-split">
				{#if milestoneModal.image_url}
					<div class="milestone-img-pane">
						<img src={milestoneModal.image_url} alt={milestoneModal.title} style="aspect-ratio: {(milestoneModal.image_ratio || '16:9').replace(':', '/')}" />
					</div>
				{:else}
					<div class="milestone-img-pane placeholder"><span>📅</span></div>
				{/if}
				<div class="milestone-content-pane">
					<span class="modal-date">{milestoneModal.date}</span>
					<h3>{milestoneModal.title}</h3>
					<p class="modal-desc">{milestoneModal.description}</p>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.about-page { min-height: 100vh; }

	/* Hero */
	.page-hero { text-align: center; padding: 4rem 0 3rem; position: relative; }
	.hero-content { position: relative; z-index: 1; }
	.hero-badge { display: inline-block; padding: .25rem .75rem; border-radius: 2rem; background: rgba(12,113,61,.1); color: var(--color-brand-400); font-size: .7rem; font-weight: 700; letter-spacing: 2px; margin-bottom: 1rem; }
	.page-hero h1 { font-size: 3rem; font-weight: 900; margin: 0; background: linear-gradient(135deg, var(--color-brand-300), #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
	.hero-tagline { font-size: 1.25rem; color: var(--color-text-secondary); margin: .5rem 0; font-style: italic; }
	.hero-desc { max-width: 600px; margin: .75rem auto 0; color: var(--color-text-muted); font-size: .95rem; line-height: 1.7; }
	.hero-glow { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 400px; height: 400px; background: radial-gradient(circle, rgba(12,113,61,.06), transparent 70%); pointer-events: none; }

	/* Two-column Layout */
	.about-layout { display: grid; grid-template-columns: 320px 1fr; gap: 2.5rem; max-width: 1300px; margin: 0 auto; padding: 2.5rem 2rem 4rem; }
	.about-sidebar { position: sticky; top: 80px; align-self: start; display: flex; flex-direction: column; gap: 1.5rem; }
	.about-main { min-width: 0; }
	.about-main section { margin-bottom: 3.5rem; }

	/* Author */
	.author-section { padding: 0 2rem; position: relative; z-index: 10; margin-bottom: 2rem; }
	.author-card { display: flex; align-items: center; gap: 2.5rem; max-width: 800px; margin: 0 auto; padding: 2.5rem; border-radius: 1.25rem; box-shadow: 0 8px 32px rgba(0,0,0,.08); }
	.author-avatar-wrapper { flex-shrink: 0; width: 140px; height: 140px; border-radius: 50%; overflow: hidden; border: 4px solid rgba(12,113,61,.2); box-shadow: 0 8px 24px rgba(12,113,61,.15); }
	.author-avatar-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #0c713d, #06b6d4); color: #fff; font-size: 2.5rem; font-weight: 900; }
	.author-avatar { width: 100%; height: 100%; object-fit: cover; }
	.author-info { flex: 1; text-align: left; }
	.author-name { font-size: 1.75rem; font-weight: 800; margin: 0 0 .25rem; }
	.author-title { font-size: .875rem; color: var(--color-brand-400); font-weight: 600; display: block; margin-bottom: 1rem; }
	.author-slogan { margin: 0; padding: 0; border: none; font-size: 1.125rem; font-style: italic; line-height: 1.8; color: var(--color-text-muted); }
	.quote-mark { font-size: 2.5rem; font-weight: 900; color: rgba(12,113,61,.25); line-height: 0; vertical-align: -.5rem; }

	/* Section titles */
	.section-title { text-align: center; font-size: 1.75rem; font-weight: 800; margin: 0 0 2.5rem; }

	/* Parchment Poem */
	.poem-scroll { padding: 1.5rem; border-radius: 1rem; background: linear-gradient(135deg, #2a2416 0%, #1f1a10 100%); border-left: 6px solid #8b7355; border-right: 6px solid #8b7355; box-shadow: inset 0 0 10px rgba(0,0,0,.08), 0 4px 20px rgba(0,0,0,.1); }
	:global(html[data-theme='light']) .poem-scroll { background: linear-gradient(135deg, #fdf4e3 0%, #f9ead5 100%); border-left-color: #d9b382; border-right-color: #d9b382; }
	.poem-scroll-title { font-size: 1.125rem; font-weight: 700; color: var(--color-brand-400); text-align: center; margin: 0 0 1rem; }
	.poem-stanzas { max-height: 400px; overflow-y: auto; padding-right: 0.5rem; scrollbar-width: thin; }
	.poem-stanza { margin-bottom: 1rem; }
	.poem-stanza p { color: rgba(255,255,255,0.7); font-size: 0.8125rem; line-height: 1.8; margin: 0; font-style: italic; font-family: 'Georgia', serif; }
	:global(html[data-theme='light']) .poem-stanza p { color: #444; }
	.poem-author { text-align: center; color: var(--color-brand-400); font-weight: 700; font-size: 0.8125rem; margin-top: 1rem; }

	/* Illustration */
	.poem-illustration { position: relative; border-radius: 1rem; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,.15); transition: transform .4s ease, box-shadow .4s ease; }
	.poem-illustration:hover { transform: scale(1.02); box-shadow: 0 12px 40px rgba(0,0,0,.2); }
	.poem-illustration img { width: 100%; display: block; }
	.illustration-overlay { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 0%, rgba(12,113,61,.3) 100%); pointer-events: none; }

	/* Values */
	.values-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
	.value-card { text-align: center; padding: 2rem 1.25rem; animation: fadeInUp .6s ease-out both; }
	.value-card:hover { transform: translateY(-6px); box-shadow: 0 8px 32px rgba(12,113,61,.1); }
	.value-icon-wrapper { width: 64px; height: 64px; border-radius: 50%; background: rgba(12,113,61,.08); display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; }
	.value-icon { font-size: 2rem; }
	.value-card h3 { font-size: 1.1rem; font-weight: 700; margin: 0 0 .75rem; }
	.value-card p { color: var(--color-text-muted); font-size: .85rem; line-height: 1.7; margin: 0; }

	/* Timeline */
	.timeline { position: relative; padding: 1rem 0; }
	.timeline::before { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: linear-gradient(180deg, var(--color-brand-500), rgba(12,113,61,.1)); }
	.timeline-item { position: relative; margin-bottom: 2rem; cursor: pointer; }
	.timeline-dot { position: absolute; left: 50%; transform: translateX(-50%); width: 14px; height: 14px; border-radius: 50%; background: var(--color-brand-500); border: 3px solid var(--color-surface-50); z-index: 1; box-shadow: 0 2px 8px rgba(12,113,61,.3); }
	.timeline-card { width: 45%; padding: 1.25rem; transition: all .3s ease; }
	.timeline-item.right .timeline-card { margin-left: auto; }
	.timeline-item:hover .timeline-card { border-color: var(--color-brand-500); box-shadow: 0 4px 16px rgba(12,113,61,.12); }
	.timeline-thumb-wrap { width: 100%; height: 150px; overflow: hidden; border-radius: .5rem; margin-bottom: .75rem; background: var(--color-surface-200); }
	.timeline-thumb-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
	.timeline-date { display: inline-block; padding: .125rem .625rem; border-radius: 1rem; background: rgba(12,113,61,.08); color: var(--color-brand-400); font-size: .75rem; font-weight: 700; margin-bottom: .5rem; }
	.timeline-card h4 { font-size: 1rem; font-weight: 700; margin: 0 0 .375rem; }
	.timeline-card p { color: var(--color-text-muted); font-size: .8125rem; line-height: 1.6; margin: 0; }
	.timeline-view-hint { display: block; margin-top: .5rem; font-size: .75rem; color: var(--color-brand-400); font-weight: 600; }

	/* Milestone Modal — Split Pane */
	.milestone-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.85); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 99999; animation: overlayIn .2s ease; }
	@keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }
	.milestone-modal { max-width: 720px; width: 92%; background: var(--color-surface-100); border-radius: 1rem; overflow: hidden; box-shadow: 0 24px 64px rgba(0,0,0,.3); position: relative; animation: msPop .3s ease; }
	:global(html[data-theme='light']) .milestone-modal { background: #fff; }
	@keyframes msPop { from { transform: scale(.94) translateY(16px); opacity: 0; } to { transform: none; opacity: 1; } }
	.modal-close { position: absolute; top: .75rem; right: .75rem; width: 36px; height: 36px; border-radius: 50%; border: none; background: rgba(0,0,0,.5); color: #fff; font-size: 1rem; cursor: pointer; z-index: 2; transition: all .2s; }
	.modal-close:hover { background: rgba(0,0,0,.7); transform: scale(1.1); }
	.milestone-split { display: flex; gap: 0; min-height: 280px; }
	.milestone-img-pane { flex: 0 0 45%; overflow: hidden; display: flex; align-items: center; justify-content: center; background: var(--color-surface-200); }
	.milestone-img-pane img { width: 100%; height: 100%; object-fit: cover; display: block; }
	.milestone-img-pane.placeholder { background: linear-gradient(135deg, #0c713d, #4ade80); font-size: 4rem; }
	.milestone-content-pane { flex: 1; padding: 2rem; display: flex; flex-direction: column; justify-content: center; overflow-y: auto; max-height: 420px; }
	.modal-date { display: inline-block; padding: .125rem .625rem; border-radius: 1rem; background: rgba(12,113,61,.08); color: var(--color-brand-400); font-size: .75rem; font-weight: 700; margin-bottom: .5rem; align-self: flex-start; }
	.milestone-content-pane h3 { font-size: 1.25rem; font-weight: 800; margin: .25rem 0 .75rem; }
	.milestone-content-pane p { color: var(--color-text-muted); font-size: .875rem; line-height: 1.7; margin: 0; }
	.modal-desc { white-space: pre-line; }

	/* Tech */
	.tech-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
	.tech-card { text-align: center; padding: 1.25rem; transition: all .3s; }
	.tech-card:hover { transform: translateY(-3px); box-shadow: 0 6px 16px rgba(0,0,0,.08); }
	.tech-icon { font-size: 1.75rem; display: block; margin-bottom: .5rem; }
	.tech-name { display: block; font-weight: 700; font-size: .875rem; }
	.tech-role { font-size: .75rem; color: var(--color-text-muted); }

	@keyframes fadeInUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }

	@media (max-width: 992px) {
		.about-layout { grid-template-columns: 1fr; }
		.about-sidebar { position: static; max-width: 600px; margin: 0 auto; }
	}

	@media (max-width: 768px) {
		.author-card { flex-direction: column; text-align: center; gap: 1.25rem; }
		.author-avatar-wrapper { margin: 0 auto; width: 120px; height: 120px; }
		.author-info { text-align: center; }
		.values-grid, .tech-grid { grid-template-columns: 1fr; }
		.timeline::before { left: 20px; }
		.timeline-dot { left: 20px; }
		.timeline-card { width: calc(100% - 50px); margin-left: 50px !important; }
		.milestone-split { flex-direction: column; }
		.milestone-img-pane { flex: none; max-height: 200px; }
		.milestone-content-pane { max-height: none; }
	}
</style>
