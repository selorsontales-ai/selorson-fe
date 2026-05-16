<script lang="ts">
	import { setLocale, getLocale } from '$lib/paraglide/runtime.js';

	function toggleLanguage() {
		const newLang = getLocale() === 'vi' ? 'en' : 'vi';
		// setLocale changes the language and reloads the page (or navigates) by default
		setLocale(newLang);
	}
</script>

<button 
	class="lang-toggle" 
	onclick={toggleLanguage} 
	title={getLocale() === 'vi' ? 'Switch to English' : 'Đổi sang Tiếng Việt'}
>
	{getLocale() === 'vi' ? 'EN' : 'VI'}
</button>

<style>
	.lang-toggle {
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md);
		width: 34px;
		height: 34px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--color-text-secondary);
		transition: all 0.25s ease;
		flex-shrink: 0;
	}
	.lang-toggle:hover {
		border-color: var(--color-brand-500);
		background: rgba(12, 113, 61, 0.1);
		color: var(--color-brand-300);
	}
</style>
