import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Highlighter } from 'lucide-react';
import { getFileType, fileFingerprint, formatFileSize } from '@/lib/fileTypes';
import { getAnnotations, saveAnnotations } from '@/lib/storage';
import { toast } from 'react-hot-toast';
import PdfViewer from '@/components/viewers/PdfViewer';
import WordViewer from '@/components/viewers/WordViewer';
import ExcelViewer from '@/components/viewers/ExcelViewer';
import PptxViewer from '@/components/viewers/PptxViewer';
import SearchBar from '@/components/viewers/SearchBar';
import AnnotationPanel, { HIGHLIGHT_COLORS } from '@/components/viewers/AnnotationPanel';
import { getFileFromCache } from '@/lib/fileCache';

export default function Viewer() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [activeSelection, setActiveSelection] = useState('');

  // Load file from sessionStorage / window bridge
  useEffect(() => {
    const storedInfo = sessionStorage.getItem('docreader_current_file');
    if (!storedInfo) { navigate('/'); return; }

    const info = JSON.parse(storedInfo);
    setFileInfo(info);

    if (window.__docreader_file) {
      // File vẫn còn trong memory (mở bình thường)
      setFile(window.__docreader_file);
    } else {
      // App bị kill rồi mở lại — lấy từ IndexedDB
      getFileFromCache(info.fingerprint).then(cached => {
        if (cached) {
          window.__docreader_file = cached;
          setFile(cached);
        } else {
          // Không còn cache — về Home
          navigate('/');
        }
      });
    }
  }, [navigate]);

  // Load annotations when file is set
  useEffect(() => {
    if (fileInfo?.fingerprint) {
      setAnnotations(getAnnotations(fileInfo.fingerprint));
    }
  }, [fileInfo]);

  // Save annotations whenever they change
  useEffect(() => {
    if (fileInfo?.fingerprint && annotations.length >= 0) {
      saveAnnotations(fileInfo.fingerprint, annotations);
    }
  }, [annotations, fileInfo]);

  // Track text selection for annotation
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const text = selection.toString().trim();
      if (text.length > 0 && text.length < 2000) {
        setActiveSelection(text);
      } else {
        setActiveSelection('');
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const handleAddHighlight = useCallback((colorKey, text) => {
    const newAnnotation = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      text: text,
      color: colorKey,
      note: '',
      createdAt: Date.now(),
    };
    setAnnotations(prev => [...prev, newAnnotation]);
    setActiveSelection('');
    window.getSelection()?.removeAllRanges();
    toast.success('Đã thêm highlight');
  }, []);

  const handleDeleteAnnotation = useCallback((id) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  }, []);

  if (!file) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  const fileType = getFileType(file.name);
  const displayName = file.name.length > 30 ? file.name.slice(0, 27) + '...' : file.name;

  const renderViewer = () => {
    const commonProps = { searchText };
    switch (fileType.key) {
      case 'pdf':
        return (
          <PdfViewer
            file={file}
            fingerprint={fileInfo?.fingerprint}
            initialPage={fileInfo?.currentPage || 1}
            {...commonProps}
            annotations={annotations}
          />
      );  
      // Trong renderViewer():
      case 'word':
        return <WordViewer file={file} searchText={searchText} annotations={annotations} />;
      case 'excel':
        return <ExcelViewer file={file} searchText={searchText} annotations={annotations} />;
      case 'powerpoint':
        return <PptxViewer file={file} {...commonProps} />;
      default:
        return <div className="p-6 text-center text-muted-foreground">Định dạng không hỗ trợ</div>;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Top toolbar */}
      <header className="bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-1 min-h-[56px]">
        <button
          onClick={() => navigate('/')}
          className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center flex-shrink-0"
          aria-label="Quay lại"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex-1 min-w-0 px-1">
          <p className="font-medium text-sm text-foreground truncate">{displayName}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium" style={{ color: fileType.color }}>{fileType.label}</span>
            <span>•</span>
            <span>{formatFileSize(file.size)}</span>
            {activeSelection && (
              <>
                <span>•</span>
                <span className="text-primary font-medium">Đã chọn văn bản</span>
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="flex-shrink-0">
          <SearchBar
            searchText={searchText}
            onSearchChange={setSearchText}
            matchCount={0}
            currentMatch={0}
            onPrev={() => {}}
            onNext={() => {}}
          />
        </div>

        {/* Annotations toggle */}
        <button
          onClick={() => setShowAnnotations(true)}
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 relative ${
            annotations.length > 0 ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
          }`}
          aria-label="Ghi chú"
        >
          <Highlighter size={18} />
          {annotations.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {annotations.length}
            </span>
          )}
        </button>
      </header>

      {/* Document viewer */}
      <div className="flex-1 overflow-hidden relative">
        {renderViewer()}

        {/* Floating highlight button when text is selected */}
        {activeSelection && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 animate-in slide-in-from-bottom-4 duration-200">
            <div className="bg-white rounded-full shadow-lg border border-slate-200 px-2 py-1.5 flex items-center gap-1">
              <span className="text-xs text-muted-foreground px-2 hidden sm:inline">Highlight:</span>
              {HIGHLIGHT_COLORS.map(color => (
                <button
                  key={color.key}
                  onClick={() => handleAddHighlight(color.key, activeSelection)}
                  className="w-8 h-8 rounded-full border-2 border-white shadow hover:scale-110 transition-transform"
                  style={{ backgroundColor: color.color }}
                  aria-label={color.label}
                />
              ))}
            </div>
          </div>
        )}

        {/* Annotation panel */}
        <AnnotationPanel
          open={showAnnotations}
          onClose={() => setShowAnnotations(false)}
          annotations={annotations}
          onDelete={handleDeleteAnnotation}
          onHighlightText={handleAddHighlight}
          activeSelection={activeSelection}
        />
      </div>
    </div>
  );
}