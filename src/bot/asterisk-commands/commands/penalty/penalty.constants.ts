export enum EPenaltyCommand {
  HELP = '```' +
    '*penalty @username ammount<50k> reason' +
    '\n' +
    '*penalty summary' +
    '\n' +
    '*penalty detail @username' +
    '\n' +
    '*penalty clear' +
    '```',
  NO_RESULT = '```No result```',
  PENALTY_SAVE = '✅ Penalty saved.',
  CLEAR_PENALTY = 'Clear penalty successfully'
}
