export type ContentKind = 'post' | 'comment';
export type ContentData = {
    body: string;
    username: string;
    url: string;
    title?: string;
    imageUrl?: string | null;
    parentPostTitle?: string;
};
export type StoredRecord = {
    id: string;
    kind: ContentKind;
    sortAt: number;
    data: ContentData;
};
/** Checks if the error is a Redis quota error, which would warrant eviction of old records */
export declare function isRedisQuotaError(error: unknown): boolean;
/** Stores a post and adds it to the shared ordered index. */
export declare function storePostRecord(id: string, data: ContentData, sortAt?: number): Promise<StoredRecord>;
/** Stores a comment and adds it to the shared ordered index. */
export declare function storeCommentRecord(id: string, data: ContentData, sortAt?: number): Promise<StoredRecord>;
/** Deletes a record and removes its id from the ordered index. */
export declare function deleteRecord(id: string): Promise<void>;
/** Deletes up to count records from the beginning of the ordered index. */
export declare function deleteOldestRecords(count: number): Promise<number>;
/** Deletes every stored record and clears the ordered index. */
export declare function deleteAllRecords(): Promise<number>;
/** Retrieves one stored record by id. */
export declare function getRecord(id: string): Promise<StoredRecord | null>;
/** Returns the total number of stored post/comment records. */
export declare function getTotalRecords(): Promise<number>;
/** Retrieves stored records by newest-first rank, inclusive of from and to. */
export declare function getRecordRange(from: number, to: number): Promise<StoredRecord[]>;
