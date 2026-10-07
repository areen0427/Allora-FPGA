import { useRef, useState } from "react";
import {
  getLastProjectParentDirectory,
  type AppSettings,
} from "../data/settings";
import { pickProjectParentDirectory } from "../lib/projectWorkspace";
import { hasTauriInvoke } from "../lib/tauri";

export function useProjectLocation(
  mode: AppSettings["projectLocationMode"],
  defaultLocationLabel: string,
) {
  const nativeAvailable = hasTauriInvoke();
  const [parentDirectory, setParentDirectory] = useState<string | null>(() =>
    mode === "last-used" ? getLastProjectParentDirectory() : null,
  );
  const [isChoosingLocation, setIsChoosingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const choosingLocation = useRef(false);
  const requiresLocation =
    nativeAvailable && mode !== "documents" && !parentDirectory;
  const locationLabel =
    parentDirectory ??
    (mode === "ask"
      ? "Choose a location"
      : mode === "last-used"
        ? "Choose a location (no previous location found)"
        : defaultLocationLabel);

  async function chooseLocation() {
    if (!nativeAvailable || choosingLocation.current) return;
    choosingLocation.current = true;
    setIsChoosingLocation(true);
    setLocationError("");
    try {
      const directory = await pickProjectParentDirectory();
      if (directory) setParentDirectory(directory);
    } catch (error) {
      setLocationError(
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Unable to choose a project location.",
      );
    } finally {
      choosingLocation.current = false;
      setIsChoosingLocation(false);
    }
  }

  return {
    parentDirectory,
    nativeAvailable,
    requiresLocation,
    locationLabel,
    isChoosingLocation,
    locationError,
    chooseLocation,
    clearLocationError: () => setLocationError(""),
  };
}
