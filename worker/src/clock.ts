// The table server's only clock, so time can be reasoned about (and the
// engine stays clock-free). Lint bans Date.now everywhere else in worker/.
// eslint-disable-next-line no-restricted-properties
export const now = () => Date.now()
