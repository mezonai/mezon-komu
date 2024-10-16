export class ApiUrl {
  static TimeSheetApi = process.env.TIMESHEET_API;

  static WFHApi = {
    api_url: `${ApiUrl.TimeSheetApi}Public/GetUserWorkFromHome`,
  };

  static AIApi = 'http://172.16.100.116:1500/chatbot';

  static AIToken = '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';
}
