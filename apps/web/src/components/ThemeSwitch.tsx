import { CheckIcon, PaletteIcon } from "lucide-react";

import { useTheme } from "../hooks/useTheme";
import { getThemeDefinition } from "../themePalette";
import {
  APPEARANCE_OPTIONS,
  notifyThemeSaveFailure,
  useThemeCards,
} from "./CommandPaletteThemeItems";
import { Button } from "./ui/button";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
  MenuGroup,
  MenuGroupLabel,
} from "./ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "./ui/tooltip";

export function ThemeSwitch() {
  const { theme, themeHalves, resolvedTheme, appearanceMode, setTheme, setAppearanceMode } =
    useTheme();
  const cards = useThemeCards();
  const selectedId = themeHalves?.[resolvedTheme] ?? getThemeDefinition(theme)?.id ?? null;
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
          <PaletteIcon className="size-4" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Change theme</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end">
        <MenuGroup>
          <MenuGroupLabel>Appearance</MenuGroupLabel>
          {APPEARANCE_OPTIONS.map(({ mode, label, icon: Icon }) => (
            <MenuItem
              key={mode}
              onClick={() => {
                if (!setAppearanceMode(mode)) notifyThemeSaveFailure();
              }}
            >
              <Icon className="size-4" />
              {label}
              {appearanceMode === mode ? <CheckIcon className="ml-auto size-4" /> : null}
            </MenuItem>
          ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>Theme</MenuGroupLabel>
          {cards.map(({ id, label }) => (
            <MenuItem
              key={id ?? "standard"}
              onClick={() => {
                if (!setTheme(id ?? appearanceMode)) notifyThemeSaveFailure();
              }}
            >
              {label}
              {selectedId === id ? <CheckIcon className="ml-auto size-4" /> : null}
            </MenuItem>
          ))}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
