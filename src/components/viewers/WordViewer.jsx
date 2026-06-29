import React, { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { getFileExtension } from '@/lib/fileTypes';

const HIGHLIGHT_COLORS = {
  yellow: '#FACC15',
  green:  '#22C55E',
  pink:   '#F472B6',
};

// ── Highlight annotations lên text DOM ───────────────────────────────────────
function applyHighlights(container, annotations) {
  container.querySelectorAll('mark[data-ann-id]').forEach(mark => {
    const text = document.createTextNode(mark.textContent);
    mark.parentNode.replaceChild(text, mark);
  });
  container.normalize();
  if (!annotations?.length) return;

  annotations.forEach(ann => {
    if (!ann.text || ann.text.length < 2) return;
    const color = HIGHLIGHT_COLORS[ann.color] || HIGHLIGHT_COLORS.yellow;
    walkAndHighlight(container, ann.text, ann.id, color);
  });
}

function walkAndHighlight(container, searchText, annId, color) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const tag = node.parentNode?.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
      if (node.parentNode?.dataset?.annId)      return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);

  const lower = searchText.toLowerCase();
  nodes.forEach(textNode => {
    const text = textNode.textContent;
    const idx  = text.toLowerCase().indexOf(lower);
    if (idx === -1) return;

    const mark = document.createElement('mark');
    mark.dataset.annId = annId;
    mark.textContent   = text.slice(idx, idx + searchText.length);
    mark.style.cssText = `background:${color};border-radius:2px;padding:0 1px;`;

    const frag = document.createDocumentFragment();
    if (idx > 0) frag.appendChild(document.createTextNode(text.slice(0, idx)));
    frag.appendChild(mark);
    if (idx + searchText.length < text.length)
      frag.appendChild(document.createTextNode(text.slice(idx + searchText.length)));
    textNode.parentNode.replaceChild(frag, textNode);
  });
}

// ── Search highlight ──────────────────────────────────────────────────────────
function applySearch(container, searchText) {
  container.querySelectorAll('.search-match').forEach(el => {
    const text = document.createTextNode(el.textContent);
    el.parentNode.replaceChild(text, el);
  });
  container.normalize();
  if (!searchText || searchText.trim().length < 2) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const tag = node.parentNode?.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
      if (node.parentNode?.dataset?.annId)      return NodeFilter.FILTER_REJECT;
      if (node.parentNode?.classList?.contains('search-match')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);

  const regex = new RegExp(`(${searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  nodes.forEach(textNode => {
    if (!regex.test(textNode.textContent)) { regex.lastIndex = 0; return; }
    regex.lastIndex = 0;
    const span = document.createElement('span');
    span.innerHTML = textNode.textContent.replace(
      regex,
      '<mark class="search-match" style="background:#FEF08A;border-radius:2px;">$1</mark>'
    );
    textNode.parentNode.replaceChild(span, textNode);
  });
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WordViewer({ file, searchText, annotations = [] }) {
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [rendered, setRendered] = useState(false);
  const containerRef            = useRef(null);
  const isLegacyDoc             = getFileExtension(file.name) === 'doc';

  useEffect(() => {
    if (isLegacyDoc) { setLoading(false); setError('legacy_doc'); return; }
    if (!containerRef.current) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setRendered(false);
    containerRef.current.innerHTML = '';

    const render = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        if (cancelled) return;

        await renderAsync(arrayBuffer, containerRef.current, undefined, {
          className: 'docx-preview',
          inWrapper: false,         // không wrap thêm div ngoài
          ignoreWidth: false,       // giữ đúng page width
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,         // ngắt trang đúng như Word
          useBase64URL: true,       // load ảnh inline
          renderChanges: false,     // ẩn track changes
          renderComments: false,
          renderEndnotes: true,
          renderFootnotes: true,
          renderHeaders: true,
          renderFooters: true,
        });

        if (cancelled) return;
        setRendered(true);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('docx-preview error:', err);
        setError('read_error');
        setLoading(false);
      }
    };
    render();
    return () => { cancelled = true; };
  }, [file]);

  // Apply annotations sau khi render xong
  useEffect(() => {
    if (!rendered || !containerRef.current) return;
    applyHighlights(containerRef.current, annotations);
  }, [rendered, annotations]);

  // Apply search
  useEffect(() => {
    if (!rendered || !containerRef.current) return;
    applySearch(containerRef.current, searchText);
  }, [rendered, searchText]);

  // ── Error states ──────────────────────────────────────────────────────────
  if (error === 'legacy_doc') return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="11" x2="12" y2="17"/>
          <line x1="9" y1="14" x2="15" y2="14"/>
        </svg>
      </div>
      <div>
        <p className="font-semibold text-foreground mb-1">Định dạng .doc chưa được hỗ trợ</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Hãy lưu lại dưới dạng <span className="font-medium">.docx</span> để đọc trên app này.
        </p>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-left w-full max-w-xs">
        <p className="font-medium text-foreground mb-1">Cách chuyển đổi:</p>
        <p>Word: <span className="text-foreground">File → Save As → .docx</span></p>
        <p className="mt-0.5">Google Docs: <span className="text-foreground">File → Tải xuống → .docx</span></p>
      </div>
    </div>
  );

  if (error === 'read_error') return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <p className="text-destructive font-medium">Không thể đọc file Word.</p>
    </div>
  );

  return (
    <div className="relative doc-scroll overflow-auto bg-slate-300 h-full">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-10 bg-slate-300 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-slate-400 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-600">Đang tải tài liệu...</p>
        </div>
      )}

      {/*
        docx-preview render trực tiếp vào div này.
        Nền xám giống Word desktop, các trang nổi lên như paper.
        Style được inject bởi docx-preview vào <head> tự động.
      */}
      <div
        ref={containerRef}
        className="docx-wrapper py-8 flex flex-col items-center gap-6"
      />
    </div>
  );
}