import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addNote,
  deleteNote,
  fetchNotes,
  moveNote,
  promoteNote,
  updateNote,
} from "../api/client";
import { useToast } from "../context/ToastContext";

export function useNotes() {
  return useQuery({
    queryKey: ["notes"],
    queryFn: fetchNotes,
    staleTime: 30_000,
  });
}

export function useAddNote() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: {
      title: string;
      body?: string;
      customer?: string | null;
      task_id?: string | null;
      tags?: string[];
    }) => addNote(data),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["notes"] });
      toast(`Note added: ${vars.title}`);
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      noteId,
      updates,
    }: {
      noteId: string;
      updates: {
        title?: string;
        body?: string;
        customer?: string | null;
        task_id?: string | null;
        tags?: string[];
      };
    }) => updateNote(noteId, updates),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (noteId: string) => deleteNote(noteId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notes"] });
      toast("Note deleted");
    },
    onError: (err: Error) => {
      toast(err.message, "error");
    },
  });
}

export function usePromoteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      noteId,
      customer,
    }: {
      noteId: string;
      customer: string;
    }) => promoteNote(noteId, customer),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notes"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useMoveNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      noteId,
      destination,
      customer,
      filename,
    }: {
      noteId: string;
      destination: "task" | "kb" | "archive";
      customer?: string;
      filename?: string;
    }) => moveNote(noteId, destination, { customer, filename }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notes"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
