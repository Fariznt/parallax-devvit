/** Shared API types used by both client (fetch) and server (res.json). */

export type ContentKind = 'post' | 'comment';

export type ContentData = {
  body: string;
  username: string;
  url: string;
  title?: string;
  imageUrl?: string;
  parentPostTitle?: string;
};

export type StoredRecord = {
  id: string;
  kind: ContentKind;
  sortAt: number;
  data: ContentData;
};

// Reddit context passed to the client
export type InitResponse = {
  username: string | null;
  isModerator: boolean;
};

export type RecordsResponse = {
  records: StoredRecord[];
};

export type TotalRecordsResponse = {
  totalRecords: number;
};
