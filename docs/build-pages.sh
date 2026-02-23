#!/bin/bash
# Build GitLab Pages from GUIDE.md
set -e
cd "$(dirname "$0")"

OUTDIR="../public"
mkdir -p "$OUTDIR/images"

# Convert markdown to HTML
echo "Converting GUIDE.md to HTML..."
CONTENT=$(cd /tmp && /home/ihoner/.nvm/versions/node/v22.21.1/bin/npx --yes marked --gfm < "$OLDPWD/GUIDE.md")

# Copy images
cp images/*.png "$OUTDIR/images/" 2>/dev/null || true

# Write HTML with cyberpunk template
cat > "$OUTDIR/index.html" << 'HEADER'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cortex Documentation</title>
  <style>
    :root {
      --bg: #0a0e1a; --bg2: #111827; --card: #1a1f2e; --code-bg: #151b2d;
      --text: #e2e8f0; --text2: #94a3b8; --muted: #64748b;
      --accent: #7c4dff; --cyan: #22d3ee; --green: #10b981;
      --orange: #f59e0b; --red: #ef4444; --border: #1e293b;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      background: var(--bg); color: var(--text); line-height: 1.7; font-size: 16px;
    }
    .layout { display: flex; min-height: 100vh; }
    .sidebar {
      width: 280px; background: var(--bg2); border-right: 1px solid var(--border);
      padding: 20px 12px; position: fixed; top: 0; left: 0; bottom: 0;
      overflow-y: auto; z-index: 10;
    }
    .sidebar-hdr {
      display: flex; align-items: center; gap: 10px;
      padding-bottom: 16px; border-bottom: 1px solid var(--border); margin-bottom: 12px;
    }
    .sidebar-hdr .logo {
      font-size: 22px; font-weight: 700;
      background: linear-gradient(135deg, var(--cyan), var(--accent));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .sidebar-hdr .badge {
      font-size: 11px; padding: 2px 8px; border-radius: 12px;
      background: var(--accent); color: white; font-weight: 600;
    }
    .toc { list-style: none; }
    .toc li { margin-bottom: 1px; }
    .toc a {
      display: block; padding: 5px 10px; color: var(--text2); text-decoration: none;
      border-radius: 5px; font-size: 13px; transition: all 0.15s;
    }
    .toc a:hover { background: var(--card); color: var(--cyan); }
    .toc .h2 { padding-left: 10px; font-weight: 600; color: var(--text); font-size: 14px; }
    .toc .h3 { padding-left: 24px; font-size: 12px; }
    .main {
      margin-left: 280px; flex: 1; max-width: 880px; padding: 36px 44px 80px;
    }
    h1 {
      font-size: 2.4rem; font-weight: 800;
      background: linear-gradient(135deg, var(--cyan), var(--accent));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      margin-bottom: 8px; line-height: 1.2;
    }
    h2 {
      font-size: 1.65rem; font-weight: 700; color: var(--cyan);
      margin-top: 48px; margin-bottom: 14px; padding-bottom: 6px;
      border-bottom: 2px solid #7c4dff40;
    }
    h3 { font-size: 1.2rem; font-weight: 600; color: var(--text); margin-top: 28px; margin-bottom: 10px; }
    h4 { font-size: 1.05rem; font-weight: 600; color: var(--accent); margin-top: 20px; margin-bottom: 6px; }
    p { margin-bottom: 14px; }
    a { color: var(--cyan); text-decoration: none; border-bottom: 1px solid transparent; transition: 0.15s; }
    a:hover { border-bottom-color: var(--cyan); }
    ul, ol { margin-bottom: 14px; padding-left: 22px; }
    li { margin-bottom: 5px; }
    li strong { color: var(--cyan); }
    code {
      font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.88em;
      background: var(--code-bg); padding: 2px 5px; border-radius: 3px;
      color: var(--cyan); border: 1px solid var(--border);
    }
    pre {
      background: var(--code-bg); border: 1px solid var(--border);
      border-radius: 8px; padding: 14px 18px; overflow-x: auto; margin-bottom: 18px;
    }
    pre code { background: none; border: none; padding: 0; color: var(--text); font-size: 0.84em; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 0.88em; }
    th {
      background: var(--card); color: var(--cyan); font-weight: 600;
      text-align: left; padding: 8px 12px; border: 1px solid var(--border);
    }
    td { padding: 7px 12px; border: 1px solid var(--border); }
    tr:nth-child(even) td { background: var(--bg2); }
    tr:hover td { background: var(--card); }
    img {
      max-width: 100%; border-radius: 10px; border: 2px solid var(--border);
      margin: 14px 0; box-shadow: 0 4px 20px rgba(0,0,0,0.4); transition: 0.2s;
    }
    img:hover { transform: scale(1.01); box-shadow: 0 8px 32px rgba(124,77,255,0.2); border-color: var(--accent); }
    blockquote {
      border-left: 4px solid var(--accent); background: var(--card);
      padding: 14px 18px; margin: 14px 0; border-radius: 0 8px 8px 0;
    }
    blockquote p { margin-bottom: 6px; color: var(--text2); }
    blockquote p:last-child { margin-bottom: 0; }
    hr { border: none; border-top: 1px solid var(--border); margin: 36px 0; }
    .top-btn {
      position: fixed; bottom: 20px; right: 20px; width: 42px; height: 42px;
      background: var(--accent); color: white; border: none; border-radius: 50%;
      font-size: 18px; cursor: pointer; opacity: 0; transition: 0.3s; z-index: 20;
      display: flex; align-items: center; justify-content: center;
    }
    .top-btn.on { opacity: 1; }
    .top-btn:hover { background: var(--cyan); }
    @media (max-width: 768px) {
      .sidebar { display: none; }
      .main { margin-left: 0; padding: 20px 16px; }
      h1 { font-size: 1.8rem; }
      h2 { font-size: 1.3rem; }
    }
    ::-webkit-scrollbar { width: 7px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--accent); }
  </style>
</head>
<body>
<div class="layout">
  <nav class="sidebar"><div class="sidebar-hdr"><span class="logo">🦞 Cortex</span><span class="badge">DOCS</span></div><ul class="toc" id="toc"></ul></nav>
  <main class="main" id="content">
HEADER

echo "$CONTENT" >> "$OUTDIR/index.html"

cat >> "$OUTDIR/index.html" << 'FOOTER'
  </main>
</div>
<button class="top-btn" id="top" onclick="scrollTo({top:0,behavior:'smooth'})">↑</button>
<script>
const toc=document.getElementById('toc');
document.querySelectorAll('#content h2,#content h3').forEach((h,i)=>{
  if(!h.id)h.id='s'+i;
  const li=document.createElement('li');
  const a=document.createElement('a');
  a.href='#'+h.id;a.textContent=h.textContent;
  a.className=h.tagName.toLowerCase();
  li.appendChild(a);toc.appendChild(li);
});
const b=document.getElementById('top');
addEventListener('scroll',()=>b.classList.toggle('on',scrollY>300));
</script>
</body>
</html>
FOOTER

echo "✅ Built → $OUTDIR/index.html ($(du -sh "$OUTDIR/index.html" | cut -f1))"
echo "   Images: $(ls "$OUTDIR/images/"*.png 2>/dev/null | wc -l) files"
