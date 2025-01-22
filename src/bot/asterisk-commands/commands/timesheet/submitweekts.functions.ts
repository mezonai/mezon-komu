export function getWeekRange(currentDate = new Date()) {
  const startOfWeek = new Date(currentDate);
  const dayOfWeek = currentDate.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(currentDate.getDate() - diff);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  return {
    startOfWeek: startOfWeek.toISOString().slice(0, 10),
    endOfWeek: endOfWeek.toISOString().slice(0, 10),
  };
}

export function getFormattedDate(dateString) {
  const date = new Date(dateString);

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayOfWeek = weekdays[date.getDay()];
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const formattedDate = `${dayOfWeek}, ${year}-${month}-${day}`;

  return formattedDate;
}

export function convertWorkingTimeToHours(workingTimeInMinutes) {
  const workingTimeInHours = workingTimeInMinutes / 60;
  return parseFloat(workingTimeInHours.toFixed(1));
}

export function handleTypeOfWork(typeOfWork) {
  if (typeOfWork === 0) {
    return 'Normal Working';
  }
  return 'Overtime';
}
