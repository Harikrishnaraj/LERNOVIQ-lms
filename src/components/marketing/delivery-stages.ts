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
}[] = [
  {
    title: "Discover",
    short: "Goals, learners, content and constraints.",
    detail:
      "Understand business goals, target learners, existing content, technology context, timelines and constraints.",
    icon: discoverIcon,
  },
  {
    title: "Define",
    short: "Scope, objectives and review criteria.",
    detail:
      "Agree on scope, learning objectives, content levels, deliverables, governance and review criteria.",
    icon: defineIcon,
  },
  {
    title: "Design",
    short: "Architectures, outlines and storyboards.",
    detail:
      "Build learning architectures, course outlines, storyboards, experience flows and assessment plans.",
    icon: designIcon,
  },
  {
    title: "Develop",
    short: "Content and technology, built to scope.",
    detail:
      "Produce and configure agreed content and technology through coordinated specialist teams.",
    icon: developIcon,
  },
  {
    title: "Validate",
    short: "Accuracy, usability and acceptance.",
    detail:
      "Review instructional integrity, content accuracy, usability and agreed technical acceptance criteria.",
    icon: validateIcon,
  },
  {
    title: "Deliver & Support",
    short: "Handover, orientation and support.",
    detail:
      "Deploy or hand over agreed deliverables, orient stakeholder teams and provide scoped post-delivery support.",
    icon: supportIcon,
  },
];
