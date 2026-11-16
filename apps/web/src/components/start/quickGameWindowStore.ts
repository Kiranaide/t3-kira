import { create } from "zustand";
import type { EnvironmentId } from "@t3tools/contracts";
import { CarIcon, Grid2X2Icon } from "lucide-react";
export const GAMES = [
  { label: "Wordle", url: "https://www.nytimes.com/games/wordle/index.html", icon: Grid2X2Icon },
  { label: "NFS Underground 2", url: "https://nfsu2.xyz/", icon: CarIcon },
] as const;

export type Game = (typeof GAMES)[number];

export const useGameWindow = create<{
  game: Game | null;
  environmentId: EnvironmentId | null;
  docked: boolean;
}>(() => ({ game: null, environmentId: null, docked: false }));

export function useDockedGame(environmentId: EnvironmentId) {
  return useGameWindow(
    (state) =>
      state.game !== null &&
      state.docked &&
      state.environmentId === environmentId &&
      CSS.supports("top", "anchor(top)"),
  );
}
