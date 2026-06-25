import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

export default function ExcelViewer({ file, searchText }) {
  const [sheets, setSheets] = useState([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSheets([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetData = workbook.SheetNames.map(name => {
          const sheet = workbook.Sheets[name];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
          return { name, rows };
        });
        if (!cancelled) {
          setSheets(sheetData);
          setActiveSheet(0);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Excel render error:', err);
          setError('Không thể đọc file Excel.');
          setLoading(false);
        }
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
    // Simple cell-level highlight via CSS — cells containing the search text get a class
    const cells = containerRef.current.querySelectorAll('td, th');
    cells.forEach(cell => {
      cell.classList.remove('search-match');
      if (cell.textContent.toLowerCase().includes(searchText.toLowerCase())) {
        cell.classList.add('search-match');
      }
    });
  }, [searchText, activeSheet, sheets]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
        <p className="text-sm text-muted-foreground">Đang tải bảng tính...</p>
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

  const currentSheet = sheets[activeSheet];
  const maxCols = currentSheet?.rows?.reduce((max, row) => Math.max(max, row.length), 0) || 0;

  return (
    <div className="flex flex-col h-full bg-slate-200/50">
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="doc-scroll flex gap-1 overflow-x-auto bg-white border-b px-2 py-2">
          {sheets.map((sheet, i) => (
            <button
              key={i}
              onClick={() => setActiveSheet(i)}
              className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap font-medium transition-colors ${
                i === activeSheet ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}
      {/* Table */}
      <div ref={containerRef} className="doc-scroll overflow-auto flex-1">
        {currentSheet && currentSheet.rows.length > 0 ? (
          <table className="border-collapse text-sm">
            <tbody>
              {currentSheet.rows.map((row, rIdx) => (
                <tr key={rIdx} className={rIdx === 0 ? 'bg-slate-100 font-semibold' : ''}>
                  <td className="border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-muted-foreground text-right tabular-nums select-none w-10">
                    {rIdx + 1}
                  </td>
                  {Array.from({ length: maxCols }).map((_, cIdx) => (
                    <td
                      key={cIdx}
                      className="border border-slate-200 px-2 py-1 min-w-[80px] max-w-[300px] truncate"
                    >
                      {row[cIdx] !== undefined ? String(row[cIdx]) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            Bảng trống
          </div>
        )}
      </div>
    </div>
  );
}