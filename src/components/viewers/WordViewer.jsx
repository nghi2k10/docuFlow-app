import React, { useEffect, useRef, useState } from 'react';
import mammoth from 'mammoth';
import { getFileExtension } from '@/lib/fileTypes';

export default function WordViewer({ file, searchText }) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);

  const isLegacyDoc = getFileExtension(file.name) === 'doc';

  useEffect(() => {
    // .doc binary cũ — mammoth không hỗ trợ, báo rõ ngay
    if (isLegacyDoc) {
      setLoading(false);
      setError('legacy_doc');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setHtml('');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) {
          setHtml(result.value || '<p>(Tài liệu trống)</p>');
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Word render error:', err);
          setError('read_error');
          setLoading(false);
        }
      }
    };
    reader.onerror = () => {
      if (!cancelled) { setError('read_error'); setLoading(false); }
    };
    reader.readAsArrayBuffer(file);

    return () => { cancelled = true; };
  }, [file]);

  // Search highlight
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.querySelectorAll('.search-match').forEach(el => {
      const text = document.createTextNode(el.textContent);
      el.parentNode.replaceChild(text, el);
    });
    containerRef.current.querySelectorAll('span[data-original]').forEach(span => {
      const text = document.createTextNode(span.dataset.original);
      span.parentNode.replaceChild(text, span);
      span.parentNode.normalize();
    });

    if (!searchText || searchText.trim().length < 2) return;
    highlightTextInContainer(containerRef.current, searchText);
  }, [searchText, html]);

  const highlightTextInContainer = (container, query) => {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (
        node.textContent.trim() &&
        node.parentNode.tagName !== 'SCRIPT' &&
        node.parentNode.tagName !== 'STYLE'
      ) {
        textNodes.push(node);
      }
    }
    const regex = new RegExp(
      `(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'
    );
    textNodes.forEach(textNode => {
      const text = textNode.textContent;
      if (regex.test(text)) {
        const parent = textNode.parentNode;
        const span = document.createElement('span');
        const parts = text.split(regex);
        parts.forEach(part => {
          if (part.toLowerCase() === query.toLowerCase()) {
            const mark = document.createElement('mark');
            mark.className = 'search-match';
            mark.textContent = part;
            span.appendChild(mark);
          } else if (part) {
            span.appendChild(document.createTextNode(part));
          }
        });
        parent.replaceChild(span, textNode);
      }
      regex.lastIndex = 0;
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Đang tải tài liệu...</p>
      </div>
    );
  }

  if (error === 'legacy_doc') {
    return (
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
            File <span className="font-medium text-foreground">{file.name}</span> là định dạng Word cũ (.doc).
            Hãy mở file trong Microsoft Word hoặc Google Docs và lưu lại dưới dạng <span className="font-medium">.docx</span> để đọc trên app này.
          </p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-muted-foreground text-left w-full max-w-xs">
          <p className="font-medium text-foreground mb-1">Cách chuyển đổi:</p>
          <p>Word: <span className="text-foreground">File → Save As → .docx</span></p>
          <p className="mt-0.5">Google Docs: <span className="text-foreground">File → Tải xuống → .docx</span></p>
        </div>
      </div>
    );
  }

  if (error === 'read_error') {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <p className="text-destructive font-medium">Không thể đọc file Word. Định dạng có thể không được hỗ trợ.</p>
      </div>
    );
  }

  return (
    <div className="doc-scroll overflow-auto bg-slate-200/50 h-full">
      <div
        ref={containerRef}
        className="doc-word-content bg-white max-w-[800px] mx-auto my-4 p-8 sm:p-12 shadow-md rounded-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}