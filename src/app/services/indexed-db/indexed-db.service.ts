import { Injectable } from '@angular/core';
import { Clip } from '../../models/models';

@Injectable()
export class IndexedDBService {
  private dbName = 'cloud-clips';
  get idb() {
    return window.indexedDB;
  }

  constructor() {
    this.makeRequest({ upgradeHandler: this.onUpgradeNeeded });
  }

  private makeRequest({
    successHandler,
    errorHandler,
    upgradeHandler
  }: {
    successHandler?: (event: IDBDatabase) => Promise<any>;
    errorHandler?: (event: Event) => any;
    upgradeHandler?: (event: IDBVersionChangeEvent) => any;
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = this.idb.open(this.dbName, 1);

      request.onsuccess = async () => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.onerror = dbError => reject(dbError);

        const result = successHandler
          ? await successHandler(db)
          : Promise.resolve('Success');

        resolve(result);
      };

      request.onerror =
        errorHandler ||
        (_event =>
          reject('Why didn t you allow my web app to use IndexedDB?!'));

      request.onupgradeneeded = upgradeHandler;
    });
  }

  public getClips(options?: {
    index?: 'text' | 'type' | 'category' | 'updatedAt' | 'createdAt';
    lowerBound?: number;
    upperBound?: number;
    keyRange?: IDBKeyRange;
    direction?: IDBCursorDirection;
  }): Promise<Clip[]> {
    const successHandler = (db: IDBDatabase) => {
      const { lowerBound, upperBound, direction, keyRange, index } = {
        index: 'updatedAt',
        keyRange: null,
        ...options
      };
      return new Promise((resolve, _reject) => {
        const objectStore = db
          .transaction(['clips'], 'readonly')
          .objectStore('clips')
          .index(index || 'updatedAt');

        const clips: Clip[] = [];
        const request = objectStore.openCursor(keyRange, direction || 'prev');

        request.onerror = _reject;
        request.onsuccess = ((count = 0) => event => {
          const cursor = (event.target as IDBRequest)
            .result as IDBCursorWithValue;

          if (cursor) {
            if (
              (lowerBound === undefined || count >= lowerBound) &&
              (upperBound === undefined || count < upperBound)
            ) {
              clips.push(cursor.value);
            }
            count++;
            cursor.continue();
          } else {
            resolve(clips);
          }
        })();
      });
    };
    return this.makeRequest({ successHandler });
  }

  public addClip(clip: Clip): Promise<any> {
    const successHandler = (db: IDBDatabase) => {
      return new Promise((resolve, _reject) => {
        const transaction = db.transaction(['clips'], 'readwrite');
        // report on the success of the transaction completing, when everything is done
        transaction.oncomplete = () => console.log('transaction complete');
        transaction.onerror = _reject;

        const clipStore = transaction.objectStore('clips');
        const clipStoreRequest = clipStore.add(clip);

        clipStoreRequest.onsuccess = resolve;
      });
    };
    return this.makeRequest({ successHandler });
  }

  public modifyClip(clip: Clip): Promise<Clip[]> {
    const successHandler = (db: IDBDatabase) => {
      return new Promise((resolve, _reject) => {
        const objectStore = db
          .transaction(['clips'], 'readwrite')
          .objectStore('clips');

        const updateRequest = objectStore.put(clip);
        updateRequest.onerror = _reject;
        updateRequest.onsuccess = resolve;
      });
    };
    return this.makeRequest({ successHandler });
  }

  public findClip(clip: Clip): Promise<Clip | undefined> {
    const successHandler = (db: IDBDatabase) => {
      return new Promise((resolve, _reject) => {
        const objectStore = db
          .transaction(['clips'], 'readwrite')
          .objectStore('clips');

        const request = objectStore
          .index('text')
          .get(IDBKeyRange.only([clip.plainText, clip.htmlText]));

        request.onerror = _reject;
        request.onsuccess = () => resolve(request.result);
      });
    };
    return this.makeRequest({ successHandler });
  }

  public removeClip(clip: Clip): Promise<Clip[]> {
    const successHandler = (db: IDBDatabase) => {
      return new Promise((resolve, _reject) => {
        const objectStore = db
          .transaction(['clips'], 'readwrite')
          .objectStore('clips');

        const removeRequest = objectStore.delete(clip.id);
        removeRequest.onerror = _reject;
        removeRequest.onsuccess = resolve;
      });
    };
    return this.makeRequest({ successHandler });
  }

  private onUpgradeNeeded(event: IDBVersionChangeEvent) {
    const data = [];
    const db = (event.target as IDBOpenDBRequest).result;
    const objectStore = db.createObjectStore('clips', {
      keyPath: 'id'
    });

    objectStore.createIndex('text', ['plainText', 'htmlText'], {
      unique: true
    });
    objectStore.createIndex('type', ['type', 'updatedAt'], {
      unique: true
    });
    objectStore.createIndex('category', ['category', 'updatedAt'], {
      unique: true
    });
    objectStore.createIndex('formats', 'formats', { multiEntry: true });
    objectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
    objectStore.createIndex('createdAt', 'createdAt', { unique: false });

    objectStore.transaction.oncomplete = _event => {
      // Store values in the newly created objectStore.
      const clipsObjectStore = db
        .transaction('clips', 'readwrite')
        .objectStore('clips');
      data.forEach(clip => {
        clipsObjectStore.add(clip);
      });
    };
  }
}
