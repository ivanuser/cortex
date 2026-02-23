#!/usr/bin/env node
/**
 * Build GitLab Pages from GUIDE.md
 * Converts markdown to styled HTML with table of contents
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public");

// Read markdown
const md = readFileSync(join(__dirname, "GUIDE.md"), "utf-8");

// Configure marked
marked.setOptions({
  gfm: true,
  breaks: false,
});

// Generate HTML from markdown
const content = marked.parse(md);

// HTML template with cyberpunk styling
const html = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cortex Documentation</title>
  <style>
    :root {
      --bg-primary: #0a0e1a;
      --bg-secondary: #111827;
      --bg-card: #1a1f2e;
      --bg-code: #151b2d;
      --text-primary: #e2e8f0;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --accent: #7c4dff;
      --accent-cyan: #22d3ee;
      --accent-green: #10b981;
      --accent-orange: #f59e0b;
      --accent-red: #ef4444;
      --border: #1e293b;
      --border-accent: #7c4dff40;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.7;
      font-size: 16px;
    }

    .layout {
      display: flex;
      min-height: 100vh;
    }

    /* Sidebar / TOC */
    .sidebar {
      width: 300px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border);
      padding: 24px 16px;
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      overflow-y: auto;
      z-index: 10;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }

    .sidebar-header .logo {
      font-size: 24px;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent-cyan), var(--accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .sidebar-header .badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 12px;
      background: var(--accent);
      color: white;
      font-weight: 600;
    }

    .toc { list-style: none; }
    .toc li { margin-bottom: 2px; }
    .toc a {
      display: block;
      padding: 6px 12px;
      color: var(--text-secondary);
      text-decoration: none;
      border-radius: 6px;
      font-size: 14px;
      transition: all 0.15s;
    }
    .toc a:hover {
      background: var(--bg-card);
      color: var(--accent-cyan);
    }
    .toc .toc-h2 { padding-left: 12px; font-weight: 600; color: var(--text-primary); }
    .toc .toc-h3 { padding-left: 28px; font-size: 13px; }

    /* Main content */
    .main {
      margin-left: 300px;
      flex: 1;
      max-width: 900px;
      padding: 40px 48px 80px;
    }

    /* Typography */
    h1 {
      font-size: 2.5rem;
      font-weight: 800;
      background: linear-gradient(135deg, var(--accent-cyan), var(--accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
      line-height: 1.2;
    }

    h2 {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--accent-cyan);
      margin-top: 56px;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--border-accent);
    }

    h3 {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-top: 32px;
      margin-bottom: 12px;
    }

    h4 {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--accent);
      margin-top: 24px;
      margin-bottom: 8px;
    }

    p { margin-bottom: 16px; color: var(--text-primary); }

    a {
      color: var(--accent-cyan);
      text-decoration: none;
      border-bottom: 1px solid transparent;
      transition: border-color 0.15s;
    }
    a:hover { border-bottom-color: var(--accent-cyan); }

    /* Lists */
    ul, ol {
      margin-bottom: 16px;
      padding-left: 24px;
    }
    li {
      margin-bottom: 6px;
      color: var(--text-primary);
    }
    li strong { color: var(--accent-cyan); }

    /* Code */
    code {
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.9em;
      background: var(--bg-code);
      padding: 2px 6px;
      border-radius: 4px;
      color: var(--accent-cyan);
      border: 1px solid var(--border);
    }

    pre {
      background: var(--bg-code);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px 20px;
      overflow-x: auto;
      margin-bottom: 20px;
    }

    pre code {
      background: none;
      border: none;
      padding: 0;
      color: var(--text-primary);
      font-size: 0.85em;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 0.9em;
    }

    th {
      background: var(--bg-card);
      color: var(--accent-cyan);
      font-weight: 600;
      text-align: left;
      padding: 10px 14px;
      border: 1px solid var(--border);
    }

    td {
      padding: 8px 14px;
      border: 1px solid var(--border);
      color: var(--text-primary);
    }

    tr:nth-child(even) td { background: var(--bg-secondary); }
    tr:hover td { background: var(--bg-card); }

    /* Images */
    img {
      max-width: 100%;
      border-radius: 10px;
      border: 2px solid var(--border);
      margin: 16px 0;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    img:hover {
      transform: scale(1.02);
      box-shadow: 0 8px 32px rgba(124, 77, 255, 0.2);
      border-color: var(--accent);
    }

    /* Blockquotes */
    blockquote {
      border-left: 4px solid var(--accent);
      background: var(--bg-card);
      padding: 16px 20px;
      margin: 16px 0;
      border-radius: 0 8px 8px 0;
    }

    blockquote p { margin-bottom: 8px; color: var(--text-secondary); }
    blockquote p:last-child { margin-bottom: 0; }

    /* Horizontal rules */
    hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 40px 0;
    }

    /* Mobile */
    @media (max-width: 900px) {
      .sidebar { display: none; }
      .main { margin-left: 0; padding: 24px 20px; }
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: var(--bg-primary); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--accent); }

    /* Back to top */
    .back-to-top {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 44px;
      height: 44px;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 50%;
      font-size: 20px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.3s;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .back-to-top.visible { opacity: 1; }
    .back-to-top:hover { background: var(--accent-cyan); }
  </style>
</head>
<body>
  <div class="layout">
    <nav class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <span class="logo">🦞 Cortex</span>
        <span class="badge">DOCS</span>
      </div>
      <ul class="toc" id="toc"></ul>
    </nav>
    <main class="main" id="main-content">
      ${content}
    </main>
  </div>
  <button class="back-to-top" id="backToTop" onclick="window.scrollTo({top:0,behavior:'smooth'})">↑</button>

  <script>
    // Build TOC from headings
    const toc = document.getElementById('toc');
    const headings = document.querySelectorAll('#main-content h2, #main-content h3');
    headings.forEach((h, i) => {
      const id = h.id || 'section-' + i;
      h.id = id;
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#' + id;
      a.textContent = h.textContent;
      a.className = 'toc-' + h.tagName.toLowerCase();
      li.appendChild(a);
      toc.appendChild(li);
    });

    // Back to top button
    const btn = document.getElementById('backToTop');
    window.addEventListener('scroll', () => {
      btn.classList.toggle('visible', window.scrollY > 400);
    });
  </script>
</body>
</html>`;

// Write output
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "index.html"), html);

// Copy images
const imgSrc = join(__dirname, "images");
const imgDest = join(outDir, "images");
if (existsSync(imgSrc)) {
  cpSync(imgSrc, imgDest, { recursive: true });
}

console.log(`✅ Built pages → ${outDir}/`);
console.log(`   HTML: ${(html.length / 1024).toFixed(1)}KB`);
