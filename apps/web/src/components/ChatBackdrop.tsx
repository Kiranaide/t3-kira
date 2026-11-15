import { useClientSettings } from "../hooks/useSettings";

export function ChatBackdrop({ surface }: { readonly surface: "chat" | "start" }) {
  const background = useClientSettings((settings) => settings.chatBackground);
  if (background.image === null) return null;
  return (
    <div
      data-background-surface={surface}
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <img
        alt=""
        src={background.image}
        className="h-full w-full object-cover"
        style={{
          filter: `blur(${background.blur}px)`,
          transform: background.blur > 0 ? "scale(1.05)" : undefined,
        }}
      />
      <div
        className="absolute inset-0 bg-background"
        style={{ opacity: background.dimming / 100 }}
      />
    </div>
  );
}
