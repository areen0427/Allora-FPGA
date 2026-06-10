import { useState } from "react";
import type { ChangeEvent } from "react";
import type { SavedProject } from "../data/projects";
import type { ProjectFile } from "../pages/dashboard/types";
import {
  buildProjectFilePath,
  deleteProjectFile as deleteProjectFileOnDisk,
  renameProjectFile as renameProjectFileOnDisk,
  writeProjectFile,
} from "../lib/projectWorkspace";
import { moveFileToTop, getErrorMessage } from "./utils";

type RenameResult = { error: string } | { oldName: string; newName: string } | undefined;
type DeleteResult = { error: string } | { remainingFiles: ProjectFile[] } | undefined;

export function useFileManagement(project: SavedProject | null) {
  const projectPath = project?.projectPath;

  const [files, setFiles] = useState<ProjectFile[]>(project?.files ?? []);
  const [draggedFileName, setDraggedFileName] = useState<string | null>(null);
  const [dragOverFileName, setDragOverFileName] = useState<string | null>(null);

  function getUntitledFileName() {
    let index = 1;
    const extension =
      project?.language === "SystemVerilog"
        ? "sv"
        : project?.language === "VHDL"
          ? "vhd"
          : "v";

    while (files.some((file) => file.name === `untitled-${index}.${extension}`)) {
      index++;
    }

    return `untitled-${index}.${extension}`;
  }

  function createNewFile(fileName?: string, content?: string) {
    const resolvedName = fileName ?? getUntitledFileName();
    if (files.some((file) => file.name === resolvedName)) return null;

    setFiles((currentFiles) => [
      ...currentFiles,
      {
        name: resolvedName,
        content: content ?? "",
        path: projectPath ? buildProjectFilePath(projectPath, resolvedName) : undefined,
      },
    ]);
    return resolvedName;
  }

  async function renameFile(
    oldName: string,
    newName: string,
  ): Promise<RenameResult> {
    if (!newName || oldName === newName) return undefined;

    if (files.some((file) => file.name === newName)) {
      alert("A file with that name already exists.");
      return undefined;
    }

    const targetFile = files.find((file) => file.name === oldName);
    const nextPath =
      targetFile?.path && projectPath
        ? buildProjectFilePath(projectPath, newName)
        : targetFile?.path;

    if (targetFile?.path && nextPath && targetFile.path !== nextPath) {
      try {
        await renameProjectFileOnDisk(targetFile.path, nextPath);
      } catch (error) {
        return { error: getErrorMessage(error) };
      }
    }

    setFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.name === oldName ? { ...file, name: newName, path: nextPath } : file,
      ),
    );

    return { oldName, newName };
  }

  async function deleteFileFromProject(
    fileName: string,
  ): Promise<DeleteResult> {
    const targetFile = files.find((file) => file.name === fileName);

    if (targetFile?.path) {
      try {
        await deleteProjectFileOnDisk(targetFile.path);
      } catch (error) {
        return { error: getErrorMessage(error) };
      }
    }

    const remainingFiles = files.filter((file) => file.name !== fileName);
    setFiles(remainingFiles);
    return { remainingFiles };
  }

  function reorderFiles(sourceFileName: string, targetFileName: string) {
    if (sourceFileName === targetFileName) return;

    setFiles((currentFiles) => {
      const sourceIndex = currentFiles.findIndex((f) => f.name === sourceFileName);
      const targetIndex = currentFiles.findIndex((f) => f.name === targetFileName);
      if (sourceIndex === -1 || targetIndex === -1) return currentFiles;

      const nextFiles = [...currentFiles];
      const [movedFile] = nextFiles.splice(sourceIndex, 1);
      nextFiles.splice(targetIndex, 0, movedFile);
      return nextFiles;
    });
  }

  function moveFileToTopLevel(fileName: string | null) {
    if (!fileName) return;
    setFiles((currentFiles) => moveFileToTop(currentFiles, fileName));
  }

  async function updateConstraintFile(
    fileName: string,
    content: string,
  ): Promise<{ error?: string }> {
    const existing = files.find((file) => file.name === fileName);
    const nextPath =
      existing?.path ??
      (projectPath ? `${projectPath}/constraints/${fileName}` : undefined);

    if (nextPath) {
      try {
        await writeProjectFile(nextPath, content);
      } catch (error) {
        return { error: getErrorMessage(error) };
      }
    }

    setFiles((currentFiles) => {
      const currentFile = currentFiles.find((f) => f.name === fileName);
      if (currentFile) {
        return currentFiles.map((f) =>
          f.name === fileName
            ? { ...f, content, path: f.path ?? nextPath }
            : f,
        );
      }
      return [...currentFiles, { name: fileName, content, path: nextPath }];
    });
    return {};
  }

  function importFiles(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFiles = Array.from(event.target.files ?? []);

    selectedFiles.forEach((file) => {
      const allowed =
        file.name.endsWith(".v") ||
        file.name.endsWith(".sv") ||
        file.name.endsWith(".vhd") ||
        file.name.endsWith(".vhdl") ||
        file.name.endsWith(".vcd");

      if (!allowed) return;

      const reader = new FileReader();

      reader.onload = () => {
        const content = String(reader.result ?? "");
        const nextPath = projectPath
          ? buildProjectFilePath(projectPath, file.name)
          : undefined;

        setFiles((currentFiles) => {
          const alreadyExists = currentFiles.some((f) => f.name === file.name);
          if (alreadyExists) {
            return currentFiles.map((f) =>
              f.name === file.name
                ? { ...f, content, path: f.path ?? nextPath }
                : f,
            );
          }
          return [...currentFiles, { name: file.name, content, path: nextPath }];
        });
      };

      reader.readAsText(file);
    });

    event.target.value = "";
  }

  return {
    files,
    setFiles,
    draggedFileName,
    setDraggedFileName,
    dragOverFileName,
    setDragOverFileName,
    getUntitledFileName,
    createNewFile,
    renameFile,
    deleteFileFromProject,
    reorderFiles,
    moveFileToTopLevel,
    updateConstraintFile,
    importFiles,
  };
}