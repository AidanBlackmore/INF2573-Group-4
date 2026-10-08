// The one entry point the game uses to talk to the Game Master.
// Picks mock or live, validates the output, and falls back to mock if live fails,
// so a play-test never gets stuck on a bad or slow response.
const mock = require('./mock');
const validate = require('./validate');

const MODE = (process.env.GM_MODE || 'mock').toLowerCase() === 'live' ? 'live' : 'mock';
const MOCK_DELAY_MS = Number(process.env.GM_MOCK_DELAY_MS ?? 600);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(task, ctx) {
  if (MODE === 'live') {
    const live = require('./live');
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const data = validate[task](await live[task](ctx), ctx);
        return { data, source: 'live' };
      } catch (err) {
        console.warn(`[gm] live ${task} attempt ${attempt} failed: ${err.message}`);
        // Only retry output problems; API/network errors already retried inside the SDK.
        if (!(err instanceof validate.GMValidationError)) break;
      }
    }
    return { data: validate[task](await mock[task](ctx), ctx), source: 'fallback' };
  }
  await sleep(MOCK_DELAY_MS);
  return { data: validate[task](await mock[task](ctx), ctx), source: 'mock' };
}

module.exports = {
  mode: MODE,
  setup: (ctx) => run('setup', ctx),
  round: (ctx) => run('round', ctx),
  recap: (ctx) => run('recap', ctx),
};
