import React, { useEffect, useRef, useState } from 'react';
import mammoth from 'mammoth';

export default function WordViewer({ file, searchText }) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
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
          setError('Không thể đọc file Word. Định dạng có thể không được hỗ trợ.');
          setLoading(false);
        }
      }
    };
    reader.onerror = () => {
      if (!cancelled) {
        setError('Lỗi khi đọc file.');
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);

    return () => { cancelled = true; };
  }, [file]);

  // Search highlight
  useEffect(() => {
    if (!containerRef.current) return;
    // Remove previous highlights
    containerRef.current.querySelectorAll('.search-match, .search-match-active').forEach(el => {
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
      if (node.textContent.trim() && node.parentNode.tagName !== 'SCRIPT' && node.parentNode.tagName !== 'STYLE') {
        textNodes.push(node);
      }
    }
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
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
        <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
        <p className="text-sm text-muted-foreground">Đang tải tài liệu...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <p className="text-destructive font-medium">{error}</p>
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