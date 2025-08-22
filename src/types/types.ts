export type KeycloakTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: 'Bearer';
  session_state?: string;
  scope?: string;
};

export type UserFromToken = {
  id: string;
  username?: string;
  email?: string;
  name?: string;
  roles?: string[];
};
