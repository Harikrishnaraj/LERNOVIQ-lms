import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ScormPlayer } from "@/components/player/scorm-player";

function wrapper(container: HTMLElement) {
  return container.querySelector("[data-fullscreen]") as HTMLElement;
}

describe("ScormPlayer full screen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen;
  });

  it("uses the browser Fullscreen API when it is available", async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen = request;
    const { container } = render(<ScormPlayer lessonId="l1" token="t" launchPath="index.html" />);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    await waitFor(() => expect(wrapper(container).dataset.fullscreen).toBe("native"));
    expect(request).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Exit full screen" })).toBeTruthy();
  });

  it("falls back to a full-viewport overlay without the API, and Escape closes it", async () => {
    const { container } = render(<ScormPlayer lessonId="l1" token="t" launchPath="index.html" />);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    await waitFor(() => expect(wrapper(container).dataset.fullscreen).toBe("overlay"));
    expect(wrapper(container).className).toContain("fixed inset-0");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(wrapper(container).dataset.fullscreen).toBe("off"));
  });

  it("lets the package's own full-screen request through the iframe", async () => {
    const { container } = render(<ScormPlayer lessonId="l1" token="t" launchPath="index.html" />);
    await waitFor(() =>
      expect(container.querySelector("iframe")?.getAttribute("allow")).toBe("fullscreen"),
    );
  });
});
