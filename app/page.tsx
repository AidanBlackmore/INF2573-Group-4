import TvScreen from "./host/tv";

// The site opens on The Gathering's main screen: the TV, with its QR code.
// Phones join by scanning it, or by typing the code at /join.
export default function Home() {
  // Read on the server so it does not need a NEXT_PUBLIC_ prefix.
  return <TvScreen feedbackUrl={process.env.FEEDBACK_URL || null} />;
}
