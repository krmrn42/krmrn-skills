export const EXIT_OK = 0;
export const EXIT_USER = 1;
export const EXIT_ENV = 2;
export const EXIT_INTERNAL = 3;

export function dieUser(msg: string): never {
  process.stderr.write("multivac: " + msg + "\n");
  process.exit(EXIT_USER);
}

export function dieEnv(msg: string): never {
  process.stderr.write("multivac: " + msg + "\n");
  process.exit(EXIT_ENV);
}
