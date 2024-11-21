export class CommandStorage {
  private static commands: Map<string, any> = new Map();
  private static commandDynamics: Map<string, any> = new Map();

  public static registerCommand(commandName: string, commandClass: any) {
    this.commands.set(commandName, commandClass);
  }

  public static getCommand(commandName: string): any | undefined {
    return this.commands.get(commandName);
  }

  public static getAllCommands(): Map<string, any> {
    return this.commands;
  }

  public static registerCommandDynamic(commandName: string, commandClass: any) {
    this.commandDynamics.set(commandName, commandClass);
  }

  public static getCommandDynamic(commandName: string): any | undefined {
    return this.commandDynamics.get(commandName);
  }

  public static getAllCommandsDymamic(): Map<string, any> {
    return this.commandDynamics;
  }
}
