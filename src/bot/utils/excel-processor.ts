import { Logger } from '@nestjs/common';
import { sheets_v4 } from 'googleapis';
import { Moment } from 'moment';

export type ReportType = 'daily' | 'komu' | 'tracker' | 'office';

export class ExcelProcessor {
  private sheetId: string;
  private sheets: sheets_v4.Sheets;
  private sheetValues: any[][];
  private reportDate: Moment;
  private updatedValue: Map<string, number>;
  private readonly logger = new Logger(ExcelProcessor.name);

  constructor(reportDate: Moment, sheetId: string, sheets: sheets_v4.Sheets) {
    this.sheetId = sheetId;
    this.sheets = sheets;
    this.reportDate = reportDate;
    this.updatedValue = new Map();
  }

  private getSheetName(): string {
    const month = this.reportDate.month();
    const year = this.reportDate.year();

    let monday = this.reportDate.clone().startOf('week').add(1, 'day');
    let friday = this.reportDate.clone().endOf('week').add(-1, 'day');

    while (monday.month() < month || monday.year() < year) {
      monday = monday.add(1, 'day');
    }

    while (friday.month() > month || friday.year() > year) {
      friday = friday.add(-1, 'day');
    }

    const result = `${monday.format('DD')}-${friday.format('DD/MM')}`;
    return result;
  }

  private getColumnIndex = (targetValue: string) => {
    const headerValue = this.reportDate.format('DD.MM');
    const headers = this.sheetValues[0];
    const belowHeaders = this.sheetValues[1];
    const headerIndex = headers.indexOf(headerValue);

    if (headerIndex === -1) {
      return null;
    }

    for (let i = headerIndex; i < headerIndex + 4; i++) {
      if (belowHeaders[i] === targetValue) {
        return i;
      }
    }

    return null;
  };

  private getRowIndex = (targetValue: string) => {
    const rowValues = this.sheetValues.map((x) => x[4]); //column 4 is email

    for (let i = 0; i < rowValues.length; i++) {
      if (rowValues[i]?.toLowerCase()?.trim() === targetValue) {
        return i;
      }
    }

    return null;
  };

  private getA1Notation = (rowIndex, colIndex) => {
    let columnLetter = '';
    while (colIndex > 0) {
      const remainder = (colIndex - 1) % 26;
      columnLetter = String.fromCharCode(65 + remainder) + columnLetter;
      colIndex = Math.floor((colIndex - 1) / 26);
    }
    return `${columnLetter}${rowIndex}`;
  };

  public initSheetData = async () => {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: this.getSheetName(),
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        this.logger.warn('No data found in the sheet.');
        return;
      }

      this.sheetValues = rows;
    } catch (error) {
      this.logger.error('init_sheet_error', error);
    }
  };

  public updateCellValue(
    email: string,
    reportType: ReportType,
    value: any,
  ): void {
    try {
      const rowIndex = this.getRowIndex(
        `${email.toLowerCase().trim()}@ncc.asia`,
      );
      const colIndex = this.getColumnIndex(reportType.toString().toUpperCase());

      if (!rowIndex || !colIndex) {
        return;
      }

      const cellAddress = this.getA1Notation(rowIndex + 1, colIndex + 1);
      this.updatedValue.set(
        cellAddress,
        (this.updatedValue.get(cellAddress) || 0) + value,
      );
    } catch (error) {
      this.logger.error('update_cell_error', {
        email,
        reportType,
        value,
        error,
      });
    }
  }

  public saveChange = async () => {
    try {
      const sheetName = this.getSheetName();
      const data = Array.from(this.updatedValue.keys()).map((key: string) => {
        return {
          range: `${sheetName}!${key}`,
          values: [[this.updatedValue.get(key)]],
        };
      });

      this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.sheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data,
        },
      });
    } catch (error) {
      this.logger.error('save_sheet_error', error);
      throw error;
    }
  };
}
