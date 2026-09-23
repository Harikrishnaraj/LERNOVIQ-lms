import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
}

describe("ForgotPasswordForm", () => {
  it("rejects an invalid email without calling onSubmit", async () => {
    const onSubmit = vi.fn();
    render(<ForgotPasswordForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    submit();
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the generic success message and hides the form once sent", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ message: "Check your inbox." });
    render(<ForgotPasswordForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.com" } });
    submit();
    expect(await screen.findByText("Check your inbox.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send reset link" })).not.toBeInTheDocument();
  });

  it("shows the error banner when onSubmit reports one", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ error: "Too many attempts." });
    render(<ForgotPasswordForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.com" } });
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts.");
  });

  it("shows a loading state while onSubmit is pending", async () => {
    let resolveSubmit: (v: { message: string }) => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<{ message: string }>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    render(<ForgotPasswordForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.com" } });
    submit();

    const button = await screen.findByRole("button", { name: "Send reset link" });
    await waitFor(() => expect(button).toBeDisabled());

    resolveSubmit!({ message: "Sent." });
    await waitFor(() => expect(screen.getByText("Sent.")).toBeInTheDocument());
  });
});
