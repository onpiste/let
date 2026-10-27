/** The signed-in account, as returned by `GET /auth/me`. */
export type User = {
  /** Google's stable account id (`sub`). */
  id: string;
  email: string;
  name: string;
  picture: string | null;
};
