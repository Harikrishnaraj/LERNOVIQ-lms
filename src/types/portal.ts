export const PORTALS = ["learner", "instructor", "admin"] as const;
export type Portal = (typeof PORTALS)[number];
