import { getLocale } from '$lib/paraglide/runtime';
import * as m from '$lib/paraglide/messages';

export type AppLocale = 'vi' | 'en' | string;

const DATE_LOCALE_MAP: Record<string, string> = {
	vi: 'vi-VN',
	en: 'en-US',
	ja: 'ja-JP',
	ko: 'ko-KR',
	zh: 'zh-CN',
	fr: 'fr-FR'
};

export function currentLocale(): AppLocale {
	try {
		return getLocale() || 'vi';
	} catch {
		return 'vi';
	}
}

export function dateLocale(): string {
	const loc = currentLocale();
	return DATE_LOCALE_MAP[loc] || loc;
}

export function formatRoleBadge(role?: string | null, withIcon = true): string {
	const r = (role || '').toLowerCase();
	if (r === 'admin') {
		return withIcon ? m.role_admin_badge() : m.role_admin_short();
	}
	if (r === 'manager') {
		return withIcon ? m.role_manager_badge() : m.role_manager_short();
	}
	return withIcon ? m.role_reader_badge() : m.role_reader_short();
}

const READER_RANK_GETTERS: Record<string, () => string> = {
	admin: () => m.rank_admin(),
	manager: () => m.rank_manager(),
	legend: () => m.rank_legend(),
	scholar: () => m.rank_scholar(),
	explorer: () => m.rank_explorer(),
	reader: () => m.rank_reader(),
	novice: () => m.rank_novice(),
	// Fallback match by Vietnamese title returned from backend
	'quản trị viên': () => m.rank_admin(),
	'điều phối viên': () => m.rank_manager(),
	'quản lý': () => m.rank_manager(),
	'huyền thoại selorson': () => m.rank_legend(),
	'học giả thư viện': () => m.rank_scholar(),
	'nhà thám hiểm akunalia': () => m.rank_explorer(),
	'độc giả nhiệt thành': () => m.rank_reader(),
	'tân lữ khách': () => m.rank_novice()
};

export function formatReaderRank(
	rankOrTitle?: string | null,
	fallbackRole?: string | null
): string {
	const key = (rankOrTitle || '').trim().toLowerCase();
	if (key && READER_RANK_GETTERS[key]) {
		return READER_RANK_GETTERS[key]();
	}
	const roleKey = (fallbackRole || '').trim().toLowerCase();
	if (roleKey === 'admin' || roleKey === 'manager') {
		return READER_RANK_GETTERS[roleKey]();
	}
	if (rankOrTitle && rankOrTitle.trim()) {
		return rankOrTitle;
	}
	return m.rank_novice();
}

const CATEGORY_META: Record<string, { label: () => string; icon: string }> = {
	character: { label: () => m.cat_character(), icon: '👤' },
	location: { label: () => m.cat_location(), icon: '🗺️' },
	item: { label: () => m.cat_item(), icon: '⚔️' },
	organization: { label: () => m.cat_organization(), icon: '🏛️' },
	faction: { label: () => m.cat_faction(), icon: '🚩' },
	concept: { label: () => m.cat_concept(), icon: '✨' },
	event: { label: () => m.cat_event(), icon: '📜' },
	creature: { label: () => m.cat_creature(), icon: '🐉' },
	skill: { label: () => m.cat_skill(), icon: '⚡' },
	race: { label: () => m.cat_race(), icon: '🧬' },
	history: { label: () => m.cat_history(), icon: '⏳' },
	other: { label: () => m.cat_other(), icon: '📌' }
};

export function formatCategoryLabel(category?: string | null, withIcon = false): string {
	const key = (category || '').trim().toLowerCase();
	const found = CATEGORY_META[key];
	if (found) {
		const label = found.label();
		return withIcon ? `${found.icon} ${label}` : label;
	}
	if (!category) return m.cat_entry_default();
	return category;
}

const ENTRY_ROLE_GETTERS: Record<string, () => string> = {
	protagonist: () => m.entry_role_protagonist(),
	deuteragonist: () => m.entry_role_deuteragonist(),
	antagonist: () => m.entry_role_antagonist(),
	supporting: () => m.entry_role_supporting(),
	mentor: () => m.entry_role_mentor(),
	major: () => m.entry_role_major(),
	minor: () => m.entry_role_minor(),
	boss: () => m.entry_role_boss(),
	artifact: () => m.entry_role_artifact()
};

export function formatEntryRoleLabel(role?: string | null): string {
	const key = (role || '').trim().toLowerCase();
	const found = ENTRY_ROLE_GETTERS[key];
	if (found) {
		return found();
	}
	return role || '';
}

export function formatNotificationContextLabel(label?: string | null, targetType?: string | null): string {
	if (!label) return '';
	if (currentLocale() === 'vi') return label;

	const trimmed = label.trim();
	const chapterMatch = trimmed.match(/^Chương\s+(\d+)(.*)$/i);
	if (chapterMatch) {
		return m.notif_ctx_chapter({ num: chapterMatch[1], rest: chapterMatch[2] || '' });
	}
	const videoMatch = trimmed.match(/^Tập phim\s+#(\d+)(.*)$/i);
	if (videoMatch) {
		return m.notif_ctx_episode({ num: videoMatch[1], rest: videoMatch[2] || '' });
	}
	if (trimmed === 'Trang Hồ Sơ Cá Nhân') return m.notif_ctx_profile();
	if (trimmed === 'Hệ thống Selorson') return m.notif_ctx_system();
	if (trimmed === 'Bình chọn Cộng đồng') return m.notif_ctx_poll();
	if (trimmed === 'Truyện chữ & Manga') return m.notif_ctx_stories();
	if (trimmed === 'Tập phim') return m.notif_ctx_video();
	if (trimmed === 'Bình luận') return m.notif_ctx_comment();

	if (targetType === 'chapter') return trimmed.replace(/^Chương\s+/i, m.notif_ctx_chapter_prefix());
	return trimmed;
}

export function formatNotificationText(item: {
	type?: string;
	title?: string;
	description?: string;
	actor_name?: string | null;
	context_label?: string | null;
	target_type?: string | null;
}): { title: string; description: string; context_label: string } {
	const rawTitle = item.title || '';
	const rawDesc = item.description || '';
	const contextLabel = formatNotificationContextLabel(item.context_label, item.target_type);

	if (currentLocale() === 'vi') {
		return {
			title: rawTitle,
			description: rawDesc,
			context_label: contextLabel
		};
	}

	const actor =
		item.actor_name?.trim() ||
		rawTitle
			.replace(/\s+đã phản hồi bình luận của bạn.*$/i, '')
			.replace(/\s+đã thả tim bình luận của bạn.*$/i, '')
			.replace(/\s+đã bắt đầu theo dõi bạn.*$/i, '')
			.trim() ||
		m.notif_actor_default();

	let title = rawTitle;
	let description = rawDesc.replace(/\[🔒\s*Nội dung ẩn Spoiler\]/gi, m.notif_hidden_spoiler());

	switch (item.type) {
		case 'comment_reply':
			title = m.notif_reply_title({ actor });
			break;
		case 'comment_like':
			title = m.notif_like_title({ actor });
			if (description === 'Bình luận của bạn nhận được thêm lượt yêu thích.') {
				description = m.notif_like_desc();
			}
			break;
		case 'new_follower':
			title = m.notif_follow_title({ actor });
			if (description === 'Nhấn để ghé thăm hồ sơ của độc giả này.') {
				description = m.notif_follow_desc();
			}
			break;
		case 'new_chapter': {
			const matched = rawTitle.match(/^Chương\s+(\d+)\s+vừa xuất bản:\s*(.+)$/i);
			if (matched) {
				title = m.notif_new_chapter_title({ num: matched[1], title: matched[2] });
			}
			if (description === 'Nhấn để đọc ngay chương mới nhất trên Selorson.') {
				description = m.notif_new_chapter_desc();
			}
			break;
		}
		case 'poll':
			if (description === 'Tham gia bình chọn ngay!') {
				description = m.notif_poll_desc();
			}
			break;
		default:
			break;
	}

	return {
		title,
		description,
		context_label: contextLabel
	};
}
