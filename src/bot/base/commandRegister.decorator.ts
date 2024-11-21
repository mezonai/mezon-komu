import { CommandStorage } from './storage';

export function Command(commandName: string) {
  return function (target: any) {
    CommandStorage.registerCommand(commandName, target);
  };
}

export function CommandDynamic(commandName: string) {
  return function (target: any) {
    CommandStorage.registerCommandDynamic(commandName, target);
  };
}
