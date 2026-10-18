'use strict';
// Authored fiction: identities never imply anything about the real players.
const ROLES = [
  {
    title: 'The co-founder', relationship: 'You built Rain House with Alex, before there was money or a name on the door.',
    introduction: 'Alex’s oldest partner in the house. You still carry a key from the first summer.',
    secret: 'Alex removed your name from the ownership papers. You threatened to challenge the sale, but the only signed copy of your original agreement is in his archive.',
    motive: 'Selling the house would erase your life’s work and leave you with nothing. Alex knew you could not afford a legal fight.',
    document: 'An unsigned settlement lies beside a much older partnership agreement. In the margin: “You cannot sell my half of our lives and call it your generosity.”',
    confession: 'When Alex said the original agreement would disappear with the sale, you decided he would never sign it. You promised him a missing ownership document to draw him away from dinner.'
  },
  {
    title: 'The fund keeper', relationship: 'Alex trusted you to keep the community fund running when donations stopped.',
    introduction: 'The person who kept the lights on and the bills paid. Alex asked you to bring the accounts tonight.',
    secret: 'You moved restricted money into emergency repairs without approval. Nothing went into your pocket, but Alex planned to describe it as theft to protect his own decisions.',
    motive: 'Tomorrow’s audit could destroy your reputation. Alex refused to include the messages in which he told you to keep the house open at any cost.',
    document: 'An emergency repair transfer carries a handwritten instruction from Alex: “Use what is available. We will sort the permissions later.” A newer audit summary omits that instruction.',
    confession: 'Alex told you he would let the audit call you a thief. You offered to show him the missing transfer authorization, then used the darkness to silence him.'
  },
  {
    title: 'The restorer', relationship: 'Alex commissioned you to bring the old rooms back to life.',
    introduction: 'You know the building’s scars better than anyone. The finished rooms are your work.',
    secret: 'Under pressure from Alex, you signed off unfinished repairs. You kept a copy of his instructions, but your signature is the one an inspector would see first.',
    motive: 'Alex was about to hand over the inspection file and deny he had rushed the work. Your livelihood was on that page.',
    document: 'Two repair sheets share a date. One says “work outstanding”; the signed one says “complete.” Alex’s attached message reads: “Sign it tonight or I find someone else.”',
    confession: 'You believed Alex would sacrifice your career to make the sale look clean. You lured him away with the inspection copy you said you were ready to surrender.'
  },
  {
    title: 'The programme organiser', relationship: 'You run the workshops and the small support programme that made this house a home.',
    introduction: 'Most people who use Rain House know you before they know Alex.',
    secret: 'You promised participants another year of support after Alex privately told you he might close the programme. You hoped a donor would arrive before anyone had to know.',
    motive: 'The sale would leave people you had reassured without a place to go. Alex intended to read your promises aloud and make the failure yours.',
    document: 'A programme calendar promises another year. Behind it is Alex’s cancellation notice, dated a week earlier, with a reply: “Give me until Friday. I can still save this.”',
    confession: 'You could not bear to watch Alex close the programme and blame you for its promises. You told him a donor’s guarantee was waiting in another room.'
  },
  {
    title: 'The archivist', relationship: 'Alex asked you to preserve the letters and memories entrusted to Rain House.',
    introduction: 'You look after the house’s papers, including letters their writers never intended strangers to read.',
    secret: 'You quietly removed names from a donor dossier to protect people who had asked for privacy. Alex kept the unedited originals and threatened to expose both them and your intervention.',
    motive: 'Alex planned to turn private hardships into evidence of the house’s value. You had promised those people their stories were safe.',
    document: 'A redacted donor dossier is clipped to an angry note from Alex: “Restore the names. Buyers want human stories, not black bars.” The original permissions forbid publicity.',
    confession: 'Alex refused to return the private letters. You offered him the unredacted index as a reason to leave the table, then made sure he could not release it.'
  },
  {
    title: 'The former protégé', relationship: 'Alex gave you your first opportunity here, then put his name on the work you created.',
    introduction: 'You once called Alex your mentor. Tonight is the first time you have accepted his invitation in months.',
    secret: 'You sent Alex a demand to acknowledge your work. His answer threatened to publish a selectively edited account of a dispute that could cost you your next job.',
    motive: 'Alex controlled the story of your career, and tonight he meant to tell it his way one last time.',
    document: 'Early project drafts bear your name. The published version credits Alex alone. A later letter asks for a correction; his reply threatens to contact your prospective employer.',
    confession: 'You believed Alex would destroy your future before letting you reclaim your work. You used the original project drafts as a pretext to draw him into the room.'
  }
];
const TITLES = ['The envelope at your place', 'A house holding its breath', 'Something worth searching for', 'What the papers leave out', 'The price of opening everything', 'Before the rain lets up'];
function scene(r) {
  const room = r.solution?.room;
  const discovery = r.discoverers?.length ? `${r.discoverers.join(' and ')} call from the ${room}.` : `Alex’s abandoned phone lights up with a watch alert: ${room}.`;
  return [
    '',
    'By the time the last guest arrives, rain has washed the road to Rain House into a silver blur. Alex has set a place for everyone who helped make the house what it is. Nobody expected the invitation to feel like a summons.\n\n“I have accepted an offer for the house,” he says. “Before the papers go to the auditor tomorrow, there are things we should settle.” He looks around the table, then leaves to fetch a ledger.\n\nAn envelope remains beside his glass. A payment receipt slips from the fold; beneath it, a stranger’s letter begins, “Please do not read this aloud.” Someone reaches for it. Before the seal breaks, you have a choice to make together.',
    `${r.decisions[1] === 'A' ? 'The letter has been read. Alex pauses in the doorway, looks at the broken seal, and says nothing.' : 'The receipt lies on the table; the letter remains folded. Alex picks up the envelope as though checking that something is still inside.'}\n\n“Keep the receipt,” he says. “You will want a record of tonight.” He leaves again. At ten, every light in the house goes out. A chair scrapes. Footsteps cross the corridor. One door clicks shut.\n\nFour minutes later the lamps return. Alex’s glass is untouched. His chair is empty. Rain fills the silence where his voice should be. When you call, no one answers. Where will you look?`,
    `${discovery} By the time the others arrive, there is no mistaking what has happened. Alex is dead. The examination places his death between 10:02 and 10:03; the body has not been moved.\n\nAround you are two different kinds of story: a door system that remembers who crossed a threshold, and objects that remember being used. On your phones, the first reports have arrived, alongside papers showing why this dinner frightened each of you.\n\nYou cannot examine everything at once. Use what you have found to decide together: reconstruct the missing minutes first, or compare the physical traces?`,
    `${r.decisions[3] === 'A' ? 'The group begins with the missing minutes. A guest number appears in the door log, but a number is not yet a name.' : 'The group begins with the objects. A trace has a shape and a texture; you still need the inventory to know what left it.'}\n\nOn Alex’s desk, familiar names appear in unfamiliar contexts: promises, warnings, contracts that were never signed. Everyone at dinner had something to lose. That explains the tension at the table. It does not tell you who crossed the corridor in the dark.\n\nTake another look at the record your theory depends on. The sealed archive holds the guest register; its key has just been found among Alex’s papers.`,
    'The archive opens with a dry click. The guest-code register is on top. The case-related papers have been copied for everyone: original agreements and the unedited accounts Alex chose not to show at dinner. Underneath are personal letters from people who are not here, whose stories are not evidence in this case.\n\nNow you understand what he meant by “settle”: the sale was arranged, and he intended to decide whose version of the past survived it. The same files that could explain his death also contain lives that have nothing to do with the crime.\n\nThe screen is ready to display the entire archive. Or you can leave the personal letters closed and each request a record. Tell the others what needs to be seen, and why, before you choose.',
    `${r.decisions[5] === 'A' ? 'The archive has been laid open. Some words cannot be made private again.' : 'The personal letters are back in their sleeves. The case records are in the hands of the people who asked for them.'}\n\nOutside, the rain finally softens. Inside, the house feels smaller. You know why each person feared Alex’s announcement. You have heard denials, hesitations, and explanations. Only the records can place someone in that room during those four minutes.\n\nBefore you make your own accusation, ask the question still troubling you. Then choose a name, an object, and a room—or admit that one piece is still missing.`
  ][r.round] || '';
}
const DECISIONS = {
  1: { question: 'How much of the envelope should we read?', prompt: 'Would you break the seal on the personal letter, or take only the receipt? Tell the group what your choice would protect or reveal.', A: 'Read the whole envelope', B: 'Take only the receipt', effectA: 'The letter becomes public; its archive reference will publish the door log in Round 4.', effectB: 'The letter stays closed; the first roller gets an extra private verification in Round 4.' },
  3: { question: 'Where should we focus the search?', prompt: 'Use one clue you hold to argue for a search: reconstruct the missing minutes, or compare the physical traces?', A: 'Reconstruct the missing minutes', B: 'Compare the physical traces', effectA: 'Publish Time and access. The search roll prioritises private door-log and trace copies.', effectB: 'Publish Object inventory. The search roll prioritises private trace and door-log copies.' },
  5: { question: 'How much of the archive should everyone see?', prompt: 'Which records does your theory need? Should the group open everything, or leave the private letters closed?', A: 'Open the entire archive', B: 'Request only the records we need', effectA: 'Publish the door log, guest register, and personal correspondence.', effectB: 'Keep personal letters closed. Everyone still chooses a case record to inspect privately.' }
};
function diceRules(r) {
  if (r.round === 1) return { action: 'Search the envelope’s inner pocket', guaranteed: 'The audit receipt is already on the board, whatever you roll.', bands: [{range:'1–2',text:'A small interruption; no extra clue. The receipt remains safe.'},{range:'3–5',text:'Gain 1 private clue: the meeting note.'},{range:'6',text:'Gain 2 private clues: the meeting note AND the sale offer.'}] };
  if (r.round === 3) return { action: r.decisions[3] === 'A' ? 'Search the records desk' : 'Search the objects around the scene', guaranteed: `${r.decisions[3] === 'A' ? 'Time and access' : 'Object inventory'} is on the board. Every player keeps their original evidence.`, bands: [{range:'1–2',text:'The first search is enough to keep going; no extra copy.'},{range:'3–5',text:'The roller receives 1 additional case clue they do not hold.'},{range:'6',text:'The roller receives 2 different additional case clues they do not hold.'}] };
  return { action: 'Search the archive’s false bottom', guaranteed: 'Your requested verification is already saved. Nothing is taken away.', bands: [{range:'1–2',text:'Only an unsupported allegation; no extra clue.'},{range:'3–5',text:'Publish a corroborating guest-card custody record.'},{range:'6',text:'Publish the custody record AND an extra clue: Alex’s unsent letter.'}] };
}
module.exports = { ROLES, TITLES, scene, DECISIONS, diceRules };
