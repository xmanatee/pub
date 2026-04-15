export interface Note {
  id: string;
  createdAt: number;
  updatedAt: number | null;
  title: string;
  body: string;
}
