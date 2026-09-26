import { z } from "zod";

// The platform-wide minimum (T-143) can only be read async; client-side forms use this fixed
// floor for instant feedback and the server re-validates against the real configured value
// regardless, so a raised minimum is only ever a UX mismatch, never a security gap.
export const DEFAULT_MIN_PASSWORD_LENGTH = 8;

function strongPassword(minLength: number) {
  return z
    .string()
    .min(minLength, `Password must be at least ${minLength} characters`)
    .regex(/[A-Za-z]/, "Password must include a letter")
    .regex(/[0-9]/, "Password must include a number");
}

export interface SignUpInput {
  email: string;
  password: string;
  confirmPassword: string;
}

export function buildSignUpSchema(minLength: number) {
  return z
    .object({
      email: z.email("Enter a valid email address"),
      password: strongPassword(minLength),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });
}

export const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export interface ResetPasswordInput {
  password: string;
  confirmPassword: string;
}

export function buildResetPasswordSchema(minLength: number) {
  return z
    .object({
      password: strongPassword(minLength),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });
}
