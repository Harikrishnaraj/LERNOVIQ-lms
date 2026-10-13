import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// F-704 (T-204): the admin AI settings form sends only valid changes and shows the server's
// refusal. The kill switch saves on its own.

const { updateMock, refreshMock } = vi.hoisted(() => ({
  updateMock: vi.fn(),
  refreshMock: vi.fn(),
}));
vi.mock("@/features/admin/ai-settings-actions", () => ({ updateAiSettings: updateMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { AiSettingsForm } from "@/components/admin/ai-settings-form";
import { DEFAULT_AI_SETTINGS } from "@/features/ai/settings-rules";

const renderForm = (over = {}) =>
  render(
    <AiSettingsForm
      settings={{ ...DEFAULT_AI_SETTINGS, ...over }}
      defaultModel="openai/gpt-oss-120b"
    />,
  );

describe("AiSettingsForm", () => {
  beforeEach(() => {
    updateMock.mockReset().mockResolvedValue({ ok: true });
    refreshMock.mockReset();
  });

  it("shows the current state and turns the tutor off on its own", async () => {
    renderForm();
    expect(screen.getByText("On")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /turn off the ai tutor/i }));
    expect(await screen.findByText("AI Tutor turned off.")).toBeInTheDocument();
    expect(updateMock).toHaveBeenCalledWith({ tutorEnabled: false });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("offers to turn it back on when it is off", () => {
    renderForm({ tutorEnabled: false });
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /turn on the ai tutor/i })).toBeInTheDocument();
  });

  it("lists the server default and the allow-listed models only", () => {
    renderForm();
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual([
      "Server default (openai/gpt-oss-120b)",
      "GPT-OSS 120B (stronger, default)",
      "GPT-OSS 20B (cheaper, faster)",
    ]);
  });

  it("saves the model, limits and hint-only mode together", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "openai/gpt-oss-20b" } });
    fireEvent.change(screen.getByLabelText("Longest answer (tokens)"), {
      target: { value: "800" },
    });
    fireEvent.change(screen.getByLabelText("Questions per learner per day"), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByLabelText(/always hint-only/i));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
    expect(updateMock).toHaveBeenCalledWith({
      tutorModel: "openai/gpt-oss-20b",
      maxAnswerTokens: 800,
      dailyQuestionCap: 25,
      hintOnlyAlways: true,
    });
  });

  it("sends null for the server default model", async () => {
    renderForm({ tutorModel: "openai/gpt-oss-20b" });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await screen.findByText("Settings saved.");
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ tutorModel: null }));
  });

  it("shows the server's refusal and does not claim success", async () => {
    updateMock.mockResolvedValue({
      ok: false,
      error: "You do not have permission to change AI settings.",
    });
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("do not have permission");
    expect(screen.queryByText("Settings saved.")).not.toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
