import { Suspense } from "react";
import PhoneScreen from "./phone";

export default function PlayPage() {
  return (
    <Suspense>
      <PhoneScreen />
    </Suspense>
  );
}
