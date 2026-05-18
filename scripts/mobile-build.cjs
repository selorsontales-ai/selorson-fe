/**
 * Mobile Build Script
 * 
 * Temporarily removes +page.server.ts files during mobile builds.
 * These files require a runtime server (unavailable in Capacitor SPA mode).
 * They are restored after the build completes.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// All +page.server.ts files that import server-only modules
const serverFiles = [
    'src/routes/(app)/settings/+page.server.ts',
    'src/routes/(app)/profile/[id]/+page.server.ts',
    'src/routes/(app)/messages/+page.server.ts'
];

const backed = [];

// Backup: rename +page.server.ts → +page.server.ts.bak
serverFiles.forEach(f => {
    const full = path.join(ROOT, f);
    if (fs.existsSync(full)) {
        fs.renameSync(full, full + '.bak');
        backed.push(full);
        console.log(`  ↳ Disabled: ${f}`);
    }
});

// Clear SvelteKit cache so it regenerates route manifest without server loads
const svelteKitDir = path.join(ROOT, '.svelte-kit');
if (fs.existsSync(svelteKitDir)) {
    fs.rmSync(svelteKitDir, { recursive: true, force: true });
    console.log('  ↳ Cleared .svelte-kit cache');
}

console.log(`\n🔨 Building mobile (adapter-static)...\n`);

try {
    execSync('npx cross-env BUILD_TARGET=mobile VITE_BUILD_TARGET=mobile vite build', {
        stdio: 'inherit',
        cwd: ROOT
    });
    console.log('\n✅ Mobile build successful!');
} finally {
    // Always restore, even if build fails
    backed.forEach(full => {
        const bak = full + '.bak';
        if (fs.existsSync(bak)) {
            fs.renameSync(bak, full);
            console.log(`  ↳ Restored: ${path.relative(ROOT, full)}`);
        }
    });
    console.log('');
}
