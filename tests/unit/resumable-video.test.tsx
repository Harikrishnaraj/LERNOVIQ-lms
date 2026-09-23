import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { ResumableVideo } from "@/components/player/resumable-video";

function setup(saved: number, onSave?: (s: number) => Promise<unknown>) {
  const { container } = render(
    <ResumableVideo src="https://cdn.example.com/v.mp4" savedPosition={saved} onSavePosition={onSave} />,
  );
  const video = container.querySelector("video")!;
  Object.defineProperty(video, "duration", { value: 100, configurable: true });
  video.currentTime = 0;
  return video;
}

describe("ResumableVideo", () => {
  it("seeks to the saved position once metadata is loaded", () => {
    const video = setup(42, vi.fn().mockResolvedValue({}));
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(42);
  });

  it("starts over when the saved position is at the very end", () => {
    const video = setup(98, vi.fn().mockResolvedValue({}));
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(0);
  });

  it("saves the position on pause", () => {
    const onSave = vi.fn().mockResolvedValue({});
    const video = setup(0, onSave);
    video.currentTime = 17.4;
    fireEvent.pause(video);
    expect(onSave).toHaveBeenCalledWith(17.4);
  });

  it("throttles time updates while playing", () => {
    const onSave = vi.fn().mockResolvedValue({});
    const video = setup(0, onSave);
    fireEvent.timeUpdate(video);
    fireEvent.timeUpdate(video);
    fireEvent.timeUpdate(video);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("resets the saved position when the video ends", () => {
    const onSave = vi.fn().mockResolvedValue({});
    const video = setup(0, onSave);
    fireEvent.ended(video);
    expect(onSave).toHaveBeenCalledWith(0);
  });

  it("does not track anything without a save handler (previews)", () => {
    const video = setup(0);
    fireEvent.pause(video);
    fireEvent.timeUpdate(video);
    fireEvent.ended(video);
    expect(video).toBeTruthy(); // no throw, nothing to assert on
  });

  it("survives a failing save without throwing", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("offline"));
    const video = setup(0, onSave);
    fireEvent.pause(video);
    await Promise.resolve();
    expect(onSave).toHaveBeenCalled();
  });
});
