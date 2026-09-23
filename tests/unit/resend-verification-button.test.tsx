import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResendVerificationButton } from "@/components/forms/resend-verification-button";

describe("ResendVerificationButton", () => {
  it("shows a loading state while pending, then a success message", async () => {
    let resolvePending: (value: { error?: string }) => void;
    const onResend = vi.fn(
      () =>
        new Promise<{ error?: string }>((resolve) => {
          resolvePending = resolve;
        }),
    );
    render(<ResendVerificationButton email="test@example.com" onResend={onResend} />);

    const button = screen.getByRole("button", { name: "Resend verification email" });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(onResend).toHaveBeenCalledWith("test@example.com");

    resolvePending!({});
    expect(await screen.findByText("Email resent — check your inbox.")).toBeInTheDocument();
  });

  it("shows an error and lets the user retry when onResend fails", async () => {
    const onResend = vi.fn().mockResolvedValue({ error: "We couldn't resend the email." });
    render(<ResendVerificationButton email="test@example.com" onResend={onResend} />);

    fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't resend the email.");
    expect(screen.getByRole("button", { name: "Resend verification email" })).not.toBeDisabled();
  });
});
