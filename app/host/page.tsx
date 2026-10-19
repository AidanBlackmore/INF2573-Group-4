import TvScreen from "./tv";

export default function HostPage() {
  // Read on the server so it does not need a NEXT_PUBLIC_ prefix.
  return <TvScreen feedbackUrl={process.env.FEEDBACK_URL || null} />;
}
