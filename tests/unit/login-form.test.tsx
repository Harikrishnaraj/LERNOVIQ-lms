import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LoginForm } from "@/components/forms/login-form";

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
}

describe("LoginForm", () => {
  it("rejects an invalid email without calling onSubmit", async () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);
    fill("not-an-email", "password1");
    submit();
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects an empty password without calling onSubmit", async () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);
    fill("test@example.com", "");
    submit();
    expect(await screen.findByText("Enter your password")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with validated data once fields are valid", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<LoginForm onSubmit={onSubmit} />);
    fill("test@example.com", "password1");
    submit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ email: "test@example.com", password: "password1" }),
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
    render(<LoginForm onSubmit={onSubmit} />);
    fill("test@example.com", "password1");
    submit();

    const button = await screen.findByRole("button", { name: "Log in" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");

    resolveSubmit!();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("shows the safe generic error banner when onSubmit reports one", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ error: "Invalid email or password." });
    render(<LoginForm onSubmit={onSubmit} />);
    fill("test@example.com", "password1");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
  });
});
