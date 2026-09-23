import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";

function fill(password: string, confirmPassword: string) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: confirmPassword },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
}

describe("ResetPasswordForm", () => {
  it("rejects a weak password without calling onSubmit", async () => {
    const onSubmit = vi.fn();
    render(<ResetPasswordForm onSubmit={onSubmit} />);
    fill("short1", "short1");
    submit();
    expect(
      await screen.findByText("Password must be at least 8 characters"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a mismatched confirm password without calling onSubmit", async () => {
    const onSubmit = vi.fn();
    render(<ResetPasswordForm onSubmit={onSubmit} />);
    fill("password1", "password2");
    submit();
    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with validated data once fields are valid", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ResetPasswordForm onSubmit={onSubmit} />);
    fill("password1", "password1");
    submit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        password: "password1",
        confirmPassword: "password1",
      }),
    );
  });

  it("shows the error banner when onSubmit reports one", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ error: "Link expired." });
    render(<ResetPasswordForm onSubmit={onSubmit} />);
    fill("password1", "password1");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Link expired.");
  });
});
