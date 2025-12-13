"use client";

import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface KanbanColumnProps {
  id: string;
  title: string;
  color: string;
  count: number;
  children: ReactNode;
  headerAction?: ReactNode;
  opacity?: number; // Opacity percentage (0-100) - only affects background
  showBorder?: boolean; // Whether to show column border
  hideScrollbar?: boolean; // Whether to hide the column scrollbar
}

export const KanbanColumn = memo(function KanbanColumn({
  id,
  title,
  color,
  count,
  children,
  headerAction,
  opacity = 100,
  showBorder = true,
  hideScrollbar = false,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative flex flex-col h-full rounded-lg transition-colors w-72",
        showBorder && "border border-border"
      )}
      data-testid={`kanban-column-${id}`}
    >
      {/* Background layer with opacity - only this layer is affected by opacity */}
      <div
        className={cn(
          "absolute inset-0 rounded-lg backdrop-blur-sm transition-colors",
          isOver ? "bg-accent" : "bg-card"
        )}
        style={{ opacity: opacity / 100 }}
      />

      {/* Column Header - positioned above the background */}
      <div
        className={cn(
          "relative z-10 flex items-center gap-2 p-3",
          showBorder && "border-b border-border"
        )}
      >
        <div className={cn("w-3 h-3 rounded-full", color)} />
        <h3 className="font-medium text-sm flex-1">{title}</h3>
        {headerAction}
        <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full">
          {count}
        </span>
      </div>

      {/* Column Content - positioned above the background */}
      <div
        className={cn(
          "relative z-10 flex-1 overflow-y-auto p-2 space-y-2",
          hideScrollbar &&
            "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        )}
      >
        {children}
      </div>
    </div>
  );
});
