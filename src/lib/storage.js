// LocalStorage-based persistence for recent files and annotations

const RECENT_KEY = 'docreader_recent_files';
const ANNOTATION_PREFIX = 'docreader_annotations_';
const MAX_RECENT = 20;

export function getRecentFiles() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addRecentFile(fileInfo) {
  try {
    const files = getRecentFiles();
    const filtered = files.filter(f => f.fingerprint !== fileInfo.fingerprint);
    const updated = [fileInfo, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return getRecentFiles();
  }
}

export function updateReadingProgress(fingerprint, currentPage, numPages) {
  try {
    const files = getRecentFiles();
    const updated = files.map(f =>
      f.fingerprint === fingerprint
        ? { ...f, currentPage, numPages, lastReadAt: Date.now() }
        : f
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export function removeRecentFile(fingerprint) {
  try {
    const files = getRecentFiles().filter(f => f.fingerprint !== fingerprint);
    localStorage.setItem(RECENT_KEY, JSON.stringify(files));
    return files;
  } catch {
    return getRecentFiles();
  }
}

export function clearRecentFiles() {
  localStorage.removeItem(RECENT_KEY);
}

// Annotations
function annotationKey(fingerprint) {
  return `${ANNOTATION_PREFIX}${fingerprint}`;
}

export function getAnnotations(fingerprint) {
  try {
    const raw = localStorage.getItem(annotationKey(fingerprint));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveAnnotations(fingerprint, annotations) {
  try {
    localStorage.setItem(annotationKey(fingerprint), JSON.stringify(annotations));
  } catch {
    // storage full — silently ignore
  }
}

export function clearAnnotations(fingerprint) {
  localStorage.removeItem(annotationKey(fingerprint));
}