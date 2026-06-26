import { getFileType, fileFingerprint } from '@/lib/fileTypes';
import { addRecentFile } from '@/lib/storage';

/**
 * Gọi hàm này một lần trong App.jsx (useEffect)
 * Truyền vào navigate để điều hướng sang Viewer
 */
export function initFileIntentBridge(navigate) {
  const handleIntentFile = (event) => {
    const { name, mimeType, base64, size } = event.detail;
    openFileFromIntent({ name, mimeType, base64, size }, navigate);
  };

  window.addEventListener('docreader:intent-file', handleIntentFile);

  // Nếu app đã load xong nhưng intent đến trước (race condition)
  if (window.__pendingIntentFile) {
    openFileFromIntent(window.__pendingIntentFile, navigate);
    window.__pendingIntentFile = null;
  }

  return () => {
    window.removeEventListener('docreader:intent-file', handleIntentFile);
  };
}

function openFileFromIntent({ name, mimeType, base64, size }, navigate) {
  try {
    // Convert Base64 → Uint8Array → Blob → File
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    const file = new File([blob], name, { type: mimeType });

    const type = getFileType(name);
    if (type.key === 'unknown') return;

    const fileInfo = {
      fingerprint: fileFingerprint(file),
      name: file.name,
      size: file.size,
      lastModified: Date.now(),
      typeKey: type.key,
      typeLabel: type.label,
      openedAt: Date.now(),
    };

    addRecentFile(fileInfo);
    sessionStorage.setItem('docreader_current_file', JSON.stringify(fileInfo));
    window.__docreader_file = file;
    navigate('/viewer');
  } catch (err) {
    console.error('Intent file error:', err);
  }
}