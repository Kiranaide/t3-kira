import { expect, it, vi } from "vite-plus/test";
import { render } from "../../test/render";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { ChatBackdrop } from "./ChatBackdrop";

vi.mock("../hooks/useSettings", () => ({
  useClientSettings: (select: (settings: typeof DEFAULT_CLIENT_SETTINGS) => unknown) =>
    select({
      ...DEFAULT_CLIENT_SETTINGS,
      chatBackground: { image: "data:image/png;base64,c2hhcmVk", blur: 3, dimming: 25 },
      startBackground: { image: "data:image/png;base64,bGVnYWN5", blur: 9, dimming: 90 },
    }),
}));

it("uses the shared background on Start even with a saved legacy override", async () => {
  await using _screen = await render(<ChatBackdrop surface="start" />);
  const image = document.querySelector("img");
  expect(image?.getAttribute("src")).toBe("data:image/png;base64,c2hhcmVk");
  expect(image?.style.filter).toBe("blur(3px)");
  expect(image?.nextElementSibling?.getAttribute("style")).toContain("opacity: 0.25");
});
