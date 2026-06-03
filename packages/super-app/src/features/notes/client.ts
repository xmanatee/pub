import type { Note } from "./commands";
import { createNote, deleteNote, listNotes, renderNoteMarkdown, updateNote } from "./server";

export const notesApi = {
  list: (): Promise<{ entries: Note[] }> => listNotes(),
  create: (title: string, body: string): Promise<{ entry: Note }> =>
    createNote({ data: { title, body } }),
  update: (id: string, title: string, body: string): Promise<{ entry: Note }> =>
    updateNote({ data: { id, title, body } }),
  delete: (id: string): Promise<{ id: string }> => deleteNote({ data: { id } }),
  renderMarkdown: (markdown: string): Promise<{ html: string }> =>
    renderNoteMarkdown({ data: { markdown } }),
};
