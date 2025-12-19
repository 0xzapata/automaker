import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/app-store";

export interface ResponsiveKanbanConfig {
  columnWidth: number;
  columnMinWidth: number;
  columnMaxWidth: number;
  gap: number;
  padding: number;
}

// Sidebar dimensions (must match sidebar.tsx values)
const SIDEBAR_COLLAPSED_WIDTH = 64; // w-16 = 64px
const SIDEBAR_EXPANDED_WIDTH = 288; // w-72 = 288px (lg breakpoint)

/**
 * Default configuration for responsive Kanban columns
 */
const DEFAULT_CONFIG: ResponsiveKanbanConfig = {
  columnWidth: 288, // 18rem = 288px (w-72)
  columnMinWidth: 280, // Minimum column width - increased to ensure usability
  columnMaxWidth: 400, // Maximum column width - increased for better scaling
  gap: 20, // gap-5 = 20px
  padding: 32, // px-4 on both sides = 32px
};

export interface UseResponsiveKanbanResult {
  columnWidth: number;
  containerStyle: React.CSSProperties;
  isCompact: boolean;
}

/**
 * Hook to calculate responsive Kanban column widths based on window size.
 * Ensures columns scale intelligently to fill available space without
 * dead space on the right or content being cut off.
 *
 * @param columnCount - Number of columns in the Kanban board
 * @param config - Optional configuration for column sizing
 * @returns Object with calculated column width and container styles
 */
export function useResponsiveKanban(
  columnCount: number = 4,
  config: Partial<ResponsiveKanbanConfig> = {}
): UseResponsiveKanbanResult {
  const { columnMinWidth, columnMaxWidth, gap, padding } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Get sidebar state from the store to account for its width
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);

  const calculateColumnWidth = useCallback(() => {
    if (typeof window === "undefined") {
      return DEFAULT_CONFIG.columnWidth;
    }

    // Determine sidebar width based on viewport and sidebar state
    // On screens < 1024px (lg breakpoint), sidebar is always collapsed width visually
    const isLargeScreen = window.innerWidth >= 1024;
    const sidebarWidth = isLargeScreen && sidebarOpen
      ? SIDEBAR_EXPANDED_WIDTH
      : SIDEBAR_COLLAPSED_WIDTH;

    // Get the available width (window width minus sidebar and padding)
    const availableWidth = window.innerWidth - sidebarWidth - padding;

    // Calculate total gap space needed
    const totalGapWidth = gap * (columnCount - 1);

    // Calculate width available for all columns
    const widthForColumns = availableWidth - totalGapWidth;

    // Calculate ideal column width
    let idealWidth = Math.floor(widthForColumns / columnCount);

    // Clamp to min/max bounds
    idealWidth = Math.max(columnMinWidth, Math.min(columnMaxWidth, idealWidth));

    return idealWidth;
  }, [columnCount, columnMinWidth, columnMaxWidth, gap, padding, sidebarOpen]);

  const [columnWidth, setColumnWidth] = useState<number>(() =>
    calculateColumnWidth()
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      const newWidth = calculateColumnWidth();
      setColumnWidth(newWidth);
    };

    // Set initial width
    handleResize();

    // Use ResizeObserver for more precise updates if available
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(handleResize);
      observer.observe(document.body);

      return () => {
        observer.disconnect();
      };
    }

    // Fallback to window resize event
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [calculateColumnWidth]);

  // Determine if we're in compact mode (columns at minimum width)
  const isCompact = columnWidth <= columnMinWidth + 10;

  // Container style to center content and prevent overflow
  const containerStyle: React.CSSProperties = {
    display: "flex",
    gap: `${gap}px`,
    height: "100%",
    justifyContent: "center",
  };

  return {
    columnWidth,
    containerStyle,
    isCompact,
  };
}
