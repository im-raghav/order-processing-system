export interface IngestProgress {
  rowsRead: number;
  rowsInserted: number;
  rowsSkippedDuplicate: number;
  done: boolean;
  error?: string;
}
