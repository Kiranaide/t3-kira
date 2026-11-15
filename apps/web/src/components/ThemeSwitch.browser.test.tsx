import { BUILT_IN_THEMES } from "@t3tools/shared/themePalettes";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

vi.mock(import("./CommandPaletteThemeItems"), async () => {
  const { STANDARD_THEME_CARDS, getThemeCardDefinition } =
    await import("./settings/ThemePreviewCircles");
  const { MonitorIcon, SunIcon, MoonIcon } = await import("lucide-react");
  return {
    APPEARANCE_OPTIONS: [
      { mode: "system", label: "System", icon: MonitorIcon },
      { mode: "light", label: "Light", icon: SunIcon },
      { mode: "dark", label: "Dark", icon: MoonIcon },
    ] as const,
    useThemeCards: () => [
      ...STANDARD_THEME_CARDS.map((card) => ({ ...card, id: null })),
      ...BUILT_IN_THEMES.map(getThemeCardDefinition),
    ],
    notifyThemeSaveFailure: vi.fn(),
  };
});

import { render } from "../../test/render";
import { setAppearanceMode, setTheme } from "../hooks/useTheme";
import { ThemeSwitch } from "./ThemeSwitch";

it("selects palette and appearance independently and exposes the current selection", async () => {
  setTheme("daylight-blue");
  setAppearanceMode("light");
  using _restore = {
    [Symbol.dispose]: () => {
      setTheme("system");
      setAppearanceMode("system");
    },
  };
  await using screen = await render(<ThemeSwitch />);
  await userEvent.click(screen.getByRole("button", { name: "Change theme" }));
  await expect
    .element(page.getByRole("menuitemradio", { name: "Daylight Blue" }))
    .toHaveAttribute("aria-checked", "true");
  await userEvent.click(page.getByRole("menuitemradio", { name: "Dark", exact: true }));
  await userEvent.click(page.getByRole("menuitemradio", { name: "Ocean", exact: true }));
  expect(window.localStorage.getItem("t3code:theme")).toBe("ocean");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  await expect
    .element(page.getByRole("menuitemradio", { name: "Ocean", exact: true }))
    .toHaveAttribute("aria-checked", "true");
  await userEvent.keyboard("{Escape}");
});
