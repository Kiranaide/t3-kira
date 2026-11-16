import { useAtomValue } from "@effect/atom-react";
import { AuthSettingsWriteScope, type EnvironmentId } from "@t3tools/contracts";
import { CoffeeIcon } from "lucide-react";
import { serverEnvironment } from "~/state/server";
import { useEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "./ui/button";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuGroup,
  MenuGroupLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
} from "./ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "./ui/tooltip";

export function KeepAwakeControl({ environmentId }: { environmentId: EnvironmentId | null }) {
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const canWrite = useEnvironmentScope(environmentId, AuthSettingsWriteScope);
  const update = useAtomCommand(serverEnvironment.updateSettings);
  const settings = config?.settings;
  const mode = settings?.keepAwakeAlways
    ? "always"
    : settings?.keepAwakeWhileAgentsWork
      ? "agents"
      : "off";
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Keep computer awake"
                  disabled={!settings || !canWrite}
                />
              }
            />
          }
        >
          <CoffeeIcon aria-hidden className="size-4" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Keep host computer awake</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end">
        <MenuGroup>
          <MenuGroupLabel>Keep host computer awake</MenuGroupLabel>
          <MenuRadioGroup
            value={mode}
            onValueChange={(value) => {
              if (!environmentId || !canWrite) return;
              void update({
                environmentId,
                input: {
                  patch: {
                    keepAwakeAlways: value === "always",
                    keepAwakeWhileAgentsWork: value === "agents",
                  },
                },
              });
            }}
          >
            {[
              { value: "always", label: "Always" },
              { value: "agents", label: "While agents work" },
              { value: "off", label: "Off" },
            ].map(({ value, label }) => (
              <MenuRadioItem key={value} value={value}>
                <span className="flex flex-1 items-center gap-2">
                  {label}
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
