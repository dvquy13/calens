/**
 * Metadata Store Operations
 * CRUD operations for metadata
 */

import { IDBPDatabase } from 'idb';
import { STORE_NAMES, MetadataStore } from '@/types/database';
import { CalendarDBSchema } from './schema';

export async function setUserMetadata(
  db: IDBPDatabase<CalendarDBSchema>,
  userEmail: string,
  key: string,
  value: any,
  cacheExpiry?: Date
): Promise<void> {
  const metadata: MetadataStore = {
    user_email: userEmail,
    key,
    value,
    last_updated: new Date(),
    cache_expiry: cacheExpiry,
    data_version: 1
  };
  await db.put(STORE_NAMES.METADATA, metadata);
}

export async function getUserMetadata(
  db: IDBPDatabase<CalendarDBSchema>,
  userEmail: string,
  key: string
): Promise<MetadataStore | undefined> {
  return await db.get(STORE_NAMES.METADATA, [userEmail, key]);
}

export async function deleteUserMetadata(
  db: IDBPDatabase<CalendarDBSchema>,
  userEmail: string,
  key: string
): Promise<void> {
  await db.delete(STORE_NAMES.METADATA, [userEmail, key]);
}

export async function getAllUserMetadata(
  db: IDBPDatabase<CalendarDBSchema>,
  userEmail: string
): Promise<MetadataStore[]> {
  return await db.getAllFromIndex(STORE_NAMES.METADATA, 'user_email', userEmail);
}

export async function isUserDataFresh(
  db: IDBPDatabase<CalendarDBSchema>,
  userEmail: string,
  cacheKey: string,
  maxAge: number = 3600000
): Promise<boolean> {
  const metadata = await getUserMetadata(db, userEmail, cacheKey);
  if (!metadata) return false;

  if (metadata.cache_expiry && metadata.cache_expiry < new Date()) {
    return false;
  }

  const age = Date.now() - metadata.last_updated.getTime();
  return age < maxAge;
}

export async function getUserCacheTimestamp(
  db: IDBPDatabase<CalendarDBSchema>,
  userEmail: string,
  cacheKey: string
): Promise<Date | null> {
  const metadata = await getUserMetadata(db, userEmail, cacheKey);
  return metadata ? metadata.last_updated : null;
}

export async function invalidateUserCache(
  db: IDBPDatabase<CalendarDBSchema>,
  userEmail: string,
  cacheKey: string
): Promise<void> {
  await deleteUserMetadata(db, userEmail, cacheKey);
}

export async function clearSyncCheckpoints(
  db: IDBPDatabase<CalendarDBSchema>,
  userEmail: string
): Promise<void> {
  const allMetadata = await getAllUserMetadata(db, userEmail);
  const syncKeys = allMetadata
    .filter(meta =>
      meta.key === 'last_full_sync' ||
      meta.key.startsWith('last_sync_')
    )
    .map(meta => meta.key);

  for (const key of syncKeys) {
    await deleteUserMetadata(db, userEmail, key);
  }
}
