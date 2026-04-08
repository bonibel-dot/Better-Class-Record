import { openDB, DBSchema } from 'idb';
import { StoredFile } from '../types';

interface FileDB extends DBSchema {
  files: {
    key: string;
    value: StoredFile;
  };
}

const DB_NAME = 'class-record-files';
const STORE_NAME = 'files';

const getDB = async () => {
  return openDB<FileDB>(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
};

export const saveFile = async (file: File): Promise<StoredFile> => {
  const db = await getDB();
  const id = crypto.randomUUID();
  const storedFile: StoredFile = {
    id,
    name: file.name,
    type: file.type,
    data: file,
    size: file.size,
    lastModified: file.lastModified,
  };
  await db.put(STORE_NAME, storedFile);
  return storedFile;
};

export const getFiles = async (): Promise<StoredFile[]> => {
  const db = await getDB();
  return db.getAll(STORE_NAME);
};

export const deleteFile = async (id: string): Promise<void> => {
  console.log('Deleting file with ID:', id);
  const db = await getDB();
  await db.delete(STORE_NAME, id);
  console.log('File deleted successfully');
};

export const getFile = async (id: string): Promise<StoredFile | undefined> => {
  const db = await getDB();
  return db.get(STORE_NAME, id);
};
