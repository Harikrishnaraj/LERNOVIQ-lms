import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignUpForm } from "@/components/forms/signup-form";

function fill(email: string, password: string, confirmPassword: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: confirmPassword },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("SignUpForm", () => {
  it("rejects an invalid email without calling onSubmit", async () => {
    const onSubmit = vi.fn();
    render(<SignUpForm onSubmit={onSubmit} />);
    fill("not-an-email", "password1", "password1");
    submit();
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a weak password without calling onSubmit", async () => {
    const onSubmit = vi.fn();
    render(<SignUpForm onSubmit={onSubmit} />);
    fill("test@example.com", "short1", "short1");
    submit();
    expect(
      await screen.findByText("Password must be at least 8 characters"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a mismatched confirm password without calling onSubmit", async () => {
    const onSubmit = vi.fn();
    render(<SignUpForm onSubmit={onSubmit} />);
    fill("test@example.com", "password1", "password2");
    submit();
    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with validated data once fields are valid", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SignUpForm onSubmit={onSubmit} />);
    fill("test@example.com", "password1", "password1");
    submit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password1",
        confirmPassword: "password1",
      }),
    );
  });

  it("shows a loading state while onSubmit is pending", async () => {
    let resolveSubmit: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    render(<SignUpForm onSubmit={onSubmit} />);
    fill("test@example.com", "password1", "password1");
    submit();

    const button = await screen.findByRole("button", { name: "Create account" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");

    resolveSubmit!();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("shows the form-level error banner when onSubmit reports an error", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ error: "Something went wrong." });
    render(<SignUpForm onSubmit={onSubmit} />);
    fill("test@example.com", "password1", "password1");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
  });
});
