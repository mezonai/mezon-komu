export enum EWolCommand {
  HELP = 'Using WoL to turn on an pc on LAN using mac address.' +
    '\n*wol <your mac> [your ip]\n' +
    '*tips: you can you *keep command to save your mac and ip',
  ERROR_DEVICE = 'Error while discovering device.',
  NO_WOL = 'No WoL packet sent!',
  WOL_DONE = 'Done, WoL packet sent!',
  WOL_FAIL = 'Cannot send WoL packet.',
  HAVE_NOT_WOL = "You haven't set up wol",
}
