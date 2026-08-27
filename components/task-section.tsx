"use client";

import { ChevronRightIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type TaskSectionProps = {
  label: string;
  done: number;
  total: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

export function TaskSection({
  label,
  done,
  total,
  open,
  onOpenChange,
  children,
}: TaskSectionProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="py-1">
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRightIcon
          className={`size-3.5 shrink-0 text-faint transition-transform duration-150 ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden
        />
        <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </span>
        <span
          key={`${done}/${total}`}
          className="anim-num tnum ml-auto pr-1 text-[12.5px] text-faint"
        >
          {total > 0 ? `${done}/${total}` : ""}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="panel-collapse">
        <div className="pt-0.5 pl-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
