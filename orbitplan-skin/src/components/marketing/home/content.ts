/**
 * Homepage copy and structured data.
 * Keep marketing strings here so sections stay presentational and easy to reuse.
 */

export type ProofStat = {
  label: string;
  value: string;
};

export type FeatureBlurb = {
  title: string;
  subtitle: string;
  body: string;
};

export const homeProofStats: ProofStat[] = [
  { label: "Faster follow-ups", value: "2×" },
  { label: "Clearer ownership", value: "1 source" },
  { label: "Less rework", value: "Grounded" },
  { label: "Audit-friendly", value: "Logged" },
];

export const homeHowItWorks: FeatureBlurb[] = [
  {
    title: "Capture",
    subtitle: "Upload or import meeting context",
    body: "Bring in a recording or transcript. OrbitPlan stores a traceable meeting record so nothing important gets lost.",
  },
  {
    title: "Extract",
    subtitle: "Transcript-backed understanding",
    body: "Generate decisions, risks, notes, and action candidates. Every output stays grounded on the meeting context.",
  },
  {
    title: "Execute",
    subtitle: "Confirm owners and next steps",
    body: "Edit and approve action items, then export to Jira or share via email—turning talk into accountable delivery.",
  },
];

export const homeFeatureHighlights: FeatureBlurb[] = [
  {
    title: "Conversation → Plan",
    subtitle: "Structured outcomes in minutes",
    body: "OrbitPlan turns transcripts into decisions, risks, notes, and actionable next steps—grounded on what was actually said.",
  },
  {
    title: "Human-in-the-loop control",
    subtitle: "Approval gate by default",
    body: "Nothing “ships” automatically. Review, edit, and confirm action items before exporting or sending anything outward.",
  },
  {
    title: "Integrations that matter",
    subtitle: "Zoom / Teams / Jira",
    body: "Import meeting context from Zoom and Microsoft Teams, then export execution to Jira—keeping work and evidence connected.",
  },
];

export const homeAsyncPipelineSteps: string[] = [
  "Create meeting metadata",
  "Upload or import recording/transcript",
  "Start processing (202) → poll until ready",
  "Approve and export to execution tools",
];
