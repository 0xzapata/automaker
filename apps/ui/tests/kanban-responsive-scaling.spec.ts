/**
 * Kanban Board Responsive Scaling Tests
 *
 * Tests that the Kanban board columns scale intelligently to fill
 * the available window space without dead space or content being cut off.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";

import {
  waitForNetworkIdle,
  createTestGitRepo,
  cleanupTempDir,
  createTempDirPath,
  setupProjectWithPathNoWorktrees,
  waitForBoardView,
} from "./utils";

// Create unique temp dir for this test run
const TEST_TEMP_DIR = createTempDirPath("kanban-responsive-tests");

interface TestRepo {
  path: string;
  cleanup: () => Promise<void>;
}

test.describe("Kanban Responsive Scaling Tests", () => {
  let testRepo: TestRepo;

  test.beforeAll(async () => {
    // Create test temp directory
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }
  });

  test.beforeEach(async () => {
    // Create a fresh test repo for each test
    testRepo = await createTestGitRepo(TEST_TEMP_DIR);
  });

  test.afterEach(async () => {
    // Cleanup test repo after each test
    if (testRepo) {
      await testRepo.cleanup();
    }
  });

  test.afterAll(async () => {
    // Cleanup temp directory
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test("kanban columns should scale to fill available width at different viewport sizes", async ({
    page,
  }) => {
    // Setup project and navigate to board view
    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Wait for the board to fully render
    await page.waitForTimeout(500);

    // Get all four kanban columns
    const backlogColumn = page.locator('[data-testid="kanban-column-backlog"]');
    const inProgressColumn = page.locator('[data-testid="kanban-column-in_progress"]');
    const waitingApprovalColumn = page.locator('[data-testid="kanban-column-waiting_approval"]');
    const verifiedColumn = page.locator('[data-testid="kanban-column-verified"]');

    // Verify all columns are visible
    await expect(backlogColumn).toBeVisible();
    await expect(inProgressColumn).toBeVisible();
    await expect(waitingApprovalColumn).toBeVisible();
    await expect(verifiedColumn).toBeVisible();

    // Test at different viewport widths
    const viewportWidths = [1024, 1280, 1440, 1920];

    for (const width of viewportWidths) {
      // Set viewport size
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(300); // Wait for resize to take effect

      // Get column widths
      const backlogBox = await backlogColumn.boundingBox();
      const inProgressBox = await inProgressColumn.boundingBox();
      const waitingApprovalBox = await waitingApprovalColumn.boundingBox();
      const verifiedBox = await verifiedColumn.boundingBox();

      expect(backlogBox).not.toBeNull();
      expect(inProgressBox).not.toBeNull();
      expect(waitingApprovalBox).not.toBeNull();
      expect(verifiedBox).not.toBeNull();

      if (backlogBox && inProgressBox && waitingApprovalBox && verifiedBox) {
        // All columns should have the same width
        const columnWidths = [
          backlogBox.width,
          inProgressBox.width,
          waitingApprovalBox.width,
          verifiedBox.width,
        ];

        // All columns should be equal width (within 2px tolerance for rounding)
        const baseWidth = columnWidths[0];
        for (const columnWidth of columnWidths) {
          expect(Math.abs(columnWidth - baseWidth)).toBeLessThan(2);
        }

        // Column width should be within expected bounds (240px min, 360px max)
        expect(baseWidth).toBeGreaterThanOrEqual(240);
        expect(baseWidth).toBeLessThanOrEqual(360);

        // Columns should not overlap (check x positions)
        expect(inProgressBox.x).toBeGreaterThan(backlogBox.x + backlogBox.width - 5);
        expect(waitingApprovalBox.x).toBeGreaterThan(inProgressBox.x + inProgressBox.width - 5);
        expect(verifiedBox.x).toBeGreaterThan(waitingApprovalBox.x + waitingApprovalBox.width - 5);
      }
    }
  });

  test("kanban columns should be centered in the viewport", async ({
    page,
  }) => {
    // Setup project and navigate to board view
    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Wait for the board to fully render
    await page.waitForTimeout(500);

    // Set a specific viewport size
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(300);

    // Get the first and last columns
    const backlogColumn = page.locator('[data-testid="kanban-column-backlog"]');
    const verifiedColumn = page.locator('[data-testid="kanban-column-verified"]');

    const backlogBox = await backlogColumn.boundingBox();
    const verifiedBox = await verifiedColumn.boundingBox();

    expect(backlogBox).not.toBeNull();
    expect(verifiedBox).not.toBeNull();

    if (backlogBox && verifiedBox) {
      // Calculate the left and right margins
      const leftMargin = backlogBox.x;
      const rightMargin = 1600 - (verifiedBox.x + verifiedBox.width);

      // The margins should be roughly equal (columns are centered)
      // Allow for some tolerance due to padding and gaps
      const marginDifference = Math.abs(leftMargin - rightMargin);
      expect(marginDifference).toBeLessThan(50); // Should be reasonably centered
    }
  });

  test("kanban columns should have no horizontal scrollbar at standard viewport width", async ({
    page,
  }) => {
    // Setup project and navigate to board view
    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Set a standard viewport size (1400px which is the default window width)
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForTimeout(300);

    // Check if horizontal scrollbar is present by comparing scrollWidth and clientWidth
    const hasHorizontalScroll = await page.evaluate(() => {
      const boardContainer = document.querySelector('[data-testid="board-view"]');
      if (!boardContainer) return false;
      return boardContainer.scrollWidth > boardContainer.clientWidth;
    });

    // There should be no horizontal scroll at standard width since columns scale down
    expect(hasHorizontalScroll).toBe(false);
  });
});
