export function navigateToClockDate(isoDate: string) {
  window.dispatchEvent(
    new CustomEvent("navigate-clock-date", {
      detail: isoDate,
    })
  );
}
