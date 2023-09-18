export interface MetadataOnRemote {
  version?: string;
  generatedWhen?: number;
  deletions?: DeletionOnRemote[];
}

export interface DeletionOnRemote {
  key: string;
  actionWhen: number;
}
