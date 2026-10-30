/** F-443 (T-285): the exact wording agreed to is stored with each record, so it lives in one place. */
export const POLICY_VERSION = "2026-10-20";

export const CONSENT_PURPOSES = {
  enquiry_contact: {
    text: "I agree that LERNOVIQ may use the information I provide to respond to this enquiry.",
  },
} as const;

export type ConsentPurpose = keyof typeof CONSENT_PURPOSES;
