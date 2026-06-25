import React, { useEffect, useRef, useState } from 'react';

let pdfjsLib = null;

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const pdfjs = await import('pdfjs-dist');
  
  // Dùng local worker thay vì CDN
  const workerUrl = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  pdfjsLib = pdfjs;
  return pdfjs;
}

export default function PdfViewer({ file, searchText }) {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const canvasRefs = useRef({});
  const containerRef = useRef(null);
  const pdfDocRef = useRef(null);
  const renderingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPages([]);
    pdfDocRef.current = null;

    const load = async () => {
      try {
        const pdfjs = await getPdfjs();
        const arrayBuffer = await file.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setPages(Array.from({ length: doc.numPages }, (_, i) => i + 1));
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('PDF load error:', err);
        setError('Không thể mở file PDF. ' + err.message);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [file]);

  // Render all pages whenever pages list or scale changes
  useEffect(() => {
    if (!pdfDocRef.current || pages.length === 0) return;
    renderAllPages();
  }, [pages, scale]);

  const renderAllPages = async () => {
    if (renderingRef.current) return;
    renderingRef.current = true;
    const doc = pdfDocRef.current;
    if (!doc) { renderingRef.current = false; return; }

    for (const pageNum of pages) {
      const canvas = canvasRefs.current[pageNum];
      if (!canvas) continue;
      try {
        const page = await doc.getPage(pageNum);
        const containerWidth = containerRef.current?.clientWidth || 350;
        const viewport = page.getViewport({ scale: 1 });
        const fitScale = ((containerWidth - 32) / viewport.width) * scale;
        const scaledViewport = page.getViewport({ scale: fitScale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        canvas.style.width = scaledViewport.width + 'px';
        canvas.style.height = scaledViewport.height + 'px';

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') {
          console.error(`Error rendering page ${pageNum}:`, err);
        }
      }
    }
    renderingRef.current = false;
  };

  const handleScroll = () => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const pageEls = containerRef.current.querySelectorAll('[data-page]');
    let found = 1;
    pageEls.forEach(el => {
      if (el.offsetTop <= scrollTop + 80) found = parseInt(el.dataset.page);
    });
    setCurrentPage(found);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Đang tải PDF...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-3">
        <p className="text-destructive font-medium text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-slate-200/50 doc-scroll"
      >
        <div className="flex flex-col items-center gap-4 py-4 px-4">
          {pages.map(pageNum => (
            <div
              key={pageNum}
              data-page={pageNum}
              className="bg-white shadow-md rounded overflow-hidden"
            >
              <canvas ref={el => { if (el) canvasRefs.current[pageNum] = el; }} />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar: page indicator + zoom */}
      <div className="flex items-center justify-center gap-3 py-2 border-t bg-white px-4 min-h-[44px]">
        <button
          onClick={() => setScale(s => Math.max(0.5, parseFloat((s - 0.2).toFixed(1))))}
          className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground"
        >−</button>
        <span className="text-sm font-medium text-muted-foreground tabular-nums min-w-[80px] text-center">
          {currentPage} / {numPages} · {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale(s => Math.min(3, parseFloat((s + 0.2).toFixed(1))))}
          className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground"
        >+</button>
      </div>
    </div>
  );
}