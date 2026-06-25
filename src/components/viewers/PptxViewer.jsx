import React, { useEffect, useRef, useState } from 'react';

// PPTX is a ZIP of XML files. We parse slide XML to extract text.
export default function PptxViewer({ file, searchText }) {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSlides([]);
    setCurrentSlide(0);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // Use dynamic import of JSZip (xlsx doesn't do zip parsing for pptx text well)
        const JSZipModule = await import('jszip');
        const JSZip = JSZipModule.default;
        const zip = await JSZip.loadAsync(e.target.result);

        // Find slide files
        const slideFiles = Object.keys(zip.files)
          .filter(name => /ppt\/slides\/slide\d+\.xml$/.test(name))
          .sort((a, b) => {
            const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
            const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
            return numA - numB;
          });

        const slideTexts = [];
        for (const slideFile of slideFiles) {
          const content = await zip.files[slideFile].async('string');
          // Extract text from <a:t> tags
          const matches = content.match(/<a:t>([^<]*)<\/a:t>/g);
          const texts = matches ? matches.map(m => m.replace(/<a:t>/, '').replace(/<\/a:t>/, '')) : [];
          slideTexts.push(texts.join(' '));
        }

        if (cancelled) return;
        if (slideTexts.length === 0) {
          setError('Không tìm thấy nội dung slide. File có thể không đúng định dạng.');
          setLoading(false);
          return;
        }
        setSlides(slideTexts);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('PPTX render error:', err);
        setError('Không thể đọc file PowerPoint. Nếu là file .ppt cũ, hãy chuyển sang .pptx.');
        setLoading(false);
      }
    };
    reader.onerror = () => {
      if (!cancelled) { setError('Lỗi khi đọc file.'); setLoading(false); }
    };
    reader.readAsArrayBuffer(file);

    return () => { cancelled = true; };
  }, [file]);

  useEffect(() => {
    if (!containerRef.current || !searchText || searchText.trim().length < 2) return;
    // Highlight search in slide text
    const paras = containerRef.current.querySelectorAll('p');
    paras.forEach(p => {
      const text = p.dataset.original || p.textContent;
      p.dataset.original = text;
      const regex = new RegExp(`(${searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      if (regex.test(text)) {
        const parts = text.split(regex);
        p.innerHTML = '';
        parts.forEach(part => {
          if (part.toLowerCase() === searchText.toLowerCase()) {
            const mark = document.createElement('mark');
            mark.className = 'search-match';
            mark.textContent = part;
            p.appendChild(mark);
          } else if (part) {
            p.appendChild(document.createTextNode(part));
          }
        });
      } else {
        p.textContent = text;
      }
      regex.lastIndex = 0;
    });
  }, [searchText, currentSlide, slides]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
        <p className="text-sm text-muted-foreground">Đang tải slides...</p>
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

  const slideText = slides[currentSlide] || '';

  return (
    <div className="flex flex-col h-full bg-slate-200/50">
      <div className="flex-1 flex items-center justify-center p-4">
        <div
          ref={containerRef}
          className="bg-white shadow-lg rounded-md w-full max-w-3xl aspect-video flex flex-col justify-center p-8 sm:p-12 overflow-auto"
        >
          {slideText.split(/(?<=[.!?])\s+/).filter(s => s.trim()).map((sentence, i) => (
            <p key={i} className="text-center text-lg sm:text-xl text-foreground leading-relaxed mb-3">
              {sentence}
            </p>
          ))}
        </div>
      </div>
      {/* Slide navigation */}
      <div className="flex items-center justify-center gap-4 py-3 border-t bg-white">
        <button
          onClick={() => setCurrentSlide(s => Math.max(0, s - 1))}
          disabled={currentSlide === 0}
          className="w-10 h-10 rounded-lg hover:bg-muted flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <span className="text-sm font-medium text-muted-foreground tabular-nums">
          {currentSlide + 1} / {slides.length}
        </span>
        <button
          onClick={() => setCurrentSlide(s => Math.min(slides.length - 1, s + 1))}
          disabled={currentSlide === slides.length - 1}
          className="w-10 h-10 rounded-lg hover:bg-muted flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
    </div>
  );
}