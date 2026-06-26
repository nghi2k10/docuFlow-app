const DB_NAME = 'docreader_cache';
const STORE_NAME = 'files';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME, { keyPath: 'fingerprint' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFileToCache(fingerprint, file) {
  try {
    const db = await openDb();
    const arrayBuffer = await file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        fingerprint,
        name: file.name,
        type: file.type,
        arrayBuffer,
        savedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('saveFileToCache error:', e);
  }
}

export async function getFileFromCache(fingerprint) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(fingerprint);
      req.onsuccess = () => {
        const record = req.result;
        if (!record) { resolve(null); return; }
        const file = new File([record.arrayBuffer], record.name, { type: record.type });
        resolve(file);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('getFileFromCache error:', e);
    return null;
  }
}

export async function removeFileFromCache(fingerprint) {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(fingerprint);
      tx.oncomplete = () => resolve();
    });
  } catch (e) {
    console.error('removeFileFromCache error:', e);
  }
}