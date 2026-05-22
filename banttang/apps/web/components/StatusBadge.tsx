import { displayStatusColor, displayStatusLabel } from "@/lib/party-status";
import type { DisplayStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        displayStatusColor[status],
      )}
    >
      {displayStatusLabel[status]}
    </span>
  );
}
