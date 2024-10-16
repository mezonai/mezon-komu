import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import https from 'https';

@Injectable()
export class ClientConfigService {
  constructor(configService: ConfigService) {
    this.https = new https.Agent({
      rejectUnauthorized: false,
    });
    this.prefix = '*';
    // this.PullRequest = 'aaaa';
    this.wfh = {
      api_url: `${configService.get<string>(
        'TIMESHEET_API',
      )}Public/GetUserWorkFromHome`,
    };
    this.getAllUser = {
      api_url: `${configService.get<string>('TIMESHEET_API')}Public/GetAllUser`,
    };
    this.ticket = {
      api_url_create: `${configService.get<string>(
        'TIMESHEET_API',
      )}KomuJobService/CreateJob`,
      api_url_get: `${configService.get<string>(
        'INFO_API',
      )}KomuJobService/GetJobs`,
    };

    this.role = {
      api_url_getRole: `${configService.get<string>(
        'PROJECT_API',
      )}User/GetEmployeeInformation`,
    };
    this.user_status = {
      api_url_userstatus: `${configService.get<string>(
        'TIMESHEET_API',
      )}Public/GetWorkingStatusByUser`,
    };
    this.submitTimesheet = {
      api_url_getListUserLogTimesheet: `${configService.get<string>(
        'TIMESHEET_API',
      )}Public/GetListUserLogTimesheetThisWeekNotOk`,
      api_url_logTimesheetByKomu: `${configService.get<string>(
        'TIMESHEET_API',
      )}MyTimesheets/CreateByKomu`,
      api_url_logTimesheetFullByKomu: `${configService.get<string>(
        'TIMESHEET_API',
      )}MyTimesheets/CreateFullByKomu`,
    };
    this.project = {
      api_url_getListProjectOfUser: `${configService.get<string>(
        'TIMESHEET_API',
      )}Public/GetPMsOfUser`,
      getPMOfUser: `${configService.get<string>(
        'PROJECT_API',
      )}Public/GetPMOfUser`,
    };
    this.checkinTimesheet = {
      api_url: `${configService.get<string>(
        'TIMESHEET_API',
      )}Public/GetTimesheetAndCheckInOutAllUser`,
    };
    this.checkout = {
      api_url: `${configService.get<string>(
        'KOMUBOTREST_CHECK_IN_URL',
      )}v1/employees/report-checkin`,
    };
    this.wiki = {
      api_url: `${configService.get<string>(
        'PROJECT_API',
      )}User/GetEmployeeInformation?email=`,
      options: [
        'all',
        'note',
        'link',
        'code',
        'file',
        'image',
        'cmd',
        'event',
        'pm',
        'hr',
        'komu',
        'policy',
        'office',
        'project',
        'ot',
        'checkpoint',
        'timesheet',
        'tx8',
        'fun',
        'help',
      ],
    };
    this.birthday = {
      api_url: `${configService.get<string>('HRM_API')}GetEmployeesByBirthday`,
    };
    this.phonenumber = {
      api_url: `${configService.get<string>('HRM_API')}GetEmployeePhone?email=`,
    };
    this.sendSms = `${configService.get<string>('SEND_SMS_API')}`;
    this.gem = {
      api_url_getMyRank: `${configService.get<string>(
        'GEMSOFGOD_API',
      )}komu/get-my-ranking/`,
      api_url_getTopRank: `${configService.get<string>(
        'GEMSOFGOD_API',
      )}komu/get-top-ranking`,
    };
    this.noti = {
      api_url_quickNews: `${configService.get<string>(
        'IMS_API',
      )}services/app/QuickNews/Create`,
    };
    this.categories = {
      configuration: {
        enabled: true,
        name: 'Configuration',
        desc: 'Setup the bot with the configuration commands',
      },
      utilities: {
        enabled: true,
        name: 'Utilities',
        desc: 'Some usefull commands',
        aliases: ['general'],
      },
      music: { enabled: true, name: 'Music', desc: 'Listen music with KOMU' },
      komu: { enabled: true, name: 'Task', desc: 'KOMU task manager' },
      slash: { enabled: true, name: 'Poll', desc: 'KOMU poll manager' },
      owner: {
        hide: true,
        enabled: true,
        name: 'Owner',
        desc: 'Manage your bot with the owner commands',
      },
    };

    this.wfhApiKey = `${configService.get<string>('WFH_API_KEY_SECRET')}`;
    this.hrmApiKey = `${configService.get<string>('HRM_API_KEY_SECRET')}`;

    this.komuTrackerApiKey = `${configService.get<string>(
      'KOMUTRACKER_API_KEY_SECRET',
    )}`;

    this.komubotrestpass = `${configService.get<string>(
      'KOMUBOTREST_PASSWORD',
    )}`;

    this.komubotrestgmail = `${configService.get<string>('KOMUBOTREST_GMAIL')}`;

    this.linkinvite = `${configService.get<string>('LINKS_INVITE')}`;

    this.linkwebsite = `${configService.get<string>('LINKS_WEBSITE')}`;

    this.linksupport = `${configService.get<string>('LINKS_SUPPORT')}`;

    this.imsKeySecret = `${configService.get<string>('IMS_KEY_SECRET')}`;

    this.wikiApiKeySecret = `${configService.get<string>(
      'WIKI_API_KEY_SECRET',
    )}`;

    this.workoutChannelId = `${configService.get<string>(
      'KOMUBOTREST_WORKOUT_CHANNEL_ID',
    )}`;

    this.machleoChannelId = `${configService.get<string>(
      'KOMUBOTREST_MACHLEO_CHANNEL_ID',
    )}`;

    this.komubotRestSecretKey = `${configService.get<string>(
      'KOMUBOTREST_KOMU_BOT_SECRET_KEY',
    )}`;

    this.ticketApiKey = `${configService.get<string>('TICKET_API_KEY_SECRET')}`;

    this.komubotrestAdminId = `${configService.get<string>(
      'KOMUBOTREST_ADMIN_USER_ID',
    )}`;

    this.komubotRestThongBaoPmChannelId = `${configService.get<string>(
      'KOMUBOTREST_THONGBAO_PM_CHANNEL_ID',
    )}`;

    this.komubotRestThongBaoChannelId = `${configService.get<string>(
      'KOMUBOTREST_THONGBAO_CHANNEL_ID',
    )}`;

    this.komubotRestFinanceChannelId = `${configService.get<string>(
      'KOMUBOTREST_FINANCE_CHANNEL_ID',
    )}`;

    this.komubotRestNhacuachungChannelId = `${configService.get<string>(
      'KOMUBOTREST_NHACUACHUNG_CHANNEL_ID',
    )}`;

    this.komubotRestDevtestChannelId = `${configService.get<string>(
      'KOMUBOTREST_DEVTEST_CHANNEL_ID',
    )}`;
    this.topCategoryId = `${configService.get<string>('TOP_CATEGORY_ID')}`;
    this.itAdminChannelId = `${configService.get<string>(
      'KOMUBOTREST_ITADMIN_CHANNEL_ID',
    )}`;
    this.hanoi3corner = `${configService.get<string>(
      'HANOI3CORNER_CHANNEL_ID',
    )}`;
    this.quynhoncorner = `${configService.get<string>(
      'QUYNHONCORNER_CHANNEL_ID',
    )}`;
    this.saigon2corner = `${configService.get<string>(
      'SAIGON2CORNER_CHANNEL_ID',
    )}`;
    this.saigoncorner = `${configService.get<string>(
      'SAIGONCORNER_CHANNEL_ID',
    )}`;
    this.danangcorner = `${configService.get<string>(
      'DANANGCORNER_CHANNEL_ID',
    )}`;
    this.vinhcorner = `${configService.get<string>('VINHCORNER_CHANNEL_ID')}`;
    this.hanoi2corner = `${configService.get<string>(
      'HANOI2CORNER_CHANNEL_ID',
    )}`;
    this.hanoicorner = `${configService.get<string>('HANOICORNER_CHANNEL_ID')}`;
    this.dalatcorner = `${configService.get<string>('DALATCORNER_CHANNEL_ID')}`;
    this.chuyenphiem_id = `${configService.get<string>(
      'CHUYENPHIEM_CHANNEL_ID',
    )}`;
    this.guild_komu_id = `${configService.get<string>('GUILD_KOMU_ID')}`;
    this.guildvoice_parent_id = `${configService.get<string>(
      'GUILDVOICE_PARENT_ID',
    )}`;

    this.ncc8Voice = `${configService.get<string>(
      'KOMUBOTREST_NCC8_CHANNEL_ID',
    )}`;

    this.driverClientId = `${configService.get<string>('DRIVER_CLIENT_ID')}`;

    this.driverClientSecret = `${configService.get<string>(
      'DRIVER_CLIENT_SECRET',
    )}`;

    this.driverRedirectId = `${configService.get<string>(
      'DRIVER_REDIRECT_URI',
    )}`;

    this.driverRefreshToken = `${configService.get<string>(
      'DRIVER_REFRESH_TOKEN',
    )}`;

    this.driverFolderParentId = `${configService.get<string>(
      'FOLDER_DRIVER_PARENTS_ID',
    )}`;

    this.pmsChannelId = `${configService.get<string>('PMS_CHANNEL_ID')}`;

    this.owners = ['KOMU#0139'];
    //The footer of the embeds that the bot will send
    this.footer = 'KOMU ';
    // The id of the support
    this.supportID = '729774155037278268';
    // The status of your bot
    this.game = 'KOMU ';
    //the color of the embeds
    this.color = '#3A871F';
    // OPTIONAL: Your top.gg token.
    this.topgg = 'TOPGG_TOKEN';
    // OPTIONAL: The link of your bot's top.gg page.
    this.topgg_url = 'https://top.gg/bot/783708073390112830';
    //the default bot language. fr or en
    this.defaultLanguage = 'en';
    // If dev mod is enabled
    this.devMode = false;
    // The server where you test the commands
    this.devServer = '782661233622515772';
    // If you want to log every command,event etc. Usefull for debuging
    this.logAll = false;
    // If you want to test your configuration before starting the bot
    this.checkConfig = null;
    //The number of shards. Leave blank for auto
    this.shards = 1;
    //The X-Event_Key of Bitbucket Webhook. Triggers: Created Pull Request
    this.PullRequest = 'pullrequest:fulfilled';
    //The X-Event_Key of Bitbucket Webhook. Triggers: Build Status Created
    this.StatusBuild = 'repo:commit_status_updated';

    this.bitbucketWebhookChannelId = `${configService.get<string>(
      'BITBUCKET_WEBOOOK_CHANNEL_ID',
    )}`;

    this.jiraWebhookChannelId = `${configService.get<string>(
      'JIRA_WEBOOOK_CHANNEL_ID',
    )}`;

    this.botKomuId = `${configService.get<string>('BOT_KOMU_ID')}`;

    this.clandNccId = `${configService.get<string>('KOMUBOTREST_CLAN_NCC_ID')}`;

    this.hereUserId = `${configService.get<string>('MEZON_HERE_USER_ID')}`;

    this.ncc8ChannelId = `${configService.get<string>('MEZON_NCC8_CHANNEL_ID')}`;

    this.movieChannelId = `${configService.get<string>('MEZON_MOVIE_CHANNEL_ID')}`;

    this.audiobookChannelId = `${configService.get<string>('MEZON_AUDIOBOOK_CHANNEL_ID')}`;

    this.devMezonUserId = `${configService.get<string>('MEZON_DEV_USER_ID')}`;

    this.mezonNhaCuaChungChannelId = `${configService.get<string>('MEZON_NHACUACHUNG_CHANNEL_ID')}`;

    this.welcomeChannelId = `${configService.get<string>('MEZON_WELCOME_CHANNEL_ID')}`;
  }

  https: https.Agent;

  pmsChannelId: string;

  driverClientId: string;

  driverClientSecret: string;

  driverRedirectId: string;

  driverRefreshToken: string;

  driverFolderParentId: string;

  topCategoryId: string;

  ncc8Voice: string;

  //hanoi3
  hanoi3corner: string;

  //quynhoncorner
  quynhoncorner: string;

  //saigon2corner
  saigon2corner: string;

  //saigoncorner
  saigoncorner: string;

  //danangcorner
  danangcorner: string;

  //vinhcorner
  vinhcorner: string;

  //hanoi2corner
  hanoi2corner: string;

  //hanoicorner
  hanoicorner: string;

  //dalatcorner
  dalatcorner: string;

  //guild_komu_id
  guild_komu_id: string;

  //user_daitrinh_id
  adminIds: string[] = ['921260899799539782', '922148445626716182'];

  //user_duongnguyen,user_trannhan
  adminTX8Ids: string[] = ['694732284116598797', '871713984670216273'];

  //chuyenphiem_id
  chuyenphiem_id: string;

  //guildvoice_parent_id
  guildvoice_parent_id: string;

  //KOMUBOTREST_DEVTEST_CHANNEL_ID

  komubotRestDevtestChannelId: string;

  // KOMUBOTREST_NHACUACHUNG_CHANNEL_ID

  komubotRestNhacuachungChannelId: string;

  // KOMUBOTREST_FINANCE_CHANNEL_ID

  komubotRestFinanceChannelId: string;

  // KOMUBOTREST_THONGBAO_PM_CHANNEL_ID

  komubotRestThongBaoPmChannelId: string;

  // KOMUBOTREST_THONGBAO_CHANNEL_ID

  komubotRestThongBaoChannelId: string;

  // KOMUBOTREST_ADMIN_USER_ID

  komubotrestAdminId: string;

  komubotRestSecretKey: string;

  machleoChannelId: string;

  itAdminChannelId: string;

  workoutChannelId: string;

  wikiApiKeySecret: string;

  imsKeySecret: string;

  linksupport: string;

  linkwebsite: string;

  checkout: {
    api_url: string;
  };

  wfh: {
    api_url: string;
  };

  getAllUser: {
    api_url: string;
  };

  ticket: {
    api_url_create: string;
    api_url_get: string;
  };
  role: {
    api_url_getRole: string;
  };
  user_status: {
    api_url_userstatus: string;
  };
  submitTimesheet: {
    api_url_getListUserLogTimesheet: string;
    api_url_logTimesheetByKomu: string;
    api_url_logTimesheetFullByKomu: string;
  };

  project: {
    api_url_getListProjectOfUser: string;
    getPMOfUser: string;
  };

  checkinTimesheet: {
    api_url: string;
  };
  wiki: {
    api_url: string;
    options: string[];
  };
  gem: {
    api_url_getMyRank: string;
    api_url_getTopRank: string;
  };
  noti: {
    api_url_quickNews: string;
  };
  birthday: {
    api_url: string;
  };
  phonenumber: {
    api_url: string;
  };

  hrmApiKey: string;

  sendSms: string;

  ticketApiKey: string;

  linkinvite: string;

  komubotrestgmail: string;

  komubotrestpass: string;

  wfhApiKey: string;

  komuTrackerApiKey: string;

  prefix: string;
  // Your ID
  // Your name/tag
  owners: string[];
  //The footer of the embeds that the bot will send
  footer: string;
  // The id of the support
  supportID: string;
  // The status of your bot
  game: string;
  //the color of the embeds
  color: string;
  // OPTIONAL: Your top.gg token.
  topgg: string;
  // OPTIONAL: The link of your bot's top.gg page.
  topgg_url: string;
  //the default bot language. fr or en
  defaultLanguage: string;
  // If dev mod is enabled
  devMode: boolean;
  // The server where you test the commands
  devServer: string;
  // If you want to log every command,event etc. Usefull for debuging
  logAll: boolean;
  // If you want to test your configuration before starting the bot
  checkConfig: any;
  //The number of shards. Leave blank for auto
  shards: number;
  // The categories. Put null to enabled to disable a category
  categories: any;

  PullRequest: string;

  StatusBuild: string;

  // KOMUBOTREST_THONGBAO_JIRA_WEBOOOK_CHANNEL_ID
  jiraWebhookChannelId: string;

  // KOMUBOTREST_THONGBAO_BITBUCKET_WEBOOOK_CHANNEL_ID
  bitbucketWebhookChannelId: string;

  botKomuId: string;

  clandNccId: string;

  hereUserId: string;

  devMezonUserId: string;

  ncc8ChannelId: string;

  movieChannelId: string;

  audiobookChannelId: string;

  mezonNhaCuaChungChannelId: string;

  welcomeChannelId: string;
}
