/** Process-local flag so every audit write in this session can stamp offRoster. */

let offRoster = false;

export function setSessionOffRoster(value: boolean) {
  offRoster = value === true;
}

export function sessionOffRoster(): boolean {
  return offRoster;
}
