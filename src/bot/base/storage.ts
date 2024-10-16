export class CommandStorage {
  private static commands: Map<string, any> = new Map();

  public static registerCommand(commandName: string, commandClass: any) {
    this.commands.set(commandName, commandClass);
  }

  public static getCommand(commandName: string): any | undefined {
    return this.commands.get(commandName);
  }

  public static getAllCommands(): Map<string, any> {
    return this.commands;
  }
}
