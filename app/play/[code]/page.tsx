import { Suspense } from "react";
import PlayerScreen from "./player-screen";

export default function PlayPage() {
  return (
    <Suspense>
      <PlayerScreen />
    </Suspense>
  );
}
