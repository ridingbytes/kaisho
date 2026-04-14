/**
 * @module knowledgeTree
 *
 * Pure data structures and helper functions for building
 * and manipulating the knowledge file tree.
 */

import type { KnowledgeFile } from "../../types";

// -----------------------------------------------------------------
// Tree data structures
// -----------------------------------------------------------------

export interface TreeFolder {
  kind: "folder";
  name: string;
  label: string;
  path: string;
  children: TreeNode[];
  expanded: boolean;
}

export interface TreeLeaf {
  kind: "leaf";
  name: string;
  label: string;
  path: string;
}

export type TreeNode = TreeFolder | TreeLeaf;

// -----------------------------------------------------------------
// Tree building
// -----------------------------------------------------------------

function insertIntoFolder(
  nodes: TreeNode[],
  segments: string[],
  file: KnowledgeFile
): void {
  if (segments.length === 1) {
    nodes.push({
      kind: "leaf",
      name: segments[0].replace(/\.md$/, ""),
      label: file.label,
      path: file.path,
    });
    return;
  }

  const folderName = segments[0];
  const existing = nodes.find(
    (n): n is TreeFolder =>
      n.kind === "folder" && n.name === folderName
  );

  if (existing) {
    insertIntoFolder(
      existing.children, segments.slice(1), file
    );
    return;
  }

  const folder: TreeFolder = {
    kind: "folder",
    name: folderName,
    label: file.label,
    path: segments[0],
    children: [],
    expanded: false,
  };
  insertIntoFolder(folder.children, segments.slice(1), file);
  nodes.push(folder);
}

function ensureFolder(
  nodes: TreeNode[],
  segments: string[],
  label: string,
): void {
  if (segments.length === 0) return;
  const name = segments[0];
  let folder = nodes.find(
    (n): n is TreeFolder =>
      n.kind === "folder" && n.name === name,
  );
  if (!folder) {
    folder = {
      kind: "folder",
      name,
      label,
      path: segments[0],
      children: [],
      expanded: false,
    };
    nodes.push(folder);
  }
  if (segments.length > 1) {
    ensureFolder(
      folder.children, segments.slice(1), label,
    );
  }
}

function buildLabelNodes(
  files: KnowledgeFile[],
  label: string,
): TreeNode[] {
  const nodes: TreeNode[] = [];
  for (const file of files) {
    if (file.label !== label) continue;
    if (file.kind === "folder") {
      const segments = file.path
        .split("/").filter(Boolean);
      ensureFolder(nodes, segments, label);
      continue;
    }
    const segments = file.path.split("/").filter(Boolean);
    insertIntoFolder(nodes, segments, file);
  }
  return nodes;
}

/** Build a label-keyed tree from a flat file list. */
export function buildTree(
  files: KnowledgeFile[]
): Record<string, TreeNode[]> {
  const labels = Array.from(
    new Set(files.map((f) => f.label))
  ).sort();
  const result: Record<string, TreeNode[]> = {};
  for (const label of labels) {
    result[label] = buildLabelNodes(files, label);
  }
  return result;
}

// -----------------------------------------------------------------
// Expand folders that contain matching paths
// -----------------------------------------------------------------

function collectLeafPaths(node: TreeNode): string[] {
  if (node.kind === "leaf") return [node.path];
  return node.children.flatMap(collectLeafPaths);
}

/** Expand every folder that contains a matching leaf. */
export function expandMatchingFolders(
  nodes: TreeNode[],
  matchingPaths: Set<string>
): TreeNode[] {
  return nodes.map((node) => {
    if (node.kind === "leaf") return node;
    const leafPaths = collectLeafPaths(node);
    const hasMatch = leafPaths.some(
      (p) => matchingPaths.has(p)
    );
    return {
      ...node,
      expanded: hasMatch ? true : node.expanded,
      children: expandMatchingFolders(
        node.children, matchingPaths
      ),
    };
  });
}

// -----------------------------------------------------------------
// Toggle a folder node by path within a tree
// -----------------------------------------------------------------

/** Toggle the expanded flag of a folder by path. */
export function toggleFolder(
  nodes: TreeNode[],
  targetPath: string
): TreeNode[] {
  return nodes.map((node) => {
    if (node.kind === "leaf") return node;
    if (node.path === targetPath) {
      return { ...node, expanded: !node.expanded };
    }
    return {
      ...node,
      children: toggleFolder(node.children, targetPath),
    };
  });
}

// -----------------------------------------------------------------
// Preserve expanded state across tree rebuilds
// -----------------------------------------------------------------

function findFolderExpanded(
  nodes: TreeNode[],
  path: string
): boolean | undefined {
  for (const node of nodes) {
    if (node.kind === "folder") {
      if (node.path === path) return node.expanded;
      const nested = findFolderExpanded(
        node.children, path
      );
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

/** Merge expanded state from a previous tree into a fresh one. */
export function preserveExpanded(
  fresh: TreeNode[],
  prev: TreeNode[]
): TreeNode[] {
  return fresh.map((node) => {
    if (node.kind === "leaf") return node;
    const wasExpanded = findFolderExpanded(
      prev, node.path
    );
    return {
      ...node,
      expanded: wasExpanded ?? node.expanded,
      children: preserveExpanded(node.children, prev),
    };
  });
}
