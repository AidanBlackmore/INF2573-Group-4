// All story content lives here. Add or edit universes without touching game
// logic. Placeholders: {winner} is the most-voted answer, {runner_up} the
// second most. Both are filled in with player names in person-picking acts.

export type Split = "together" | "majority" | "divided";

export type PlayerAct = {
  kind: "player";
  title: string;
  scenario: string;
  // One outcome per split type.
  outcomes: Record<Split, string>;
};

export type OptionAct = {
  kind: "option";
  title: string;
  scenario: string;
  // Kept separate from the outcomes so the opener can later be replaced by an
  // AI-generated line without touching the written outcomes.
  openers: Record<Split, string>;
  options: { key: string; label: string; outcome: string }[];
};

export type Act = PlayerAct | OptionAct;

export type Universe = {
  id: string;
  title: string;
  tagline: string;
  tone: string;
  acts: Act[];
};

export const UNIVERSE_META = "About 15-20 min · 2-6 players";

export const UNIVERSES: Universe[] = [
  {
    id: "mall-night",
    title: "Mall Night",
    tagline: "Locked inside an empty mall until morning.",
    tone: "Light mystery",
    acts: [
      {
        kind: "player",
        title: "The money",
        scenario:
          "The doors locked at 10 p.m. and your group is still inside the empty Glenview Mall. Between you, you have $47 in cash. Only one person can hold it. Who should it be?",
        outcomes: {
          together:
            "No debate. {winner} pockets the $47 and everyone relaxes a little. Somewhere in the dark, a vending machine hums.",
          majority:
            "{winner} takes the cash. Not everyone voted that way, and {winner} can feel the group watching the wallet. Somewhere in the dark, a vending machine hums.",
          divided:
            "No one wins outright, so the cash is split between {winner} and {runner_up} for now. Two wallets, one vending machine humming somewhere in the dark.",
        },
      },
      {
        kind: "option",
        title: "The noise",
        scenario:
          "A crash echoes from the food court. Something, or someone, is in there. What do you do?",
        openers: {
          together: "Nobody hesitates.",
          majority: "Most of you agree, so the group goes with it.",
          divided: "The group is pulled three ways, but you have to pick something.",
        },
        options: [
          {
            key: "A",
            label: "Go and look, all together",
            outcome:
              "You creep into the food court in a tight group. It's a raccoon, elbow-deep in a bag of pretzels. It stares, then waddles through a door marked STAFF ONLY that's propped open.",
          },
          {
            key: "B",
            label: "Barricade the corridor and wait",
            outcome:
              "You drag benches across the corridor. The crashing stops. Ten minutes later a raccoon squeezes under the benches, drops a staff keycard at your feet, and leaves.",
          },
          {
            key: "C",
            label: "Ignore it and look for an exit",
            outcome:
              "Every exit is chained. On the way back you notice the STAFF ONLY door in the food court is propped open, the trash cans beside it knocked over.",
          },
        ],
      },
      {
        kind: "option",
        title: "The voice",
        scenario:
          "In the staff room you find a security radio. A voice crackles through: 'Is someone in the mall? I'm locked on the parking level. Can you let me up?' You can't see who it is.",
        openers: {
          together: "You all know what to do.",
          majority: "Not unanimous, but the group decides.",
          divided: "Opinions are all over the place. Someone finally presses the button.",
        },
        options: [
          {
            key: "A",
            label: "Let them up",
            outcome:
              "The elevator opens on Dot, the night cleaner, holding a thermos of tea she insists on sharing. She knows where the spare keys are: upstairs, in the dark management office.",
          },
          {
            key: "B",
            label: "Ask questions over the radio first",
            outcome:
              "'Dot, night cleaner, eleven years here.' She answers every question patiently, then mentions the spare keys are in the management office upstairs.",
          },
          {
            key: "C",
            label: "Stay quiet",
            outcome:
              "You say nothing. After a while the radio sighs, to no one: 'Fine. Spare keys are in the management office, if anyone's listening.' Then static.",
          },
        ],
      },
      {
        kind: "player",
        title: "Dawn",
        scenario:
          "You find the keys. One door opens onto the street, but the alarm will go off the moment it does. One person steps out first to explain things to whoever shows up. Who should it be?",
        outcomes: {
          together:
            "{winner} steps out first. The morning is cold and very bright. Behind {winner}, the rest of you file out, still arguing about the raccoon.",
          majority:
            "{winner} goes first, with one look back at the group. The alarm screams. Somehow, everyone is laughing.",
          divided:
            "Nobody can agree, so you all go at once, squeezing through the door together as the alarm screams. The least dignified exit possible, and the best part of the night.",
        },
      },
    ],
  },
  {
    id: "last-train",
    title: "Last Train",
    tagline: "Your night train is stuck in the snow.",
    tone: "Cozy, everyday",
    acts: [
      {
        kind: "player",
        title: "The blanket",
        scenario:
          "Your night train has stopped in deep snow somewhere between two towns. The heating is weak, and there is one thick wool blanket in the luggage rack. Who should get it first?",
        outcomes: {
          together:
            "{winner} wraps up in the blanket without argument. Outside, snow keeps falling past the windows, slow and endless.",
          majority:
            "The blanket goes to {winner}, who offers to share a corner anyway. Outside, snow keeps falling past the windows.",
          divided:
            "No clear answer, so {winner} and {runner_up} share the blanket, shoulder to shoulder. Outside, snow keeps falling past the windows.",
        },
      },
      {
        kind: "option",
        title: "The dark",
        scenario:
          "The lights flicker and go out. In the dark, you hear the dining car door slide open at the end of the carriage. What do you do?",
        openers: {
          together: "Everyone moves at once.",
          majority: "Most of you have the same idea, so you follow it.",
          divided: "Everyone has a different plan. In the end, you just pick one.",
        },
        options: [
          {
            key: "A",
            label: "Go to the dining car together",
            outcome:
              "The dining car is empty except for a pot of cocoa, still warm, and a handwritten sign: HELP YOURSELVES. A map of the line is pinned beside it.",
          },
          {
            key: "B",
            label: "Stay in your seats and wait for the lights",
            outcome:
              "After a few minutes the lights flicker back on. Someone has left a pot of warm cocoa and a map of the line on the seat across from you.",
          },
          {
            key: "C",
            label: "Use phone flashlights to find the conductor",
            outcome:
              "You find the conductor asleep in the last carriage, snoring gently. Beside him: a map of the line and a radio that only plays static.",
          },
        ],
      },
      {
        kind: "option",
        title: "The station",
        scenario:
          "The map shows a tiny station two kilometres ahead. The radio crackles: rescue might come at dawn, or might not. What do you do?",
        openers: {
          together: "No discussion needed.",
          majority: "It isn't unanimous, but the group commits.",
          divided: "The vote is scattered. Someone shrugs and makes the call.",
        },
        options: [
          {
            key: "A",
            label: "Walk to the station through the snow",
            outcome:
              "The walk is cold and quiet. The station has one light on and a vending machine full of hot drinks. On the bench, an old station keeper looks up: 'You're my first visitors in a year.'",
          },
          {
            key: "B",
            label: "Stay on the train until dawn",
            outcome:
              "You stay. Near midnight there's a knock on the window: an old station keeper with a lantern, who walked out to check on the stopped train.",
          },
          {
            key: "C",
            label: "Call out on the radio and wait for an answer",
            outcome:
              "After a long silence the radio answers: 'Station keeper here. Stay put, I'm coming with a lantern.' Twenty minutes later, a light bobs through the snow.",
          },
        ],
      },
      {
        kind: "player",
        title: "Dawn",
        scenario:
          "At dawn a snowplough arrives to clear the track. The driver needs one person to ride up front and watch the line ahead. Who should it be?",
        outcomes: {
          together:
            "{winner} climbs into the cab with the driver. The train moves again, and the sunrise turns the snow pink.",
          majority:
            "{winner} rides up front, waving back at the carriage. The train moves again, and the sunrise turns the snow pink.",
          divided:
            "The driver laughs and squeezes {winner} and {runner_up} into the cab together. The train moves again, and the sunrise turns the snow pink.",
        },
      },
    ],
  },
  {
    id: "station-zero",
    title: "Station Zero",
    tagline: "A space station, 12 hours from rescue.",
    tone: "Sci-fi",
    acts: [
      {
        kind: "player",
        title: "The code",
        scenario:
          "Station Zero has lost contact with Earth. Rescue is 12 hours away. The station needs one crew member to hold the master access code. Who should it be?",
        outcomes: {
          together:
            "{winner} receives the code without a single objection. Through the window, Earth turns slowly, blue and silent.",
          majority:
            "{winner} takes the code. A few votes went elsewhere, and {winner} keeps the keycard close. Through the window, Earth turns slowly.",
          divided:
            "No majority, so the code is split in two: half to {winner}, half to {runner_up}. Through the window, Earth turns slowly.",
        },
      },
      {
        kind: "option",
        title: "The greenhouse",
        scenario:
          "An alarm: oxygen in the greenhouse module is dropping. The plants are the station's backup air supply. What do you do?",
        openers: {
          together: "The crew moves as one.",
          majority: "Most of the crew agrees, and the plan is set.",
          divided: "The crew is split three ways. The clock decides for you.",
        },
        options: [
          {
            key: "A",
            label: "Go in and fix it together",
            outcome:
              "Inside the greenhouse, a tiny maintenance robot is tangled in a vine, blocking an air vent. You free it. It beeps gratefully and rolls off toward the comms room.",
          },
          {
            key: "B",
            label: "Seal the module and save oxygen",
            outcome:
              "You seal the doors. Through the glass, a tiny maintenance robot untangles itself from a vine, clears the vent, then taps on the window and points toward the comms room.",
          },
          {
            key: "C",
            label: "Reroute power from the lights",
            outcome:
              "The station dims to emergency red. In the glow, a tiny maintenance robot rolls past, beeping urgently, and leads the way toward the comms room.",
          },
        ],
      },
      {
        kind: "option",
        title: "The signal",
        scenario:
          "In the comms room, a faint signal arrives. It isn't Earth. It's another ship, close by, asking to dock. What do you do?",
        openers: {
          together: "Everyone agrees instantly.",
          majority: "Not everyone is sure, but the crew decides.",
          divided: "No two answers match. Someone reaches for the switch.",
        },
        options: [
          {
            key: "A",
            label: "Let them dock",
            outcome:
              "The docking hatch opens on a cargo pilot named Ren, carrying a crate of space noodles and a spare long-range antenna.",
          },
          {
            key: "B",
            label: "Ask who they are first",
            outcome:
              "'Ren, cargo pilot, lost my route.' Ren answers every question, then mentions a spare long-range antenna in the hold.",
          },
          {
            key: "C",
            label: "Stay silent and wait for Earth",
            outcome:
              "You stay silent. The other ship drifts past, and a small crate floats toward your airlock. Inside: a spare long-range antenna and a note that says 'Good luck.'",
          },
        ],
      },
      {
        kind: "player",
        title: "The spacewalk",
        scenario:
          "With the antenna you can reach Earth. One crew member must suit up and spacewalk to mount it on the hull. Who should go?",
        outcomes: {
          together:
            "{winner} floats out into the stars, steady and slow. The antenna clicks into place, and Earth's voice fills the station.",
          majority:
            "{winner} suits up and gives the crew a thumbs up through the airlock. The antenna clicks into place, and Earth answers.",
          divided:
            "The crew can't choose, so {winner} and {runner_up} go out together, tethered side by side. The antenna clicks into place, and Earth answers.",
        },
      },
    ],
  },
  {
    id: "moonlight-academy",
    title: "Moonlight Academy",
    tagline: "Your team's final exam at a school of magic.",
    tone: "Fantasy",
    acts: [
      {
        kind: "player",
        title: "The lantern",
        scenario:
          "It's the final exam at Moonlight Academy. Your team gets one magic lantern that lights the way through the Labyrinth. Who should carry it?",
        outcomes: {
          together:
            "{winner} lifts the lantern and it glows warm gold. The Labyrinth doors creak open.",
          majority:
            "The lantern goes to {winner}. It flickers once, then settles into a steady glow. The Labyrinth doors creak open.",
          divided:
            "No one gets a majority, so {winner} and {runner_up} hold the lantern together, and it glows twice as bright. The Labyrinth doors creak open.",
        },
      },
      {
        kind: "option",
        title: "Three paths",
        scenario:
          "Three paths lie ahead: a library of whispering books, a staircase that keeps moving, and a garden of singing flowers. Which way?",
        openers: {
          together: "The whole team points the same way.",
          majority: "Most of the team leans one way, so you follow.",
          divided: "Every path gets a vote. You choose one and hope for the best.",
        },
        options: [
          {
            key: "A",
            label: "The whispering library",
            outcome:
              "The books whisper riddles as you pass. One falls open at your feet, showing a map with a golden key drawn at its centre.",
          },
          {
            key: "B",
            label: "The moving staircase",
            outcome:
              "The staircase swings wildly but holds. At the top, a golden key hangs on a hook, swaying gently.",
          },
          {
            key: "C",
            label: "The singing garden",
            outcome:
              "The flowers sing louder as you walk. In the middle of the garden, a golden key rests inside a sleeping tulip.",
          },
        ],
      },
      {
        kind: "option",
        title: "The talking door",
        scenario:
          "At the Labyrinth's heart, a talking door blocks the way. 'Answer my riddle,' it says, 'or try your key and risk a curse.' What do you do?",
        openers: {
          together: "Nobody needs convincing.",
          majority: "Not unanimous, but the team commits.",
          divided: "Opinions scatter like sparks. Someone steps forward.",
        },
        options: [
          {
            key: "A",
            label: "Answer the riddle",
            outcome:
              "You talk the riddle through together and get it right. The door sighs, impressed, and swings open onto the final hall.",
          },
          {
            key: "B",
            label: "Try the key",
            outcome:
              "The key turns. The 'curse' is a puff of glitter that won't wash out. The door swings open onto the final hall.",
          },
          {
            key: "C",
            label: "Ask the door for a hint first",
            outcome:
              "The door is delighted to be asked. It gives a hint so obvious it feels like cheating, and swings open onto the final hall.",
          },
        ],
      },
      {
        kind: "player",
        title: "The final hall",
        scenario:
          "In the final hall, the headmistress waits. One student must step forward to present the team's lantern. Who should it be?",
        outcomes: {
          together:
            "{winner} steps forward with the lantern. The headmistress smiles: the whole team passes.",
          majority:
            "{winner} presents the lantern, glancing back at the team. The headmistress smiles: the whole team passes.",
          divided:
            "Nobody can decide, so the whole team steps forward at once, crowding around the lantern. The headmistress laughs: the whole team passes.",
        },
      },
    ],
  },
];

export function getUniverse(id: string | null | undefined): Universe | undefined {
  return UNIVERSES.find((u) => u.id === id);
}
