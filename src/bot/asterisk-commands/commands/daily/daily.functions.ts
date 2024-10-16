export const setTime = (date, hours, minute, second, msValue) => {
  const newDate = new Date(date);
  newDate.setHours(hours, minute, second, msValue);
  return newDate.getTime();
};

export const checkTimeSheet = () => {
  const time = new Date();
  const timezone = time.getTimezoneOffset() / -60;

  const currentTime = time.getTime();
  const firstTimeMorning = setTime(time, 0 + timezone, 30, 0, 0);
  const lastTimeMorning = setTime(time, 2 + timezone, 31, 0, 0);
  const firstTimeAfternoon = setTime(time, 5 + timezone, 0, 0, 0);
  const lastTimeAfternoon = setTime(time, 10 + timezone, 1, 0, 0);
  return (
    (currentTime >= firstTimeMorning && currentTime <= lastTimeMorning) ||
    (currentTime >= firstTimeAfternoon && currentTime <= lastTimeAfternoon)
  );
};

export const checkTimeNotWFH = () => {
  const time = new Date();
  const timezone = time.getTimezoneOffset() / -60;

  const currentTime = time.getTime();
  const firstTimeWFH = setTime(time, 0 + timezone, 30, 0, 0);
  const lastTimeWFH = setTime(time, 10 + timezone, 0, 0, 0);

  return currentTime >= firstTimeWFH && currentTime <= lastTimeWFH;
};
