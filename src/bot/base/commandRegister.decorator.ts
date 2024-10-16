import { CommandStorage } from './storage';

export function Command(commandName: string) {
  return function (target: any) {
    CommandStorage.registerCommand(commandName, target);
  };
}
