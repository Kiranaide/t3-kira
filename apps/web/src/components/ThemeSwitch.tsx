import { PaletteIcon } from "lucide-react";

import { useTheme } from "../hooks/useTheme";
import { getThemeDefinition } from "../themePalette";
import {
  APPEARANCE_OPTIONS,
  notifyThemeSaveFailure,
  useThemeCards,
} from "./CommandPaletteThemeItems";
import type { ThemeCardDefinition } from "./settings/ThemePreviewCircles";
import { Button } from "./ui/button";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuSeparator,
  MenuGroup,
  MenuGroupLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
} from "./ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "./ui/tooltip";

function ThemeSwatch({
  card,
  mode,
}: {
  card: Pick<ThemeCardDefinition, "previews">;
  mode: "light" | "dark";
}) {
  const preview = card.previews.find((entry) => entry.mode === mode) ?? card.previews[0];
  if (!preview) return null;
  const colors = preview.colors;
  return (
    <span
      aria-hidden
      className="flex h-7 w-10 shrink-0 overflow-hidden rounded-md border border-border"
      style={{ backgroundColor: colors.canvas }}
    >
      <span className="h-full w-3" style={{ backgroundColor: colors.sidebar }} />
      <span className="flex flex-1 flex-col justify-center gap-1 p-1.5">
        <span className="h-1 rounded-full" style={{ backgroundColor: colors.accent }} />
        <span
          className="h-1 w-2/3 rounded-full"
          style={{ backgroundColor: colors.messageAction }}
        />
      </span>
    </span>
  );
}

export function ThemeSwitch() {
  const { theme, themeHalves, resolvedTheme, appearanceMode, setTheme, setAppearanceMode } =
    useTheme();
  const cards = useThemeCards();
  const selectedId = themeHalves?.[resolvedTheme] ?? getThemeDefinition(theme)?.id ?? null;
  const selected = cards.find((card) => card.id === selectedId);
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Change theme" />}
            />
          }
        >
          <PaletteIcon aria-hidden className="size-4" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Change theme</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end">
        <div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
          {selected ? <ThemeSwatch card={selected} mode={resolvedTheme} /> : null}
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Current theme</p>
            <p className="truncate text-sm font-medium">{selected?.label ?? "Custom theme"}</p>
          </div>
        </div>
        <MenuGroup>
          <MenuGroupLabel>Appearance</MenuGroupLabel>
          <MenuRadioGroup
            value={appearanceMode}
            onValueChange={(mode) => {
              if (
                (mode === "system" || mode === "light" || mode === "dark") &&
                !setAppearanceMode(mode)
              )
                notifyThemeSaveFailure();
            }}
          >
            {APPEARANCE_OPTIONS.map(({ mode, label, icon: Icon }) => (
              <MenuRadioItem key={mode} value={mode}>
                <span className="flex items-center gap-2">
                  <Icon aria-hidden className="size-4" />
                  <span className="flex-1">{label}</span>
                  <MenuRadioItemIndicator />
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>Color palette</MenuGroupLabel>
          <MenuRadioGroup
            value={selectedId ?? "standard"}
            onValueChange={(value) => {
              const card = cards.find((entry) => (entry.id ?? "standard") === value);
              if (card && !setTheme(card.id ?? appearanceMode)) notifyThemeSaveFailure();
            }}
          >
            {cards.map((card) => (
              <MenuRadioItem key={card.id ?? "standard"} value={card.id ?? "standard"}>
                <span className="flex items-center gap-3 py-1">
                  <ThemeSwatch card={card} mode={resolvedTheme} />
                  <span className="min-w-0 flex-1 truncate">{card.label}</span>
                  <MenuRadioItemIndicator />
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
