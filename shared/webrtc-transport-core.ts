export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export const ORDERED_DATA_CHANNEL_OPTIONS = {
  ordered: true,
} as const;
