import { ERequestAbsenceDateType, ERequestAbsenceTime, ERequestAbsenceType } from '../constants/configs';

export function handleBodyRequestAbsenceDay(dataInputs, typeRequest, emailAddress) {
  const inputDateType = dataInputs.dateType
    ? dataInputs.dateType[0]
    : 'CUSTOM';
  const dateType =
    ERequestAbsenceDateType[
      inputDateType as keyof typeof ERequestAbsenceDateType
      ];

  const inputAbsenceTime = dataInputs.absenceTime
    ? dataInputs.absenceTime[0]
    : null;
  const absenceTime =
    ERequestAbsenceTime[
      inputAbsenceTime as keyof typeof ERequestAbsenceTime
      ] || null;
  const type =
    ERequestAbsenceType[
      typeRequest.toUpperCase() as keyof typeof ERequestAbsenceType
      ];
  const body = {
    reason: dataInputs.reason,
    absences: [
      {
        dateAt: dataInputs.dateAt,
        dateType: dateType || ERequestAbsenceDateType.CUSTOM,
        hour: dataInputs.hour || 0,
        absenceTime: absenceTime || null,
      },
    ],
    dayOffTypeId: dataInputs.absenceType ? dataInputs.absenceType[0] : 1,
    type: type || ERequestAbsenceType.OFF,
    emailAddress: emailAddress,
  };
  return body;
}

export function validateHourAbsenceDay(inputNumber, typeRequest) {
  if (typeRequest == 'offcustom' && inputNumber === '0') {
    return { valid: false, message: 'Hour is required.' };
  }
  if (!inputNumber || inputNumber.trim() === '') {
    return { valid: false, message: 'Hour is required.' };
  }

  const number = parseFloat(inputNumber);
  if (isNaN(number)) {
    return {
      valid: false,
      message: 'Invalid number format. Please enter a number.',
    };
  }

  if (number < 0 || number > 2) {
    return { valid: false, message: 'Number must be in range 0-2.' };
  }

  return { valid: true, formattedNumber: number };
}

export function validateAndFormatDate(inputDate) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(inputDate)) {
    return { valid: false, message: 'Invalid date format. Use dd-mm-yyyy.' };
  }

  const [year, month, day] = inputDate.split('-').map(Number);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    (month === 2 && day > 29) ||
    (month === 2 && day === 29 && !isLeapYear(year)) ||
    ([4, 6, 9, 11].includes(month) && day > 30)
  ) {
    return { valid: false, message: 'Invalid day, month, or year.' };
  }

  const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { valid: true, formattedDate };
}

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function validateTypeAbsenceDay(inputDateType, typeRequest) {
  if (typeRequest !== 'offcustom') {
    if (!inputDateType)
      return { valid: false, message: 'Date type is required.' };
  }
  return { valid: true, formattedDateType: inputDateType };
}

export function validReasonAbsenceDay(inputReason, typeRequest) {
  if (typeRequest !== 'remote') {
    if (!inputReason || inputReason.trim() === '') {
      return { valid: false, message: 'Reason is required.' };
    }
  }
  return { valid: true, formattedReason: inputReason };
}

export function validateAbsenceTypeDay(inputAbsenceType, typeRequest) {
  if (typeRequest === 'off') {
    if (!inputAbsenceType) {
      return { valid: false, message: 'Absence type is required.' };
    }
  }
  return { valid: true, formattedAbsenceType: inputAbsenceType };
}

export function validateAbsenceTime(inputAbsenceTime, typeRequest) {
  if (typeRequest === 'offcustom') {
    if (!inputAbsenceTime) {
      return { valid: false, message: 'Absence time is required.' };
    }
  }
  return { valid: true, formattedAbsenceType: inputAbsenceTime };
}
