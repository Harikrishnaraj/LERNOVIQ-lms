import type { StaticImageData } from "next/image";
import discoverIcon from "@/assets/landing/delivery-discover.webp";
import defineIcon from "@/assets/landing/delivery-define.webp";
import designIcon from "@/assets/landing/delivery-design.webp";
import developIcon from "@/assets/landing/delivery-develop.webp";
import validateIcon from "@/assets/landing/delivery-validate.webp";
import supportIcon from "@/assets/landing/delivery-deliver-support.webp";

// The six delivery stages, shared by Home (short) and Delivery (full detail), from the design export.
export const DELIVERY_STAGES: {
  title: string;
  short: string;
  detail: string;
  icon: StaticImageData;
  badge: string;
}[] = [
  {
    title: "Discover",
    short: "Goals, learners, content and constraints.",
    detail:
      "Understand business goals, target learners, existing content, technology context, timelines and constraints.",
    icon: discoverIcon,
    badge: "bg-primary",
  },
  {
    title: "Define",
    short: "Scope, objectives and review criteria.",
    detail:
      "Agree on scope, learning objectives, content levels, deliverables, governance and review criteria.",
    icon: defineIcon,
    badge: "bg-landing-teal",
  },
  {
    title: "Design",
    short: "Architectures, outlines and storyboards.",
    detail:
      "Build learning architectures, course outlines, storyboards, experience flows and assessment plans.",
    icon: designIcon,
    badge: "bg-primary",
  },
  {
    title: "Develop",
    short: "Content and technology, built to scope.",
    detail:
      "Produce and configure agreed content and technology through coordinated specialist teams.",
    icon: developIcon,
    badge: "bg-landing-green",
  },
  {
    title: "Validate",
    short: "Accuracy, usability and acceptance.",
    detail:
      "Review instructional integrity, content accuracy, usability and agreed technical acceptance criteria.",
    icon: validateIcon,
    badge: "bg-primary",
  },
  {
    title: "Deliver & Support",
    short: "Handover, orientation and support.",
    detail:
      "Deploy or hand over agreed deliverables, orient stakeholder teams and provide scoped post-delivery support.",
    icon: supportIcon,
    badge: "bg-landing-green",
  },
];
