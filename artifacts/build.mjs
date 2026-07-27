#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  Nội tuyến hoá Artifact — CW-400 / CW-410
// ═══════════════════════════════════════════════════════════════════
// Artifact dán vào claude.ai phải là MỘT file và không import được gì
// ngoài `react`. Nhưng hợp đồng và lõi quyết định phải test được, nên
// chúng sống trong `lib/*.mjs`. Script này ghép hai thế giới đó lại:
// mỗi dấu `// @inline <đường dẫn>` trong `src/*.jsx` được thay bằng nội
// dung module, sau khi gỡ `export` và các import tương đối.
//
// Nhờ vậy chỉ có một nguồn sự thật. `dist/` là bản sinh ra — sửa ở
// `src/` và `lib/` rồi chạy lại, đừng sửa thẳng vào `dist/`.
//
//   node artifacts/build.mjs         # sinh lại dist/
//   node artifacts/build.mjs --check # chỉ báo dist/ có lệch không

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const TARGETS = ["story-architect", "chapter-writer"];

const INLINE_MARK = /^[ \t]*\/\/[ \t]*@inline[ \t]+(\S+)[ \t]*$/gm;
const RELATIVE_IMPORT = /^import[\s\S]*?from\s+"\.\/[^"]*";[ \t]*\r?\n?/gm;
const EXPORT_KEYWORD = /^export[ \t]+(?=(const|let|function|class|async)\b)/gm;

/** Đọc một module lib và biến nó thành đoạn mã dán thẳng được. */
function inlineModule(path) {
  const body = readFileSync(path, "utf8");
  const stripped = body.replace(RELATIVE_IMPORT, "").replace(EXPORT_KEYWORD, "");
  if (/^export\b/m.test(stripped)) {
    throw new Error(`${path}: còn câu lệnh export không gỡ được (chỉ hỗ trợ export khai báo)`);
  }
  return stripped.trimEnd();
}

export function renderArtifact(name) {
  const source = readFileSync(join(here, "src", `${name}.jsx`), "utf8");
  let count = 0;
  const rendered = source.replace(INLINE_MARK, (_, relative) => {
    count += 1;
    const banner = `/* ── nội tuyến từ ${relative} — sinh bởi artifacts/build.mjs, đừng sửa ở đây ── */`;
    return `${banner}\n${inlineModule(resolve(here, "src", relative))}`;
  });
  if (count === 0) throw new Error(`src/${name}.jsx không có dấu @inline nào — build sai file?`);
  return `${rendered.trimEnd()}\n`;
}

export function distPath(name) {
  return join(here, "dist", `${name}.jsx`);
}

function main() {
  const checkOnly = process.argv.includes("--check");
  mkdirSync(join(here, "dist"), { recursive: true });
  let stale = 0;

  for (const name of TARGETS) {
    const rendered = renderArtifact(name);
    const target = distPath(name);
    let current = null;
    try {
      current = readFileSync(target, "utf8");
    } catch {
      current = null;
    }
    if (current === rendered) {
      console.log(`  đã khớp  dist/${name}.jsx`);
      continue;
    }
    if (checkOnly) {
      stale += 1;
      console.error(`  LỆCH     dist/${name}.jsx — chạy \`node artifacts/build.mjs\``);
      continue;
    }
    writeFileSync(target, rendered, "utf8");
    console.log(`  đã ghi   dist/${name}.jsx (${rendered.length} ký tự)`);
  }

  if (stale > 0) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
