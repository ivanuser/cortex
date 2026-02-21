/**
 * Markdown renderer — marked + shiki + KaTeX + Mermaid with XSS protection
 */
import { Marked, Renderer } from 'marked';
import type { Highlighter } from 'shiki';
import DOMPurify from 'dompurify';
import { browser } from '$app/environment';

// Heavy deps (shiki, katex, mermaid) are loaded dynamically on first use

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Global highlighter instance
let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['github-dark-default'],
        langs: [
          'javascript',
          'typescript',
          'python', 
          'rust',
          'go',
          'java',
          'html',
          'css',
          'json',
          'yaml',
          'bash',
          'sql',
          'markdown',
          'svelte'
        ]
      })
    );
  }
  return highlighterPromise;
}

// Lazy mermaid loader — only imported when a diagram is encountered
let mermaidPromise: Promise<typeof import('mermaid')['default']> | null = null;

async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: m }) => {
      m.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          primaryColor: '#00e5ff',
          primaryTextColor: '#e2e8f0',
          primaryBorderColor: '#1e293b',
          lineColor: '#64748b',
          secondaryColor: '#7c4dff',
          tertiaryColor: '#0a0e1a',
          background: '#0a0e1a',
          mainBkg: '#111827',
          secondBkg: '#1a1f35',
          tertiaryBkg: '#0d1220'
        }
      });
      return m;
    });
  }
  return mermaidPromise;
}

// KaTeX math rendering extension
const mathExtension = {
  name: 'math',
  level: 'inline',
  start(src: string) { return src.indexOf('$'); },
  tokenizer(src: string) {
    // Block math $$...$$
    const blockMatch = src.match(/^\$\$([^$]+)\$\$/);
    if (blockMatch) {
      return {
        type: 'math',
        raw: blockMatch[0],
        text: blockMatch[1].trim(),
        displayMode: true
      };
    }
    
    // Inline math $...$
    const inlineMatch = src.match(/^\$([^$\n]+)\$/);
    if (inlineMatch) {
      return {
        type: 'math',
        raw: inlineMatch[0], 
        text: inlineMatch[1].trim(),
        displayMode: false
      };
    }
  },
  renderer(token: any) {
    // Render a placeholder; actual KaTeX rendering happens in postProcessMarkdown
    const encoded = encodeURIComponent(token.text);
    const displayAttr = token.displayMode ? 'true' : 'false';
    if (token.displayMode) {
      return `<div class="katex-placeholder" data-math="${encoded}" data-display="${displayAttr}"><span class="text-text-muted text-xs">Loading math…</span></div>`;
    }
    return `<span class="katex-placeholder" data-math="${encoded}" data-display="${displayAttr}">⋯</span>`;
  }
};

// Custom renderer
const renderer = new Renderer();

renderer.code = function({ text, lang }: { text: string; lang?: string }) {
  const language = lang || '';
  
  // Handle mermaid diagrams
  if (language === 'mermaid') {
    const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
    return `<div class="mermaid-wrapper">
      <div class="mermaid" data-diagram="${escapeHtml(text)}" id="${id}">
        <!-- Mermaid will render here -->
      </div>
    </div>`;
  }

  // For other languages, we'll use a placeholder that gets replaced post-render
  // since shiki is async and marked expects sync in this context
  const copyHandler = `navigator.clipboard.writeText(decodeURIComponent(this.dataset.code)).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})`;
  const header = language
    ? `<div class="code-block-header"><span>${escapeHtml(language)}</span><button class="copy-btn" onclick="${copyHandler}" data-code="${encodeURIComponent(text)}">Copy</button></div>`
    : '';

  return `<div class="code-wrapper">${header}<pre><code class="shiki-code" data-lang="${escapeHtml(language)}" data-code="${escapeHtml(text)}">${escapeHtml(text)}</code></pre></div>`;
};

renderer.link = function({ href, title, text }: { href: string; title?: string | null; text: string }) {
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

renderer.table = function(token: any) {
  return `<div class="table-wrapper overflow-x-auto"><table>${token.header}${token.body}</table></div>`;
};

// Image optimization: lazy loading + async decoding
renderer.image = function({ href, title, text }: { href: string; title?: string | null; text: string }) {
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  const altAttr = text ? ` alt="${escapeHtml(text)}"` : '';
  return `<img src="${escapeHtml(href)}"${altAttr}${titleAttr} loading="lazy" decoding="async" />`;
};

const marked = new Marked({
  renderer,
  gfm: true,
  breaks: true,
  extensions: [mathExtension]
});

export function renderMarkdownSync(raw: string): string {
  try {
    const result = marked.parse(raw);
    if (result instanceof Promise) {
      // Shouldn't happen with sync extensions, but safeguard
      return escapeHtml(raw);
    }
    const htmlString = typeof result === 'string' ? result : String(result);
    
    // Sanitize HTML with DOMPurify to prevent XSS
    if (browser && typeof window !== 'undefined') {
      return DOMPurify.sanitize(htmlString, {
        ADD_TAGS: ['iframe', 'svg'],
        ADD_ATTR: ['target', 'rel', 'data-code', 'data-lang', 'data-diagram', 'data-math', 'data-display', 'loading', 'decoding'],
        ALLOW_DATA_ATTR: true
      });
    }
    return htmlString;
  } catch {
    return escapeHtml(raw);
  }
}

export async function renderMarkdown(raw: string): Promise<string> {
  try {
    const result = await marked.parse(raw);
    const htmlString = typeof result === 'string' ? result : String(result);
    
    // Sanitize HTML with DOMPurify to prevent XSS
    if (browser && typeof window !== 'undefined') {
      return DOMPurify.sanitize(htmlString, {
        ADD_TAGS: ['iframe', 'svg'],
        ADD_ATTR: ['target', 'rel', 'data-code', 'data-lang', 'data-diagram', 'data-math', 'data-display', 'loading', 'decoding'],
        ALLOW_DATA_ATTR: true
      });
    }
    return htmlString;
  } catch {
    return escapeHtml(raw);
  }
}

// Post-process function to handle shiki highlighting and mermaid rendering
export async function postProcessMarkdown(html: string): Promise<string> {
  let processed = html;
  
  // Handle shiki code highlighting
  if (browser) {
    const highlighter = await getHighlighter();
    const codeBlocks = processed.match(/<code class="shiki-code"[^>]*>[\s\S]*?<\/code>/g);
    
    if (codeBlocks) {
      for (const block of codeBlocks) {
        const langMatch = block.match(/data-lang="([^"]*)"/);
        const codeMatchResult = block.match(/data-code="([^"]*)"/);
        const codeMatch = codeMatchResult?.[1];
        
        if (codeMatch) {
          const lang = langMatch?.[1] || 'text';
          const code = decodeURIComponent(codeMatch);
          
          try {
            const highlighted = highlighter.codeToHtml(code, {
              lang: lang,
              theme: 'github-dark-default'
            });
            // Extract just the inner HTML from shiki's output
            const innerMatch = highlighted.match(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/);
            if (innerMatch) {
              const newBlock = block.replace(
                /<code class="shiki-code"[^>]*>[\s\S]*?<\/code>/,
                `<code class="shiki">${innerMatch[1]}</code>`
              );
              processed = processed.replace(block, newBlock);
            }
          } catch {
            // Keep original if highlighting fails
          }
        }
      }
    }
    
    // Handle KaTeX math placeholders — lazy-load katex only when math is found
    const mathPlaceholders = processed.match(/<(?:div|span) class="katex-placeholder"[^>]*>[\s\S]*?<\/(?:div|span)>/g);
    if (mathPlaceholders) {
      const katex = (await import('katex')).default;
      for (const block of mathPlaceholders) {
        const mathMatch = block.match(/data-math="([^"]*)"/);
        const displayMatch = block.match(/data-display="([^"]*)"/);
        if (mathMatch) {
          const math = decodeURIComponent(mathMatch[1]);
          const displayMode = displayMatch?.[1] === 'true';
          try {
            const rendered = katex.renderToString(math, {
              displayMode,
              throwOnError: false,
              errorColor: '#f43f9e',
              trust: true
            });
            processed = processed.replace(block, rendered);
          } catch {
            processed = processed.replace(block, `<code class="math-error">${escapeHtml(math)}</code>`);
          }
        }
      }
    }

    // Handle mermaid diagrams — lazy-load mermaid only when diagrams are found
    const mermaidBlocks = processed.match(/<div class="mermaid"[^>]*>[\s\S]*?<\/div>/g);
    if (mermaidBlocks) {
      const mermaid = await getMermaid();
      for (const block of mermaidBlocks) {
        const diagramMatchResult = block.match(/data-diagram="([^"]*)"/);
        const diagramMatch = diagramMatchResult?.[1];
        const idMatchResult = block.match(/id="([^"]*)"/);
        const idMatch = idMatchResult?.[1];
        
        if (diagramMatch && idMatch) {
          const diagram = decodeURIComponent(diagramMatch);
          
          try {
            const { svg } = await mermaid.render(idMatch, diagram);
            const newBlock = `<div class="mermaid-rendered">${svg}</div>`;
            processed = processed.replace(block, newBlock);
          } catch (error) {
            console.warn('Mermaid rendering failed:', error);
            const errorBlock = `<div class="mermaid-error">
              <p>Mermaid diagram could not be rendered</p>
              <pre><code>${escapeHtml(diagram)}</code></pre>
            </div>`;
            processed = processed.replace(block, errorBlock);
          }
        }
      }
    }
  }
  
  // Final sanitization of processed HTML
  if (browser && typeof window !== 'undefined') {
    return DOMPurify.sanitize(processed, {
      ADD_TAGS: ['iframe', 'svg'],
      ADD_ATTR: ['target', 'rel', 'data-code', 'data-lang', 'data-diagram', 'data-math', 'data-display', 'viewBox', 'xmlns', 'loading', 'decoding'],
      ALLOW_DATA_ATTR: true
    });
  }
  return processed;
}
