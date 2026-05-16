<script lang="ts">
	import { api } from '$lib/api';
	import * as m from '$lib/paraglide/messages';

	let form = $state({ name: '', email: '', subject: '', message: '' });
	let loading = $state(false);
	let sent = $state(false);
	let error = $state('');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		if (!form.name || !form.email || !form.message) {
			error = 'Vui lòng điền đầy đủ thông tin';
			return;
		}
		loading = true;
		try {
			await api('/public/contact', { method: 'POST', body: form });
			sent = true;
		} catch (err: any) {
			error = err.message || 'Có lỗi xảy ra, vui lòng thử lại';
		}
		loading = false;
	}
</script>

<svelte:head>
	<title>{m.contact_title()} — Selorson</title>
	<meta name="description" content={m.contact_subtitle()} />
</svelte:head>

<div class="contact-page">
	<div class="contact-header">
		<h1>{m.contact_title()}</h1>
		<p class="subtitle">{m.contact_subtitle()}</p>
	</div>

	{#if sent}
		<div class="success-card glass-card">
			<span class="success-icon">✅</span>
			<h2>{m.contact_success()}</h2>
			<p></p>
			<button class="btn-brand" onclick={() => { sent = false; form = { name: '', email: '', subject: '', message: '' }; }}>
				{m.contact_send_another()}
			</button>
		</div>
	{:else}
		<form class="contact-form glass-card" onsubmit={handleSubmit}>
			{#if error}<div class="msg error">{error}</div>{/if}

			<div class="form-row">
				<label>
					<span>{m.contact_label_name()}</span>
					<input type="text" bind:value={form.name} placeholder={m.contact_ph_name()} />
				</label>
				<label>
					<span>{m.contact_label_email()}</span>
					<input type="email" bind:value={form.email} placeholder="email@example.com" />
				</label>
			</div>

			<label>
				<span>{m.contact_label_subject()}</span>
				<input type="text" bind:value={form.subject} placeholder={m.contact_ph_subject()} />
			</label>

			<label>
				<span>{m.contact_label_message()}</span>
				<textarea bind:value={form.message} rows="5" placeholder={m.contact_ph_message()}></textarea>
			</label>

			<button type="submit" class="btn-brand" disabled={loading}>
				{loading ? m.contact_btn_sending() : m.contact_btn_send()}
			</button>
		</form>

		<div class="contact-info">
			<div class="info-item">
				<span>📧</span>
				<span>contact@selorson.com</span>
			</div>
			<div class="info-item">
				<span>🌐</span>
				<span>selorson.com</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.contact-page { max-width: 640px; margin: 0 auto; padding: 2rem 1rem 4rem; }
	.contact-header { text-align: center; margin-bottom: 2rem; }
	h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem; }
	.subtitle { color: var(--color-text-muted); font-size: 0.9rem; }

	.success-card { text-align: center; padding: 3rem 2rem; }
	.success-icon { font-size: 2.5rem; display: block; margin-bottom: 0.75rem; }
	.success-card h2 { font-size: 1.25rem; margin-bottom: 0.5rem; }
	.success-card p { color: var(--color-text-muted); font-size: 0.9rem; margin-bottom: 1.5rem; }

	.contact-form { padding: 1.75rem; }
	.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
	label { display: block; margin-bottom: 0.75rem; }
	label span { display: block; font-size: 0.82rem; font-weight: 500; color: var(--color-text-muted); margin-bottom: 0.25rem; }
	input, textarea { width: 100%; padding: 0.6rem 0.75rem; background: var(--color-surface-200); border: 1px solid rgba(255,255,255,.08); border-radius: var(--radius-sm); color: var(--color-text-primary); font-family: inherit; font-size: 0.88rem; }
	input:focus, textarea:focus { outline: none; border-color: var(--color-brand-500); }
	textarea { resize: vertical; min-height: 100px; }
	.msg.error { font-size: .82rem; padding: .5rem .75rem; border-radius: var(--radius-sm); margin-bottom: .75rem; background: rgba(239,68,68,.1); color: #f87171; border: 1px solid rgba(239,68,68,.2); }

	.contact-info { display: flex; justify-content: center; gap: 2rem; margin-top: 2rem; }
	.info-item { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: var(--color-text-muted); }

	@media (max-width: 500px) { .form-row { grid-template-columns: 1fr; } }
</style>
