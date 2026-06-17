export const PUB_FS_URL_PREFIX = "/__pub_files__/";
export const PUB_FS_READ_EVENT = "pub-fs.read";
export const PUB_FS_WRITE_EVENT = "pub-fs.write";
export const PUB_FS_DELETE_EVENT = "pub-fs.delete";
export const PUB_FS_METADATA_EVENT = "pub-fs.metadata";
export const PUB_FS_ERROR_EVENT = "pub-fs.error";
export const PUB_FS_CANCEL_EVENT = "pub-fs.cancel";
export const PUB_FS_DONE_EVENT = "pub-fs.done";

export type PubFsEvent =
  | typeof PUB_FS_READ_EVENT
  | typeof PUB_FS_WRITE_EVENT
  | typeof PUB_FS_DELETE_EVENT
  | typeof PUB_FS_METADATA_EVENT
  | typeof PUB_FS_ERROR_EVENT
  | typeof PUB_FS_CANCEL_EVENT
  | typeof PUB_FS_DONE_EVENT;
