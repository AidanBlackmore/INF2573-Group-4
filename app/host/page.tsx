import HostScreen from "./host-screen";

export default function HostPage() {
  // Read on the server so it does not need a NEXT_PUBLIC_ prefix.
  return <HostScreen feedbackUrl={process.env.FEEDBACK_URL || null} />;
}
