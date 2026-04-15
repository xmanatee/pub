export interface Task {
  id: string;
  createdAt: number;
  updatedAt: number | null;
  title: string;
  completed: boolean;
}
