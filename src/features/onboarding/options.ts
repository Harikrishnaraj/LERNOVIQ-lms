// Fixed choice lists. Interests are stored as these slugs; the catalog categories (T-030)
// map onto them for recommendations (T-042).
export const INTEREST_OPTIONS = [
  { value: "software-development", label: "Software development" },
  { value: "data-science", label: "Data & AI" },
  { value: "design", label: "Design" },
  { value: "business", label: "Business" },
  { value: "marketing", label: "Marketing" },
  { value: "finance", label: "Finance" },
  { value: "languages", label: "Languages" },
  { value: "personal-development", label: "Personal development" },
] as const;

export const GOAL_OPTIONS = [
  { value: "career-change", label: "Change careers" },
  { value: "promotion", label: "Get promoted" },
  { value: "certification", label: "Earn a certification" },
  { value: "new-skill", label: "Learn a new skill" },
  { value: "hobby", label: "Learn for fun" },
] as const;
